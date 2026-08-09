/**
 * Co-streaming Routes
 * Manage dual-trader simultaneous broadcasts with synchronized video composition
 */
import { AccessToken } from 'livekit-server-sdk'
import { z } from 'zod'
import { config } from '../config.js'
import db from '../db/client.js'
import {
  startCompositor,
  stopCompositor,
  getCompositor,
} from '../services/costream-compositor.service.js'
import { liveAccessClause } from '../services/live-access.service.js'

const { apiKey, secret, url } = config.livekit
const RTMP_HTTP_PORT = config.rtmp.httpPort || 8000
const RTMP_URL_BASE = `rtmp://localhost:${config.rtmp.port || 1935}`

function roomName(liveId) {
  return `live-${liveId}`
}

function makeToken({ identity, name, room, canPublish, metadata }) {
  const at = new AccessToken(apiKey, secret, {
    identity,
    name,
    metadata: metadata ?? '',
    ttl: '6h',
  })
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: canPublish ?? false,
    canSubscribe: true,
    canPublishData: canPublish ?? false,
  })
  return at.toJwt()
}

/**
 * Check if user has access to a live (owner, tenant admin, or costream participant)
 */
async function checkLiveAccess(req, liveId) {
  const acc = liveAccessClause(req.user)
  const { rows } = await db.query(
    `SELECT id FROM lives WHERE id = $1 ${acc.clause}`,
    [liveId, ...acc.params]
  )
  return rows.length > 0
}

/**
 * Check if user is specifically assigned as costream trader A or B
 */
async function checkCostreamAccess(req, liveId) {
  const { rows } = await db.query(
    `SELECT costream_trader_a_id, costream_trader_b_id
     FROM lives
     WHERE id = $1`,
    [liveId]
  )
  if (!rows.length) return null

  const live = rows[0]
  if (live.costream_trader_a_id === req.user.id) return 'A'
  if (live.costream_trader_b_id === req.user.id) return 'B'
  return null
}

