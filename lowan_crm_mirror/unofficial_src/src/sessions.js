import { makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  Browsers,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import fetch from 'node-fetch'
import pino from 'pino'
import path from 'path'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import { HttpsProxyAgent } from 'https-proxy-agent'

const logger = pino({ level: 'silent' })

// id -> { sock, status, qrDataUrl, phoneNumber, reconnectAttempts, workspaceId }
const activeSessions = new Map()

// ─── Anti-ban: per-session state ──────────────────────────────────────────────
// sessionId -> { lastSendAt, onWhatsAppCache: Map<phone, boolean>, dailyCount, dailyDate }
const sessionGuards = new Map()
function _guard(sessionId) {
  let g = sessionGuards.get(sessionId)
  if (!g) {
    g = { lastSendAt: 0, onWhatsAppCache: new Map(), dailyCount: 0, dailyDate: null }
    sessionGuards.set(sessionId, g)
  }
  return g
}

// Rate limit: min 3s entre sends + jitter 0-2.5s (humano nunca dispara em rajada)
async function _throttle(sessionId) {
  const g = _guard(sessionId)
  const minGap = 3000
  const jitter = Math.floor(Math.random() * 2500)
  const needed = minGap + jitter
  const elapsed = Date.now() - g.lastSendAt
  if (elapsed < needed) {
    await new Promise(r => setTimeout(r, needed - elapsed))
  }
  g.lastSendAt = Date.now()
}

// onWhatsApp check com cache de 24h — evita bater na Meta consultando o mesmo número
async function _ensureOnWhatsApp(sock, sessionId, jid) {
  const g = _guard(sessionId)
  const phone = jid.split('@')[0]
  if (g.onWhatsAppCache.has(phone)) {
    const cached = g.onWhatsAppCache.get(phone)
    return cached
  }
  try {
    const results = await sock.onWhatsApp(jid)
    const exists = Array.isArray(results) && results.length > 0 && results[0]?.exists === true
    g.onWhatsAppCache.set(phone, exists)
    return exists
  } catch (err) {
    // Falha de network — não bloqueia (assume válido pra não impedir envio)
    console.error(`[unofficial][${sessionId.slice(0,8)}] onWhatsApp check failed: ${err.message}`)
    return true
  }
}

// Presence updates antes do send — imita digitação humana
// composing → wait baseado no comprimento → paused → send
async function _humanPresence(sock, jid, textLength, isAudio = false) {
  try {
    const state = isAudio ? 'recording' : 'composing'
    await sock.sendPresenceUpdate(state, jid)
    // ~40 chars/sec digitando, mínimo 800ms, máximo 4s
    const ms = Math.min(4000, Math.max(800, Math.floor((textLength || 30) * 25)))
    await new Promise(r => setTimeout(r, ms))
    await sock.sendPresenceUpdate('paused', jid)
  } catch (err) {
    // presence falha não bloqueia send
  }
}

// Warmup: cap diário escalonado baseado em dias desde o pareamento.
// Lê pairedAt do meta.json (registrado quando connection === 'open' pela primeira vez)
function _warmupCapForSession(dataDir, sessionId) {
  try {
    const meta = readMeta(dataDir, sessionId) || {}
    if (!meta.pairedAt) return null // sem pairedAt = não aplica warmup
    const ageMs = Date.now() - new Date(meta.pairedAt).getTime()
    const days = Math.floor(ageMs / (24 * 3600 * 1000))
    if (days === 0) return 20
    if (days === 1) return 40
    if (days === 2) return 80
    if (days === 3) return 150
    return 300
  } catch {
    return null
  }
}

// Anti-ban B: bloqueia primeiro send durante 5min apos pareamento.
// Razao: pair -> send em <1min eh signature de bot. Web client real demora alguns
// minutos navegando antes de mandar qualquer coisa.
const PAIR_COOLDOWN_MS = 5 * 60 * 1000
async function _enforcePairCooldown(sessionId, dataDir) {
  try {
    const meta = readMeta(dataDir, sessionId) || {}
    if (meta.antibanEnabled === false) return // anti-ban desativado pela conexao = pula cooldown
    if (!meta.pairedAt) return // sem pairedAt registrado = sessao antiga, pula check
    const ageMs = Date.now() - new Date(meta.pairedAt).getTime()
    if (ageMs < PAIR_COOLDOWN_MS) {
      const remainingSec = Math.ceil((PAIR_COOLDOWN_MS - ageMs) / 1000)
      const min = Math.floor(remainingSec / 60)
      const sec = remainingSec % 60
      throw new Error(`Aquecendo conexao (anti-ban). Aguarde ${min}m${String(sec).padStart(2,'0')}s antes de enviar a primeira mensagem desta sessao.`)
    }
  } catch (err) {
    // Se for o erro de cooldown, propaga; outros (read meta failure) ignora
    if (err.message?.includes('Aquecendo conexao')) throw err
  }
}

async function _enforceWarmup(sessionId, dataDir) {
  // Toggle anti-ban por sessão: meta.antibanEnabled === false pula warmup cap
  const meta = readMeta(dataDir, sessionId) || {}
  if (meta.antibanEnabled === false) return
  const cap = _warmupCapForSession(dataDir, sessionId)
  if (cap == null) return // sem warmup ativo
  const g = _guard(sessionId)
  const today = new Date().toISOString().slice(0, 10)
  if (g.dailyDate !== today) {
    g.dailyDate = today
    g.dailyCount = 0
  }
  if (g.dailyCount >= cap) {
    throw new Error(`Warmup: limite diário de ${cap} mensagens atingido pra esta sessão (escalonando — número novo). Tenta novamente amanhã.`)
  }
  g.dailyCount++
}

// ─── Webhook helper: envia eventos pro wablast_api ────────────────────────────
const MAIN_API_URL = process.env.MAIN_API_URL || 'http://api:3000'
const JWT_SECRET = process.env.JWT_SECRET || ''
const WEBHOOK_PATH = '/webhooks/unofficial'

async function postWebhook(payload) {
  if (!JWT_SECRET) { console.error('[postWebhook] No JWT_SECRET'); return }
  const token = jwt.sign({ service: 'unofficial' }, JWT_SECRET, { expiresIn: '5m' })
  try {
    const r = await fetch(MAIN_API_URL + WEBHOOK_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(payload),
    })
    console.log('[postWebhook]', payload.type, '→', r.status)
  } catch (err) {
    console.error('[postWebhook] Failed:', err.message, 'URL:', MAIN_API_URL + WEBHOOK_PATH)
  }
}

