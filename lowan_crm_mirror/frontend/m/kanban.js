// kanban.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

async function fetchKanban() {
  S.kanbanColLimits = {}
  S.kanbanLoading = true
  try { S.kanban = await apiKanban('/') } catch { S.kanban = { stages: [] } }
  finally { S.kanbanLoading = false }
  if (S.leadsLoaded) cleanOrphanStages()
}


async function cleanOrphanStages() {
  // SEGURANÇA: apenas atualiza localmente — NÃO persiste no backend
  // Chamar a API aqui causou perda massiva de etapas (incidente 22/04/2026)
  if (!S.kanban?.stages || !S.leads.length) return
  const validIds = new Set(S.kanban.stages.map(s => s.id))
  const orphans = S.leads.filter(l => l.stageId && !validIds.has(l.stageId))
  if (!orphans.length) return
  for (const l of orphans) { l.stageId = null; l.status = 'disponivel' }
  render()
}

function _setupKanbanPan() {
  const board = document.getElementById('kanban-board')
  if (!board || board._panAttached) return
  board._panAttached = true

  const INTERACTIVE_SEL = '.kb-card, button, a, input, select, textarea, [draggable="true"], [contenteditable="true"]'
  const DRAG_THRESHOLD = 5
  let startX = 0, startY = 0, startScrollLeft = 0, startScrollTop = 0
  let armed = false, panning = false

  function onMove(e) {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!panning) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
      panning = true
      board.classList.add('kb-panning')
    }
    e.preventDefault()
    board.scrollLeft = startScrollLeft - dx
    board.scrollTop = startScrollTop - dy
  }
  function onUp() {
    if (armed) {
      armed = false
      panning = false
      board.classList.remove('kb-panning')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }
  board.addEventListener('mousedown', e => {
    // Apenas botão esquerdo
    if (e.button !== 0) return
    // Ignora se o alvo é interativo (card, button, etc)
    if (e.target.closest(INTERACTIVE_SEL)) return
    armed = true
    panning = false
    startX = e.clientX
    startY = e.clientY
    startScrollLeft = board.scrollLeft
    startScrollTop = board.scrollTop
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  })
}


function renderKanban() {
  const pipeline = S.kanban
  if (S.kanbanLoading || !pipeline) {
    return `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;gap:8px">
      <svg style="width:18px;height:18px;animation:spin 0.7s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
      Carregando pipeline...
    </div>`
  }

  const stages = pipeline.stages || []
  const leads = S.leads

  const byStage = {}
  const noStage = []
  for (const lead of leads) {
    if (lead.stageId) {
      if (!byStage[lead.stageId]) byStage[lead.stageId] = []
      byStage[lead.stageId].push(lead)
    } else {
      noStage.push(lead)
    }
  }

  const allColumns = [
    { id: null, name: pipeline.defaultStageName || 'Sem Etapa', color: '#94a3b8', leads: noStage },
    ...stages.map(s => ({ ...s, leads: byStage[s.id] || [] })),
  ]

  // ─── Stats agregados ─────────────────────────────────────────────────────
  const totalAll = (S.leadsTotal && S.leadsTotal > leads.length) ? S.leadsTotal : leads.length
  const inStage = leads.filter(l => l.stageId).length
  const noStageCount = noStage.length
  const unreadCount = leads.filter(l => l.unreadCount > 0).length
  const unassignedCount = leads.filter(l => !l.assignedToId).length
  const pct = (n) => totalAll > 0 ? Math.round((n / totalAll) * 100) : 0

  return `
  <div class="kb-shell">
    <div class="kb-page-head">
      <div>
        <h1 class="kb-page-h1">${esc(pipeline.name || 'Pipeline')}</h1>
        <div class="kb-page-meta">
          <span class="kb-pipe-pill">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 01-2 2h-2a2 2 0 01-2-2"/></svg>
            <strong>${totalAll.toLocaleString('pt-BR').replace(',','.')}</strong> leads no total
          </span>
        </div>
      </div>
      <div class="kb-head-actions">
        ${isAdmin() ? `<button class="kb-btn" onclick="openKanbanSettings()">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
          Configurar pipeline
        </button>` : ''}
      </div>
    </div>

    <div class="kb-rail">
      <div class="kb-rail-item"><div class="kb-rail-label">Total no pipeline</div><div class="kb-rail-num">${inStage.toLocaleString('pt-BR').replace(',','.')}</div><div class="kb-rail-meta">${pct(inStage)}% da base</div></div>
      <div class="kb-rail-item"><div class="kb-rail-label">Sem etapa</div><div class="kb-rail-num">${noStageCount.toLocaleString('pt-BR').replace(',','.')}</div><div class="kb-rail-meta">${pct(noStageCount)}% da base</div></div>
      <div class="kb-rail-item"><div class="kb-rail-label">Aguardando resposta</div><div class="kb-rail-num">${unreadCount.toLocaleString('pt-BR').replace(',','.')}</div><div class="kb-rail-meta">com mensagens não lidas</div></div>
      <div class="kb-rail-item"><div class="kb-rail-label">Sem operador</div><div class="kb-rail-num">${unassignedCount.toLocaleString('pt-BR').replace(',','.')}</div><div class="kb-rail-meta">não atribuídos</div></div>
    </div>

    <div class="kb-board-wrap" id="kanban-board">
      <div class="kb-board">
        ${allColumns.map(col => renderKanbanColumn(col, totalAll)).join('')}
        ${isAdmin() ? `<button class="kb-add-stage" onclick="openAddStage()">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nova etapa
        </button>` : ''}
      </div>
    </div>
  </div>
  ${renderKanbanModal()}`
}


