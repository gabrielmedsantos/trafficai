/**
 * Live Streaming Control — Main Server
 *
 * Fastify + WebSocket + RTMP
 */
import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyMultipart from '@fastify/multipart'
import { nanoid } from 'nanoid'

import { config } from './config.js'
import { startRtmpServer } from './rtmp/server.js'
import { hub } from './websocket/hub.js'

import authRoutes        from './routes/auth.routes.js'
import livesRoutes       from './routes/lives.routes.js'
import adminRoutes       from './routes/admin.routes.js'
import leadsRoutes       from './routes/leads.routes.js'
import leadIntelRoutes   from './routes/lead-intel.routes.js'
import livekitRoutes     from './routes/livekit.routes.js'
import superadminRoutes  from './routes/superadmin.routes.js'
import meRoutes          from './routes/me.routes.js'
import teamRoutes        from './routes/team.routes.js'
import costreamRoutes    from './routes/costream.routes.js'
import costreamInvitesRoutes from './routes/costream-invites.routes.js'
import recordingsRoutes  from './routes/recordings.routes.js'

import * as viewersService from './services/viewers.service.js'
import * as chatService    from './services/chat.service.js'
import * as analyticsService from './services/analytics.service.js'
import * as speechService from './services/speech.service.js'
import { verifyWsToken } from './middleware/auth.js'
import db from './db/client.js'

// ─── Fastify instance ──────────────────────────────────────────────────────────

const fastify = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    transport: config.nodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  trustProxy: true,
})

// ─── Plugins ───────────────────────────────────────────────────────────────────

await fastify.register(fastifyCors, {
  origin: true,   // reflete o Origin do cliente — funciona com qualquer localhost
  credentials: true,
})

await fastify.register(fastifyJwt, {
  secret: config.jwt.secret,
  sign: { expiresIn: config.jwt.expiresIn },
})

await fastify.register(fastifyRateLimit, {
  max: 1000,
  timeWindow: '1 minute',
})

await fastify.register(fastifyMultipart, {
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB max upload
})

await fastify.register(fastifyWebsocket)

// ─── Global preHandler: resolve short_id → UUID em :id/:liveId ─────────────────
// Permite que QUALQUER rota (HTTP ou WS) com parâmetro :id ou :liveId aceite
// o short_id curto da live. Cache em memória de até 500 entradas — short_ids
// são imutáveis após criados (exceto regeneração explícita), então cache TTL é
// efetivamente eterno até o processo reiniciar.
const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_RE = /^[0-9a-z]{6,12}$/i
const shortIdCache = new Map() // short_id -> uuid

async function resolveLiveId(value) {
  if (!value || typeof value !== 'string')      return null
  if (UUID_RE.test(value))                       return value
  if (!SHORT_ID_RE.test(value))                  return null
  const cached = shortIdCache.get(value)
  if (cached)                                    return cached
  const { rows } = await db.query('SELECT id FROM lives WHERE short_id = $1', [value])
  if (!rows.length)                              return null
  const uuid = rows[0].id
  if (shortIdCache.size >= 500) {
    // Drop oldest entry — Map preserves insertion order
    const oldestKey = shortIdCache.keys().next().value
    if (oldestKey) shortIdCache.delete(oldestKey)
  }
  shortIdCache.set(value, uuid)
  return uuid
}

fastify.addHook('preHandler', async (req) => {
  const params = req.params
  if (!params) return
  for (const key of ['id', 'liveId']) {
    const v = params[key]
    if (!v || typeof v !== 'string') continue
    if (UUID_RE.test(v)) continue
    const resolved = await resolveLiveId(v)
    if (resolved) params[key] = resolved
    // Se não resolveu, o handler downstream retornará 404/403 normalmente
  }
})

// Exporta pra que rotas WS possam usar diretamente também
fastify.decorate('resolveLiveId', resolveLiveId)

// ─── Routes ────────────────────────────────────────────────────────────────────

