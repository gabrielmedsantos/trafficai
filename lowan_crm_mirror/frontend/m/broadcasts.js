// broadcasts.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

async function loadBroadcasts() {
  try {
    const [bcs, conns, templates, tgConns, flows] = await Promise.all([
      apiBc('/'),
      api('/connections').catch(() => ({ data: [] })),
      fetch('/api/v1/leads/templates', { headers: { Authorization: 'Bearer ' + getToken() } }).then(r => r.json()).then(m => Array.isArray(m) ? m : []).catch(() => []),
      api('/telegram').catch(() => []),
      fetch('/api/v1/flows/', { headers: { Authorization: 'Bearer ' + getToken() } }).then(r => r.json()).catch(() => []),
    ])
    S.broadcastsTelegramConnections = Array.isArray(tgConns) ? tgConns : []
    S.broadcastsTemplates = templates
    S.broadcastsFlows = Array.isArray(flows) ? flows.filter(f => f.status === 'ACTIVE') : []
    S.broadcasts = bcs || []
    const list = Array.isArray(conns) ? conns : (conns.data || [])
    S.broadcastsConnections = list.filter(c => c.status === 'ACTIVE')
    S.broadcastsLoaded = true
    render()
  } catch (e) { showToast(e.message, 'error') }
}


function renderBroadcastsPanel() {
  if (!S.broadcastsLoaded) { return '<div style="padding:40px;text-align:center;color:#94a3b8;display:flex;align-items:center;justify-content:center;gap:10px"><svg style="animation:spin 0.8s linear infinite;width:20px;height:20px" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Carregando...</div>' }

  const STATUS_LABELS = { DRAFT: 'Rascunho', QUEUED: 'Agendada', RUNNING: 'Enviando', PAUSED: 'Pausada', COMPLETED: 'Concluída', FAILED: 'Falhou' }
  const fmtDate = d => d ? new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : null
  const fmtNum = n => (n || 0).toLocaleString('pt-BR').replace(',','.')

  // Aggregate stats
  const totalActive = S.broadcasts.filter(b => b.status === 'RUNNING' || b.status === 'QUEUED').length
  const totalRunning = S.broadcasts.filter(b => b.status === 'RUNNING').length
  const sumSent = S.broadcasts.reduce((n, b) => n + (b.counts?.sent || 0), 0)
  const sumFailed = S.broadcasts.reduce((n, b) => n + (b.counts?.failed || 0), 0)
  const deliveryRate = (sumSent + sumFailed) > 0 ? ((sumSent / (sumSent + sumFailed)) * 100).toFixed(1) : '—'
  const totalQueued = S.broadcasts.reduce((n, b) => {
    const total = b.counts?.total || 0
    const processed = (b.counts?.sent || 0) + (b.counts?.failed || 0)
    return n + Math.max(0, total - processed)
  }, 0)

  // Filter counts (for chips)
  const cnt = {
    all: S.broadcasts.length,
    running: S.broadcasts.filter(b => b.status === 'RUNNING').length,
    queued: S.broadcasts.filter(b => b.status === 'QUEUED' || b.status === 'PAUSED').length,
    completed: S.broadcasts.filter(b => b.status === 'COMPLETED' || b.status === 'FAILED').length,
    draft: S.broadcasts.filter(b => b.status === 'DRAFT').length,
  }

  const filter = S.bcListFilter || 'all'
  const filtered = filter === 'all' ? S.broadcasts :
    filter === 'running' ? S.broadcasts.filter(b => b.status === 'RUNNING') :
    filter === 'queued' ? S.broadcasts.filter(b => b.status === 'QUEUED' || b.status === 'PAUSED') :
    filter === 'completed' ? S.broadcasts.filter(b => b.status === 'COMPLETED' || b.status === 'FAILED') :
    filter === 'draft' ? S.broadcasts.filter(b => b.status === 'DRAFT') :
    S.broadcasts

  const search = (S.bcListSearch || '').toLowerCase().trim()
  const visible = search ? filtered.filter(b => (b.name || '').toLowerCase().includes(search)) : filtered

  // Live strip — last sent message across active campaigns
  const liveCampaign = S.broadcasts.find(b => b.status === 'RUNNING')
  const throughput = sumSent > 0 ? Math.max(1, Math.round(sumSent / Math.max(1, totalRunning) / 60)) : 0
  const liveStrip = totalRunning > 0 ? `
    <div class="bc-live-strip">
      <span class="bc-live-dot"></span>
      <span class="bc-live-label">Ao vivo</span>
      <div class="bc-live-msg">
        <span class="bc-ch-tag wa">WA</span>
        <span class="bc-msg-snippet">${esc(liveCampaign?.name || 'Disparo em andamento')} · ${fmtNum(liveCampaign?.counts?.sent || 0)} enviadas</span>
      </div>
      <div class="bc-live-throughput">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        <strong>${throughput}</strong> msgs/min
      </div>
    </div>` : ''

  const cards = visible.map(b => {
    const total = b.counts?.total || 0
    const sent = b.counts?.sent || 0
    const failed = b.counts?.failed || 0
    const processed = sent + failed
    const progress = total > 0 ? Math.round((processed / total) * 100) : 0
    const isRunning = b.status === 'RUNNING'
    const isCompleted = b.status === 'COMPLETED'
    const isDraft = b.status === 'DRAFT'

    const schedLabel = b.status === 'QUEUED' && b.scheduledAt ? `Agendada para ${fmtDate(b.scheduledAt)}`
                     : b.status === 'COMPLETED' ? `Concluída em ${fmtDate(b.updatedAt) || '—'}`
                     : b.status === 'RUNNING' ? `Iniciada ${fmtDate(b.startedAt || b.updatedAt) || ''}`
                     : b.status === 'DRAFT' ? `Editada ${fmtDate(b.updatedAt) || ''}`
                     : b.status === 'PAUSED' ? 'Pausada'
                     : fmtDate(b.updatedAt) || ''

    const hasTg = (b.telegramConnectionIds || []).length > 0
    const hasWa = (b.connectionIds || []).length > 0

    // Channel bubbles
    const channelBubbles = (hasWa || hasTg) ? `
      ${hasWa ? '<div class="bc-ch-bubble wa">W</div>' : ''}
      ${hasTg ? '<div class="bc-ch-bubble tg">T</div>' : ''}
      <span class="bc-c-channel-text">${hasWa && hasTg ? 'Multi-canal' : hasWa ? 'WhatsApp' : 'Telegram'}</span>
    ` : '<span class="bc-c-channel-text" style="font-style:italic">canais não definidos</span>'

    // Progress block (or status text for draft)
    const progressBlock = isDraft ? `
      <div class="bc-c-progress2"><div class="bc-c-progress-top" style="color:var(--bc-warning)"><span>${(b.content || '').trim() ? 'Pronto pra revisar' : '⚠ Mensagem vazia'}</span></div></div>
    ` : `
      <div class="bc-c-progress2">
        <div class="bc-c-progress-top">
          <span><span class="bc-num2">${fmtNum(processed)}</span> / ${fmtNum(total)}</span>
          <span>${total > 0 ? progress + '%' : '—'}</span>
        </div>
        <div class="bc-c-bar"><div class="bc-c-fill ${isRunning ? 'running' : ''} ${isCompleted ? 'completed' : ''}" style="width:${progress}%"></div></div>
      </div>`

    // Actions (icon-only)
    const startBtn = (b.status === 'DRAFT' || b.status === 'PAUSED' || b.status === 'QUEUED')
      ? `<button class="bc-icon-btn success" onclick="event.stopPropagation();bcStart('${b.id}')" title="${b.status === 'PAUSED' ? 'Retomar' : 'Iniciar'}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>` : ''
    const pauseBtn = isRunning
      ? `<button class="bc-icon-btn warn" onclick="event.stopPropagation();bcPause('${b.id}')" title="Pausar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6"/></svg></button>` : ''
    const metricsBtn = ['RUNNING','COMPLETED','PAUSED','FAILED'].includes(b.status)
      ? `<button class="bc-icon-btn primary" onclick="event.stopPropagation();bcOpenMetrics('${b.id}')" title="Métricas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2"/></svg></button>` : ''
    const editBtn = ['DRAFT','PAUSED'].includes(b.status)
      ? `<button class="bc-icon-btn" onclick="event.stopPropagation();bcEdit('${b.id}')" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''
    const deleteBtn = ['DRAFT','PAUSED','COMPLETED','FAILED'].includes(b.status)
      ? `<button class="bc-icon-btn danger" onclick="event.stopPropagation();bcDelete('${b.id}')" title="Excluir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg></button>` : ''

    const onClickCard = ['DRAFT','PAUSED'].includes(b.status) ? `bcEdit('${b.id}')` : ['RUNNING','COMPLETED','FAILED'].includes(b.status) ? `bcOpenMetrics('${b.id}')` : ''

    return `
      <div class="bc-campaign ${isRunning ? 'bc-campaign-running' : ''}" ${onClickCard ? `onclick="${onClickCard}"` : ''} style="${onClickCard ? 'cursor:pointer' : ''}">
        <div class="bc-card-row">
          <div class="bc-c-name-block">
            <div class="bc-c-name">${esc(b.name || 'Sem nome')}</div>
            <div class="bc-c-meta-row">
              ${schedLabel ? `<span>${esc(schedLabel)}</span>` : ''}
              ${b.sendWindow?.start && b.sendWindow?.end ? `<span class="bc-dot"></span><span>Janela ${esc(b.sendWindow.start)}–${esc(b.sendWindow.end)}</span>` : ''}
              ${b.intervalSeconds?.min && b.intervalSeconds?.max ? `<span class="bc-dot"></span><span>intervalo ${b.intervalSeconds.min}–${b.intervalSeconds.max}s</span>` : ''}
            </div>
          </div>
          <div class="bc-pill bc-pill-${b.status}"><span class="bc-pill-dot"></span>${STATUS_LABELS[b.status] || b.status}</div>
          ${progressBlock}
          <div class="bc-c-channels">${channelBubbles}</div>
          <div class="bc-c-actions">${metricsBtn}${startBtn}${pauseBtn}${editBtn}${deleteBtn}</div>
        </div>
      </div>`
  }).join('')

  const chip = (key, label) => `<button class="bc-chip ${filter===key?'active':''}" onclick="S.bcListFilter='${key}';render()">${label} ${cnt[key] > 0 ? `<span class="bc-chip-count">${cnt[key]}</span>` : ''}</button>`

  const emptyState = `
    <div class="bc-empty-state2">
      <div class="bc-display" style="font-size:52px;margin-bottom:12px;color:var(--text-muted)">📢</div>
      <h3 class="bc-display" style="font-size:20px;color:var(--text-primary);margin:0 0 6px">Nenhuma campanha ainda</h3>
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 20px">Crie sua primeira campanha pra disparar mensagens em massa.</p>
      <button class="bc-btn bc-btn-primary" onclick="bcNew()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>Nova campanha</button>
    </div>`

  return `
    <div class="bc-page">

      <div class="bc-hero">
        <div class="bc-hero-grid">
          <div>
            ${totalRunning > 0 ? `<div class="bc-hero-eyebrow"><span class="bc-pulse"></span>${totalRunning} campanha${totalRunning > 1 ? 's' : ''} ativa${totalRunning > 1 ? 's' : ''} agora</div>` : '<div class="bc-hero-eyebrow" style="color:var(--text-muted)">nenhuma campanha rodando</div>'}
            <h1>Disparos</h1>
            <p>Campanhas em massa segmentadas. Roteamento automático entre WhatsApp e Telegram, janela de envio respeitando horário comercial e fluxo opcional ao receber resposta.</p>
          </div>
          <div class="bc-hero-cta">
            <button class="bc-btn bc-btn-primary" onclick="bcNew()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              Nova campanha
            </button>
          </div>
        </div>

        ${S.broadcasts.length > 0 ? `
        <div class="bc-hero-stats">
          <div class="bc-hstat">
            <div class="bc-hstat-label">Campanhas ativas</div>
            <div class="bc-hstat-value">${totalActive}</div>
            ${totalRunning > 0 ? `<div class="bc-hstat-trend up"><span class="bc-delta">●</span><span>enviando agora</span></div>` : ''}
          </div>
          <div class="bc-hstat">
            <div class="bc-hstat-label">Total enviadas</div>
            <div class="bc-hstat-value">${fmtNum(sumSent)} <span class="bc-unit">msgs</span></div>
          </div>
          <div class="bc-hstat">
            <div class="bc-hstat-label">Taxa de entrega</div>
            <div class="bc-hstat-value">${deliveryRate} <span class="bc-unit">${deliveryRate !== '—' ? '%' : ''}</span></div>
          </div>
          <div class="bc-hstat">
            <div class="bc-hstat-label">Pendentes na fila</div>
            <div class="bc-hstat-value bc-num">${fmtNum(totalQueued)}</div>
          </div>
        </div>` : ''}
      </div>

      ${S.broadcasts.length > 0 ? `
      ${liveStrip}

      <div class="bc-toolbar">
        <div class="bc-filters-row" style="margin:0">
          ${chip('all', 'Todas')}
          ${chip('running', 'Enviando')}
          ${chip('queued', 'Agendadas')}
          ${chip('completed', 'Concluídas')}
          ${chip('draft', 'Rascunhos')}
        </div>
        <div class="bc-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input placeholder="Buscar campanha…" value="${esc(S.bcListSearch || '')}" oninput="S.bcListSearch=this.value;render();setTimeout(()=>{const i=document.querySelector('.bc-search-box input');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},0)">
        </div>
      </div>

      <div class="bc-campaigns">${cards || '<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:12px">Nenhuma campanha com esse filtro.</div>'}</div>
      ` : emptyState}

      ${S.bcEditing ? renderBroadcastModal() : ''}
      ${S.bcMetrics ? renderBroadcastMetricsModal() : ''}
    </div>`
}