// Status map Baileys → nosso enum.
// Baileys WAMessageStatus: 0=ERROR, 1=PENDING, 2=SERVER_ACK (enviado), 3=DELIVERY_ACK (entregue), 4=READ, 5=PLAYED
function mapBaileysStatus(s) {
  if (s === 0) return 'FAILED'
  if (s === 3) return 'DELIVERED'
  if (s === 4 || s === 5) return 'READ'
  return null
}

// ─── Inbound media: baixa do WhatsApp e salva no volume ──────────────────────
// Retorna { mediaType, filename, mimetype } ou null se não houve mídia / download falhou.
async function downloadAndPersistMedia(sock, msg, sessionId, dataDir) {
  try {
    const m = msg.message || {}
    let mediaType = null, ext = 'bin', node = null
    if (m.imageMessage)         { mediaType = 'image';    ext = 'jpg';  node = m.imageMessage }
    else if (m.audioMessage)    { mediaType = 'audio';    ext = m.audioMessage.ptt ? 'ogg' : 'mp3'; node = m.audioMessage }
    else if (m.videoMessage)    { mediaType = 'video';    ext = 'mp4';  node = m.videoMessage }
    else if (m.documentMessage) {
      mediaType = 'document'; node = m.documentMessage
      const fn = node.fileName || ''
      const dot = fn.lastIndexOf('.')
      if (dot > -1) ext = fn.slice(dot + 1).toLowerCase().slice(0, 10) || 'bin'
    }
    else if (m.stickerMessage)  { mediaType = 'sticker';  ext = 'webp'; node = m.stickerMessage }
    if (!mediaType) return null

    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
      logger,
      reuploadRequest: sock.updateMediaMessage,
    })
    if (!buffer || !buffer.length) return null

    const mediaDir = path.join(dataDir, sessionId, 'media')
    fs.mkdirSync(mediaDir, { recursive: true })
    const wamid = msg.key?.id || ('inb_' + Date.now())
    // Sanitiza wamid (pode ter chars que dão problema em path)
    const safe = wamid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
    const filename = `${safe}.${ext}`
    fs.writeFileSync(path.join(mediaDir, filename), buffer)
    return { mediaType, filename, mimetype: node?.mimetype || null }
  } catch (e) {
    console.error('[unofficial] download media failed:', e?.message || e)
    return null
  }
}

