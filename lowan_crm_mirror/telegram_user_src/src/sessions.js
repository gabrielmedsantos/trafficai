'use strict'
const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { Api } = require('telegram')
const { NewMessage } = require('telegram/events')
const { postWebhook } = require('./webhook')
const pino = require('pino')

const logger = pino({ name: 'tg-user-sessions', level: process.env.LOG_LEVEL || 'info' })

// Map connectionId → { client, status, lastEventAt, rate, phone, meUsername }
const sessions = new Map()
// Map phone → { phoneCodeHash, tempClient } durante auth
const pending = new Map()

const API_ID = parseInt(process.env.TELEGRAM_USER_API_ID || '0', 10)
const API_HASH = process.env.TELEGRAM_USER_API_HASH || ''

function assertConfigured() {
  if (!API_ID || !API_HASH) {
    const err = new Error('Telegram MTProto não configurado neste servidor (faltam API_ID/API_HASH)')
    err.statusCode = 503
    err.code = 'SIGNUP_NOT_CONFIGURED'
    throw err
  }
}

function newClient(sessionString = '') {
  return new TelegramClient(
    new StringSession(sessionString),
    API_ID,
    API_HASH,
    { connectionRetries: 5, useWSS: false, autoReconnect: true }
  )
}

// ─── Auth flow (sem connectionId ainda — só phone) ────────────────────────────
async function startAuth(phone) {
  assertConfigured()
  const client = newClient('')
  await client.connect()
  const r = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone)
  pending.set(phone, { phoneCodeHash: r.phoneCodeHash, client })
  logger.info({ phone, phoneCodeHash: r.phoneCodeHash.slice(0, 8) + '…' }, 'auth: sendCode ok')
  return { phoneCodeHash: r.phoneCodeHash }
}

async function verifyAuth(phone, phoneCodeHash, code, password) {
  assertConfigured()
  const slot = pending.get(phone)
  if (!slot) {
    const err = new Error('Sessão de auth não iniciada para esse phone')
    err.statusCode = 410; err.code = 'AUTH_NOT_STARTED'; throw err
  }
  const client = slot.client
  try {
    if (password) {
      // 2FA path
      await client.signInWithPassword({ apiId: API_ID, apiHash: API_HASH }, { password })
    } else {
      await client.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code }))
    }
  } catch (err) {
    const msg = (err && err.errorMessage) || (err && err.message) || ''
    if (msg.includes('SESSION_PASSWORD_NEEDED')) {
      const e = new Error('2FA exigido — repita /verify enviando { password }')
      e.statusCode = 428; e.code = '2FA_REQUIRED'; throw e
    }
    if (msg.includes('PHONE_CODE_INVALID') || msg.includes('PHONE_CODE_EMPTY')) {
      const e = new Error('Código incorreto. Tente novamente.')
      e.statusCode = 400; e.code = 'PHONE_CODE_INVALID'; throw e
    }
    if (msg.includes('PHONE_CODE_EXPIRED')) {
      const e = new Error('Código expirou. Solicite um novo.')
      e.statusCode = 410; e.code = 'PHONE_CODE_EXPIRED'; throw e
    }
    if (msg.includes('PHONE_NUMBER_BANNED')) {
      const e = new Error('Esse número está banido pelo Telegram.')
      e.statusCode = 403; e.code = 'PHONE_BANNED'; throw e
    }
    logger.warn({ phone, err: msg }, 'verifyAuth failed')
    throw err
  }
  const me = await client.getMe()
  const sessionString = client.session.save()
  pending.delete(phone)
  logger.info({ phone, meId: me.id?.toString(), username: me.username || null }, 'auth: signIn ok')
  return {
    sessionString,
    telegramUserId: me.id?.toString() || null,
    username: me.username || null,
    firstName: me.firstName || null,
    client,  // client já conectado pode ser reusado em loadSession
  }
}

// ─── Load existing session (chamado após verify OU no restore on boot) ────────
async function loadSession(connectionId, sessionString, opts = {}) {
  assertConfigured()
  if (sessions.has(connectionId)) {
    logger.info({ connectionId }, 'session already loaded')
    return { reused: true }
  }
  let client = opts.existingClient
  if (!client) {
    client = newClient(sessionString)
    await client.connect()
  }
  if (!(await client.checkAuthorization())) {
    await client.destroy().catch(() => {})
    const e = new Error('Sessão revogada — reauth necessário')
    e.statusCode = 401; e.code = 'AUTH_KEY_UNREGISTERED'; throw e
  }
  const me = await client.getMe()
  const entry = {
    client,
    status: 'ACTIVE',
    lastEventAt: null,
    rate: { perMin: [], perDay: 0, dayKey: dayKey() },
    phone: me.phone || null,
    meUsername: me.username || null,
    meFirstName: me.firstName || null,
    workspaceId: opts.workspaceId || null,
  }
  // Listener inbound — só DMs no MVP
  client.addEventHandler(async (event) => {
    try {
      const msg = event.message
      if (!msg) return
      if (!msg.isPrivate) return  // ignora grupos/canais (fase 2)
      if (msg.out) return  // ignora mensagens enviadas pelo próprio user
      entry.lastEventAt = Date.now()
      const sender = await msg.getSender().catch(() => null)
      const payload = {
        type: 'message.in',
        connectionId,
        chatId: String(msg.chatId || msg.peerId?.userId || msg.senderId || ''),
        fromUserId: sender ? String(sender.id) : null,
        messageId: msg.id,
        text: msg.message || null,
        mediaKind: mediaKindOf(msg),
        date: msg.date,
        from: sender ? {
          firstName: sender.firstName || null,
          lastName: sender.lastName || null,
          username: sender.username || null,
        } : null,
      }
      postWebhook(connectionId, payload).catch((err) => {
        logger.warn({ connectionId, err: err.message }, 'webhook out failed')
      })
    } catch (err) {
      logger.error({ connectionId, err: err.message }, 'inbound handler error')
    }
  }, new NewMessage({}))
  sessions.set(connectionId, entry)
  logger.info({ connectionId, meUsername: entry.meUsername, phone: entry.phone }, 'session loaded')
  return { reused: false, meUsername: entry.meUsername, meFirstName: entry.meFirstName, telegramUserId: me.id?.toString() }
}