export default async function costreamRoutes(fastify) {

  // ── POST /costream/:liveId/create ───────────────────────────────────────────
  // Trader A (live owner) invites Trader B to co-stream
  fastify.post('/costream/:liveId/create', async (req, reply) => {
    // Only authenticated users can create costream
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { liveId } = req.params
    const schema = z.object({
      layout: z.enum(['split-50-50', 'pbp-main-pip', 'pip-main-pip']).default('split-50-50'),
      trader_b_id: z.string().uuid('Invalid trader_b_id format'),
    })

    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.errors })

    const { layout, trader_b_id } = body.data

    // Verify live ownership (Trader A must be owner)
    const acc = liveAccessClause(req.user)
    const { rows: liveRows } = await db.query(
      `SELECT id, mode_broadcast FROM lives WHERE id = $1 ${acc.clause}`,
      [liveId, ...acc.params]
    )
    if (!liveRows.length) return reply.code(403).send({ error: 'Forbidden' })

    // Verify Trader B exists
    const { rows: traderBRows } = await db.query(
      'SELECT id FROM users WHERE id = $1',
      [trader_b_id]
    )
    if (!traderBRows.length) return reply.code(404).send({ error: 'Trader B not found' })

    // Prevent duplicate traders
    if (trader_b_id === req.user.id) {
      return reply.code(400).send({ error: 'Cannot invite yourself' })
    }

    try {
      // Update live: switch to costream mode + assign traders
      await db.query(
        `UPDATE lives
         SET mode_broadcast = $1,
             costream_trader_a_id = $2,
             costream_trader_b_id = $3,
             composition_status = $4,
             updated_at = NOW()
         WHERE id = $5`,
        ['costream', req.user.id, trader_b_id, 'idle', liveId]
      )

      // Save or update composition preferences
      await db.query(
        `INSERT INTO costream_compositions (live_id, layout_type, trader_a_position, trader_b_position)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (live_id) DO UPDATE
         SET layout_type = $2, updated_at = NOW()`,
        [liveId, layout, 'left', 'right']
      )

      fastify.log.info(`[costream] Live ${liveId} switched to costream mode: ${req.user.id} + ${trader_b_id}`)

      return {
        ok: true,
        costream: {
          liveId,
          mode: 'costream',
          trader_a_id: req.user.id,
          trader_b_id,
          layout,
        },
      }
    } catch (err) {
      fastify.log.error(`[costream] Failed to create costream for ${liveId}:`, err)
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  // ── POST /costream/:liveId/trader-token ──────────────────────────────────────
  // Generate LiveKit token for a trader (A or B) to join the broadcast
  fastify.post('/costream/:liveId/trader-token', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { liveId } = req.params
    const schema = z.object({
      position: z.enum(['A', 'B']),
      name: z.string().min(1).max(80).default('Trader'),
    })

    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.errors })

    const { position, name } = body.data

    // Verify live exists and is in costream mode
    const { rows } = await db.query(
      `SELECT id, costream_trader_a_id, costream_trader_b_id
       FROM lives
       WHERE id = $1 AND mode_broadcast = 'costream'`,
      [liveId]
    )
    if (!rows.length) {
      return reply.code(404).send({ error: 'Live not in costream mode' })
    }

    const live = rows[0]

    // Verify user is assigned to this position
    const assignedTrader =
      position === 'A' ? live.costream_trader_a_id :
      position === 'B' ? live.costream_trader_b_id : null

    if (assignedTrader !== req.user.id) {
      return reply.code(403).send({ error: `Not assigned as Trader ${position}` })
    }

    try {
      const identity = `trader-${position}-${liveId}`

      // Create or update costream session
      const { rows: sesRows } = await db.query(
        `INSERT INTO costream_sessions (live_id, trader_user_id, trader_position, livekit_identity, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (live_id, trader_user_id) WHERE status = 'active'
         DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [liveId, req.user.id, position, identity]
      )

      const sessionId = sesRows[0].id

      // Generate LiveKit token
      const token = makeToken({
        identity,
        name: name ?? `Trader ${position}`,
        room: roomName(liveId),
        canPublish: true,
        metadata: JSON.stringify({ role: 'trader', position }),
      })

      // Store token in session
      await db.query(
        'UPDATE costream_sessions SET access_token = $1, updated_at = NOW() WHERE id = $2',
        [token, sessionId]
      )

      fastify.log.debug(`[costream] Generated token for Trader ${position} in live ${liveId}`)

      return {
        token,
        url,
        room: roomName(liveId),
        identity,
        position,
      }
    } catch (err) {
      fastify.log.error(`[costream] Failed to generate token for ${liveId}:`, err)
      return reply.code(500).send({ error: 'Failed to generate token' })
    }
  })

  // ── POST /costream/:liveId/start-composition ────────────────────────────────
  // Start FFmpeg compositor (only live owner or superadmin)
  fastify.post('/costream/:liveId/start-composition', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { liveId } = req.params

    // Verify ownership
    if (!(await checkLiveAccess(req, liveId))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    try {
      // Verify live is in costream mode and not already composing
      const { rows } = await db.query(
        `SELECT mode_broadcast, composition_status, costream_trader_a_id, costream_trader_b_id
         FROM lives
         WHERE id = $1`,
        [liveId]
      )

      if (!rows.length) return reply.code(404).send({ error: 'Live not found' })

      const live = rows[0]
      if (live.mode_broadcast !== 'costream') {
        return reply.code(400).send({ error: 'Not a costream live' })
      }

      if (live.composition_status === 'composing') {
        return reply.code(400).send({ error: 'Compositor already running' })
      }

      // Check if both traders have active sessions
      const { rows: sessions } = await db.query(
        `SELECT trader_position FROM costream_sessions
         WHERE live_id = $1 AND status = 'active'`,
        [liveId]
      )

      const positions = new Set(sessions.map(s => s.trader_position))
      if (!positions.has('A') || !positions.has('B')) {
        return reply.code(400).send({ error: 'Both traders must be connected' })
      }

      // Get composition layout
      const { rows: compRows } = await db.query(
        'SELECT layout_type FROM costream_compositions WHERE live_id = $1',
        [liveId]
      )
      const layout = compRows[0]?.layout_type ?? 'split-50-50'

      // Start FFmpeg compositor
      const traderAUrl = `${RTMP_URL_BASE}/live/trader-A-${liveId}`
      const traderBUrl = `${RTMP_URL_BASE}/live/trader-B-${liveId}`
      const compositorRtmpOut = `${RTMP_URL_BASE}/live/costream-${liveId}`

      const compositor = await startCompositor(
        liveId,
        traderAUrl,
        traderBUrl,
        compositorRtmpOut,
        layout,
        fastify.log
      )

      // Update live: mark as composing + set HLS URL
      const hlsUrl = `http://localhost:${RTMP_HTTP_PORT}/live/costream-${liveId}/index.m3u8`
      await db.query(
        `UPDATE lives
         SET composition_status = 'composing',
             hls_composition_url = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [hlsUrl, liveId]
      )

      fastify.log.info(`[costream] Started compositor for live ${liveId} (layout: ${layout})`)

      return {
        ok: true,
        hlsUrl,
        layout,
      }
    } catch (err) {
      fastify.log.error(`[costream] Failed to start compositor for ${liveId}:`, err)

      // Mark as error
      await db.query(
        'UPDATE lives SET composition_status = $1, updated_at = NOW() WHERE id = $2',
        ['error', liveId]
      )

      return reply.code(500).send({ error: err.message })
    }
  })

  // ── POST /costream/:liveId/stop-composition ─────────────────────────────────
  // Stop FFmpeg compositor
  fastify.post('/costream/:liveId/stop-composition', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { liveId } = req.params

    if (!(await checkLiveAccess(req, liveId))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    try {
      await stopCompositor(liveId)

      await db.query(
        `UPDATE lives
         SET composition_status = 'idle', hls_composition_url = NULL, updated_at = NOW()
         WHERE id = $1`,
        [liveId]
      )

      fastify.log.info(`[costream] Stopped compositor for live ${liveId}`)

      return { ok: true }
    } catch (err) {
      fastify.log.error(`[costream] Failed to stop compositor for ${liveId}:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── PATCH /costream/:liveId/layout ──────────────────────────────────────────
  // Change layout and restart compositor
  fastify.patch('/costream/:liveId/layout', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { liveId } = req.params
    const schema = z.object({
      layout: z.enum(['split-50-50', 'pbp-main-pip', 'pip-main-pip']),
    })

    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.errors })

    if (!(await checkLiveAccess(req, liveId))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    try {
      const { layout } = body.data

      // Update layout in DB
      await db.query(
        `UPDATE costream_compositions
         SET layout_type = $1, updated_at = NOW()
         WHERE live_id = $2`,
        [layout, liveId]
      )

      // Stop current compositor (if running)
      const compositor = getCompositor(liveId)
      if (compositor?.isAlive()) {
        await stopCompositor(liveId)

        // Update DB
        await db.query(
          `UPDATE lives
           SET composition_status = 'idle', hls_composition_url = NULL, updated_at = NOW()
           WHERE id = $1`,
          [liveId]
        )

        fastify.log.info(`[costream] Changed layout to ${layout} for live ${liveId} (compositor stopped)`)
      }

      return {
        ok: true,
        layout,
        message: 'Layout updated. Call /start-composition to resume streaming with new layout.',
      }
    } catch (err) {
      fastify.log.error(`[costream] Failed to change layout for ${liveId}:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── GET /costream/:liveId/info ──────────────────────────────────────────────
  // Get costream session info (public endpoint)
  fastify.get('/costream/:liveId/info', async (req, reply) => {
    const { liveId } = req.params

    try {
      const { rows } = await db.query(
        `SELECT id, mode_broadcast, costream_trader_a_id, costream_trader_b_id,
                composition_status, hls_composition_url
         FROM lives
         WHERE id = $1`,
        [liveId]
      )

      if (!rows.length) return reply.code(404).send({ error: 'Live not found' })

      const live = rows[0]
      if (live.mode_broadcast !== 'costream') {
        return reply.code(400).send({ error: 'Not a costream live' })
      }

      // Get active trader sessions
      const { rows: sessions } = await db.query(
        `SELECT trader_position, trader_user_id, status, mic_enabled, cam_enabled
         FROM costream_sessions
         WHERE live_id = $1 AND status = 'active'
         ORDER BY trader_position`,
        [liveId]
      )

      // Get composition config
      const { rows: comp } = await db.query(
        'SELECT layout_type FROM costream_compositions WHERE live_id = $1',
        [liveId]
      )

      return {
        liveId,
        mode: 'costream',
        traders: sessions.map(s => ({
          position: s.trader_position,
          userId: s.trader_user_id,
          status: s.status,
          micEnabled: s.mic_enabled,
          camEnabled: s.cam_enabled,
        })),
        composition: {
          status: live.composition_status,
          layout: comp[0]?.layout_type ?? 'split-50-50',
          hlsUrl: live.hls_composition_url,
        },
      }
    } catch (err) {
      fastify.log.error(`[costream] Failed to get info for ${liveId}:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── PATCH /costream/:liveId/trader/:position/control ────────────────────────
  // Toggle mic/cam for a specific trader
  fastify.patch('/costream/:liveId/trader/:position/control', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' })

    const { liveId, position } = req.params
    const schema = z.object({
      mic_enabled: z.boolean().optional(),
      cam_enabled: z.boolean().optional(),
    })

    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.errors })

    if (!['A', 'B'].includes(position)) {
      return reply.code(400).send({ error: 'Invalid position' })
    }

    if (!(await checkLiveAccess(req, liveId))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    try {
      const updates = []
      const params = [liveId, position]
      let paramIndex = 3

      if (body.data.mic_enabled !== undefined) {
        updates.push(`mic_enabled = $${paramIndex++}`)
        params.push(body.data.mic_enabled)
      }

      if (body.data.cam_enabled !== undefined) {
        updates.push(`cam_enabled = $${paramIndex++}`)
        params.push(body.data.cam_enabled)
      }

      if (!updates.length) {
        return reply.code(400).send({ error: 'No fields to update' })
      }

      await db.query(
        `UPDATE costream_sessions
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE live_id = $1 AND trader_position = $2 AND status = 'active'`,
        params
      )

      fastify.log.debug(`[costream] Updated control for Trader ${position} in ${liveId}:`, body.data)

      return { ok: true }
    } catch (err) {
      fastify.log.error(`[costream] Failed to update control for ${liveId}:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── GET /costream/debug/status — admin only ──────────────────────────────────
  // Check status of all active compositors
  fastify.get('/costream/debug/status', async (req, reply) => {
    if (!req.user || req.user.role !== 'super_admin') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { getAllCompositors } = await import('../services/costream-compositor.service.js')

    return {
      timestamp: new Date().toISOString(),
      compositors: getAllCompositors(),
    }
  })
}