// ─── Send media (image, audio, video, document) ──────────────────────────────
export async function sendMediaMessage(sessionId, rawPhone, opts, dataDir) {
  const entry = activeSessions.get(sessionId)
  if (!entry || entry.status !== 'connected') {
    throw new Error('Sessão não conectada')
  }
  const { type, buffer, caption, mimetype, filename } = opts
  if (!buffer || !buffer.length) throw new Error('buffer obrigatório')
  if (!type) throw new Error('type obrigatório')
  const digits = rawPhone.replace(/\D/g, '')
  const jid = digits + '@s.whatsapp.net'
  // Anti-ban: warmup cap + rate limit + WA check + presence
  if (dataDir) {
    await _enforcePairCooldown(sessionId, dataDir)
    await _enforceWarmup(sessionId, dataDir)
  }
  // NUCLEAR: throttle, onWhatsApp check, humanPresence desabilitados
  const isAudio = type === 'audio'

  let payload = null
  if (type === 'image') {
    payload = { image: buffer, caption: caption || undefined, mimetype: mimetype || 'image/jpeg' }
  } else if (type === 'audio') {
    // PTT (voice note) com codec opus — bate com Cloud API behavior
    payload = { audio: buffer, mimetype: mimetype || 'audio/ogg; codecs=opus', ptt: true }
  } else if (type === 'video') {
    payload = { video: buffer, caption: caption || undefined, mimetype: mimetype || 'video/mp4' }
  } else if (type === 'document') {
    payload = { document: buffer, mimetype: mimetype || 'application/octet-stream', fileName: filename || 'arquivo' }
  } else {
    throw new Error('Tipo de mídia inválido: ' + type)
  }
  const result = await entry.sock.sendMessage(jid, payload)
  return { wamid: result?.key?.id ?? null }
}

// ─── Metadata persistence ─────────────────────────────────────────────────────

function metaPath(dataDir, id) {
  return path.join(dataDir, id, 'meta.json')
}

export function readMeta(dataDir, id) {
  try { return JSON.parse(fs.readFileSync(metaPath(dataDir, id), 'utf8')) } catch { return null }
}

