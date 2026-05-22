// ai-agents.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

// State e constantes de Agentes IA. Originalmente extraído pra broadcasts.js
// por adjacência (PR 10), movido pra cá no PR 16 quando ai-agents virou lazy
// e broadcasts deixou de ser garantido em paralelo.
S.aiAgents = []
S.aiAgentsLoaded = false
S.aiApiKeyConfigured = false
S.aiAgentEditing = null   // {id?, name, ...}
S.aiAgentTestText = ''
S.aiAgentTestReply = null
S.aiAgentTestLoading = false
S.aiAgentRuns = []

var AI_DAYS = [
  { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
]
var AI_LEAD_VARS = [
  { key: 'nome', desc: 'Nome do lead' },
  { key: 'telefone', desc: 'Telefone' },
  { key: 'etapa', desc: 'Etapa do kanban' },
  { key: 'tags', desc: 'Tags do lead' },
]
var AI_TONES = [
  { value: 'friendly', label: 'Amigável (cordial e próximo)' },
  { value: 'formal', label: 'Formal (profissional e direto)' },
  { value: 'technical', label: 'Técnico (preciso e detalhado)' },
]
var AI_MODELS = [
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — rápido e econômico' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — equilibrado' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7 — máxima qualidade' },
]
var AI_CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
]

var AI_PROMPT_TEMPLATES = {
  vendas: `Você é {{nome_agente}}, especialista em vendas. Está conversando com {{nome}} (etapa: {{etapa}}).

Seu objetivo é qualificar o lead, entender as necessidades e direcionar para fechamento.

Comportamento:
• Seja consultivo e faça perguntas abertas
• Destaque benefícios, não features
• Identifique objeções e responda com empatia
• Se o cliente pedir desconto/condições especiais, transfira para humano`,

  suporte: `Você é um atendente de suporte técnico. Está atendendo {{nome}}.

Seu objetivo é diagnosticar problemas e oferecer soluções claras.

Comportamento:
• Seja paciente e peça informações específicas
• Confirme entendimento antes de propor solução
• Use linguagem simples (evite jargão técnico)
• Se for caso urgente ou complexo, transfira para humano imediatamente`,

  geral: `Você é um atendente do CRM atendendo {{nome}}.

Seja cordial, prestativo e responda de forma clara e objetiva.

Comportamento:
• Saudações breves
• Respostas diretas, sem rodeios
• Se a dúvida exigir decisão (preços, prazos, condições), transfira para humano
• Não prometa o que não pode cumprir`,

  qualificacao: `Você é um agente de qualificação de leads. Está conversando com {{nome}}.

Seu objetivo é coletar informações chave SEM ser invasivo.

Faça perguntas em ordem natural:
1. Qual interesse principal?
2. Já é cliente ou primeira vez?
3. Há prazo/urgência?
4. Tem orçamento/perfil para o produto?

Após coletar 2-3 respostas, agradeça e diga que um especialista vai dar continuidade.`,
}

async function loadLeadAiState(leadId) {
  if (!leadId || S.leadAiStateLoading[leadId]) return
  S.leadAiStateLoading[leadId] = true
  try {
    const r = await apiAi('/lead-state/' + leadId)
    S.leadAiState[leadId] = r
  } catch (err) {
    if (!String(err.message||'').includes('not found')) console.warn('AI state load:', err.message)
    S.leadAiState[leadId] = { state: 'auto' }
  } finally {
    S.leadAiStateLoading[leadId] = false
    if (S.conversationLeadId === leadId) {
      _patchLeadAiCard(leadId)
    }
  }
}


async function setLeadAiState(leadId, newState) {
  // Optimistic update: muda state imediatamente, sem esperar API
  const prev = S.leadAiState[leadId] ? { ...S.leadAiState[leadId] } : null
  S.leadAiState[leadId] = { ...(prev || {}), state: newState }
  _patchLeadAiCard(leadId)
  try {
    const r = await apiAi('/lead-state/' + leadId, { method: 'POST', body: { state: newState } })
    // Sincroniza com o que API retornou (pode ter pausedAt etc.)
    S.leadAiState[leadId] = { ...(S.leadAiState[leadId]||{}), ...r }
    // Não re-renderiza: o card visual já está correto (prev. optimistic)
  } catch (err) {
    // Reverte
    if (prev) S.leadAiState[leadId] = prev
    else delete S.leadAiState[leadId]
    _patchLeadAiCard(leadId)
    if (typeof showToast === 'function') showToast('Erro: ' + err.message, 'error')
    else alert('Erro: ' + err.message)
  }
}


async function loadAiGlobalOverride() {
  if (!getToken()) return
  try {
    const prev = JSON.stringify(S.aiGlobalOverride||null)
    S.aiGlobalOverride = await apiAi('/global-override')
    // Só atualiza banner se mudou — evita flicker periódico
    if (JSON.stringify(S.aiGlobalOverride) !== prev) {
      try { _injectAiOverrideBanner() } catch {}
    }
  } catch (err) { /* silencioso — esperado fora de sessão */ }
}


async function toggleAiGlobalOverride(active, reason) {
  if (!getToken()) return
  // Optimistic
  const prev = S.aiGlobalOverride ? { ...S.aiGlobalOverride } : null
  S.aiGlobalOverride = { ...(prev||{}), active: !!active, reason: reason || null }
  try { _injectAiOverrideBanner() } catch {}
  try {
    S.aiGlobalOverride = await apiAi('/global-override', { method: 'POST', body: { active: !!active, reason: reason || null } })
    try { _injectAiOverrideBanner() } catch {}
    if (typeof showToast === 'function') showToast(active ? 'Override global ATIVADO — IA atende todos' : 'Override global desativado')
  } catch (err) {
    S.aiGlobalOverride = prev
    try { _injectAiOverrideBanner() } catch {}
    if (typeof showToast === 'function') showToast('Erro: ' + err.message, 'error')
    else alert('Erro: ' + err.message)
  }
}


function renderAiOverrideBanner() {
  const o = S.aiGlobalOverride
  if (!o || !o.active) return ''
  return `<div class="ai-override-banner">
    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 005 19z"/></svg>
    Override global ATIVO: IA atende todos os leads (ignora pausas e filtros). ${o.reason ? '· ' + esc(o.reason) : ''}
    <button onclick="toggleAiGlobalOverride(false)">Desativar</button>
  </div>`
}


function renderLeadAiBadge(lead) {
  const st = S.leadAiState[lead.id]
  if (!st) {
    setTimeout(() => loadLeadAiState(lead.id), 0)
    return `<div class="det-ai-card" id="lead-ai-card-${lead.id}"><div class="det-ai-loading">Carregando estado da IA…</div></div>`
  }
  const stateMap = {
    auto:               { cls:'s-auto',    txt:'IA atendendo',     desc:'Segue gatilhos e filtros do agente' },
    paused_by_operator: { cls:'s-paused',  txt:'IA pausada',       desc:'Pausada manualmente neste lead' },
    paused_by_takeover: { cls:'s-paused',  txt:'IA pausada',       desc:'Você assumiu — IA não responde até reativar' },
    handed_off:         { cls:'s-handoff', txt:'Transferido p/ humano', desc:'Handoff por palavra-chave ou limite' },
    force_active:       { cls:'s-forced',  txt:'IA forçada',       desc:'Atende sempre, ignora filtros do agente' },
  }
  const cur = stateMap[st.state] || stateMap.auto
  const isPaused = ['paused_by_operator','paused_by_takeover','handed_off'].includes(st.state)
  const isForced = st.state === 'force_active'

  // Botão primário: contextual conforme estado atual
  let primaryBtn
  if (isPaused) {
    primaryBtn = `<button class="det-ai-act primary" onclick="setLeadAiState('${lead.id}','auto')" title="Voltar ao automático">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      Reativar IA
    </button>`
  } else {
    primaryBtn = `<button class="det-ai-act danger" onclick="setLeadAiState('${lead.id}','paused_by_operator')" title="Pausar IA neste lead">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6"/></svg>
      Pausar IA
    </button>`
  }

  // Botão secundário: forçar/desforçar
  let secondaryBtn
  if (isForced) {
    secondaryBtn = `<button class="det-ai-act" onclick="setLeadAiState('${lead.id}','auto')" title="Voltar ao modo automático">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
      Auto
    </button>`
  } else {
    secondaryBtn = `<button class="det-ai-act" onclick="setLeadAiState('${lead.id}','force_active')" title="Sempre responder este lead, ignora filtros">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
      Forçar
    </button>`
  }

  return `
    <div class="det-ai-card" id="lead-ai-card-${lead.id}">
      <div class="det-ai-head">
        <span class="det-ai-head-ic">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/></svg>
        </span>
        <span class="det-ai-head-tt">Agente de IA</span>
        <span class="det-ai-head-sb">Phase&nbsp;1</span>
      </div>
      <span class="det-ai-status ${cur.cls}">
        <span class="dot"></span>${esc(cur.txt)}
      </span>
      <div class="det-ai-desc">${esc(cur.desc)}</div>
      <div class="det-ai-actions">
        ${primaryBtn}
        ${secondaryBtn}
      </div>
    </div>`
}


