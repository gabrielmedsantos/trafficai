// inbox.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

// State de scroll do chat — usado por core.js (renderFinal) e inbox.js.
// Originalmente extraído pro leads.js por adjacência (PR 6), movido pra cá
// no PR 19 quando leads virou lazy (core lê _chatAtBottom em todo render).
var _chatAtBottom = true

function renderMessageContent(m, isOut, leadId) {
  // Tenta detectar tipo de mídia via metaResponse ANTES de usar messageContent como texto puro
  // (messageContent para arquivos é apenas fallback de texto ex: "📄 arquivo.pdf")
  const meta = m.metaResponse || {}

  // INBOUND WhatsApp: meta.type definido diretamente ('image', 'audio', 'video', 'document', 'sticker', 'voice')
  // INBOUND Telegram: meta NÃO tem campo type — detectar pela presença das chaves (voice/audio/photo/video/document/sticker)
  // OUTBOUND: meta pode ser a resposta da API Meta (sem type útil) ou o payload enviado
  let mediaType = meta.type || null
  if (!mediaType && m.channel === 'TELEGRAM') {
    if (meta.voice) mediaType = 'voice'
    else if (meta.audio) mediaType = 'audio'
    else if (Array.isArray(meta.photo)) mediaType = 'image'
    else if (meta.video || meta.video_note) mediaType = 'video'
    else if (meta.document) mediaType = 'document'
    else if (meta.sticker) mediaType = 'sticker'
  }

  if (mediaType === 'image' || mediaType === 'sticker') {
    const caption = meta.image?.caption || meta.sticker?.caption || ''
    if (m.direction === 'INBOUND') {
      const mediaUrl = `${API}/${encodeURIComponent(leadId)}/messages/${encodeURIComponent(m.id)}/media`
      const imgId = `authimg-${m.id}`
      const fbId  = `authfb-${m.id}`
      return `<div>
        <img id="${imgId}" data-authsrc="${mediaUrl}" alt="Imagem"
          class="rounded-xl cursor-zoom-in block bg-gray-100"
          style="width:100%;max-width:280px;height:180px;object-fit:cover;display:block"
          onclick="openImageModal(this.src)"/>
        <a id="${fbId}" style="display:none"
          class="flex items-center gap-1.5 text-sm opacity-80 underline cursor-pointer"
          onclick="loadAuthImageDirect('${mediaUrl}')">📷 Imagem</a>
        ${caption ? `<p class="text-xs mt-1 opacity-75">${esc(caption)}</p>` : ''}
      </div>`
    }
    // OUTBOUND — preview otimista (blob URL) ou miniatura via API
    const previewUrl = meta._previewUrl || null
    const mediaUrl = previewUrl || `${API}/${encodeURIComponent(leadId)}/messages/${encodeURIComponent(m.id)}/media`
    const isSending = m.status === 'SENDING'
    return `<div style="position:relative">
      <img src="${previewUrl ? previewUrl : ''}" data-authsrc="${previewUrl ? '' : mediaUrl}" alt="Imagem"
        class="rounded-xl cursor-zoom-in block bg-gray-100"
        style="width:100%;max-width:240px;height:160px;object-fit:cover;display:block;${isSending?'opacity:0.7':''}"
        onclick="${previewUrl ? `openImageModal('${previewUrl}')` : `openImageModal(this.src)`}"/>
      ${isSending ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(0,0,0,0.15)"><svg style="width:20px;height:20px;animation:spin 0.8s linear infinite;color:white" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.3" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.9" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg></div>` : ''}
      ${caption ? `<p class="text-xs mt-1 opacity-75">${esc(caption)}</p>` : ''}
    </div>`
  }

  if (mediaType === 'video') {
    if (m.direction === 'INBOUND') {
      const mediaUrl = `${API}/${encodeURIComponent(leadId)}/messages/${encodeURIComponent(m.id)}/media`
      const caption = meta.video?.caption || ''
      return `<div>
        <video id="authvid-${m.id}" data-authvideo="${mediaUrl}" controls class="max-w-full rounded-xl" style="max-height:200px;display:none" preload="none"></video>
        <a id="authvidfb-${m.id}" href="#" onclick="loadAuthVideoDirect('${mediaUrl}','${m.id}');return false" style="font-size:12px;opacity:0.7">🎥 Carregar vídeo</a>
        ${caption ? `<p class="text-xs mt-1 opacity-75">${esc(caption)}</p>` : ''}
      </div>`
    }
    return `<span class="text-sm opacity-80">🎥 Vídeo</span>`
  }

  if (mediaType === 'audio' || mediaType === 'voice') {
    const mediaUrl = `${API}/${encodeURIComponent(leadId)}/messages/${encodeURIComponent(m.id)}/media`
    const pid = `audio-player-${m.id}`
    return `<div id="${pid}" data-authaudio="${mediaUrl}" class="audio-player audio-bubble">
      <button type="button" onclick="audioToggle('${pid}')" class="audio-play-btn">
        <svg class="audio-icon-play" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <svg class="audio-icon-pause hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      </button>
      <div class="audio-progress-bar" onclick="audioSeek('${pid}', event)">
        <div class="audio-wave-base">${_AUDIO_BARS}</div>
        <div class="audio-progress" style="width:0%"><div class="audio-wave-fill">${_AUDIO_BARS}</div></div>
      </div>
      <span class="audio-time">0:00</span>
      <span class="audio-duration">0:00</span>
    </div>`
  }

  if (mediaType === 'document') {
    const fname = meta.document?.filename || meta.document?.name || 'documento'
    const caption = meta.document?.caption || ''
    const ext = fname.split('.').pop().toLowerCase()
    const docIcon = ext === 'pdf'
      ? `<svg class="w-8 h-8 shrink-0 text-red-400" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 13.5h1.8c.9 0 1.5.5 1.5 1.3s-.6 1.3-1.5 1.3H9.4v1.1H8.5v-3.7zm.9.7v1.2h.8c.4 0 .7-.2.7-.6s-.3-.6-.7-.6h-.8zm3.2-.7h1.6c1.1 0 1.8.7 1.8 1.8s-.7 1.9-1.8 1.9h-1.6v-3.7zm.9.7v2.2h.7c.6 0 1-.4 1-1.1s-.4-1.1-1-1.1h-.7zm3.3-.7h2.4v.7h-1.5v.8h1.3v.7h-1.3v1.5h-.9v-3.7z"/></svg>`
      : `<svg class="w-8 h-8 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`
    if (m.direction === 'INBOUND') {
      const mediaUrl = `${API}/${encodeURIComponent(leadId)}/messages/${encodeURIComponent(m.id)}/media`
      const docId = `authdoc-${m.id}`
      return `<div id="${docId}" data-authdoc="${mediaUrl}" data-docname="${esc(fname)}" class="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity" onclick="openAuthDoc('${docId}')">
        ${docIcon}
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium opacity-90 truncate">${esc(fname)}</p>
          ${caption ? `<p class="text-xs opacity-70 mt-0.5">${esc(caption)}</p>` : ''}
          <p class="text-[10px] opacity-50 mt-0.5 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Clique para abrir
          </p>
        </div>
      </div>`
    }
    // OUTBOUND: usa mesma URL autenticada para permitir download
    const mediaUrl = `${API}/${encodeURIComponent(leadId)}/messages/${encodeURIComponent(m.id)}/media`
    const docId = `authdoc-${m.id}`
    return `<div id="${docId}" data-authdoc="${mediaUrl}" data-docname="${esc(fname)}" class="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity" onclick="openAuthDoc('${docId}')">
      ${docIcon}
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium opacity-90 truncate">${esc(fname)}</p>
        ${caption ? `<p class="text-xs opacity-70 mt-0.5">${esc(caption)}</p>` : ''}
        <p class="text-[10px] opacity-50 mt-0.5 flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Clique para abrir
        </p>
      </div>
    </div>`
  }

  if (mediaType === 'contacts' || m.messageContent?.startsWith('👤 ')) {
    // Parse contact info from saved messageContent: "👤 Name · Phone"
    let cName = '', cPhone = ''
    if (mediaType === 'contacts' && meta.contacts?.length) {
      const c = meta.contacts[0]
      cName = c.name?.formatted_name || c.name?.first_name || 'Contato'
      cPhone = c.phones?.[0]?.phone || ''
    } else if (m.messageContent?.startsWith('👤 ')) {
      const parts = m.messageContent.slice(2).trim().split(' · ')
      cName = parts[0] || 'Contato'
      cPhone = parts[1] || ''
    }
    // Adapta contraste: outbound bubble tem fundo gradient indigo (texto branco),
    // inbound bubble tem fundo claro (texto escuro)
    const headerBg   = isOut ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.04)'
    const avatarBg   = isOut ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)'
    const avatarOpac = isOut ? '0.85' : '0.5'
    const subColor   = isOut ? 'rgba(255,255,255,0.78)' : 'inherit'
    const subOpac    = isOut ? '1' : '0.6'
    const cardBorder = isOut ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.08)'
    const innerBorder= isOut ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.06)'
    const btnColor   = isOut ? '#fff' : 'var(--accent)'
    const btnHoverBg = isOut ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.04)'
    return `<div style="display:flex;flex-direction:column;min-width:200px;max-width:260px;border-radius:12px;overflow:hidden;border:${cardBorder}">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${headerBg}">
        <div style="width:38px;height:38px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg style="width:20px;height:20px;opacity:${avatarOpac}" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <div style="min-width:0">
          <p style="font-size:14px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cName)}</p>
          ${cPhone ? `<p style="font-size:11px;color:${subColor};opacity:${subOpac};margin:1px 0 0">${esc(fmtPhone(cPhone))}</p>` : ''}
        </div>
      </div>
      <div style="display:flex;border-top:1px solid ${innerBorder}">
        ${cPhone ? `<button onclick="startConvFromContact('${esc(cPhone.replace(/\D/g,''))}')" style="flex:1;padding:8px;font-size:12px;font-weight:600;color:${btnColor};background:transparent;border:none;cursor:pointer;text-align:center" onmouseover="this.style.background='${btnHoverBg}'" onmouseout="this.style.background='transparent'">Conversar</button>` : ''}
        ${cPhone ? `<div style="width:1px;background:${innerBorder}"></div>` : ''}
        <button onclick="copyToClipboard('${esc(cPhone.replace(/\D/g,''))}','Telefone copiado')" style="flex:1;padding:8px;font-size:12px;font-weight:600;color:${btnColor};background:transparent;border:none;cursor:pointer;text-align:center" onmouseover="this.style.background='${btnHoverBg}'" onmouseout="this.style.background='transparent'">Copiar</button>
      </div>
    </div>`
  }

  if (mediaType === 'location') {
    const lat = meta.location?.latitude, lng = meta.location?.longitude
    const name = meta.location?.name || ''
    const addr = meta.location?.address || ''
    const label = [name, addr].filter(Boolean).join(', ') || `${lat}, ${lng}`
    const mapsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null
    return `<div class="flex items-center gap-1.5">
      <span class="text-lg">📍</span>
      <div>${mapsUrl
        ? `<a href="${mapsUrl}" target="_blank" rel="noopener" class="text-sm underline opacity-90">${esc(label)}</a>`
        : `<span class="text-sm opacity-80">${esc(label)}</span>`}
      </div>
    </div>`
  }

  if (mediaType === 'reaction') {
    const emoji = meta.reaction?.emoji || '👍'
    return `<span class="text-2xl">${esc(emoji)}</span>`
  }

  // Fallback: tenta inferir do payload OUTBOUND
  const outType = meta.image ? 'image' : meta.video ? 'video' : meta.audio ? 'audio' : meta.document ? 'document' : null
  if (outType === 'image')    return `<span class="text-sm opacity-80">📷 Imagem</span>`
  if (outType === 'video')    return `<span class="text-sm opacity-80">🎥 Vídeo</span>`
  if (outType === 'audio') {
    // Áudio OUTBOUND: usa blob local se disponível (otimista), senão proxy autenticado
    const mediaUrl = meta._localBlobUrl || `${API}/${encodeURIComponent(leadId)}/messages/${encodeURIComponent(m.id)}/media`
    const pid = `audio-player-${m.id}`
    return `<div id="${pid}" data-authaudio="${mediaUrl}" class="audio-player audio-bubble">
      <button type="button" onclick="audioToggle('${pid}')" class="audio-play-btn">
        <svg class="audio-icon-play" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <svg class="audio-icon-pause hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      </button>
      <div class="audio-progress-bar" onclick="audioSeek('${pid}', event)">
        <div class="audio-wave-base">${_AUDIO_BARS}</div>
        <div class="audio-progress" style="width:0%"><div class="audio-wave-fill">${_AUDIO_BARS}</div></div>
      </div>
      <span class="audio-time">0:00</span>
      <span class="audio-duration">0:00</span>
    </div>`
  }
  if (outType === 'document') {
    const fname = meta.document?.filename || meta.document?.name || 'Documento'
    const mediaUrl = `${API}/${encodeURIComponent(leadId)}/messages/${encodeURIComponent(m.id)}/media`
    const docId = `authdoc-${m.id}`
    const ext = fname.split('.').pop().toLowerCase()
    const docIcon = ext === 'pdf'
      ? `<svg class="w-8 h-8 shrink-0 text-red-400" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 13.5h1.8c.9 0 1.5.5 1.5 1.3s-.6 1.3-1.5 1.3H9.4v1.1H8.5v-3.7zm.9.7v1.2h.8c.4 0 .7-.2.7-.6s-.3-.6-.7-.6h-.8zm3.2-.7h1.6c1.1 0 1.8.7 1.8 1.8s-.7 1.9-1.8 1.9h-1.6v-3.7zm.9.7v2.2h.7c.6 0 1-.4 1-1.1s-.4-1.1-1-1.1h-.7zm3.3-.7h2.4v.7h-1.5v.8h1.3v.7h-1.3v1.5h-.9v-3.7z"/></svg>`
      : `<svg class="w-8 h-8 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`
    return `<div id="${docId}" data-authdoc="${mediaUrl}" data-docname="${esc(fname)}" class="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity" onclick="openAuthDoc('${docId}')">
      ${docIcon}
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium opacity-90 truncate">${esc(fname)}</p>
        <p class="text-[10px] opacity-50 mt-0.5 flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Clique para abrir
        </p>
      </div>
    </div>`
  }

  // Nenhum tipo de mídia detectado — usa texto se disponível
  if (m.messageContent) {
    return `<p class="text-sm break-words whitespace-pre-wrap leading-relaxed">${esc(m.messageContent)}</p>`
  }

  const msgType = m.metaResponse?.type
  const typeLabel = msgType === 'image' ? '📷 Imagem' : msgType === 'video' ? '🎥 Vídeo' : msgType === 'audio' ? '🎵 Áudio' : msgType === 'document' ? '📄 Documento' : msgType === 'sticker' ? '🖼 Sticker' : msgType === 'button' ? `🔘 ${m.metaResponse?.button?.text ?? 'Botão'}` : msgType === 'interactive' ? '📋 Interativo' : msgType ? `[${msgType}]` : '📎 Arquivo'
  return `<span class="text-sm opacity-60 italic">${typeLabel}</span>`
}

function renderOriginBadge(origin) {
  if (!origin) return `<span style="color:#d1d5db;font-size:12px">—</span>`

  // Mapa de valores técnicos → labels amigáveis
  const LABEL_MAP = {
    'csv_import':   'CSV',
    'csv':          'CSV',
    'whatsapp':     'WhatsApp',
    'wpp':          'WhatsApp',
    'api':          'API',
    'manual':       'Manual',
  }
  const key = origin.toLowerCase().trim()
  // Fallback: substitui _ e - por espaço, title-case
  const friendly = LABEL_MAP[key]
    ?? origin.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()

  const o = friendly.toLowerCase().trim()

  // Known sources: [match terms, bg, text, border, icon SVG path or emoji-like SVG]
  const KNOWN = [
    {
      keys: ['instagram','insta','ig'],
      bg:'#fce7f3', tx:'#9d174d', bd:'#fbcfe8',
      icon:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    },
    {
      keys: ['facebook','fb'],
      bg:'#dbeafe', tx:'#1e40af', bd:'#bfdbfe',
      icon:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    },
    {
      keys: ['whatsapp','wpp','zap','whats'],
      bg:'#dcfce7', tx:'#166534', bd:'#bbf7d0',
      icon:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
    },
    {
      keys: ['google','adwords','google ads','gads'],
      bg:'#fef9c3', tx:'#854d0e', bd:'#fde68a',
      icon:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>`,
    },
    {
      keys: ['tiktok','tik tok','tik-tok'],
      bg:'#f3e8ff', tx:'#6b21a8', bd:'#e9d5ff',
      icon:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9a8.18 8.18 0 004.78 1.52V7.08a4.84 4.84 0 01-1.01-.39z"/></svg>`,
    },
    {
      keys: ['linkedin','linked in'],
      bg:'#dbeafe', tx:'#1d4ed8', bd:'#93c5fd',
      icon:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    },
    {
      keys: ['youtube','yt','you tube'],
      bg:'#fee2e2', tx:'#991b1b', bd:'#fca5a5',
      icon:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>`,
    },
    {
      keys: ['site','website','landing','lp','landing page'],
      bg:'#e0e7ff', tx:'#3730a3', bd:'#c7d2fe',
      icon:`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
    },
    {
      keys: ['indicação','indicacao','indicaçao','referral','referência','referencia','amigo','amigos'],
      bg:'#fce7f3', tx:'#be185d', bd:'#fbcfe8',
      icon:`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
    },
    {
      keys: ['email','e-mail','newsletter'],
      bg:'#f0fdf4', tx:'#166534', bd:'#bbf7d0',
      icon:`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`,
    },
    {
      keys: ['sms','telegram','telegram'],
      bg:'#eff6ff', tx:'#1d4ed8', bd:'#bfdbfe',
      icon:`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`,
    },
    {
      keys: ['orgânico','organico','orgânico','organic','seo'],
      bg:'#ecfdf5', tx:'#065f46', bd:'#6ee7b7',
      icon:`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`,
    },
    {
      keys: ['pago','tráfego pago','trafego pago','ads','mídia paga','midia paga','paid'],
      bg:'#fff7ed', tx:'#9a3412', bd:'#fed7aa',
      icon:`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path stroke-linecap="round" stroke-linejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>`,
    },
    {
      keys: ['telefone','ligação','ligacao','call','fone'],
      bg:'#f0f9ff', tx:'#0369a1', bd:'#bae6fd',
      icon:`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>`,
    },
  ]

  // Deterministic color fallback from string hash
  const FALLBACK_PALETTES = [
    ['#fef3c7','#92400e','#fde68a'],['#e0e7ff','#3730a3','#c7d2fe'],
    ['#dcfce7','#166534','#bbf7d0'],['#fce7f3','#9d174d','#fbcfe8'],
    ['#f3e8ff','#6b21a8','#e9d5ff'],['#fff7ed','#9a3412','#fed7aa'],
    ['#eff6ff','#1e40af','#bfdbfe'],
  ]
  function strHash(s) { return s.split('').reduce((a,c) => (a*31+c.charCodeAt(0))|0, 0) }

  // Match known
  const match = KNOWN.find(k => k.keys.some(key => o === key || o.includes(key)))
  const bg  = match ? match.bg  : FALLBACK_PALETTES[Math.abs(strHash(o)) % FALLBACK_PALETTES.length][0]
  const tx  = match ? match.tx  : FALLBACK_PALETTES[Math.abs(strHash(o)) % FALLBACK_PALETTES.length][1]
  const bd  = match ? match.bd  : FALLBACK_PALETTES[Math.abs(strHash(o)) % FALLBACK_PALETTES.length][2]
  const icon = match ? match.icon : `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>`

  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;font-size:11.5px;font-weight:600;background:${bg};color:${tx};border:1px solid ${bd};white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${esc(friendly)}">
    <span style="flex-shrink:0;display:flex">${icon}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(friendly)}</span>
  </span>`
}


function _msgPreviewText(m) {
  if (!m) return null
  if (m.messageContent) return m.messageContent
  const t = m.metaResponse?.type || m.payloadSent?.type
  return _MEDIA_PREVIEW_LABELS[t] || (t ? '📎 Mensagem' : null)
}

// ─── Cache local (stale-while-revalidate) ────────────────────────────────────
var crmCache = {
  TTL: { leads: 60_000, dashboard: 120_000, conversation: 30_000, inboxLeads: 300_000 },
  _key(name) { return `crm_${S.workspaceSlug || 'default'}_${S.me?.id || 'anon'}_${name}` },
  get(name, ttl) {
    try {
      const raw = localStorage.getItem(this._key(name))
      if (!raw) return null
      const { data, ts } = JSON.parse(raw)
      if (Date.now() - ts > ttl) return null
      return data
    } catch { return null }
  },
  set(name, data) {
    _safeSetItem(this._key(name), JSON.stringify({ data, ts: Date.now() }))
  },
  del(name) {
    try { localStorage.removeItem(this._key(name)) } catch {}
  },
}

// ─── Boot ─────────────────────────────────────────────────────────────────────


// FASE2-B: delta fetch — rastreia timestamp do último fetch completo
var _leadsFetchedAt   = null  // ISO timestamp do último fetch bem-sucedido
var _leadsDeltaCycles = 0     // ciclos desde o último full-fetch
var LEADS_FULL_EVERY = 12   // força full-fetch a cada 12 ciclos (~60s em idle 5s)


async function fetchInboxLeads() {
  // Cache warmup: exibe conversas imediatamente enquanto API carrega
  const _cached = crmCache.get('inboxLeads', crmCache.TTL.inboxLeads)
  if (_cached?.length && S.inboxLeads.length === 0) {
    for (const l of _cached) {
      if (l.lastMessagePreview) S.msgPreviews[l.id] = { text: l.lastMessagePreview, out: l.lastMessageOut === true }
    }
    S.inboxLeads = _cached
    S.inboxLeadsLoaded = true  // cache hit conta como loaded — desbloqueia sidebar
    scheduleRender()
  }
  try {
    const resp = await api('/?withMessages=1')
    // Backend retorna array direto OU objeto { data: [...], isInbox: true }
    // (formato mudou em algum momento — aceitar ambos)
    const leads = Array.isArray(resp) ? resp : (resp?.data ?? [])
    for (const l of leads) {
      if (l.lastMessagePreview) S.msgPreviews[l.id] = { text: l.lastMessagePreview, out: l.lastMessageOut === true }
    }
    S.inboxLeads = leads
    // Salva no cache (máx 500 leads para não estourar localStorage)
    const MAX_CACHE_INBOX = 500
    crmCache.set('inboxLeads', leads.length <= MAX_CACHE_INBOX ? leads : leads.slice(0, MAX_CACHE_INBOX))
  } catch {}
  // Sempre seta loaded no fim — mesmo se erro — pra evitar skeleton infinito
  S.inboxLeadsLoaded = true
  scheduleRender()
}


async function editLeadEmail(leadId) {
  const lead = _findActiveLead?.() || S.leads.find(l => l.id === leadId)
  const current = lead?.email || ''
  const next = await lowanPrompt('Editar e-mail', current, {
    placeholder: 'email@exemplo.com',
    inputType: 'email',
    confirmLabel: 'Salvar',
    validate: (v) => {
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'E-mail inválido.'
      return null
    },
  })
  if (next === null) return  // user cancelled
  try {
    const r = await api(`/${leadId}`, { method:'PUT', body:JSON.stringify({ email: next || null }) })
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, ...r } : l)
    if (Array.isArray(S.inboxLeads)) S.inboxLeads = S.inboxLeads.map(l => l.id === leadId ? { ...l, ...r } : l)
    showToast?.('E-mail atualizado', 'success')
    if (typeof _patchInboxDetailsPanel === 'function') _patchInboxDetailsPanel()
    else render()
  } catch (e) {
    showToast?.(e?.message || 'Falha ao atualizar e-mail', 'error')
  }
}


async function editLeadName(leadId) {
  const lead = _findActiveLead?.() || S.leads.find(l => l.id === leadId)
  const current = lead?.name || ''
  const next = await lowanPrompt('Editar nome do lead', current, {
    placeholder: 'Nome completo',
    confirmLabel: 'Salvar',
    validate: (v) => {
      if (!v) return 'Nome não pode ser vazio.'
      if (v.length > 255) return 'Nome muito longo (máx 255).'
      return null
    },
  })
  if (next === null) return
  try {
    const r = await api(`/${leadId}`, { method:'PUT', body:JSON.stringify({ name: next }) })
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, ...r } : l)
    if (Array.isArray(S.inboxLeads)) S.inboxLeads = S.inboxLeads.map(l => l.id === leadId ? { ...l, ...r } : l)
    showToast?.('Nome atualizado', 'success')
    if (typeof _patchInboxDetailsPanel === 'function') _patchInboxDetailsPanel()
    if (typeof _patchInboxChatHeader === 'function') _patchInboxChatHeader()
    if (typeof _patchInboxListPanel === 'function') _patchInboxListPanel()
    else render()
  } catch (e) {
    showToast?.(e?.message || 'Falha ao atualizar nome', 'error')
  }
}


async function editLeadPhone(leadId) {
  const lead = _findActiveLead?.() || S.leads.find(l => l.id === leadId)
  const current = fmtPhoneLive(lead?.phone || '')
  const next = await lowanPrompt('Editar telefone', current, {
    placeholder: '(11) 99999-9999',
    inputType: 'tel',
    confirmLabel: 'Continuar',
    liveFormatter: fmtPhoneLive,
    validate: (v) => {
      if (!v) return 'Telefone não pode ser vazio.'
      const digits = v.replace(/\D/g, '')
      if (digits.length < 10) return 'Telefone inválido (mín DDD + 8 dígitos).'
      return null
    },
  })
  if (next === null) return
  const ok = await lowanConfirm(
    'Confirmar alteração de telefone',
    'Alterar o telefone pode quebrar o vínculo com mensagens já recebidas pelo número antigo. Deseja continuar?',
    { confirmLabel: 'Sim, alterar', cancelLabel: 'Cancelar', danger: true }
  )
  if (!ok) return
  try {
    const r = await api(`/${leadId}`, { method:'PUT', body:JSON.stringify({ phone: next }) })
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, ...r } : l)
    if (Array.isArray(S.inboxLeads)) S.inboxLeads = S.inboxLeads.map(l => l.id === leadId ? { ...l, ...r } : l)
    showToast?.('Telefone atualizado', 'success')
    if (typeof _patchInboxDetailsPanel === 'function') _patchInboxDetailsPanel()
    if (typeof _patchInboxChatHeader === 'function') _patchInboxChatHeader()
    else render()
  } catch (e) {
    showToast?.(e?.message || 'Falha ao atualizar telefone', 'error')
  }
}


async function iniciarContato(id) {
  const firstStageId = S.kanban?.stages?.[0]?.id || null
  if (!firstStageId) { alert('Configure pelo menos uma etapa no Kanban'); return }
  try {
    const r = await api(`/${id}`, { method:'PUT', body:JSON.stringify({ stageId: firstStageId }) })
    S.leads = S.leads.map(l=>l.id===id?r:l)
    showToast(`Contato iniciado por ${S.me.name}`)
    renderKeepScroll()
  } catch(e) { alert(e.message) }
}


