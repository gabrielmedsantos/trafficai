import express from 'express'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {

  startSession,
  disconnectSession,
  getActiveSession,
  fetchProfilePictureDataUrl,
  sendTextMessage,
  sendMediaMessage,
  markMessagesRead,
  readMeta,
  writeMeta,
  listMetaIds,
  deleteMeta,
} from './sessions.js'

// Global error handlers — Baileys throws unhandledRejection when sendPassiveIq times out
// behind a residential proxy. Without these, the process crashes and kills every session.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const code = reason?.output?.statusCode || reason?.code;
  console.error('[unofficial][unhandledRejection]', code || '', msg);
});
process.on('uncaughtException', (err) => {
  console.error('[unofficial][uncaughtException]', err?.message || err, err?.stack);
});


const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT      = parseInt(process.env.PORT || '3002', 10)
const JWT_SECRET = process.env.JWT_SECRET
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, '../../data/sessions')

if (!JWT_SECRET) {
  console.error('[unofficial] JWT_SECRET env var is required')
  process.exit(1)
}

const app = express()
// Limite alto pra suportar mídia base64 (image até ~20MB, audio até ~16MB).
// Cloud API tem limite 100MB total mas Baileys gerencia bem com 30MB.
app.use(express.json({ limit: '30mb' }))

// ─── Auth middleware ──────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Token obrigatório' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}

app.use(authMiddleware)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSession(meta, activeEntry) {
  return {
    id:            meta.id,
    name:          meta.name,
    workspaceId:   meta.workspaceId,
    sessionStatus: activeEntry?.status ?? meta.lastStatus ?? 'disconnected',
    phone_number:  activeEntry?.phoneNumber ?? meta.phoneNumber ?? null,
    qrDataUrl:     (activeEntry?.status === 'qr') ? activeEntry.qrDataUrl : null,
    createdAt:     meta.createdAt,
    proxyUrl:      meta.proxyUrl ?? null,
    proxyLabel:    meta.proxyLabel ?? null,
    proxyCountry:  meta.proxyCountry ?? null,
    pairedAt:      meta.pairedAt ?? null,
    antibanEnabled: meta.antibanEnabled !== false, // default true
  }
}

function onStatusUpdate(id, patch) {
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return
  if (patch.sessionStatus) meta.lastStatus = patch.sessionStatus
  if (patch.phoneNumber)   meta.phoneNumber = patch.phoneNumber
  writeMeta(DATA_DIR, id, meta)
}

// ─── On startup: reconnect sessions that were previously connected ─────────────

async function restoreActiveSessions() {
  const ids = listMetaIds(DATA_DIR)
  for (const id of ids) {
    const meta = readMeta(DATA_DIR, id)
    if (!meta) continue
    const wasConnected = meta.lastStatus === 'connected' || meta.lastStatus === 'reconnecting'
    if (wasConnected) {
      console.log(`[unofficial] Restaurando sessão: ${meta.name} (${id})`)
      // Passa workspaceId pra startSession — listeners de inbound precisam dele
      // pro webhook chegar no api com workspace correto e auto-criar lead/contact certo.
      startSession(id, DATA_DIR, onStatusUpdate, meta.workspaceId).catch(e =>
        console.error(`[unofficial] Erro ao restaurar sessão ${id}:`, e.message)
      )
    }
  }
}

restoreActiveSessions()

// ─── Routes ───────────────────────────────────────────────────────────────────

// Ownership check: only enforce if workspaceId is stored in meta (JWT may not carry it)
function ownerCheck(meta, reqUser) {
  if (!meta.workspaceId) return true          // sem workspaceId salvo → acesso liberado
  if (!reqUser.workspaceId) return true       // JWT sem workspaceId → acesso liberado
  return meta.workspaceId === reqUser.workspaceId
}

// GET /sessions — listar sessões do workspace
app.get('/sessions', (req, res) => {
  const ids = listMetaIds(DATA_DIR)
  const result = []
  for (const id of ids) {
    const meta = readMeta(DATA_DIR, id)
    if (!meta) continue
    if (!ownerCheck(meta, req.user)) continue
    result.push(buildSession(meta, getActiveSession(id)))
  }
  res.json(result)
})

// POST /sessions — criar sessão (aceita id customizado; faz upsert se já existir)
app.post('/sessions', (req, res) => {
  const { name, id: customId, proxyUrl, proxyLabel, proxyCountry } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' })

  // Se passou um id customizado, verifica se já existe
  if (customId?.trim()) {
    const existing = readMeta(DATA_DIR, customId.trim())
    if (existing) {
      if (!ownerCheck(existing, req.user)) return res.status(403).json({ error: 'Acesso negado' })
      return res.status(200).json(buildSession(existing, getActiveSession(existing.id)))
    }
  }

  const id = customId?.trim() || uuidv4()
  const meta = {
    id,
    name:        name.trim(),
    workspaceId: req.user.workspaceId || null,
    lastStatus:  'disconnected',
    phoneNumber: null,
    createdAt:   new Date().toISOString(),
    proxyUrl:    proxyUrl?.trim() || null,
    proxyLabel:  proxyLabel?.trim() || null,
    proxyCountry: proxyCountry?.trim() || null,
  }
  writeMeta(DATA_DIR, id, meta)

  res.status(201).json(buildSession(meta, null))
})