async function loadAiAgents() {
  try {
    const [list, keyInfo] = await Promise.all([
      apiAi('/'),
      apiAi('/api-key').catch(() => ({ configured: false })),
    ])
    S.aiAgents = Array.isArray(list) ? list : []
    S.aiApiKeyConfigured = !!keyInfo?.configured
    S.aiAgentsLoaded = true
    render()
  } catch(e) {
    showToast(e?.message || 'Erro ao carregar agentes', 'error')
    S.aiAgentsLoaded = true
    render()
  }
}


function renderAiAgentsPanel() {
  if (!isAdmin()) {
    return `<div class="ai-page"><div class="ai-empty"><div class="ai-empty-emoji">🔒</div><div class="ai-empty-title">Acesso restrito</div><div class="ai-empty-sub">Apenas administradores podem gerenciar agentes de IA.</div></div></div>`
  }
  if (!S.aiAgentsLoaded) {
    return `<div class="ai-page"><div style="padding:60px;text-align:center;color:var(--text-muted);display:flex;align-items:center;justify-content:center;gap:10px"><svg style="animation:spin 0.8s linear infinite;width:20px;height:20px" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Carregando agentes...</div></div>`
  }

  const all = S.aiAgents || []
  const totalActive   = all.filter(a => a.status === 'active').length
  const totalRuns     = all.reduce((n, a) => n + (a.totalRuns || 0), 0)
  const totalTokens   = all.reduce((n, a) => n + (a.totalTokens || 0), 0)
  const tokensFmt = totalTokens >= 1_000_000
    ? (totalTokens / 1_000_000).toFixed(1).replace('.0','') + 'M'
    : totalTokens >= 1000
      ? (totalTokens / 1000).toFixed(1).replace('.0','') + 'k'
      : String(totalTokens)

  const filter = S.aiAgentsFilter || 'all'
  const cnt = {
    all: all.length,
    active: all.filter(a => a.status === 'active').length,
    inactive: all.filter(a => a.status === 'inactive').length,
  }
  const filtered = filter === 'all' ? all
    : filter === 'active' ? all.filter(a => a.status === 'active')
    : all.filter(a => a.status === 'inactive')

  const search = (S.aiAgentsSearch || '').toLowerCase().trim()
  const visible = search
    ? filtered.filter(a => (a.name || '').toLowerCase().includes(search) || (a.description || '').toLowerCase().includes(search))
    : filtered

  const cards = visible.length > 0
    ? visible.map(a => renderAiAgentCard(a)).join('')
    : `<div class="ai-empty">
        <div class="ai-empty-emoji">🤖</div>
        <div class="ai-empty-title">${all.length === 0 ? 'Nenhum agente IA criado ainda' : 'Nenhum agente encontrado'}</div>
        <div class="ai-empty-sub">${all.length === 0 ? 'Crie seu primeiro agente para automatizar atendimentos com IA.' : 'Tente ajustar o filtro ou busca.'}</div>
      </div>`

  const keyPill = S.aiApiKeyConfigured
    ? `<span class="ai-key-pill ok" title="API Key Anthropic configurada">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
         API Key
       </span>`
    : `<span class="ai-key-pill warn" title="Configure a API Key para usar os agentes">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z"/></svg>
         API Key não configurada
       </span>`

  return `
  <div class="ai-page">
    <div class="ai-header">
      <div>
        <h1>
          <span style="font-size:36px">🤖</span>
          Agentes IA
        </h1>
        <div class="ai-header-sub">Atendentes automáticos com IA da Anthropic Claude. Configure prompts personalizados, escolha o modo de resposta e deixe a IA atender 24/7.</div>
      </div>
      <div class="ai-header-actions">
        ${keyPill}
        <button onclick="openAiApiKeyModal()" class="bc-btn bc-btn-secondary">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
          API Key
        </button>
        <button onclick="openAiAgentModal()" class="bc-btn bc-btn-primary">
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Novo agente
        </button>
      </div>
    </div>

    <div class="ai-stats">
      <div class="ai-stat">
        <div class="ai-stat-label">Agentes</div>
        <div class="ai-stat-num">${all.length}</div>
        <div class="ai-stat-sub">${totalActive} ativos · ${all.length - totalActive} inativos</div>
      </div>
      <div class="ai-stat">
        <div class="ai-stat-label">Execuções</div>
        <div class="ai-stat-num">${(totalRuns).toLocaleString('pt-BR')}</div>
        <div class="ai-stat-sub">total acumulado</div>
      </div>
      <div class="ai-stat">
        <div class="ai-stat-label">Tokens</div>
        <div class="ai-stat-num">${tokensFmt}</div>
        <div class="ai-stat-sub">consumo total</div>
      </div>
      <div class="ai-stat">
        <div class="ai-stat-label">Modelo padrão</div>
        <div class="ai-stat-num" style="font-size:18px;font-family:'Plus Jakarta Sans',sans-serif">Haiku 4.5</div>
        <div class="ai-stat-sub">rápido e econômico</div>
      </div>
    </div>

    <div class="ai-filters-row">
      <button class="ai-chip ${filter==='all'?'active':''}" onclick="S.aiAgentsFilter='all';render()">
        Todos <span class="ai-chip-count">${cnt.all}</span>
      </button>
      <button class="ai-chip ${filter==='active'?'active':''}" onclick="S.aiAgentsFilter='active';render()">
        Ativos <span class="ai-chip-count">${cnt.active}</span>
      </button>
      <button class="ai-chip ${filter==='inactive'?'active':''}" onclick="S.aiAgentsFilter='inactive';render()">
        Inativos <span class="ai-chip-count">${cnt.inactive}</span>
      </button>
      <div style="flex:1"></div>
      <input type="text" class="form-input" placeholder="Buscar agente..." value="${esc(S.aiAgentsSearch||'')}" oninput="S.aiAgentsSearch=this.value;render()" style="max-width:240px;font-size:12.5px;padding:6px 12px"/>
    </div>

    <div class="ai-grid">${cards}</div>
  </div>`
}

/* AI status badge styles */
if(!document.getElementById('ai-status-badge-css')){const _c=document.createElement('style');_c.id='ai-status-badge-css';_c.textContent=`.ai-status-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:100px;font-size:10px;font-weight:700;letter-spacing:0.06em;font-family:'JetBrains Mono',monospace}.ai-status-badge.on{background:color-mix(in srgb,#10b981 14%,transparent);color:#047857;animation:aiBadgePulse 2s ease-in-out infinite}.ai-status-badge.off{background:color-mix(in srgb,#94a3b8 18%,transparent);color:#475569}@keyframes aiBadgePulse{0%,100%{opacity:1}50%{opacity:0.7}}`;document.head.appendChild(_c)}