function bcNew() {
  S.bcEditing = {
    name: '',
    description: '',
    messageType: 'text',
    content: '',
    templateId: '',
    templateVars: {},
    documentUrl: '',
    documentFilename: '',
    filters: { tagsAny: [], tagsAll: [], stageIds: [], assignedIds: [], status: [], onlyWithContact: true },
    connectionIds: [],
    telegramConnectionIds: [],
    onReplyFlowId: '',
    channelType: 'whatsapp',
    scheduledAt: '',
    sendWindow: { start: '09:00', end: '20:00' },
    intervalSeconds: { min: 3, max: 8 },
    step: 1,
  }
  S.bcPreviewCount = null
  render()
}


async function bcEdit(id) {
  try {
    const b = await apiBc('/' + id)
    S.bcEditing = {
      id: b.id,
      name: b.name,
      description: b.description,
      messageType: b.messageType || 'text',
      content: b.content,
      templateId: b.templateId || '',
      templateVars: b.templateVars || {},
      documentUrl: b.documentUrl || '',
      documentFilename: b.documentFilename || '',
      filters: b.filters,
      connectionIds: b.connectionIds || [],
      telegramConnectionIds: b.telegramConnectionIds || [],
      onReplyFlowId: b.onReplyFlowId || '',
      channelType: b.channelType,
      scheduledAt: b.scheduledAt ? new Date(b.scheduledAt).toISOString().slice(0,16) : '',
      sendWindow: b.sendWindow,
      intervalSeconds: b.intervalSeconds,
      step: 1,
    }
    S.bcPreviewCount = null
    render()
  } catch (e) { showToast(e.message, 'error') }
}