async function changeStage(id, stageId) {
  try {
    const r = await api(`/${id}`, { method:'PUT', body:JSON.stringify({ stageId: stageId||null }) })
    S.leads = S.leads.map(l=>l.id===id?r:l); renderKeepScroll()
    if (S.leadActivity[id] !== undefined && typeof loadLeadActivity === 'function') loadLeadActivity(id)
  } catch(e) { alert(e.message) }
}

var STATUS_COLORS = {
  disponivel:   { bg:'#dcfce7', tx:'#15803d', bd:'#bbf7d0' },
  pego:         { bg:'#dbeafe', tx:'#1d4ed8', bd:'#bfdbfe' },
  em_andamento: { bg:'#ffedd5', tx:'#c2410c', bd:'#fed7aa' },
  perdido:      { bg:'#fee2e2', tx:'#dc2626', bd:'#fecaca' },
}

function stageSelectHtml(lead, extraClass='', ctx='') {
  const stages = S.kanban?.stages || []
  const id = `cdd-st-${ctx ? ctx+'-' : ''}${lead.id}`
  const arr = `<svg class="cdd-arr" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
  const chk = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

  if (stages.length === 0) {
    const cur = lead.status || 'disponivel'
    const sc = STATUS_COLORS[cur] || STATUS_COLORS.disponivel
    const items = Object.entries(STATUS).map(([k,v]) => {
      const c = STATUS_COLORS[k] || STATUS_COLORS.disponivel
      const active = k === cur
      return `<div class="cdd-item${active?' is-sel':''}" onclick="changeStatus('${lead.id}','${k}');cddClose('${id}')"><span class="cdd-ck">${active?chk:''}</span><span class="cdd-stage-dot" style="background:${c.tx}"></span><span>${v.label}</span></div>`
    }).join('')
    return `<div class="cdd cdd-pill${extraClass?' '+extraClass:''}" id="${id}"><button type="button" class="cdd-btn" style="background:${sc.bg};color:${sc.tx};border-color:${sc.bd}" onclick="cddToggle('${id}',event)"><span class="cdd-val">${STATUS[cur]?.label||cur}</span>${arr}</button><div class="cdd-drop">${items}</div></div>`
  }

  const curStage = stages.find(s => s.id === lead.stageId)
  const stageLabel = curStage?.name || 'Sem Etapa'
  const accent = curStage?.color || '#94a3b8'
  const hex2 = accent + '28', hexBd = accent + '55'
  const items = [
    `<div class="cdd-item${!lead.stageId?' is-sel':''}" onclick="changeStage('${lead.id}','');cddClose('${id}')"><span class="cdd-ck">${!lead.stageId?chk:''}</span><span class="cdd-stage-dot" style="background:#94a3b8"></span><span>Sem Etapa</span></div>`,
    ...stages.map(st => {
      const active = lead.stageId === st.id
      return `<div class="cdd-item${active?' is-sel':''}" onclick="changeStage('${lead.id}','${st.id}');cddClose('${id}')"><span class="cdd-ck">${active?chk:''}</span><span class="cdd-stage-dot" style="background:${esc(st.color||'#94a3b8')}"></span><span>${esc(st.name)}</span></div>`
    })
  ].join('')
  return `<div class="cdd cdd-pill${extraClass?' '+extraClass:''}" id="${id}"><button type="button" class="cdd-btn" style="background:${hex2};color:${esc(accent)};border-color:${hexBd}" onclick="cddToggle('${id}',event)"><span class="cdd-stage-dot" style="background:${esc(accent)}"></span><span class="cdd-val">${esc(stageLabel)}</span>${arr}</button><div class="cdd-drop">${items}</div></div>`
}


function confirmDeleteLead(id) {
  S.deleteTarget=id; S.deleteConversation=false; S.deleteLeadBlacklist=false; S.modal='delete_lead'; render()
}


async function confirmBlockLead(id, isCurrentlyBlocked) {
  // Bloqueio é confirmação simples — sem modal pesado
  const lead = S.leads.find(l => l.id === id) || S.conversation?.lead || {}
  const name = lead.name || 'este lead'
  const action = isCurrentlyBlocked ? 'Desbloquear' : 'Bloquear'
  const msg = isCurrentlyBlocked
    ? `Desbloquear ${name}? Ele voltará a aparecer nas listas.`
    : `Bloquear ${name}? Ele some das listas (Conversas / Leads / Kanban) e nenhuma mensagem será enviada por engano. Pode desbloquear depois.`
  if (!confirm(msg)) return
  try {
    const path = isCurrentlyBlocked ? `/${id}/unblock` : `/${id}/block`
    await api(path, { method: 'POST' })
    // Atualiza local: se bloqueando, some das listas; se desbloqueando, mantém visível
    if (isCurrentlyBlocked) {
      // Desbloqueio — apenas marca o flag (lead já não estava na lista, então não muda nada visualmente)
      const l = S.leads.find(x => x.id === id)
      if (l) l.isBlocked = false
      if (S.conversation?.lead?.id === id) S.conversation.lead.isBlocked = false
      showToast(`${name} desbloqueado`, 'success')
    } else {
      // Bloqueio — remove da lista local
      S.leads = S.leads.filter(l => l.id !== id)
      delete S.msgPreviews[id]
      if (S.conversationLeadId === id) { S.conversationLeadId = null; S.conversation = null }
      if (S.newConvLeadId === id) S.newConvLeadId = null
      showToast(`${name} bloqueado`, 'success')
    }
    render()
  } catch (e) { showToast(e?.message || 'Erro ao alterar status', 'error') }
}

async function fetchBlockedLeads() {
  S.blockedLoading = true; render()
  try {
    const r = await api('/blocked')
    S.blockedLeads = r?.data || []
    S.blockedLoaded = true
  } catch(e) { showToast(e?.message || 'Erro ao carregar bloqueados', 'error') }
  finally { S.blockedLoading = false; render() }
}


async function unblockFromList(leadId) {
  const lead = (S.blockedLeads||[]).find(l => l.id === leadId)
  const leadName = lead?.name || 'este lead'
  if (!confirm(`Desbloquear ${leadName}? Ele voltará a aparecer nas listas.`)) return
  try {
    await api(`/${leadId}/unblock`, { method: 'POST' })
    S.blockedLeads = (S.blockedLeads||[]).filter(l => l.id !== leadId)
    showToast('Lead desbloqueado', 'success')
    // Recarrega leads ativos pra ele reaparecer
    loadModule('leads').then(() => fetchLeads(true)).catch(()=>{})
    render()
  } catch(e) { showToast(e?.message || 'Erro', 'error') }
}


function confirmDeleteConversation(leadId) {
  S.deleteConvTarget = leadId; S.deleteConvContact = false; S.deleteConvBlacklist = false; S.modal = 'delete_conversation'; render()
}

async function deleteConversation() {
  const leadId = S.deleteConvTarget
  try {
    const params = new URLSearchParams({ deleteConversation: 'true' })
    if (S.deleteConvContact) params.set('deleteLead', 'true')
    if (S.deleteConvBlacklist) params.set('blacklist', 'true')
    await api(`/${leadId}/conversation?${params}`, { method: 'DELETE' })
    // Limpa conversa da memória
    if (S.conversationLeadId === leadId) { S.conversation = null; S.conversationLoading = false }
    delete S.msgPreviews[leadId]
    closeModal()
    render()
  } catch(e) { alert(e.message); closeModal() }
}

// ─── Import ───────────────────────────────────────────────────────────────────

function _getLazyObserver() {
  if (_lazyObserver) return _lazyObserver
  if (!window.IntersectionObserver) return null  // fallback: carrega imediatamente
  _lazyObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      _lazyObserver.unobserve(entry.target)
      const el = entry.target
      if (el.getAttribute('data-lazy-type') === 'image') _fetchAuthImage(el)
      else if (el.getAttribute('data-lazy-type') === 'audio') _fetchAuthAudio(el)
    }
  }, { rootMargin: '300px 0px' })
  return _lazyObserver
}


async function _fetchAuthImage(img) {
  const src = img.getAttribute('data-authsrc')
  if (!src) return
  try {
    const res = await fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw new Error(`${res.status}`)
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) throw new Error('not-image')
    const blobUrl = URL.createObjectURL(blob)
    img.src = blobUrl
    img.onclick = () => openImageModal(blobUrl)
  } catch {
    img.style.display = 'none'
    const fbId = img.id.replace('authimg-', 'authfb-')
    const fb = document.getElementById(fbId)
    if (fb) fb.style.display = ''
  }
}


async function _fetchAuthAudio(container) {
  const src = container.getAttribute('data-authaudio')
  const pid = container.id
  if (!src || _audioPlayers[pid]) return
  try {
    const res = await fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw new Error(`${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const audio = new Audio(blobUrl)
    _audioPlayers[pid] = { el: audio, blobUrl }
    _bindAudioContainer(container, audio)
  } catch (e) { console.warn('[audio load error]', src, e?.message || e) }
}
// ────────────────────────────────────────────────────────────────────────────


async function loadAuthImages(scope) {
  const obs = _getLazyObserver()
  const root = scope || document
  const imgs = root.querySelectorAll('img[data-authsrc]')
  const fallback = []
  for (const img of imgs) {
    const src = img.getAttribute('data-authsrc')
    if (!src || img.getAttribute('data-auth-loaded')) continue
    img.setAttribute('data-auth-loaded', '1')
    if (obs) { img.setAttribute('data-lazy-type', 'image'); obs.observe(img) }
    else fallback.push(img)
  }
  if (fallback.length) await Promise.all(fallback.map(_fetchAuthImage))
}


async function loadAuthVideos(scope) {
  const root = scope || document
  const videos = root.querySelectorAll('video[data-authvideo]')
  for (const video of videos) {
    const src = video.getAttribute('data-authvideo')
    if (!src || video.getAttribute('data-auth-loaded')) continue
    video.setAttribute('data-auth-loaded', '1')
    try {
      const res = await fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      video.src = blobUrl
      video.style.display = ''
      const fbId = video.id.replace('authvid-', 'authvidfb-')
      const fb = document.getElementById(fbId)
      if (fb) fb.style.display = 'none'
    } catch {
      // fallback link permanece visível
    }
  }
}


async function loadAuthVideoDirect(apiUrl, msgId) {
  const video = document.getElementById(`authvid-${msgId}`)
  const fb = document.getElementById(`authvidfb-${msgId}`)
  if (!video) return
  if (video.getAttribute('data-auth-loaded')) { video.style.display = ''; if (fb) fb.style.display = 'none'; return }
  video.setAttribute('data-auth-loaded', '1')
  if (fb) fb.textContent = '⏳ Carregando...'
  try {
    const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw new Error(`${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    video.src = blobUrl
    video.style.display = ''
    if (fb) fb.style.display = 'none'
  } catch(e) {
    if (fb) fb.textContent = '❌ Vídeo indisponível'
  }
}

// FASE3-C: debounce de varredura de mídia — evita N querySelectorAll por burst de mensagens
// Escopo restrito ao #conv-msgs para evitar varredura do documento inteiro
var _mediaSweepPending = false

function _scheduleMediaSweep() {
  if (_mediaSweepPending) return
  _mediaSweepPending = true
  requestAnimationFrame(() => {
    _mediaSweepPending = false
    const scope = document.getElementById('conv-msgs') || document
    loadAuthImages(scope)
    loadAuthAudios(scope)
    loadAuthVideos(scope)
  })
}

// Mapa de instâncias de áudio: pid → { el: HTMLAudioElement, blobUrl }
var _audioPlayers = {}


async function loadAuthAudios(scope) {
  // FASE2-A: lazy via IntersectionObserver; fallback paralelo se IO indisponível
  const obs = _getLazyObserver()
  const root = scope || document
  const players = root.querySelectorAll('[data-authaudio]')
  const fallback = []
  for (const container of players) {
    const src = container.getAttribute('data-authaudio')
    if (!src || container.getAttribute('data-audio-loaded')) continue
    container.setAttribute('data-audio-loaded', '1')
    const pid = container.id
    if (_audioPlayers[pid]) continue  // blob local já registrado
    if (obs) { container.setAttribute('data-lazy-type', 'audio'); obs.observe(container) }
    else fallback.push(container)
  }
  if (fallback.length) await Promise.all(fallback.map(_fetchAuthAudio))
}


function _bindAudioContainer(container, audio) {
  if (!container || !audio) return
  // 'auto' garante que o blob OGG carrega completo — necessário pro workaround
  // de duration=Infinity (seek-to-end precisa dos dados pra contar frames).
  audio.preload = 'auto'
  const timeEl = () => container.querySelector('.audio-time')
  const durEl  = () => container.querySelector('.audio-duration')
  const showDuration = () => {
    if (!isFinite(audio.duration)) return
    const t = timeEl(); if (t) t.textContent = fmtAudioTime(audio.duration)
    const d = durEl();  if (d) d.textContent = fmtAudioTime(audio.duration)
  }
  // Workaround OGG/Opus: força recálculo ao "seekar" pro final.
  let durFixTried = false
  const tryFixDuration = () => {
    if (durFixTried || isFinite(audio.duration)) return
    durFixTried = true
    const onChange = () => {
      if (isFinite(audio.duration)) {
        audio.removeEventListener('durationchange', onChange)
        try { audio.currentTime = 0 } catch {}
        showDuration()
      }
    }
    audio.addEventListener('durationchange', onChange)
    try { audio.currentTime = 1e9 } catch {}
  }
  if (isFinite(audio.duration) && audio.duration > 0) showDuration()
  audio.addEventListener('loadedmetadata', () => {
    if (!isFinite(audio.duration)) tryFixDuration()
    else showDuration()
  })
  audio.addEventListener('durationchange', () => { if (isFinite(audio.duration)) showDuration() })
  // Antes de tocar, garante que tentamos o fix se ainda for Infinity.
  audio.addEventListener('play', () => { if (!isFinite(audio.duration)) tryFixDuration() })
  audio.addEventListener('timeupdate', () => {
    const pct = audio.duration && isFinite(audio.duration) ? (audio.currentTime / audio.duration * 100) : 0
    const bar = container.querySelector('.audio-progress')
    if (bar) bar.style.width = pct + '%'
    // Tocando: mostra tempo decorrido. Pausado/parado: deixa duração (ou último valor).
    if (!audio.paused) {
      const t = timeEl(); if (t) t.textContent = fmtAudioTime(audio.currentTime)
    }
  })
  audio.addEventListener('pause', () => {
    // Volta a mostrar a duração quando o usuário pausa
    if (audio.currentTime > 0 && audio.currentTime < audio.duration) {
      // Se pausou no meio, mantém o tempo elapsed (UX comum)
      return
    }
    showDuration()
  })
  audio.addEventListener('ended', () => {
    const bar = container.querySelector('.audio-progress')
    if (bar) bar.style.width = '0%'
    showDuration()
    setAudioIcon(container, false)
  })
}


function setAudioIcon(container, playing) {
  const play = container.querySelector('.audio-icon-play')
  const pause = container.querySelector('.audio-icon-pause')
  if (play)  play.classList.toggle('hidden', playing)
  if (pause) pause.classList.toggle('hidden', !playing)
}


function audioToggle(pid) {
  const player = _audioPlayers[pid]
  if (!player) return
  const { el } = player
  const container = document.getElementById(pid)
  if (!container) return
  if (el.paused) {
    // Pausa todos os outros players ativos
    Object.entries(_audioPlayers).forEach(([id, p]) => {
      if (id !== pid && !p.el.paused) {
        p.el.pause()
        const c = document.getElementById(id)
        if (c) setAudioIcon(c, false)
      }
    })
    el.play()
    setAudioIcon(container, true)
  } else {
    el.pause()
    setAudioIcon(container, false)
  }
}


function audioSeek(pid, event) {
  const player = _audioPlayers[pid]
  if (!player || !isFinite(player.el.duration)) return
  const bar = event.currentTarget
  const rect = bar.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  player.el.currentTime = pct * player.el.duration
}


async function loadAuthImageDirect(apiUrl) {
  try {
    const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw new Error(`${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    openImageModal(blobUrl)
  } catch(e) {
    alert('Não foi possível carregar a imagem: ' + e.message)
  }
}

// ─── Documentos autenticados ──────────────────────────────────────────────────
var _docBlobUrls = {}


async function openAuthDoc(docId) {
  const container = document.getElementById(docId)
  if (!container) return
  const apiUrl = container.getAttribute('data-authdoc')
  const fname = container.getAttribute('data-docname') || 'documento'
  if (!apiUrl) return

  // Se já temos o blob em cache, abre direto
  if (_docBlobUrls[docId]) { _openDocBlob(_docBlobUrls[docId], fname); return }

  // Feedback visual: spinner no ícone de download
  const hint = container.querySelector('p:last-child')
  if (hint) hint.innerHTML = `<svg class="w-3 h-3 animate-spin inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Carregando...`

  try {
    const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    _docBlobUrls[docId] = blobUrl
    _openDocBlob(blobUrl, fname)
    if (hint) hint.innerHTML = `<svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Aberto`
  } catch(e) {
    if (hint) hint.innerHTML = `⚠ Erro ao carregar`
    showToast('Não foi possível abrir o arquivo: ' + e.message, 'error')
  }
}


function _openDocBlob(blobUrl, fname) {
  const ext = (fname.split('.').pop() || '').toLowerCase()
  const previewable = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'txt', 'csv']
  if (previewable.includes(ext)) {
    // Abre em nova aba para preview
    window.open(blobUrl, '_blank')
  } else {
    // Download direto
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fname
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}


function releaseAudioPlayers() {
  Object.values(_audioPlayers).forEach(p => { try { p.el.pause(); URL.revokeObjectURL(p.blobUrl) } catch {} })
  Object.keys(_audioPlayers).forEach(k => delete _audioPlayers[k])
}

// ─── Conversation ─────────────────────────────────────────────────────────────

function _updateInboxActiveItem(prevId, newId) {
  // Usa apenas a classe CSS .active — inline styles antigos causavam highlights
  // órfãos quando a conversa trocava (a classe ficava em items velhos do DOM
  // porque o diff não re-renderiza ao mudar isActive — comentário em _renderInboxItem).
  // Limpeza defensiva: remove .active de QUALQUER item antes de aplicar no novo.
  // Também limpa inline antigos pra compatibilidade com sessões já abertas.
  document.querySelectorAll('[data-lead-id].active').forEach(el => {
    el.classList.remove('active')
  })
  document.querySelectorAll('[data-lead-id]').forEach(el => {
    if (el.style.background) el.style.background = ''
    if (el.style.borderLeft) el.style.borderLeft = ''
  })
  if (newId) {
    const el = document.querySelector(`[data-lead-id="${newId}"]`)
    if (el) el.classList.add('active')
  }
}


async function openConversation(leadId) {
  releaseAudioPlayers()
  _updateInboxActiveItem(S.conversationLeadId, leadId)
  S.conversationLeadId = leadId
  // Detalhes:
  //  • Inbox split (desktop): PRESERVA estado entre conversas. Uma vez aberto, fica fixo.
  //  • Chat lateral (conv-overlay, fora da aba inbox): fecha — ação deliberada por conversa.
  //  • Mobile (qualquer aba): fecha — slide-over que toma a tela inteira não pode aparecer sem ação.
  const _onInboxTab = (isAdmin() ? S.adminTab : S.collabTab) === 'inbox'
  const _isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches
  if (!_onInboxTab || _isMobile) S.detailsOpen = false
  // Mobile: troca de tela imediatamente (Kommo-like)
  if (typeof _syncMobileInboxClasses === 'function') _syncMobileInboxClasses()
  // Invalida cache de atividade do lead anterior para evitar stale data ao reabrir
  if (S.leadActivity[leadId] !== undefined) delete S.leadActivity[leadId]
  _inboxReplyBoxFp = ''; _convReplyBoxFp = ''; _convChatHeaderFp = ''; _convOverlayLeadId = ''; _convOverlayWasLoading = false; _convMsgOffset = 0  // força rebuild ao trocar conversa
  _convIdleCycles = 0; _convTickCount = 0  // FASE2-C: reseta backoff ao abrir conversa
  // Guarda o lead ativo para uso em selectTextModel mesmo que não esteja em S.leads
  S._activeLead = S.leads.find(l => l.id === leadId) || null
  S.conversationLoading = true
  S.conversation = null
  S.replyText = ''
  S.convTemplate = null
  S.convTemplateVars = []
  S.templatePicker = false
  S.aiResult = null
  S.aiLoading = false
  if (S.imagePreviewUrl) URL.revokeObjectURL(S.imagePreviewUrl)
  S.imageFile = null; S.imagePreviewUrl = null; S.imageCaption = ''; S.imageSending = false
  _chatAtBottom = true
  // Mostra spinner no chat sem recriar a lista; atualiza detalhes para o novo lead
  _rebuildChatArea()
  _patchInboxChatHeader()
  _patchInboxDetailsPanel()
  try {
    // Cross-module fetches: connections e kanban são lazy desde PRs #17/#18.
    // loadModule resolve imediato se já carregado; senão fetcha o .js primeiro.
    const fetchConnsIfNeeded = S.connections.length === 0 ? loadModule('connections').then(() => fetchConnections()) : Promise.resolve()
    const fetchUnoffIfNeeded = S.unofficialSessions.length === 0 ? loadModule('connections').then(() => fetchUnofficialSessions()).catch(()=>{}) : Promise.resolve()
    const fetchTgBotsIfNeeded = (S.telegramBots?.length || 0) === 0 ? loadModule('connections').then(() => fetchTelegramBots()).catch(()=>{}) : Promise.resolve()
    const fetchTgUserIfNeeded = (S.telegramUserConnections?.length || 0) === 0 ? loadModule('connections').then(() => fetchTelegramUserConnections()).catch(()=>{}) : Promise.resolve()
    const fetchKanbanIfNeeded = (!S.kanban || !S.kanban.stages?.length) ? loadModule('kanban').then(() => fetchKanban()) : Promise.resolve()
    const [conv] = await Promise.all([
      api(`/${leadId}/conversation`),
      loadConvTemplates(),
      loadTextModels(),
      loadAudioModels(),
      loadModule('financial').then(() => loadFinancialTypes()),
      fetchConnsIfNeeded,
      fetchTgBotsIfNeeded,
      fetchKanbanIfNeeded,
      fetchUnoffIfNeeded,
    ])
    if (conv.messages) {
      conv.messages.sort((a, b) => new Date(a.sentAt || a.createdAt) - new Date(b.sentAt || b.createdAt))
    }
    S.conversation = conv
    const lastMsg = conv.messages?.length ? conv.messages[conv.messages.length - 1] : null
    const previewText = _msgPreviewText(lastMsg)
    if (previewText) S.msgPreviews[leadId] = { text: previewText, out: lastMsg.direction === 'OUTBOUND' }
    // Auto-select de conexão: detecta canal pelo lead (phone tg_* = Telegram).
    const _activeLead = S.leads?.find(l => l.id === leadId) || S.inboxLeads?.find(l => l.id === leadId)
    const _isTgLead = (_activeLead?.phone || '').startsWith('tg_')
    if (_isTgLead) {
      // Telegram: bot da última INBOUND TG, senão 1º bot ATIVE.
      const lastTgIn = conv.messages?.slice().reverse().find(m => m.direction === 'INBOUND' && m.telegramConnectionId)
      S.convConnId = lastTgIn?.telegramConnectionId
        || (S.telegramBots || []).find(b => b.status === 'ACTIVE')?.id
        || null
    } else {
      // WhatsApp: lógica existente
      const lastIn = conv.messages?.slice().reverse().find(m => m.direction === 'INBOUND' && m.connectionId)
      const lastOut = conv.messages?.slice().reverse().find(m => m.direction === 'OUTBOUND' && m.connectionId)
      const bestConn = lastIn?.connectionId || lastOut?.connectionId
      if (bestConn) S.convConnId = bestConn
      else if (!S.convConnId) {
        S.convConnId = S.connections.find(c=>c.status==='ACTIVE')?.id
          || S.unofficialSessions.find(s=>s.sessionStatus==='connected')?.id
          || null
      }
    }
  } catch(e) { alert(e.message) }
  finally {
    S.conversationLoading = false
    _rebuildChatArea()  // reconstrói chat com mensagens, vai para o bottom
    _patchInboxChatHeader()  // restaura foto de perfil após _rebuildChatArea sobrescrever com iniciais
    _patchInboxListPanel() // atualiza badge de não-lido na lista
    _patchInboxDetailsPanel() // garante painel de detalhes com dados do lead atual
  }
}


async function loadConvTemplates() {
  if (S.convTemplatesLoaded) return
  try {
    S.convTemplates = await apiAdmin('/templates')
    S.convTemplatesLoaded = true
    if (!S.convConnId && S.convTemplates.length > 0) {
      S.convConnId = S.convTemplates[0].connectionId
    }
  } catch {}
}


async function loadTextModels() {
  if (S.textModelsLoaded) return
  try {
    S.textModels = await apiModels('/text')
    S.textModelsLoaded = true
  } catch {}
}


async function loadAudioModels() {
  if (S.audioModelsLoaded) return
  try {
    S.audioModels = await apiModels('/audio')
    S.audioModelsLoaded = true
  } catch {}
}

function closeConversation() {
  releaseAudioPlayers()
  _updateInboxActiveItem(S.conversationLeadId, null)  // limpa highlight inline imediato
  S.conversationLeadId = null; S.conversation = null; S.replyText = ''
  const isInbox = (isAdmin() ? S.adminTab : S.collabTab) === 'inbox'
  if (isInbox) {
    // FASE3-B: só atualiza os painéis afetados, sem rebuild completo
    _patchInboxListPanel(); _patchInboxChatHeader(); _patchInboxReplyBox(); _patchInboxDetailsPanel()
  } else {
    render()
  }
  _syncMobileInboxClasses()
}

// Sincroniza classes do body pra responsivo mobile (estilo Kommo: uma tela por vez)

async function markLeadAsRead(leadId) {
  S.leads = S.leads.map(l => l.id === leadId ? { ...l, unreadCount: 0 } : l)
  _patchInboxListPanel(); _patchInboxChatHeader()
  api(`/${leadId}/read`, { method: 'POST' }).catch(() => {})
}


async function markLeadAsUnread(leadId) {
  S.leads = S.leads.map(l => l.id === leadId ? { ...l, unreadCount: 1 } : l)
  _patchInboxListPanel(); _patchInboxChatHeader()
  api(`/${leadId}/unread`, { method: 'POST' }).catch(() => {})
}


async function toggleStar(leadId) {
  const lead = S.leads.find(l => l.id === leadId)
  if (!lead) return
  const starred = !lead.starred
  S.leads = S.leads.map(l => l.id === leadId ? { ...l, starred } : l)
  _patchInboxChatHeader()
  _patchInboxListPanel()
  api(`/${leadId}`, { method: 'PUT', body: JSON.stringify({ starred }) }).catch(() => {
    // reverte em caso de erro
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, starred: !starred } : l)
    _patchInboxChatHeader()
    _patchInboxListPanel()
  })
}


