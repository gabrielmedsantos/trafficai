/**
 * Costream Compositor Service
 * Manages FFmpeg processes for combining two trader feeds into a single HLS stream
 */
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import { config } from '../config.js'

const FFMPEG_BIN = config.rtmp.ffmpeg || '/usr/bin/ffmpeg'
const RTMP_HTTP_PORT = config.rtmp.httpPort || 8000

export class CostreamCompositor {
  constructor(liveId, options = {}) {
    this.liveId = liveId
    this.ffmpegProcess = null
    this.isRunning = false
    this.layout = options.layout || 'split-50-50'
    this.logger = options.logger || console
    this.retryCount = 0
    this.maxRetries = options.maxRetries || 3
  }

  /**
   * Start FFmpeg compositor process
   * @param {Object} options
   * @param {string} options.layout - 'split-50-50' | 'pbp-main-pip' | 'pip-main-pip'
   * @param {string} options.traderAUrl - RTMP input URL for Trader A (from LiveKit)
   * @param {string} options.traderBUrl - RTMP input URL for Trader B (from LiveKit)
   * @param {string} options.outputRtmp - RTMP output URL (node-media-server listener)
   * @returns {Promise<void>}
   */
  async start(options = {}) {
    const {
      layout = this.layout,
      traderAUrl,
      traderBUrl,
      outputRtmp,
    } = options

    if (!traderAUrl || !traderBUrl || !outputRtmp) {
      throw new Error('Missing required URLs: traderAUrl, traderBUrl, outputRtmp')
    }

    this.layout = layout
    const filterChain = this.buildFilterGraph(layout)

    const ffmpegArgs = [
      // Input A (Trader A stream)
      '-rtsp_transport', 'tcp',
      '-i', traderAUrl,

      // Input B (Trader B stream)
      '-rtsp_transport', 'tcp',
      '-i', traderBUrl,

      // Filter complex (composition)
      '-filter_complex', filterChain,

      // Video encoding
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', '3000k',
      '-maxrate', '3500k',
      '-bufsize', '6000k',

      // Audio encoding
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',

      // Output format (FLV/RTMP)
      '-f', 'flv',

      // RTMP output
      outputRtmp,
    ]

    this.logger.info(`[CostreamCompositor ${this.liveId}] Starting FFmpeg with layout: ${layout}`)
    this.logger.debug(`[CostreamCompositor ${this.liveId}] FFmpeg args: ${ffmpegArgs.join(' ')}`)

    try {
      this.ffmpegProcess = spawn(FFMPEG_BIN, ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })

      this.isRunning = true
      this.retryCount = 0

      // Capture stderr for logging
      this.ffmpegProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg.includes('error') || msg.includes('Error')) {
          this.logger.warn(`[CostreamCompositor ${this.liveId}] FFmpeg stderr: ${msg}`)
        } else if (msg.includes('frame=')) {
          this.logger.debug(`[CostreamCompositor ${this.liveId}] ${msg}`)
        }
      })

      this.ffmpegProcess.on('error', (err) => {
        this.logger.error(`[CostreamCompositor ${this.liveId}] Process error:`, err)
        this.isRunning = false
      })

      this.ffmpegProcess.on('close', (code) => {
        this.logger.info(`[CostreamCompositor ${this.liveId}] Process ended (code: ${code})`)
        this.isRunning = false
      })

      // Give FFmpeg a moment to start up
      await new Promise(resolve => setTimeout(resolve, 500))

    } catch (err) {
      this.isRunning = false
      throw new Error(`Failed to spawn FFmpeg: ${err.message}`)
    }
  }

  /**
   * Build FFmpeg filter_complex string for composition
   * Output named [out] for video and [aout] for audio
   */
  buildFilterGraph(layout) {
    if (layout === 'split-50-50') {
      // Side-by-side 50/50
      // Input 0 and 1 are scaled to 960x1080, then stacked horizontally
      return (
        "[0:v]scale=960:1080[a];" +
        "[1:v]scale=960:1080[b];" +
        "[a][b]hstack=inputs=2[out];" +
        "[0:a][1:a]amix=inputs=2:duration=first[aout]"
      )
    }

    if (layout === 'pbp-main-pip') {
      // Picture-by-Picture: Trader A main + Trader B PiP (bottom-right)
      // Main: 1920x1080, PiP: 320x180 at position 1600,900
      return (
        "[0:v]scale=1920:1080[main];" +
        "[1:v]scale=320:180[pip];" +
        "[main][pip]overlay=x=1600:y=900[out];" +
        "[0:a][1:a]amix=inputs=2:duration=first[aout]"
      )
    }

    if (layout === 'pip-main-pip') {
      // Picture-in-Picture: Trader B main + Trader A PiP (bottom-right)
      // Main: 1920x1080, PiP: 320x180 at position 1600,900
      return (
        "[1:v]scale=1920:1080[main];" +
        "[0:v]scale=320:180[pip];" +
        "[main][pip]overlay=x=1600:y=900[out];" +
        "[0:a][1:a]amix=inputs=2:duration=first[aout]"
      )
    }

    // Default to split-50-50
    return (
      "[0:v]scale=960:1080[a];" +
      "[1:v]scale=960:1080[b];" +
      "[a][b]hstack=inputs=2[out];" +
      "[0:a][1:a]amix=inputs=2:duration=first[aout]"
    )
  }

  /**
   * Stop FFmpeg process gracefully
   */
  async stop() {
    if (!this.ffmpegProcess || !this.isRunning) {
      return
    }

    this.logger.info(`[CostreamCompositor ${this.liveId}] Stopping FFmpeg process`)

    try {
      this.ffmpegProcess.kill('SIGTERM')
      this.isRunning = false

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.logger.warn(`[CostreamCompositor ${this.liveId}] FFmpeg didn't stop gracefully, force killing`)
          if (this.ffmpegProcess) {
            this.ffmpegProcess.kill('SIGKILL')
          }
          resolve()
        }, 5000)

        this.ffmpegProcess?.once('close', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    } catch (err) {
      this.logger.error(`[CostreamCompositor ${this.liveId}] Error stopping FFmpeg:`, err)
      this.isRunning = false
    }
  }

  /**
   * Change layout and restart compositor
   * Note: Frontend should wait for response before assuming new layout is active
   */
  async changeLayout(newLayout) {
    if (!['split-50-50', 'pbp-main-pip', 'pip-main-pip'].includes(newLayout)) {
      throw new Error(`Invalid layout: ${newLayout}`)
    }

    this.logger.info(`[CostreamCompositor ${this.liveId}] Changing layout to ${newLayout}`)
    this.layout = newLayout

    // Stop current process — restart will be triggered by caller
    await this.stop()
  }

  /**
   * Check if FFmpeg process is still alive
   */
  isAlive() {
    return this.isRunning && this.ffmpegProcess && !this.ffmpegProcess.killed
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isAlive: this.isAlive(),
      layout: this.layout,
      retryCount: this.retryCount,
    }
  }
}

