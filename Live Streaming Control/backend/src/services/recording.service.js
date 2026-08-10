/**
 * Recording Service
 * Manages MP4 recording of lives via FFmpeg
 */
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { config } from '../config.js'
import db from '../db/client.js'

const FFMPEG_BIN = config.rtmp.ffmpeg || '/usr/bin/ffmpeg'
const RECORDINGS_DIR = config.recordings?.dir || './recordings'
const RTMP_URL_BASE = `rtmp://localhost:${config.rtmp.port || 1935}`

/**
 * Start recording a live stream
 * @param {string} liveId - Live UUID
 * @param {string} inputRtmpUrl - RTMP URL to record from
 * @param {string} recordingType - 'costream' | 'standard' | 'hybrid'
 * @param {object} options - { logger, metadata }
 * @returns {Promise<{recordingId, filePath}>}
 */
export async function startRecording(liveId, inputRtmpUrl, recordingType = 'standard', options = {}) {
  const { logger = console, metadata = {} } = options

  try {
    // Create recordings directory if it doesn't exist
    await fs.mkdir(RECORDINGS_DIR, { recursive: true })

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = `live-${liveId}-${timestamp}.mp4`
    const filePath = path.join(RECORDINGS_DIR, filename)

    logger.info(`[Recording] Starting: ${filename}`)

    // Create database record
    const { rows } = await db.query(
      `INSERT INTO live_recordings
       (live_id, recording_type, status, file_path, metadata, format)
       VALUES ($1, $2, 'recording', $3, $4, 'mp4')
       RETURNING id`,
      [liveId, recordingType, filePath, JSON.stringify(metadata)]
    )
    const recordingId = rows[0].id

    // FFmpeg args for MP4 recording
    const ffmpegArgs = [
      '-rtsp_transport', 'tcp',
      '-i', inputRtmpUrl,

      // Copy streams (no re-encoding) for speed
      '-c:v', 'copy',
      '-c:a', 'copy',

      // MP4 format
      '-f', 'mp4',

      // Output file
      filePath,
    ]

    const process = spawn(FFMPEG_BIN, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    // Monitor stderr
    process.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg.includes('error') || msg.includes('Error')) {
        logger.warn(`[Recording ${recordingId}] FFmpeg stderr: ${msg}`)
      }
    })

    // Handle completion
    process.on('close', async (code) => {
      if (code === 0) {
        logger.info(`[Recording ${recordingId}] Completed successfully`)
        // Get file size and duration
        try {
          const stat = await fs.stat(filePath)
          await db.query(
            `UPDATE live_recordings
             SET status = 'completed',
                 file_size_bytes = $1,
                 completed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2`,
            [stat.size, recordingId]
          )
        } catch (err) {
          logger.error(`[Recording ${recordingId}] Failed to get file info:`, err)
        }
      } else {
        logger.error(`[Recording ${recordingId}] FFmpeg exited with code ${code}`)
        await db.query(
          `UPDATE live_recordings
           SET status = 'failed',
               error_message = $1,
               completed_at = NOW(),
               updated_at = NOW()
           WHERE id = $2`,
          [`FFmpeg exited with code ${code}`, recordingId]
        )
      }
    })

    process.on('error', async (err) => {
      logger.error(`[Recording ${recordingId}] Process error:`, err)
      await db.query(
        `UPDATE live_recordings
         SET status = 'failed',
             error_message = $1,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [err.message, recordingId]
      )
    })

    // Store process for later stopping
    recordingProcesses.set(recordingId, process)

    return {
      recordingId,
      filePath,
      filename,
    }
  } catch (err) {
    logger.error(`[Recording] Failed to start recording for ${liveId}:`, err)
    throw err
  }
}

/**
 * Stop recording
 * @param {string} recordingId - Recording UUID
 */
export async function stopRecording(recordingId, logger = console) {
  const process = recordingProcesses.get(recordingId)
  if (!process) {
    logger.warn(`[Recording ${recordingId}] Process not found`)
    return
  }

  logger.info(`[Recording ${recordingId}] Stopping...`)

  try {
    process.kill('SIGTERM')
    recordingProcesses.delete(recordingId)

    // Wait for graceful shutdown
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn(`[Recording ${recordingId}] Force kill`)
        process.kill('SIGKILL')
        resolve()
      }, 10000)

      process.once('close', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  } catch (err) {
    logger.error(`[Recording ${recordingId}] Error stopping:`, err)
  }
}

/**
 * Stop all active recordings
 */
export async function stopAllRecordings(logger = console) {
  const promises = Array.from(recordingProcesses.entries()).map(([id, process]) =>
    stopRecording(id, logger).catch(e => logger.error(`[Recording ${id}] Error:`, e))
  )
  await Promise.all(promises)
  recordingProcesses.clear()
}

/**
 * Get recording info
 */
export async function getRecording(recordingId) {
  const { rows } = await db.query(
    'SELECT * FROM live_recordings WHERE id = $1',
    [recordingId]
  )
  return rows[0] || null
}

/**
 * List recordings for a live
 */
export async function getRecordingsForLive(liveId) {
  const { rows } = await db.query(
    'SELECT * FROM live_recordings WHERE live_id = $1 ORDER BY created_at DESC',
    [liveId]
  )
  return rows
}

/**
 * Delete recording file and DB record
 */
export async function deleteRecording(recordingId, logger = console) {
  const recording = await getRecording(recordingId)
  if (!recording) throw new Error('Recording not found')

  // Stop if still recording
  const process = recordingProcesses.get(recordingId)
  if (process) {
    await stopRecording(recordingId, logger)
  }

  // Delete file
  if (recording.file_path) {
    try {
      await fs.unlink(recording.file_path)
      logger.info(`[Recording ${recordingId}] File deleted`)
    } catch (err) {
      logger.warn(`[Recording ${recordingId}] Failed to delete file:`, err.message)
    }
  }

  // Delete DB record
  await db.query('DELETE FROM live_recordings WHERE id = $1', [recordingId])
}

/**
 * Archive recording (move to cold storage)
 * @param {string} recordingId
 * @param {string} archivePath - Destination path
 */
export async function archiveRecording(recordingId, archivePath, logger = console) {
  const recording = await getRecording(recordingId)
  if (!recording) throw new Error('Recording not found')
  if (recording.status !== 'completed') throw new Error('Recording not completed')

  try {
    // Copy file to archive
    await fs.copyFile(recording.file_path, archivePath)

    // Update DB
    await db.query(
      `UPDATE live_recordings
       SET status = 'archived', file_path = $1, updated_at = NOW()
       WHERE id = $2`,
      [archivePath, recordingId]
    )

    // Delete original (optional)
    // await fs.unlink(recording.file_path)

    logger.info(`[Recording ${recordingId}] Archived to ${archivePath}`)
  } catch (err) {
    logger.error(`[Recording ${recordingId}] Archive failed:`, err)
    throw err
  }
}

// ─── Process registry ──────────────────────────────────────────────────────────

const recordingProcesses = new Map() // recordingId → FFmpeg process

/**
 * Get all active recordings
 */
export function getAllRecordings() {
  return Array.from(recordingProcesses.keys())
}

/**
 * Check if recording is active
 */
export function isRecordingActive(recordingId) {
  return recordingProcesses.has(recordingId)
}