async function sendReply() {
  // legacy alias — now handled by sendMessage()
  return sendMessage()
}

// ─── Filters ─────────────────────────────────────────────────────────────────
// Memoização de leadsForCards — mesmos filtros da lista mas ignorando filterStage
var _cLeadsRef = null, _cLeadsFp = '', _cLeadsCache = null

function _setupChatScrollListener() {
  const el = document.getElementById('conv-msgs')
  if (!el || el._slAttached) return
  el._slAttached = true

  // ── Floating date pill ────────────────────────────────────────────────────
  // Injeta o pill no parent do conv-msgs (que passa a ser position:relative)
  const parent = el.parentElement
  if (parent && !parent.querySelector('[data-float-date]')) {
    parent.style.position = 'relative'
    const pill = document.createElement('div')
    pill.dataset.floatDate = '1'
    // top = offsetTop do conv-msgs + 8px → sempre dentro da área de mensagens
    const pillTop = (el.offsetTop + 8) + 'px'
    pill.style.cssText = [
      'position:absolute', `top:${pillTop}`, 'left:50%', 'transform:translateX(-50%)',
      'z-index:10', 'pointer-events:none',
      'background:rgba(11,20,26,0.28)', 'color:rgba(255,255,255,0.92)',
      'font-size:10px', 'font-weight:500', 'letter-spacing:0.01em',
      'padding:2px 10px', 'border-radius:99px',
      'white-space:nowrap',
      'opacity:0', 'transition:opacity 0.25s ease',
    ].join(';')
    parent.appendChild(pill)

    let _pillTimer = null
    const showPill = (text) => {
      pill.textContent = text
      pill.style.opacity = '1'
      clearTimeout(_pillTimer)
      _pillTimer = setTimeout(() => { pill.style.opacity = '0' }, 1500)
    }

    el.addEventListener('scroll', () => {
      _chatAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60

      // Não mostra pill no topo absoluto
      if (el.scrollTop < 8) { clearTimeout(_pillTimer); pill.style.opacity = '0'; return }

      // Acha o último separator cujo top está acima do viewport visível
      const seps = el.querySelectorAll('[data-date-sep]')
      let label = null
      for (const sep of seps) {
        if (sep.offsetTop <= el.scrollTop + 4) label = sep.querySelector('span')?.textContent || null
      }
      if (label) showPill(label)
    }, { passive: true })
  } else {
    // parent já tem pill — só registra scroll de atBottom
    el.addEventListener('scroll', () => {
      _chatAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60
    }, { passive: true })
  }
}

var _scrollBottomRaf = null

function scrollToBottomChat() {
  const el = document.getElementById('conv-msgs')
  if (!el) return
  _chatAtBottom = true  // flag síncrono — patchChatMsgs pode ler antes do RAF
  if (_scrollBottomRaf) cancelAnimationFrame(_scrollBottomRaf)
  _scrollBottomRaf = requestAnimationFrame(() => {
    _scrollBottomRaf = null
    const el2 = document.getElementById('conv-msgs')  // re-query: DOM pode ter mudado
    if (el2) el2.scrollTop = el2.scrollHeight
  })
}


function _patchInboxListPanel() {
  const el = document.getElementById('inbox-list-panel')
  if (!el) return
  const inSearchMode = S.inboxSearchResults !== null
  const leads = inSearchMode ? S.inboxSearchResults : inboxLeads()
  const counts = _inboxCounts()
  const headerLabel = inSearchMode
    ? `${leads.length} resultado${leads.length===1?'':'s'}`
    : counts.unread > 0
      ? `${counts.unread} não lida${counts.unread===1?'':'s'}`
      : `${counts.all} contato${counts.all===1?'':'s'}`

  // Fast path: diff cirúrgico — só no modo normal (busca sempre faz rebuild)
  const scroll = document.getElementById('inbox-list-scroll')
  if (!inSearchMode && scroll && scroll.querySelector('[data-lead-id]')) {
    const countEl = document.getElementById('inbox-list-count')
    if (countEl) {
      countEl.textContent = headerLabel
      countEl.classList.toggle('has-unread', counts.unread > 0)
    }
    // Atualiza contagens nos chips de filtro
    const chipsEl = document.getElementById('inbox-filter-chips')
    if (chipsEl) {
      chipsEl.outerHTML = _inboxFilterChipsHtml()
    }
    _patchInboxListItems(leads.slice(0, S.inboxListLimit))
    _syncInboxSentinel(leads)
    return
  }

  // Fallback: rebuild completo (primeira renderização ou lista vazia que ganhou itens)
  const savedListScroll = scroll?.scrollTop ?? 0
  el.innerHTML = `
    <div class="cv-list-head">
      <div class="cv-list-title-row">
        <div class="cv-list-title">Conversas</div>
        <span id="inbox-list-count" class="cv-list-count${counts.unread > 0 && !inSearchMode ? ' has-unread' : ''}">${headerLabel}</span>
      </div>
      <div class="cv-list-search">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input id="inbox-search-input" type="text" placeholder="Buscar conversa, nome ou número..." oninput="filterConvList(this.value)" value="${esc(_inboxSearch)}">
        <button id="inbox-search-clear" onclick="filterConvList('');document.getElementById('inbox-search-input').value=''" class="cv-list-search-clear" style="display:${_inboxSearch ? 'flex' : 'none'}">✕</button>
      </div>
    </div>
    ${_inboxFilterChipsHtml()}
    <div id="inbox-list-scroll" style="flex:1;overflow-y:auto;padding:6px 0">
      ${!S.inboxLeadsLoaded && !S.leadsLoaded
        ? `<style>@keyframes skeletonShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}</style><div>${Array(7).fill(0).map((_,i)=>`
          <div style="display:flex;align-items:center;gap:11px;padding:13px 16px;border-bottom:1px solid var(--border)">
            <div style="width:42px;height:42px;min-width:42px;border-radius:50%;background:linear-gradient(90deg,var(--border) 25%,var(--surface-2) 50%,var(--border) 75%);background-size:400% 100%;animation:skeletonShimmer 1.4s ease infinite ${i*80}ms"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:7px">
              <div style="height:12px;width:${120+i*15}px;border-radius:6px;background:linear-gradient(90deg,var(--border) 25%,var(--surface-2) 50%,var(--border) 75%);background-size:400% 100%;animation:skeletonShimmer 1.4s ease infinite ${i*80}ms"></div>
              <div style="height:10px;width:${80+i*10}px;border-radius:6px;background:linear-gradient(90deg,var(--border) 25%,var(--surface-2) 50%,var(--border) 75%);background-size:400% 100%;animation:skeletonShimmer 1.4s ease infinite ${i*80+100}ms"></div>
            </div>
          </div>`).join('')}</div>`
        : leads.length === 0
        ? '<div class="cv-empty"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg><p>Nenhuma conversa</p></div>'
        : renderInboxList(leads)
      }
    </div>`
  if (savedListScroll > 0) {
    const listScroll = document.getElementById('inbox-list-scroll')
    if (listScroll) listScroll.scrollTop = savedListScroll
  }
  if (!inSearchMode) { _inboxScrollBound = false; attachInboxScrollListener() }
}


function _chatHeaderInnerHtml(lead) {
  const isTg = (lead.phone || '').startsWith('tg_')
  const channelBadge = isTg
    ? '<span class="cv-chat-head-channel tg">Telegram</span>'
    : '<span class="cv-chat-head-channel wa">WhatsApp</span>'

  // Status: tenta detectar última msg recebida (pra "respondeu há X")
  // Cai pra "última atividade há X" baseado em lastMessageAt
  const msgs = (S.conversationLeadId === lead.id && Array.isArray(S.conversation?.messages))
    ? S.conversation.messages : []
  const lastInbound = [...msgs].reverse().find(m => m.direction === 'INBOUND')
  const lastMs = lead.lastMessageAt ? Date.now() - new Date(lead.lastMessageAt).getTime() : null
  const isOnline = lastMs !== null && lastMs < 5 * 60 * 1000
  let statusText
  if (lastInbound) {
    statusText = `${isOnline ? 'Online · ' : ''}respondeu há ${timeAgo(lastInbound.sentAt || lastInbound.createdAt)}`
  } else if (lead.lastMessageAt) {
    statusText = `${isOnline ? 'Online · ' : ''}última atividade há ${timeAgo(lead.lastMessageAt)}`
  } else {
    statusText = 'Sem atividade ainda'
  }

  return `
    <button class="cv-chat-head-back cv-chat-head-btn" onclick="closeConversation()" title="Voltar para a lista">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
    </button>
    ${_leadAvatar(lead, 40)}
    <div class="cv-chat-head-info">
      <div class="cv-chat-head-name-row">
        <span class="cv-chat-head-name">${esc((lead.name||'').trim() || fmtPhone(lead.phone) || 'Lead sem nome')}</span>
        ${channelBadge}
      </div>
      <div class="cv-chat-head-status">
        ${isOnline ? '<span class="cv-chat-head-online-dot"></span>' : ''}
        <span>${esc(statusText)}</span>
      </div>
    </div>
    <div class="cv-chat-head-actions">
      ${(() => {
        const isUnread = (lead.unreadCount || 0) > 0
        const tip = isUnread ? `Marcar como lido (${lead.unreadCount} não lida${lead.unreadCount===1?'':'s'})` : 'Marcar como não lido'
        const handler = isUnread ? `markLeadAsRead('${lead.id}')` : `markLeadAsUnread('${lead.id}')`
        const icon = isUnread
          ? `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/><circle cx="18" cy="6" r="3" fill="currentColor" stroke="none"/></svg>`
          : `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 19V8.4l9 5.4 9-5.4V19a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 8.4V7a2 2 0 012-2h14a2 2 0 012 2v1.4l-9 5.4z"/></svg>`
        return `<button class="cv-chat-head-btn${isUnread ? ' unread' : ''}" title="${tip}" onclick="${handler}">${icon}</button>`
      })()}
      <button class="cv-chat-head-btn ${lead.starred ? 'starred' : ''}" title="${lead.starred ? 'Remover favorito' : 'Marcar como favorito'}" onclick="toggleStar('${lead.id}')">
        <svg fill="${lead.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
      </button>
      <button class="cv-chat-head-btn ${S.detailsOpen ? 'active' : ''}" title="${S.detailsOpen ? 'Esconder painel de detalhes' : 'Mostrar painel de detalhes'}" onclick="S.detailsOpen=!S.detailsOpen;_patchInboxDetailsPanel();_patchInboxChatHeader()">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          ${S.detailsOpen
            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M16 17l-4-4m0 0l4-4m-4 4h12M5 5v14"/>'
            : '<path stroke-linecap="round" stroke-linejoin="round" d="M8 7l4 4m0 0l-4 4m4-4H0M19 5v14"/>'
          }
        </svg>
      </button>
    </div>`
}


function _patchInboxChatHeader() {
  const el = document.getElementById('inbox-chat-header')
  if (!el) return
  const lead = _findActiveLead()
  if (!lead) return
  el.innerHTML = _chatHeaderInnerHtml(lead)
}

var _inboxReplyBoxFp = ''

function _patchInboxReplyBox() {
  const el = document.getElementById('inbox-reply-box')
  if (!el || !S.conversationLeadId) return
  const fp = `${S.conversationLeadId}|${S.convConnId}|${S.replyMode||''}|${S.convTemplate?.id||''}|${(S.convTemplateVars||[]).join(',')}|${S.audioRecording}|${!!S.audioBlob}|${!!S.imageFile}|${S.imageSending}|${S.templatePicker}|${S.templateSearch}|${S.aiLoading}|${!!S.aiResult}|${!!S.connDropOpen}`
  const ta = el.querySelector('#reply-input')
  if (fp === _inboxReplyBoxFp && ta) return  // nada mudou, preserva o input/foco
  _inboxReplyBoxFp = fp
  const hasFocus = ta && document.activeElement === ta
  const savedValue = hasFocus ? ta.value : null
  const savedSelStart = hasFocus ? ta.selectionStart : null
  const savedSelEnd   = hasFocus ? ta.selectionEnd   : null
  el.innerHTML = renderReplyBox(S.conversationLeadId)
  // Força seleção correta no <select> após innerHTML (alguns browsers ignoram o atributo 'selected')
  const sel = el.querySelector('select[data-conn-select]')
  if (sel && S.convConnId) sel.value = S.convConnId
  const newTa = el.querySelector('#reply-input')
  if (newTa) {
    autoResize(newTa)
    if (hasFocus && savedValue !== null) {
      newTa.value = savedValue
      newTa.focus()
      try { newTa.setSelectionRange(savedSelStart, savedSelEnd) } catch {}
    }
  }
}

var _convReplyBoxFp = ''

function _patchConvReplyBox() {
  const el = document.getElementById('conv-reply-box')
  if (!el || !S.conversationLeadId) return
  const fp = `${S.conversationLeadId}|${S.convConnId}|${S.replyMode||''}|${S.convTemplate?.id||''}|${(S.convTemplateVars||[]).join(',')}|${S.audioRecording}|${!!S.audioBlob}|${!!S.imageFile}|${S.imageSending}|${S.templatePicker}|${S.templateSearch}|${S.aiLoading}|${!!S.aiResult}|${!!S.connDropOpen}`
  const ta = el.querySelector('#reply-input')
  if (fp === _convReplyBoxFp && ta) return  // nada mudou, preserva o input/foco
  _convReplyBoxFp = fp
  const hasFocus = ta && document.activeElement === ta
  const savedValue = hasFocus ? ta.value : null
  const savedSelStart = hasFocus ? ta.selectionStart : null
  const savedSelEnd   = hasFocus ? ta.selectionEnd   : null
  el.innerHTML = renderReplyBox(S.conversationLeadId)
  const sel = el.querySelector('select[data-conn-select]')
  if (sel && S.convConnId) sel.value = S.convConnId
  const newTa = el.querySelector('#reply-input')
  if (newTa) {
    autoResize(newTa)
    if (hasFocus && savedValue !== null) {
      newTa.value = savedValue
      newTa.focus()
      try { newTa.setSelectionRange(savedSelStart, savedSelEnd) } catch {}
    }
  }
}


function _patchInboxDetailsPanel() {
  const el = document.getElementById('inbox-details-panel')
  if (!el) return
  if (window.__swipeDebug) {
    try {
      const blocked = !!S._detailsAnimating || el.classList.contains('is-dragging')
      window.__dbg && window.__dbg(`patch ${blocked?'BLOCK':'RUN'} anim=${!!S._detailsAnimating} drag=${el.classList.contains('is-dragging')} dOpen=${!!S.detailsOpen}`)
    } catch {}
  }
  // Lock: durante animação de gesto (240ms), não interfere — innerHTML reset
  // mid-transition aborta a transição em alguns browsers, causando "bounce".
  if (S._detailsAnimating) return
  // Lock: durante DRAG ativo (is-dragging class). Sem isso, qualquer chamada
  // externa de patch durante o swipe (polling, realtime, _patchAll) cai no
  // else branch (S.detailsOpen ainda é false durante drag) e hard-reseta
  // display:none + innerHTML='' — o painel some no meio do gesto.
  if (el.classList.contains('is-dragging')) return
  const lead = _findActiveLead()
  if (lead && S.detailsOpen) {
    // Preserva scroll do .det-body antes de reescrever
    const prevBody = el.querySelector('.det-body')
    const savedScroll = prevBody ? prevBody.scrollTop : 0
    el.style.display = 'flex'
    el.style.width = ''
    const wasOpen = el.classList.contains('is-open')
    el.innerHTML = renderLeadDetailsPanel(lead)
    if (savedScroll > 0) {
      const newBody = el.querySelector('.det-body')
      if (newBody) newBody.scrollTop = savedScroll
    }
    // Slide-in animado: se ainda não tem .is-open, adiciona em next frame pra
    // o browser registrar primeiro o estado fechado (translateX(100%)) e aí
    // transicionar pra translateX(0). Mobile only — desktop ignora.
    if (!wasOpen && !el.classList.contains('is-dragging')) {
      requestAnimationFrame(() => {
        if (S.detailsOpen) el.classList.add('is-open')
      })
    }
    // event delegation — evita problemas com onclick em innerHTML
    el.onclick = (e) => {
      if (e.target.closest('[data-action="close-details"]')) {
        S.detailsOpen = false
        _patchInboxDetailsPanel()
        _patchInboxChatHeader()
      }
    }
  } else {
    // Fechando: remove .is-open → CSS transição faz slide-out pra direita.
    // Após 240ms (transição 220ms + folga), limpa innerHTML e display:none.
    if (el.classList.contains('is-open')) {
      el.classList.remove('is-open')
      setTimeout(() => {
        if (!S.detailsOpen) {
          el.style.display = 'none'
          el.style.width = '0'
          el.innerHTML = ''
          el.onclick = null
          // Reset transform inline caso tenha resíduo de gesto
          el.style.transform = ''
        }
      }, 240)
    } else {
      el.style.display = 'none'
      el.style.width = '0'
      el.innerHTML = ''
      el.onclick = null
      el.style.transform = ''
    }
  }
}


function _patchTagSuggestions(leadId) {
  const container = document.getElementById(`tag-suggestions-${leadId}`)
  if (!container) return
  const lead = S.leads.find(l => l.id === leadId)
  if (!lead) return
  const q = S.detailTagInput.trim().toLowerCase()
  const existing = lead.tags || []
  const suggestions = S.tagOptions.filter(t =>
    !existing.includes(t) && (q === '' || t.toLowerCase().includes(q))
  ).slice(0, 8)
  if (suggestions.length === 0) { container.innerHTML = ''; return }
  container.innerHTML = `<div style="position:absolute;left:0;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:20;overflow:hidden">
    ${suggestions.map(t => `
      <button onclick="detailAddTag('${leadId}','${esc(t)}')"
        style="width:100%;text-align:left;padding:7px 12px;font-size:12px;color:var(--text-primary);background:transparent;border:none;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:inherit"
        onmouseover="this.style.background='rgba(99,102,241,0.06)'"
        onmouseout="this.style.background='transparent'">${esc(t)}</button>
    `).join('')}
  </div>`
}

// Aplica o scroll correto ao abrir uma conversa.
// Executa imediatamente (layout síncrono já calculado pelo browser após innerHTML) e
// instala um ResizeObserver que re-aplica se o layout mudar (imagens carregando).
var _chatOpenScrollObs = null

function _applyChatOpenScroll() {
  if (_chatOpenScrollObs) { _chatOpenScrollObs.disconnect(); _chatOpenScrollObs = null }
  const convEl = document.getElementById('conv-msgs')
  if (!convEl) return

  function applyScroll() {
    const el = document.getElementById('conv-msgs')
    if (!el) return
    const unreadEl = el.querySelector('[data-unread-start]')
    if (unreadEl) {
      // Posiciona o separador "Não lidas" no topo visível, com 72px de contexto acima
      const sepTop = unreadEl.getBoundingClientRect().top - el.getBoundingClientRect().top
      el.scrollTop = Math.max(0, el.scrollTop + sepTop - 72)
      _chatAtBottom = false
    } else {
      el.scrollTop = el.scrollHeight
      _chatAtBottom = true
    }
  }

  // Primeira aplicação síncrona (layout já está calculado)
  applyScroll()

  // ResizeObserver: re-aplica se scrollHeight mudar (imagens/áudios carregando)
  // Desconecta após 4s ou após 3 re-aplicações
  let attempts = 0
  _chatOpenScrollObs = new ResizeObserver(() => {
    if (++attempts > 3) { _chatOpenScrollObs?.disconnect(); _chatOpenScrollObs = null; return }
    applyScroll()
  })
  _chatOpenScrollObs.observe(convEl)
  setTimeout(() => { _chatOpenScrollObs?.disconnect(); _chatOpenScrollObs = null }, 4000)
}

// Busca o lead ativo em S.leads E S.inboxLeads (S.leads é paginado; S.inboxLeads tem todos com mensagens)

function _findActiveLead() {
  if (!S.conversationLeadId) return null
  return S.leads.find(l => l.id === S.conversationLeadId) ||
         S.inboxLeads.find(l => l.id === S.conversationLeadId) ||
         (S.blockedLeads||[]).find(l => l.id === S.conversationLeadId) || null
}

// Reconstrói apenas o #inbox-chat-area (usado em openConversation)

function _rebuildChatArea() {
  const areaEl = document.getElementById('inbox-chat-area')
  if (!areaEl) {
    render()
    _setupChatScrollListener()
  if (typeof _setupKanbanPan === 'function') _setupKanbanPan()
    _applyChatOpenScroll()
    _scheduleMediaSweep()
    return
  }
  let lead = _findActiveLead()
  if (!lead && S.conversationLeadId) {
    // Lead não está em nenhum cache local ainda — cria stub e força full-fetch
    loadModule('leads').then(() => fetchLeads(true)).then(() => scheduleRender())
    lead = { id: S.conversationLeadId, name: '...', phone: '', unreadCount: 0 }
  }
  if (!lead) return
  areaEl.innerHTML = renderChatPanel(lead)
  _setupChatScrollListener()
  if (typeof _setupKanbanPan === 'function') _setupKanbanPan()
  _applyChatOpenScroll()
  _scheduleMediaSweep()  // FASE3-C: debounced
}


function handleReplyInput(el) {
  S.replyText = el.value
  autoResize(el)
  // Se template selecionado, mostra badge "editado" quando texto difere
  if (S.convTemplate) {
    const isEdited = el.value.trim() !== (S._templateRenderedBody || '').trim()
    const editBadge = document.getElementById('tmpl-chip-edited')
    if (editBadge) editBadge.style.display = isEdited ? '' : 'none'
  }
  // Abre/fecha picker sem render() global — atualiza apenas o container do picker
  if (el.value === '/' || (el.value.startsWith('/') && !el.value.includes(' '))) {
    S.templateSearch = el.value.slice(1)
    S.templatePicker = true
  } else {
    S.templatePicker = false
  }
  const pickerEl = document.getElementById('template-picker-container')
  if (pickerEl) pickerEl.innerHTML = S.templatePicker ? renderTemplatePicker() : ''
}

// Abre o template picker programaticamente (usado pelo botão de janela expirada).

function openTemplatePickerFromWarn() {
  const ta = document.getElementById('reply-input')
  S.replyText = '/'
  S.templateSearch = ''
  S.templatePicker = true
  if (ta) {
    ta.value = '/'
    ta.focus()
    try { ta.setSelectionRange(1, 1) } catch {}
    autoResize(ta)
  }
  const pickerEl = document.getElementById('template-picker-container')
  if (pickerEl) pickerEl.innerHTML = renderTemplatePicker()
}

// Fecha o template picker definitivamente: limpa estado, textarea e DOM do picker.
// Bypass do _patchInboxReplyBox que pode restaurar o valor "/" via save-focus logic.

function closeTemplatePicker() {
  S.templatePicker = false
  S.templateSearch = ''
  S.replyText = ''
  const ta = document.getElementById('reply-input')
  if (ta) { ta.value = ''; autoResize(ta) }
  const pickerEl = document.getElementById('template-picker-container')
  if (pickerEl) pickerEl.innerHTML = ''
}

// Listener global: fecha picker ao clicar fora dele (e fora do textarea, que reabriria)
document.addEventListener('click', function(e) {
  if (!S.templatePicker) return
  // Não fechar se clique foi no próprio picker, no textarea, ou em qualquer botão de seleção interno
  if (e.target.closest('#template-picker-container')) return
  if (e.target.closest('#reply-input')) return
  closeTemplatePicker()
}, true)


function updateTemplatePreview() {
  const tmpl = S.convTemplate
  if (!tmpl) return
  const bubble = document.getElementById('tmpl-preview-bubble')
  if (!bubble) return
  const body = tmpl.body || ''
  const previewBody = tmpl.variablesCount > 0
    ? body.replace(/\{\{(\d+)\}\}/g, (_, n) => {
        const val = S.convTemplateVars[parseInt(n) - 1] || ''
        return val ? `<strong>${esc(val)}</strong>` : `<span class="bg-yellow-100 text-yellow-700 rounded px-0.5">{{${n}}}</span>`
      })
    : esc(body)
  bubble.innerHTML = previewBody
}


function autoFillTemplateVars(vars, leadId, tmpl) {
  const lead = S.leads.find(l => l.id === leadId)
  if (!lead) return vars
  const firstName = (lead.name || '').split(' ')[0] || ''
  const phone = lead.phone || ''
  const fullName = lead.name || ''
  return vars.map((v, i) => {
    if (v) return v  // já preenchido, não sobrescreve
    // {{1}} sempre é o primeiro nome (padrão em templates de vendas)
    if (i === 0) return firstName
    // Demais variáveis: telefone ou nome completo como fallback
    if (i === 1) return phone || fullName
    return v
  })
}


function selectConvTemplate(t) {
  S.convTemplate = t
  S.convTemplateVars = autoFillTemplateVars(Array(t.variablesCount || 0).fill(''), S.conversationLeadId, t)
  S.templatePicker = false
  S.templateSearch = ''
  if (t.connectionId) S.convConnId = t.connectionId
  // Renderiza corpo com variáveis preenchidas e insere no textarea
  let _namedRenderIdx = 0
  const rendered = (t.body || t.name || '')
    .replace(/\{\{(\d+)\}\}/g, (_, i) => S.convTemplateVars[parseInt(i) - 1] || `{{${i}}}`)
    .replace(/\{\{[a-zA-Z_]\w*\}\}/g, () => S.convTemplateVars[_namedRenderIdx++] || '')
  S.replyText = rendered
  S._templateRenderedBody = rendered
  // Re-render completo: chip, botão enviar (canSendFreeText||tmpl) e textarea text
  // precisam refletir o novo estado. Partial update deixava o botão preso em disabled.
  render()
  const textarea = document.getElementById('reply-input')
  if (textarea) {
    textarea.focus()
    autoResize(textarea)
    textarea.setSelectionRange(rendered.length, rendered.length)
  }
}


function clearConvTemplate() {
  S.convTemplate = null
  S.convTemplateVars = []
  S._templateRenderedBody = ''
  S.replyText = ''
  render()
}


function _templateChipHTML() {
  const t = S.convTemplate
  if (!t) return ''
  return `<div id="tmpl-chip" style="display:inline-flex;align-items:center;gap:5px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:20px;padding:3px 10px 3px 7px;margin-bottom:6px">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
    <span style="font-size:11px;font-weight:600;color:#15803d">${esc(t.name)}</span>
    <span id="tmpl-chip-edited" style="font-size:10px;color:#f97316;display:none">· editado</span>
    <button onclick="clearConvTemplate()" style="margin-left:2px;background:none;border:none;cursor:pointer;color:#86efac;line-height:1;font-size:13px;padding:0" title="Remover template">×</button>
  </div>`
}

function _renderTemplateChip() {
  const chip = document.getElementById('tmpl-chip-wrap')
  if (!chip) return
  chip.innerHTML = _templateChipHTML()
}

// ─── Compartilhar Contato ─────────────────────────────────────────────────────

async function shareContactSend(contactName, contactPhone) {
  const leadId = S.conversationLeadId
  if (!leadId) return
  document.getElementById('share-contact-modal')?.remove()

  try {
    const res = await api(`/${encodeURIComponent(leadId)}/share-contact`, {
      method: 'POST',
      body: JSON.stringify({ contactName, contactPhone, connectionId: S.convConnId || undefined }),
    })
    // Append message to conversation
    if (!S.conversation) S.conversation = { messages: [], hasContact: true }
    const enriched = {
      ...res,
      metaResponse: { type: 'contacts', contacts: [{ name: { formatted_name: contactName }, phones: [{ phone: contactPhone }] }] },
      messageContent: `👤 ${contactName} · ${contactPhone}`,
    }
    if (S.conversation.messages) S.conversation.messages.push(enriched)
    if (!appendChatMsg(enriched, leadId)) { render(); scrollToBottomChat() }
    else scrollToBottomChat()
    showToast('Contato compartilhado', 'success')
  } catch(e) {
    showToast(e.message || 'Erro ao compartilhar contato', 'error')
  }
}


function startConvFromContact(phone) {
  if (!phone) return
  const lead = (S.leads || []).find(l => l.phone?.replace(/\D/g,'') === phone || l.phone === phone)
  if (lead) {
    openConversation(lead.id)
  } else {
    showToast(`Telefone: ${fmtPhone(phone)} — não encontrado como lead`, 'info')
  }
}


async function sendMessage() {
  if (S.replySending) return
  const leadId = S.conversationLeadId
  if (!leadId) return

  // Se há template mas o texto foi editado → descarta template e envia como texto livre
  if (S.convTemplate) {
    const _edited = S.replyText.trim() !== (S._templateRenderedBody || '').trim()
    if (_edited) {
      S.convTemplate = null; S.convTemplateVars = []; S._templateRenderedBody = ''
      _renderTemplateChip()
    }
  }

  if (S.convTemplate) {
    // ── Envia template — Optimistic UI (igual texto livre) ─────────────────
    if (!S.convConnId) { showToast('Selecione uma conexão','error'); return }

    const _tplLead = S.leads.find(l => l.id === leadId) || S._activeLead || {}
    const _tplFirstName = (_tplLead.name || '').split(' ')[0] || ''
    const _tplFullName  = _tplLead.name || ''
    const _tplPhone     = _tplLead.phone || ''
    let _namedIdx = 0
    const renderedBody = (S.convTemplate.body || S.convTemplate.name)
      .replace(/\{\{(\d+)\}\}/g, (_, i) => S.convTemplateVars[parseInt(i)-1] || `{{${i}}}`)
      .replace(/\{\{nome_completo\}\}/gi, _tplFullName || S.convTemplateVars[0] || '')
      .replace(/\{\{nome\}\}/gi,         _tplFirstName || S.convTemplateVars[0] || '')
      .replace(/\{\{telefone\}\}/gi,     _tplPhone || S.convTemplateVars[1] || '')
      .replace(/\{\{[a-zA-Z_]\w*\}\}/g, () => S.convTemplateVars[_namedIdx++] || '')

    // Snapshot antes de limpar estado
    const _tplName = S.convTemplate.name
    const _tplLang = S.convTemplate.language
    const _tplVars = [...S.convTemplateVars]
    const _connId  = S.convConnId

    // Mensagem otimista — aparece imediatamente com status "enviando"
    const tempId = `temp-${Date.now()}`
    const _now   = new Date().toISOString()
    const conn   = (S.connections||[]).find(c => c.id === _connId)
               || (S.unofficialSessions||[]).find(s => s.id === _connId) || null
    const tempMsg = {
      id: tempId,
      direction: 'OUTBOUND',
      messageType: 'TEMPLATE',
      messageContent: renderedBody,
      sentAt: _now,
      createdAt: _now,
      status: null,    // null → ícone relógio "enviando"
      connection: conn,
      payloadSent: S.me ? { senderUserId: S.me.id, senderUserName: S.me.name } : undefined,
    }

    if (!S.conversation) S.conversation = { messages: [], hasContact: true }
    // Força hasContact=true para que conv-msgs seja renderizado (não empty state)
    // — necessário quando é o primeiro template e ainda não há contato estabelecido
    S.conversation.hasContact = true
    S.conversation.messages.push(tempMsg)
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, unreadCount: 0, lastMessageAt: _now } : l)
    S.inboxLeads = S.inboxLeads.map(l => l.id === leadId ? { ...l, unreadCount: 0, lastMessageAt: _now } : l)
    S.msgPreviews[leadId] = { text: renderedBody, out: true }

    // Limpa template/inputs e insere a bolha imediatamente
    S.convTemplate = null; S.convTemplateVars = []; S._templateRenderedBody = ''; S.replyText = ''
    patchReplyInput(''); _renderTemplateChip()
    if (!appendChatMsg(tempMsg, leadId)) {
      // conv-msgs não existia (empty state / primeira mensagem) — força rebuild do overlay
      _convOverlayLeadId = ''
      render()
      scrollToBottomChat()
    }
    if (typeof _patchInboxListPanel === 'function') _patchInboxListPanel()
    playSendSound()
    api(`/${leadId}/read`, { method: 'POST' }).catch(() => {})

    // Dispara API em background — não bloqueia UI
    api(`/${leadId}/start-conversation`, {
      method: 'POST',
      body: JSON.stringify({
        connectionId: _connId,
        templateName: _tplName,
        language:     _tplLang,
        variables:    _tplVars,
        messageText:  renderedBody,
      }),
    })
    .then(msg => {
      // Substitui ID temp → real no DOM e atualiza ícone de status
      const node = document.querySelector(`[data-msg-id="${tempId}"]`)
      if (node) {
        node.setAttribute('data-msg-id', msg.id)
        const statusEl = node.querySelector('[data-msg-status]')
        if (statusEl) statusEl.innerHTML = msgStatusIcon(msg.status, msg.status === 'FAILED')
        // Se backend retornou FAILED (ex: 131049 anti-spam Meta), pinta a bolha e adiciona
        // explicação inline AGORA — sem esperar refresh de 3s. Mesmo fix aplicado em sendReply.
        if (msg.status === 'FAILED') {
          const bubble = node.querySelector('div')
          if (bubble) {
            bubble.style.background = '#fef2f2'
            bubble.style.color = '#7f1d1d'
            bubble.style.border = '1px solid #fecaca'
            bubble.style.boxShadow = 'none'
            if (!bubble.querySelector('.msg-err')) {
              const p = document.createElement('p')
              p.className = 'msg-err'
              p.style.cssText = 'font-size:10.5px;margin:5px 0 0;color:#ef4444;border-top:1px solid #fecaca;padding-top:4px'
              p.textContent = '⚠ ' + fmtMsgError(msg)
              bubble.appendChild(p)
            }
          }
        }
      }
      if (S.conversation) S.conversation.messages = S.conversation.messages.map(m => m.id === tempId ? msg : m)
      if (msg.messageContent) S.msgPreviews[leadId] = { text: msg.messageContent, out: true }
      const _tplNow = msg.sentAt || _now
      S.leads = S.leads.map(l => l.id === leadId ? { ...l, lastMessageAt: _tplNow > (l.lastMessageAt||'') ? _tplNow : l.lastMessageAt } : l)
      // Refresh leve após 3s para capturar status atualizado pelo webhook
      setTimeout(async () => {
        if (S.conversationLeadId !== leadId) return
        try {
          const fresh = await api(`/${leadId}/conversation`)
          if (fresh.messages) fresh.messages.sort((a,b) => new Date(a.sentAt||a.createdAt) - new Date(b.sentAt||b.createdAt))
          S.conversation = fresh
          patchMsgStatuses(fresh.messages || [])
        } catch(_) {}
      }, 3000)
    })
    .catch(e => {
      // Marca bolha otimista como falha no DOM
      const node = document.querySelector(`[data-msg-id="${tempId}"]`)
      if (node) {
        const statusEl = node.querySelector('[data-msg-status]')
        if (statusEl) statusEl.innerHTML = msgStatusIcon('FAILED', true)
        const bubble = node.querySelector('div')
        if (bubble) {
          bubble.style.background = '#fff1f2'
          bubble.style.border = '1px solid #fecaca'
          if (!bubble.querySelector('.msg-err')) {
            const p = document.createElement('p')
            p.className = 'msg-err'
            p.style.cssText = 'font-size:10px;margin:4px 0 0;color:#ef4444;border-top:1px solid #fecaca;padding-top:4px'
            p.textContent = '⚠ ' + (e.message || 'Erro ao enviar')
            bubble.appendChild(p)
          }
        }
      }
      if (S.conversation) S.conversation.messages = S.conversation.messages.filter(m => m.id !== tempId)
      const codeMatch = (e.message||'').match(/\(c[oó]digo\s+(\d+)\)/) || (e.message||'').match(/code[:\s]+(\d+)/i)
      const waCode = codeMatch?.[1]
      const friendly = waCode && WA_ERRORS[waCode]
      showToast(friendly || e.message, 'error')
    })

  } else {
    // ── Envia texto livre — UI Otimista ─────────────────────────────────────
    const text = S.replyText.trim()
    // WhatsApp Web / não-oficial não tem janela de 24h — pode mandar texto sem mensagem prévia.
    const _isUnoffSend = (S.unofficialSessions||[]).some(s => s.id === S.convConnId)
    if (!text || (!S.conversation?.hasContact && !_isUnoffSend)) return

    // Monta mensagem temporária e exibe imediatamente
    const tempId = `temp-${Date.now()}`
    const _now = new Date().toISOString()
    const conn = S.convConnId
      ? ((S.connections||[]).find(c => c.id === S.convConnId) || (S.unofficialSessions||[]).find(s => s.id === S.convConnId) || null)
      : null
    const tempMsg = {
      id: tempId,
      direction: 'OUTBOUND',
      messageType: 'TEXT',
      messageContent: text,
      sentAt: _now,
      createdAt: _now,
      status: null, // ícone "Enviando" (relógio)
      connection: conn,
      payloadSent: S.me ? { senderUserId: S.me.id, senderUserName: S.me.name } : undefined,
    }

    S.replyText = ''
    patchReplyInput('')
    if (S.conversation) S.conversation.messages.push(tempMsg)
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, unreadCount: 0, lastMessageAt: _now } : l)
    // Atualiza sidebar de Conversas imediatamente (sem esperar polling)
    S.inboxLeads = S.inboxLeads.map(l => l.id === leadId ? { ...l, unreadCount: 0, lastMessageAt: _now } : l)
    S.msgPreviews[leadId] = { text, out: true }
    if (!appendChatMsg(tempMsg, leadId)) {
      // conv-msgs não existia (empty state / primeira mensagem) — força rebuild do overlay
      _convOverlayLeadId = ''
      render()
      scrollToBottomChat()
    }
    // Re-renderiza sidebar inbox in-place (move lead pro topo, atualiza preview/timer)
    if (typeof _patchInboxListPanel === 'function') _patchInboxListPanel()
    playSendSound()

    // API em background — botão já está liberado
    _doReplySend(leadId, text, S.convConnId, false, tempId, _now)
  }
}

// Helper: dispara POST /reply e trata erro de cold outbound com confirm.
// Extraído de sendMessage pra permitir retry com forceColdOutbound=true.

async function _doReplySend(leadId, text, connId, forceColdOutbound, tempId, _now) {
    api(`/${leadId}/reply`, { method: 'POST', body: JSON.stringify({ text, connectionId: connId || undefined, forceColdOutbound: forceColdOutbound || undefined }) })
      .then(msg => {
        // Troca ID temp → real no DOM
        const node = document.querySelector(`[data-msg-id="${tempId}"]`)
        if (node) {
          node.setAttribute('data-msg-id', msg.id)
          const statusEl = node.querySelector('[data-msg-status]')
          if (statusEl) statusEl.innerHTML = msgStatusIcon(msg.status, msg.status === 'FAILED')
          // Se backend retornou FAILED com errorCode/errorMessage (ex: 131049 anti-spam Meta),
          // pinta a bolha de vermelho e adiciona explicação inline AGORA — sem esperar o
          // refresh de 3s. Antes, operador via só "Falhou" sem motivo até a page recarregar.
          if (msg.status === 'FAILED') {
            const bubble = node.querySelector('div')
            if (bubble) {
              bubble.style.background = '#fef2f2'
              bubble.style.color = '#7f1d1d'
              bubble.style.border = '1px solid #fecaca'
              bubble.style.boxShadow = 'none'
              if (!bubble.querySelector('.msg-err')) {
                const p = document.createElement('p')
                p.className = 'msg-err'
                p.style.cssText = 'font-size:10.5px;margin:5px 0 0;color:#ef4444;border-top:1px solid #fecaca;padding-top:4px'
                p.textContent = '⚠ ' + fmtMsgError(msg)
                bubble.appendChild(p)
              }
            }
          }
        }
        // Atualiza estado
        if (S.conversation) S.conversation.messages = S.conversation.messages.map(m => m.id === tempId ? msg : m)
        if (msg.messageContent) S.msgPreviews[leadId] = { text: msg.messageContent, out: true }
        api(`/${leadId}/read`, { method: 'POST' }).catch(()=>{})
        // Refresh após 3s para capturar status atualizado do webhook
        setTimeout(async () => {
          if (S.conversationLeadId !== leadId) return
          try {
            const fresh = await api(`/${leadId}/conversation`)
            S.conversation = fresh
            S.conversation.messages = (S.conversation.messages || []).slice().sort((a,b) => new Date(a.sentAt||a.createdAt) - new Date(b.sentAt||b.createdAt))
            S.leads = S.leads.map(l => l.id === leadId ? { ...l, lastMessageAt: _now > (l.lastMessageAt||'') ? _now : l.lastMessageAt } : l)
            patchMsgStatuses(fresh.messages || [])
          } catch(_) {}
        }, 3000)
      })
      .catch(e => {
        // Anti-ban: se for cold outbound, mensagem vem como JSON com quota — pergunta antes
        const parsed = (() => { try { return JSON.parse(e.message || '') } catch { return null } })()
        if (parsed && typeof parsed.coldCapToday === 'number' && !forceColdOutbound) {
          // Remove bolha temp e oferece retry com força
          if (S.conversation) S.conversation.messages = S.conversation.messages.filter(m => m.id !== tempId)
          const node = document.querySelector(`[data-msg-id="${tempId}"]`)
          if (node) node.remove()
          const ok = window.confirm(
            'Anti-ban: este contato nunca enviou mensagem nesta sessão WhatsApp Web.\n\n' +
            'Cold outbound = risco alto de ban do número.\n\n' +
            `Quota de hoje: ${parsed.usedToday}/${parsed.coldCapToday} (sessão pareada há ${parsed.daysSincePair} dia(s))\n\n` +
            'Enviar mesmo assim?'
          )
          if (ok) {
            // Re-insere bolha otimista e retry com flag forçada
            const conn = S.convConnId
              ? ((S.connections||[]).find(c => c.id === S.convConnId) || (S.unofficialSessions||[]).find(s => s.id === S.convConnId) || null)
              : null
            const newTempId = `temp-${Date.now()}`
            const retryMsg = { id: newTempId, direction:'OUTBOUND', messageType:'TEXT', messageContent: text, sentAt: _now, createdAt: _now, status: null, connection: conn }
            if (S.conversation) S.conversation.messages.push(retryMsg)
            appendChatMsg(retryMsg, leadId) || render()
            _doReplySend(leadId, text, connId, true, newTempId, _now)
          } else {
            S.replyText = text
            patchReplyInput(text)
          }
          return
        }
        // Marca mensagem temp como falha no DOM
        const node = document.querySelector(`[data-msg-id="${tempId}"]`)
        if (node) {
          const statusEl = node.querySelector('[data-msg-status]')
          if (statusEl) statusEl.innerHTML = msgStatusIcon('FAILED', true)
          const bubble = node.querySelector('div')
          if (bubble) {
            bubble.style.background = '#fff1f2'
            bubble.style.border = '1px solid #fecaca'
            if (!bubble.querySelector('.msg-err')) {
              const p = document.createElement('p')
              p.className = 'msg-err'
              p.style.cssText = 'font-size:10px;margin:4px 0 0;color:#ef4444;border-top:1px solid #fecaca;padding-top:4px'
              p.textContent = '⚠ ' + (e.message || 'Erro ao enviar')
              bubble.appendChild(p)
            }
          }
        }
        if (S.conversation) S.conversation.messages = S.conversation.messages.filter(m => m.id !== tempId)
        showToast(e.message, 'error')
        S.replyText = text
        patchReplyInput(text)
      })
}

// ── Patches cirúrgicos do chat ─────────────────────────────────────────────

// Adiciona UMA mensagem ao final do DOM sem recriar nenhum nó existente.
// Scroll para o final imediatamente (síncrono, sem rAF).
// Retorna false se #conv-msgs não existe (fallback para render).

function appendChatMsg(msg, leadId) {
  const el = document.getElementById('conv-msgs')
  if (!el) return false
  if (el.querySelector(`[data-msg-id="${msg.id}"]`)) return true  // já existe, ignorar

  // Injeta separador de data se o dia mudou em relação ao último separador no DOM
  const msgDate = new Date(msg.sentAt || msg.createdAt)
  const msgDateKey = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`
  const sepEls = el.querySelectorAll('[data-date-sep]')
  const lastSepKey = sepEls.length > 0 ? sepEls[sepEls.length - 1].dataset.dateKey : null
  if (lastSepKey !== msgDateKey) {
    const sepDiv = document.createElement('div')
    sepDiv.innerHTML = _renderDateSep(_fmtDateSep(msgDate), msgDateKey)
    const sepEl = sepDiv.firstElementChild
    if (sepEl) el.appendChild(sepEl)
  }

  const div = document.createElement('div')
  div.innerHTML = renderSingleMsg(msg, leadId || S.conversationLeadId)
  while (div.firstElementChild) el.appendChild(div.firstElementChild)
  // Sempre vai para o bottom ao enviar/receber — é o comportamento esperado
  el.scrollTop = el.scrollHeight
  _chatAtBottom = true
  _scheduleMediaSweep()  // FASE3-C: debounced — coalece bursts de mensagens em 1 varredura
  return true
}