function mediaKindOf(msg) {
  if (!msg) return null
  if (msg.photo) return 'photo'
  if (msg.video) return 'video'
  if (msg.voice) return 'voice'
  if (msg.audio) return 'audio'
  if (msg.document) return 'document'
  if (msg.sticker) return 'sticker'
  if (msg.contact) return 'contact'
  if (msg.geo) return 'location'
  return null
}

// ─── Send text (rate-limited) ─────────────────────────────────────────────────
function dayKey() { return new Date().toISOString().slice(0, 10) }

function checkRate(entry) {
  // Reset per-day se mudou dia
  const today = dayKey()
  if (entry.rate.dayKey !== today) { entry.rate.dayKey = today; entry.rate.perDay = 0 }
  // Limpa janela 60s
  const now = Date.now()
  entry.rate.perMin = entry.rate.perMin.filter((t) => now - t < 60_000)
  if (entry.rate.perMin.length >= 10) return { ok: false, reason: 'PER_MIN_LIMIT (10/min)' }
  if (entry.rate.perDay >= 500) return { ok: false, reason: 'PER_DAY_LIMIT (500/dia)' }
  return { ok: true }
}

async function sendText(connectionId, peerId, text) {
  const entry = sessions.get(connectionId)
  if (!entry) {
    const e = new Error('Sessão não carregada'); e.statusCode = 404; throw e
  }
  const rate = checkRate(entry)
  if (!rate.ok) {
    const e = new Error('Rate limit: ' + rate.reason); e.statusCode = 429; e.code = 'RATE_LIMITED'; throw e
  }
  const sent = await entry.client.sendMessage(peerId, { message: text })
  entry.rate.perMin.push(Date.now())
  entry.rate.perDay++
  return { messageId: sent.id, date: sent.date }
}

async function sendMedia(connectionId, peerId, source, opts = {}) {
  const entry = sessions.get(connectionId)
  if (!entry) { const e = new Error('Sessão não carregada'); e.statusCode = 404; throw e }
  const rate = checkRate(entry)
  if (!rate.ok) { const e = new Error('Rate limit: ' + rate.reason); e.statusCode = 429; e.code = 'RATE_LIMITED'; throw e }
  let file = source
  if (typeof source === 'string' && source.startsWith('data:')) {
    const m = source.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) { const e = new Error('dataUrl inválida'); e.statusCode = 400; throw e }
    file = Buffer.from(m[2], 'base64')
  }
  const sendOpts = { file }
  if (opts.caption) sendOpts.caption = String(opts.caption).slice(0, 1024)
  if (opts.filename) sendOpts.fileName = String(opts.filename)
  if (opts.voice) sendOpts.voiceNote = true
  if (opts.forceDocument) sendOpts.forceDocument = true
  const sent = await entry.client.sendFile(peerId, sendOpts)
  entry.rate.perMin.push(Date.now())
  entry.rate.perDay++
  return { messageId: sent.id, date: sent.date }
}

async function logoutSession(connectionId) {
  const entry = sessions.get(connectionId)
  if (!entry) return { alreadyGone: true }
  try {
    await entry.client.invoke(new Api.auth.LogOut())
  } catch (err) {
    logger.warn({ connectionId, err: err.message }, 'logout RPC failed (continuing)')
  }
  try { await entry.client.destroy() } catch {}
  sessions.delete(connectionId)
  return { loggedOut: true }
}

function healthOf(connectionId) {
  const entry = sessions.get(connectionId)
  if (!entry) return { connected: false }
  return {
    connected: true,
    status: entry.status,
    lastEventAt: entry.lastEventAt,
    meUsername: entry.meUsername,
    rate: {
      perMinUsed: entry.rate.perMin.length,
      perDayUsed: entry.rate.perDay,
    },
  }
}

function allSessions() {
  return Array.from(sessions.entries()).map(([id, e]) => ({
    connectionId: id, status: e.status, meUsername: e.meUsername, lastEventAt: e.lastEventAt,
  }))
}

module.exports = {
  startAuth, verifyAuth, loadSession, sendText, sendMedia, logoutSession, healthOf, allSessions, assertConfigured, sessions,
}