await fastify.register(authRoutes)
await fastify.register(livesRoutes)
await fastify.register(adminRoutes)
await fastify.register(leadsRoutes)
await fastify.register(leadIntelRoutes)
await fastify.register(livekitRoutes)
await fastify.register(superadminRoutes)
await fastify.register(meRoutes)
await fastify.register(teamRoutes)
await fastify.register(costreamRoutes)
await fastify.register(costreamInvitesRoutes)
await fastify.register(recordingsRoutes)

// ─── Health check ──────────────────────────────────────────────────────────────

fastify.get('/health', async () => ({ ok: true, ts: Date.now() }))

// ─── WebSocket — Viewer Connection ─────────────────────────────────────────────
//
// ws://host/ws/live/:liveId?session=<sessionId>&token=<jwt|optional>
//
fastify.get('/ws/live/:liveId', { websocket: true }, async (connection, req) => {
  const ws = connection.socket  // raw WebSocket — has .send() and emits 'message'/'close'
  const { liveId } = req.params
  const sessionId  = (req.query.session ?? nanoid(12)).toString()
  const token      = req.query.token?.toString()
  const utmSource   = req.query.utm_source?.toString()   ?? null
  const utmMedium   = req.query.utm_medium?.toString()   ?? null
  const utmCampaign = req.query.utm_campaign?.toString() ?? null

  // Optional auth (logged-in users get userId)
  let userId = null
  if (token) {
    const payload = await verifyWsToken(fastify, token)
    if (payload) userId = payload.id
  }

  // Verify live exists
  const { rows } = await db.query(
    "SELECT id, status, user_id FROM lives WHERE id = $1 AND status != 'ended'",
    [liveId]
  )
  if (!rows.length) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Live not found or ended' } }))
    ws.close()
    return
  }

  const live = rows[0]

  // Register viewer in hub (pass raw WebSocket)
  hub.registerViewer(ws, liveId, sessionId)
  await viewersService.onViewerJoin(liveId)

  // Track join event
  analyticsService.trackEvent({
    liveId,
    eventType: 'join',
    sessionId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: {
      ...(utmSource   ? { utm_source:   utmSource   } : {}),
      ...(utmMedium   ? { utm_medium:   utmMedium   } : {}),
      ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
    },
  })

  // Send catchup: recent messages + current viewer count
  const [recentMessages, fakeCount] = await Promise.all([
    chatService.getRecentMessages(liveId),
    viewersService.getFakeCount(liveId),
  ])

  ws.send(JSON.stringify({
    type: 'init',
    data: {
      sessionId,
      liveId,
      status: live.status,
      recentMessages,
      viewerCount: {
        real:  hub.getRealViewerCount(liveId),
        fake:  fakeCount,
        total: hub.getRealViewerCount(liveId) + fakeCount,
      },
    },
  }))

  // ── Message handler ──────────────────────────────────────────────────────────
  ws.on('message', async (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    switch (msg.type) {
      case 'chat_send': {
        const { content, sender_name } = msg.data ?? {}
        if (!content || typeof content !== 'string') break

        const liveOwner = live.user_id

        await chatService.sendRealMessage({
          liveId,
          userId,
          senderName:  (sender_name ?? 'Viewer').toString().slice(0, 50),
          content:     content.slice(0, 500),
          sessionId,
          ipAddress:   req.ip,
          liveOwnerId: liveOwner,
        })
        break
      }

      case 'set_name': {
        // Viewer reveals their name after completing lead capture
        const name = msg.data?.name?.toString().slice(0, 80)
        if (!name) break
        const phone = msg.data?.phone?.toString().slice(0, 20) || null

        const wasKnown = !!hub.getViewerName(liveId, sessionId)
        hub.setViewerName(liveId, sessionId, name, phone)

        if (!wasKnown) {
          // Notify admin panel that a named participant joined
          hub.broadcastToAdmin(liveId, {
            type: 'participant_joined',
            data: { sessionId, name, phone, connectedAt: new Date().toISOString() },
          })
        }
        break
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', data: { ts: Date.now() } }))
        break
      }

      default:
        break
    }
  })

  // ── Disconnect ──────────────────────────────────────────────────────────────
  ws.on('close', async () => {
    const hadName = !!hub.getViewerName(liveId, sessionId)
    hub.unregister(ws)  // also removes viewer name via removeViewerName
    await viewersService.onViewerLeave(liveId)

    if (hadName) {
      hub.broadcastToAdmin(liveId, {
        type: 'participant_left',
        data: { sessionId },
      })
    }

    analyticsService.trackEvent({
      liveId,
      eventType: 'leave',
      sessionId,
      ipAddress: req.ip,
    })
  })
})