function renderKanbanColumn(col, totalAll) {
  const colId = col.id === null ? 'null' : col.id
  const limit = S.kanbanColLimits[colId] ?? KANBAN_PAGE
  const visible = col.leads.slice(0, limit)
  const hasMore = col.leads.length > limit
  const colCount = col.leads.length
  const pct = totalAll > 0 ? Math.max(1, Math.round((colCount / totalAll) * 100)) : 0
  const pctLabel = totalAll > 0 ? ((colCount / totalAll) * 100).toFixed(colCount === 0 ? 0 : (colCount * 100 / totalAll < 1 ? 2 : 0)) : '0'
  return `
  <div class="kb-col">
    <div class="kb-col-head">
      <div class="kb-col-head-row">
        <div class="kb-col-color" style="background:${esc(col.color)}"></div>
        <div class="kb-col-name">${esc(col.name)}</div>
        <div class="kb-col-count">${colCount.toLocaleString('pt-BR').replace(',','.')}</div>
        ${isAdmin() && col.id ? `<button class="kb-col-edit" onclick="openEditStage('${col.id}','${esc(col.name)}','${esc(col.color)}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
        </button>` : ''}
      </div>
      <div class="kb-col-meta">
        <span class="kb-col-pct">${pctLabel}%</span>
        <div class="kb-col-bar-wrap"><div class="kb-col-bar" style="background:${esc(col.color)};width:${pct}%"></div></div>
      </div>
    </div>

    <div class="kb-col-cards"
      data-drop-zone="${colId}"
      ondragover="kanbanDragOver(event,'${col.id}')"
      ondragleave="kanbanDragLeave(event,'${col.id}')"
      ondrop="kanbanDrop(event,'${col.id}')">
      ${col.leads.length === 0 ? `
        <div class="kb-empty-zone">Arraste leads aqui</div>` : visible.map(l => renderKanbanCard(l)).join('')}
      ${hasMore ? `<div class="kb-sentinel" data-kanban-sentinel="${colId}">
        <svg fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
        ${col.leads.length - limit} restantes
      </div>` : ''}
    </div>
  </div>`
}

var _kanbanSentinelObserver = null


function attachKanbanScrollListeners() {
  // Desconecta observer anterior
  if (_kanbanSentinelObserver) { _kanbanSentinelObserver.disconnect(); _kanbanSentinelObserver = null }

  const sentinels = document.querySelectorAll('[data-kanban-sentinel]')
  if (!sentinels.length) return

  _kanbanSentinelObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const colId = entry.target.dataset.kanbanSentinel
        _loadMoreKanbanCol(colId)
      }
    }
  }, { threshold: 0.1 })

  sentinels.forEach(el => _kanbanSentinelObserver.observe(el))
}


function _loadMoreKanbanCol(colId) {
  // Monta lista de leads desta coluna (igual ao renderKanban)
  const pipeline = S.kanban
  if (!pipeline) return
  const stages = pipeline.stages || []
  const realId = colId === 'null' ? null : colId

  let allColLeads
  if (realId === null) {
    allColLeads = S.leads.filter(l => !l.stageId)
  } else {
    allColLeads = S.leads.filter(l => l.stageId === realId)
  }

  const currentLimit = S.kanbanColLimits[colId] ?? KANBAN_PAGE
  const newLimit = currentLimit + KANBAN_PAGE
  S.kanbanColLimits[colId] = newLimit

  const newLeads = allColLeads.slice(currentLimit, newLimit)
  if (!newLeads.length) return

  // Patch DOM: remove sentinel, appenda novos cards, recoloca sentinel se ainda tem mais
  const zone = document.querySelector(`[data-drop-zone="${colId}"]`)
  if (!zone) return

  const sentinel = zone.querySelector(`[data-kanban-sentinel="${colId}"]`)
  if (sentinel) sentinel.remove()

  const frag = document.createDocumentFragment()
  for (const lead of newLeads) {
    const tmp = document.createElement('div')
    tmp.innerHTML = renderKanbanCard(lead)
    while (tmp.firstChild) frag.appendChild(tmp.firstChild)
  }

  const hasMore = allColLeads.length > newLimit
  if (hasMore) {
    const tmp = document.createElement('div')
    tmp.innerHTML = `<div data-kanban-sentinel="${colId}" style="height:40px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#97a0af;flex-shrink:0">
      <svg style="width:14px;height:14px;animation:spin 0.8s linear infinite;margin-right:5px" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
      ${allColLeads.length - newLimit} restantes
    </div>`
    frag.appendChild(tmp.firstChild)
  }

  zone.appendChild(frag)

  // Re-observa o novo sentinel
  if (hasMore && _kanbanSentinelObserver) {
    const newSentinel = zone.querySelector(`[data-kanban-sentinel="${colId}"]`)
    if (newSentinel) _kanbanSentinelObserver.observe(newSentinel)
  }
}

// Kanban time display mode:
//   'stage'      → tempo na etapa atual (stageMovedAt → createdAt fallback)  [DEFAULT — pedido pelo time pra cobrar movimentação]
//   'last_msg'   → tempo desde última mensagem (comportamento antigo)
// ROLLBACK: troque KANBAN_TIME_MODE pra 'last_msg' pra reverter
var KANBAN_TIME_MODE = 'stage'

// SLA defaults globais (fallback quando etapa não tem config própria).
// Cada etapa pode override via stage.slaWarnDays e stage.slaAlertDays.
var KANBAN_SLA_DEFAULT_WARN_DAYS = 3
var KANBAN_SLA_DEFAULT_ALERT_DAYS = 7