function bcCloseModal() { S.bcEditing = null; S.bcPreviewCount = null; render() }


async function bcPreview() {
  try {
    const r = await apiBc('/preview-count', { method: 'POST', body: JSON.stringify({ filters: S.bcEditing.filters }) })
    S.bcPreviewCount = r.count
    render()
  } catch (e) { showToast(e.message, 'error') }
}


async function bcSave() {
  const b = S.bcEditing
  if (!b.name?.trim()) return showToast('Nome obrigatório', 'error')
  if (b.messageType === 'template') {
    if (!b.templateId) return showToast('Selecione um template', 'error')
  } else if (b.messageType === 'document') {
    if (!b.documentUrl?.trim()) return showToast('URL do documento obrigatória', 'error')
  } else {
    if (!b.content?.trim()) return showToast('Mensagem obrigatória', 'error')
  }
  const body = {
    name: b.name.trim(),
    description: b.description,
    content: b.content,
    messageType: b.messageType || 'text',
    templateId: b.templateId || null,
    templateVars: b.templateVars || {},
    documentUrl: b.documentUrl || null,
    documentFilename: b.documentFilename || null,
    filters: b.filters,
    connectionIds: b.connectionIds,
    telegramConnectionIds: b.telegramConnectionIds,
    onReplyFlowId: b.onReplyFlowId || null,
    channelType: b.channelType,
    scheduledAt: b.scheduledAt ? new Date(b.scheduledAt).toISOString() : null,
    sendWindow: b.sendWindow,
    intervalSeconds: b.intervalSeconds,
  }
  try {
    let saved
    if (b.id) {
      saved = await apiBc('/' + b.id, { method: 'PUT', body: JSON.stringify(body) })
      showToast('Campanha salva', 'success')
    } else {
      saved = await apiBc('/', { method: 'POST', body: JSON.stringify(body) })
      showToast('Campanha criada', 'success')
    }
    S.bcEditing = null
    await loadBroadcasts()
    return saved
  } catch (e) { showToast(e.message, 'error') }
}


async function bcStart(id) {
  if (!confirm('Iniciar disparo? Os contatos serão enfileirados imediatamente.')) return
  try {
    const r = await apiBc('/' + id + '/start', { method: 'POST' })
    showToast(`${r.queued} contatos enfileirados`, 'success')
    loadBroadcasts()
  } catch (e) { showToast(e.message, 'error') }
}


async function bcPause(id) {
  if (!confirm('Pausar disparo e cancelar envios pendentes?')) return
  try {
    await apiBc('/' + id + '/pause', { method: 'POST' })
    showToast('Pausado', 'success')
    loadBroadcasts()
  } catch (e) { showToast(e.message, 'error') }
}


async function bcDelete(id) {
  if (!confirm('Excluir campanha? Não pode ser desfeito.')) return
  try {
    await apiBc('/' + id, { method: 'DELETE' })
    showToast('Excluída', 'success')
    loadBroadcasts()
  } catch (e) { showToast(e.message, 'error') }
}