// Recria todas as mensagens dentro de #conv-msgs (usado no refresh de status 3s).
// scrollToBottom=false: preserva posição do usuário.

function patchChatMsgs(leadId, forceScrollToBottom = false) {
  const el = document.getElementById('conv-msgs')
  if (!el) return false
  // Usa o estado persistente — nunca recalcula aqui para evitar leitura do layout
  const pin = forceScrollToBottom || _chatAtBottom
  const savedTop = pin ? null : el.scrollTop
  el.innerHTML = renderMsgItems(S.conversation?.messages || [], leadId || S.conversationLeadId)
  // Restaura scroll sincronamente — mesmo frame de paint, sem salto
  if (pin) { el.scrollTop = el.scrollHeight; _chatAtBottom = true }
  else el.scrollTop = savedTop
  _scheduleMediaSweep()  // FASE3-C: debounced
  return true
}

// Atualiza apenas os ícones de status in-place — zero reflow, zero scroll movement

function patchMsgStatuses(messages) {
  const container = document.getElementById('conv-msgs')
  if (!container) return false
  let changed = false
  for (const m of messages) {
    if (m.direction !== 'OUTBOUND') continue
    const node = container.querySelector(`[data-msg-id="${m.id}"]`)
    if (!node) continue
    const statusEl = node.querySelector('[data-msg-status]')
    if (!statusEl) continue
    const newHtml = msgStatusIcon(m.status, m.status === 'FAILED')
    if (statusEl.innerHTML !== newHtml) { statusEl.innerHTML = newHtml; changed = true }
  }
  return changed
}

// Atualiza estado do botão de enviar sem rebuild global

function patchSendBtn(sending) {
  const btn = document.getElementById('chat-send-btn')
  if (!btn) return
  btn.disabled = sending
  btn.innerHTML = sending
    ? `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>`
    : `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>`
}

// Atualiza o textarea do reply sem rebuild global

function patchReplyInput(value) {
  const el = document.getElementById('reply-input')
  if (el) el.value = value
}

// Renderiza apenas os itens de mensagem (sem o container)
var WA_ERRORS = {
  '131047': 'Janela de 24h expirada — o contato não enviou mensagem recentemente. Use um template (/) para iniciar a conversa.',
  '131026': 'Número não encontrado no WhatsApp ou mensagem não entregável.',
  '131049': 'Mensagem bloqueada pela Meta para proteger o ecossistema. Geralmente acontece quando a conexão acumula muitos reports/spam ou conteúdo é considerado promocional excessivo. Reduza frequência de envios e priorize mensagens conversacionais.',
  '131042': 'Elegibilidade do Business bloqueada pela Meta. Pode ser: business não verificado, faturas em aberto, método de pagamento inválido, ou conta restrita. Verifique em business.facebook.com → Configurações da empresa → Verificação + Faturas.',
  '132000': 'Número de variáveis não corresponde ao template. Sincronize o template novamente em Conexões → Templates.',
  '131005': 'Acesso negado — verifique as permissões do token ou se há pagamento pendente no WABA.',
  '131000': 'Erro interno do WhatsApp. Tente novamente em alguns instantes.',
  '130429': 'Limite de envios atingido. Aguarde antes de tentar novamente.',
  '130472': 'Conta do destinatário em experimento da Meta — entrega temporariamente bloqueada. Tente novamente em alguns dias.',
  '131008': 'Parâmetro obrigatório ausente na mensagem.',
  '131009': 'Valor de parâmetro inválido.',
  '131021': 'Número não está na lista de contatos de teste (modo sandbox).',
  '131031': 'Conta do WhatsApp Business bloqueada ou suspensa.',
  '131048': 'Número na lista de bloqueio — o destinatário optou por não receber mensagens desta empresa.',
  '131051': 'Tipo de mensagem não suportado para este destinatário.',
  '190':    'Token de acesso inválido ou expirado. Atualize o token na conexão.',
}

// Helper: monta texto de erro pra balão de mensagem.
// Sempre inclui o código no final pra operador conseguir identificar qual é.

function msgStatusIcon(status, isFailed) {
  if (isFailed) return `<span class="inline-flex items-center gap-0.5"><svg class="inline w-3.5 h-3.5 text-red-400" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4a.75.75 0 00-1.5 0v3.25a.75.75 0 001.5 0V5zm-.75 6.5a.875.875 0 110-1.75.875.875 0 010 1.75z"/></svg><span class="text-[9px] text-red-400">Falhou</span></span>`
  if (status === 'READ')
    return `<span class="inline-flex items-center gap-0.5"><svg class="inline w-4 h-3.5 text-blue-300" viewBox="0 0 18 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6l4 4L13 1"/><path d="M6 6l4 4 4-9"/></svg><span class="text-[9px] text-blue-300">Lido</span></span>`
  if (status === 'DELIVERED')
    return `<span class="inline-flex items-center gap-0.5"><svg class="inline w-4 h-3.5 opacity-60" viewBox="0 0 18 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6l4 4L13 1"/><path d="M6 6l4 4 4-9"/></svg><span class="text-[9px] opacity-60">Entregue</span></span>`
  if (status === 'SENT')
    return `<span class="inline-flex items-center gap-0.5"><svg class="inline w-3.5 h-3.5 opacity-60" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5l3.5 4L11 1"/></svg><span class="text-[9px] opacity-60">Enviado</span></span>`
  return `<span class="inline-flex items-center gap-0.5"><svg class="inline w-3 h-3 opacity-40" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4.25a.75.75 0 00-1.5 0V8c0 .199.079.39.22.53l2 2a.75.75 0 101.06-1.06L8.75 7.94V5.25z"/></svg><span class="text-[9px] opacity-40">Enviando</span></span>`
}