function renderKanbanCard(lead) {
  const isDragging = S.draggingLeadId === lead.id
  const hasUnread = lead.unreadCount > 0
  const tags = (lead.tags || []).slice(0, 4)
  const moreTags = Math.max(0, (lead.tags || []).length - 4)
  const hue = Math.abs((lead.name||'?').split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
  const avatarBg = `hsl(${hue},55%,88%)`
  const avatarTx = `hsl(${hue},55%,35%)`
  const initials = (lead.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()
  const assignedHue = lead.assignedTo ? Math.abs(lead.assignedTo.name.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360 : 0
  const isTelegram = (lead.phone || '').startsWith('tg_')
  const channelBadge = isTelegram
    ? `<div class="kb-channel-badge kb-ch-tg" title="Telegram">T</div>`
    : `<div class="kb-channel-badge kb-ch-wa" title="WhatsApp">W</div>`
  const preview = S.msgPreviews[lead.id]
  const previewText = preview?.text ? String(preview.text).slice(0, 120) : null
  const isOutbound = preview?.out === true
  // Tag style mapping
  const tagClass = (t) => {
    const lower = String(t).toLowerCase()
    if (lower === 'telegram') return 'kb-card-tag tg'
    if (lower === 'vip') return 'kb-card-tag vip'
    if (lower.includes('agente')) return 'kb-card-tag agente'
    return 'kb-card-tag'
  }

  return `
  <div class="kb-card${isDragging?' dragging':''}"
    draggable="true"
    ondragstart="kanbanDragStart(event,'${lead.id}')"
    ondragend="kanbanDragEnd(event)"
    onclick="if(!S.draggingLeadId)openConversation('${lead.id}')">
    <div class="kb-card-row">
      <div class="kb-avatar" style="background:${avatarBg};color:${avatarTx}">${esc(initials)}</div>
      <div class="kb-card-info">
        <div class="kb-card-name">${esc(lead.name)}</div>
        <div class="kb-card-phone">${fmtPhone(lead.phone)}</div>
      </div>
      ${channelBadge}
      ${hasUnread ? `<span class="kb-unread">${lead.unreadCount}</span>` : ''}
    </div>
    ${previewText ? `<div class="kb-card-preview${isOutbound?' kb-preview-me':''}">${esc(previewText)}</div>` : ''}
    ${tags.length > 0 ? `<div class="kb-card-tags">
      ${tags.map(t => `<span class="${tagClass(t)}">${esc(t)}</span>`).join('')}
      ${moreTags > 0 ? `<span class="kb-card-tag">+${moreTags}</span>` : ''}
    </div>` : ''}
    <div class="kb-card-foot">
      ${lead.assignedTo ? `<div class="kb-card-assignee">
        <div class="kb-card-assignee-av" style="background:hsl(${assignedHue},55%,88%);color:hsl(${assignedHue},55%,35%)">${esc(lead.assignedTo.name.charAt(0).toUpperCase())}</div>
        <span class="kb-card-assignee-name">${esc(lead.assignedTo.name)}</span>
      </div>` : `<span class="kb-card-assignee-name" style="color:var(--text-muted)">Sem operador</span>`}
      ${(() => {
        if (KANBAN_TIME_MODE === 'stage') {
          const tsRaw = lead.stageMovedAt || lead.createdAt
          if (!tsRaw) return ''
          const moved = !!lead.stageMovedAt
          // SLA: usa thresholds da etapa quando definidos, senão default global
          const stage = lead.stage
          const warnDays = (stage && stage.slaWarnDays != null) ? stage.slaWarnDays : KANBAN_SLA_DEFAULT_WARN_DAYS
          const alertDays = (stage && stage.slaAlertDays != null) ? stage.slaAlertDays : KANBAN_SLA_DEFAULT_ALERT_DAYS
          const ms = Date.now() - new Date(tsRaw).getTime()
          const days = ms / 86400000
          let cls = 'kb-stage-time'
          if (days >= alertDays) cls += ' kb-stage-time-warn'
          else if (days >= warnDays) cls += ' kb-stage-time-attn'
          const tooltipBase = moved ? 'Tempo nesta etapa' : 'Tempo desde criação (nunca trocou de etapa)'
          const tooltip = `${tooltipBase} • SLA: amarelo ${warnDays}d, vermelho ${alertDays}d`
          return `<span class="${cls}" title="${esc(tooltip)}">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" style="flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            ${fmtRelativeTimeKanban(tsRaw)}
          </span>`
        }
        return lead.lastMessageAt ? `<span class="kb-last-act">${fmtRelativeTime(lead.lastMessageAt)}</span>` : ''
      })()}
      ${(isAdmin()||S.me?.permissions?.manageLeads) ? `<button class="kb-card-edit" title="Editar" onclick="event.stopPropagation();openLeadForm(${JSON.stringify(lead).replace(/"/g,'&quot;')})">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
      </button>` : ''}
    </div>
  </div>`
}


function kanbanDragStart(e, leadId) {
  S.draggingLeadId = leadId
  e.dataTransfer.setData('text/plain', leadId)
  e.dataTransfer.effectAllowed = 'move'
}


function kanbanDragEnd(e) {
  S.draggingLeadId = null
  S.dragOverStageId = null
  // Remove highlight visual de todas as colunas sem chamar render()
  document.querySelectorAll('.kb-col.drop-hover').forEach(el => el.classList.remove('drop-hover'))
  render()
}


function _dzKey(stageId) { return (stageId === null || stageId === 'null') ? 'null' : stageId }

function _normStage(stageId) { return (stageId === 'null' || stageId === null) ? null : stageId }

function _dropZoneCol(stageId) {
  const dz = document.querySelector(`[data-drop-zone="${_dzKey(stageId)}"]`)
  return dz ? dz.closest('.kb-col') : null
}


function kanbanDragOver(e, stageId) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  const sid = _normStage(stageId)
  if (S.dragOverStageId !== sid) {
    if (S.dragOverStageId !== undefined) {
      const prev = _dropZoneCol(S.dragOverStageId)
      if (prev) prev.classList.remove('drop-hover')
    }
    S.dragOverStageId = sid
    const el = _dropZoneCol(sid)
    if (el) el.classList.add('drop-hover')
  }
}


function kanbanDragLeave(e, stageId) {
  const sid = _normStage(stageId)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    if (S.dragOverStageId === sid) {
      S.dragOverStageId = null
      const el = _dropZoneCol(sid)
      if (el) el.classList.remove('drop-hover')
    }
  }
}


async function kanbanDrop(e, stageId) {
  e.preventDefault()
  const leadId = e.dataTransfer.getData('text/plain') || S.draggingLeadId
  S.draggingLeadId = null
  S.dragOverStageId = null
  if (!leadId) { render(); return }

  // Template literals convertem null para a string "null" — converter de volta
  const realStageId = (stageId === 'null' || stageId === null) ? null : stageId

  const lead = S.leads.find(l => l.id === leadId)
  if (!lead || lead.stageId === realStageId) { render(); return }

  const prevStageId = lead.stageId
  S.leads = S.leads.map(l => l.id === leadId ? { ...l, stageId: realStageId } : l)

  // Garante que a coluna de destino mostre o lead dropado
  const targetColId = realStageId === null ? 'null' : realStageId
  const targetColLeads = S.leads.filter(l => (realStageId === null ? !l.stageId : l.stageId === realStageId))
  const currentLimit = S.kanbanColLimits[targetColId] ?? KANBAN_PAGE
  if (targetColLeads.length > currentLimit) {
    S.kanbanColLimits[targetColId] = targetColLeads.length
  }

  render()

  try {
    await api(`/${leadId}`, { method: 'PUT', body: JSON.stringify({ stageId: realStageId }) })
  } catch(err) {
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, stageId: prevStageId } : l)
    showToast('Erro ao mover lead')
    render()
  }
}