function renderAiAgentCard(a) {
  const isActive = a.status === 'active'
  const channels = (a.channels || []).slice(0, 3).map(c => {
    const lbl = AI_CHANNELS.find(x => x.value === c)?.label || c
    return `<span class="ai-pill ai-pill-channel">${esc(lbl)}</span>`
  }).join('')
  const moreChannels = (a.channels || []).length > 3 ? `<span class="ai-pill ai-pill-channel">+${(a.channels||[]).length-3}</span>` : ''
  const modePill = a.mode === 'auto'
    ? `<span class="ai-pill ai-pill-auto"><span class="ai-pill-dot"></span>Auto</span>`
    : `<span class="ai-pill ai-pill-suggested"><span class="ai-pill-dot"></span>Sugerido</span>`
  const modelLbl = (AI_MODELS.find(m => m.value === a.model)?.label || a.model).split('—')[0].trim()
  const tokens = a.totalTokens || 0
  const tokensFmt = tokens >= 1_000_000 ? (tokens/1_000_000).toFixed(1).replace('.0','') + 'M'
    : tokens >= 1000 ? (tokens/1000).toFixed(1).replace('.0','') + 'k' : String(tokens)

  return `
    <div class="ai-card${isActive?' ai-card-active':''}" onclick="openAiAgentModal('${esc(a.id)}')">
      <div class="ai-card-head">
        <div class="ai-card-title-block">
          <div class="ai-card-title">${esc(a.name)}</div>
          <div class="ai-card-sub">
            <span>${esc(modelLbl)}</span>
            <span class="ai-card-sub-dot"></span>
            <span>${a.maxWords || 100} palavras máx</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px" onclick="event.stopPropagation()">
          <span class="ai-status-badge ${isActive?'on':'off'}">${isActive?'ATIVO':'INATIVO'}</span>
          <label class="ai-switch" title="${isActive?'Desativar agente':'Ativar agente'}">
            <input type="checkbox" ${isActive?'checked':''} onchange="toggleAiAgent('${esc(a.id)}')"/>
            <span class="ai-switch-slider"></span>
          </label>
        </div>
      </div>
      ${a.description ? `<div class="ai-card-desc">${esc(a.description)}</div>` : ''}
      <div class="ai-card-tags">${modePill}${channels}${moreChannels}</div>
      <div class="ai-card-foot">
        <span><strong>${(a.totalRuns||0).toLocaleString('pt-BR')}</strong> execuções</span>
        <span><strong>${tokensFmt}</strong> tokens</span>
      </div>
    </div>`
}


async function toggleAiAgent(id) {
  try {
    await apiAi('/' + id + '/toggle', { method: 'POST' })
    await loadAiAgents()
    showToast('Status atualizado', 'success')
  } catch(e) {
    showToast(e?.message || 'Erro', 'error')
  }
}


function openAiApiKeyModal() {
  const html = `
    <div id="ai-key-modal-backdrop" class="ai-modal-bd" onclick="if(event.target===this)closeAiKeyModal()">
      <div class="ai-modal" style="max-width:520px">
        <div class="ai-modal-head">
          <h3 class="ai-modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
            API Key Anthropic
          </h3>
          <button onclick="closeAiKeyModal()" class="ai-modal-close" aria-label="Fechar"><svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div class="ai-modal-body">
          <p class="ai-key-help">
            A chave fica criptografada e é usada apenas para chamadas dos agentes deste workspace.<br>
            Obter em <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a> →
            Settings → API Keys → Create Key.
          </p>
          <input type="password" id="ai-api-key-input" class="ai-key-input" placeholder="sk-ant-api03-..." autocomplete="off" autofocus/>
        </div>
        <div class="ai-modal-foot">
          <div class="ai-modal-foot-left">
            ${S.aiApiKeyConfigured ? `<button onclick="saveAiApiKey(true)" class="bc-btn bc-btn-ghost" style="color:#dc2626">Remover chave</button>` : ''}
          </div>
          <div class="ai-modal-foot-right">
            <button onclick="closeAiKeyModal()" class="bc-btn bc-btn-secondary">Cancelar</button>
            <button onclick="saveAiApiKey(false)" class="bc-btn bc-btn-primary">Salvar</button>
          </div>
        </div>
      </div>
    </div>`
  const root = document.createElement('div')
  root.id = 'ai-key-modal-root'
  root.innerHTML = html
  document.body.appendChild(root)
  setTimeout(() => document.getElementById('ai-api-key-input')?.focus(), 50)
}


function closeAiKeyModal() { document.getElementById('ai-key-modal-root')?.remove() }


async function saveAiApiKey(remove) {
  const value = remove ? '' : (document.getElementById('ai-api-key-input')?.value || '').trim()
  if (!remove && !value) { showToast('Informe a API key', 'error'); return }
  try {
    await apiAi('/api-key', { method: 'PUT', body: { apiKey: value || null } })
    closeAiKeyModal()
    await loadAiAgents()
    showToast(remove ? 'Chave removida' : 'Chave salva', 'success')
  } catch(e) {
    showToast(e?.message || 'Erro', 'error')
  }
}


function openAiAgentModal(agentId) {
  const editing = agentId
    ? (S.aiAgents || []).find(a => a.id === agentId) || null
    : {
        name: '', description: '', status: 'inactive',
        attendanceType: 'client', channels: ['whatsapp'],
        systemPrompt: AI_PROMPT_TEMPLATES.geral,
        tone: 'friendly', maxWords: 100,
        guidelines: '',
        model: 'claude-haiku-4-5', temperature: 0.7,
        mode: 'suggested',
        fallbackAction: 'forward_human', fallbackMessage: '',
        contextMessagesLimit: 10,
      }
  S.aiAgentEditing = JSON.parse(JSON.stringify(editing || {}))
  S.aiAgentTestText = ''
  S.aiAgentTestReply = null
  S.aiAgentTestChat = []
  S.aiAgentRuns = []
  S.aiAgentModalTab = 'config'
  renderAiAgentModal()
  // Carrega histórico se editando
  if (agentId) loadAiAgentRuns(agentId)
}


async function loadAiAgentRuns(agentId) {
  try {
    S.aiAgentRuns = await apiAi('/' + agentId + '/runs?limit=20')
    renderAiAgentModal()
  } catch {}
}


async function aiModalActivate() {
  const a = S.aiAgentEditing
  if (!a || !a.id) return
  // Se há mudanças não salvas, avisa
  // (simplificação: apenas chama toggle direto)
  try {
    const r = await apiAi('/' + a.id + '/toggle', { method: 'POST' })
    // Atualiza state editing + lista
    S.aiAgentEditing.status = r.status
    const idx = S.aiAgents.findIndex(x => x.id === a.id)
    if (idx >= 0) S.aiAgents[idx] = { ...S.aiAgents[idx], status: r.status }
    if (typeof showToast === 'function') {
      showToast(r.status === 'active' ? '✓ Agente ATIVADO — agora responde inbounds' : 'Agente desativado')
    }
    renderAiAgentModal()
  } catch (e) {
    if (typeof showToast === 'function') showToast('Erro: ' + e.message, 'error')
    else alert('Erro: ' + e.message)
  }
}


function closeAiAgentModal() {
  S.aiAgentEditing = null
  document.getElementById('ai-agent-modal-root')?.remove()
}