function renderEventItem(ev) {
  const time = new Date(ev.createdAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
  let label = ''
  let icon = ''

  if (ev.type === 'ASSIGNED') {
    const to = ev.payload?.toName || 'alguém'
    const by = ev.actorName || 'Sistema'
    icon = `<svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`
    label = `Atribuído a <b>${esc(to)}</b>${ev.actorName ? ` por ${esc(by)}` : ''}`
  } else if (ev.type === 'UNASSIGNED') {
    const by = ev.actorName || 'Sistema'
    icon = `<svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h14v-1a6 6 0 00-6-6zm9-1l2 2m0 0l2-2m-2 2V8"/></svg>`
    label = `Atribuição removida${ev.actorName ? ` por ${esc(by)}` : ''}`
  } else if (ev.type === 'STAGE_CHANGED') {
    // Backend salva payload como { fromId, fromName, toId, toName }.
    // Usa os nomes do payload primeiro (sempre disponíveis), com fallback
    // pra lookup nos stages atuais (pega cor + lida com payloads antigos).
    const stages = S.kanban?.stages || []
    const toId   = ev.payload?.toId   ?? ev.payload?.stageId        // fallback chave antiga
    const fromId = ev.payload?.fromId ?? ev.payload?.fromStageId    // fallback chave antiga
    const toStage   = toId   ? stages.find(s => s.id === toId)   : null
    const fromStage = fromId ? stages.find(s => s.id === fromId) : null
    const toName   = ev.payload?.toName   ?? toStage?.name   ?? 'Sem Etapa'
    const fromName = ev.payload?.fromName ?? fromStage?.name ?? null
    const toColor  = toStage?.color  || '#94a3b8'
    const by = ev.actorName || null
    icon = `<svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`
    label = `${fromName ? `<b>${esc(fromName)}</b> → ` : 'Etapa → '}<b style="color:${esc(toColor)}">${esc(toName)}</b>${by ? ` · ${esc(by)}` : ''}`
  } else {
    return ''  // ignora tipos desconhecidos
  }

  return `<div style="display:flex;justify-content:center;margin:4px 0;padding:0 16px">
    <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#9ca3af;background:#f3f4f6;border-radius:99px;padding:2px 10px;text-align:center;line-height:1.5">
      ${icon}${label} · ${time}
    </span>
  </div>`
}

// ─── Separador de data estilo WhatsApp ───────────────────────────────────────

function _renderDateSep(label, dateKey) {
  return `<div data-date-sep data-date-key="${dateKey || ''}" class="cv-day-sep">
    <span class="cv-day-sep-label">${label}</span>
  </div>`
}

// ── Janela de mensagens — renderiza só as últimas N mensagens inicialmente ─────
var CONV_MSG_WINDOW = 80      // itens renderizados por abertura
var CONV_MSG_LOAD_MORE = 50   // itens carregados por "ver mais"
var _convMsgOffset = 0          // índice no merged array do primeiro item renderizado


function loadOlderConvMsgs() {
  const el = document.getElementById('conv-msgs')
  if (!el || _convMsgOffset === 0) return

  const events = (S.conversation?.events || []).map(e => ({ ...e, _isEvent: true, _sortKey: new Date(e.createdAt).getTime() }))
  const msgs   = (S.conversation?.messages || []).map(m => ({ ...m, _isEvent: false, _sortKey: new Date(m.sentAt || m.createdAt).getTime() }))
  const merged = [...msgs, ...events].sort((a, b) => a._sortKey - b._sortKey)

  const newStart = Math.max(0, _convMsgOffset - CONV_MSG_LOAD_MORE)
  const chunk    = merged.slice(newStart, _convMsgOffset)
  const leadId   = S.conversationLeadId

  // lastDateKey para o chunk: data do item imediatamente anterior ao chunk
  let lastDateKey = null
  if (newStart > 0) {
    const prev = merged[newStart - 1]
    const prevDate = new Date(prev._isEvent ? prev.createdAt : (prev.sentAt || prev.createdAt))
    lastDateKey = `${prevDate.getFullYear()}-${prevDate.getMonth()}-${prevDate.getDate()}`
  }

  const chunkHtml = chunk.map(item => {
    const itemDate = new Date(item._isEvent ? item.createdAt : (item.sentAt || item.createdAt))
    const dateKey  = `${itemDate.getFullYear()}-${itemDate.getMonth()}-${itemDate.getDate()}`
    const dateSep  = dateKey !== lastDateKey ? _renderDateSep(_fmtDateSep(itemDate), dateKey) : ''
    lastDateKey = dateKey
    if (item._isEvent) return dateSep + renderEventItem(item)
    return dateSep + renderSingleMsg(item, leadId)
  }).join('')

  // Preserva posição de scroll antes de inserir conteúdo acima
  const oldHeight = el.scrollHeight
  const oldTop    = el.scrollTop

  const sentinel = document.getElementById('conv-older-sentinel')
  const div = document.createElement('div')
  div.innerHTML = chunkHtml
  const anchor = sentinel ? sentinel.nextSibling : el.firstChild
  while (div.firstChild) el.insertBefore(div.firstChild, anchor)

  // Compensa o conteúdo adicionado acima para não saltar
  el.scrollTop = oldTop + (el.scrollHeight - oldHeight)

  _convMsgOffset = newStart

  // Atualiza ou remove o sentinel
  if (newStart === 0) {
    sentinel?.remove()
  } else if (sentinel) {
    const btn = sentinel.querySelector('button')
    if (btn) btn.textContent = `↑ Ver mensagens anteriores (${newStart} ocultas)`
  }

  _scheduleMediaSweep()
}


function renderMsgItems(messages, leadId) {
  // Pra decidir se mostra "por <nome>": só aparece quando o sender NAO eh o dono do lead.
  // Lead atribuido ao Cesar respondendo => esconde (esperado). Outro operador => mostra.
  const _leadCtx = S.leads?.find(l => l.id === leadId) || S.inboxLeads?.find(l => l.id === leadId)
  const _assignedToId = _leadCtx?.assignedToId || null
  const events = (S.conversation?.events || []).map(e => ({ ...e, _isEvent: true, _sortKey: new Date(e.createdAt).getTime() }))
  const msgs = (messages || []).map(m => ({ ...m, _isEvent: false, _sortKey: new Date(m.sentAt || m.createdAt).getTime() }))
  const merged = [...msgs, ...events].sort((a, b) => a._sortKey - b._sortKey)

  // ── Janela: renderiza só as últimas CONV_MSG_WINDOW entradas ─────────────
  const total  = merged.length
  const start  = Math.max(0, total - CONV_MSG_WINDOW)
  _convMsgOffset = start

  // Sentinel de "carregar mais antigas" — só aparece se houver mensagens acima da janela
  const sentinelHtml = start > 0
    ? `<div id="conv-older-sentinel" style="display:flex;justify-content:center;padding:10px 0 6px">
        <button onclick="loadOlderConvMsgs()" style="font-size:11.5px;color:#667781;background:#e9edef;border:none;border-radius:99px;padding:5px 16px;cursor:pointer;font-family:inherit;font-weight:500">
          ↑ Ver mensagens anteriores (${start} ocultas)
        </button>
       </div>`
    : ''

  // Determina primeira mensagem não lida (do array completo — pode estar na janela)
  const lead = S.leads.find(l => l.id === leadId)
  const unreadCount = lead?.unreadCount || 0
  let firstUnreadId = null
  if (unreadCount > 0) {
    const inbounds = merged.filter(m => !m._isEvent && m.direction === 'INBOUND')
    const firstUnread = inbounds[inbounds.length - unreadCount]
    if (firstUnread) firstUnreadId = firstUnread.id
  }

  // lastDateKey inicial: data do item imediatamente antes da janela (evita data duplicada)
  let lastDateKey = null
  if (start > 0) {
    const prev = merged[start - 1]
    const prevDate = new Date(prev._isEvent ? prev.createdAt : (prev.sentAt || prev.createdAt))
    lastDateKey = `${prevDate.getFullYear()}-${prevDate.getMonth()}-${prevDate.getDate()}`
  }

  const windowed = merged.slice(start)

  return sentinelHtml + windowed.map(item => {
    const itemTs  = item._isEvent ? item.createdAt : (item.sentAt || item.createdAt)
    const itemDate = new Date(itemTs)
    const dateKey  = `${itemDate.getFullYear()}-${itemDate.getMonth()}-${itemDate.getDate()}`
    const dateSep  = dateKey !== lastDateKey ? _renderDateSep(_fmtDateSep(itemDate), dateKey) : ''
    lastDateKey = dateKey

    if (item._isEvent) return dateSep + renderEventItem(item)
    const m = item

    const msgDate = new Date(m.sentAt || m.createdAt)
    const unreadSep = (firstUnreadId && m.id === firstUnreadId)
      ? `<div data-unread-start class="cv-unread-sep">
           <span class="cv-unread-sep-label">NÃO LIDAS</span>
         </div>`
      : ''

    const isOut = m.direction === 'OUTBOUND'
    const isFailed = m.status === 'FAILED'
    const time = msgDate.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
    const statusIcon = isOut ? msgStatusIcon(m.status, isFailed) : ''
    const connName = m.connection?.name || null
    const isTelegram = m.channel === 'TELEGRAM'
    const syncedFromPhone = isOut && m.metaResponse?._syncedFromPhone === true
    const failReason = isFailed ? fmtMsgError(m) : null
    const bubbleBg    = isFailed ? '#fef2f2' : isOut ? 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' : '#ffffff'
    const bubbleColor = isFailed ? '#7f1d1d' : isOut ? '#ffffff' : '#111318'
    const bubbleBorder = isFailed ? '1px solid #fecaca' : isOut ? 'none' : '1px solid var(--border)'
    const bubbleRadius = isOut ? '14px 14px 4px 14px' : '14px 14px 14px 4px'
    const bubbleShadow = isOut ? '0 4px 12px rgba(79,70,229,0.18)' : '0 1px 2px rgba(17,19,24,0.04)'
    const timeColor   = isFailed ? '#ef4444' : isOut ? 'rgba(255,255,255,0.7)' : '#9ca3af'

    const metaLabel = isTelegram
      ? `<p style="font-size:9.5px;color:#2481cc;margin:0 0 2px;display:flex;align-items:center;gap:3px"><svg width="9" height="9" viewBox="0 0 24 24" fill="#2481cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>Telegram</p>`
      : connName ? `<p style="font-size:9.5px;color:#aab0b7;margin:0 0 2px">${isOut ? 'via' : '📲'} ${esc(connName)}${syncedFromPhone ? ' · app' : ''}</p>`
      : syncedFromPhone ? `<p style="font-size:9.5px;color:#aab0b7;margin:0 0 2px">📱 Enviado pelo app</p>` : ''

    const senderLabel = isOut && m.aiAgentId
      ? `<p style="font-size:9.5px;margin:0 0 2px;padding:0 4px;font-weight:700;letter-spacing:0.02em"><span style="background:linear-gradient(135deg,#4f46e5 0%,#ec4899 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">🤖 IA</span></p>`
      : (isOut && m.payloadSent?.senderUserName && m.payloadSent.senderUserId !== _assignedToId
        ? `<p style="font-size:9.5px;color:#6b7280;margin:0 0 2px;padding:0 4px;font-weight:500">por <span style="color:#4f46e5">${esc(m.payloadSent.senderUserName)}</span></p>`
        : '')

    return dateSep + unreadSep + `<div style="display:flex;flex-direction:column;align-items:${isOut?'flex-end':'flex-start'};margin-bottom:3px" data-msg-id="${m.id}">
      ${metaLabel}${senderLabel}
      <div style="max-width:75%;background:${bubbleBg};color:${bubbleColor};border:${bubbleBorder};border-radius:${bubbleRadius};padding:8px 12px 6px;box-shadow:${bubbleShadow}">
        ${renderMessageContent(m, isOut, leadId)}
        <p style="font-size:10px;margin:3px 0 0;display:flex;align-items:center;justify-content:flex-end;gap:3px;color:${timeColor};font-family:'JetBrains Mono',monospace">
          ${time}<span data-msg-status>${statusIcon}</span>
        </p>
        ${failReason ? `<p style="font-size:10.5px;margin:5px 0 0;color:#ef4444;border-top:1px solid #fecaca;padding-top:4px">⚠ ${esc(failReason)}</p>` : ''}
      </div>
    </div>`
  }).join('')
}

// Renderiza uma única mensagem (sem eventos) para appendChatMsg

function renderSingleMsg(m, leadId) {
  const isOut = m.direction === 'OUTBOUND'
  const time = new Date(m.sentAt || m.createdAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
  const isFailed = m.status === 'FAILED'
  const statusIcon = isOut ? msgStatusIcon(m.status, isFailed) : ''
  const connName = m.connection?.name || null
  const isTelegram = m.channel === 'TELEGRAM'
  const syncedFromPhone = isOut && m.metaResponse?._syncedFromPhone === true
  const failReason = isFailed ? fmtMsgError(m) : null
  const bubbleBg = isFailed ? '#fef2f2' : isOut ? 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' : '#ffffff'
  const bubbleColor = isFailed ? '#7f1d1d' : isOut ? '#ffffff' : '#111318'
  const bubbleBorder = isFailed ? '1px solid #fecaca' : isOut ? 'none' : '1px solid var(--border)'
  const bubbleRadius = isOut ? '14px 14px 4px 14px' : '14px 14px 14px 4px'
  const bubbleShadow = isOut ? '0 4px 12px rgba(79,70,229,0.18)' : '0 1px 2px rgba(17,19,24,0.04)'
  const timeColor = isFailed ? '#ef4444' : isOut ? 'rgba(255,255,255,0.7)' : '#9ca3af'
  const tgLabel = isTelegram ? `<p style="font-size:9.5px;color:#2481cc;margin:0 0 3px;padding:0 4px;display:flex;align-items:center;gap:3px"><svg width="9" height="9" viewBox="0 0 24 24" fill="#2481cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> Telegram</p>` : ''
  const _leadCtxSingle = S.leads?.find(l => l.id === leadId) || S.inboxLeads?.find(l => l.id === leadId)
  const _assignedToIdSingle = _leadCtxSingle?.assignedToId || null
  const senderLabelSingle = isOut && m.aiAgentId
    ? `<p style="font-size:9.5px;margin:0 0 3px;padding:0 4px;font-weight:700;letter-spacing:0.02em"><span style="background:linear-gradient(135deg,#4f46e5 0%,#ec4899 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">🤖 IA</span></p>`
    : (isOut && m.payloadSent?.senderUserName && m.payloadSent.senderUserId !== _assignedToIdSingle
      ? `<p style="font-size:9.5px;color:#6b7280;margin:0 0 3px;padding:0 4px;font-weight:500">por <span style="color:#4f46e5">${esc(m.payloadSent.senderUserName)}</span></p>`
      : '')
  return `<div style="display:flex;flex-direction:column;align-items:${isOut?'flex-end':'flex-start'};margin-bottom:2px" data-msg-id="${m.id}">
    ${tgLabel}${connName && !isTelegram ? `<p style="font-size:9.5px;color:#aab0b7;margin:0 0 3px;padding:0 4px">${isOut ? 'via' : '📲'} ${esc(connName)}${syncedFromPhone ? ' · <svg style="display:inline;vertical-align:middle" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg> app' : ''}</p>` : syncedFromPhone && !isTelegram ? `<p style="font-size:9.5px;color:#aab0b7;margin:0 0 3px;padding:0 4px;display:flex;align-items:center;gap:3px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg> Enviado pelo app</p>` : ''}${senderLabelSingle}
    <div style="max-width:72%;background:${bubbleBg};color:${bubbleColor};border:${bubbleBorder};border-radius:${bubbleRadius};padding:8px 12px 6px;box-shadow:${bubbleShadow}">
      ${renderMessageContent(m, isOut, leadId)}
      <p style="font-size:10px;margin:3px 0 0;display:flex;align-items:center;justify-content:flex-end;gap:3px;color:${timeColor};font-family:'JetBrains Mono',monospace">
        ${time}
        <span data-msg-status>${statusIcon}</span>
      </p>
      ${failReason ? `<p style="font-size:10px;margin:4px 0 0;color:#ef4444;border-top:1px solid #fecaca;padding-top:4px">⚠ ${esc(failReason)}</p>` : ''}
    </div>
  </div>`
}


function renderTemplatePicker() {
  const search = (S.templateSearch||'').toLowerCase()
  const textMatches = (S.textModels||[]).filter(m =>
    !search || m.name.toLowerCase().includes(search) || m.content.toLowerCase().includes(search)
  )
  const waMatches = (S.convTemplates||[]).filter(t =>
    (!S.convConnId || t.connectionId === S.convConnId) &&
    (!search || t.name.toLowerCase().includes(search))
  )
  const audioMatches = (S.audioModels||[]).filter(m =>
    !search || m.name.toLowerCase().includes(search)
  )
  const total = textMatches.length + waMatches.length + audioMatches.length
  if (!S.templatePicker || total === 0) return ''
  return `
  <div class="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-64 overflow-y-auto">
    <div class="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
      <span class="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Modelos · ${total} disponível(is)</span>
      <button onclick="closeTemplatePicker()" class="text-gray-300 hover:text-gray-500" title="Fechar (Esc)">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
    ${textMatches.length > 0 ? `
    <div class="px-3 pt-1.5 pb-0.5"><span class="text-[9px] font-semibold text-indigo-400 uppercase tracking-wider">Mensagens de texto</span></div>
    ${textMatches.map(m => {
      const _pv = autoFillTemplateVars(['','',''], S.conversationLeadId, { body: m.content })
      const _lead = _findActiveLead() || S._activeLead
      const previewContent = m.content
        .replace(/\{\{nome\}\}/gi, _pv[0] || (_lead?.name||'').split(' ')[0] || '{{nome}}')
        .replace(/\{\{nome_completo\}\}/gi, _lead?.name || '{{nome_completo}}')
        .replace(/\{\{telefone\}\}/gi, _pv[1] || _lead?.phone || '{{telefone}}')
      return `
      <button onclick="selectTextModel(${JSON.stringify(m).replace(/"/g,'&quot;')})"
        class="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-start gap-2 border-b border-gray-50 last:border-0">
        <div class="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7"/></svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-900">${esc(m.name)}</span>
            ${m.category && m.category !== 'geral' ? `<span class="text-[9px] text-indigo-500 bg-indigo-50 px-1 rounded">${esc(m.category)}</span>` : ''}
          </div>
          <p class="text-xs text-gray-400 truncate mt-0.5">${esc(previewContent.slice(0,80))}${previewContent.length > 80 ? '…' : ''}</p>
        </div>
      </button>`
    }).join('')}` : ''}
    ${waMatches.length > 0 ? `
    <div class="px-3 pt-1.5 pb-0.5"><span class="text-[9px] font-semibold text-green-500 uppercase tracking-wider">Templates WhatsApp</span></div>
    ${waMatches.map(t => `
    <button onclick="selectConvTemplate(${JSON.stringify(t).replace(/"/g,'&quot;')})"
      class="w-full text-left px-3 py-2 hover:bg-green-50 flex items-start gap-2 border-b border-gray-50 last:border-0">
      <div class="w-5 h-5 rounded bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-900">${esc(t.name)}</span>
          <span class="text-[9px] text-gray-400 font-mono">${esc(t.language)}</span>
          ${t.variablesCount > 0 ? `<span class="text-[9px] text-indigo-500">${t.variablesCount} var${t.variablesCount>1?'s':''}</span>` : ''}
        </div>
        ${t.body ? `<p class="text-xs text-gray-400 truncate mt-0.5">${esc(t.body)}</p>` : ''}
      </div>
      ${!S.convConnId && t.connectionName ? `<span class="text-[9px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded shrink-0">${esc(t.connectionName)}</span>` : ''}
    </button>`).join('')}` : ''}
    ${audioMatches.length > 0 ? `
    <div class="px-3 pt-1.5 pb-0.5"><span class="text-[9px] font-semibold text-orange-500 uppercase tracking-wider">Áudios</span></div>
    ${audioMatches.map(m => `
    <button onclick="sendAudioModel('${m.id}');S.templatePicker=false;S.templateSearch='';S.replyText='';render()"
      class="w-full text-left px-3 py-2 hover:bg-orange-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
      <div class="w-5 h-5 rounded bg-orange-100 flex items-center justify-center shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
      </div>
      <span class="text-sm font-medium text-gray-900">${esc(m.name)}</span>
      <span class="ml-auto text-[9px] text-orange-400">enviar</span>
    </button>`).join('')}` : ''}
  </div>`
}


function selectTextModel(m) {
  const lead = _findActiveLead() || S._activeLead
  // Usa autoFillTemplateVars como fonte de verdade (o mesmo mecanismo que funciona para {{1}})
  const _fakeVars = autoFillTemplateVars(['','',''], S.conversationLeadId, { body: m.content })
  const firstName  = _fakeVars[0] || (lead?.name || '').split(' ')[0] || ''
  const phone      = _fakeVars[1] || lead?.phone || ''
  const fullName   = lead?.name || firstName
  let content = m.content
    .replace(/\{\{nome\}\}/gi, firstName)
    .replace(/\{\{nome_completo\}\}/gi, fullName)
    .replace(/\{\{telefone\}\}/gi, phone)
  S.replyText = content
  S.templatePicker = false
  S.templateSearch = ''
  const pickerEl = document.getElementById('template-picker-container')
  if (pickerEl) pickerEl.innerHTML = ''
  const textarea = document.getElementById('reply-input') || document.querySelector('[oninput*="handleReplyInput"]')
  if (textarea) {
    textarea.value = content
    textarea.focus()
    autoResize(textarea)
    // Move cursor to first unfilled variable
    const varIdx = content.search(/\{\{[^}]+\}\}/)
    if (varIdx >= 0) {
      const endIdx = content.indexOf('}}', varIdx) + 2
      textarea.setSelectionRange(varIdx, endIdx)
    } else {
      textarea.setSelectionRange(content.length, content.length)
    }
  }
}

// ─── Gravação de Áudio ────────────────────────────────────────────────────────
var _mediaRecorder = null
var _audioChunks = []
var _audioTimer = null


async function startAudioRecording() {
  // Mostra UI de gravação imediatamente, antes de aguardar permissão do mic
  S.audioRecording = true
  S.audioDuration = 0
  S.audioBlob = null
  _patchInboxReplyBox(); _patchConvReplyBox()

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    _audioChunks = []
    const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
                   : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                   : 'audio/webm'
    _mediaRecorder = new MediaRecorder(stream, { mimeType })
    _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _audioChunks.push(e.data) }
    _mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(_audioChunks, { type: _mediaRecorder.mimeType })
      S.audioBlob = blob
      S.audioRecording = false
      clearInterval(_audioTimer)
      _patchInboxReplyBox(); _patchConvReplyBox()
    }
    _mediaRecorder.start(100)
    _audioTimer = setInterval(() => {
      S.audioDuration++
      const el = document.getElementById('audio-rec-timer')
      if (el) el.textContent = fmtAudioDur(S.audioDuration)
    }, 1000)
  } catch(e) {
    // Permissão negada: reverte estado da UI
    clearInterval(_audioTimer)
    S.audioRecording = false
    S.audioDuration = 0
    _patchInboxReplyBox(); _patchConvReplyBox()
    showToast('Permissão de microfone negada', 'error')
  }
}


function stopAudioRecording() {
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') _mediaRecorder.stop()
}


function cancelAudioRecording() {
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
    _mediaRecorder.ondataavailable = null
    _mediaRecorder.onstop = null
    _mediaRecorder.stop()
    _mediaRecorder.stream?.getTracks().forEach(t => t.stop())
  }
  clearInterval(_audioTimer)
  S.audioRecording = false
  S.audioBlob = null
  S.audioDuration = 0
  _patchInboxReplyBox(); _patchConvReplyBox()
}


async function sendAudioMessage() {
  if (!S.audioBlob || S.audioSending) return
  const leadId = S.conversationLeadId
  if (!leadId) return

  // ── Captura blob e limpa UI imediatamente (sem travar o chat) ───────────────
  const localBlob = S.audioBlob
  const ext = localBlob.type.includes('ogg') ? 'ogg' : 'webm'
  const blobUrl = URL.createObjectURL(localBlob)
  const tempId  = 'audio_temp_' + Date.now()
  const tempPid = `audio-player-${tempId}`

  S.audioBlob    = null
  S.audioDuration = 0
  S.audioSending  = false

  // ── Mensagem temporária aparece no chat imediatamente ──────────────────────
  const tempMsg = {
    id: tempId, direction: 'OUTBOUND', status: 'PENDING',
    messageContent: '🎧 Áudio',
    metaResponse: { audio: {}, _localBlobUrl: blobUrl },
    sentAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    payloadSent: S.me ? { senderUserId: S.me.id, senderUserName: S.me.name } : undefined,
  }
  if (!S.conversation) S.conversation = { messages: [], hasContact: true }
  S.conversation.messages.push(tempMsg)

  // Pré-registra o player com o blob local ANTES de appendChatMsg chamar loadAuthAudios
  // → loadAuthAudios verifica _audioPlayers[pid] e pula o fetch do servidor
  const audioEl = new Audio(blobUrl)
  _audioPlayers[tempPid] = { el: audioEl, blobUrl }

  if (!appendChatMsg(tempMsg, leadId)) { render(); scrollToBottomChat() }
  else scrollToBottomChat()

  // Conecta eventos do player ao container agora que está no DOM
  const container = document.getElementById(tempPid)
  if (container) {
    container.setAttribute('data-audio-loaded', '1')
    _bindAudioContainer(container, audioEl)
  }
  _patchInboxReplyBox(); _patchConvReplyBox()

  // ── Upload e envio em background ───────────────────────────────────────────
  try {
    const formData = new FormData()
    formData.append('file', localBlob, `audio.${ext}`)
    const url = S.convConnId
      ? `${API}/${encodeURIComponent(leadId)}/reply-audio?connectionId=${encodeURIComponent(S.convConnId)}`
      : `${API}/${encodeURIComponent(leadId)}/reply-audio`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    })
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.message || `Erro ${res.status}`) }
    const msg = await res.json()

    // ── Troca temp ID → ID real no DOM ────────────────────────────────────────
    const node = document.querySelector(`[data-msg-id="${tempId}"]`)
    if (node) {
      node.setAttribute('data-msg-id', msg.id)
      const statusEl = node.querySelector('[data-msg-status]')
      if (statusEl) statusEl.innerHTML = msgStatusIcon(msg.status, msg.status === 'FAILED')
      // Pinta bolha vermelha + explicação se backend retornou FAILED (consistência com sendReply/template)
      if (msg.status === 'FAILED') {
        const bubble = node.querySelector('div')
        if (bubble) {
          bubble.style.background = '#fef2f2'
          bubble.style.color = '#7f1d1d'
          bubble.style.border = '1px solid #fecaca'
          bubble.style.boxShadow = 'none'
          if (!bubble.querySelector('.msg-err')) {
            const p = document.createElement('p')
            p.className = 'msg-err'
            p.style.cssText = 'font-size:10.5px;margin:5px 0 0;color:#ef4444;border-top:1px solid #fecaca;padding-top:4px'
            p.textContent = '⚠ ' + fmtMsgError(msg)
            bubble.appendChild(p)
          }
        }
      }
    }
    // Migra entrada do player: tempPid → pid real (mantém blob local para reprodução)
    const realPid = `audio-player-${msg.id}`
    if (_audioPlayers[tempPid]) {
      _audioPlayers[realPid] = _audioPlayers[tempPid]
      delete _audioPlayers[tempPid]
      const playerEl = document.getElementById(tempPid)
      if (playerEl) { playerEl.id = realPid; playerEl.setAttribute('data-audio-loaded', '1') }
    }
    // Atualiza estado (preserva blobUrl para reprodução sem novo fetch)
    if (S.conversation) {
      S.conversation.messages = S.conversation.messages.map(m =>
        m.id === tempId ? { ...msg, metaResponse: { ...(msg.metaResponse || {}), _localBlobUrl: blobUrl } } : m
      )
    }
    if (msg.status === 'FAILED') showToast(msg.errorMessage || 'Falha ao enviar áudio', 'error')
  } catch(e) {
    // Marca temp como falha no DOM sem re-render completo
    const node = document.querySelector(`[data-msg-id="${tempId}"]`)
    if (node) {
      const statusEl = node.querySelector('[data-msg-status]')
      if (statusEl) statusEl.innerHTML = msgStatusIcon('FAILED', true)
      const bubble = node.querySelector('div[style]')
      if (bubble) { bubble.style.background = '#fff1f2'; bubble.style.border = '1px solid #fecaca' }
    }
    if (S.conversation) {
      S.conversation.messages = S.conversation.messages.map(m => m.id === tempId ? { ...m, status: 'FAILED' } : m)
    }
    showToast(e.message, 'error')
  }
}

// ─── AI Assist ───────────────────────────────────────────────────────────────

async function generateAiAssist() {
  const leadId = S.conversationLeadId
  if (!leadId || S.aiLoading) return
  S.aiLoading = true
  S.aiResult = null
  _patchInboxReplyBox(); _patchConvReplyBox()
  try {
    const result = await api(`/${leadId}/ai-assist`, { method: 'POST' })
    // Stale-guard: usuário pode ter trocado de conversa enquanto a IA processava.
    // Se mudou, descarta o resultado para não sobrepor a conversa atual.
    if (S.conversationLeadId !== leadId) return
    S.aiResult = result
  } catch(e) {
    if (S.conversationLeadId === leadId) showToast('Erro ao consultar IA: ' + e.message, 'error')
  } finally {
    if (S.conversationLeadId === leadId) {
      S.aiLoading = false
      _patchInboxReplyBox(); _patchConvReplyBox()
    }
  }
}


function useAiReply() {
  if (!S.aiResult?.suggestedReply) return
  S.replyText = S.aiResult.suggestedReply
  _patchInboxReplyBox(); _patchConvReplyBox()
  // Foca no textarea após inserir e ajusta altura
  setTimeout(() => {
    const ta = document.getElementById('reply-input')
    if (ta) { ta.focus(); autoResize(ta); ta.selectionStart = ta.selectionEnd = ta.value.length }
  }, 50)
}


function _aiResultHtml() {
  if (!S.aiResult && !S.aiLoading) return ''
  if (S.aiLoading) return `
    <div style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:1px solid #c4b5fd;border-radius:14px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
      <svg style="width:16px;height:16px;flex-shrink:0;animation:spin 0.8s linear infinite;color:#7c3aed" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
      <span style="font-size:12.5px;color:#5b21b6;font-weight:600">Analisando conversa...</span>
    </div>`
  const r = S.aiResult
  const classColors = { quente: ['#fef2f2','#dc2626','🔥'], morno: ['#fff7ed','#d97706','🌡️'], frio: ['#eff6ff','#2563eb','❄️'] }
  const intColors  = { investir: ['#f0fdf4','#15803d','💼'], duvida: ['#fefce8','#a16207','❓'], suporte: ['#eff6ff','#1d4ed8','🛠️'], desinteressado: ['#f9fafb','#6b7280','😶'] }
  const [cb, ct, ci] = classColors[r.classification] || ['#f3f4f6','#374151','•']
  const [ib, it, ii] = intColors[r.intention]        || ['#f3f4f6','#374151','•']
  return `
    <div style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:1px solid #c4b5fd;border-radius:14px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:14px">✨</span>
          <span style="font-size:12px;font-weight:700;color:#5b21b6">Assistente IA</span>
        </div>
        <button onclick="S.aiResult=null;_patchInboxReplyBox();_patchConvReplyBox()"
          style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(124,58,237,0.15);color:#7c3aed;border:none;cursor:pointer;font-size:11px;font-weight:700">✕</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:${cb};color:${ct}">${ci} ${r.classification?.charAt(0).toUpperCase()+r.classification?.slice(1)}</span>
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:${ib};color:${it}">${ii} ${r.intention?.charAt(0).toUpperCase()+r.intention?.slice(1)}</span>
      </div>
      <div style="background:#fff;border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <p style="font-size:10.5px;font-weight:700;color:#7c3aed;margin:0 0 5px;text-transform:uppercase;letter-spacing:0.04em">Sugestão de resposta</p>
        <p style="font-size:13px;color:#1f2937;margin:0 0 8px;line-height:1.5">${esc(r.suggestedReply)}</p>
        <button onclick="useAiReply()"
          style="font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:8px;background:#7c3aed;color:#fff;border:none;cursor:pointer;font-family:inherit">
          ↳ Usar resposta
        </button>
      </div>
      <div style="background:rgba(255,255,255,0.6);border-radius:10px;padding:10px 12px">
        <p style="font-size:10.5px;font-weight:700;color:#7c3aed;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.04em">Próximo passo</p>
        <p style="font-size:12px;color:#374151;margin:0;line-height:1.4">${esc(r.nextStep)}</p>
      </div>
    </div>`
}

// ─── Connection picker (custom dropdown) ────────────────────────────────────

function _connKindOf(c) {
  if (!c) return 'empty'
  if (c.kind === 'telegram' || c.botUsername || (c.label||'').includes('Telegram')) return 'tg'
  if (c.unofficial) return 'wa-web'
  return 'wa'
}

function _connIconSvg(kind) {
  if (kind === 'tg') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>'
  // WhatsApp glyph (oficial e baileys usam o mesmo, só muda a cor de fundo)
  return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>'
}

function _connNameOf(c) {
  if (!c) return 'Sem conexão'
  return c.name || c.botUsername || 'Conexão'
}

function _connSubOf(c, kind) {
  if (!c) return '—'
  if (kind === 'tg') return c.botUsername ? '@' + c.botUsername : 'via Telegram'
  if (kind === 'wa-web') return (c.phone_number ? '+' + c.phone_number + ' · ' : '') + 'WhatsApp Web'
  return c.phoneNumberId ? 'pn ' + c.phoneNumberId.slice(-8) : 'WhatsApp Cloud'
}

function renderConnPill(activeConns, selectedConn, isTelegram) {
  const noConn = activeConns.length === 0
  const sel = selectedConn || activeConns[0] || null
  const kind = noConn ? 'empty' : _connKindOf(sel)
  const isOpen = !!S.connDropOpen
  const pillName = noConn
    ? (isTelegram ? 'Conectar Telegram' : 'Conectar WhatsApp')
    : esc(_connNameOf(sel))
  // noConn: vira CTA clicável que leva pra tela de Conexões (em vez de pill desabilitado)
  const clickAction = noConn
    ? `event.stopPropagation();go('connections')`
    : `event.stopPropagation();cvConnToggle(event)`
  const iconHtml = noConn
    ? '<svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>'
    : _connIconSvg(kind)
  return `
  <div class="cv-conn-pill ${noConn?'no-conn':''}" id="cv-conn-pill" data-open="${isOpen?1:0}">
    <button type="button" class="cv-conn-pill-btn" onclick="${clickAction}" title="${noConn?'Cadastrar uma conexão':''}">
      <span class="cv-conn-pill-icon ${kind}">${iconHtml}</span>
      <span class="cv-conn-pill-name">${pillName}</span>
      ${noConn ? '' : '<svg class="cv-conn-chev" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>'}
    </button>
    ${isOpen && !noConn ? renderConnDrop(activeConns, sel, isTelegram) : ''}
  </div>`
}

function renderConnDrop(activeConns, sel, isTelegram) {
  const items = activeConns.map(c => {
    const k = _connKindOf(c)
    const isActive = c.id === sel?.id
    return `<div class="cv-conn-drop-item${isActive?' active':''}" onclick="event.stopPropagation();cvConnSelect('${esc(c.id)}')">
      <span class="cv-conn-pill-icon ${k}">${_connIconSvg(k)}</span>
      <span class="cv-conn-drop-item-info">
        <span class="cv-conn-drop-item-name"><span class="cv-conn-drop-status-dot"></span>${esc(_connNameOf(c))}</span>
        <span class="cv-conn-drop-item-sub">${esc(_connSubOf(c, k))}</span>
      </span>
      ${isActive ? '<span class="cv-conn-drop-item-check"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></span>' : ''}
    </div>`
  }).join('')
  return `<div class="cv-conn-drop" id="cv-conn-drop">
    <div class="cv-conn-drop-label">Enviar via ${isTelegram ? 'Telegram' : 'WhatsApp'}</div>
    ${items || '<div class="cv-conn-drop-empty">Nenhuma conexão disponível</div>'}
  </div>`
}

function cvConnToggle(ev) {
  S.connDropOpen = !S.connDropOpen
  _patchInboxReplyBox(); _patchConvReplyBox()
  if (S.connDropOpen) requestAnimationFrame(_positionConnDrop)
}

function cvConnSelect(id) {
  S.convConnId = id
  S.connDropOpen = false
  _patchInboxReplyBox(); _patchConvReplyBox()
}

function cvConnClose() {
  if (!S.connDropOpen) return
  S.connDropOpen = false
  _patchInboxReplyBox(); _patchConvReplyBox()
}

function _positionConnDrop() {
  // Posiciona o painel logo abaixo do pill, abrindo pra cima se não couber abaixo
  const pills = document.querySelectorAll('#cv-conn-pill')
  pills.forEach(pill => {
    const drop = pill.querySelector('#cv-conn-drop')
    if (!drop) return
    const btn = pill.querySelector('.cv-conn-pill-btn')
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const dropH = drop.offsetHeight || 200
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < dropH + 12 && r.top > dropH + 12
    drop.style.left = r.left + 'px'
    drop.style.minWidth = Math.max(r.width, 280) + 'px'
    if (openUp) {
      drop.style.top = ''
      drop.style.bottom = (window.innerHeight - r.top + 4) + 'px'
    } else {
      drop.style.bottom = ''
      drop.style.top = (r.bottom + 4) + 'px'
    }
  })
}
// Fecha o dropdown ao clicar fora ou pressionar ESC
document.addEventListener('click', e => {
  if (!S.connDropOpen) return
  if (e.target.closest('#cv-conn-pill')) return
  cvConnClose()
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.connDropOpen) cvConnClose()
})
window.addEventListener('resize', () => { if (S.connDropOpen) _positionConnDrop() })
window.addEventListener('scroll', () => { if (S.connDropOpen) _positionConnDrop() }, true)

function renderReplyBox(leadId) {
  const hasContact = S.conversation?.hasContact
  const tmpl = S.convTemplate
  // Detectar canal pelo lead atual — Telegram se phone começa com 'tg_'
  const lead = _findActiveLead()
  const isTelegramConn = (lead?.phone || '').startsWith('tg_')
  // Em conversa Telegram: dropdown só com bots TG ATIVOS. Senão: WhatsApp (oficial + Web).
  const activeConns = isTelegramConn
    ? (S.telegramBots || [])
        .filter(b => b.status === 'ACTIVE')
        .map(b => ({ ...b, label: `${b.name||b.botUsername||'bot'} · Telegram`, kind: 'telegram' }))
    : [
        ...(S.connections||[]).filter(c=>c.status==='ACTIVE').map(c=>({...c, label: `${c.name} · ${c.phoneNumberId||''}`, unofficial: false})),
        ...(S.unofficialSessions||[])
          .filter(s => s.sessionStatus==='connected' && !String(s.id||'').startsWith('avatar-fetcher'))
          .map(s=>({...s, status:'ACTIVE', label: `${s.name}${s.phone_number?' · '+s.phone_number:''} · Não oficial`, unofficial: true})),
      ]
  const selectedConn = activeConns.find(c=>c.id===S.convConnId)
  const isUnofficialConn = !!selectedConn?.unofficial
  // WhatsApp Web não tem janela 24h nem precisa de template — texto livre sempre liberado.
  const canSendFreeText = !!S.conversation?.hasContact || isUnofficialConn
  const connIconColor = isTelegramConn ? '#0ea5e9' : '#16a34a'

  return `
  <div class="cv-composer" style="background:var(--surface);border-top:1px solid var(--border);padding:10px 14px 12px;flex-shrink:0;position:relative">
    <!-- Picker flutuante -->
    <div class="relative" id="template-picker-container">${renderTemplatePicker()}</div>

    <!-- Barra de canal + IA -->
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      ${renderConnPill(activeConns, selectedConn, isTelegramConn)}
      <button onclick="generateAiAssist()" title="Gerar sugestão com IA" ${S.aiLoading ? 'disabled' : ''} class="cv-ia-btn${S.aiResult||S.aiLoading?' active':''}">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
        IA
      </button>
      ${(() => {
        // Janela de 24h: só para WhatsApp Cloud API. Telegram e WhatsApp Web (unofficial)
        // não têm essa restrição — esconde o aviso pra não confundir o operador.
        if (isTelegramConn || isUnofficialConn) return ''
        // Conversation endpoint não retorna lead; basta a conversa estar carregada para o lead ativo.
        const msgs = (S.conversationLeadId === lead?.id && Array.isArray(S.conversation?.messages))
          ? S.conversation.messages : []
        const lastInbound = [...msgs].reverse().find(m => m.direction === 'INBOUND')
        const lastInboundMs = lastInbound ? Date.now() - new Date(lastInbound.sentAt || lastInbound.createdAt).getTime() : Infinity
        // Fallback: se ainda não carregou messages, usa lead.lastMessageAt como aproximação (nem sempre é INBOUND, mas evita ficar cinza pra todos).
        const fallbackMs = !lastInbound && lead?.lastMessageAt ? Date.now() - new Date(lead.lastMessageAt).getTime() : null
        const effectiveMs = lastInbound ? lastInboundMs : (fallbackMs ?? Infinity)
        const windowActive = effectiveMs < 24 * 60 * 60 * 1000
        const warnTitle = windowActive
          ? 'Janela de 24h ativa — pode enviar mensagem livre'
          : 'Janela de 24h expirada — clique para escolher um template'
        const warnAction = windowActive
          ? `event.preventDefault();showToast&&showToast('Janela de 24h ativa','success')`
          : `event.preventDefault();openTemplatePickerFromWarn()`
        return `<button class="cv-warn-btn${windowActive ? ' active' : ''}" title="${warnTitle}" onclick="${warnAction}">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </button>`
      })()}
    </div>

    <!-- Chip de template selecionado (acima do textarea) -->
    <div id="tmpl-chip-wrap">${_templateChipHTML()}</div>

    <!-- Painel de resultado IA -->
    ${_aiResultHtml()}

    <!-- Preview de imagem -->
    ${S.imageFile ? `
    <div style="background:#f0f9ff;border:1.5px solid #7dd3fc;border-radius:14px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:12px;font-weight:700;color:#0369a1;flex:1">📷 ${esc(S.imageFile.name||'imagem')}</span>
        <button onclick="cancelImageComposer()" style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(3,105,161,0.15);color:#0369a1;border:none;cursor:pointer;font-size:11px;font-weight:700">✕</button>
      </div>
      <img src="${S.imagePreviewUrl}" alt="Preview" onclick="openImageModal(this.src)"
        style="max-width:100%;max-height:180px;object-fit:contain;border-radius:10px;display:block;margin-bottom:8px;cursor:zoom-in;background:#e0f2fe"/>
      <input id="image-caption-input" type="text" value="${esc(S.imageCaption)}" placeholder="Adicionar legenda (opcional)..."
        oninput="S.imageCaption=this.value"
        onkeydown="if(event.key==='Enter'){event.preventDefault();sendImageMessage()}"
        style="width:100%;font-size:13px;border:1.5px solid #bae6fd;border-radius:8px;padding:6px 10px;outline:none;font-family:inherit;box-sizing:border-box;background:#fff;color:var(--text-primary)"
        onfocus="this.style.borderColor='#0369a1'" onfocusout="this.style.borderColor='#bae6fd'"/>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button onclick="sendImageMessage()" ${S.imageSending?'disabled':''} style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:7px 16px;border-radius:99px;background:var(--accent);color:white;border:none;cursor:pointer;${S.imageSending?'opacity:0.5':''}">
          ${S.imageSending
            ? `<svg style="width:13px;height:13px;animation:spin 0.7s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Enviando...`
            : `<svg style="width:13px;height:13px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Enviar`}
        </button>
      </div>
    </div>` : ''}

    <!-- Gravando -->
    ${S.audioRecording ? `
    <div style="display:flex;align-items:center;gap:10px;background:#fff0f0;border:1.5px solid #fca5a5;border-radius:24px;padding:8px 12px">
      <span style="width:10px;height:10px;border-radius:50%;background:#ef4444;flex-shrink:0;animation:pulse 1s infinite"></span>
      <span style="font-size:13px;font-weight:600;color:#dc2626;font-family:monospace" id="audio-rec-timer">${fmtAudioDur(S.audioDuration)}</span>
      <span style="flex:1;font-size:12px;color:#ef4444">Gravando...</span>
      <button onclick="cancelAudioRecording()" title="Cancelar" style="padding:6px 10px;font-size:12px;font-weight:600;color:#9ca3af;background:transparent;border:1px solid #e5e7eb;border-radius:99px;cursor:pointer">Cancelar</button>
      <button onclick="stopAudioRecording()" title="Parar e pré-visualizar" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#ef4444;color:white;border:none;cursor:pointer">
        <svg style="width:13px;height:13px" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
      </button>
    </div>` :

    <!-- Preview de áudio gravado -->
    S.audioBlob ? `
    <div style="display:flex;align-items:center;gap:10px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:24px;padding:8px 12px">
      <audio id="audio-preview-el" src="${URL.createObjectURL(S.audioBlob)}" style="display:none"
        onplay="document.getElementById('audio-preview-icon').innerHTML='<rect x=\\'6\\' y=\\'4\\' width=\\'4\\' height=\\'16\\'/><rect x=\\'14\\' y=\\'4\\' width=\\'4\\' height=\\'16\\'/>'"
        onpause="document.getElementById('audio-preview-icon').innerHTML='<path d=\\'M8 5v14l11-7z\\'/>'">
      </audio>
      <button onclick="const a=document.getElementById('audio-preview-el');a.paused?a.play():a.pause()" style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#22c55e;color:white;border:none;cursor:pointer;flex-shrink:0">
        <svg id="audio-preview-icon" style="width:14px;height:14px" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <span style="font-size:12px;color:#15803d;flex:1">${fmtAudioDur(S.audioDuration)}</span>
      <button onclick="cancelAudioRecording()" title="Descartar" style="padding:6px 10px;font-size:12px;font-weight:600;color:#9ca3af;background:transparent;border:1px solid #e5e7eb;border-radius:99px;cursor:pointer">Descartar</button>
      <button onclick="sendAudioMessage()" ${S.audioSending?'disabled':''} style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--accent);color:white;border:none;cursor:pointer;${S.audioSending?'opacity:0.5':''}">
        ${S.audioSending
          ? `<svg style="width:14px;height:14px;animation:spin 0.7s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>`
          : `<svg style="width:14px;height:14px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>`}
      </button>
    </div>` :

    <!-- Textarea + botão enviar + microfone -->
    `${_safeRender('renderScheduledBanner', S.conversationLeadId)}<div class="cv-input-wrap" onclick="if(!event.target.closest('button, input[type=file], textarea, audio')) document.getElementById('reply-input')?.focus()">
      <textarea id="reply-input" rows="1" spellcheck="true" lang="pt"
        placeholder="${canSendFreeText ? 'Digite uma mensagem... ou / para templates' : 'Digite / para escolher um template e iniciar conversa'}"
        oninput="handleReplyInput(this)"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey&&!S.templatePicker){event.preventDefault();sendMessage()}"
        onkeyup="if(event.key==='Escape')closeTemplatePicker()"
      >${esc(S.replyText)}</textarea>
      ${canSendFreeText ? `
      <input id="image-file-input" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="openImageComposerFromInput(this)"/>
      <button class="cv-action-btn" onclick="document.getElementById('image-file-input').click()" title="Enviar imagem">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="8.5" r="1.5" stroke-linecap="round" stroke-linejoin="round"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 15l-5-5L5 21"/></svg>
      </button>
      <button class="cv-action-btn" onclick="startAudioRecording()" title="Gravar áudio">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
      </button>
      <button class="cv-action-btn" onclick="openShareContactModal()" title="Compartilhar contato">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM8 11c1.657 0 3-1.343 3-3S9.657 5 8 5 5 6.343 5 8s1.343 3 3 3zM8 13c-2.667 0-8 1.333-8 4v2h16v-2c0-2.667-5.333-4-8-4zM16 13c-.29 0-.596.013-.9.038C16.2 13.9 17 15.1 17 17v2h7v-2c0-2.667-5.333-4-8-4z"/></svg>
      </button>` : ''}
      <button class="cv-action-btn" onclick="openScheduleModal()" title="Agendar envio">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </button>
      <button id="chat-send-btn" class="cv-send-btn" onclick="sendMessage()" ${S.replySending?'disabled':''}
        ${(!canSendFreeText && !tmpl) ? 'disabled title="Use / para escolher um template"' : ''}>
        ${S.replySending
          ? `<svg style="width:15px;height:15px;animation:spin 0.7s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>`
          : `<svg style="width:15px;height:15px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7"/></svg>`}
      </button>
    </div>`}
    ${!S.audioRecording && !S.audioBlob ? `<p style="font-size:10px;color:#b0b8c1;margin:5px 0 0;text-align:center;line-height:1.4">
      ${tmpl ? 'Edite o texto ou envie como está · ✕ para descartar' :
        !canSendFreeText ? '⚡ Use <b>/</b> para selecionar um template e iniciar a conversa' :
        isUnofficialConn ? 'Enter para enviar · Shift+Enter nova linha · WhatsApp Web (sem janela de 24h)' :
        'Enter para enviar · Shift+Enter nova linha · <b>/</b> abre templates'}
    </p>` : ''}
  </div>`
}