// ─── Stage Management ─────────────────────────────────────────────────────────
var STAGE_COLORS = [
  '#94a3b8','#60a5fa','#34d399','#f59e0b','#f87171','#a78bfa','#fb7185','#38bdf8','#4ade80','#fbbf24'
]


function openKanbanSettings() {
  S.kanbanModal = 'settings'
  window._pTab = 'etapas'
  S.stageForm = {
    pipelineName: S.kanban?.name || '',
    defaultStageName: S.kanban?.defaultStageName || 'Sem Etapa',
    autoTagBurnedMeta: !!S.kanban?.autoTagBurnedMeta,
  }
  S.stageFormError = ''; render()
}


async function savePipelineSettings() {
  const name = S.stageForm.pipelineName?.trim()
  const defaultStageName = S.stageForm.defaultStageName?.trim()
  const autoTagBurnedMeta = !!S.stageForm.autoTagBurnedMeta
  if (!defaultStageName) { S.stageFormError = 'Nome da coluna padrão obrigatório'; render(); return }
  try {
    const r = await apiKanban('/', { method: 'PATCH', body: JSON.stringify({ name: name || undefined, defaultStageName, autoTagBurnedMeta }) })
    S.kanban = { ...S.kanban, ...r }
    closeKanbanModal()
  } catch(e) { S.stageFormError = e.message; render() }
}


function openAddStage() {
  S.kanbanModal = 'add_stage'
  S.stageForm = { color: '#94a3b8', slaWarnDays: '', slaAlertDays: '' }
  S.stageFormError = ''; render()
}


function openEditStage(id, name, color, slaWarnDays, slaAlertDays) {
  // Quando chamado com objeto (do settings panel), aceita também
  if (typeof id === 'object' && id) {
    const s = id
    id = s.id; name = s.name; color = s.color
    slaWarnDays = s.slaWarnDays; slaAlertDays = s.slaAlertDays
  } else if (slaWarnDays === undefined && slaAlertDays === undefined) {
    // Fallback: busca os SLAs no S.kanban.stages se não foram passados explicitamente
    const stage = (S.kanban?.stages || []).find(s => s.id === id)
    slaWarnDays = stage?.slaWarnDays
    slaAlertDays = stage?.slaAlertDays
  }
  S.kanbanModal = 'edit_stage'
  S.stageEditId = id
  S.stageForm = { name, color, slaWarnDays: slaWarnDays ?? '', slaAlertDays: slaAlertDays ?? '' }
  S.stageFormError = ''; render()
}


function closeKanbanModal() { S.kanbanModal = null; S.stageForm = {}; S.stageFormError = ''; S.stageEditId = null; S.ruleForm = {}; window._pTab = 'etapas'; render() }

// ─── Gatilhos ────────────────────────────────────────────────────────────────
var TRIGGER_LABELS = {
  NO_RESPONSE:   'Lead sem Resposta',
  TEMPLATE_SENT: 'Ao enviar Template',
  FIRST_MESSAGE: 'Ao enviar 1ª Mensagem',
  LEAD_REPLIED:  'Lead Respondeu',
  AUTO_ASSIGN:   'Distribuição Automática',
}


function openAddRule() {
  S.ruleForm = { name:'', trigger:'FIRST_MESSAGE', triggerHours:5, fromStageId:'', toStageId:'', fromNullStage:false, assignStrategy:'', assignPool:[] }
  S.stageFormError = ''
  S.kanbanModal = 'add_rule'
  render()
}


function openEditRule(rule) {
  S.ruleForm = {
    id: rule.id,
    name: rule.name,
    trigger: rule.trigger,
    triggerHours: rule.trigger_hours || 5,
    fromStageId: rule.from_stage_id || '',
    toStageId: rule.to_stage_id || '',
    fromNullStage: !!rule.from_null_stage,
    assignStrategy: rule.assign_strategy || '',
    assignPool: rule.assign_pool || [],
  }
  S.stageFormError = ''
  S.kanbanModal = 'edit_rule'
  render()
}


function buildRuleBody(f) {
  return {
    name: f.name.trim(),
    trigger: f.trigger,
    triggerHours: f.trigger === 'NO_RESPONSE' ? (parseInt(f.triggerHours)||5) : null,
    fromStageId: f.fromStageId || null,
    toStageId: f.toStageId || null,
    fromNullStage: !!f.fromNullStage,
    assignStrategy: f.trigger === 'AUTO_ASSIGN' ? (f.assignStrategy || 'RANDOM') : null,
    assignPool: f.trigger === 'AUTO_ASSIGN' ? (f.assignPool || []) : null,
  }
}


async function saveRule() {
  const f = S.ruleForm
  if (!f.name?.trim()) { S.stageFormError = 'Nome obrigatório.'; render(); return }
  if (!f.toStageId && f.trigger !== 'AUTO_ASSIGN') { S.stageFormError = 'Selecione a etapa de destino.'; render(); return }
  try {
    const r = await apiKanban('/rules', { method:'POST', body: JSON.stringify(buildRuleBody(f)) })
    S.kanban.rules = [...(S.kanban.rules||[]), r]
    closeKanbanModal()
    showToast('Gatilho criado')
  } catch(e) { S.stageFormError = e.message; render() }
}


async function updateRule() {
  const f = S.ruleForm
  if (!f.name?.trim()) { S.stageFormError = 'Nome obrigatório.'; render(); return }
  if (!f.toStageId && f.trigger !== 'AUTO_ASSIGN') { S.stageFormError = 'Selecione a etapa de destino.'; render(); return }
  try {
    const r = await apiKanban(`/rules/${f.id}`, { method:'PATCH', body: JSON.stringify(buildRuleBody(f)) })
    S.kanban.rules = (S.kanban.rules||[]).map(x => x.id === f.id ? {...x, ...r} : x)
    closeKanbanModal()
    showToast('Gatilho atualizado')
  } catch(e) { S.stageFormError = e.message; render() }
}