function renderBroadcastModal() {
  const b = S.bcEditing
  const step = b.step || 1
  const stages = (S.kanban?.stages || [])
  const users  = S.users || []
  const tags   = S.tagOptions || []
  const conns  = S.broadcastsConnections || []
  const tgConns = S.broadcastsTelegramConnections || []

  // ─── Helpers ────────────────────────────────────────────────────────────
  const tagPill = (label, on, onclick) => `
    <button class="bc-tag ${on?'on':''}" onclick="${onclick}">
      ${esc(label)}
      <svg class="bc-tag-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>`

  // ─── STEP 1: AUDIÊNCIA ──────────────────────────────────────────────────
  const tagsAnyHtml = tags.length ? tags.map(t => {
    const on = (b.filters.tagsAny || []).includes(t)
    return tagPill(t, on, `bcToggleFilter('tagsAny','${esc(t).replace(/'/g,"\\'")}')`)
  }).join('') : '<em style="color:var(--text-muted);font-size:12px">Sem tags cadastradas</em>'

  const stagesHtml = stages.length ? stages.map(st => {
    const on = (b.filters.stageIds || []).includes(st.id)
    return tagPill(st.name, on, `bcToggleFilter('stageIds','${st.id}')`)
  }).join('') : '<em style="color:var(--text-muted);font-size:12px">Nenhuma etapa do kanban</em>'

  const assignedIds = b.filters.assignedIds || []
  const allUsersOn = assignedIds.length === 0
  const usersHtml = tagPill('Todos', allUsersOn, `S.bcEditing.filters.assignedIds=[];render()`) +
    users.map(u => tagPill(u.name, assignedIds.includes(u.id), `bcToggleFilter('assignedIds','${u.id}')`)).join('')

  // Status legado removido — etapa cobre 100% do filtro

  // Audience count + breakdown
  const count = S.bcPreviewCount
  // Estimate channel breakdown: if both channels selected, show placeholder; otherwise base on tag filter
  const tagHasTelegram = (b.filters.tagsAny || []).includes('telegram')
  const audienceDisplay = count !== null ? count.toLocaleString('pt-BR').replace(',','.') : '—'
  const previewHint = count === null ? 'Clique "Calcular" pra ver quantos leads' : (count === 0 ? 'Nenhum lead corresponde' : 'leads correspondem aos filtros')

  const step1 = `
    <div class="bc-pane ${step===1?'active':''}" data-pane="1">
      <h3 class="bc-pane-title">Pra quem?</h3>
      <p class="bc-pane-sub">Combine filtros pra montar a audiência. Roteamento entre WhatsApp e Telegram é automático com base no canal de origem do lead.</p>

      <div class="bc-twocol">
        <div>
          <div class="bc-fsection">
            <div class="bc-flabel">Tags<span class="bc-flabel-meta">qualquer uma</span></div>
            <div class="bc-tagrow">${tagsAnyHtml}</div>
          </div>

          <div class="bc-fsection">
            <div class="bc-flabel">Etapa do Kanban<span class="bc-flabel-meta">qualquer uma</span></div>
            <div class="bc-tagrow">${stagesHtml}</div>
          </div>

          <div class="bc-fsection">
            <div class="bc-flabel">Operador responsável</div>
            <div class="bc-tagrow">${usersHtml}</div>
          </div>
        </div>

        <div class="bc-side">
          <div class="bc-count-label">Audiência</div>
          <div class="bc-count-main">${audienceDisplay}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${previewHint}</div>

          <button class="bc-btn bc-btn-secondary" style="width:100%;justify-content:center;padding:8px" onclick="bcPreview()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            ${count === null ? 'Calcular audiência' : 'Recalcular'}
          </button>

          ${count !== null && count > 0 ? `
          <div class="bc-breakdown">
            <div>
              <div class="bc-breakdown-row">
                <div class="bc-breakdown-channel"><div class="bc-chicon bc-chicon-wa">W</div>WhatsApp</div>
                <span class="bc-num" style="font-weight:600;color:var(--text-primary)">${tagHasTelegram ? 0 : count}</span>
              </div>
              <div class="bc-bd-bar-wrap"><div class="bc-bd-bar" style="background:var(--brand-wa); width:${tagHasTelegram ? 0 : 100}%"></div></div>
            </div>
            <div>
              <div class="bc-breakdown-row">
                <div class="bc-breakdown-channel"><div class="bc-chicon bc-chicon-tg">T</div>Telegram</div>
                <span class="bc-num" style="font-weight:600;color:var(--text-primary)">${tagHasTelegram ? count : 0}</span>
              </div>
              <div class="bc-bd-bar-wrap"><div class="bc-bd-bar" style="background:var(--brand-tg); width:${tagHasTelegram ? 100 : 0}%"></div></div>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>`

  // ─── STEP 2: MENSAGEM ───────────────────────────────────────────────────
  const msgType = b.messageType || 'text'
  const typeCard = (t, title, desc, icon) => `
    <button class="bc-typecard ${msgType===t?'on':''}" onclick="S.bcEditing.messageType='${t}';render()">
      <div class="bc-typecard-ic">${icon}</div>
      <div class="bc-typecard-t">${title}</div>
      <div class="bc-typecard-d">${desc}</div>
    </button>`

  const msgContentField = msgType === 'template' ? `
    <div class="bc-field">
      <label class="bc-field-label">Template aprovado</label>
      <select class="bc-select" onchange="bcOnTemplateSelect(this.value)">
        <option value="">– selecione um template –</option>
        ${(S.broadcastsTemplates || []).map(t => {
          const lang = t.language ? ' · ' + t.language : ''
          const conn = t.connectionName ? ' — 📱 ' + t.connectionName : ''
          return `<option value="${t.id}" ${b.templateId === t.id ? 'selected' : ''}>${esc(t.name)}${esc(lang)}${esc(conn)}</option>`
        }).join('')}
      </select>
      ${!(S.broadcastsTemplates || []).length ? '<div class="bc-helper-banner"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.2 16a2 2 0 001.73 3z"/></svg>Nenhum template aprovado. Sincronize em Conexões → Templates.</div>' : ''}
      ${b.templateId ? (() => {
        const tpl = (S.broadcastsTemplates || []).find(t => t.id === b.templateId)
        if (!tpl) return ''
        const body = tpl.body || ''
        const vars = [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(m => m[1]))]
        return `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-top:10px">
            <div class="bc-flabel" style="margin-bottom:6px">Preview</div>
            <div style="font-size:13px;color:var(--text-primary);white-space:pre-wrap;line-height:1.5">${esc(body)}</div>
          </div>
          ${vars.length ? `
          <div style="margin-top:12px">
            <div class="bc-flabel" style="margin-bottom:8px">Valores das variáveis</div>
            ${vars.map(v => `
              <div class="bc-field" style="margin-bottom:8px">
                <label class="bc-field-label" style="text-transform:none;letter-spacing:0;font-family:'JetBrains Mono',monospace;color:var(--accent)">{{${esc(v)}}}</label>
                <input class="bc-input" type="text" value="${esc((b.templateVars || {})[v] || '')}" oninput="S.bcEditing.templateVars=Object.assign({}, S.bcEditing.templateVars, {['${v}']: this.value})" placeholder="Valor ou {{nome}}/{{telefone}}">
              </div>
            `).join('')}
          </div>` : ''}
        `
      })() : ''}
    </div>
  ` : msgType === 'document' ? `
    <div class="bc-field">
      <label class="bc-field-label">URL do documento</label>
      <input class="bc-input" type="url" value="${esc(b.documentUrl)}" oninput="S.bcEditing.documentUrl=this.value" placeholder="https://lowan.site/arquivo.pdf">
    </div>
    <div class="bc-field">
      <label class="bc-field-label">Nome do arquivo</label>
      <input class="bc-input" type="text" value="${esc(b.documentFilename)}" oninput="S.bcEditing.documentFilename=this.value" placeholder="Material.pdf">
    </div>
    <div class="bc-field">
      <label class="bc-field-label">Legenda (caption)</label>
      <textarea class="bc-textarea" id="bc-msg-input" oninput="S.bcEditing.content=this.value;bcUpdatePreview(this.value)" placeholder="Segue o material, {{nome}} 👇">${esc(b.content || '')}</textarea>
    </div>
  ` : `
    <div class="bc-field">
      <label class="bc-field-label">Mensagem</label>
      <textarea class="bc-textarea" id="bc-msg-input" oninput="S.bcEditing.content=this.value;bcUpdatePreview(this.value)" placeholder="Oi {{nome}}! Tá lembrando da gente?">${esc(b.content || '')}</textarea>
      <div class="bc-input-hint">
        Variáveis:
        <button class="bc-varchip" onclick="bcInsertVar('{{nome}}')">{{nome}}</button>
        <button class="bc-varchip" onclick="bcInsertVar('{{nome_completo}}')">{{nome_completo}}</button>
        <button class="bc-varchip" onclick="bcInsertVar('{{telefone}}')">{{telefone}}</button>
      </div>
    </div>
  `

  const step2 = `
    <div class="bc-pane ${step===2?'active':''}" data-pane="2">
      <h3 class="bc-pane-title">O que vão receber?</h3>
      <p class="bc-pane-sub">Use variáveis pra personalizar. O preview à direita mostra como vai aparecer pro lead.</p>

      <div class="bc-typecards">
        ${typeCard('text', 'Mensagem livre', 'Texto direto. Use {{nome}} pra personalizar.',
          '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H7l-4 4V5z"/></svg>')}
        ${typeCard('template', 'Template Meta', 'HSM aprovado. Funciona fora da janela de 24h.',
          '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>')}
        ${typeCard('document', 'Anexo + texto', 'PDF/imagem com legenda. URL pública.',
          '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>')}
      </div>

      <div class="bc-field">
        <label class="bc-field-label">Nome da campanha</label>
        <input class="bc-input" type="text" value="${esc(b.name || '')}" oninput="S.bcEditing.name=this.value;document.querySelector('.bc-mp-title').textContent=this.value||'Nova campanha'" placeholder="Ex: Reativação abril 2026">
      </div>
      ${msgContentField}
    </div>`

  // ─── STEP 3: CANAIS ─────────────────────────────────────────────────────
  const waCount = conns.length
  const tgCount = tgConns.length
  const waSelected = (b.connectionIds || []).length
  const tgSelected = (b.telegramConnectionIds || []).length

  const waCards = conns.length ? conns.map(c => {
    const on = (b.connectionIds || []).includes(c.id)
    const today = c.messagesSentToday || 0
    const quality = c.metaQualityRating || 'GREEN'
    // Quando qualidade RUIM (RED), limit efetivo = 20/dia
    const limit = quality === 'RED' ? 20 : (c.rateLimitPerDay || 1000)
    return `
      <div class="bc-conncard ${on?'on':''}" onclick="bcToggleConn('${c.id}')">
        <div class="bc-conn-check">
          <svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <div class="bc-conncard-info">
          <div class="bc-conncard-name">${esc(c.name)}</div>
          <div class="bc-conncard-meta">
            <span class="bc-health-dot"></span>Ativo
            <span class="bc-meta-dot"></span>
            <span class="bc-quality">${esc(quality)}</span>
            <span class="bc-meta-dot"></span>
            ${today} enviadas hoje · limite ${limit}
          </div>
        </div>
      </div>`
  }).join('') : '<div style="font-size:12px;color:var(--text-muted);padding:10px 0">Nenhuma conexão WhatsApp ativa. Adicione em Conexões.</div>'

  const tgCards = tgConns.length ? tgConns.map(c => {
    const on = (b.telegramConnectionIds || []).includes(c.id)
    return `
      <div class="bc-conncard ${on?'on':''}" onclick="bcToggleTgConn('${c.id}')">
        <div class="bc-conn-check">
          <svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <div class="bc-conncard-info">
          <div class="bc-conncard-name">@${esc(c.botUsername || c.name)}</div>
          <div class="bc-conncard-meta">
            <span class="bc-health-dot"></span>Ativo
            <span class="bc-meta-dot"></span>
            Sem rate-limit oficial
          </div>
        </div>
      </div>`
  }).join('') : '<div style="font-size:12px;color:var(--text-muted);padding:10px 0">Nenhum bot Telegram cadastrado.</div>'

  const step3 = `
    <div class="bc-pane ${step===3?'active':''}" data-pane="3">
      <h3 class="bc-pane-title">Por onde enviar?</h3>
      <p class="bc-pane-sub">Selecione as conexões que vão executar o disparo. Round-robin entre as escolhidas. Leads Telegram só usam bots Telegram, leads WhatsApp só usam conexões WA — automático.</p>

      <div class="bc-connsec">
        <div class="bc-connsec-head">
          <div class="bc-chicon bc-chicon-wa">W</div>
          <div class="bc-connsec-title">WhatsApp</div>
          <div class="bc-connsec-meta">${waSelected}/${waCount} selecionada${waCount===1?'':'s'}</div>
        </div>
        ${waCards}
      </div>

      <div class="bc-connsec">
        <div class="bc-connsec-head">
          <div class="bc-chicon bc-chicon-tg">T</div>
          <div class="bc-connsec-title">Telegram</div>
          <div class="bc-connsec-meta">${tgSelected}/${tgCount} selecionado${tgCount===1?'':'s'}</div>
        </div>
        ${tgCards}
      </div>

      <div class="bc-field" style="margin-top:24px">
        <label class="bc-field-label">Quando o lead responder</label>
        <select class="bc-select" onchange="S.bcEditing.onReplyFlowId=this.value">
          <option value="">— Apenas registra a resposta</option>
          ${(S.broadcastsFlows || []).map(f => `<option value="${f.id}" ${b.onReplyFlowId === f.id ? 'selected' : ''}>▶ Disparar fluxo: ${esc(f.name)}</option>`).join('')}
        </select>
        <div class="bc-input-hint">Quando alguém responder a essa campanha, o fluxo escolhido começa automaticamente.</div>
      </div>

      <div class="bc-routing">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <div>
          <strong>Roteamento automático.</strong> Cada lead é enviado pelo canal compatível. Leads com Telegram passam pelos bots selecionados; o resto vai pelas conexões WhatsApp (round-robin).
        </div>
      </div>
    </div>`

  // ─── STEP 4: REVISAR ────────────────────────────────────────────────────
  const schedMode = b.scheduledAt ? 'later' : 'now'
  const waNames = (b.connectionIds || []).map(id => conns.find(c => c.id === id)?.name).filter(Boolean)
  const tgNames = (b.telegramConnectionIds || []).map(id => tgConns.find(c => c.id === id)).filter(Boolean).map(c => '@' + (c.botUsername || c.name))
  const channelsList = [...waNames.map(n => `<strong>${esc(n)}</strong> (WhatsApp)`), ...tgNames.map(n => `<strong>${esc(n)}</strong> (Telegram)`)].join(' · ') || '<em style="color:var(--text-muted)">nenhuma conexão selecionada</em>'
  const flowName = (S.broadcastsFlows || []).find(f => f.id === b.onReplyFlowId)?.name
  const filtersSummary = [
    (b.filters.tagsAny || []).length ? `Tags: <strong>${(b.filters.tagsAny).map(esc).join(', ')}</strong>` : '',
    (b.filters.stageIds || []).length ? `Etapas: <strong>${(b.filters.stageIds).map(id => stages.find(s => s.id === id)?.name).filter(Boolean).map(esc).join(', ')}</strong>` : '',
    (b.filters.status || []).length ? `Status: <strong>${(b.filters.status).map(esc).join(', ')}</strong>` : '',
    (b.filters.assignedIds || []).length ? `Operador: <strong>${(b.filters.assignedIds).map(id => users.find(u => u.id === id)?.name).filter(Boolean).map(esc).join(', ')}</strong>` : 'Operador: <strong>Todos</strong>',
  ].filter(Boolean).join(' · ') || '<em style="color:var(--text-muted)">sem filtros (todos os leads)</em>'

  const msgSummary = b.messageType === 'template' ? ((S.broadcastsTemplates || []).find(t => t.id === b.templateId)?.body || '(template não selecionado)')
                   : b.messageType === 'document' ? (b.content || '(sem caption)') + (b.documentFilename ? ` · anexo: ${b.documentFilename}` : '')
                   : (b.content || '(mensagem vazia)')

  const step4 = `
    <div class="bc-pane ${step===4?'active':''}" data-pane="4">
      <h3 class="bc-pane-title">Tudo certo pra disparar?</h3>
      <p class="bc-pane-sub">Revise antes de iniciar. Você ainda pode pausar a qualquer momento.</p>

      <div class="bc-sched-toggle">
        <button class="bc-toggle-card ${schedMode==='now'?'on':''}" onclick="S.bcEditing.scheduledAt='';render()">
          <div class="bc-toggle-circle">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <div class="bc-toggle-tt">Disparar agora</div>
          <div class="bc-toggle-td">Imediato. Respeitando janela horária e intervalo entre envios.</div>
        </button>
        <button class="bc-toggle-card ${schedMode==='later'?'on':''}" onclick="bcSetSchedLater()">
          <div class="bc-toggle-circle">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          </div>
          <div class="bc-toggle-tt">Agendar</div>
          <div class="bc-toggle-td">Define data/hora exata pra começar.</div>
        </button>
      </div>

      ${schedMode === 'later' ? `
      <div class="bc-sched-fields">
        <div class="bc-field" style="margin:0">
          <label class="bc-field-label">Data e hora</label>
          <input class="bc-input" type="datetime-local" value="${b.scheduledAt}" oninput="S.bcEditing.scheduledAt=this.value">
        </div>
        <div class="bc-field" style="margin:0">
          <label class="bc-field-label">Janela início</label>
          <input class="bc-input" type="time" value="${b.sendWindow.start}" oninput="S.bcEditing.sendWindow.start=this.value">
        </div>
        <div class="bc-field" style="margin:0">
          <label class="bc-field-label">Janela fim</label>
          <input class="bc-input" type="time" value="${b.sendWindow.end}" oninput="S.bcEditing.sendWindow.end=this.value">
        </div>
      </div>
      ` : `
      <div class="bc-sched-fields" style="grid-template-columns:1fr 1fr">
        <div class="bc-field" style="margin:0">
          <label class="bc-field-label">Janela início</label>
          <input class="bc-input" type="time" value="${b.sendWindow.start}" oninput="S.bcEditing.sendWindow.start=this.value">
        </div>
        <div class="bc-field" style="margin:0">
          <label class="bc-field-label">Janela fim</label>
          <input class="bc-input" type="time" value="${b.sendWindow.end}" oninput="S.bcEditing.sendWindow.end=this.value">
        </div>
      </div>
      `}

      <div class="bc-field">
        <label class="bc-field-label">Intervalo entre envios</label>
        <div class="bc-slider-wrap">
          <div class="bc-slider-row">
            <span>Mínimo</span>
            <span><input type="number" min="1" max="60" value="${b.intervalSeconds.min}" oninput="S.bcEditing.intervalSeconds.min=parseInt(this.value)||3" style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-family:'JetBrains Mono',monospace;text-align:right;font-size:12px"> segundos</span>
          </div>
          <div class="bc-slider-row">
            <span>Máximo</span>
            <span><input type="number" min="1" max="60" value="${b.intervalSeconds.max}" oninput="S.bcEditing.intervalSeconds.max=parseInt(this.value)||8" style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-family:'JetBrains Mono',monospace;text-align:right;font-size:12px"> segundos</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5">Aleatório entre min e max pra parecer mais natural.</div>
        </div>
      </div>

      <div class="bc-review">
        <div class="bc-review-row">
          <div class="bc-review-key">Audiência</div>
          <div class="bc-review-val">
            ${count !== null ? `<div class="bc-review-big bc-num">${count.toLocaleString('pt-BR').replace(',','.')}</div>` : '<em style="color:var(--text-muted)">clique "Calcular" no passo 1 pra ver o total</em>'}
            <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);line-height:1.6">${filtersSummary}</div>
          </div>
        </div>
        <div class="bc-review-row">
          <div class="bc-review-key">Mensagem</div>
          <div class="bc-review-val"><div class="bc-review-bubble">${esc(msgSummary)}</div></div>
        </div>
        <div class="bc-review-row">
          <div class="bc-review-key">Canais</div>
          <div class="bc-review-val">${channelsList}</div>
        </div>
        <div class="bc-review-row">
          <div class="bc-review-key">Agendamento</div>
          <div class="bc-review-val">
            ${schedMode === 'now' ? '<strong>Imediato</strong>' : `<strong>${b.scheduledAt ? new Date(b.scheduledAt).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—'}</strong>`}
            · janela ${b.sendWindow.start}–${b.sendWindow.end} · intervalo ${b.intervalSeconds.min}–${b.intervalSeconds.max}s
          </div>
        </div>
        ${flowName ? `
        <div class="bc-review-row">
          <div class="bc-review-key">Ao responder</div>
          <div class="bc-review-val">▶ Fluxo <strong>${esc(flowName)}</strong></div>
        </div>` : ''}
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0">
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;max-width:340px">
          Ao salvar como rascunho, você pode iniciar depois. Ao disparar, a campanha entra na fila e começa respeitando a janela horária.
        </div>
        <button class="bc-send-cta" onclick="bcSaveAndStart()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7"/></svg>
          ${b.id ? 'Salvar e disparar' : 'Criar e disparar'}
        </button>
      </div>
    </div>`

  // ─── STEPPER (side panel) ───────────────────────────────────────────────
  const stepperItem = (n, label) => `
    <button class="bc-step-item ${step===n?'active':''} ${step>n?'done':''}" onclick="bcGoStep(${n})">
      <span class="bc-step-num">${n}</span>
      <span>${label}</span>
    </button>`

  // ─── LIVE PREVIEW (right column) ────────────────────────────────────────
  const previewMsg = (() => {
    if (b.messageType === 'template') {
      const tpl = (S.broadcastsTemplates || []).find(t => t.id === b.templateId)
      return tpl?.body || ''
    }
    return b.content || ''
  })()
  const previewSample = { nome: 'Maria', nome_completo: 'Maria Silva', telefone: '(11) 98888-7777' }
  const previewHtml = previewMsg
    ? esc(previewMsg).replace(/(\{\{\s*([a-zA-Z0-9_]+)\s*\}\})/g, (full, m, k) => {
        const v = previewSample[k] || full
        return `<span class="bc-var-token">${esc(v)}</span>`
      }).replace(/\n/g, '<br>')
    : '<em style="color:rgba(255,255,255,0.3)">Mensagem vazia…</em>'

  const audienceCount = S.bcPreviewCount
  const footMeta = audienceCount !== null
    ? `Passo <strong>${step}</strong> de <strong>4</strong> · Audiência: <strong>${audienceCount.toLocaleString('pt-BR').replace(',','.')}</strong> leads`
    : `Passo <strong>${step}</strong> de <strong>4</strong>`

  return `
    <div class="bc-backdrop2" onclick="if(event.target===this)bcCloseModal()">
      <div class="bc-modal-panel">

        <div class="bc-mp-form">
          <div class="bc-mp-head">
            <div class="bc-mp-head-titles">
              <div class="bc-mp-eyebrow">${b.id ? 'Editar campanha' : 'Nova campanha'}</div>
              <div class="bc-mp-title">${esc(b.name || (b.id ? 'Campanha sem nome' : 'Nova campanha'))}</div>
            </div>
            <button class="bc-mp-close" onclick="bcCloseModal()">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div class="bc-mp-stepper">
            ${stepperItem(1, 'Audiência')}
            ${stepperItem(2, 'Mensagem')}
            ${stepperItem(3, 'Canais')}
            ${stepperItem(4, 'Revisar')}
          </div>

          <div id="bc-modal-scroll" class="bc-mp-body">
            ${step1}
            ${step2}
            ${step3}
            ${step4}
          </div>

          <div class="bc-mp-foot">
            <div class="bc-mp-foot-meta">${footMeta}</div>
            <div class="bc-mp-foot-actions">
              <button class="bc-btn bc-btn-ghost" onclick="bcSave()" title="Salva como rascunho e fecha">Salvar rascunho</button>
              ${step > 1 ? `<button class="bc-btn bc-btn-secondary" onclick="bcPrevStep()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                Voltar
              </button>` : ''}
              ${step < 4 ? `<button class="bc-btn bc-btn-primary" onclick="bcNextStep()">
                Continuar
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>` : ''}
            </div>
          </div>
        </div>

        <div class="bc-mp-preview">
          <div class="bc-mp-preview-head">
            <div class="bc-mp-preview-title">Preview ao vivo</div>
            <div class="bc-preview-tabs">
              <button class="bc-ptab on">WhatsApp</button>
            </div>
          </div>
          <div class="bc-mp-preview-body">
            <div class="bc-phone2">
              <div class="bc-phone2-screen">
                <div class="bc-phone2-head">
                  <div class="bc-phone2-avatar">L</div>
                  <div>
                    <div class="bc-phone2-name">Lead</div>
                    <div class="bc-phone2-status">online</div>
                  </div>
                </div>
                <div class="bc-phone2-body">
                  <div class="bc-bubble2"><span id="bc-msg-preview">${previewHtml}</span><div class="bc-bubble2-time">14:32 <svg viewBox="0 0 16 11" fill="currentColor"><path d="M11.071.653a.457.457 0 00-.304-.13c-.146-.013-.252.069-.317.135l-5.747 7.45-2.487-2.21a.422.422 0 00-.617.039l-.434.508a.434.434 0 00.038.616L4.92 9.999a.42.42 0 00.293.105.504.504 0 00.317-.18l6.622-8.485a.43.43 0 00-.077-.611l-.005.025zm3.495.025L8.005 9.16l-.42-.42a.42.42 0 00-.617.038l-.434.51a.434.434 0 00.038.615l1.738 1.62c.078.06.187.105.293.105a.504.504 0 00.317-.18L15.685 1.5a.43.43 0 00-.077-.61l-.504-.405a.43.43 0 00-.61.077z"/></svg></div></div>
                </div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);text-align:center;line-height:1.55;max-width:240px">
              Preview com variáveis preenchidas pelo primeiro lead da audiência.
            </div>
          </div>
        </div>

      </div>
    </div>`
}


function bcGoStep(n) {
  if (!S.bcEditing) return
  S.bcEditing.step = Math.max(1, Math.min(4, n))
  render()
}

function bcNextStep() { bcGoStep((S.bcEditing?.step || 1) + 1) }

function bcPrevStep() { bcGoStep((S.bcEditing?.step || 1) - 1) }


function bcSetSchedLater() {
  if (!S.bcEditing) return
  if (!S.bcEditing.scheduledAt) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    S.bcEditing.scheduledAt = d.toISOString().slice(0, 16)
  }
  render()
}


function bcUpdatePreview(value) {
  const preview = document.getElementById('bc-msg-preview')
  if (!preview) return
  const sample = { nome: 'Maria', nome_completo: 'Maria Silva', telefone: '(11) 98888-7777' }
  const formatted = (value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/(\{\{\s*([a-zA-Z0-9_]+)\s*\}\})/g, (full, _m, k) => {
      const v = sample[k] || full
      return `<span class="bc-var-token">${v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`
    })
    .replace(/\n/g, '<br>')
  preview.innerHTML = formatted || '<em style="color:rgba(255,255,255,0.3)">Mensagem vazia…</em>'
}


function bcInsertVar(token) {
  const ta = document.getElementById('bc-msg-input')
  if (!ta) return
  const start = ta.selectionStart, end = ta.selectionEnd
  ta.value = ta.value.slice(0, start) + token + ta.value.slice(end)
  S.bcEditing.content = ta.value
  ta.focus()
  ta.setSelectionRange(start + token.length, start + token.length)
  bcUpdatePreview(ta.value)
}


async function bcSaveAndStart() {
  try {
    const saved = await bcSave()
    if (saved && saved.id) {
      await bcStart(saved.id)
    }
  } catch (e) { /* bcSave já mostrou toast */ }
}


function bcToggleFilter(field, value) {
  const arr = S.bcEditing.filters[field] || []
  if (arr.includes(value)) S.bcEditing.filters[field] = arr.filter(x => x !== value)
  else S.bcEditing.filters[field] = [...arr, value]
  S.bcPreviewCount = null
  render()
}


function bcToggleTgConn(id) {
  const arr = S.bcEditing.telegramConnectionIds || []
  if (arr.includes(id)) S.bcEditing.telegramConnectionIds = arr.filter(x => x !== id)
  else S.bcEditing.telegramConnectionIds = [...arr, id]
  render()
}


function bcToggleConn(id) {
  const arr = S.bcEditing.connectionIds || []
  if (arr.includes(id)) S.bcEditing.connectionIds = arr.filter(x => x !== id)
  else S.bcEditing.connectionIds = [...arr, id]
  render()
}

// Recarrega a cada 10s se estiver na aba



function bcOnTemplateSelect(templateId) {
  S.bcEditing.templateId = templateId
  // Reseta templateVars ao trocar de template
  S.bcEditing.templateVars = {}
  render()
}



// ─── Métricas detalhadas de Disparo ─────────────────────────

async function bcOpenMetrics(id) {
  try {
    const data = await apiBc('/' + id + '/metrics')
    const bc = S.broadcasts.find(x => x.id === id)
    S.bcMetrics = { id, name: bc?.name || '—', data }
    render()
  } catch (e) { showToast(e.message, 'error') }
}


function bcCloseMetrics() { S.bcMetrics = null; render() }


function renderBroadcastMetricsModal() {
  if (!S.bcMetrics) return ''
  const { name, data } = S.bcMetrics
  const c = data.counts
  const r = data.rates
  const stat = (label, value, color) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;flex:1;min-width:120px">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;font-weight:600">${label}</div>
      <div style="font-size:22px;font-weight:800;color:${color};margin-top:4px">${value}</div>
    </div>`
  const errorsHtml = (data.errors || []).length > 0 ? `
    <div style="margin-top:14px">
      <h4 style="font-size:12px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">❌ Falhas por razão</h4>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr style="background:#fef2f2"><th style="padding:6px 10px;text-align:left">Razão</th><th style="padding:6px 10px;text-align:right">Qtde</th></tr>
          ${data.errors.map(e => `<tr style="border-top:1px solid #e2e8f0"><td style="padding:6px 10px">${esc(String(e.reason || ''))}</td><td style="padding:6px 10px;text-align:right;font-weight:600">${e.n}</td></tr>`).join('')}
        </table>
      </div>
    </div>` : ''

  return `
  <div class="modal-backdrop" onclick="if(event.target===this)bcCloseMetrics()">
    <div style="background:#fff;border-radius:12px;width:100%;max-width:720px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="padding:16px 22px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
        <div>
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a">📊 Métricas</h3>
          <p style="margin:2px 0 0;font-size:12px;color:#64748b">${esc(name)}</p>
        </div>
        <button onclick="bcCloseMetrics()" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:18px">✕</button>
      </div>
      <div style="padding:20px 22px;overflow-y:auto;flex:1">

        <h4 style="font-size:12px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Volumes</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${stat('Enfileirados', c.enqueued, '#475569')}
          ${stat('Enviados', c.sent, '#059669')}
          ${stat('Entregues', c.delivered, '#0891b2')}
          ${stat('Lidos', c.read, '#6366f1')}
          ${stat('Respostas', c.replied, '#d97706')}
          ${stat('Falhas', c.failed + c.metaFailed, '#dc2626')}
          ${stat('Pendentes', c.pending + c.processing, '#64748b')}
        </div>

        <h4 style="font-size:12px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.04em;margin:20px 0 8px">Taxas</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${stat('Entrega', r.deliveryRate + '%', '#0891b2')}
          ${stat('Leitura', r.readRate + '%', '#6366f1')}
          ${stat('Resposta', r.replyRate + '%', '#d97706')}
          ${stat('Falha', r.failRate + '%', '#dc2626')}
        </div>

        ${errorsHtml}

        <p style="font-size:11px;color:#94a3b8;margin-top:14px">
          💡 Taxa de leitura depende de a Meta entregar notificações de read — só funciona em conversas com receipts habilitados.
        </p>
      </div>
    </div>
  </div>`
}


setInterval(() => {
  const t = isAdmin() ? S.adminTab : S.collabTab
  // Não recarrega se modal aberto (evita perder foco do input enquanto user digita)
  if (S.bcEditing || S.bcMetrics) return
  if (t === 'broadcasts' && S.broadcasts.some(b => b.status === 'RUNNING')) {
    loadBroadcasts()
  }
}, 10000)