// ─── Image Composer ───────────────────────────────────────────────────────────

function openImageComposer(file) {
  if (!file || !file.type.startsWith('image/')) return
  if (S.imagePreviewUrl) URL.revokeObjectURL(S.imagePreviewUrl)
  S.imageFile       = file
  S.imagePreviewUrl = URL.createObjectURL(file)
  S.imageCaption    = ''
  S.imageSending    = false
  _patchInboxReplyBox(); _patchConvReplyBox()
  // Foca no campo de legenda após abrir
  setTimeout(() => document.getElementById('image-caption-input')?.focus(), 80)
}


function openImageComposerFromInput(input) {
  const file = input.files?.[0]
  if (file) openImageComposer(file)
  input.value = '' // reset para permitir selecionar mesmo arquivo novamente
}


function cancelImageComposer() {
  if (S.imagePreviewUrl) URL.revokeObjectURL(S.imagePreviewUrl)
  S.imageFile       = null
  S.imagePreviewUrl = null
  S.imageCaption    = ''
  S.imageSending    = false
  _patchInboxReplyBox(); _patchConvReplyBox()
}


async function sendImageMessage() {
  const leadId = S.conversationLeadId
  if (!leadId || !S.imageFile || S.imageSending) return

  const file    = S.imageFile
  const caption = S.imageCaption.trim()
  const blobUrl = S.imagePreviewUrl
  const tempId  = 'img_temp_' + Date.now()

  S.imageSending = true
  _patchInboxReplyBox(); _patchConvReplyBox()

  // Mensagem otimista — aparece imediatamente no chat
  const tempMsg = {
    id: tempId,
    direction: 'OUTBOUND',
    status: 'SENDING',
    messageContent: caption || null,
    metaResponse: { type: 'image', image: { id: '__preview__', caption: caption || undefined }, _previewUrl: blobUrl },
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    errorCode: null, errorMessage: null,
    payloadSent: S.me ? { senderUserId: S.me.id, senderUserName: S.me.name } : undefined,
  }
  if (S.conversation) {
    S.conversation.messages = [...(S.conversation.messages || []), tempMsg]
    _rebuildChatArea()
    setTimeout(() => _scrollChatToBottom(false), 30)
  }

  // Fecha o composer antes do upload (não trava o input)
  if (S.imagePreviewUrl) URL.revokeObjectURL(S.imagePreviewUrl)
  S.imageFile       = null
  S.imagePreviewUrl = null
  S.imageCaption    = ''
  S.imageSending    = false
  _patchInboxReplyBox(); _patchConvReplyBox()

  try {
    const connId = S.convConnId || ''
    const params = new URLSearchParams()
    if (caption)  params.set('caption', caption)
    if (connId)   params.set('connectionId', connId)
    const qs = params.toString() ? '?' + params.toString() : ''

    const fd = new FormData()
    fd.append('file', file, file.name || 'image.jpg')

    const res = await fetch(`${API}/${encodeURIComponent(leadId)}/reply-image${qs}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Erro ao enviar imagem' }))
      throw new Error(err.message || 'Erro ao enviar imagem')
    }
    const msg = await res.json()

    // Substitui a mensagem temporária pela real
    if (S.conversation) {
      S.conversation.messages = (S.conversation.messages || [])
        .filter(m => m.id !== tempId)
        .concat([msg])
      _rebuildChatArea()
      setTimeout(() => _scrollChatToBottom(false), 30)
    }
  } catch(e) {
    // Remove a mensagem temporária e mostra erro
    if (S.conversation) {
      S.conversation.messages = (S.conversation.messages || []).filter(m => m.id !== tempId)
      _rebuildChatArea()
    }
    showToast('Erro ao enviar imagem: ' + e.message, 'error')
  }
}

// Ctrl+V — detecta imagem na área de transferência
;(function attachPasteListener() {
  document.addEventListener('paste', (e) => {
    if (!S.conversationLeadId) return
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))
    if (!item) return
    e.preventDefault()
    const file = item.getAsFile()
    if (file) openImageComposer(new File([file], 'imagem_colada.png', { type: file.type }))
  })
})()

// ─── Nova Conversa ────────────────────────────────────────────────────────────

async function openNewConv(leadId) {
  S.newConvLeadId = leadId
  S.newConvModal = true
  S.newConvConnId = ''
  S.newConvTemplates = []
  S.newConvTemplate = null
  S.newConvVars = []
  render() // abre o modal imediatamente, sem esperar o fetch
  if (!S.connections.length) {
    try {
      const r = await api('/connections?limit=50')
      S.connections = r.data || r
    } catch(e) { showToast(e.message, 'error') }
    render() // atualiza com as conexões carregadas
  }
}


async function newConvSelectConn(connId) {
  S.newConvConnId = connId
  S.newConvTemplate = null
  S.newConvVars = []
  S.newConvTemplates = []
  render()
  try {
    S.newConvTemplates = await apiAdmin(`/connections/${connId}/templates`)
  } catch(e) { showToast(e.message,'error') }
  render()
}


function newConvSelectTemplate(t) {
  S.newConvTemplate = t
  S.newConvVars = autoFillTemplateVars(Array(t.variablesCount || 0).fill(''), S.newConvLeadId, t)
  render()
}


async function submitNewConv() {
  if (!S.newConvTemplate || !S.newConvConnId || !S.newConvLeadId) return
  S.newConvSending = true; render()
  try {
    const renderedNewBody = (S.newConvTemplate.body || S.newConvTemplate.name)
      .replace(/\{\{(\d+)\}\}/g, (_, i) => S.newConvVars[parseInt(i)-1] || `{{${i}}}`)
    const msg = await api(`/${S.newConvLeadId}/start-conversation`, {
      method: 'POST',
      body: JSON.stringify({
        connectionId: S.newConvConnId,
        templateName: S.newConvTemplate.name,
        language: S.newConvTemplate.language,
        variables: S.newConvVars,
        messageText: renderedNewBody,
      }),
    })
    playSendSound()
    S.newConvModal = false
    // Atualiza lastMessageAt do lead
    S.leads = S.leads.map(l => l.id === S.newConvLeadId ? { ...l, lastMessageAt: new Date().toISOString() } : l)
    // Abre a conversa
    await openConversation(S.newConvLeadId)
    showToast('Conversa iniciada com sucesso')
  } catch(e) { showToast(e.message,'error') }
  finally { S.newConvSending = false; render() }
}


function renderNewConvModal() {
  if (!S.newConvModal) return ''
  const lead = S.leads.find(l => l.id === S.newConvLeadId)
  const conns = S.connections.filter(c => c.status === 'ACTIVE')
  const templates = (S.newConvTemplates || []).filter(t => t.status === 'APPROVED')
  const tmpl = S.newConvTemplate

  return `
  <div class="modal-backdrop" onclick="if(event.target===this){S.newConvModal=false;render()}">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md" onclick="event.stopPropagation()">
      <div class="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <p class="font-semibold text-gray-900">Nova Conversa</p>
          ${lead ? `<p class="text-xs text-gray-400 mt-0.5">${esc(lead.name)} · ${fmtPhone(lead.phone)}</p>` :
            `<p class="text-xs text-gray-400 mt-0.5">Selecione um lead abaixo</p>`}
        </div>
        <button onclick="S.newConvModal=false;render()" class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <!-- 0. Lead (quando não pré-selecionado) -->
        ${!lead ? `
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Lead</label>
          ${renderCDD({id:'cdd-nconv-lead',value:S.newConvLeadId||'',placeholder:'Selecione um lead...',options:[{value:'',label:'Selecione um lead...'},...S.leads.map(l=>({value:l.id,label:`${l.name} · ${l.phone}`}))],onchange:"S.newConvLeadId=this.value;render()",style:'width:100%'})}
        </div>` : ''}

        <!-- 1. Conexão -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">1. Selecione a conexão</label>
          <div class="grid gap-2">
            ${conns.length === 0 ? `<p class="text-sm text-gray-400">Nenhuma conexão ativa</p>` :
              conns.map(c => `
              <button onclick="newConvSelectConn('${c.id}')"
                class="flex items-center gap-3 p-3 rounded-xl border text-left transition-colors
                  ${S.newConvConnId===c.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}">
                <div class="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <svg class="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900">${esc(c.name)}</p>
                  <p class="text-xs text-gray-400 font-mono">${esc(c.phoneNumberId)}</p>
                </div>
                ${S.newConvConnId===c.id ? `<svg class="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>` : ''}
              </button>`).join('')}
          </div>
        </div>

        <!-- 2. Template -->
        ${S.newConvConnId ? `
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs font-medium text-gray-600">2. Selecione o template</label>
            <button onclick="syncAndLoadTemplates()" class="text-[11px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Sincronizar da Meta
            </button>
          </div>
          ${templates.length === 0 ? `
            <p class="text-sm text-gray-400">Nenhum template encontrado. Clique em "Sincronizar da Meta" acima.</p>` :
            renderCDD({id:'cdd-nconv-tmpl',value:tmpl?.id||'',placeholder:'Selecione um template...',options:[{value:'',label:'Selecione um template...'},...templates.map(t=>({value:t.id,label:`${t.name} (${t.language})`}))],onchange:`newConvSelectTemplate(${JSON.stringify(templates)}.find(t=>t.id===this.value))`,style:'width:100%'})
          }
        </div>` : ''}

        <!-- 3. Variáveis -->
        ${tmpl && tmpl.variablesCount > 0 ? `
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">3. Preencha as variáveis</label>
          ${S.newConvVars.map((v,i) => `
          <div class="mb-2">
            <label class="text-xs text-gray-400 mb-1 block">{{${i+1}}}</label>
            <input type="text" value="${esc(v)}" placeholder="Valor da variável ${i+1}"
              oninput="S.newConvVars[${i}]=this.value"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
          </div>`).join('')}
        </div>` : ''}

        <!-- Preview -->
        ${tmpl?.body ? `
        <div class="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p class="text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">Preview</p>
          <p class="text-sm text-gray-700 whitespace-pre-wrap">${esc(
            tmpl.body.replace(/\{\{(\d+)\}\}/g, (_,i) => S.newConvVars[parseInt(i)-1] || `{{${i}}}`)
          )}</p>
        </div>` : ''}
      </div>

      <div class="px-5 pb-5 flex gap-3 justify-end">
        <button onclick="S.newConvModal=false;render()" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancelar</button>
        <button onclick="submitNewConv()" ${!tmpl || S.newConvSending ? 'disabled' : ''}
          class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl flex items-center gap-2">
          ${S.newConvSending ? `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>` : ''}
          Iniciar Conversa
        </button>
      </div>
    </div>
  </div>`
}


async function syncAndLoadTemplates() {
  if (!S.newConvConnId) return
  try {
    await apiAdmin(`/connections/${S.newConvConnId}/templates/sync`, { method:'POST', body:'{}' })
    S.newConvTemplates = await apiAdmin(`/connections/${S.newConvConnId}/templates`)
    render()
  } catch(e) { showToast(e.message,'error') }
}

// Renderiza o conteúdo interno do header do chat lateral (sem o wrapper div)

function _renderConvChatHeaderInner(lead) {
  if (!lead) return ''
  const msgCount = S.conversation?.messages?.length ?? 0
  const iconBtn = (onclick, title, svg, hoverColor='#374151') =>
    `<button onclick="${onclick}" title="${title}"
      style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:#9ca3af;cursor:pointer;transition:background 0.12s,color 0.12s"
      onmouseover="this.style.color='${hoverColor}';this.style.background='${hoverColor==='#ef4444'?'#fef2f2':'#f3f4f6'}'"
      onmouseout="this.style.color='#9ca3af';this.style.background='transparent'">${svg}</button>`

  return `
    ${iconBtn("closeConversation()", "Fechar",
      `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 18l-6-6 6-6"/></svg>`
    )}

    ${_leadAvatar(lead, 42)}

    <div style="flex:1;min-width:0;padding:0 6px">
      <p style="font-size:14.5px;font-weight:700;color:#111827;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25">${esc((lead.name||'').trim() || fmtPhone(lead.phone) || 'Lead sem nome')}</p>
      <p style="font-size:11px;color:#9ca3af;margin:2px 0 5px;line-height:1">${(lead.name||'').trim() ? esc(fmtPhone(lead.phone)||'') : 'sem nome cadastrado'}${msgCount > 0 ? `<span style="margin-left:4px;opacity:.7">· ${msgCount} msgs</span>` : ''}</p>
      <div>${(() => {
        const curStage = lead.stageId ? (S.kanban?.stages||[]).find(s => s.id === lead.stageId) : null
        const stageName = curStage?.name || 'Sem Etapa'
        const stageColor = curStage?.color || '#94a3b8'
        return `<span class="lds-pill-trigger" onclick="event.stopPropagation();ldsToggleStageMenu(this,'${lead.id}')">
          <span class="dot" style="background:${esc(stageColor)}"></span>${esc(stageName)}
          <svg class="chevron" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </span>`
      })()}</div>
    </div>

    <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;align-self:flex-start;padding-top:2px">
      ${(() => {
        const isUnread = (lead.unreadCount || 0) > 0
        const tip = isUnread ? `Marcar como lido (${lead.unreadCount} não lida${lead.unreadCount===1?'':'s'})` : 'Marcar como não lido'
        const handler = isUnread ? `markLeadAsRead('${lead.id}')` : `markLeadAsUnread('${lead.id}')`
        const color = isUnread ? '#f59e0b' : '#9ca3af'
        const hoverColor = isUnread ? '#d97706' : '#374151'
        const hoverBg = isUnread ? '#fffbeb' : '#f3f4f6'
        const icon = isUnread
          ? `<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/><circle cx="18" cy="6" r="3" fill="currentColor" stroke="none"/></svg>`
          : `<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 19V8.4l9 5.4 9-5.4V19a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 8.4V7a2 2 0 012-2h14a2 2 0 012 2v1.4l-9 5.4z"/></svg>`
        return `<button onclick="${handler}" title="${tip}"
          style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:${color};cursor:pointer;transition:background 0.12s,color 0.12s"
          onmouseover="this.style.background='${hoverBg}';this.style.color='${hoverColor}'"
          onmouseout="this.style.background='transparent';this.style.color='${color}'">${icon}</button>`
      })()}
      ${(() => {
        const fav = !!lead.starred
        const color = fav ? '#f59e0b' : '#9ca3af'
        const hoverColor = fav ? '#d97706' : '#374151'
        const hoverBg = fav ? '#fffbeb' : '#f3f4f6'
        return `<button onclick="toggleStar('${lead.id}')" title="${fav ? 'Remover favorito' : 'Marcar como favorito'}"
          style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:${color};cursor:pointer;transition:background 0.12s,color 0.12s"
          onmouseover="this.style.background='${hoverBg}';this.style.color='${hoverColor}'"
          onmouseout="this.style.background='transparent';this.style.color='${color}'">
          <svg width="15" height="15" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
        </button>`
      })()}
      ${iconBtn(
        `confirmBlockLead('${lead.id}', ${lead.isBlocked?'true':'false'})`,
        lead.isBlocked ? 'Desbloquear lead' : 'Bloquear lead (some das listas)',
        `<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 18.364M5.636 5.636l12.728 12.728"/></svg>`,
        '#ef4444'
      )}
      ${iconBtn(
        `toggleConvDetails()`,
        S.detailsOpen ? 'Esconder detalhes' : 'Mostrar detalhes',
        S.detailsOpen
          ? `<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 17l-4-4m0 0l4-4m-4 4h12M5 5v14"/></svg>`
          : `<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7l4 4m0 0l-4 4m4-4H0M19 5v14"/></svg>`
      )}
    </div>
  `
}

// Toggle do painel de detalhes na conversa lateral.
// Faz patch cirúrgico — só atualiza o painel + header, sem destruir reply box.

function toggleConvDetails() {
  S.detailsOpen = !S.detailsOpen
  const panel = document.getElementById('conv-details-panel')
  const wrapper = panel?.parentElement
  const lead = _findActiveLead?.()
  if (!panel || !wrapper || !lead) { render(); return }
  // Atualiza wrapper width (animação)
  wrapper.style.maxWidth = S.detailsOpen ? '780px' : '460px'
  // Atualiza painel width + content
  panel.style.width = S.detailsOpen ? '320px' : '0'
  // Border é no chat-box (irmão antes do panel), não mais no panel
  const chatBox = panel.previousElementSibling
  if (chatBox) chatBox.style.borderRight = S.detailsOpen ? '1px solid #e9edef' : 'none'
  // Renderiza/limpa conteúdo. Pequeno delay pra não cortar conteúdo durante shrink.
  if (S.detailsOpen) {
    const inner = panel.querySelector('div')
    if (inner) inner.innerHTML = renderLeadDetailsPanel(lead)
  } else {
    setTimeout(() => {
      if (!S.detailsOpen) {
        const inner = panel.querySelector('div')
        if (inner) inner.innerHTML = ''
      }
    }, 280)
  }
  // Re-renderiza header pra atualizar ícone (←/→)
  _convChatHeaderFp = ''  // força repintura
  if (typeof _patchConvChatHeader === 'function') _patchConvChatHeader()
}

var _convChatHeaderFp = ''

function _patchConvChatHeader() {
  const hdr = document.getElementById('conv-chat-header')
  if (!hdr || !S.conversationLeadId) return
  const lead = _findActiveLead()
  if (!lead) return
  const fp = `${lead.id}|${lead.unreadCount||0}|${lead.stageId||''}|${S.conversation?.messages?.length??0}|${lead.name||''}|${lead.avatarUrl||''}|${lead.starred?1:0}|${S.detailsOpen?1:0}`
  if (fp === _convChatHeaderFp) return
  _convChatHeaderFp = fp
  hdr.innerHTML = _renderConvChatHeaderInner(lead)
}

// Rastreia qual lead e estado de loading está montado no overlay para forçar rebuild quando necessário
var _convOverlayLeadId = ''
var _convOverlayWasLoading = false

// Atualiza cirurgicamente o conv-overlay sem destruir o reply box
// — preserva foco/cursor do operador durante polling

function _patchConvOverlay() {
  const convOverlay = document.getElementById('conv-overlay')
  if (!convOverlay) return

  // Se não tem conversa aberta, limpa o overlay
  if (!S.conversationLeadId) {
    convOverlay.innerHTML = ''
    _convOverlayLeadId = ''
    _convOverlayWasLoading = false
    return
  }

  const leadChanged    = _convOverlayLeadId !== S.conversationLeadId
  const loadingChanged = _convOverlayWasLoading !== S.conversationLoading

  // Rebuild completo se: overlay não montado, lead trocou, ou loading mudou de estado
  if (!convOverlay.querySelector('#conv-reply-box') || leadChanged || loadingChanged) {
    convOverlay.innerHTML = renderConversation()
    _convOverlayLeadId    = S.conversationLeadId
    _convOverlayWasLoading = S.conversationLoading
    return
  }

  // Overlay já montado para o mesmo lead e mesmo estado: patches cirúrgicos apenas
  _patchConvChatHeader()
  // #conv-msgs: novas mensagens chegam via appendChatMsg — não toca
  _patchConvReplyBox()  // já tem fingerprint, preserva foco/cursor
  _patchConvDetailsPanel()  // re-renderiza painel de detalhes quando UTM/Activity/Financial chegam
}

// Atualiza o conteúdo do painel de detalhes do conv-overlay (chat lateral fullscreen).
// Sem isso, quando loadLeadUtm/loadLeadActivity/loadLeadFinancial completam e chamam
// scheduleRender(), o conv-overlay reaplica patches cirúrgicos no header/reply box
// mas o painel lateral fica preso em "Carregando..." porque ninguém re-renderiza
// renderLeadDetailsPanel(lead) com o cache atualizado.

function _patchConvDetailsPanel() {
  const panel = document.getElementById('conv-details-panel')
  if (!panel || !S.conversationLeadId || !S.detailsOpen) return
  const lead = _findActiveLead?.()
  if (!lead) return
  const inner = panel.querySelector('div')
  if (!inner) return
  const savedScroll = inner.scrollTop
  inner.innerHTML = renderLeadDetailsPanel(lead)
  if (savedScroll > 0) inner.scrollTop = savedScroll
}


function renderConversation() {
  if (!S.conversationLeadId) return ''
  const lead = _findActiveLead()
  const stage = lead?.stageId ? (S.kanban?.stages||[]).find(st => st.id === lead.stageId) : null

  let msgArea = ''
  if (S.conversationLoading) {
    msgArea = `<div style="flex:1;display:flex;align-items:center;justify-content:center;background:#f0f2f5">
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;color:#9ca3af">
        <svg style="width:20px;height:20px;animation:spin 0.7s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
        <span style="font-size:12.5px;font-weight:500">Carregando conversa...</span>
      </div>
    </div>`
  } else if (!S.conversation?.hasContact || !S.conversation.messages.length) {
    const _isUnoff = (S.unofficialSessions||[]).some(s => s.id === S.convConnId)
    const _hint = _isUnoff
      ? `Digite uma mensagem abaixo · WhatsApp Web (sem janela de 24h)`
      : `Use <kbd style="background:#e5e7eb;padding:1px 5px;border-radius:4px;font-size:11px;font-family:monospace;color:#374151">/</kbd> para escolher um template`
    msgArea = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f0f2f5;padding:32px 24px;text-align:center">
      <div style="width:60px;height:60px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;margin-bottom:14px">
        <svg style="width:26px;height:26px;color:#9ca3af" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      </div>
      <p style="font-size:13.5px;font-weight:600;color:#374151;margin:0 0 5px">Nenhuma mensagem ainda</p>
      <p style="font-size:12px;color:#9ca3af;margin:0">${_hint}</p>
    </div>`
  } else {
    msgArea = `<div id="conv-msgs" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:6px;background:#f0f2f5">
      ${renderMsgItems(S.conversation.messages, S.conversationLeadId)}
    </div>`
  }

  const showDetails = !!S.detailsOpen
  return `
    <div style="position:fixed;inset:0;z-index:40;display:flex;justify-content:flex-end" onclick="if(event.target===this)closeConversation()">
      <div style="display:flex;height:100%;width:100%;max-width:${showDetails?'780':'460'}px;box-shadow:-4px 0 32px rgba(0,0,0,0.13);transition:max-width 0.28s cubic-bezier(0.32,0.72,0,1)">
        <div style="background:#fff;flex:1;min-width:0;display:flex;flex-direction:column;height:100%;border-right:${showDetails?'1px solid #e9edef':'none'}">
          <div id="conv-chat-header" style="display:flex;align-items:flex-start;gap:6px;padding:12px 14px;border-bottom:1px solid #e9edef;background:#fff;flex-shrink:0">
            ${_renderConvChatHeaderInner(lead)}
          </div>
          ${msgArea}
          <div id="conv-reply-box" style="flex-shrink:0">${renderReplyBox(S.conversationLeadId)}</div>
        </div>
        <div id="conv-details-panel" style="width:${showDetails?'320px':'0'};flex-shrink:0;overflow:hidden;background:#fff;transition:width 0.28s cubic-bezier(0.32,0.72,0,1)" onclick="if(event.target.closest('[data-action=&quot;close-details&quot;]'))toggleConvDetails()">
          <div style="width:320px;height:100%;overflow-y:auto;display:flex;flex-direction:column">
            ${showDetails ? renderLeadDetailsPanel(lead) : ''}
          </div>
        </div>
      </div>
    </div>`
}

// ─── Dashboard ────────────────────────────────────────────────────────────────






function setInboxFilter(f) {
  _inboxFilter = f
  // Atualiza visual dos chips imediatamente, sem aguardar rebuild
  document.querySelectorAll('#inbox-filter-chips [data-filter-key]').forEach(btn => {
    const active = btn.dataset.filterKey === f
    btn.style.background = active ? 'var(--accent)' : '#f0f2f5'
    btn.style.color = active ? '#fff' : '#555'
  })
  if (S.inboxSearchResults !== null && _inboxSearch.trim()) {
    // Em modo busca: re-executa a busca com o novo filtro
    S.inboxListLimit = INBOX_PAGE
    filterConvList(_inboxSearch)
  } else {
    S.inboxListLimit = INBOX_PAGE
    // Limpa a lista para forçar rebuild completo ao trocar filtro,
    // evitando que o fast-path cirúrgico deixe itens antigos visíveis
    const wrap = document.querySelector('#inbox-list-scroll > div')
    if (wrap) wrap.innerHTML = ''
    _patchInboxListPanel()
  }
}


function _inboxFilterChipsHtml() {
  const counts = _inboxCounts()
  const chips = [
    { key: 'all', label: 'Todas', count: counts.all },
    { key: 'unread', label: 'Não lidas', count: counts.unread },
    { key: 'starred', label: 'Favoritas', count: counts.starred },
  ]
  return `<div id="inbox-filter-chips" class="cv-fil-row">
    ${chips.map(c => {
      const active = _inboxFilter === c.key
      const showCount = c.count > 0 || c.key === 'all'
      return `<button onclick="setInboxFilter('${c.key}')" data-filter-key="${c.key}" class="cv-fil-chip${active?' active':''}">${c.label}${showCount ? `<span class="cv-fil-count">${c.count}</span>` : ''}</button>`
    }).join('')}
  </div>`
}

var _inboxSearchTimer = null


function filterConvList(q) {
  _inboxSearch = q
  const clearBtn = document.getElementById('inbox-search-clear')
  if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none'

  if (!q.trim()) {
    clearTimeout(_inboxSearchTimer)
    if (S.inboxSearchResults !== null) {
      S.inboxSearchResults = null
      S.inboxListLimit = INBOX_PAGE
      _patchInboxListScroll()
    }
    return
  }

  if (q.trim().length < 2) return

  clearTimeout(_inboxSearchTimer)
  _inboxSearchTimer = setTimeout(async () => {
    try {
      const resp = await api(`/?withMessages=1&search=${encodeURIComponent(q.trim())}`)
      const raw = Array.isArray(resp) ? resp : (resp.data ?? [])
      // Mescla starred (que é só client-side) com os resultados do backend
      const localMap = new Map(S.inboxLeads.concat(S.leads).map(l => [l.id, l]))
      let filtered = raw.filter(r => r.lastMessageAt).map(r => {
        const local = localMap.get(r.id)
        return local ? { ...r, starred: local.starred ?? r.starred } : r
      })
      // Aplica filtro ativo nos resultados
      if (_inboxFilter === 'unread') filtered = filtered.filter(l => l.unreadCount > 0)
      if (_inboxFilter === 'starred') filtered = filtered.filter(l => l.starred)
      S.inboxSearchResults = filtered
    } catch { return }
    // Atualiza só a lista — sem recriar header/input/chips para não perder foco
    _patchInboxListScroll()
  }, 400)
}


function _forceInboxRebuild() {
  const scroll = document.getElementById('inbox-list-scroll')
  if (scroll) scroll.innerHTML = ''
  _inboxScrollBound = false
}

// Atualiza só o conteúdo da lista, sem recriar header/input/chips

function _patchInboxListScroll() {
  const scroll = document.getElementById('inbox-list-scroll')
  if (!scroll) { _patchInboxListPanel(); return }

  const leads = S.inboxSearchResults !== null ? S.inboxSearchResults : inboxLeads().slice(0, S.inboxListLimit)

  const countEl = document.getElementById('inbox-list-count')
  if (countEl) {
    if (S.inboxSearchResults !== null) {
      countEl.textContent = `${leads.length} resultado${leads.length===1?'':'s'}`
      countEl.classList.remove('has-unread')
    } else {
      const counts = _inboxCounts()
      countEl.textContent = counts.unread > 0
        ? `${counts.unread} não lida${counts.unread===1?'':'s'}`
        : `${counts.all} contato${counts.all===1?'':'s'}`
      countEl.classList.toggle('has-unread', counts.unread > 0)
    }
  }
  // Atualiza contagens nos chips de filtro
  const chipsEl = document.getElementById('inbox-filter-chips')
  if (chipsEl) chipsEl.outerHTML = _inboxFilterChipsHtml()

  if (leads.length === 0) {
    scroll.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-muted)"><p style="font-size:13px">Nenhum resultado</p></div>'
    return
  }
  scroll.innerHTML = renderInboxList(leads)
  if (S.inboxSearchResults === null) { _inboxScrollBound = false; attachInboxScrollListener() }
}