export function writeMeta(dataDir, id, data) {
  const dir = path.join(dataDir, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(metaPath(dataDir, id), JSON.stringify(data, null, 2))
}

export function listMetaIds(dataDir) {
  try {
    return fs.readdirSync(dataDir).filter(d => {
      const p = path.join(dataDir, d, 'meta.json')
      return fs.existsSync(p)
    })
  } catch { return [] }
}

export function deleteMeta(dataDir, id) {
  const dir = path.join(dataDir, id)
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

export async function startSession(id, dataDir, onUpdate, workspaceId) {
  // Se já existe um socket ativo, encerra antes
  const existing = activeSessions.get(id)
  if (existing?.sock) {
    try { existing.sock.end(undefined) } catch {}
    activeSessions.delete(id)
  }

  const sessDir = path.join(dataDir, id)
  fs.mkdirSync(path.join(sessDir, 'auth'), { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(path.join(sessDir, 'auth'))
  const { version } = await fetchLatestBaileysVersion()

  // Proxy per-session: lê de meta.json. Cada sessão pode usar IP residencial
  // diferente — protege número Flavia de correlação de IP com WABAs banidas.
  const meta = readMeta(dataDir, id) || {}
  const proxyUrl = meta.proxyUrl || null
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
  if (proxyUrl) {
    const sanitized = proxyUrl.replace(/:\/\/.*@/, '://***@')
    console.log(`[unofficial] Session ${id} using proxy: ${sanitized}`)
  }

  // ─── NUCLEAR: makeWASocket mínimo (debug "WhatsApp servidor rejeita") ──────
  // Removidas TODAS as configs custom anti-ban — só auth + version + logger + agent.
  // Se mensagens chegarem com essa config, problema era em alguma das configs removidas.
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    ...(agent ? { agent, fetchAgent: agent } : {}),
  })

  const entry = {
    sock,
    status: 'connecting',
    qrDataUrl: null,
    phoneNumber: null,
    reconnectAttempts: 0,
    workspaceId: workspaceId || null,
  }
  activeSessions.set(id, entry)

  sock.ev.on('creds.update', saveCreds)

  // ─── Inbound messages ─────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return // ignora history sync; só processa mensagens novas
    for (const msg of (messages || [])) {
      try {
        // Ignora mensagens próprias (echo de outbound)
        if (msg.key?.fromMe) continue
        // Ignora grupos/broadcast por enquanto (sufixo @g.us / @broadcast)
        const remoteJid = msg.key?.remoteJid || ''
        if (!remoteJid.endsWith('@s.whatsapp.net')) continue
        const from = remoteJid.split('@')[0]
        const wamid = msg.key?.id || null
        const timestamp = typeof msg.messageTimestamp === 'number'
          ? msg.messageTimestamp
          : (msg.messageTimestamp?.low || Math.floor(Date.now() / 1000))
        // Extrai conteúdo conforme tipo
        const m = msg.message || {}
        let text = m.conversation
          || m.extendedTextMessage?.text
          || m.imageMessage?.caption
          || m.videoMessage?.caption
          || m.documentMessage?.caption
          || null
        let mediaType = null
        if (m.imageMessage) mediaType = 'image'
        else if (m.audioMessage) mediaType = 'audio'
        else if (m.videoMessage) mediaType = 'video'
        else if (m.documentMessage) mediaType = 'document'
        else if (m.stickerMessage) mediaType = 'sticker'
        else if (m.locationMessage) mediaType = 'location'
        // Sem text e sem media reconhecido — pula
        if (!text && !mediaType) continue
        // Se houver mídia (exceto location), baixa e persiste no volume
        let mediaFilename = null, mediaMimetype = null
        if (mediaType && mediaType !== 'location') {
          const dl = await downloadAndPersistMedia(sock, msg, id, dataDir)
          if (dl) {
            mediaFilename = dl.filename
            mediaMimetype = dl.mimetype
          }
        }
        await postWebhook({
          type: 'inbound',
          sessionId: id,
          workspaceId: entry.workspaceId,
          from,
          wamid,
          text,
          mediaType,
          mediaFilename,
          mediaMimetype,
          timestamp,
          profileName: msg.pushName || null,
        })
      } catch (err) {
        console.error('Error processing inbound message:', err.message)
      }
    }
  })

  // ─── Outbound message status updates (delivered/read) ─────────────────────
  // Baileys reporta status changes em DOIS eventos diferentes:
  //  1) messages.update — quando o status muda (numérico 2=DELIVERED, 3=READ, 4=PLAYED)
  //  2) message-receipt.update — quando receipts chegam do recipient
  // Implementamos os dois pra cobrir todas as variantes do Baileys.
  sock.ev.on('messages.update', async (updates) => {
    for (const upd of (updates || [])) {
      try {
        const wamid = upd.key?.id
        const statusNum = upd.update?.status
        console.log('[unofficial] messages.update', { wamid, statusNum })
        if (!wamid || statusNum == null) continue
        const mappedStatus = mapBaileysStatus(statusNum)
        if (!mappedStatus) continue
        await postWebhook({
          type: 'status',
          sessionId: id,
          wamid,
          status: mappedStatus,
        })
      } catch (err) {
        console.error('Error processing messages.update:', err.message)
      }
    }
  })

  sock.ev.on('message-receipt.update', async (updates) => {
    for (const upd of (updates || [])) {
      try {
        const wamid = upd.key?.id
        const fromMe = upd.key?.fromMe
        // Só importa receipts pras NOSSAS mensagens (outbound)
        if (!fromMe || !wamid) continue
        const receipt = upd.receipt || {}
        // Prioriza READ > DELIVERED. Baileys mantém os timestamps separadamente.
        let mappedStatus = null
        if (receipt.readTimestamp || receipt.playedTimestamp) mappedStatus = 'READ'
        else if (receipt.receiptTimestamp) mappedStatus = 'DELIVERED'
        console.log('[unofficial] message-receipt.update', { wamid, fromMe, mappedStatus, receipt })
        if (!mappedStatus) continue
        await postWebhook({
          type: 'status',
          sessionId: id,
          wamid,
          status: mappedStatus,
        })
      } catch (err) {
        console.error('Error processing message-receipt.update:', err.message)
      }
    }
  })

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications }) => {
    const dcCode = lastDisconnect?.error?.output?.statusCode;
    const dcMsg = lastDisconnect?.error?.message;
    const sid = id.slice(0,8);
    console.log(`[unofficial][${sid}] cu connection=${connection} qr=${!!qr} isNewLogin=${isNewLogin} pending=${receivedPendingNotifications} dcCode=${dcCode} dcMsg=${dcMsg}`);
    if (qr) {
      entry.qrDataUrl = await QRCode.toDataURL(qr, { scale: 8, margin: 2 })
      entry.status = 'qr'
      onUpdate(id, { sessionStatus: 'qr', qrDataUrl: entry.qrDataUrl })
      return
    }

    if (connection === 'open') {
      entry.status = 'connected'
      entry.qrDataUrl = null
      entry.reconnectAttempts = 0
      const rawId = sock.user?.id || ''
      entry.phoneNumber = rawId.split(':')[0].split('@')[0]
      // Anti-ban warmup: marca pairedAt na primeira conexao bem sucedida
      let isFirstPair = false
      try {
        const m = readMeta(dataDir, id) || {}
        if (!m.pairedAt) {
          m.pairedAt = new Date().toISOString()
          writeMeta(dataDir, id, m)
          isFirstPair = true
        }
      } catch {}
      onUpdate(id, { sessionStatus: 'connected', phoneNumber: entry.phoneNumber })
      // NUCLEAR: post-pair handshake desabilitado
      return
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error)?.output?.statusCode
      const isLoggedOut = code === DisconnectReason.loggedOut

      if (isLoggedOut) {
        entry.status = 'logged_out'
        onUpdate(id, { sessionStatus: 'logged_out' })
        activeSessions.delete(id)
        return
      }

      if (entry.reconnectAttempts < 5) {
        entry.reconnectAttempts++
        entry.status = 'reconnecting'
        onUpdate(id, { sessionStatus: 'reconnecting' })
        setTimeout(() => startSession(id, dataDir, onUpdate).catch(() => {}), 4000)
        return
      }

      entry.status = 'disconnected'
      onUpdate(id, { sessionStatus: 'disconnected' })
      activeSessions.delete(id)
    }
  })

  return entry
}