async function deleteRule(id) {
  if (!confirm('Excluir este gatilho?')) return
  try {
    await apiKanban(`/rules/${id}`, { method:'DELETE' })
    S.kanban.rules = (S.kanban.rules||[]).filter(r=>r.id!==id)
    render()
    showToast('Gatilho excluído')
  } catch(e) { alert(e.message) }
}


async function toggleRule(id, isActive) {
  try {
    const r = await apiKanban(`/rules/${id}`, { method:'PATCH', body: JSON.stringify({ isActive }) })
    S.kanban.rules = (S.kanban.rules||[]).map(x=>x.id===id?{...x,...r}:x)
    render()
  } catch(e) { alert(e.message) }
}

// Helper: parseia o input SLA do form. Retorna número, null (vazio) ou erro string.

function _parseSlaDays(raw) {
  if (raw === '' || raw == null) return { value: null }
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return { error: 'SLA inválido (use número)' }
  if (n <= 0) return { error: 'SLA deve ser maior que 0' }
  if (n > 365) return { error: 'SLA muito alto (máx 365 dias)' }
  return { value: n }
}


async function submitAddStage() {
  const { name, color, slaWarnDays, slaAlertDays } = S.stageForm
  if (!name?.trim()) { S.stageFormError = 'Nome obrigatório'; render(); return }
  const w = _parseSlaDays(slaWarnDays); const a = _parseSlaDays(slaAlertDays)
  if (w.error) { S.stageFormError = 'Atenção: ' + w.error; render(); return }
  if (a.error) { S.stageFormError = 'Alerta: ' + a.error; render(); return }
  if (w.value != null && a.value != null && a.value <= w.value) {
    S.stageFormError = 'Alerta deve ser maior que Atenção'; render(); return
  }
  try {
    const stage = await apiKanban('/stages', { method: 'POST', body: JSON.stringify({
      name: name.trim(), color: color || '#94a3b8',
      slaWarnDays: w.value, slaAlertDays: a.value,
    }) })
    if (S.kanban) S.kanban.stages.push(stage)
    closeKanbanModal()
    showToast('Etapa criada')
  } catch(e) { S.stageFormError = e.message; render() }
}


async function submitEditStage() {
  const { name, color, slaWarnDays, slaAlertDays } = S.stageForm
  if (!name?.trim()) { S.stageFormError = 'Nome obrigatório'; render(); return }
  const w = _parseSlaDays(slaWarnDays); const a = _parseSlaDays(slaAlertDays)
  if (w.error) { S.stageFormError = 'Atenção: ' + w.error; render(); return }
  if (a.error) { S.stageFormError = 'Alerta: ' + a.error; render(); return }
  if (w.value != null && a.value != null && a.value <= w.value) {
    S.stageFormError = 'Alerta deve ser maior que Atenção'; render(); return
  }
  try {
    const updated = await apiKanban(`/stages/${S.stageEditId}`, { method: 'PATCH', body: JSON.stringify({
      name: name.trim(), color,
      slaWarnDays: w.value, slaAlertDays: a.value,
    }) })
    if (S.kanban) S.kanban.stages = S.kanban.stages.map(s => s.id === S.stageEditId ? { ...s, ...updated } : s)
    closeKanbanModal()
    showToast('Etapa atualizada')
  } catch(e) { S.stageFormError = e.message; render() }
}


async function deleteStageKanban(id) {
  if (!confirm('Excluir esta etapa? Os leads não serão apagados.')) return
  try {
    await apiKanban(`/stages/${id}`, { method: 'DELETE' })
    if (S.kanban) S.kanban.stages = S.kanban.stages.filter(s => s.id !== id)
    S.leads = S.leads.map(l => l.stageId === id ? { ...l, stageId: null } : l)
    closeKanbanModal()
    showToast('Etapa excluída')
  } catch(e) { alert(e.message) }
}


async function moveStageUp(id) {
  const stages = S.kanban?.stages
  if (!stages) return
  const idx = stages.findIndex(s => s.id === id)
  if (idx <= 0) return
  const newStages = [...stages]
  ;[newStages[idx-1], newStages[idx]] = [newStages[idx], newStages[idx-1]]
  S.kanban.stages = newStages.map((s,i) => ({ ...s, order: i }))
  render()
  try {
    await apiKanban('/stages/reorder', { method: 'POST', body: JSON.stringify({ stageIds: newStages.map(s => s.id) }) })
  } catch(e) { await fetchKanban(); render() }
}


async function moveStageDown(id) {
  const stages = S.kanban?.stages
  if (!stages) return
  const idx = stages.findIndex(s => s.id === id)
  if (idx < 0 || idx >= stages.length - 1) return
  const newStages = [...stages]
  ;[newStages[idx], newStages[idx+1]] = [newStages[idx+1], newStages[idx]]
  S.kanban.stages = newStages.map((s,i) => ({ ...s, order: i }))
  render()
  try {
    await apiKanban('/stages/reorder', { method: 'POST', body: JSON.stringify({ stageIds: newStages.map(s => s.id) }) })
  } catch(e) { await fetchKanban(); render() }
}