// ── Inbox lazy loading ──────────────────────────────────────────────────────


function _inboxSentinelHtml() {
  return `<div data-inbox-sentinel style="height:44px;display:flex;align-items:center;justify-content:center;font-size:11.5px;color:var(--text-muted);gap:6px;flex-shrink:0">
    <svg style="width:14px;height:14px;animation:spin 0.8s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
    Carregando mais...
  </div>`
}

var _inboxScrollBound = false


function attachInboxScrollListener() {
  const scroll = document.getElementById('inbox-list-scroll')
  if (!scroll || _inboxScrollBound) return
  _inboxScrollBound = true
  scroll.addEventListener('scroll', _onInboxScroll, { passive: true })
}


function _onInboxScroll() {
  const scroll = document.getElementById('inbox-list-scroll')
  if (!scroll) return
  if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 120) {
    _loadMoreInboxList()
  }
}


function _syncInboxSentinel(allLeads) {
  const wrap = document.querySelector('#inbox-list-scroll > div')
  if (!wrap) return
  const old = wrap.querySelector('[data-inbox-sentinel]')
  if (old) old.remove()
  if (allLeads.length > S.inboxListLimit) {
    const tmp = document.createElement('div')
    tmp.innerHTML = _inboxSentinelHtml()
    wrap.appendChild(tmp.firstElementChild)
  }
  attachInboxScrollListener()
}


function _loadMoreInboxList() {
  const allLeads = inboxLeads()
  const from = S.inboxListLimit
  const to = from + INBOX_PAGE
  S.inboxListLimit = to

  const newLeads = allLeads.slice(from, to)

  const wrap = document.querySelector('#inbox-list-scroll > div')
  if (!newLeads.length) {
    // Sem mais itens — remove sentinel para não ficar preso
    const s = wrap?.querySelector('[data-inbox-sentinel]')
    if (s) s.remove()
    return
  }
  if (!wrap) return

  const sentinel = wrap.querySelector('[data-inbox-sentinel]')
  if (sentinel) sentinel.remove()

  const frag = document.createDocumentFragment()
  for (const l of newLeads) {
    const tmp = document.createElement('div')
    tmp.innerHTML = _renderInboxItem(l)
    frag.appendChild(tmp.firstElementChild)
  }
  if (allLeads.length > to) {
    const tmp = document.createElement('div')
    tmp.innerHTML = _inboxSentinelHtml()
    frag.appendChild(tmp.firstElementChild)
  }
  wrap.appendChild(frag)
  if (allLeads.length > to) attachInboxScrollListener()
}


function _inboxBase() {
  const userId = S.me?.id
  // Conversas = leads com pelo menos uma mensagem trocada (lastMessageAt setado).
  // Sem o filtro, /leads/?withMessages=1 (que retorna TODOS) inundava a lista com leads importados sem conversa.
  const source = S.inboxLeads.length > 0 ? S.inboxLeads : S.leads
  let base = source.filter(l => l.lastMessageAt)
  if (S.conversationLeadId && !base.some(l => l.id === S.conversationLeadId)) {
    const open = S.leads.find(l => l.id === S.conversationLeadId) ||
                 S.inboxLeads.find(l => l.id === S.conversationLeadId)
    if (open) base = [...base, open]
  }
  if (S.me?.role !== 'ADMIN') base = base.filter(l => l.assignedToId === userId)
  return base
}

function _inboxCounts() {
  const base = _inboxBase()
  return {
    all: base.length,
    unread: base.filter(l => l.unreadCount > 0).length,
    starred: base.filter(l => l.starred).length,
  }
}

function inboxLeads() {
  let base = _inboxBase()
  if (_inboxFilter === 'unread') base = base.filter(l => l.unreadCount > 0)
  if (_inboxFilter === 'starred') base = base.filter(l => l.starred)
  return [...base].sort((a, b) => {
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt) : new Date(0)
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt) : new Date(0)
    return tb - ta
  })
}


function renderInboxPanel() {
  // Used as fallback for mobile (not Chatwoot split)
  const leads = inboxLeads()
  if (leads.length === 0) return `
    <div class="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
      <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      <p class="font-medium">Nenhuma conversa ainda</p>
      <p class="text-sm mt-1">As mensagens recebidas via WhatsApp aparecerão aqui.</p>
    </div>`
  return renderInboxList(leads)
}

// FASE3-A: extrai renderização de um item individual — usado pelo diff e pelo render completo

function _renderInboxItem(l) {
  const hasUnread = l.unreadCount > 0
  const isActive = S.conversationLeadId === l.id
  const preview = S.msgPreviews[l.id]
  const isTelegram = (l.phone || '').startsWith('tg_')
  // isActive excluído do fingerprint — estado ativo é atualizado via _updateInboxActiveItem sem passar pelo diff
  const fp = `${l.unreadCount||0}|${l.starred?1:0}|${S.msgPreviews[l.id]?.text||''}|${timeAgo(l.lastMessageAt)}|${l.avatarUrl?'1':''}`
  const channelBadge = isTelegram
    ? `<span class="cv-conv-ch tg" title="Telegram">T</span>`
    : `<span class="cv-conv-ch wa" title="WhatsApp">W</span>`
  const previewText = preview?.text
    ? (preview.out ? `<span class="me">Você: </span>${esc(preview.text)}` : esc(preview.text))
    : (fmtPhone(l.phone) || '📎 Mídia')
  return `<div data-lead-id="${l.id}" data-fp="${esc(fp)}" data-search="${esc(l.name||'')}" data-phone="${esc(l.phone||'')}" onclick="openConversation('${l.id}')" class="cv-conv${isActive?' active':''}">
    <div class="cv-conv-av-wrap">
      ${_leadAvatar(l, 44)}
      ${channelBadge}
    </div>
    <div class="cv-conv-info">
      <div class="cv-conv-row1">
        <div class="cv-conv-name-wrap">
          ${l.starred ? `<svg style="flex-shrink:0;width:11px;height:11px" fill="#f59e0b" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>` : ''}
          <p class="cv-conv-name${hasUnread?' unread':' read'}">${esc(l.name)}</p>
        </div>
        <span class="cv-conv-time">${timeAgo(l.lastMessageAt)}</span>
      </div>
      <div class="cv-conv-row2">
        <p class="cv-conv-preview${hasUnread?' unread':''}">${previewText}</p>
        ${hasUnread ? `<span class="cv-conv-unread">${l.unreadCount}</span>` : ''}
      </div>
    </div>
  </div>`
}