// ─── WebSocket — Admin Control Panel ───────────────────────────────────────────
//
// ws://host/ws/admin/:liveId?token=<jwt>
//
fastify.get('/ws/admin/:liveId', { websocket: true }, async (connection, req) => {
  const ws = connection.socket  // raw WebSocket
  const { liveId } = req.params
  const token = req.query.token?.toString()

  if (!token) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Token required' } }))
    ws.close()
    return
  }

  const payload = await verifyWsToken(fastify, token)
  if (!payload) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid token' } }))
    ws.close()
    return
  }

  // Verify ownership (super_admin bypasses)
  let liveRows
  if (payload.role === 'super_admin') {
    ;({ rows: liveRows } = await db.query('SELECT id FROM lives WHERE id = $1', [liveId]))
  } else {
    ;({ rows: liveRows } = await db.query(
      'SELECT id FROM lives WHERE id = $1 AND (user_id = $2 OR tenant_id = $3)',
      [liveId, payload.id, payload.tenant_id ?? null]
    ))
  }
  if (!liveRows.length) {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Forbidden' } }))
    ws.close()
    return
  }

  hub.registerAdmin(ws, liveId, payload.id)

  // Send current state to admin
  const [fakeConfig, fakeCount] = await Promise.all([
    viewersService.getFakeConfig(liveId),
    viewersService.getFakeCount(liveId),
  ])

  const participants = hub.getViewerList(liveId).map(p => ({
    ...p,
    hasSpeechPermission: speechService.hasPermission(liveId, p.sessionId),
  }))

  ws.send(JSON.stringify({
    type: 'admin_init',
    data: {
      liveId,
      fakeConfig,
      viewerCount: {
        real:  hub.getRealViewerCount(liveId),
        fake:  fakeCount,
        total: hub.getRealViewerCount(liveId) + fakeCount,
      },
      participants,
    },
  }))

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }

    if (msg.type === 'admin_chat') {
      const content = msg.data?.content?.toString().slice(0, 500)
      const senderName = msg.data?.senderName?.toString().slice(0, 80) || 'Admin'
      if (!content) return

      hub.broadcastToAdmin(liveId, {
        type: 'admin_chat',
        data: {
          id: `ac-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          senderName,
          content,
          timestamp: new Date().toISOString(),
        },
      })
    }
  })

  ws.on('close', () => {
    hub.unregister(ws)
  })
})

// ─── Start ─────────────────────────────────────────────────────────────────────

try {
  // Run DB migration
  const { readFileSync } = await import('fs')
  const { fileURLToPath } = await import('url')
  const { dirname, join } = await import('path')
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const schema = readFileSync(join(__dirname, 'db/schema.sql'), 'utf8')
  const { default: pg } = await import('pg')
  const isSupabase = config.database.url?.includes('supabase')
  const client = new pg.Client({
    connectionString: config.database.url,
    ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  await client.connect()
  await client.query(schema)
  await client.end()
  fastify.log.info('Database schema ready')
} catch (err) {
  fastify.log.error('DB init error:', err.message)
}

// Start RTMP server
startRtmpServer(hub)

// Start HTTP/WS server
await fastify.listen({ port: config.port, host: '0.0.0.0' })
console.log(`🚀 API server running on http://0.0.0.0:${config.port}`)
