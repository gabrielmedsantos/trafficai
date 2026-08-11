import { nanoid, customAlphabet } from 'nanoid'
import { z } from 'zod'
import db from '../db/client.js'

// short_id de 8 chars, alfabeto sem ambíguos (sem 0, 1, i, l, o).
// 31^8 = 8,5×10¹¹ combinações — colisão praticamente impossível.
const SHORT_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const generateShortId = customAlphabet(SHORT_ID_ALPHABET, 8)
const SHORT_ID_RE = /^[2-9a-hjkmnp-z]{6,12}$/i

async function newUniqueShortId() {
  // Tenta até 5x — colisão é improvável mas o índice UNIQUE garante segurança
  for (let i = 0; i < 5; i++) {
    const candidate = generateShortId()
    const { rowCount } = await db.query('SELECT 1 FROM lives WHERE short_id = $1', [candidate])
    if (!rowCount) return candidate
  }
  throw new Error('Falha ao gerar short_id único após 5 tentativas')
}
import { requireAuth } from '../middleware/auth.js'
import * as viewersService from '../services/viewers.service.js'
import * as analyticsService from '../services/analytics.service.js'
import * as queueService from '../services/queue.service.js'
import * as fakeVideo from '../services/fake-video.service.js'
import { clearNameHistory } from '../services/humanize.service.js'
import * as speechService from '../services/speech.service.js'
import { liveAccessClause, listAccessClause } from '../services/live-access.service.js'
import { hub } from '../websocket/hub.js'
import { startRecording, stopRecording } from '../services/recording.service.js'

const CreateLiveSchema = z.object({
  title:        z.string().min(1).max(255),
  description:  z.string().max(2000).optional(),
  mode:         z.enum(['obs', 'replay', 'hybrid']).default('obs'),
  replay_url:   z.string().url().optional(),
  stream_key:   z.string().min(1).max(100).optional(),
  scheduled_at: z.string().datetime().optional(),
})

const UpdateLiveSchema = z.object({
  title:         z.string().min(1).max(255).optional(),
  description:   z.string().max(2000).optional(),
  mode:          z.enum(['obs', 'replay', 'livekit', 'hybrid']).optional(),
  cta_message:   z.string().max(500).optional(),
  cta_url:       z.string().url().optional(),
})

const CHANNEL_SLUG_RE = /^[a-z0-9][a-z0-9-]{2,38}$/