// FASE3-A: diff cirúrgico da lista — atualiza/reordena só o que mudou

function _patchInboxListItems(leads) {
  const wrap = document.querySelector('#inbox-list-scroll > div')
  if (!wrap) return false

  // Índice dos elementos atuais no DOM
  const existing = new Map()
  for (const el of wrap.querySelectorAll('[data-lead-id]')) {
    existing.set(el.getAttribute('data-lead-id'), el)
  }

  // Remove leads que saíram da lista
  const newIds = new Set(leads.map(l => l.id))
  for (const [id, el] of existing) {
    if (!newIds.has(id)) { el.remove(); existing.delete(id) }
  }

  // Atualiza/reordena com cursor insertBefore — só move o que está fora de posição.
  // Usar wrap.appendChild(el) em todos os itens causa reflows desnecessários que
  // disparam o "pulo" de scroll mesmo quando a ordem já está correta.
  const tmp = document.createElement('div')
  let nextRef = wrap.firstChild  // cursor: próximo item deve vir antes deste nó

  for (const l of leads) {
    const oldEl = existing.get(l.id)
    const newFp = `${l.unreadCount||0}|${l.starred?1:0}|${S.msgPreviews[l.id]?.text||''}|${timeAgo(l.lastMessageAt)}|${l.avatarUrl?'1':''}`

    let el
    if (oldEl && oldEl.getAttribute('data-fp') === newFp) {
      el = oldEl  // conteúdo inalterado — reusar
    } else {
      tmp.innerHTML = _renderInboxItem(l)
      const newEl = tmp.firstElementChild
      if (oldEl) {
        if (nextRef === oldEl) nextRef = newEl  // mantém cursor válido após replaceWith
        oldEl.replaceWith(newEl)
        el = newEl
      } else {
        el = newEl  // novo item — será inserido abaixo
      }
    }

    if (el === nextRef) {
      // Já está na posição correta — só avança o cursor, zero movimentos no DOM
      nextRef = el.nextSibling
    } else {
      // Posição errada ou item novo — insere/move para a posição correta
      wrap.insertBefore(el, nextRef)  // funciona tanto para inserção quanto para reordenação
      nextRef = el.nextSibling        // após insertBefore, el.nextSibling === nextRef original
    }
  }
  return true
}


function renderInboxList(leads) {
  if (S.inboxSearchResults !== null) {
    // Modo busca: mostra todos os resultados sem paginação
    return `<div>${leads.map(l => _renderInboxItem(l)).join('')}</div>`
  }
  // Modo normal: pagina por INBOX_PAGE
  const visible = leads.slice(0, S.inboxListLimit)
  const hasMore = leads.length > S.inboxListLimit
  return `<div>${visible.map(l => _renderInboxItem(l)).join('')}${hasMore ? _inboxSentinelHtml() : ''}</div>`
}

// ─── Lead detail helpers ──────────────────────────────────────────────────────

async function detailUpdate(leadId, patch) {
  try {
    const r = await api(`/${leadId}`, { method: 'PUT', body: JSON.stringify(patch) })
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, ...r } : l)
    render()
    // Recarrega timeline para refletir os eventos recém registrados (audit log)
    if (typeof loadLeadActivity === 'function') loadLeadActivity(leadId); else loadModule('financial').then(()=>loadLeadActivity(leadId))
  } catch(e) { showToast(e.message, 'error') }
}


async function detailAddTag(leadId, tagOverride) {
  const tag = (tagOverride ?? S.detailTagInput).trim()
  if (!tag) return
  const lead = S.leads.find(l => l.id === leadId)
  if (!lead) return
  const tags = [...(lead.tags || []), tag].filter((t, i, a) => a.indexOf(t) === i)
  S.detailTagInput = ''
  const inputEl = document.getElementById('detail-tag-input')
  if (inputEl) inputEl.value = ''
  _patchTagSuggestions(leadId)
  await detailUpdate(leadId, { tags })
  // Refresh tag options in background if this is a new tag
  if (!S.tagOptions.includes(tag)) loadModule('leads').then(() => fetchTagOptions()).then(() => scheduleRender())
  // Mantém input aberto e refoca pra adicionar várias tags em sequência
  if (S.detailTagAddingOpen) {
    setTimeout(() => document.getElementById('detail-tag-input')?.focus(), 0)
  }
}


async function detailRemoveTag(leadId, tag) {
  const lead = S.leads.find(l => l.id === leadId)
  if (!lead) return
  await detailUpdate(leadId, { tags: (lead.tags || []).filter(t => t !== tag) })
}


function openDetailTagInput() {
  S.detailTagAddingOpen = true
  S.detailTagInput = ''
  _patchInboxDetailsPanel()
  setTimeout(() => {
    const inp = document.getElementById('detail-tag-input')
    if (inp) inp.focus()
  }, 0)
}


function closeDetailTagInput() {
  S.detailTagAddingOpen = false
  S.detailTagInput = ''
  _patchInboxDetailsPanel()
}

// ── AI Phase 1 helpers ────────────────────────────────────────────────
S.leadAiState = S.leadAiState || {}        // { [leadId]: {state, pausedAt, ...} }
S.leadAiStateLoading = S.leadAiStateLoading || {}
S.aiGlobalOverride = S.aiGlobalOverride || null

var AI_STATE_LABELS = {
  auto: { txt:'IA automática', cls:'on', desc:'Segue config do agente' },
  paused_by_operator: { txt:'IA pausada (operador)', cls:'paused', desc:'Foi pausada manualmente' },
  paused_by_takeover: { txt:'IA pausada (takeover)', cls:'paused', desc:'Operador respondeu manualmente' },
  handed_off: { txt:'IA transferiu', cls:'paused', desc:'Handoff por palavra-chave ou limite' },
  force_active: { txt:'IA forçada', cls:'on', desc:'Sempre atende este lead' },
}


function _patchLeadAiCard(leadId) {
  const el = document.getElementById('lead-ai-card-' + leadId)
  if (!el) return false
  const lead = (S.leads||[]).find(l => l.id === leadId) || (S.inboxLeads||[]).find(l => l.id === leadId) || S._activeLead
  if (!lead) return false
  // Cria DOM temporário com novo HTML do card e substitui
  const wrap = document.createElement('div')
  wrap.innerHTML = _safeRender('renderLeadAiBadge', lead).trim()
  const newCard = wrap.firstElementChild
  if (newCard) el.replaceWith(newCard)
  return true
}


function renderLeadDetailsPanel(lead) {
  // Trigger lazy-load dos módulos que renderizam seções deste painel.
  // Sem isso, _safeRender fica em placeholder permanente.
  if (typeof renderLeadAiBadge !== 'function') loadModule('ai-agents').then(() => scheduleRender())
  if (typeof renderLeadFinancialSection !== 'function') loadModule('financial').then(() => scheduleRender())
  if (typeof renderLeadUtmSection !== 'function') loadModule('leads').then(() => scheduleRender())
  // S.users vem de settings.js — necessário pro dropdown de operador
  if ((!S.users || S.users.length === 0) && typeof fetchUsers !== 'function') {
    loadModule('settings').then(() => fetchUsers && fetchUsers()).then(() => scheduleRender())
  }

  // Defensivo: lead sem name (Kommo import etc) — usa cauda do telefone
  const _phoneTail = String(lead.phone||'').replace(/\D/g,'').slice(-4) || '?'
  const _safeName = (lead.name||'').trim() || _phoneTail
  const hue = Math.abs(_safeName.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
  const avatarBg = `hsl(${hue},55%,88%)`
  const avatarTx = `hsl(${hue},55%,35%)`
  const initials = esc((_safeName.split(/\s+/).map(w=>w[0]).slice(0,2).join('') || _phoneTail.slice(0,2)).toUpperCase())

  const isTg = (lead.phone || '').startsWith('tg_')
  const tgChatId = isTg ? lead.phone.replace(/^tg_/, '') : ''
  const channelBadge = isTg
    ? `<span class="det-av-ch tg" title="Telegram">T</span>`
    : `<span class="det-av-ch wa" title="WhatsApp">W</span>`

  // Engajamento
  const msgCount = (S.conversationLeadId === lead.id && Array.isArray(S.conversation?.messages))
    ? S.conversation.messages.length
    : 0
  const daysInPipeline = lead.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000))
    : 0

  return `
  <div class="det-shell">

    <!-- Header centralizado: avatar + nome + handle + quick actions -->
    <div class="det-head">
      <button class="det-close" data-action="close-details" title="Fechar painel">
        <svg data-action="close-details" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
      </button>
      <div class="det-av" style="background:${avatarBg};color:${avatarTx}">
        ${lead.avatarUrl
          ? `<img src="${esc(lead.avatarUrl)}" alt="${initials}"
                  style="width:100%;height:100%;border-radius:50%;object-fit:cover;cursor:pointer"
                  onclick="event.stopPropagation();openAvatarLightbox('${esc(lead.avatarUrl)}','${esc(lead.name||'')}')"
                  onerror="this.parentNode.querySelector('.det-av-fallback')?.style.setProperty('display','inline');this.style.display='none'">
             <span class="det-av-fallback" style="display:none">${initials}</span>`
          : initials}
        ${channelBadge}
      </div>
      <div class="det-name" style="display:inline-flex;align-items:center;gap:6px">
        <span>${esc((lead.name||'').trim() || fmtPhone(lead.phone) || 'Sem nome')}</span>
        <button class="det-name-edit" title="Editar nome" onclick="event.stopPropagation();editLeadName('${lead.id}')" style="background:transparent;border:none;cursor:pointer;color:var(--text-muted);padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;transition:color 0.15s,background 0.15s" onmouseover="this.style.color='var(--text-primary)';this.style.background='var(--surface-2)'" onmouseout="this.style.color='var(--text-muted)';this.style.background='transparent'">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
      </div>
      <div class="det-handle">${isTg ? `tg_${esc(tgChatId)}` : esc(fmtPhone(lead.phone) || lead.phone || '')}</div>

      <div class="det-quick">
        ${!isTg ? `
        <button class="det-q-btn" onclick="window.open('tel:${esc(lead.phone||'')}','_self')" title="Ligar">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          Ligar
        </button>` : `
        <button class="det-q-btn" onclick="navigate('broadcasts')" title="Disparo">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14"/></svg>
          Disparo
        </button>`}
        <button class="det-q-btn" onclick="navigate('kanban')" title="Ver no Kanban">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          Kanban
        </button>
        <button class="det-q-btn${lead.isBlocked?' active':''}" onclick="confirmBlockLead('${lead.id}', ${lead.isBlocked?'true':'false'})" title="${lead.isBlocked?'Desbloquear':'Bloquear (some da lista, sem deletar)'}">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 18.364M5.636 5.636l12.728 12.728"/></svg>
          ${lead.isBlocked?'Desbloq.':'Bloquear'}
        </button>
        ${canDeleteLead(lead) ? `<button class="det-q-btn" onclick="confirmDeleteLead('${lead.id}')" title="Excluir">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V3a1 1 0 011-1h4a1 1 0 011 1v4"/></svg>
          Excluir
        </button>` : ''}
      </div>
    </div>

    <!-- Body com seções -->
    <div class="det-body">

      ${_safeRender('renderLeadAiBadge', lead)}
      <!-- Status / Responsável (mesmos triggers da aba Leads pra consistência visual) -->
      <div class="det-section">
        <div class="det-label">Status</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${(() => {
            const curStage = lead.stageId ? (S.kanban?.stages||[]).find(s => s.id === lead.stageId) : null
            const stageName = curStage?.name || 'Sem Etapa'
            const stageColor = curStage?.color || '#94a3b8'
            return `<span class="lds-pill-trigger" onclick="event.stopPropagation();ldsToggleStageMenu(this,'${lead.id}')">
              <span class="dot" style="background:${esc(stageColor)}"></span>${esc(stageName)}
              <svg class="chevron" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </span>`
          })()}
          ${(() => {
            const op = (S.users || []).find(u => u.id === lead.assignedToId)
            const opHue = op ? Math.abs(op.name.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360 : 0
            return `<span class="lds-op-trigger" onclick="event.stopPropagation();ldsToggleOpMenu(this,'${lead.id}')">
              ${op ? `<span class="lds-op-av" style="background:hsl(${opHue},55%,88%);color:hsl(${opHue},55%,35%)">${esc(op.name.charAt(0).toUpperCase())}</span><span class="lds-op-name">${esc(op.name)}</span>` : `<span class="lds-op-av empty">?</span><span class="lds-op-name" style="color:var(--text-muted);font-style:italic">Sem operador</span>`}
              <svg class="lds-op-chev" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </span>`
          })()}
        </div>
      </div>

      <!-- Tags -->
      <div class="det-section">
        <div class="det-label">
          Tags
          ${!S.detailTagAddingOpen ? `<button class="det-label-add" title="Adicionar tag" onclick="openDetailTagInput()">+</button>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0;min-height:24px">
          ${(lead.tags || []).map(t => `
            <span class="det-tag${t.toLowerCase()==='telegram'?' tg':''}">
              ${esc(t)}
              <button class="x" onclick="detailRemoveTag('${lead.id}','${esc(t).replace(/'/g,"\\'")}')" title="Remover"><svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </span>`).join('')}
          ${!S.detailTagAddingOpen
            ? `<button class="det-tag-add" onclick="openDetailTagInput()">+ tag</button>`
            : `<input id="detail-tag-input" type="text" value="${esc(S.detailTagInput)}" placeholder="Nova tag…" autocomplete="off"
                oninput="S.detailTagInput=this.value;_patchTagSuggestions('${lead.id}')"
                onkeydown="if(event.key==='Enter'){event.preventDefault();detailAddTag('${lead.id}')}else if(event.key==='Escape'){closeDetailTagInput()}"
                onblur="if(!this.value.trim())closeDetailTagInput()"
                style="font-size:11.5px;border:1px solid var(--accent);border-radius:100px;padding:3px 10px;outline:none;font-family:inherit;background:var(--surface);color:var(--text-primary);box-shadow:0 0 0 3px var(--accent-soft);max-width:120px;margin:0 4px 4px 0"/>`
          }
        </div>
        <div id="tag-suggestions-${lead.id}" style="position:relative"></div>
      </div>

      <!-- Contato -->
      <div class="det-section">
        <div class="det-label">Contato</div>
        ${isTg ? `
        <div class="det-row">
          <div class="det-row-icon">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21.5 4.5l-19 7.5 6 2 2 6 2.5-3 5 4z"/></svg>
          </div>
          <div class="det-row-info">
            <div class="det-row-key">Chat ID Telegram</div>
            <div class="det-row-val num-val">${esc(tgChatId)}</div>
          </div>
          <button class="det-copy" title="Copiar" onclick="navigator.clipboard.writeText('${esc(tgChatId)}');showToast?showToast('Copiado','success'):0">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
        </div>` : `
        <div class="det-row">
          <div class="det-row-icon">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          </div>
          <div class="det-row-info">
            <div class="det-row-key">Telefone</div>
            <div class="det-row-val num-val">${esc(fmtPhone(lead.phone) || lead.phone || '')}</div>
          </div>
          <button class="det-copy" title="Copiar" onclick="navigator.clipboard.writeText('${esc(lead.phone||'')}');showToast?showToast('Copiado','success'):0">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
          <button class="det-copy" title="Editar telefone" onclick="event.stopPropagation();editLeadPhone('${lead.id}')">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
        </div>`}
        <div class="det-row">
          <div class="det-row-icon">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          </div>
          <div class="det-row-info">
            <div class="det-row-key">E-mail</div>
            <div class="det-row-val ${lead.email?'':'empty'}" id="lead-email-display-${lead.id}" style="${lead.email?'':'color:var(--text-muted);font-style:italic'}">${lead.email ? esc(lead.email) : 'Não informado'}</div>
          </div>
          ${lead.email ? `<button class="det-copy" title="Copiar" onclick="navigator.clipboard.writeText('${esc(lead.email)}');showToast?showToast('E-mail copiado','success'):0">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>` : ''}
          <button class="det-copy" title="${lead.email?'Editar e-mail':'Adicionar e-mail'}" onclick="event.stopPropagation();editLeadEmail('${lead.id}')">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
        </div>
        ${lead.origin ? `
        <div class="det-row">
          <div class="det-row-icon">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </div>
          <div class="det-row-info">
            <div class="det-row-key">Origem</div>
            <div class="det-row-val">${esc(lead.origin)}</div>
          </div>
        </div>` : ''}
      </div>

      <!-- Financeiro -->
      <div class="det-section">
        ${_safeRender('renderLeadFinancialSection', lead)}
      </div>

      <!-- Engajamento -->
      <div class="det-section">
        <div class="det-label">Engajamento</div>
        <div class="det-stats">
          <div class="det-stat-card">
            <div class="det-stat-label">Mensagens</div>
            <div class="det-stat-num">${msgCount}</div>
          </div>
          <div class="det-stat-card">
            <div class="det-stat-label">No pipeline</div>
            <div class="det-stat-num">${daysInPipeline}<span style="font-size:11px;font-weight:600;color:var(--text-muted);margin-left:2px">d</span></div>
          </div>
        </div>
      </div>

      <!-- Notas -->
      <div class="det-section det-notes">
        <div class="det-label">Notas internas</div>
        <textarea rows="4" placeholder="Adicione observações sobre o lead…"
          onblur="if(this.value!==${JSON.stringify(lead.notes||'')})detailUpdate('${lead.id}',{notes:this.value||null})"
        >${esc(lead.notes||'')}</textarea>
        <p class="det-notes-hint">Salvo automaticamente ao sair do campo</p>
      </div>

      <!-- Marketing / UTM (acima de Atividade) -->
      ${_safeRender('renderLeadUtmSection', lead)}

      <!-- Atividade (timeline real do lead_events) -->
      ${(() => {
        const activity = S.leadActivity[lead.id]
        if (activity === undefined) {
          loadLeadActivity(lead.id)
          return `
          <div class="det-section">
            <div class="det-label">Atividade</div>
            <div style="font-size:11.5px;color:var(--text-muted);font-style:italic">Carregando…</div>
          </div>`
        }
        if (!activity.length) return ''
        const renderEvent = (e) => {
          const p = e.payload || {}
          const actor = e.actorName || (p.source === 'webhook' ? 'sistema' : 'sistema')
          let dot = '', html = ''
          switch (e.type) {
            case 'LEAD_CREATED':
              dot = (p.origin || '').toLowerCase().includes('telegram') ? 'tg' : 'warning'
              html = `<strong>Lead criado</strong>${p.origin ? ` · <code>${esc(p.origin)}</code>` : ''}`
              break
            case 'ASSIGNED':
              dot = ''
              html = `<strong>Atribuído</strong> a ${esc(p.toName || '—')}${p.fromName ? ` <span style="color:var(--text-muted)">(antes ${esc(p.fromName)})</span>` : ''}`
              break
            case 'UNASSIGNED':
              dot = ''
              html = `<strong>Atribuição removida</strong>${p.fromName ? ` <span style="color:var(--text-muted)">(era ${esc(p.fromName)})</span>` : ''}`
              break
            case 'STAGE_CHANGED':
              dot = 'accent'
              html = `<strong>Movido</strong> ${p.fromName ? `de <code>${esc(p.fromName)}</code> ` : ''}para <code>${esc(p.toName || 'Sem etapa')}</code>`
              break
            case 'STATUS_CHANGED': {
              dot = 'accent'
              // Traduz valores raw do DB (pego/em_andamento/etc) pros labels amigáveis
              const _statusLabel = v => v ? (STATUS[v]?.label || v) : '—'
              html = `<strong>Status:</strong> ${esc(_statusLabel(p.from))} → ${esc(_statusLabel(p.to))}`
              break
            }
            case 'TAG_ADDED':
              dot = 'success'
              html = `Tag <code>${esc(p.tag)}</code> <strong>adicionada</strong>`
              break
            case 'TAG_REMOVED':
              dot = 'warning'
              html = `Tag <code>${esc(p.tag)}</code> <strong>removida</strong>`
              break
            case 'NOTE_UPDATED':
              dot = ''
              html = p.cleared ? '<strong>Notas limpadas</strong>' : `<strong>Notas atualizadas</strong> <span style="color:var(--text-muted)">(${p.newLen} chars)</span>`
              break
            default:
              dot = ''
              html = `<strong>${esc(e.type)}</strong>`
          }
          const byline = e.actorName ? ` · ${esc(e.actorName)}` : ''
          return `
            <div class="det-event">
              <div class="det-event-dot${dot ? ' '+dot : ''}"></div>
              <div class="det-event-info">
                <div class="det-event-text">${html}</div>
                <div class="det-event-time">há ${timeAgo(e.createdAt)}${byline}</div>
              </div>
            </div>`
        }
        return `
        <div class="det-section">
          <div class="det-label">Atividade <span style="color:var(--text-muted);font-weight:500;text-transform:none;letter-spacing:0;font-size:10.5px">${activity.length} evento${activity.length===1?'':'s'}</span></div>
          <div class="det-timeline">
            ${activity.map(renderEvent).join('')}
          </div>
        </div>`
      })()}

    </div>
  </div>`
}


function renderInboxLayout() {
  const leads = inboxLeads()
  const lead = _findActiveLead()
  const counts = _inboxCounts()
  const headerLabel = _inboxSearch
    ? `${leads.length} resultado${leads.length===1?'':'s'}`
    : counts.unread > 0
      ? `${counts.unread} não lida${counts.unread===1?'':'s'}`
      : `${counts.all} contato${counts.all===1?'':'s'}`

  return `
  <!-- Conversation list -->
  <div id="inbox-list-panel" style="width:340px;min-width:300px;border-right:1px solid var(--border);background:#fff;display:flex;flex-direction:column;flex-shrink:0;overflow:hidden">
    <div class="cv-list-head">
      <div class="cv-list-title-row">
        <div class="cv-list-title">Conversas</div>
        <span id="inbox-list-count" class="cv-list-count${counts.unread > 0 && !_inboxSearch ? ' has-unread' : ''}">${headerLabel}</span>
      </div>
      <div class="cv-list-search">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input id="inbox-search-input" type="text" placeholder="Buscar conversa, nome ou número..." oninput="filterConvList(this.value)" value="${esc(_inboxSearch)}">
        <button id="inbox-search-clear" onclick="filterConvList('');document.getElementById('inbox-search-input').value=''" class="cv-list-search-clear" style="display:${_inboxSearch ? 'flex' : 'none'}">✕</button>
      </div>
    </div>
    ${_inboxFilterChipsHtml()}
    <div id="inbox-list-scroll" style="flex:1;overflow-y:auto;padding:6px 0">
      ${leads.length === 0
        ? '<div class="cv-empty"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg><p>Nenhuma conversa</p></div>'
        : renderInboxList(leads)
      }
    </div>
  </div>

  <!-- Chat area -->
  <div id="inbox-chat-area" style="flex:1;display:flex;flex-direction:column;min-width:0;background:var(--surface-2);overflow:hidden">
    ${lead ? renderChatPanel(lead) : `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);gap:14px">
        <svg style="width:60px;height:60px;opacity:0.14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
        <p style="font-size:13.5px">Selecione uma conversa</p>
      </div>`
    }
  </div>

  <!-- Details panel -->
  <div id="inbox-details-panel" style="overflow:hidden;display:${lead && S.detailsOpen ? 'flex' : 'none'};flex-direction:column;align-self:stretch">${lead && S.detailsOpen ? renderLeadDetailsPanel(lead) : ''}</div>`
}


function renderChatPanel(lead) {
  let msgArea = ''

  if (S.conversationLoading) {
    msgArea = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;gap:8px">
      <svg style="width:18px;height:18px;animation:spin 0.7s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
      Carregando...
    </div>`
  } else if (!S.conversation?.hasContact || !S.conversation.messages.length) {
    const _isUnoff = (S.unofficialSessions||[]).some(s => s.id === S.convConnId)
    const _hint = _isUnoff
      ? 'Digite uma mensagem abaixo · WhatsApp Web (sem janela de 24h)'
      : `Digite <kbd style="background:#e9edef;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:11px">/</kbd> para selecionar um template e iniciar`
    msgArea = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);gap:12px;padding:24px;text-align:center;background:#f0f2f5">
      <svg style="width:52px;height:52px;opacity:0.18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      <div>
        <p style="font-size:13.5px;font-weight:600;color:#667781;margin:0 0 4px">Nenhuma mensagem ainda</p>
        <p style="font-size:11.5px;color:#aab0b7;margin:0">${_hint}</p>
      </div>
    </div>`
  } else {
    msgArea = `<div id="conv-msgs" style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:2px">
      ${renderMsgItems(S.conversation.messages, lead.id)}
    </div>`
  }

  return `
  <!-- Chat header -->
  <div id="inbox-chat-header" class="cv-chat-head">${_chatHeaderInnerHtml(lead)}</div>

  <!-- Messages -->
  ${msgArea}

  <!-- Reply -->
  <div id="inbox-reply-box">${renderReplyBox(lead.id)}</div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════
// CONEXÕES
// ═══════════════════════════════════════════════════════════════════════════

var CONN_STATUS = {
  ACTIVE:   { label:'Ativo',   cls:'bg-green-100 text-green-700 border-green-200' },
  PAUSED:   { label:'Pausado', cls:'bg-yellow-100 text-yellow-700 border-yellow-200' },
  INACTIVE: { label:'Inativo', cls:'bg-gray-100 text-gray-500 border-gray-200' },
}
var CONN_QUALITY = {
  GREEN:  { label:'Ótima',   cls:'text-green-600',  dot:'bg-green-500'  },
  YELLOW: { label:'Regular', cls:'text-yellow-600', dot:'bg-yellow-500' },
  RED:    { label:'Ruim',    cls:'text-red-600',    dot:'bg-red-500'    },
}


function isTypingInChat() {
  const el = document.getElementById('reply-input')
  return el != null && document.activeElement === el
}

// ─── Polling de mensagens ─────────────────────────────────────────────────────
var _pollTimer = null
// ── FASE1-A: Page Visibility — pausa poll quando aba está oculta ────────────
var _tabVisible = !document.hidden
document.addEventListener('visibilitychange', () => {
  const wasHidden = !_tabVisible
  _tabVisible = !document.hidden
  // Ao voltar para a aba: reseta backoff, força ciclo imediato e retoma fila de avatares
  if (wasHidden && _tabVisible) {
    _pollIdleCycles = 0; _pollTickCount = 0
    if (_avatarQueuePending.size > 0 && S.avatarSession?.sessionStatus === 'connected') {
      _runAvatarQueue()
    }
  }
})
// ── FASE1-B: Backoff adaptativo (leads) ─────────────────────────────────────
// 0–5 ciclos idle → roda todo tick (5s)
// 6–15 ciclos idle → roda a cada 2 ticks (10s)
// 16+ ciclos idle  → roda a cada 3 ticks (15s)
var _pollIdleCycles = 0
var _pollTickCount  = 0
// ── FASE2-C: Backoff independente da conversa ────────────────────────────────
var _convIdleCycles = 0
var _convTickCount  = 0
// ────────────────────────────────────────────────────────────────────────────