export async function disconnectSession(id) {
  const entry = activeSessions.get(id)
  if (!entry) return
  try {
    await entry.sock.logout()
  } catch {
    try { entry.sock.end(undefined) } catch {}
  }
  activeSessions.delete(id)
}

export function getActiveSession(id) {
  return activeSessions.get(id) || null
}

export function getActiveSessionIds() {
  return [...activeSessions.keys()]
}

// ─── Profile picture ──────────────────────────────────────────────────────────

export async function fetchProfilePictureDataUrl(sessionId, rawPhone) {
  const entry = activeSessions.get(sessionId)
  if (!entry || entry.status !== 'connected') {
    throw new Error('Sessão não conectada')
  }

  const digits = rawPhone.replace(/\D/g, '')

  // Monta JIDs candidatos sem chamar onWhatsApp (evita chamada extra ao servidor WA)
  // Tenta direto no profilePictureUrl — se não existe ou é privado, retorna null/lança
  const jidCandidates = [digits + '@s.whatsapp.net']
  if (digits.startsWith('55') && digits.length >= 12) {
    // DDI 55 presente: tenta sem DDI
    jidCandidates.push(digits.slice(2) + '@s.whatsapp.net')
    // Tenta também formato antigo BR (sem o 9 extra após o DDD)
    const sem55 = digits.slice(2)
    if (sem55.length === 11 && sem55[2] === '9') {
      jidCandidates.push('55' + sem55.slice(0,2) + sem55.slice(3) + '@s.whatsapp.net')
    }
  } else if (digits.length === 11 && digits[2] === '9') {
    // Número BR sem DDI (DDD 2 dig + 9 + 8 dig): tenta com DDI e formato antigo
    jidCandidates.push('55' + digits + '@s.whatsapp.net')
    jidCandidates.push('55' + digits.slice(0,2) + digits.slice(3) + '@s.whatsapp.net')
  } else if (digits.length === 10) {
    // Número BR antigo sem DDI (DDD 2 dig + 8 dig): tenta com DDI
    jidCandidates.push('55' + digits + '@s.whatsapp.net')
  }

  let picUrl = null
  for (const jid of jidCandidates) {
    try {
      picUrl = await entry.sock.profilePictureUrl(jid, 'image')
      if (picUrl) break
    } catch {}
  }

  if (!picUrl) return null

  // Baixa a imagem e converte para base64 data URL (URL do WhatsApp expira rapidamente)
  try {
    const res = await fetch(picUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = res.headers.get('content-type') || 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// ─── Send text message ────────────────────────────────────────────────────────

export async function sendTextMessage(sessionId, rawPhone, text, dataDir) {
  const entry = activeSessions.get(sessionId)
  if (!entry || entry.status !== 'connected') {
    throw new Error('Sessão não conectada')
  }
  const digits = rawPhone.replace(/\D/g, '')
  const jid = digits + '@s.whatsapp.net'
  // Anti-ban: warmup cap + rate limit + WA check + presence
  if (dataDir) {
    await _enforcePairCooldown(sessionId, dataDir)
    await _enforceWarmup(sessionId, dataDir)
  }
  // NUCLEAR: throttle, onWhatsApp check e humanPresence desabilitados
  // await _throttle(sessionId)
  // const exists = await _ensureOnWhatsApp(entry.sock, sessionId, jid)
  // if (!exists) throw new Error('Numero nao tem WhatsApp')
  // await _humanPresence(entry.sock, jid, (text || '').length, false)
  const result = await entry.sock.sendMessage(jid, { text })
  return { wamid: result?.key?.id ?? null }
}

// ─── Mark messages as read (anti-ban: leitor passivo é bandeira) ─────────────
export async function markMessagesRead(sessionId, messageKeys) {
  const entry = activeSessions.get(sessionId)
  if (!entry || entry.status !== 'connected') {
    throw new Error('Sessão não conectada')
  }
  if (!Array.isArray(messageKeys) || messageKeys.length === 0) return { ok: true, count: 0 }
  // Cada key precisa ser objeto Baileys { remoteJid, fromMe, id, participant? }
  await entry.sock.readMessages(messageKeys)
  return { ok: true, count: messageKeys.length }
}