export default async function livesRoutes(fastify) {

  // ── GET /channel/:slug — resolve link fixo do criador pra live ativa ─────
  // Público. Retorna a live ativa do user; se nenhuma ativa, retorna a próxima
  // agendada; se nada, retorna a última encerrada (pra mostrar replay).
  fastify.get('/channel/:slug', async (req, reply) => {
    const slug = (req.params.slug ?? '').toLowerCase()
    if (!CHANNEL_SLUG_RE.test(slug)) return reply.code(400).send({ error: 'Slug inválido' })

    const { rows: u } = await db.query('SELECT id, name FROM users WHERE channel_slug = $1', [slug])
    if (!u.length) return reply.code(404).send({ error: 'Canal não encontrado' })
    const user = u[0]

    // 1) Live AO VIVO agora — prioridade absoluta
    const live = await db.query(
      `SELECT id, short_id, title, status, started_at
       FROM lives
       WHERE user_id = $1 AND status = 'live'
       ORDER BY started_at DESC NULLS LAST
       LIMIT 1`,
      [user.id]
    )
    if (live.rows.length) {
      const l = live.rows[0]
      return { status: 'live', live: l, owner: { name: user.name } }
    }

    // 2) Próxima live AGENDADA (status waiting com scheduled_at futuro ou recente)
    const next = await db.query(
      `SELECT id, short_id, title, status, scheduled_at
       FROM lives
       WHERE user_id = $1 AND status = 'waiting'
       ORDER BY COALESCE(scheduled_at, created_at) ASC
       LIMIT 1`,
      [user.id]
    )
    if (next.rows.length) {
      return { status: 'waiting', live: next.rows[0], owner: { name: user.name } }
    }

    // 3) Última encerrada (replay)
    const last = await db.query(
      `SELECT id, short_id, title, status, ended_at
       FROM lives
       WHERE user_id = $1 AND status = 'ended'
       ORDER BY ended_at DESC NULLS LAST
       LIMIT 1`,
      [user.id]
    )
    if (last.rows.length) {
      return { status: 'idle', last_live: last.rows[0], owner: { name: user.name } }
    }

    return { status: 'idle', owner: { name: user.name } }
  })

  // ── GET /me/channel — minha config de canal (auth) ────────────────────────
  fastify.get('/me/channel', { preHandler: requireAuth }, async (req) => {
    const { rows } = await db.query('SELECT channel_slug FROM users WHERE id = $1', [req.user.id])
    return { slug: rows[0]?.channel_slug ?? null }
  })

  // ── PATCH /me/channel — editar meu slug (auth) ────────────────────────────
  fastify.patch('/me/channel', { preHandler: requireAuth }, async (req, reply) => {
    const schema = z.object({ slug: z.string().min(3).max(40) })
    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Slug inválido (3-40 chars)' })
    const slug = body.data.slug.toLowerCase().trim()
    if (!CHANNEL_SLUG_RE.test(slug)) {
      return reply.code(400).send({ error: 'Use letras minúsculas, números e hífen. 3-40 chars.' })
    }
    try {
      await db.query('UPDATE users SET channel_slug = $1 WHERE id = $2', [slug, req.user.id])
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Esse slug já está em uso por outro usuário' })
      return reply.code(500).send({ error: err.message })
    }
    return { ok: true, slug }
  })


  // ── POST /lives — create ───────────────────────────────────────────────────
  fastify.post('/lives', { preHandler: requireAuth }, async (req, reply) => {
    const body = CreateLiveSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.errors })

    const { title, description, mode, replay_url, stream_key, scheduled_at } = body.data
    const streamKey = stream_key ?? `sk_${nanoid(20)}`
    const shortId   = await newUniqueShortId()
    const tenantId  = req.user.tenant_id ?? null

    // For costream mode: auto-assign another user from same tenant as Trader B
    let traderBId = null
    if (mode === 'costream') {
      const { rows: otherUsers } = await db.query(
        `SELECT id FROM users
         WHERE (tenant_id = $1 OR (tenant_id IS NULL AND $1 IS NULL))
           AND id != $2
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId, req.user.id]
      )
      if (otherUsers.length) {
        traderBId = otherUsers[0].id
      }
    }

    const { rows } = await db.query(
      `INSERT INTO lives(user_id, tenant_id, title, description, stream_key, short_id, mode, replay_url, scheduled_at, costream_trader_a_id, costream_trader_b_id)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [req.user.id, tenantId, title, description ?? null, streamKey, shortId, mode, replay_url ?? null, scheduled_at ?? null, req.user.id, traderBId]
    )

    return reply.code(201).send(rows[0])
  })

  // ── POST /lives/:id/regenerate-short-id (admin) — caso o link vaze ─────────
  fastify.post('/lives/:id/regenerate-short-id', { preHandler: requireAuth }, async (req, reply) => {
    const acc = liveAccessClause(req.user)
    const ownerCheck = await db.query(
      `SELECT id FROM lives WHERE id = $1 ${acc.clause}`,
      [req.params.id, ...acc.params]
    )
    if (!ownerCheck.rows.length) return reply.code(403).send({ error: 'Forbidden' })

    const newShort = await newUniqueShortId()
    await db.query('UPDATE lives SET short_id = $1 WHERE id = $2', [newShort, req.params.id])
    return { ok: true, short_id: newShort }
  })

  // ── GET /lives — lista lives acessíveis pelo user ─────────────────────────
  // Tenant admin vê todas as lives do tenant; user comum só as próprias.
  // Cada linha inclui o owner (user_id + nome) pra UI diferenciar sub-users.
  fastify.get('/lives', { preHandler: requireAuth }, async (req) => {
    const acc = listAccessClause(req.user)
    const { rows } = await db.query(
      `SELECT l.id, l.short_id, l.title, l.description, l.stream_key, l.status, l.mode,
              l.fake_viewers_current, l.tenant_id, l.user_id, u.name AS user_name,
              l.scheduled_at, l.started_at, l.ended_at, l.created_at
       FROM lives l
       LEFT JOIN users u ON u.id = l.user_id
       ${acc.whereClause ? acc.whereClause.replace('WHERE', 'WHERE l.') : ''}
       ORDER BY l.created_at DESC`,
      acc.params
    )
    return rows
  })

  // ── GET /lives/:id ─────────────────────────────────────────────────────────
  fastify.get('/lives/:id', { preHandler: requireAuth }, async (req, reply) => {
    const acc = liveAccessClause(req.user)
    const { rows } = await db.query(
      `SELECT * FROM lives WHERE id = $1 ${acc.clause}`,
      [req.params.id, ...acc.params]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })
    return rows[0]
  })

  // ── GET /lives/:id/public — public info for viewer page ───────────────────
  fastify.get('/lives/:id/public', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT id, short_id, title, description, status, mode, started_at,
              stream_key,
              fake_viewers_min, fake_viewers_max, fake_viewers_current,
              cta_message, cta_url, cta_triggered_at
       FROM lives WHERE id = $1`,
      [req.params.id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })

    const live = rows[0]
    const real = hub.getRealViewerCount(live.id)
    const fake = live.fake_viewers_current ?? 0

    return {
      ...live,
      viewer_count: { real, fake, total: real + fake },
    }
  })

  // ── PATCH /lives/:id ───────────────────────────────────────────────────────
  fastify.patch('/lives/:id', { preHandler: requireAuth }, async (req, reply) => {
    const body = UpdateLiveSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.errors })

    const fields = Object.entries(body.data)
    if (!fields.length) return reply.code(400).send({ error: 'No fields to update' })

    // setClauses vão de $2 até $(1+fields.length); depois vem os params do acc
    const setClauses = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')
    const values = fields.map(([, v]) => v)
    const acc = liveAccessClause(req.user, 2 + fields.length)

    const { rows } = await db.query(
      `UPDATE lives SET ${setClauses}, updated_at = NOW() WHERE id = $1 ${acc.clause} RETURNING *`,
      [req.params.id, ...values, ...acc.params]
    )

    if (!rows.length) return reply.code(404).send({ error: 'Not found' })
    return rows[0]
  })

  // ── DELETE /lives/:id ──────────────────────────────────────────────────────
  fastify.delete('/lives/:id', { preHandler: requireAuth }, async (req, reply) => {
    const acc = liveAccessClause(req.user)
    const { rowCount } = await db.query(
      `DELETE FROM lives WHERE id = $1 ${acc.clause}`,
      [req.params.id, ...acc.params]
    )
    if (!rowCount) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // ── POST /lives/:id/start — manually start a live ────────────────────────
  fastify.post('/lives/:id/start', { preHandler: requireAuth }, async (req, reply) => {
    const acc = liveAccessClause(req.user)
    const { rows } = await db.query(
      `UPDATE lives SET status = 'live', started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status != 'ended' ${acc.clause} RETURNING id, mode_broadcast, stream_key`,
      [req.params.id, ...acc.params]
    )
    if (!rows.length) return reply.code(400).send({ error: 'Live não encontrada ou já encerrada' })

    const liveId = rows[0].id
    const live = rows[0]

    hub.broadcastToLive(liveId, {
      type: 'stream_status',
      data: { status: 'live', started_at: new Date().toISOString() },
    })

    // ── Auto-start recording ──────────────────────────────────────────────
    try {
      const recordingType = live.mode_broadcast === 'costream' ? 'costream' : 'standard'
      const inputRtmpUrl = live.mode_broadcast === 'costream'
        ? `rtmp://localhost:${process.env.RTMP_PORT || 1935}/live/costream-${liveId}`
        : `rtmp://localhost:${process.env.RTMP_PORT || 1935}/live/${live.stream_key}`

      await startRecording(liveId, inputRtmpUrl, recordingType, {
        logger: fastify.log,
        metadata: { type: recordingType, mode: live.mode_broadcast || 'standard' },
      })
      fastify.log.info(`[lives] Auto-started recording for ${liveId}`)
    } catch (err) {
      fastify.log.warn(`[lives] Failed to auto-start recording: ${err.message}`)
      // Don't fail the live start if recording fails
    }

    return { ok: true }
  })

  // ── POST /lives/:id/end — manually end a live ─────────────────────────────
  fastify.post('/lives/:id/end', { preHandler: requireAuth }, async (req, reply) => {
    const acc = liveAccessClause(req.user)
    const { rows: check } = await db.query(
      `SELECT id, status FROM lives WHERE id = $1 ${acc.clause}`,
      [req.params.id, ...acc.params]
    )
    if (!check.length) return reply.code(404).send({ error: 'Live não encontrada' })

    if (check[0].status === 'ended') return { ok: true, already: true }

    const liveId = req.params.id

    await db.query(
      `UPDATE lives SET status = 'ended', ended_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [liveId]
    )

    hub.broadcastToLive(liveId, {
      type: 'stream_status',
      data: { status: 'ended', ended_at: new Date().toISOString() },
    })

    // ── Auto-stop recording ───────────────────────────────────────────────
    try {
      const { rows: recordings } = await db.query(
        `SELECT id FROM live_recordings
         WHERE live_id = $1 AND status = 'recording'
         LIMIT 1`,
        [liveId]
      )
      if (recordings.length > 0) {
        await stopRecording(recordings[0].id, fastify.log)
        fastify.log.info(`[lives] Auto-stopped recording for ${liveId}`)
      }
    } catch (err) {
      fastify.log.warn(`[lives] Failed to auto-stop recording: ${err.message}`)
      // Don't fail the live end if recording stop fails
    }

    // Clean up in-memory services to prevent memory/resource leaks
    viewersService.stopFluctuation(liveId)
    queueService.stopQueue(liveId)
    clearNameHistory(liveId)
    fakeVideo.stopStream(liveId)
    speechService.clearLive(liveId)
    hub.clearViewerNames(liveId)

    return { ok: true }
  })

  // ── GET /lives/:id/stream-info — RTMP credentials ─────────────────────────
  fastify.get('/lives/:id/stream-info', { preHandler: requireAuth }, async (req, reply) => {
    const acc = liveAccessClause(req.user)
    const { rows } = await db.query(
      `SELECT id, stream_key, status FROM lives WHERE id = $1 ${acc.clause}`,
      [req.params.id, ...acc.params]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })

    const { stream_key } = rows[0]
    // Strip port from hostname if present (req.hostname may include :port)
    const rawHost = req.hostname || 'localhost'
    const host = rawHost.split(':')[0]

    return {
      rtmp_url:  `rtmp://${host}:1935/live`,
      stream_key,
      hls_url:   `http://${host}:8000/live/${stream_key}/index.m3u8`,
      obs_server: `rtmp://${host}:1935/live`,
    }
  })

  // ── GET /lives/:id/analytics ───────────────────────────────────────────────
  fastify.get('/lives/:id/analytics', { preHandler: requireAuth }, async (req, reply) => {
    const acc = liveAccessClause(req.user)
    const { rows } = await db.query(
      `SELECT id FROM lives WHERE id = $1 ${acc.clause}`,
      [req.params.id, ...acc.params]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })

    return analyticsService.getLiveStats(req.params.id)
  })

  // ── GET /dashboard/stats — agregado de todas as lives do usuário ─────────
  // Super_admin ainda pode ver stats pessoais aqui (suas próprias lives).
  // Para métricas globais da plataforma, use /superadmin/stats.
  fastify.get('/dashboard/stats', { preHandler: requireAuth }, async (req, reply) => {
    const filters = {}
    if (req.query.startDate) filters.startDate = req.query.startDate
    if (req.query.endDate)   filters.endDate   = req.query.endDate
    if (req.query.liveId)    filters.liveId    = req.query.liveId
    return analyticsService.getGlobalStats(req.user.id, filters)
  })

  // ── GET /lives/:id/leads ───────────────────────────────────────────────────
  fastify.get('/lives/:id/leads', { preHandler: requireAuth }, async (req, reply) => {
    const acc = liveAccessClause(req.user)
    const { rows } = await db.query(
      `SELECT id FROM lives WHERE id = $1 ${acc.clause}`,
      [req.params.id, ...acc.params]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })

    const limit  = parseInt(req.query.limit  ?? '200', 10)
    const offset = parseInt(req.query.offset ?? '0',   10)
    const filter = req.query.filter ?? 'all'
    return analyticsService.getLeads(req.params.id, { limit, offset, filter })
  })
}