function renderAiAgentModal() {
  const a = S.aiAgentEditing
  if (!a) return
  const isEdit = !!a.id
  const tab = S.aiAgentModalTab || 'config'

  const tabs = [
    { id: 'config', label: 'Configuração', icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>' },
    { id: 'test', label: 'Testar', disabled: !isEdit, icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>' },
    { id: 'logs', label: 'Histórico', disabled: !isEdit, icon: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>' },
  ]
  const tabBtns = tabs.map(t => `
    <button class="ai-modal-tab ${tab===t.id?'active':''} ${t.disabled?'disabled':''}"
      onclick="${t.disabled?`showToast('Salve o agente primeiro','error')`:`switchAiAgentTab('${t.id}')`}">
      ${t.icon}${t.label}
    </button>`).join('')

  let body = ''
  if (tab === 'config') body = renderAiAgentConfigTab(a)
  else if (tab === 'test') body = renderAiAgentTestTab(a)
  else if (tab === 'logs') body = renderAiAgentLogsTab(a)

  const html = `
    <div id="ai-agent-modal-backdrop" class="ai-modal-bd" onclick="if(event.target===this)closeAiAgentModal()">
      <div class="ai-modal">
        <div class="ai-modal-head">
          <h3 class="ai-modal-title">
            <span style="font-size:22px">🤖</span>
            ${isEdit ? esc(a.name || 'Editar agente') : 'Novo agente IA'}
          </h3>
          ${isEdit ? `
            <div class="ai-modal-activate" style="display:flex;align-items:center;gap:10px;margin-left:auto;margin-right:14px">
              <span class="ai-status-badge ${a.status==='active'?'on':'off'}">${a.status==='active'?'ATIVO':'INATIVO'}</span>
              <button onclick="aiModalActivate()" class="bc-btn ${a.status==='active'?'bc-btn-ghost':'bc-btn-primary'}" style="padding:7px 14px;font-size:12px;font-weight:700">
                ${a.status==='active'
                  ? `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6"/></svg> Desativar`
                  : `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Ativar agente`}
              </button>
            </div>` : ''}
          <button onclick="closeAiAgentModal()" class="ai-modal-close" aria-label="Fechar"><svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div class="ai-modal-tabs">${tabBtns}</div>
        <div class="ai-modal-body">${body}</div>
        ${tab === 'config' ? `
          <div class="ai-modal-foot">
            <div class="ai-modal-foot-left">
              ${isEdit ? `
                <button onclick="duplicateAiAgent('${esc(a.id)}')" class="bc-btn bc-btn-ghost" title="Duplicar agente">
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                  Duplicar
                </button>
                <button onclick="deleteAiAgent('${esc(a.id)}')" class="bc-btn bc-btn-ghost" style="color:#dc2626">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Excluir
              </button>` : ''}
            </div>
            <div class="ai-modal-foot-right">
              <button onclick="closeAiAgentModal()" class="bc-btn bc-btn-secondary">Cancelar</button>
              <button onclick="saveAiAgent()" class="bc-btn bc-btn-primary">${isEdit?'Salvar alterações':'Criar agente'}</button>
            </div>
          </div>` : ''}
      </div>
    </div>`
  let root = document.getElementById('ai-agent-modal-root')
  // Preserva scroll do body e foco do elemento ativo antes do rebuild
  const oldBody = root?.querySelector('.ai-modal-body')
  const savedScroll = oldBody ? oldBody.scrollTop : 0
  const focusedEl = document.activeElement
  const focusedId = focusedEl?.id || null
  const isInputLike = focusedEl && (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA')
  const savedSelStart = isInputLike ? focusedEl.selectionStart : null
  const savedSelEnd   = isInputLike ? focusedEl.selectionEnd   : null
  const savedValue    = isInputLike ? focusedEl.value : null

  if (!root) { root = document.createElement('div'); root.id = 'ai-agent-modal-root'; document.body.appendChild(root) }
  root.innerHTML = html

  // Restaura scroll do body
  const newBody = root.querySelector('.ai-modal-body')
  if (newBody) newBody.scrollTop = savedScroll
  // Restaura foco e seleção se o elemento (por id) ainda existe
  if (focusedId) {
    const newFocus = document.getElementById(focusedId)
    if (newFocus) {
      try { newFocus.focus({ preventScroll: true }) } catch { try { newFocus.focus() } catch {} }
      if (isInputLike && savedValue !== null && newFocus.value !== savedValue) {
        // Usuário pode ter digitado — não sobrescreve, mas tenta restaurar seleção
      }
      if (savedSelStart !== null && (newFocus.tagName === 'INPUT' || newFocus.tagName === 'TEXTAREA')) {
        try { newFocus.setSelectionRange(savedSelStart, savedSelEnd) } catch {}
      }
    }
  }
}


function switchAiAgentTab(t) { S.aiAgentModalTab = t; renderAiAgentModal() }


function renderAiAgentConfigTab(a) {
  // garantir trigger_config
  if (!a.triggerConfig) a.triggerConfig = {}
  const tc = a.triggerConfig
  if (!tc.workingHours) tc.workingHours = { enabled: false, days: [1,2,3,4,5], start: '09:00', end: '18:00' }
  if (!tc.workingHours.behaviorOutside) tc.workingHours.behaviorOutside = 'ai_assumes'
  if (!Array.isArray(tc.handoffKeywords)) tc.handoffKeywords = []
  if (!tc.triggers) tc.triggers = {}
  if (!tc.triggers.leadCreated) tc.triggers.leadCreated = { enabled: false }
  if (!tc.triggers.inboundKeyword) tc.triggers.inboundKeyword = { enabled: false, keywords: [] }
  if (!tc.triggers.inactiveHours) tc.triggers.inactiveHours = { enabled: false, hours: 24 }
  if (!tc.triggers.operatorSilence) tc.triggers.operatorSilence = { enabled: false, minutes: 30 }
  if (!tc.filters) tc.filters = { excludeAssigned: false, excludeTags: [], onlyStages: [] }
  if (!Array.isArray(tc.filters.excludeTags)) tc.filters.excludeTags = []
  if (!Array.isArray(tc.filters.onlyStages)) tc.filters.onlyStages = []
  if (!tc.followups) tc.followups = {
    enabled: false,
    steps: [
      { delayMinutes: 60,   tone: 'gentle' },
      { delayMinutes: 1440, tone: 'check_in' },
      { delayMinutes: 4320, tone: 'value_drop' },
      { delayMinutes: 10080, tone: 'last_chance' }
    ]
  }
  if (!Array.isArray(tc.followups.steps)) tc.followups.steps = []

  // Humanização — typing indicator + delay entre mensagens + debounce (dentro de triggerConfig pra não exigir migration)
  if (!tc.humanization) tc.humanization = { typingEnabled: false, delayEnabled: false, delaySeconds: 3, debounceEnabled: false, debounceSeconds: 6 }
  const hu = tc.humanization
  // Backfill de campos novos em agentes legados
  if (hu.debounceEnabled === undefined) hu.debounceEnabled = false
  if (hu.debounceSeconds === undefined) hu.debounceSeconds = 6

  const channelChecks = AI_CHANNELS.map(c => {
    const on = a.channels?.includes(c.value)
    return `<label class="ai-channel-chip${on?' on':''}"><input type="checkbox" ${on?'checked':''} onchange="toggleAiAgentChannel('${c.value}')">${esc(c.label)}</label>`
  }).join('')

  const tplBtns = Object.keys(AI_PROMPT_TEMPLATES).map(k =>
    `<button onclick="applyAiPromptTemplate('${k}')" class="ai-prompt-tpl-btn" type="button">${k}</button>`
  ).join('')

  const varChips = AI_LEAD_VARS.map(v =>
    `<span class="ai-var-chip" onclick="insertAiVar('${v.key}')" title="${esc(v.desc)} — clique para inserir">{{${v.key}}}</span>`
  ).join('')

  const dayChips = AI_DAYS.map(d => {
    const on = (tc.workingHours.days || []).includes(d.value)
    return `<button type="button" class="ai-day-chip${on?' on':''}" onclick="toggleAiDay(${d.value})">${d.label}</button>`
  }).join('')

  const kwChips = (tc.handoffKeywords || []).map((kw, i) =>
    `<span class="ai-kw-chip">${esc(kw)}<button type="button" class="ai-kw-chip-x" onclick="removeAiKw(${i})">×</button></span>`
  ).join('')

  // Mode radio cards
  const modeAuto = a.mode === 'auto'
  const modeRadio = `
    <div class="ai-radio-cards">
      <div class="ai-radio-card${!modeAuto?' on':''}" onclick="S.aiAgentEditing.mode='suggested';renderAiAgentModal()">
        <div class="ai-radio-card-head">
          <span class="ai-radio-card-ic"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg></span>
          Sugerido
        </div>
        <div class="ai-radio-card-desc">Operador revisa e aprova antes de enviar</div>
      </div>
      <div class="ai-radio-card${modeAuto?' on':''}" onclick="S.aiAgentEditing.mode='auto';renderAiAgentModal()">
        <div class="ai-radio-card-head">
          <span class="ai-radio-card-ic"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></span>
          Automático
        </div>
        <div class="ai-radio-card-desc">IA envia direto pro cliente sem aprovação</div>
      </div>
    </div>`

  return `
    <div class="ai-form">

      <!-- Identidade -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg></span>
          <div>
            <div class="ai-form-section-title">Identidade</div>
            <div class="ai-form-section-sub">Como o agente se chama e o que ele faz</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <div>
            <label class="form-label">Nome do agente *</label>
            <input class="form-input" value="${esc(a.name||'')}" oninput="S.aiAgentEditing.name = this.value" placeholder="Ex: Atendente de Vendas"/>
          </div>
          <div>
            <label class="form-label">Descrição (interna)</label>
            <input class="form-input" value="${esc(a.description||'')}" oninput="S.aiAgentEditing.description = this.value" placeholder="Para que serve este agente"/>
          </div>
        </div>
      </div>

      <!-- Atuação -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></span>
          <div>
            <div class="ai-form-section-title">Atuação</div>
            <div class="ai-form-section-sub">Onde e como o agente vai responder</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <div>
            <label class="form-label">Modo de resposta</label>
            ${modeRadio}
          </div>
          <div class="ai-row-2">
            <div>
              <label class="form-label">Tipo de atendimento</label>
              ${renderCDD({ id:'cdd-ai-attend', value: a.attendanceType||'client', options:[
                {value:'client', label:'Cliente externo'},
                {value:'internal', label:'Interno (equipe)'},
                {value:'both', label:'Ambos'},
              ], onchange:'S.aiAgentEditing.attendanceType=this.value;renderAiAgentModal()', cls:'ai-cdd' })}
            </div>
            <div>
              <label class="form-label">Modelo da IA</label>
              ${renderCDD({ id:'cdd-ai-model', value: a.model||'claude-haiku-4-5', options: AI_MODELS, onchange:'S.aiAgentEditing.model=this.value;renderAiAgentModal()', cls:'ai-cdd' })}
            </div>
          </div>
          <div>
            <label class="form-label">Canais</label>
            <div class="ai-channels-row">${channelChecks}</div>
          </div>
        </div>
      </div>

      <!-- Humanização -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg></span>
          <div>
            <div class="ai-form-section-title">Humanização</div>
            <div class="ai-form-section-sub">Faz a IA parecer mais natural ao responder</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${hu.typingEnabled?'on':''}">
              <input type="checkbox" ${hu.typingEnabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.humanization.typingEnabled = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Mostrar "digitando..."</strong>
            <span style="font-size:11px;color:var(--text-muted)">— exibe indicador antes de enviar a mensagem</span>
          </label>

          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${hu.delayEnabled?'on':''}">
              <input type="checkbox" ${hu.delayEnabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.humanization.delayEnabled = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Delay entre mensagens</strong>
            <span style="font-size:11px;color:var(--text-muted)">— pausa entre mensagens consecutivas (quando IA gera múltiplas)</span>
          </label>
          ${hu.delayEnabled ? `
          <div style="margin-left:36px">
            <input type="number" class="form-input" style="max-width:160px" value="${hu.delaySeconds||3}" min="1" max="30" oninput="S.aiAgentEditing.triggerConfig.humanization.delaySeconds = parseInt(this.value)||3"/>
            <div class="ai-field-hint">Segundos de pausa entre cada mensagem (1–30s). Ideal: 2–5s pra parecer humano.</div>
          </div>` : ''}

          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${hu.debounceEnabled?'on':''}">
              <input type="checkbox" ${hu.debounceEnabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.humanization.debounceEnabled = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Aguardar lead terminar de digitar</strong>
            <span style="font-size:11px;color:var(--text-muted)">— junta mensagens em rajada e responde 1× só</span>
          </label>
          ${hu.debounceEnabled ? `
          <div style="margin-left:36px">
            <input type="number" class="form-input" style="max-width:160px" value="${hu.debounceSeconds||6}" min="2" max="30" oninput="S.aiAgentEditing.triggerConfig.humanization.debounceSeconds = parseInt(this.value)||6"/>
            <div class="ai-field-hint">Tempo máximo de espera durante rajada (2–30s, padrão 6s). Mensagens isoladas após pausa de 15s+ respondem em 2s automaticamente.</div>
          </div>` : ''}
        </div>
      </div>

      <!-- Comportamento -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5h2m-1 0v14m4-14h-3m-7 0h3M7 5l1 14m9 0l1-14"/></svg></span>
          <div>
            <div class="ai-form-section-title">Comportamento</div>
            <div class="ai-form-section-sub">Personalidade, prompt e tom de voz</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:8px">
              <label class="form-label" style="margin:0">System prompt *</label>
              <div class="ai-prompt-tpl">
                <span style="font-size:11px;color:var(--text-muted);margin-right:4px">Template:</span>${tplBtns}
              </div>
            </div>
            <textarea id="ai-prompt-textarea" class="form-input" style="min-height:180px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;line-height:1.6" oninput="S.aiAgentEditing.systemPrompt = this.value" placeholder="Você é um atendente...">${esc(a.systemPrompt||'')}</textarea>
            <div class="ai-field-hint">
              💡 Use variáveis para personalizar:
              <div class="ai-vars-row">${varChips}</div>
            </div>
          </div>
          <div class="ai-row-3">
            <div>
              <label class="form-label">Tom de voz</label>
              ${renderCDD({ id:'cdd-ai-tone', value: a.tone||'friendly', options: AI_TONES, onchange:'S.aiAgentEditing.tone=this.value;renderAiAgentModal()', cls:'ai-cdd' })}
            </div>
            <div>
              <label class="form-label">Máx. palavras</label>
              <input type="number" class="form-input" value="${a.maxWords||100}" min="20" max="500" oninput="S.aiAgentEditing.maxWords = parseInt(this.value)||100"/>
            </div>
            <div>
              <label class="form-label">Temperatura</label>
              <input type="number" class="form-input" value="${a.temperature||0.7}" min="0" max="1" step="0.1" oninput="S.aiAgentEditing.temperature = parseFloat(this.value)||0.7"/>
              <div class="ai-field-hint">0=previsível · 1=criativo</div>
            </div>
          </div>
          <div>
            <label class="form-label">Diretrizes adicionais (opcional)</label>
            <textarea class="form-input" style="min-height:60px" oninput="S.aiAgentEditing.guidelines = this.value" placeholder="Ex: Foco em planos premium. Não dê desconto sem aprovação.">${esc(a.guidelines||'')}</textarea>
          </div>
          <div>
            <label class="form-label">Memória de contexto <span style="font-weight:400;color:var(--text-muted);font-size:11px">(últimas N mensagens enviadas pra IA)</span></label>
            <input type="number" class="form-input" style="max-width:200px" value="${a.contextMessagesLimit||30}" min="5" max="100" oninput="S.aiAgentEditing.contextMessagesLimit = parseInt(this.value)||30"/>
            <div class="ai-field-hint">Quantas mensagens passadas a IA recebe pra entender o contexto. Padrão: 30. Aumente (40-50) se a conversa é longa e a IA está repetindo perguntas.</div>
          </div>
        </div>
      </div>

      <!-- Disponibilidade -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></span>
          <div>
            <div class="ai-form-section-title">Disponibilidade</div>
            <div class="ai-form-section-sub">Quando o agente deve responder</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <div>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
              <span class="ai-switch ${tc.workingHours.enabled?'on':''}">
                <input type="checkbox" ${tc.workingHours.enabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.workingHours.enabled = this.checked; renderAiAgentModal()">
                <span class="ai-switch-track"></span>
                <span class="ai-switch-thumb"></span>
              </span>
              <strong>Limitar a horário comercial</strong>
              <span style="font-size:11px;color:var(--text-muted)">(fora desse horário, encaminha pra humano)</span>
            </label>
          </div>
          ${tc.workingHours.enabled ? `
          <div>
            <label class="form-label">Dias ativos</label>
            <div class="ai-days-row">${dayChips}</div>
          </div>
          <div class="ai-row-2">
            <div>
              <label class="form-label">Início</label>
              <input type="time" class="form-input" value="${esc(tc.workingHours.start||'09:00')}" oninput="S.aiAgentEditing.triggerConfig.workingHours.start = this.value"/>
            </div>
            <div>
              <label class="form-label">Fim</label>
              <input type="time" class="form-input" value="${esc(tc.workingHours.end||'18:00')}" oninput="S.aiAgentEditing.triggerConfig.workingHours.end = this.value"/>
            </div>
          </div>
          <div>
            <label class="form-label">Fora do horário</label>
            <select class="form-input" onchange="S.aiAgentEditing.triggerConfig.workingHours.behaviorOutside = this.value">
              <option value="ai_assumes" ${tc.workingHours.behaviorOutside==='ai_assumes'?'selected':''}>IA assume (atende fora do horário humano)</option>
              <option value="no_ai" ${tc.workingHours.behaviorOutside==='no_ai'?'selected':''}>Não responde (deixa pra humano no próximo dia útil)</option>
            </select>
            <div class="ai-field-hint">No primeiro caso a IA cobre o expediente; no segundo, fica em silêncio.</div>
          </div>` : ''}
        </div>
      </div>

      <!-- Gatilhos -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></span>
          <div>
            <div class="ai-form-section-title">Quando ativar</div>
            <div class="ai-form-section-sub">Defina exatamente quando a IA deve responder</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${tc.triggers.leadCreated.enabled?'on':''}">
              <input type="checkbox" ${tc.triggers.leadCreated.enabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.triggers.leadCreated.enabled = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Lead novo</strong>
            <span style="font-size:11px;color:var(--text-muted)">— responde quando lead é criado / primeira mensagem</span>
          </label>

          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${tc.triggers.inboundKeyword.enabled?'on':''}">
              <input type="checkbox" ${tc.triggers.inboundKeyword.enabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.triggers.inboundKeyword.enabled = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Palavras-chave</strong>
            <span style="font-size:11px;color:var(--text-muted)">— ativa só quando o lead disser uma destas palavras</span>
          </label>
          ${tc.triggers.inboundKeyword.enabled ? `
          <div style="margin-left:36px">
            <div class="ai-kws-input-wrap">
              ${(tc.triggers.inboundKeyword.keywords||[]).map((kw,i)=>`<span class="ai-kw-chip">${esc(kw)}<button type="button" class="ai-kw-chip-x" onclick="removeAiTriggerKw(${i})">×</button></span>`).join('')}
              <input type="text" class="ai-kw-input" placeholder="Ex: orçamento, preço, info..." onkeydown="handleAiTriggerKwKey(event)"/>
            </div>
            <div class="ai-field-hint">Enter para adicionar. Match parcial (case-insensitive).</div>
          </div>` : ''}

          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${tc.triggers.inactiveHours.enabled?'on':''}">
              <input type="checkbox" ${tc.triggers.inactiveHours.enabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.triggers.inactiveHours.enabled = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Lead inativo há X horas</strong>
            <span style="font-size:11px;color:var(--text-muted)">— operador não responde há tempo, IA assume</span>
          </label>
          ${tc.triggers.inactiveHours.enabled ? `
          <div style="margin-left:36px">
            <input type="number" class="form-input" style="max-width:160px" value="${tc.triggers.inactiveHours.hours||24}" min="1" max="720" oninput="S.aiAgentEditing.triggerConfig.triggers.inactiveHours.hours = parseInt(this.value)||24"/>
            <div class="ai-field-hint">Horas sem resposta humana antes da IA assumir.</div>
          </div>` : ''}

          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${tc.triggers.operatorSilence.enabled?'on':''}">
              <input type="checkbox" ${tc.triggers.operatorSilence.enabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.triggers.operatorSilence.enabled = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Silêncio do operador (min)</strong>
            <span style="font-size:11px;color:var(--text-muted)">— operador parou de responder há X min, IA assume</span>
          </label>
          ${tc.triggers.operatorSilence.enabled ? `
          <div style="margin-left:36px">
            <input type="number" class="form-input" style="max-width:160px" value="${tc.triggers.operatorSilence.minutes||30}" min="1" max="600" oninput="S.aiAgentEditing.triggerConfig.triggers.operatorSilence.minutes = parseInt(this.value)||30"/>
            <div class="ai-field-hint">Minutos de silêncio do operador antes da IA cobrir.</div>
          </div>` : ''}
        </div>
      </div>

      <!-- Filtros -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg></span>
          <div>
            <div class="ai-form-section-title">Filtros (não atender)</div>
            <div class="ai-form-section-sub">Quando NÃO ativar mesmo se um gatilho bater</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${tc.filters.excludeAssigned?'on':''}">
              <input type="checkbox" ${tc.filters.excludeAssigned?'checked':''} onchange="S.aiAgentEditing.triggerConfig.filters.excludeAssigned = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Não atender lead já atribuído</strong>
            <span style="font-size:11px;color:var(--text-muted)">— se tem operador responsável, IA fica fora</span>
          </label>

          <div>
            <label class="form-label">Tags excluídas</label>
            <div class="ai-kws-input-wrap">
              ${(tc.filters.excludeTags||[]).map((tag,i)=>`<span class="ai-kw-chip">${esc(tag)}<button type="button" class="ai-kw-chip-x" onclick="removeAiExcludeTag(${i})">×</button></span>`).join('')}
              <input type="text" class="ai-kw-input" placeholder="Ex: vip, ja-cliente..." onkeydown="handleAiExcludeTagKey(event)"/>
            </div>
            <div class="ai-field-hint">Leads com qualquer destas tags são ignorados pela IA.</div>
          </div>
        </div>
      </div>

      <!-- Follow-up automático -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></span>
          <div>
            <div class="ai-form-section-title">Follow-up automático</div>
            <div class="ai-form-section-sub">Reabordagens quando o lead não responde</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text-primary)">
            <span class="ai-switch ${tc.followups.enabled?'on':''}">
              <input type="checkbox" ${tc.followups.enabled?'checked':''} onchange="S.aiAgentEditing.triggerConfig.followups.enabled = this.checked; renderAiAgentModal()">
              <span class="ai-switch-track"></span>
              <span class="ai-switch-thumb"></span>
            </span>
            <strong>Ativar follow-up</strong>
            <span style="font-size:11px;color:var(--text-muted)">— a IA reaborda se o lead silenciar</span>
          </label>

          ${tc.followups.enabled ? `
          <div class="ai-followup-steps" style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
            ${(tc.followups.steps||[]).map((step,i)=>`
              <div class="ai-fu-step" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
                <span style="font-size:11px;font-weight:700;color:var(--text-muted);min-width:34px;text-align:center;background:var(--surface-2);border-radius:6px;padding:3px 0">#${i+1}</span>
                <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
                  <label style="font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Após</label>
                  <input type="number" min="5" max="43200" value="${step.delayMinutes||60}" style="width:90px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:12px" oninput="S.aiAgentEditing.triggerConfig.followups.steps[${i}].delayMinutes = parseInt(this.value)||60"/>
                </div>
                <span style="font-size:11px;color:var(--text-muted)">min &nbsp;(${esc(_fuFmtMin(step.delayMinutes||60))})</span>
                <div style="display:flex;flex-direction:column;gap:2px;flex:1;margin-left:8px;min-width:0">
                  <label style="font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Tom</label>
                  <select style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:12px;background:var(--surface)" onchange="S.aiAgentEditing.triggerConfig.followups.steps[${i}].tone = this.value">
                    <option value="gentle"      ${step.tone==='gentle'?'selected':''}>Leve · "tudo certo?"</option>
                    <option value="check_in"    ${step.tone==='check_in'?'selected':''}>Check-in · oferece ajuda</option>
                    <option value="value_drop"  ${step.tone==='value_drop'?'selected':''}>Lembrete de valor · benefício</option>
                    <option value="last_chance" ${step.tone==='last_chance'?'selected':''}>Última tentativa · saída digna</option>
                  </select>
                </div>
                <button type="button" onclick="removeAiFuStep(${i})" title="Remover" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:6px;border-radius:6px;display:inline-flex">
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            `).join('')}
            <button type="button" onclick="addAiFuStep()" style="padding:8px 12px;border:1px dashed var(--border-2);border-radius:8px;background:transparent;color:var(--text-secondary);font-size:12px;cursor:pointer;font-family:inherit">+ Adicionar passo</button>
            <div class="ai-field-hint" style="margin-top:4px">
              ⚠️ Follow-ups são cancelados automaticamente quando o lead responde, quando você assume manualmente, ou se o agente ficar inativo.
            </div>
          </div>` : ''}
        </div>
      </div>

      <!-- Handoff e Limites -->
      <div class="ai-form-section">
        <div class="ai-form-section-head">
          <span class="ai-form-section-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 17l-4 4m0 0l-4-4m4 4V3"/></svg></span>
          <div>
            <div class="ai-form-section-title">Transferência para humano</div>
            <div class="ai-form-section-sub">Quando o agente deve passar pra um operador</div>
          </div>
        </div>
        <div class="ai-form" style="gap:12px">
          <div>
            <label class="form-label">Palavras-chave que ativam handoff</label>
            <div class="ai-kws-input-wrap">
              ${kwChips}
              <input type="text" class="ai-kw-input" placeholder="Ex: humano, atendente, falar com pessoa..." onkeydown="handleAiKwKey(event)"/>
            </div>
            <div class="ai-field-hint">Pressione Enter para adicionar. Se a mensagem do cliente contiver alguma palavra, transfere pra humano imediatamente.</div>
          </div>
          <div class="ai-row-2">
            <div>
              <label class="form-label">Máx. respostas por conversa</label>
              <input type="number" class="form-input" value="${tc.maxRepliesPerConversation || 0}" min="0" max="100" oninput="S.aiAgentEditing.triggerConfig.maxRepliesPerConversation = parseInt(this.value)||0"/>
              <div class="ai-field-hint">0 = sem limite. Após este número, transfere pra humano.</div>
            </div>
            <div>
              <label class="form-label">Quando IA falhar</label>
              ${renderCDD({ id:'cdd-ai-fallback', value: a.fallbackAction||'forward_human', options:[
                {value:'forward_human', label:'Transferir para humano'},
                {value:'send_default', label:'Enviar mensagem padrão'},
              ], onchange:'S.aiAgentEditing.fallbackAction=this.value;renderAiAgentModal()', cls:'ai-cdd' })}
            </div>
          </div>
          <div>
            <label class="form-label">Mensagem de fallback / handoff</label>
            <input class="form-input" value="${esc(a.fallbackMessage||'')}" oninput="S.aiAgentEditing.fallbackMessage = this.value" placeholder="Ex: Vou transferir você para um atendente humano. Aguarde um momento."/>
            <div class="ai-field-hint">Enviada quando o agente transferir ou falhar.</div>
          </div>
        </div>
      </div>

      <!-- Avançado -->
      <details>
        <summary style="cursor:pointer;font-size:13px;color:var(--text-secondary);font-weight:600;padding:8px 12px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);user-select:none;list-style:none">
          <span style="display:inline-flex;align-items:center;gap:8px">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
            Configurações avançadas
          </span>
        </summary>
        <div class="ai-form-section" style="margin-top:8px">
          <div class="ai-form" style="gap:12px">
            <div>
              <label class="form-label">Histórico no contexto (mensagens)</label>
              <input type="number" class="form-input" value="${a.contextMessagesLimit||10}" min="0" max="50" oninput="S.aiAgentEditing.contextMessagesLimit = parseInt(this.value)||10"/>
              <div class="ai-field-hint">Quantas mensagens anteriores enviar pra IA como contexto da conversa.</div>
            </div>
          </div>
        </div>
      </details>

    </div>`
}


function insertAiVar(varName) {
  const ta = document.getElementById('ai-prompt-textarea')
  if (!ta) return
  const v = '{{' + varName + '}}'
  const start = ta.selectionStart, end = ta.selectionEnd
  const val = ta.value
  const newVal = val.slice(0, start) + v + val.slice(end)
  ta.value = newVal
  S.aiAgentEditing.systemPrompt = newVal
  ta.focus()
  ta.setSelectionRange(start + v.length, start + v.length)
}


function toggleAiDay(d) {
  const wh = S.aiAgentEditing.triggerConfig?.workingHours
  if (!wh) return
  if (!Array.isArray(wh.days)) wh.days = []
  wh.days = wh.days.includes(d) ? wh.days.filter(x => x !== d) : [...wh.days, d].sort()
  renderAiAgentModal()
}


function handleAiKwKey(ev) {
  if (ev.key === 'Enter' || ev.key === ',') {
    ev.preventDefault()
    const v = (ev.target.value || '').trim().replace(/,$/, '')
    if (!v) return
    const tc = S.aiAgentEditing.triggerConfig
    if (!Array.isArray(tc.handoffKeywords)) tc.handoffKeywords = []
    if (!tc.handoffKeywords.includes(v)) {
      tc.handoffKeywords.push(v)
      ev.target.value = ''
      renderAiAgentModal()
    } else {
      ev.target.value = ''
    }
  }
}


function _fuFmtMin(m) {
  const n = parseInt(m, 10) || 0
  if (n < 60) return n + 'min'
  if (n < 1440) return (n/60).toFixed(n%60===0?0:1) + 'h'
  return Math.round(n/1440) + 'd'
}


function addAiFuStep() {
  const fu = S.aiAgentEditing.triggerConfig.followups
  if (!Array.isArray(fu.steps)) fu.steps = []
  // Calcula próximo delay sugerido (último * 2 ou 60 default)
  const last = fu.steps[fu.steps.length-1]
  const nextDelay = last ? Math.min(43200, last.delayMinutes * 2) : 60
  const nextTone = last && last.tone === 'last_chance' ? 'last_chance' : (
    last?.tone === 'value_drop' ? 'last_chance' :
    last?.tone === 'check_in' ? 'value_drop' :
    last?.tone === 'gentle' ? 'check_in' : 'gentle'
  )
  fu.steps.push({ delayMinutes: nextDelay, tone: nextTone })
  renderAiAgentModal()
}


function removeAiFuStep(idx) {
  const fu = S.aiAgentEditing.triggerConfig.followups
  if (!Array.isArray(fu.steps)) return
  fu.steps.splice(idx, 1)
  renderAiAgentModal()
}


function handleAiTriggerKwKey(ev) {
  if (ev.key === 'Enter' || ev.key === ',') {
    ev.preventDefault()
    const v = (ev.target.value || '').trim().replace(/,$/, '')
    if (!v) return
    const tk = S.aiAgentEditing.triggerConfig.triggers.inboundKeyword
    if (!Array.isArray(tk.keywords)) tk.keywords = []
    if (!tk.keywords.includes(v)) {
      tk.keywords.push(v)
      ev.target.value = ''
      renderAiAgentModal()
    } else { ev.target.value = '' }
  }
}

function removeAiTriggerKw(idx) {
  const tk = S.aiAgentEditing.triggerConfig.triggers.inboundKeyword
  if (!Array.isArray(tk.keywords)) return
  tk.keywords.splice(idx, 1)
  renderAiAgentModal()
}

function handleAiExcludeTagKey(ev) {
  if (ev.key === 'Enter' || ev.key === ',') {
    ev.preventDefault()
    const v = (ev.target.value || '').trim().replace(/,$/, '')
    if (!v) return
    const f = S.aiAgentEditing.triggerConfig.filters
    if (!Array.isArray(f.excludeTags)) f.excludeTags = []
    if (!f.excludeTags.includes(v)) {
      f.excludeTags.push(v)
      ev.target.value = ''
      renderAiAgentModal()
    } else { ev.target.value = '' }
  }
}

function removeAiExcludeTag(idx) {
  const f = S.aiAgentEditing.triggerConfig.filters
  if (!Array.isArray(f.excludeTags)) return
  f.excludeTags.splice(idx, 1)
  renderAiAgentModal()
}


function removeAiKw(idx) {
  const tc = S.aiAgentEditing.triggerConfig
  if (!Array.isArray(tc.handoffKeywords)) return
  tc.handoffKeywords.splice(idx, 1)
  renderAiAgentModal()
}


function toggleAiAgentChannel(ch) {
  const cur = S.aiAgentEditing.channels || []
  S.aiAgentEditing.channels = cur.includes(ch) ? cur.filter(c=>c!==ch) : [...cur, ch]
  renderAiAgentModal()
}

function applyAiPromptTemplate(key) {
  S.aiAgentEditing.systemPrompt = AI_PROMPT_TEMPLATES[key] || ''
  renderAiAgentModal()
}


function renderAiAgentTestTab(a) {
  const chat = S.aiAgentTestChat || []
  const userText = S.aiAgentTestText || ''
  const loading = !!S.aiAgentTestLoading

  const chatHtml = chat.length === 0
    ? `<div class="ai-chat-empty">
         💬 Inicie uma conversa de teste<br>
         <span style="font-size:11px;color:var(--text-muted)">As mensagens não afetam clientes reais.</span>
       </div>`
    : chat.map(m => {
        if (m.role === 'user') {
          return `<div class="ai-chat-msg user"><div><div class="ai-chat-msg-bubble">${esc(m.content)}</div></div></div>`
        }
        const meta = m.usage ? `${m.usage.input_tokens||0}+${m.usage.output_tokens||0} tk · ${m.latencyMs||0}ms` : ''
        // Split por --- em linha própria → cada parte vira uma bubble separada (igual WhatsApp)
        const parts = _splitAiBubbles(m.content)
        const bubbles = parts.map((p, i) => {
          const isLast = i === parts.length - 1
          return `<div class="ai-chat-msg bot"><div>
            <div class="ai-chat-msg-bubble">${esc(p)}</div>
            ${isLast && meta ? `<div class="ai-chat-msg-meta">${meta}</div>` : ''}
          </div></div>`
        }).join('')
        return bubbles
      }).join('')

  return `
    <div class="ai-form">
      <div class="ai-test-info">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Teste o agente em uma conversa multi-turno. Use as configurações já salvas. ${chat.length > 0 ? `<button onclick="clearAiAgentChat()" class="ai-chat-clear" style="margin-left:auto">🗑 Limpar conversa</button>` : ''}
      </div>

      <div class="ai-chat-window" id="ai-chat-scroll">
        ${chatHtml}
        ${loading ? `<div class="ai-chat-msg bot"><div><div class="ai-chat-msg-bubble" style="background:var(--accent-soft);color:var(--accent)"><svg style="animation:spin 0.8s linear infinite;width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Pensando...</div></div></div>` : ''}
      </div>

      <div class="ai-chat-input-row">
        <textarea id="ai-test-input" class="form-input" placeholder="Digite a mensagem do cliente..." onkeydown="handleAiTestKey(event, '${esc(a.id)}')" oninput="S.aiAgentTestText = this.value">${esc(userText)}</textarea>
        <button onclick="runAiAgentTest('${esc(a.id)}')" class="bc-btn bc-btn-primary" ${loading?'disabled':''}>
          ${loading ? '⏳' : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Enviar`}
        </button>
      </div>
    </div>`
}


function handleAiTestKey(ev, agentId) {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault()
    runAiAgentTest(agentId)
  }
}


function clearAiAgentChat() {
  S.aiAgentTestChat = []
  S.aiAgentTestText = ''
  renderAiAgentModal()
}


function _splitAiBubbles(text) {
  if (!text) return ['']
  // Separa por --- em linha própria (com espaços ao redor opcionais)
  const parts = String(text).split(/\n?\s*---\s*\n?/g)
    .map(p => p.trim())
    .filter(p => p.length > 0)
  return parts.length ? parts : [String(text)]
}


async function runAiAgentTest(agentId) {
  const text = (S.aiAgentTestText||'').trim()
  if (!text) { showToast('Digite a mensagem de teste', 'error'); return }
  if (!Array.isArray(S.aiAgentTestChat)) S.aiAgentTestChat = []

  // Adiciona msg do usuário no chat
  S.aiAgentTestChat.push({ role: 'user', content: text })
  S.aiAgentTestText = ''
  S.aiAgentTestLoading = true
  renderAiAgentModal()
  setTimeout(() => {
    const sc = document.getElementById('ai-chat-scroll')
    if (sc) sc.scrollTop = sc.scrollHeight
  }, 30)

  try {
    // Envia histórico ANTES de adicionar a msg atual (a msg user já foi push'd, então pula a última)
    const history = (S.aiAgentTestChat || []).slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    const r = await apiAi('/' + agentId + '/test', { method: 'POST', body: { text, history } })
    S.aiAgentTestChat.push({
      role: 'assistant',
      content: r.replyText || '(sem resposta)',
      usage: r.usage,
      latencyMs: r.latencyMs,
      model: r.model,
    })
  } catch(e) {
    S.aiAgentTestChat.push({
      role: 'assistant',
      content: '⚠ Erro: ' + (e?.message || 'falha desconhecida'),
      error: true,
    })
  } finally {
    S.aiAgentTestLoading = false
    renderAiAgentModal()
    setTimeout(() => {
      const sc = document.getElementById('ai-chat-scroll')
      if (sc) sc.scrollTop = sc.scrollHeight
      const inp = document.getElementById('ai-test-input')
      if (inp) inp.focus()
    }, 50)
  }
}


function renderAiAgentLogsTab(a) {
  const runs = S.aiAgentRuns || []
  if (!runs.length) {
    return `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:42px;margin-bottom:8px;opacity:0.4">📋</div>
        <div style="font-family:'Bricolage Grotesque',serif;font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Nenhuma execução registrada</div>
        <div style="font-size:13px">As execuções deste agente aparecerão aqui.</div>
      </div>`
  }
  return `
    <div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Últimas ${runs.length} execuções</div>
      ${runs.map(r => {
        const statusCls = r.status === 'failed' ? 'fail' : (r.status === 'sent' || r.status === 'success' ? 'ok' : 'suggested')
        const statusText = r.status === 'failed' ? '❌ Falhou' : (r.status === 'sent' ? '✓ Enviado' : (r.status === 'suggested' ? '💡 Sugerido' : (r.status === 'success' ? '✓ Sucesso' : r.status)))
        return `
          <div class="ai-log-row">
            <div class="ai-log-head">
              <span class="ai-log-status ${statusCls}">${statusText}</span>
              <span class="ai-log-meta">${esc(new Date(r.createdAt).toLocaleString('pt-BR'))} · ${r.totalTokens||0} tk · ${r.latencyMs||0}ms</span>
            </div>
            ${r.leadName ? `<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:6px">👤 ${esc(r.leadName)}</div>` : ''}
            ${r.userText ? `<div class="ai-log-msg user"><b>👤</b> ${esc(r.userText.slice(0,200))}${r.userText.length>200?'…':''}</div>` : ''}
            ${r.replyText ? `<div class="ai-log-msg bot"><b>🤖</b> ${esc(r.replyText.slice(0,300))}${r.replyText.length>300?'…':''}</div>` : ''}
            ${r.errorMessage ? `<div style="font-size:11.5px;color:#dc2626;margin-top:6px;padding:6px 10px;background:#fee2e2;border-radius:6px">⚠ ${esc(r.errorMessage)}</div>` : ''}
          </div>`
      }).join('')}
    </div>`
}


async function saveAiAgent() {
  const a = S.aiAgentEditing
  if (!a) return
  if (!a.name?.trim()) { showToast('Nome é obrigatório', 'error'); return }
  if (!a.systemPrompt?.trim()) { showToast('System prompt é obrigatório', 'error'); return }

  try {
    if (a.id) {
      await apiAi('/' + a.id, { method: 'PUT', body: a })
      showToast('Agente atualizado', 'success')
    } else {
      const created = await apiAi('/', { method: 'POST', body: a })
      showToast('Agente criado', 'success')
      S.aiAgentEditing = created
    }
    closeAiAgentModal()
    await loadAiAgents()
  } catch(e) {
    showToast(e?.message || 'Erro ao salvar', 'error')
  }
}


async function duplicateAiAgent(id) {
  try {
    const copy = await apiAi('/' + id + '/duplicate', { method: 'POST' })
    showToast('Agente duplicado: ' + copy.name, 'success')
    closeAiAgentModal()
    await loadAiAgents()
  } catch(e) {
    showToast(e?.message || 'Erro ao duplicar', 'error')
  }
}


async function deleteAiAgent(id) {
  if (!confirm('Excluir este agente? Histórico de execuções também será removido.')) return
  try {
    await apiAi('/' + id, { method: 'DELETE' })
    closeAiAgentModal()
    await loadAiAgents()
    showToast('Agente excluído', 'success')
  } catch(e) {
    showToast(e?.message || 'Erro', 'error')
  }
}