// POST /sessions/:id/start — iniciar conexão (gera QR)
app.post('/sessions/:id/start', async (req, res) => {
  const { id } = req.params
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })

  try {
    // Passa workspaceId pro startSession (precisa pros listeners de inbound montarem webhook)
    const entry = await startSession(id, DATA_DIR, onStatusUpdate, meta.workspaceId)
    // Aguarda até 8s para aparecer QR ou conectar
    await new Promise(resolve => setTimeout(resolve, 2000))
    const current = getActiveSession(id)
    res.json({
      status:    current?.status ?? 'connecting',
      qrDataUrl: current?.status === 'qr' ? current.qrDataUrl : null,
    })
  } catch (e) {
    console.error(`[unofficial] Erro ao iniciar sessão ${id}:`, e.message)
    res.status(500).json({ error: e.message })
  }
})

// GET /sessions/:id/qr — polling do QR code
app.get('/sessions/:id/qr', (req, res) => {
  const { id } = req.params
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })

  const entry = getActiveSession(id)
  res.json({
    status:    entry?.status ?? meta.lastStatus ?? 'disconnected',
    qrDataUrl: entry?.status === 'qr' ? entry.qrDataUrl : null,
  })
})

// POST /sessions/:id/disconnect — desconectar do WhatsApp
app.post('/sessions/:id/disconnect', async (req, res) => {
  const { id } = req.params
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })

  try {
    await disconnectSession(id)
    meta.lastStatus = 'disconnected'
    meta.phoneNumber = null
    writeMeta(DATA_DIR, id, meta)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /sessions/:id — remover sessão completamente
app.delete('/sessions/:id', async (req, res) => {
  const { id } = req.params
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })

  try { await disconnectSession(id) } catch {}
  deleteMeta(DATA_DIR, id)
  res.status(204).send()
})

// GET /sessions/:id/profile-pic/:phone — buscar foto de perfil
// Retorna { dataUrl: 'data:image/jpeg;base64,...' } ou { dataUrl: null }
app.get('/sessions/:id/profile-pic/:phone', async (req, res) => {
  const { id, phone } = req.params
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })

  try {
    const dataUrl = await fetchProfilePictureDataUrl(id, phone)
    res.json({ dataUrl })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

// POST /sessions/:id/send-text — enviar mensagem de texto
app.post('/sessions/:id/send-text', async (req, res) => {
  const { id } = req.params
  const { phone, text } = req.body
  if (!phone || !text) return res.status(400).json({ error: 'phone e text obrigatórios' })

  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })

  try {
    const result = await sendTextMessage(id, phone, text, DATA_DIR)
    res.json({ ok: true, wamid: result?.wamid ?? null })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

// POST /sessions/:id/mark-read — anti-ban: marca mensagens como lidas
app.post('/sessions/:id/mark-read', async (req, res) => {
  const { id } = req.params
  const { messageKeys } = req.body || {}
  const entry = getActiveSession(id)
  if (!entry || entry.status !== 'connected') {
    return res.status(409).json({ error: 'Sessao nao conectada' })
  }
  if (!ownerCheck({ workspaceId: entry.workspaceId }, req.user)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  try {
    const result = await markMessagesRead(id, messageKeys)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /sessions/:id/send-media — enviar imagem/áudio/vídeo/documento
// Body JSON: { phone, type: 'image'|'audio'|'video'|'document', dataBase64, mimetype?, caption?, filename? }
app.post('/sessions/:id/send-media', async (req, res) => {
  const { id } = req.params
  const { phone, type, dataBase64, mimetype, caption, filename } = req.body || {}
  if (!phone || !type || !dataBase64) {
    return res.status(400).json({ error: 'phone, type e dataBase64 obrigatórios' })
  }
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })

  try {
    const buffer = Buffer.from(dataBase64, 'base64')
    const result = await sendMediaMessage(id, phone, { type, buffer, mimetype, caption, filename }, DATA_DIR)
    res.json({ ok: true, wamid: result?.wamid ?? null })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

// PATCH /sessions/:id/proxy — atualiza proxy da sessão. Requer restart pra aplicar.
app.patch('/sessions/:id/proxy', async (req, res) => {
  const { id } = req.params
  const { proxyUrl, proxyLabel, proxyCountry } = req.body || {}
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })
  meta.proxyUrl    = proxyUrl?.trim() || null
  meta.proxyLabel  = proxyLabel?.trim() || null
  meta.proxyCountry = proxyCountry?.trim() || null
  writeMeta(DATA_DIR, id, meta)
  res.json({ ok: true, restartRequired: true, ...buildSession(meta, getActiveSession(id)) })
})

// PATCH /sessions/:id/antiban — liga/desliga proteções anti-ban da sessão
app.patch('/sessions/:id/antiban', async (req, res) => {
  const { id } = req.params
  const { enabled } = req.body || {}
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (bool) obrigatório' })
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })
  meta.antibanEnabled = enabled
  writeMeta(DATA_DIR, id, meta)
  res.json({ ok: true, ...buildSession(meta, getActiveSession(id)) })
})

// GET /sessions/:id/media/:filename — serve mídia inbound do volume
app.get('/sessions/:id/media/:filename', (req, res) => {
  const { id, filename } = req.params
  const meta = readMeta(DATA_DIR, id)
  if (!meta) return res.status(404).json({ error: 'Sessão não encontrada' })
  if (!ownerCheck(meta, req.user)) return res.status(403).json({ error: 'Acesso negado' })
  // Sanitiza filename pra prevenir path traversal
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'filename inválido' })
  }
  const filepath = path.join(DATA_DIR, id, 'media', filename)
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'arquivo não encontrado' })
  res.sendFile(path.resolve(filepath))
})

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ ok: true }))

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[unofficial] Serviço rodando na porta ${PORT}`)
  console.log(`[unofficial] DATA_DIR: ${DATA_DIR}`)
})