/**
 * Global registry of compositor instances (liveId → CostreamCompositor)
 */
const compositorsRegistry = new Map()

/**
 * Start or replace compositor for a live
 */
export async function startCompositor(liveId, traderAUrl, traderBUrl, outputRtmp, layout = 'split-50-50', logger = console) {
  // Stop existing compositor if any
  if (compositorsRegistry.has(liveId)) {
    const existing = compositorsRegistry.get(liveId)
    await existing.stop()
  }

  const compositor = new CostreamCompositor(liveId, { layout, logger })

  try {
    await compositor.start({
      layout,
      traderAUrl,
      traderBUrl,
      outputRtmp,
    })
    compositorsRegistry.set(liveId, compositor)
    return compositor
  } catch (err) {
    logger.error(`[startCompositor] Failed to start compositor for ${liveId}:`, err)
    throw err
  }
}

/**
 * Stop compositor for a live
 */
export async function stopCompositor(liveId) {
  const compositor = compositorsRegistry.get(liveId)
  if (compositor) {
    await compositor.stop()
    compositorsRegistry.delete(liveId)
  }
}

/**
 * Get compositor instance by liveId
 */
export function getCompositor(liveId) {
  return compositorsRegistry.get(liveId)
}

/**
 * Get all active compositors
 */
export function getAllCompositors() {
  return Array.from(compositorsRegistry.entries()).map(([liveId, compositor]) => ({
    liveId,
    status: compositor.getStatus(),
  }))
}

/**
 * Stop all compositors (e.g., on graceful shutdown)
 */
export async function stopAllCompositors() {
  const promises = Array.from(compositorsRegistry.values()).map(compositor => compositor.stop())
  await Promise.all(promises)
  compositorsRegistry.clear()
}
