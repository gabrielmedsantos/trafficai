/**
 * Recordings Routes
 * Manage live stream recordings
 */
import { z } from 'zod'
import db from '../db/client.js'
import {
  startRecording,
  stopRecording,
  getRecording,
  getRecordingsForLive,
  deleteRecording,
  archiveRecording,
  getAllRecordings,
  isRecordingActive,
} from '../services/recording.service.js'
import { liveAccessClause } from '../services/live-access.service.js'

const RTMP_URL_BASE = `rtmp://localhost:${process.env.RTMP_PORT || 1935}`

async function checkLiveAccess(req, liveId) {
  const acc = liveAccessClause(req.user)
  const { rows } = await db.query(
    `SELECT id FROM lives WHERE id = $1 ${acc.clause}`,
    [liveId, ...acc.params]
  )
  return rows.length > 0
}

export default async function recordingsRoutes(fastify) {

  // ── POST /recordings/:liveId/start ──────────────────────────────────────────
  // Start recording a live (auto-started on live start)
  fastify.post('/recordings/:liveId/start', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { liveId } = req.params
    const schema = z.object({
      recording_type: z.enum(['costream', 'standard', 'hybrid']).default('standard'),
    })

    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.errors })

    if (!(await checkLiveAccess(req, liveId))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    try {
      // Get live details
      const { rows } = await db.query(
        'SELECT id, stream_key, mode_broadcast FROM lives WHERE id = $1',
        [liveId]
      )
      if (!rows.length) return reply.code(404).send({ error: 'Live not found' })

      const live = rows[0]
      const { recording_type } = body.data

      // Determine input URL based on broadcast type
      let inputRtmpUrl
      if (live.mode_broadcast === 'costream') {
        inputRtmpUrl = `${RTMP_URL_BASE}/live/costream-${liveId}`
      } else {
        inputRtmpUrl = `${RTMP_URL_BASE}/live/${live.stream_key}`
      }

      // Start recording
      const result = await startRecording(liveId, inputRtmpUrl, recording_type, {
        logger: fastify.log,
        metadata: {
          type: recording_type,
          mode: live.mode_broadcast || 'standard',
        },
      })

      fastify.log.info(`[recordings] Started recording: ${result.recordingId}`)

      return {
        ok: true,
        recording: result,
      }
    } catch (err) {
      fastify.log.error(`[recordings] Failed to start recording:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── POST /recordings/:liveId/stop ───────────────────────────────────────────
  // Stop recording for a live
  fastify.post('/recordings/:liveId/stop', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { liveId } = req.params

    if (!(await checkLiveAccess(req, liveId))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    try {
      // Get active recording for this live
      const { rows } = await db.query(
        `SELECT id FROM live_recordings
         WHERE live_id = $1 AND status = 'recording'
         LIMIT 1`,
        [liveId]
      )

      if (!rows.length) {
        return reply.code(404).send({ error: 'No active recording' })
      }

      const recordingId = rows[0].id
      await stopRecording(recordingId, fastify.log)

      fastify.log.info(`[recordings] Stopped recording: ${recordingId}`)

      return { ok: true, recordingId }
    } catch (err) {
      fastify.log.error(`[recordings] Failed to stop recording:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── GET /recordings/:liveId ─────────────────────────────────────────────────
  // List all recordings for a live
  fastify.get('/recordings/:liveId', async (req, reply) => {
    const { liveId } = req.params

    // Allow public access (recordings are downloadable)
    try {
      const recordings = await getRecordingsForLive(liveId)
      return {
        liveId,
        recordings: recordings.map(r => ({
          id: r.id,
          status: r.status,
          format: r.format,
          file_path: r.file_path,
          file_size_bytes: r.file_size_bytes,
          duration_seconds: r.duration_seconds,
          started_at: r.started_at,
          completed_at: r.completed_at,
          metadata: r.metadata,
        })),
      }
    } catch (err) {
      fastify.log.error(`[recordings] Failed to list:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── GET /recordings/:recordingId/info ────────────────────────────────────────
  // Get recording details
  fastify.get('/recordings/:recordingId/info', async (req, reply) => {
    const { recordingId } = req.params

    try {
      const recording = await getRecording(recordingId)
      if (!recording) return reply.code(404).send({ error: 'Recording not found' })

      return {
        id: recording.id,
        live_id: recording.live_id,
        status: recording.status,
        format: recording.format,
        file_path: recording.file_path,
        file_size_bytes: recording.file_size_bytes,
        duration_seconds: recording.duration_seconds,
        started_at: recording.started_at,
        completed_at: recording.completed_at,
        is_active: isRecordingActive(recordingId),
        metadata: recording.metadata,
      }
    } catch (err) {
      fastify.log.error(`[recordings] Failed to get info:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── DELETE /recordings/:recordingId ─────────────────────────────────────────
  // Delete a recording
  fastify.delete('/recordings/:recordingId', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { recordingId } = req.params

    try {
      const recording = await getRecording(recordingId)
      if (!recording) return reply.code(404).send({ error: 'Recording not found' })

      // Check access to the live
      if (!(await checkLiveAccess(req, recording.live_id))) {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      await deleteRecording(recordingId, fastify.log)
      fastify.log.info(`[recordings] Deleted: ${recordingId}`)

      return { ok: true }
    } catch (err) {
      fastify.log.error(`[recordings] Failed to delete:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── POST /recordings/:recordingId/archive ───────────────────────────────────
  // Archive recording to cold storage
  fastify.post('/recordings/:recordingId/archive', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { recordingId } = req.params
    const schema = z.object({
      archive_path: z.string().min(1),
    })

    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.errors })

    try {
      const recording = await getRecording(recordingId)
      if (!recording) return reply.code(404).send({ error: 'Recording not found' })

      if (!(await checkLiveAccess(req, recording.live_id))) {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      await archiveRecording(recordingId, body.data.archive_path, fastify.log)
      return { ok: true }
    } catch (err) {
      fastify.log.error(`[recordings] Archive failed:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── GET /recordings/debug/status ────────────────────────────────────────────
  // Admin: check active recordings
  fastify.get('/recordings/debug/status', async (req, reply) => {
    if (!req.user || req.user.role !== 'super_admin') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    return {
      timestamp: new Date().toISOString(),
      active_recordings: getAllRecordings(),
    }
  })
}