function renderKanbanModal() {
  if (!S.kanbanModal) return ''
  const overlay = 'modal-backdrop'

  if (S.kanbanModal === 'add_stage' || S.kanbanModal === 'edit_stage') {
    const isEdit = S.kanbanModal === 'edit_stage'
    return `<div class="${overlay}" onclick="if(event.target===this)closeKanbanModal()">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 fade">
        <h3 class="font-semibold text-gray-900 mb-4">${isEdit ? 'Editar Etapa' : 'Nova Etapa'}</h3>
        ${S.stageFormError ? `<p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">${esc(S.stageFormError)}</p>` : ''}
        <div class="space-y-4">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Nome</label>
            <input type="text" value="${esc(S.stageForm.name||'')}" oninput="S.stageForm.name=this.value"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Ex: Em Negociação"/></div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-2">Cor</label>
            <div class="flex flex-wrap gap-2">
              ${STAGE_COLORS.map(c => `<button onclick="S.stageForm.color='${c}';render()"
                class="w-7 h-7 rounded-full border-2 ${S.stageForm.color===c ? 'border-gray-800 scale-110' : 'border-white'} shadow transition-transform"
                style="background:${c}"></button>`).join('')}
            </div>
          </div>

          <!-- SLA Configuration -->
          <div style="border-top:1px solid #f0f1f3;padding-top:14px;margin-top:4px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
              <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:0.06em;color:#9095a0;text-transform:uppercase">SLA — Tempo na etapa</span>
            </div>
            <p style="font-size:11.5px;color:#6b7280;margin:0 0 10px;line-height:1.45">Quanto tempo um lead pode ficar parado nesta etapa antes de virar amarelo (atenção) ou vermelho (alerta).</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#a16207;margin-bottom:4px">
                  <span style="width:8px;height:8px;border-radius:50%;background:#eab308;display:inline-block"></span>
                  Atenção (dias)
                </label>
                <input type="number" min="1" max="365" value="${esc(String(S.stageForm.slaWarnDays ?? ''))}" oninput="S.stageForm.slaWarnDays=this.value" placeholder="3"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" style="font-family:'JetBrains Mono',monospace"/>
              </div>
              <div>
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#b91c1c;margin-bottom:4px">
                  <span style="width:8px;height:8px;border-radius:50%;background:#dc2626;display:inline-block"></span>
                  Alerta (dias)
                </label>
                <input type="number" min="1" max="365" value="${esc(String(S.stageForm.slaAlertDays ?? ''))}" oninput="S.stageForm.slaAlertDays=this.value" placeholder="7"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400" style="font-family:'JetBrains Mono',monospace"/>
              </div>
            </div>
            <p style="font-size:10.5px;color:#9ca3af;margin:8px 0 0;line-height:1.4">Vazio = usa padrão global (3d / 7d). Atenção deve ser menor que Alerta.</p>
          </div>
        </div>
        <div class="flex gap-2 mt-5">
          <button onclick="closeKanbanModal()" class="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
          ${isEdit ? `<button onclick="deleteStageKanban('${S.stageEditId}')" class="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium">Excluir</button>` : ''}
          <button onclick="${isEdit ? 'submitEditStage()' : 'submitAddStage()'}" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">${isEdit ? 'Salvar' : 'Criar'}</button>
        </div>
      </div>
    </div>`
  }

  if (S.kanbanModal === 'settings') {
    const stages = S.kanban?.stages || []
    const rules = S.kanban?.rules || []
    const tab = window._pTab || 'etapas'
    const TCOLORS = { NO_RESPONSE:'#f59e0b', TEMPLATE_SENT:'#6366f1', FIRST_MESSAGE:'#10b981', LEAD_REPLIED:'#3b82f6', AUTO_ASSIGN:'#8b5cf6' }
    const TBGS    = { NO_RESPONSE:'rgba(245,158,11,.12)', TEMPLATE_SENT:'rgba(99,102,241,.12)', FIRST_MESSAGE:'rgba(16,185,129,.12)', LEAD_REPLIED:'rgba(59,130,246,.12)', AUTO_ASSIGN:'rgba(139,92,246,.12)' }

    const iBtn = (onclick, svg, hoverC, hoverBg) =>
      `<button onclick="${onclick}" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;border-radius:6px;color:#9ca3af;flex-shrink:0;transition:all .12s;"
        onmouseover="this.style.color='${hoverC}';this.style.background='${hoverBg}'" onmouseout="this.style.color='#9ca3af';this.style.background='transparent'">${svg}</button>`

    const SVG_UP   = `<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>`
    const SVG_DOWN = `<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>`
    const SVG_EDIT = `<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`
    const SVG_DEL  = `<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`
    const SVG_ADD  = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>`
    const SVG_ARR  = `<svg width="12" height="12" fill="none" stroke="#c4c4d4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>`

    const addBtn = (onclick, label) =>
      `<button onclick="${onclick}" style="width:100%;margin-top:10px;padding:10px;border:1.5px dashed #d1d5db;border-radius:8px;background:transparent;color:#6b7280;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;font-family:inherit;"
        onmouseover="this.style.borderColor='#4f46e5';this.style.color='#4f46e5';this.style.background='#f5f3ff'"
        onmouseout="this.style.borderColor='#d1d5db';this.style.color='#6b7280';this.style.background='transparent'">${SVG_ADD} ${label}</button>`

    const stagesHTML = `
      ${stages.length === 0
        ? `<div style="text-align:center;padding:40px 0;color:#9ca3af;font-size:13px;">Nenhuma etapa criada.</div>`
        : stages.map((s, idx) => `
          <div style="display:flex;align-items:center;gap:8px;padding:9px 12px 9px 0;border-radius:8px;margin-bottom:2px;position:relative;transition:background .12s;"
            onmouseover="this.style.background='#f8f8ff'" onmouseout="this.style.background='transparent'">
            <div style="width:3px;height:32px;border-radius:99px;background:${esc(s.color)};flex-shrink:0;margin-right:4px;"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:${esc(s.color)};flex-shrink:0;"></div>
            <span style="flex:1;font-size:13px;font-weight:500;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.name)}</span>
            <div style="display:flex;gap:1px;align-items:center;">
              <button onclick="moveStageUp('${s.id}')" ${idx===0?'disabled':''} style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;border-radius:6px;color:#c4c4d4;opacity:${idx===0?.35:1};transition:all .12s;"
                ${idx>0?`onmouseover="this.style.color='#4b5563';this.style.background='#f3f4f6'" onmouseout="this.style.color='#c4c4d4';this.style.background='transparent'"`:``}>${SVG_UP}</button>
              <button onclick="moveStageDown('${s.id}')" ${idx===stages.length-1?'disabled':''} style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;border-radius:6px;color:#c4c4d4;opacity:${idx===stages.length-1?.35:1};transition:all .12s;"
                ${idx<stages.length-1?`onmouseover="this.style.color='#4b5563';this.style.background='#f3f4f6'" onmouseout="this.style.color='#c4c4d4';this.style.background='transparent'"`:``}>${SVG_DOWN}</button>
              ${iBtn(`openEditStage('${s.id}','${esc(s.name)}','${esc(s.color)}')`, SVG_EDIT, '#4f46e5', '#eef2ff')}
            </div>
          </div>`).join('')}
      ${addBtn(`closeKanbanModal();openAddStage()`, 'Nova Etapa')}`

    const gatilhosHTML = `
      ${rules.length === 0
        ? `<div style="text-align:center;padding:48px 0 40px;color:#9ca3af;font-size:13px;"><div style="font-size:30px;margin-bottom:10px;opacity:.5;">⚡</div>Nenhum gatilho configurado.</div>`
        : rules.map(rule => {
            const fromStage = stages.find(s=>s.id===rule.from_stage_id)
            const toStage   = stages.find(s=>s.id===rule.to_stage_id)
            const fromLabel = rule.from_null_stage ? 'Novo Lead' : (fromStage?.name || 'Qualquer')
            const toLabel   = toStage?.name || '—'
            const label     = TRIGGER_LABELS[rule.trigger] || rule.trigger
            const bc = TCOLORS[rule.trigger] || '#6b7280'
            const bg = TBGS[rule.trigger]   || 'rgba(107,114,128,.1)'
            return `
              <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:8px;margin-bottom:4px;border:1px solid #efefef;background:#fafafa;transition:all .12s;"
                onmouseover="this.style.background='#f5f3ff';this.style.borderColor='#ddd6fe'" onmouseout="this.style.background='#fafafa';this.style.borderColor='#efefef'">
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap;">
                    <span style="font-size:12px;font-weight:600;color:#1f2937;">${esc(rule.name)}</span>
                    <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px;color:${bc};background:${bg};white-space:nowrap;">${esc(label)}</span>
                    ${rule.trigger==='NO_RESPONSE'?`<span style="font-size:10px;font-weight:600;color:#f59e0b;">${rule.trigger_hours}h</span>`:''}
                  </div>
                  <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                    <span style="font-size:11px;color:#6b7280;background:#f0f0f5;padding:2px 7px;border-radius:5px;">${esc(fromLabel)}</span>
                    ${SVG_ARR}
                    <span style="font-size:11px;color:#6b7280;background:#f0f0f5;padding:2px 7px;border-radius:5px;">${esc(toLabel)}</span>
                  </div>
                </div>
                <div style="display:flex;gap:1px;margin-top:1px;">
                  ${iBtn(`openEditRule(${JSON.stringify(rule).replace(/"/g,'&quot;')})`, SVG_EDIT, '#4f46e5', '#eef2ff')}
                  ${iBtn(`deleteRule('${rule.id}')`, SVG_DEL, '#ef4444', '#fef2f2')}
                </div>
              </div>`
          }).join('')}
      ${addBtn(`openAddRule()`, 'Novo Gatilho')}`

    const configHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${S.stageFormError ? `<p style="font-size:12px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;margin:0;">${esc(S.stageFormError)}</p>` : ''}
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px;">Nome do Pipeline</label>
          <input type="text" value="${esc(S.stageForm.pipelineName||'')}" oninput="S.stageForm.pipelineName=this.value"
            style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;color:#111318;font-family:inherit;outline:none;transition:border-color .15s;box-sizing:border-box;"
            onfocus="this.style.borderColor='#4f46e5'" onblur="this.style.borderColor='#e5e7eb'"/>
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px;">Coluna "Sem Etapa"</label>
          <input type="text" value="${esc(S.stageForm.defaultStageName||'Sem Etapa')}" oninput="S.stageForm.defaultStageName=this.value" placeholder="Sem Etapa"
            style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;color:#111318;font-family:inherit;outline:none;transition:border-color .15s;box-sizing:border-box;"
            onfocus="this.style.borderColor='#4f46e5'" onblur="this.style.borderColor='#e5e7eb'"/>
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:4px;">
          <label style="display:block;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;">Automações</label>
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;transition:background .12s;"
            onmouseover="this.style.background='#f5f3ff'" onmouseout="this.style.background='#fafafa'">
            <input type="checkbox" ${S.stageForm.autoTagBurnedMeta?'checked':''} onchange="S.stageForm.autoTagBurnedMeta=this.checked"
              style="margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:#4f46e5;flex-shrink:0;"/>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;color:#1f2937;margin-bottom:2px;">Marcar leads queimados automaticamente</div>
              <div style="font-size:11.5px;color:#6b7280;line-height:1.4;">Aplica a tag <code style="background:#fff;padding:1px 5px;border-radius:4px;font-size:10.5px;border:1px solid #e5e7eb;">lead-queimado-meta</code> quando a Meta retornar erro 131049 (anti-spam per-recipient) no envio. Útil pra parar de tentar contatar leads que a Meta já marcou.</div>
            </div>
          </label>
        </div>
        <button onclick="savePipelineSettings()" style="padding:10px;background:#4f46e5;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;width:100%;transition:background .15s;"
          onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">Salvar configurações</button>
      </div>`

    const TABS = [
      { id:'etapas',    label:'Etapas',        count: stages.length },
      { id:'gatilhos',  label:'Gatilhos',       count: rules.length },
      { id:'config',    label:'Configurações',  count: undefined },
    ]

    return `<div class="${overlay}" onclick="if(event.target===this)closeKanbanModal()">
      <div class="fade" style="background:white;border-radius:16px;width:100%;max-width:420px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.05);">

        <!-- Dark header -->
        <div style="background:#111318;padding:18px 18px 0;flex-shrink:0;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:28px 28px;"></div>
          <div style="position:relative;display:flex;align-items:center;gap:11px;margin-bottom:16px;">
            <div style="width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="17" height="17" fill="none" stroke="white" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:white;line-height:1.2;">Configurar Pipeline</div>
              <div style="font-size:11px;color:rgba(255,255,255,.38);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(S.kanban?.name || 'Pipeline Principal')}</div>
            </div>
            <button onclick="closeKanbanModal()" style="width:28px;height:28px;border-radius:7px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s;"
              onmouseover="this.style.background='rgba(255,255,255,.12)';this.style.color='white'" onmouseout="this.style.background='rgba(255,255,255,.05)';this.style.color='rgba(255,255,255,.55)'">
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <!-- Tab bar inside dark header -->
          <div style="display:flex;border-bottom:1px solid rgba(255,255,255,.07);position:relative;">
            ${TABS.map(t => {
              const active = tab === t.id
              return `<button onclick="window._pTab='${t.id}';render()" style="padding:7px 14px 11px;font-size:12px;font-weight:${active?'600':'400'};color:${active?'white':'rgba(255,255,255,.38)'};border:none;background:transparent;cursor:pointer;border-bottom:2px solid ${active?'#818cf8':'transparent'};transition:color .15s;display:flex;align-items:center;gap:5px;font-family:inherit;margin-bottom:-1px;"
                ${!active?`onmouseover="this.style.color='rgba(255,255,255,.65)'" onmouseout="this.style.color='rgba(255,255,255,.38)'"`:``}>
                ${t.label}
                ${t.count !== undefined ? `<span style="font-size:10px;font-weight:700;background:${active?'rgba(129,140,248,.22)':'rgba(255,255,255,.09)'};color:${active?'#a5b4fc':'rgba(255,255,255,.35)'};padding:0 6px;border-radius:99px;line-height:17px;">${t.count}</span>` : ''}
              </button>`
            }).join('')}
          </div>
        </div>

        <!-- Body -->
        <div style="overflow-y:auto;flex:1;padding:16px 18px 18px;">
          ${tab === 'etapas'   ? stagesHTML   : ''}
          ${tab === 'gatilhos' ? gatilhosHTML : ''}
          ${tab === 'config'   ? configHTML   : ''}
        </div>

      </div>
    </div>`
  }

  if (S.kanbanModal === 'add_rule' || S.kanbanModal === 'edit_rule') {
    const isEdit = S.kanbanModal === 'edit_rule'
    const stages = S.kanban?.stages || []
    const f = S.ruleForm
    const needsHours = f.trigger === 'NO_RESPONSE'
    const needsStage = f.trigger !== 'AUTO_ASSIGN'
    return `<div class="${overlay}" onclick="if(event.target===this)closeKanbanModal()">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 fade">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900">${isEdit ? 'Editar Gatilho' : 'Novo Gatilho'}</h3>
          <button onclick="closeKanbanModal()" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        ${S.stageFormError ? `<p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">${esc(S.stageFormError)}</p>` : ''}
        <div class="space-y-3">
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Nome do gatilho</label>
            <input type="text" value="${esc(f.name||'')}" oninput="S.ruleForm.name=this.value" placeholder="Ex: Lead sem resposta → Perdido"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
          </div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Quando</label>
            ${renderCDD({id:'cdd-rule-trigger',value:f.trigger||'',options:Object.entries(TRIGGER_LABELS).map(([k,v])=>({value:k,label:v})),onchange:"S.ruleForm.trigger=this.value;render()",style:'width:100%'})}
          </div>
          ${needsHours ? `<div><label class="block text-xs font-semibold text-gray-600 mb-1">Horas sem resposta</label>
            <input type="number" min="1" value="${f.triggerHours||5}" oninput="S.ruleForm.triggerHours=this.value"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
          </div>` : ''}
          ${needsStage ? `
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Da Etapa</label>
            ${renderCDD({id:'cdd-rule-from',value:f.fromNullStage?'__novo_lead__':(f.fromStageId||''),options:[{value:'',label:'Qualquer etapa'},{value:'__novo_lead__',label:'Novo Lead (sem etapa)'},...stages.map(s=>({value:s.id,label:s.name}))],onchange:"(function(v){if(v==='__novo_lead__'){S.ruleForm.fromStageId='';S.ruleForm.fromNullStage=true;}else{S.ruleForm.fromStageId=v;S.ruleForm.fromNullStage=false;}render()})(this.value)",style:'width:100%'})}
          </div>
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Mover para Etapa</label>
            ${renderCDD({id:'cdd-rule-to',value:f.toStageId||'',options:[{value:'',label:'— Selecione —'},...stages.map(s=>({value:s.id,label:s.name}))],onchange:"S.ruleForm.toStageId=this.value",style:'width:100%'})}
          </div>` : ''}
          ${f.trigger === 'AUTO_ASSIGN' ? `
          <div><label class="block text-xs font-semibold text-gray-600 mb-1">Estratégia</label>
            ${renderCDD({id:'cdd-rule-strategy',value:f.assignStrategy||'RANDOM',options:[{value:'RANDOM',label:'Aleatório'},{value:'ROUND_ROBIN',label:'Revezamento (Round Robin)'},{value:'LEAST_ASSIGNED',label:'Menos atribuídos'}],onchange:"S.ruleForm.assignStrategy=this.value;render()",style:'width:100%'})}
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Comerciais na distribuição</label>
            <div class="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
              ${S.users && S.users.length > 0
                ? S.users.filter(u => u.isActive !== false).map(u => {
                    const checked = (f.assignPool||[]).includes(u.id)
                    return `<label class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" ${checked?'checked':''} onchange="(function(checked){const pool=S.ruleForm.assignPool||[];S.ruleForm.assignPool=checked?[...pool,'${u.id}']:pool.filter(id=>id!=='${u.id}');})(this.checked)"
                        class="rounded border-gray-300 text-indigo-600"/>
                      <span class="text-sm text-gray-700">${esc(u.name)}</span>
                      <span class="text-xs text-gray-400">${u.role==='ADMIN'?'Admin':'Operador'}</span>
                    </label>`
                  }).join('')
                : '<p class="text-xs text-gray-400 text-center py-2">Nenhum usuário disponível</p>'
              }
            </div>
            <p class="text-xs text-gray-400 mt-1">Deixe vazio para incluir todos os operadores ativos.</p>
          </div>` : ''}
        </div>
        <div class="flex gap-2 mt-5">
          <button onclick="closeKanbanModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button onclick="${isEdit ? 'updateRule()' : 'saveRule()'}" class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">${isEdit ? 'Salvar' : 'Criar Gatilho'}</button>
        </div>
      </div>
    </div>`
  }

  return ''
}