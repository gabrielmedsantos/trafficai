'use strict'
const express = require('express')
const jwt = require('jsonwebtoken')
const pino = require('pino')

const sessions = require('./sessions')
const { fetchInternal } = require('./webhook')

const logger = pino({ name: 'tg-user', level: process.env.LOG_LEVEL || 'info' })
const PORT = parseInt(process.env.PORT || '3003', 10)
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) { logger.error('JWT_SECRET ausente'); process.exit(1) }

const app = express()
app.use(express.json({ limit: '2mb' }))

// ─── Auth middleware (Bearer JWT, igual unofficial) ──────────────────────────
function authJwt(req, res, next) {
  // Health endpoints públicos
  if (req.path === '/health' || req.path === '/healthz') return next()
  const h = req.headers.authorization || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m) return res.status(401).json({ error: 'missing_token' })
  try {
    const decoded = jwt.verify(m[1], JWT_SECRET)
    req.jwt = decoded
    next()
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token', detail: e.message })
  }
}
app.use(authJwt)

// ─── Error wrapper ────────────────────────────────────────────────────────────
function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res) }
    catch (err) {
      const status = err.statusCode || 500
      const code = err.code || 'INTERNAL'
      if (status >= 500) logger.error({ path: req.path, err: err.message, stack: err.stack }, 'handler error')
      else logger.warn({ path: req.path, err: err.message, code }, 'handler error')
      res.status(status).json({ error: code, message: err.message })
    }
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, configured: !!(process.env.TELEGRAM_USER_API_ID && process.env.TELEGRAM_USER_API_HASH), sessions: sessions.allSessions().length }))
app.get('/healthz', (_req, res) => res.json({ ok: true }))

// ─── Sessions API ─────────────────────────────────────────────────────────────
app.post('/sessions/start', wrap(async (req, res) => {
  const { phone } = req.body || {}
  if (!phone) throw Object.assign(new Error('phone obrigatório'), { statusCode: 400, code: 'MISSING_PHONE' })
  const out = await sessions.startAuth(phone)
  res.json(out)
}))

app.post('/sessions/verify', wrap(async (req, res) => {
  const { phone, phoneCodeHash, code, password } = req.body || {}
  if (!phone || !phoneCodeHash || !code) throw Object.assign(new Error('phone, phoneCodeHash e code obrigatórios'), { statusCode: 400, code: 'MISSING_FIELDS' })
  const out = await sessions.verifyAuth(phone, phoneCodeHash, code, password)
  // Não envia o client de volta, só os dados
  res.json({
    sessionString: out.sessionString,
    telegramUserId: out.telegramUserId,
    username: out.username,
    firstName: out.firstName,
  })
  // Após responder, mantém client carregado (mas precisa do connectionId — api deve chamar /sessions/:id/load depois)
  // O client aqui é descartado se /load não vier — sessão MTProto continua válida no Telegram
}))

app.post('/sessions/:id/load', wrap(async (req, res) => {
  const { sessionString, workspaceId } = req.body || {}
  if (!sessionString) throw Object.assign(new Error('sessionString obrigatório'), { statusCode: 400 })
  const out = await sessions.loadSession(req.params.id, sessionString, { workspaceId })
  res.json(out)
}))

app.post('/sessions/:id/send-text', wrap(async (req, res) => {
  const { peerId, text } = req.body || {}
  if (!peerId || !text) throw Object.assign(new Error('peerId e text obrigatórios'), { statusCode: 400 })
  const out = await sessions.sendText(req.params.id, peerId, text)
  res.json(out)
}))

app.post('/sessions/:id/send-media', wrap(async (req, res) => {
  const { peerId, source, caption, filename, voice, forceDocument } = req.body || {}
  if (!peerId || !source) throw Object.assign(new Error('peerId e source obrigatórios (source = URL pública ou dataUrl base64)'), { statusCode: 400 })
  const out = await sessions.sendMedia(req.params.id, peerId, source, { caption, filename, voice, forceDocument })
  res.json(out)
}))

app.post('/sessions/:id/logout', wrap(async (req, res) => {
  const out = await sessions.logoutSession(req.params.id)
  res.json(out)
}))

app.get('/sessions/:id/health', wrap(async (req, res) => {
  const out = sessions.healthOf(req.params.id)
  res.json(out)
}))

app.get('/sessions', wrap(async (_req, res) => {
  res.json(sessions.allSessions())
}))

// ─── Restore on boot ──────────────────────────────────────────────────────────
async function restoreActiveSessions() {
  if (!process.env.INTERNAL_SHARED_SECRET) {
    logger.warn('INTERNAL_SHARED_SECRET ausente — pulando restore')
    return
  }
  if (!process.env.TELEGRAM_USER_API_ID || !process.env.TELEGRAM_USER_API_HASH) {
    logger.warn('TELEGRAM_USER_API_ID/HASH ausentes — pulando restore (signup not configured)')
    return
  }
  try {
    const list = await fetchInternal('/internal/telegram-user/restore-list')
    logger.info({ count: list.length }, 'restoreActiveSessions: fetched list')
    let ok = 0, fail = 0
    for (const item of list) {
      try {
        await sessions.loadSession(item.id, item.sessionString, { workspaceId: item.workspaceId })
        ok++
      } catch (err) {
        fail++
        // Marca como REAUTH_REQUIRED se for AUTH_KEY_UNREGISTERED
        const code = err.code || 'LOAD_FAILED'
        await fetchInternal(`/internal/telegram-user/${item.id}/heartbeat`, {
          method: 'PATCH',
          body: { status: code === 'AUTH_KEY_UNREGISTERED' ? 'REAUTH_REQUIRED' : 'ERROR' },
        }).catch(() => {})
        logger.warn({ connectionId: item.id, code, err: err.message }, 'restore failed')
      }
    }
    logger.info({ ok, fail }, 'restoreActiveSessions: done')
  } catch (err) {
    logger.error({ err: err.message }, 'restoreActiveSessions: fatal — will retry in 30s')
    setTimeout(() => restoreActiveSessions().catch(() => {}), 30_000)
  }
}

// ─── Heartbeat loop ───────────────────────────────────────────────────────────
function startHeartbeatLoop() {
  setInterval(async () => {
    if (!process.env.INTERNAL_SHARED_SECRET) return
    for (const { connectionId, status } of sessions.allSessions()) {
      fetchInternal(`/internal/telegram-user/${connectionId}/heartbeat`, {
        method: 'PATCH',
        body: { status },
      }).catch(() => {})
    }
  }, 60_000)
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, configured: !!(process.env.TELEGRAM_USER_API_ID && process.env.TELEGRAM_USER_API_HASH) }, 'tg-user listening')
  setTimeout(() => { restoreActiveSessions().catch(() => {}); startHeartbeatLoop() }, 3000)
})
