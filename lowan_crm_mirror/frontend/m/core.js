// core.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

// ─── Config (também redeclarado no <script> inline pra retrocompat) ──────────
// Classic scripts não compartilham var top-level com inline; estes precisam
// existir em parse-time aqui porque getToken/getUser/S inicializer usam.
var API          = '/api/v1/leads'
var API_KANBAN   = '/api/v1/kanban'
var API_MODELS   = '/api/v1/models'
var KANBAN_PAGE  = 25
var INBOX_PAGE   = 40
var TOKEN_KEY    = 'leads_jwt'
var USER_KEY     = 'leads_user'

function apiAdmin(path, opts={}) { return api(path, opts) }

function apiKanban(path, opts={}) { return api(path, opts, API_KANBAN) }

function apiModels(path, opts={}) { return api(path, opts, API_MODELS) }
var API_AI = '/api/v1/ai-agents'

function apiAi(path, opts={}) { return api(path, opts, API_AI) }
var API_INTAKE = '/api/v1/intake'
var API_META_ADS = '/api/v1/meta-ads'
var API_PROXY_POOL = '/api/v1/admin/proxy-pool'

function apiMetaAds(path, opts={}) { return api(path, opts, API_META_ADS) }

function apiIntake(path, opts={}) { return api(path, opts, API_INTAKE) }

function apiProxyPool(path='', opts={}) { return api(path, opts, API_PROXY_POOL) }

// Helper resiliente: se localStorage estourar quota, limpa entradas de cache (crm_*)
// e tenta de novo. Caso permaneça falhando, retorna false sem quebrar o app.

function getToken() { return localStorage.getItem(TOKEN_KEY) }

function setToken(t) { _safeSetItem(TOKEN_KEY, t) }

function getUser()  { try { return JSON.parse(localStorage.getItem(USER_KEY)||'null') } catch { return null } }

function setUser(u) { _safeSetItem(USER_KEY, JSON.stringify(u)) }

function clearAuth() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) }


async function api(path, opts={}, base=API) {
  const token = getToken()
  const hasBody = opts.body != null
  // Auto-serializa body se for objeto puro (não string, não FormData, não Blob)
  const isPlainObj = hasBody && typeof opts.body === 'object'
    && !(opts.body instanceof FormData) && !(opts.body instanceof Blob)
    && !(opts.body instanceof ArrayBuffer) && !(opts.body instanceof URLSearchParams)
  const res = await fetch(base + path, {
    ...opts,
    body: isPlainObj ? JSON.stringify(opts.body) : opts.body,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers||{}),
    },
  })
  if (res.status === 401) {
    const e = await res.json().catch(()=>({}))
    const isAuthRoute = path.startsWith('/auth/')
    if (!isAuthRoute) { clearAuth(); go('login'); throw new Error('Sessão expirada') }
    throw new Error(e.message || 'Credenciais inválidas')
  }
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.message||e.error||`Erro ${res.status}`) }
  if (res.status===204) return null
  return res.json()
}

// ─── Estado ──────────────────────────────────────────────────────────────────
var S = {
  view: 'loading',   // loading | setup | login | workspace-select | leads | users
  me: getUser(),
  token: getToken(),
  workspaceSlug: localStorage.getItem('workspaceSlug') || '',
  workspaceName: localStorage.getItem('workspaceName') || '',

  // Workspace selection flow
  workspaces: [],
  userWorkspaces: [],    // workspaces disponíveis para trocar (quando logado)
  showWsSwitcher: false, // modal de troca de workspace
  wsSwitcherLoading: false, // loading state ao recarregar lista de workspaces
  pendingEmail: '',
  pendingPassword: '',
  loginStatus: '',   // mensagem progressiva durante o login

  leads: [],
  users: [],
  loading: false,
  leadsLoaded: false,   // true após primeira resposta bem-sucedida da API
  leadsTotal: 0,        // total de leads no servidor (para paginação server-side)
  leadsAggregates: null, // { byStage, sem_etapa } — contagens para os cards
  usersLoading: false,
  error: '',

  // Admin tabs
  adminTab: 'dashboard',  // 'dashboard' | 'leads' | 'inbox' | 'users' | 'connections' | 'settings'

  // Collaborator tabs
  collabTab: 'dashboard',  // 'dashboard' | 'leads' | 'inbox' | 'kanban'

  // Settings sub-tab
  settingsTab: 'equipe',  // 'equipe' | 'tags' | 'modelos'

  // Dashboard
  dashboard: null,
  dashboardLoading: false,
  dashboardPeriod: 'today',  // today/yesterday/7d/30d/60d/90d/6m/1y/all/custom
  dashboardCustomFrom: '',
  dashboardCustomTo: '',

  // Connections
  connView: 'list',  // 'list' | 'wizard' | 'templates'
  connTemplatesConn: null,
  connTemplatesList: [],
  connTemplatesLoading: false,
  connections: [],
  connLoading: false,
  connModal: null,      // 'delete' | 'detail'
  connSelectedId: null,
  connDetail: null,
  connDetailHealth: null,
  connDetailLoading: false,
  // Wizard
  wizardStep: 1,
  wizardEditId: null,
  wizardChecked: false,
  wizardCheckResult: null,
  wizardCheckLoading: false,
  connForm: {},
  connFormError: '',

  // Proxy pool (residencial IPs gerenciados em /admin/proxy-pool)
  proxyPool: [],
  proxyPoolLoading: false,
  proxyPoolLoadedAt: 0,

  // Unofficial connections (Baileys/WhatsApp Web)
  unofficialSessions: [],
  unofficialLoading: false,
  unofficialNewName: '',
  unofficialNewProxyUrl: '',
  unofficialNewProxyLabel: '',
  unofficialNewProxyCountry: '',
  unofficialQrPoll: null, // interval id
  connChannel: 'whatsapp', // tab selecionada: 'whatsapp' | 'unofficial' | 'telegram'
  avatarSession: null,       // sessão dedicada para foto de perfil (id: 'avatar-fetcher')
  avatarSessionLoaded: false, // true após primeira carga (mesmo que não exista sessão)
  avatarSessionLoading: false,
  avatarSessionQrPoll: null,

  // Telegram bots
  telegramBots: [],
  telegramLoading: false,
  telegramForm: null, // { name, botToken } | null
  telegramFormError: '',
  telegramChecking: {}, // { [id]: true } — bots sendo verificados

  // Leads filters
  filterStatus: 'todos',
  filterStage: 'todos',
  filterUser: 'todos',
  filterTags: [],  // array de tags ativas no filtro
  search: '',
  searchInput: '',  // valor digitado mas ainda não aplicado
  leadsPage: 0,     // página atual da tabela de leads
  // View "Bloqueados" — separada do filterStage normal, renderiza outra lista
  viewBlocked: false,
  blockedLeads: [],
  blockedLoaded: false,
  blockedLoading: false,

  // Modals
  modal: null,  // 'lead' | 'pegar' | 'delete_lead' | 'user' | 'delete_user'
  editId: null,
  form: {},
  formError: '',
  deleteTarget: null,
  deleteConversation: false,
  deleteLeadBlacklist: false, // checkbox blacklist ao apagar lead
  deleteConvTarget: null,   // leadId para apagar conversa
  deleteConvContact: false, // checkbox apagar contato também
  deleteConvBlacklist: false, // checkbox adicionar à blacklist

  // Import
  importLoading: false,
  importFile: null,
  importItems: [],

  // Conversation panel
  conversation: null,
  conversationLeadId: null,
  conversationLoading: false,
  // Nova conversa
  newConvModal: false,
  newConvLeadId: null,
  newConvConnId: '',
  newConvTemplates: [],
  newConvTemplate: null,
  newConvVars: [],
  newConvSending: false,
  replyText: '',
  replySending: false,
  audioRecording: false,   // gravando agora
  audioBlob: null,         // blob gravado aguardando envio
  audioDuration: 0,        // segundos gravados
  audioSending: false,     // enviando áudio
  imageFile: null,         // File selecionado/colado aguardando envio
  imagePreviewUrl: null,   // blob URL para preview
  imageCaption: '',        // legenda da imagem
  imageSending: false,     // enviando imagem
  // Chat avançado
  convConnId: null,       // conexão selecionada para envio
  convTemplates: [],      // templates aprovados do workspace
  convTemplatesLoaded: false,
  templatePicker: false,  // picker aberto
  templateSearch: '',     // filtro do picker
  convTemplate: null,     // template selecionado
  convTemplateVars: [],   // valores das variáveis
  _templateRenderedBody: '', // corpo renderizado do template selecionado (para detectar edição)
  detailsOpen: true,    // right panel in inbox layout
  detailTagInput: '',   // new tag being typed
  tagOptions: [],       // all known tags from DB for autocomplete

  // Bulk selection
  selected: new Set(),  // Set of lead IDs


  // Kanban
  kanban: null,         // pipeline com stages
  kanbanLoading: false,
  kanbanColLimits: {},    // colId → número de cards renderizados
  inboxListLimit: INBOX_PAGE,    // itens renderizados no sidebar (modo normal)
  inboxLeads: [],                // leads com mensagens (fonte exclusiva do painel Conversas)
  inboxSearchResults: null,      // null = não buscando; array = resultados do backend
  draggingLeadId: null,
  dragOverStageId: null,
  kanbanModal: null,    // null | 'add_stage' | 'edit_stage' | 'settings' | 'add_rule'
  stageForm: {},
  stageFormError: '',
  ruleForm: {},
  stageEditId: null,

  // Cache de preview da última mensagem por leadId
  msgPreviews: {},

  // AI Assist
  aiLoading: false,
  aiResult: null,   // { suggestedReply, classification, intention, nextStep }

  // Modelos (text/audio)
  textModels: [],
  audioModels: [],
  textModelsLoaded: false,
  audioModelsLoaded: false,
  modelSubTab: 'text',  // 'text' | 'audio'
  modelForm: null,      // null | objeto em edição
  modelFormSaving: false,
  // Gravação de áudio no painel de modelos
  modelAudioRec: false,     // gravando agora
  modelAudioBlob: null,     // blob gravado aguardando salvar
  modelAudioDuration: 0,    // segundos gravados
  modelAudioSaving: false,  // fazendo upload/salvando

  // Financeiro
  financialTypes: [],
  financialTypesLoaded: false,

  // Integrações (API keys + webhooks)
  apiKeys: [],
  outboundWebhooks: [],
  allowedEvents: [],
  integrationsLoaded: false,
  newKeyName: '',
  newKeyRevealed: null,
  newWebhookForm: null,
  webhookDeliveries: {},
  financialCommissions: [],
  financialLeadRecords: {},    // leadId → records[]
  financialLeadSummary: {},    // leadId → summary[]
  financialLeadOpen: {},       // leadId → bool (legacy, kept for compat)
  financialLeadFormOpen: {},   // leadId → bool
  financialLeadForm: {},       // leadId → {typeId, amount, description}
  financialRecDelConfirm: {},  // recordId → bool
  financialHistOpen: {},       // leadId → bool

  leadActivity: {},            // leadId → events[] (audit log)

  // Estatísticas
  statsPeriod: new Date().toISOString().slice(0, 7),
  statsRanking: [],
  statsGoals: [],
  statsAudit: [],
  statsTab: 'performance', // 'performance' | 'audit'
  statsLoading: false,
  statsGoalForm: null,
  statsGoalDelConfirm: {},
  _goalsEditMode: false,
  _auditFilter: { operator: '', type: '', deleted: 'all' },

  // Meta Templates (Configurações > Modelos > Templates Meta)
  metaTemplates: [],
  metaTemplatesLoaded: false,
  metaTemplateForm: null,
  metaTemplateSaving: false,
}

var STATUS = {
  disponivel:   { label:'Novo Lead',   cls:'bg-green-100 text-green-700 border-green-200' },
  pego:         { label:'Contato Iniciado',         cls:'bg-blue-100 text-blue-700 border-blue-200' },
  em_andamento: { label:'Em andamento', cls:'bg-orange-100 text-orange-700 border-orange-200' },
  perdido:      { label:'Perdido',      cls:'bg-red-100 text-red-700 border-red-200' },
}


function go(view) { S.view = view; render() }

function isAdmin() { return S.me?.role === 'ADMIN' }
// Pode gerenciar conexões: admin ou collaborator com permissão manageConnections.
// DELETE de conexão continua admin-only (ver bloco no leads.routes.js).

function canManageConns() { return isAdmin() || !!S.me?.permissions?.manageConnections }

// ─── Routing ──────────────────────────────────────────────────────────────────
var ROUTE_MAP = {
  '/':              'dashboard',
  '/leads':         'leads',
  '/conversas':     'inbox',
  '/kanban':        'kanban',
  '/estatisticas':  'stats',
  '/conexoes':      'connections',
  '/configuracoes': 'settings',
  '/agentes-ia':    'ai-agents',
  '/trafego':       'meta-ads',
}
var TAB_TO_PATH = {
  dashboard:   '/',
  inbox:       '/conversas',
  kanban:      '/kanban',
  stats:       '/estatisticas',
  connections: '/conexoes',
  settings:    '/configuracoes',
  leads:       '/leads',
  users:       '/configuracoes',
  'ai-agents': '/agentes-ia',
}

// Lógica de entrada de cada aba — fetch + render.
// Centralizado aqui para garantir que navigate() e popstate executem o mesmo fluxo.

function enterTab(tab) {
  if (tab === 'dashboard') {
    S.dashboardLoading = true   // mostra spinner imediatamente — sem dados velhos
    render()
    // Lazy load dashboard.js antes de fetch — placeholder visível no render() acima
    loadModule('dashboard').then(() => fetchDashboard()).then(() => scheduleRender())
    return
  }
  if (tab === 'kanban') {
    S.kanbanLoading = true      // mostra spinner imediatamente — sem board antigo
    render()
    // renderKanban usa S.kanban.stages (vem de kanban.js) + S.leads (vem de
    // leads.js). Em deep-link/refresh em /kanban sem ter passado por /leads,
    // S.leads fica vazio. Carrega ambos em paralelo.
    const pK = loadModule('kanban').then(() => fetchKanban())
    const pL = loadModule('leads').then(() => fetchLeads().catch(()=>{}))
    // fetchKanban seta kanbanLoading=false ao terminar; re-seta true se leads
    // ainda não chegou, pra evitar flash de board vazio entre os dois fetches.
    pK.then(() => { if (!S.leadsLoaded) { S.kanbanLoading = true; scheduleRender() } })
    Promise.all([pK, pL]).finally(() => { S.kanbanLoading = false; scheduleRender() })
    return
  }
  if (tab === 'users') {
    S.usersLoading = true       // mostra skeleton imediatamente — sem lista velha
    render()
    loadModule('settings').then(() => fetchUsers()).then(() => scheduleRender())
    return
  }
  if (tab === 'stats') {
    // stats chama renderAuditTab que vive em settings.js — precisa carregar antes
    loadModule('settings').then(() => loadStats())
    return
  }
  if (tab === 'connections') {
    S.connLoading = true        // mostra spinner imediatamente — sem conexões velhas
    render()
    loadModule('connections').then(() => {
      fetchConnections(); fetchUnofficialSessions(); fetchTelegramBots(); fetchTelegramUserConnections().catch(()=>{})
    })
    return
  }
  if (tab === 'broadcasts') {
    S.broadcastsLoaded = false  // mostra "Carregando..." imediatamente
    render()
    loadModule('broadcasts').then(() => loadBroadcasts())
    return
  }
  if (tab === 'ai-agents') {
    S.aiAgentsLoaded = false
    render()
    loadModule('ai-agents').then(() => {
      loadAiAgents()
      // Carrega override global periodicamente
      setTimeout(() => { try { loadAiGlobalOverride() } catch {} }, 1500)
      setInterval(() => { try { loadAiGlobalOverride() } catch {} }, 60000)
    })
    return
  }
  if (tab === 'meta-ads') {
    S.metaAdsLoaded = false
    render()
    loadMetaAds()
    return
  }
  if (tab === 'settings') {
    render()
    // Settings precisa de fetchUsers pra render correto (panel default mostra users)
    loadModule('settings').then(() => fetchUsers()).then(() => scheduleRender())
    return
  }
  if (tab === 'leads') {
    render()
    // Leads é lazy — carrega o módulo, fetcha dados, re-renderiza
    loadModule('leads').then(() => {
      if (typeof fetchLeads === 'function') fetchLeads().catch(()=>{}).finally(() => scheduleRender())
      if (typeof fetchTagOptions === 'function') fetchTagOptions().catch(()=>{}).finally(() => scheduleRender())
    })
    return
  }
  render() // inbox — dados mantidos frescos pelo poll
}


function navigate(tab, extra = {}) {
  if (S.view === 'leads') {
    const path = TAB_TO_PATH[tab] || '/'
    if (location.pathname !== path) history.pushState({ tab }, '', path)
  }
  S.conversationLeadId = null
  S.conversation = null
  if (isAdmin()) S.adminTab = tab
  else S.collabTab = tab
  if (extra.filterTags)  { S.filterTags  = extra.filterTags  }
  if (extra.filterUser !== undefined) { S.filterUser  = extra.filterUser  }
  if (extra.filterStatus){ S.filterStatus = extra.filterStatus }
  if (extra.filterStage) { S.filterStage  = extra.filterStage  }
  if (tab === 'settings') S.settingsTab = S.settingsTab || 'equipe'
  enterTab(tab)
}


function initRoute() {
  const raw = location.pathname
  const tab = ROUTE_MAP[raw] || 'dashboard'
  const canonical = TAB_TO_PATH[tab] || '/'
  if (isAdmin()) S.adminTab = tab
  else S.collabTab = tab
  history.replaceState({ tab }, '', canonical)
  enterTab(tab)
}

window.addEventListener('popstate', e => {
  if (S.view !== 'leads') return
  const tab = e.state?.tab || ROUTE_MAP[location.pathname] || 'dashboard'
  if (isAdmin()) S.adminTab = tab
  else S.collabTab = tab
  S.conversationLeadId = null
  S.conversation = null
  enterTab(tab) // mesmo fluxo que navigate()
})

function canDelete() { return isAdmin() || S.me?.permissions?.canDelete !== false }
// Por-lead: admin sempre; operador precisa ter permissão E estar atribuído ao lead

function canDeleteLead(lead) {
  if (isAdmin()) return true
  if (S.me?.permissions?.canDelete === false) return false
  return !!(lead?.assignedToId && lead.assignedToId === S.me?.id)
}

function showToast(msg, type='success') {
  let t = document.getElementById('toast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'toast'
    document.body.appendChild(t)
  }
  const isErr = type === 'error'
  t.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(0);
    display:flex; align-items:center; gap:8px;
    padding:10px 16px; border-radius:10px;
    font-family:'Plus Jakarta Sans',system-ui,sans-serif; font-size:13px; font-weight:600;
    color:white; white-space:nowrap;
    background:${isErr ? '#dc2626' : '#111318'};
    box-shadow:0 8px 24px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12);
    z-index:9999; opacity:1; transition:opacity 0.25s, transform 0.25s;
    border: 1px solid ${isErr ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.08)'};
  `
  t.innerHTML = `
    <span style="width:7px;height:7px;border-radius:50%;background:${isErr?'#fca5a5':'#6ee7b7'};flex-shrink:0"></span>
    ${msg}
  `
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(8px)' }, 2800)
}

// Gera preview da última msg: texto puro OU label de mídia quando content esta vazio.
// Usado em qualquer fluxo que sobrescreva S.msgPreviews a partir de uma message individual
// (openConversation, polling, etc) — espelha a logica do backend em leads.service.js.
var _MEDIA_PREVIEW_LABELS = {
  audio: '🎤 Mensagem de voz', image: '📷 Foto', video: '🎬 Vídeo',
  sticker: '🎨 Figurinha', document: '📄 Documento', contacts: '👤 Contato',
  reaction: '😄 Reação', template: '📋 Template', button: '🔘 Botão',
  interactive: '🔘 Interativa', unsupported: '📎 Mensagem',
}

async function boot() {
  if (!S.token || !S.me) {
    go('login')
    return
  }
  // Navega imediatamente usando S.me do localStorage — sem esperar /me da rede
  go('leads')
  initRoute()
  // Carrega tudo em background; fetchLeads faz cache warmup antes de ir à rede.
  // Guardas `typeof` necessárias pra views lazy — quando o módulo dono ainda
  // não foi carregado, o prefetch pula. Loader+fetch rolam quando user navega.
  if (typeof fetchLeads === 'function') fetchLeads().catch(()=>{}).finally(() => scheduleRender())
  if (typeof fetchInboxLeads === 'function') fetchInboxLeads().catch(()=>{}).finally(() => scheduleRender())
  if (typeof fetchDashboard === 'function') fetchDashboard().catch(()=>{}).finally(() => scheduleRender())
  if (typeof fetchUsers === 'function') fetchUsers().catch(()=>{})
  if (typeof fetchTagOptions === 'function') fetchTagOptions().catch(()=>{}).finally(() => scheduleRender())
  if (typeof fetchKanban === 'function') fetchKanban().catch(()=>{}).finally(() => scheduleRender())
  if (typeof loadAvatarSession === 'function') loadAvatarSession()
  // Carrega workspaces disponíveis para o switcher na navbar
  refreshUserWorkspaces()
  // Web Push: registra automaticamente se permissao ja concedida
  _bootWebPush()
  // Refresca S.me em background — só atualiza permissões, não bloqueia UI
  api('/me').then(freshMe => {
    if (!freshMe) return
    S.me = { ...S.me, ...freshMe }; setUser(S.me)
    if (freshMe.workspaceName) { S.workspaceName = freshMe.workspaceName; _safeSetItem('workspaceName', freshMe.workspaceName) }
    if (freshMe.workspaceSlug && !S.workspaceSlug) { S.workspaceSlug = freshMe.workspaceSlug; _safeSetItem('workspaceSlug', freshMe.workspaceSlug) }
  }).catch(() => {})
}


function _lwnDialog({ kind, title, message, defaultValue = '', placeholder = '',
                      confirmLabel, cancelLabel = 'Cancelar',
                      danger = false, validate = null, inputType = 'text',
                      liveFormatter = null }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'lwn-dlg-overlay'

    const isPrompt = kind === 'prompt'
    const okLabel = confirmLabel || (isPrompt ? 'Salvar' : 'Confirmar')
    const okClass = danger ? 'lwn-dlg-btn-danger' : 'lwn-dlg-btn-primary'

    overlay.innerHTML = `
      <div class="lwn-dlg" role="dialog" aria-modal="true">
        <h3 class="lwn-dlg-title">${esc(title || '')}</h3>
        ${message ? `<p class="lwn-dlg-msg">${esc(message)}</p>` : ''}
        ${isPrompt ? `
          <input type="${esc(inputType)}" class="lwn-dlg-input" id="__lwn-input"
                 value="${esc(defaultValue)}" placeholder="${esc(placeholder)}"
                 autocomplete="off" />
          <div class="lwn-dlg-error" id="__lwn-error"></div>
        ` : ''}
        <div class="lwn-dlg-actions">
          <button type="button" class="lwn-dlg-btn lwn-dlg-btn-secondary" id="__lwn-cancel">${esc(cancelLabel)}</button>
          <button type="button" class="lwn-dlg-btn ${okClass}" id="__lwn-ok">${esc(okLabel)}</button>
        </div>
      </div>
    `

    const close = (value) => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve(value)
    }

    const tryConfirm = () => {
      if (!isPrompt) { close(true); return }
      const input = overlay.querySelector('#__lwn-input')
      const errEl = overlay.querySelector('#__lwn-error')
      const v = (input?.value ?? '').trim()
      if (typeof validate === 'function') {
        const err = validate(v)
        if (err) {
          errEl.textContent = err
          input.classList.add('is-invalid')
          input.focus(); input.select?.()
          return
        }
      }
      close(v)
    }

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(isPrompt ? null : false) }
      else if (e.key === 'Enter' && (e.target.tagName !== 'TEXTAREA')) { e.preventDefault(); tryConfirm() }
    }
    document.addEventListener('keydown', onKey, true)

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(isPrompt ? null : false)
    })

    document.body.appendChild(overlay)
    overlay.querySelector('#__lwn-cancel').onclick = () => close(isPrompt ? null : false)
    overlay.querySelector('#__lwn-ok').onclick = tryConfirm

    if (isPrompt) {
      const input = overlay.querySelector('#__lwn-input')
      setTimeout(() => { input?.focus(); input?.select?.() }, 30)
      input.addEventListener('input', () => {
        const errEl = overlay.querySelector('#__lwn-error')
        if (errEl) errEl.textContent = ''
        input.classList.remove('is-invalid')
        if (typeof liveFormatter === 'function') {
          input.value = liveFormatter(input.value)
        }
      })
    }
  })
}

window.lowanPrompt = (title, defaultValue = '', opts = {}) =>
  _lwnDialog({ kind: 'prompt', title, defaultValue, ...opts })
window.lowanConfirm = (title, message = '', opts = {}) =>
  _lwnDialog({ kind: 'confirm', title, message, ...opts })


function _syncMobileInboxClasses() {
  const isInbox = (isAdmin() ? S.adminTab : S.collabTab) === 'inbox'
  document.body.classList.toggle('has-mobile-inbox', isInbox)
  document.documentElement.classList.toggle('has-mobile-inbox', isInbox)
  document.body.classList.toggle('has-active-conv', isInbox && !!S.conversationLeadId)
  // Força reset de scroll do viewport — corrige bug do iOS quando o teclado some
  if (isInbox) { window.scrollTo(0, 0) }
}

// iOS keyboard bug: ao dispensar o teclado, viewport pode ficar deslocada e
// esconder o chat header. Reseta scroll quando o textarea de chat perde foco.
document.addEventListener('focusout', function(e) {
  if (!e.target || !e.target.matches) return
  if (!document.body.classList.contains('has-mobile-inbox')) return
  if (e.target.matches('#reply-input, .cv-input-wrap textarea, #inbox-search-input')) {
    setTimeout(() => {
      window.scrollTo(0, 0)
      document.body.scrollTop = 0
      document.documentElement.scrollTop = 0
    }, 50)
  }
}, true)


function _renderFade(app, html) {
  // Só anima na primeira vez ou quando a view muda (evita flash em re-renders)
  const isSameView = app.dataset.renderedView === S.view
  app.dataset.renderedView = S.view
  if (isSameView) { app.innerHTML = html; return }
  app.style.opacity = '0'
  app.style.transition = 'opacity 0.18s ease'
  app.innerHTML = html
  requestAnimationFrame(() => { app.style.opacity = '1' })
}

// ── scheduleRender — coalesce múltiplos render() em 1 por frame ──────────────
// Contextos assíncronos (fetch, polling, finally) chamam scheduleRender().
// Contextos síncronos que precisam de feedback imediato chamam render() direto.
var _renderScheduled = false

function scheduleRender() {
  if (_renderScheduled) return
  _renderScheduled = true
  requestAnimationFrame(() => { _renderScheduled = false; render() })
}


function _injectAiOverrideBanner() {
  const visibleViews = new Set(['admin','collab','dashboard','main'])
  const shouldShow = !!getToken() && S.view && !['login','loading','workspace-select'].includes(S.view)
  let host = document.getElementById('ai-override-banner-host')
  if (!shouldShow) {
    if (host) host.remove()
    return
  }
  if (!host) {
    host = document.createElement('div')
    host.id = 'ai-override-banner-host'
    host.style.cssText = 'position:sticky;top:0;z-index:9999'
    document.body.insertBefore(host, document.body.firstChild)
  }
  host.innerHTML = renderAiOverrideBanner()
}


function render() {
  try { _injectAiOverrideBanner() } catch {}
  _renderScheduled = false  // cancela qualquer pendente — este já é o render
  // Guard: drag em andamento — não rebuilda o DOM (cancelaria o drag mid-way).
  // Quando o drag termina (kanbanDragEnd / kanbanDrop), render() é chamada explicitamente.
  if (S.draggingLeadId) return
  try { _syncScheduledForActiveLead() } catch(e) {}
  const app = document.getElementById('app')
  if (S.view === 'loading') {
    app.innerHTML = `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--surface-2);gap:12px">
      <div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.7s linear infinite"></div>
      <p style="font-size:13px;color:var(--text-muted);font-weight:500">Carregando...</p>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>`
    return
  }
  if (S.view === 'login') { _renderFade(app, renderAuthPage()); return }
  if (S.view === 'workspace-select') { _renderFade(app, renderWorkspacePicker()); return }

  const isInbox = (isAdmin() ? S.adminTab : S.collabTab) === 'inbox'
  if (typeof _syncMobileInboxClasses === 'function') _syncMobileInboxClasses()

  // ── Surgical path: inbox tab com shell já montado ────────────────────────
  if (isInbox && document.getElementById('inbox-list-panel')) {
    _patchInboxListPanel()
    _patchInboxChatHeader()
    _patchInboxReplyBox()
    _patchInboxDetailsPanel()
    _patchRootModal()
    _patchMobMoreSheet()
    return
  }

  // ── Surgical path: demais tabs — só atualiza área de conteúdo ────────────
  if (_patchContentArea()) { _patchMobMoreSheet(); return }

  // ── Full rebuild ─────────────────────────────────────────────────────────
  // Salva scroll do kanban antes do rebuild
  const kanbanBoardEl = document.getElementById('kanban-board')
  const savedKanbanScrollX = kanbanBoardEl ? kanbanBoardEl.scrollLeft : 0
  const savedKanbanColScrolls = {}
  document.querySelectorAll('[data-drop-zone]').forEach(el => {
    if (el.scrollTop > 0) savedKanbanColScrolls[el.dataset.dropZone] = el.scrollTop
  })

  // Salva scroll e foco para restaurar após rebuild
  const chatEl = document.getElementById('conv-msgs')
  const savedTop = chatEl ? chatEl.scrollTop : null
  const wasAtBottom = _chatAtBottom
  const focusedId = document.activeElement?.id || null
  const focusSel = focusedId ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null
  const mainScrollEl = document.getElementById('main-scroll')
  const savedMainScroll = mainScrollEl ? mainScrollEl.scrollTop : 0
  const bcModalEl = document.getElementById('bc-modal-scroll')
  const savedBcModalScroll = bcModalEl ? bcModalEl.scrollTop : 0

  app.innerHTML = renderMain()
  _setupChatScrollListener()
  if (typeof _setupKanbanPan === 'function') _setupKanbanPan()

  // Restaura scroll do painel principal (ex: stats, users, etc.)
  const newMainScrollEl = document.getElementById('main-scroll')
  if (newMainScrollEl && savedMainScroll > 0) newMainScrollEl.scrollTop = savedMainScroll

  // Restaura scroll do modal de broadcast (campanhas) se estiver aberto
  const newBcModalEl = document.getElementById('bc-modal-scroll')
  if (newBcModalEl && savedBcModalScroll > 0) newBcModalEl.scrollTop = savedBcModalScroll

  // Restaura scroll — preserva posição exata do usuário ou vai ao bottom
  const newChatEl = document.getElementById('conv-msgs')
  if (newChatEl && savedTop !== null) {
    newChatEl.scrollTop = wasAtBottom ? newChatEl.scrollHeight : savedTop
    _chatAtBottom = wasAtBottom
  }

  // Restaura foco se algum input estava ativo antes do rebuild
  if (focusedId) {
    const el = document.getElementById(focusedId)
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.focus()
      try { if (focusSel) el.setSelectionRange(focusSel[0], focusSel[1]) } catch {}
    }
  }

  // Re-aplica filtro DOM de Leads se havia busca ativa (sem agendar novo render())
  if (S.searchInput && document.getElementById('leads-tbody')) {
    const _term = S.searchInput.toLowerCase()
    document.querySelectorAll('#leads-tbody tr[data-search]').forEach(row => {
      row.style.display = (!_term || row.dataset.search.includes(_term)) ? '' : 'none'
    })
  }

  // Restaura scroll do kanban
  const newKanbanBoardEl = document.getElementById('kanban-board')
  if (newKanbanBoardEl && savedKanbanScrollX > 0) newKanbanBoardEl.scrollLeft = savedKanbanScrollX
  document.querySelectorAll('[data-drop-zone]').forEach(el => {
    const saved = savedKanbanColScrolls[el.dataset.dropZone]
    if (saved) el.scrollTop = saved
  })
  if (typeof attachKanbanScrollListeners === 'function') attachKanbanScrollListeners()
  _inboxScrollBound = false; attachInboxScrollListener()

  requestAnimationFrame(() => { loadAuthImages(); loadAuthAudios(); loadAuthVideos() })
}

// ── Patches cirúrgicos do layout ──────────────────────────────────────────────

// Filtra a tabela de Leads em tempo real via DOM — sem render()

function _patchSidebarActive(tab) {
  document.querySelectorAll('.nav-item[onclick], .sb-item[onclick], .mob-tab[onclick], .mob-more-item[onclick]').forEach(btn => {
    const m = btn.getAttribute('onclick')?.match(/navigate\('(\w+)'\)/)
    if (m) btn.classList.toggle('active', m[1] === tab)
  })
}

// Patch da "Mais" sheet — renderMain não roda no caminho surgical,
// então atualizamos o portal dedicado em todo render() pra refletir S.mobMoreOpen.

function _patchMobMoreSheet() {
  const portal = document.getElementById('mob-more-portal')
  if (!portal) return
  const next = renderMobileMoreSheet()
  if (portal.innerHTML !== next) portal.innerHTML = next
}

var _SCROLL_TABS = new Set(['dashboard','leads','users','connections','broadcasts','stats','settings'])

// Tenta atualizar apenas a área de conteúdo sem rebuildar o app inteiro.
// Retorna true se conseguiu fazer o patch; false para cair no full rebuild.

function _patchContentArea() {
  const tab = isAdmin() ? S.adminTab : S.collabTab
  if (tab === 'inbox') return false

  const contentWrapper = document.getElementById('content-wrapper')
  if (!contentWrapper) return false

  _patchSidebarActive(tab)
  if (typeof _patchLeadsBadges === 'function') _patchLeadsBadges()

  const isScrollTab = _SCROLL_TABS.has(tab)
  const mainScroll = document.getElementById('main-scroll')

  if (isScrollTab && mainScroll) {
    // Scroll-tab → scroll-tab: atualiza apenas o conteúdo interno
    const savedScroll = mainScroll.scrollTop
    const savedBcModalScrollInner = document.getElementById('bc-modal-scroll')?.scrollTop || 0
    const inner = mainScroll.firstElementChild
    if (!inner) return false

    let html = ''
    if (tab === 'dashboard')        html = _safeRender('renderDashboardPanel')
    else if (tab === 'leads')       html = _safeRender('renderLeadsPanel')
    else if (tab === 'users')       html = _safeRender('renderUsersPanel')
    else if (tab === 'connections') html = _safeRender('renderConnectionsPanel')
    else if (tab === 'broadcasts')  html = _safeRender('renderBroadcastsPanel')
    else if (tab === 'stats')       html = renderStatsPanel()
    else if (tab === 'settings')    html = _safeRender('renderSettingsPanel')
    else return false

    inner.innerHTML = html
    if (savedScroll > 0) mainScroll.scrollTop = savedScroll
    // Restaura scroll do modal de broadcast (caso esteja aberto na aba Disparos)
    const newBcModalInner = document.getElementById('bc-modal-scroll')
    if (newBcModalInner && savedBcModalScrollInner > 0) newBcModalInner.scrollTop = savedBcModalScrollInner
    // Restaura filtro de busca de leads se ativo
    if (S.searchInput && document.getElementById('leads-tbody')) {
      const _term = S.searchInput.toLowerCase()
      document.querySelectorAll('#leads-tbody tr[data-search]').forEach(row => {
        row.style.display = (!_term || row.dataset.search.includes(_term)) ? '' : 'none'
      })
    }
  } else {
    // Tipo de tab mudou (ex: kanban ↔ scrollable) — rebuilda só o content-wrapper
    const savedKanbanScrollX = document.getElementById('kanban-board')?.scrollLeft || 0
    const savedKanbanColScrolls = {}
    document.querySelectorAll('[data-drop-zone]').forEach(el => {
      if (el.scrollTop > 0) savedKanbanColScrolls[el.dataset.dropZone] = el.scrollTop
    })

    contentWrapper.innerHTML = renderContentArea()

    const newKanbanBoardEl = document.getElementById('kanban-board')
    if (newKanbanBoardEl && savedKanbanScrollX > 0) newKanbanBoardEl.scrollLeft = savedKanbanScrollX
    document.querySelectorAll('[data-drop-zone]').forEach(el => {
      const saved = savedKanbanColScrolls[el.dataset.dropZone]
      if (saved) el.scrollTop = saved
    })
    if (typeof attachKanbanScrollListeners === 'function') attachKanbanScrollListeners()
    if (typeof _setupKanbanPan === 'function') _setupKanbanPan()
    _inboxScrollBound = false; attachInboxScrollListener()
  }

  // Atualiza overlay de conversa cirurgicamente (preserva foco/cursor do reply box)
  _patchConvOverlay()
  _patchRootModal()
  requestAnimationFrame(() => { loadAuthImages(); loadAuthAudios(); loadAuthVideos() })
  return true
}


function renderMain() {
  const activeTab = isAdmin() ? S.adminTab : S.collabTab
  const isInbox = activeTab === 'inbox'

  return `
  <div style="display:flex;height:100vh;background:var(--surface-2);overflow:hidden">
    ${renderSidebar()}
    <div id="content-wrapper" style="display:flex;flex:1;min-width:0;overflow:hidden">
      ${isInbox ? renderInboxLayout() : renderContentArea()}
    </div>
  </div>
  ${renderMobileBottomNav()}
  <div id="mob-more-portal">${renderMobileMoreSheet()}</div>
  <div id="root-modal">${renderModal()}</div>
  <div id="ws-switcher-portal">${renderWsSwitcherModal()}</div>
  <div id="conv-overlay">${!isInbox ? renderConversation() : renderNewConvModal()}</div>
  `
}


function renderCollaboratorView() { return '' } // replaced by sidebar layout

// ─── Template picker ──────────────────────────────────────────────────────────

function renderSidebar() {
  const tab = isAdmin() ? S.adminTab : S.collabTab
  const unread = S.leads.filter(l => isAdmin() ? l.unreadCount > 0 : (l.assignedToId === S.me?.id && l.unreadCount > 0)).length
  const initials = (S.me?.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()
  const userName = S.me?.name || 'Usuário'
  const userRole = S.me?.role === 'ADMIN' ? 'Administrador' : 'Colaborador'
  const wsName = S.workspaceName || 'Workspace'
  const wsMark = (() => {
    const m = wsName.match(/\d+/)
    if (m) return m[0]
    return wsName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  })()

  const navItem = (key, icon, label, badgeCount = 0, adminOnly = false) => {
    if (adminOnly && !isAdmin()) return ''
    const active = tab === key
    const tipText = key === 'inbox' && badgeCount > 0 ? `${label} · ${badgeCount} não lidas` : label
    const badgeHtml = badgeCount > 0
      ? `<span class="sb-badge" id="sidebar-badge-${key}">${badgeCount}</span>`
      : `<span class="sb-badge" id="sidebar-badge-${key}" style="display:none"></span>`
    return `
      <button onclick="navigate('${key}')" class="sb-item${active?' active':''}">
        <span class="sb-ic">${icon}</span>
        <span class="sb-label">${label}</span>
        ${badgeHtml}
        <span class="sb-tip">${esc(tipText)}</span>
      </button>`
  }

  // Sempre clicável — modal trata o caso de 1 workspace + refresca lista on-open
  // (corrige bug onde /auth/workspaces falhava silenciosamente e usuário não via o switcher)
  const wsClickHandler = `onclick="openWsSwitcher()"`

  return `
  <aside class="sb${S._sbPinned ? ' expanded pinned' : ''}" id="lowan-sidebar"
    onmouseenter="sbHoverEnter()"
    onmouseleave="sbHoverLeave()">

    <button class="sb-toggle" onclick="sbTogglePin()" title="Fixar / desafixar expandido">
      <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
    </button>

    <div class="sb-logo">
      <div class="sb-logo-mark">
        <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      </div>
      <div class="sb-logo-name">Lowan</div>
    </div>

    <div class="sb-ws" ${wsClickHandler} title="${esc(wsName)}">
      <div class="sb-ws-mark">${esc(wsMark)}</div>
      <div class="sb-ws-info">
        <div class="sb-ws-name">${esc(wsName)}</div>
        <div class="sb-ws-label">workspace</div>
      </div>
      <svg class="sb-ws-chev" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
    </div>

    <div class="sb-section">Operação</div>
    <nav class="sb-nav">
      ${navItem('dashboard',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"/></svg>`,'Início')}
      ${navItem('leads',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,'Leads')}
      ${navItem('inbox',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`,'Conversas',unread)}
      ${navItem('kanban',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,'Kanban')}
      ${navItem('broadcasts',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>`,'Disparos',0,true)}
      ${navItem('meta-ads',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,'Tráfego',0,true)}
      ${navItem('stats',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,'Estatísticas')}

      <div class="sb-section">Automação</div>

      ${navItem('flows',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 15l3 3m0 0l3-3m-3 3V12"/></svg>`,'Fluxos',0,true)}
      ${navItem('ai-agents',`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8V4m0 0H8m4 0h4M5 8h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2zm3 4h.01M16 12h.01M9 16h6"/></svg>`,'Agentes IA',0,true)}
      ${navItem('connections',`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,'Conexões')}
    </nav>

    <div class="sb-foot">
      <a class="sb-item sb-item-sm" href="/manual/" target="_blank" style="text-decoration:none">
        <span class="sb-ic"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg></span>
        <span class="sb-label">Manual</span>
        <span class="sb-tip">Manual do usuário</span>
      </a>
      <button onclick="navigate('settings')" class="sb-item sb-item-sm${tab==='settings'?' active':''}">
        <span class="sb-ic"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg></span>
        <span class="sb-label">Configurações</span>
        <span class="sb-tip">Configurações</span>
      </button>

      <div class="sb-divider-line"></div>

      <div class="sb-user" title="${esc(userName)} · ${userRole}">
        <div class="sb-user-av">${esc(initials)}</div>
        <div class="sb-user-info">
          <div class="sb-user-name">${esc(userName)}</div>
          <div class="sb-user-role">${userRole}</div>
        </div>
        <button class="sb-user-action" onclick="event.stopPropagation();logout()" title="Sair">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        </button>
      </div>
    </div>
  </aside>`
}

// ─── Mobile bottom navigation ────────────────────────────────────────────────

function renderMobileBottomNav() {
  const tab = isAdmin() ? S.adminTab : S.collabTab
  const unread = S.leads.filter(l => isAdmin() ? l.unreadCount > 0 : (l.assignedToId === S.me?.id && l.unreadCount > 0)).length

  const ICONS = {
    dashboard: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"/></svg>`,
    inbox: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`,
    kanban: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 01-2 2h-2a2 2 0 01-2-2"/></svg>`,
    leads: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,
    broadcasts: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>`,
    more: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  }

  // 4 tabs principais + "Mais" (5 total)
  const primary = isAdmin()
    ? [
        { key: 'dashboard',  label: 'Início',   icon: ICONS.dashboard },
        { key: 'kanban',     label: 'Kanban',   icon: ICONS.kanban },
        { key: 'inbox',      label: 'Conversas',icon: ICONS.inbox, badge: unread },
        { key: 'broadcasts', label: 'Disparos', icon: ICONS.broadcasts },
      ]
    : [
        { key: 'dashboard', label: 'Início',   icon: ICONS.dashboard },
        { key: 'kanban',    label: 'Kanban',   icon: ICONS.kanban },
        { key: 'inbox',     label: 'Conversas',icon: ICONS.inbox, badge: unread },
        { key: 'leads',     label: 'Leads',    icon: ICONS.leads },
      ]

  return `
  <nav class="mob-bottom-nav">
    <div class="mob-bottom-nav-row">
      ${primary.map(t => `
        <button class="mob-tab${tab===t.key?' active':''}" onclick="navigate('${t.key}')">
          ${t.icon}
          <span class="lbl">${t.label}</span>
          ${t.badge > 0 ? `<span class="badge">${t.badge>99?'99+':t.badge}</span>` : ''}
        </button>`).join('')}
      <button class="mob-tab${S.mobMoreOpen?' active':''}" onclick="S.mobMoreOpen=true;render()">
        ${ICONS.more}
        <span class="lbl">Mais</span>
      </button>
    </div>
  </nav>`
}


function renderMobileMoreSheet() {
  if (!S.mobMoreOpen) return ''
  const tab = isAdmin() ? S.adminTab : S.collabTab
  const userName = S.me?.name || 'Usuário'
  const userRole = S.me?.role === 'ADMIN' ? 'Administrador' : 'Colaborador'
  const initials = userName.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()

  const ITEMS = [
    isAdmin() ? null : { key:'leads', label:'Leads', svg:`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>` },
    isAdmin() ? { key:'meta-ads', label:'Tráfego', svg:`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2"/></svg>` } : null,
    { key:'stats', label:'Estatísticas', svg:`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>` },
    isAdmin() ? { key:'flows', label:'Fluxos', svg:`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 15l3 3m0 0l3-3m-3 3V12"/></svg>` } : null,
    isAdmin() ? { key:'ai-agents', label:'Agentes IA', svg:`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8V4m0 0H8m4 0h4M5 8h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2zm3 4h.01M16 12h.01M9 16h6"/></svg>` } : null,
    { key:'connections', label:'Conexões', svg:`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>` },
    { key:'settings', label:'Configurações', svg:`<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>` },
  ].filter(Boolean)

  return `
  <div class="mob-more-backdrop" onclick="S.mobMoreOpen=false;render()"></div>
  <div class="mob-more-sheet">
    <div class="mob-more-handle"></div>
    <h3 class="mob-more-title">Navegar</h3>
    <div class="mob-more-grid">
      ${ITEMS.map(it => `
        <button class="mob-more-item${tab===it.key?' active':''}" onclick="S.mobMoreOpen=false;navigate('${it.key}')">
          ${it.svg}
          <span class="lbl">${it.label}</span>
        </button>`).join('')}
      <a class="mob-more-item" href="/manual/" target="_blank" rel="noopener" onclick="S.mobMoreOpen=false" style="text-decoration:none">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        <span class="lbl">Manual</span>
      </a>
    </div>
    <div class="mob-more-divider"></div>
    <button class="mob-ws-switcher" onclick="S.mobMoreOpen=false;openWsSwitcher()" title="Trocar workspace">
      <div class="ws-mark">${esc((S.workspaceName||'W').trim()[0].toUpperCase())}</div>
      <div class="ws-info">
        <div class="ws-name">${esc(S.workspaceName||'Workspace')}</div>
        <div class="ws-label">tocar pra trocar</div>
      </div>
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
    </button>
    <div class="mob-more-foot">
      <div class="av">${esc(initials)}</div>
      <div class="info">
        <div class="nm">${esc(userName)}</div>
        <div class="rl">${userRole}</div>
      </div>
      <button class="logout" onclick="S.mobMoreOpen=false;logout()" title="Sair">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
      </button>
    </div>
  </div>`
}

// ─── Sidebar hover-to-expand + pin ────────────────────────────────────────────
var _sbHoverTimer = null
var SB_OPEN_DELAY = 250
var SB_CLOSE_DELAY = 200

function sbHoverEnter() {
  const sb = document.getElementById('lowan-sidebar')
  if (!sb || S._sbPinned) return
  clearTimeout(_sbHoverTimer)
  _sbHoverTimer = setTimeout(() => sb.classList.add('expanded'), SB_OPEN_DELAY)
}

function sbHoverLeave() {
  const sb = document.getElementById('lowan-sidebar')
  if (!sb || S._sbPinned) return
  clearTimeout(_sbHoverTimer)
  _sbHoverTimer = setTimeout(() => sb.classList.remove('expanded'), SB_CLOSE_DELAY)
}

function sbTogglePin() {
  S._sbPinned = !S._sbPinned
  try { localStorage.setItem('lowan_sb_pinned', S._sbPinned ? '1' : '0') } catch {}
  const sb = document.getElementById('lowan-sidebar')
  if (!sb) return
  if (S._sbPinned) {
    clearTimeout(_sbHoverTimer)
    sb.classList.add('expanded', 'pinned')
  } else {
    sb.classList.remove('pinned')
    if (!sb.matches(':hover')) sb.classList.remove('expanded')
  }
}
// Restaura preferência salva
try { S._sbPinned = localStorage.getItem('lowan_sb_pinned') === '1' } catch {}


function renderContentArea() {
  const tab = isAdmin() ? S.adminTab : S.collabTab
  if (tab === 'kanban') return `<div class="flex-1 flex flex-col overflow-hidden">${_safeRender('renderKanban')}</div>`
  if (tab === 'flows') return `<iframe src="/flows/" title="Fluxos" style="flex:1;width:100%;height:100%;border:none;background:var(--surface-2);display:block"></iframe>`
  if (tab === 'ai-agents') {
    return `<div id="main-scroll" style="flex:1;overflow-y:auto;background:var(--surface-2)"><div style="max-width:1280px;margin:0 auto;padding:24px 20px">${_safeRender('renderAiAgentsPanel')}</div></div>`
  }
  if (tab === 'meta-ads') {
    return `<div id="main-scroll" style="flex:1;overflow-y:auto;background:var(--surface-2)"><div style="max-width:1280px;margin:0 auto;padding:24px 20px">${renderMetaAdsPanel()}</div></div>`
  }
  let content = ''
  if (tab === 'dashboard')        content = _safeRender('renderDashboardPanel')
  else if (tab === 'leads')       content = _safeRender('renderLeadsPanel')
  else if (tab === 'users')       content = _safeRender('renderUsersPanel')
  else if (tab === 'connections') content = _safeRender('renderConnectionsPanel')
  else if (tab === 'broadcasts')  content = _safeRender('renderBroadcastsPanel')
  else if (tab === 'stats')       content = renderStatsPanel()
  else if (tab === 'settings')    content = _safeRender('renderSettingsPanel')
  return `
  <div id="main-scroll" style="flex:1;overflow-y:auto;background:var(--surface-2)">
    <div style="max-width:1280px;margin:0 auto;padding:24px 20px">${content}</div>
  </div>`
}


function renderHeader() { return '' } // sidebar handles identity


function renderAdminTabs() { return '' } // replaced by sidebar layout

var LEADS_PAGE_SIZE = 50


function apiUnoff(path, opts={}) {
  const hasBody = opts.body != null
  const headers = { Authorization: `Bearer ${getToken()}`, ...(hasBody ? { 'Content-Type': 'application/json' } : {}) }
  return fetch(UNOFF_API + path, { headers, ...opts })
    .then(async r => { const d = await r.json().catch(()=>({})); if (!r.ok) throw new Error(d.error||d.message||`Erro ${r.status}`); return d })
}

// ─── Avatar helpers ────────────────────────────────────────────────────────────

/** Renders an avatar circle: photo if available, otherwise colored initials */

function _leadAvatar(lead, size=36) {
  // Lead pode vir sem name (import Kommo, etc) — usa últimos dígitos do phone como seed/iniciais
  const _phoneTail = String(lead.phone||'').replace(/\D/g,'').slice(-4) || '?'
  const _safe = (lead.name||'').trim() || _phoneTail
  const hue = Math.abs(_safe.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
  const initials = (_safe.split(/\s+/).map(w=>w[0]).slice(0,2).join('') || _phoneTail.slice(0,2)).toUpperCase()
  const base = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;`
  if (lead.avatarUrl) {
    return `<div style="${base}background:hsl(${hue},55%,88%)">
      <img src="${esc(lead.avatarUrl)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:50%;cursor:pointer"
           onclick="event.stopPropagation();openAvatarLightbox('${esc(lead.avatarUrl)}','${esc(lead.name||'')}')"
           onerror="this.parentNode.innerHTML='<span style=\\'font-size:${Math.round(size*0.36)}px;font-weight:700;color:hsl(${hue},55%,35%)\\'>${esc(initials)}</span>'"
           alt="${esc(initials)}">
    </div>`
  }
  return `<div style="${base}background:hsl(${hue},55%,88%)"><span style="font-size:${Math.round(size*0.36)}px;font-weight:700;color:hsl(${hue},55%,35%)">${esc(initials)}</span></div>`
}


function openAvatarLightbox(url, name) {
  if (document.getElementById('avatar-lightbox')) return
  const overlay = document.createElement('div')
  overlay.id = 'avatar-lightbox'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;cursor:zoom-out;animation:fadeIn 0.18s ease'
  overlay.innerHTML = `
    <img src="${esc(url)}" alt="${esc(name)}"
      style="max-width:min(420px,90vw);max-height:min(420px,80vh);border-radius:50%;object-fit:cover;box-shadow:0 8px 48px rgba(0,0,0,0.6);animation:scaleIn 0.2s ease">
    ${name ? `<p style="color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;margin:0;letter-spacing:0.01em">${esc(name)}</p>` : ''}
    <button onclick="event.stopPropagation();document.getElementById('avatar-lightbox').remove()"
      style="position:absolute;top:18px;right:22px;background:rgba(255,255,255,0.12);border:none;color:#fff;font-size:20px;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
  `
  overlay.addEventListener('click', () => overlay.remove())
  document.body.appendChild(overlay)

  const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey) } }
  document.addEventListener('keydown', onKey)
  overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey))
}

// ─── Avatar queue — busca em background, sem bloquear UI ──────────────────────
// Cache no localStorage: registra quando tentamos buscar o avatar de cada lead.
// Evita re-tentar dentro de AVATAR_RETRY_DAYS dias (tanto para sucesso quanto falha).
var AVATAR_RETRY_DAYS = 7
var AVATAR_DELAY_MIN  = 4000   // mínimo 4s entre buscas
var AVATAR_DELAY_MAX  = 8000   // máximo 8s — jitter humano para evitar ban
var AVATAR_DAILY_LIMIT = 200   // máximo de buscas por sessão do browser (reset ao recarregar)
var _avatarQueuePending = new Set()   // leads aguardando processamento
var   _avatarQueueRunning = false       // garante apenas uma corrida por vez
var   _avatarQueueTimer   = null        // debounce do agendamento


function _avatarCacheKey(leadId) { return `av_ts_${leadId}` }


function _avatarWasAttemptedRecently(leadId) {
  const ts = localStorage.getItem(_avatarCacheKey(leadId))
  if (!ts) return false
  return (Date.now() - parseInt(ts, 10)) < AVATAR_RETRY_DAYS * 86400000
}


function _avatarMarkAttempted(leadId) {
  try { localStorage.setItem(_avatarCacheKey(leadId), Date.now().toString()) } catch {}
}

/** Enfileira todos os leads sem avatar que não foram tentados recentemente */

function _enqueueLeadsForAvatarFetch() {
  for (const lead of S.leads) {
    if (!lead.avatarUrl && lead.phone && !lead.phone.startsWith('tg_') && !_avatarWasAttemptedRecently(lead.id)) {
      // Só busca foto se o lead já respondeu alguma vez (firstResponseAt sinaliza primeira resposta)
      // ou tem mensagens não lidas. Evita buscar para leads que nunca interagiram.
      const hasReplied = !!lead.firstResponseAt || lead.unreadCount > 0
      if (hasReplied) _avatarQueuePending.add(lead.id)
    }
  }
}

/** Agenda processamento da fila com debounce de 1,5s (evita disparos em cascata ao carregar leads).
 *  Só processa se a sessão já foi carregada — se não, o hook de loadAvatarSession dispara depois. */

function _scheduleAvatarQueue() {
  if (_avatarQueueTimer) clearTimeout(_avatarQueueTimer)
  _avatarQueueTimer = setTimeout(() => {
    if (!S.avatarSessionLoaded) return
    _enqueueLeadsForAvatarFetch()
    _runAvatarQueue()
  }, 1500)
}

var _avatarDailyCount = 0  // reset ao recarregar a página

/** Intervalo aleatório entre AVATAR_DELAY_MIN e AVATAR_DELAY_MAX (jitter humano) */

function _avatarDelay() {
  const ms = AVATAR_DELAY_MIN + Math.random() * (AVATAR_DELAY_MAX - AVATAR_DELAY_MIN)
  return new Promise(r => setTimeout(r, ms))
}

/** Processa a fila sequencialmente, 1 lead por vez, com intervalo anti-ban */

async function _runAvatarQueue() {
  if (_avatarQueueRunning) return
  const session = S.avatarSession?.sessionStatus === 'connected' ? S.avatarSession : null
  if (!session) return
  if (_avatarQueuePending.size === 0) return

  _avatarQueueRunning = true
  try {
    for (const leadId of [..._avatarQueuePending]) {
      if (_avatarDailyCount >= AVATAR_DAILY_LIMIT) break  // limite diário atingido
      if (!_tabVisible) {                                   // pausa se aba estiver oculta
        _avatarQueueRunning = false
        return
      }
      _avatarQueuePending.delete(leadId)
      await _fetchAvatarBackground(leadId, session)
      _avatarDailyCount++
      await _avatarDelay()  // jitter 4–8s entre cada busca
    }
  } finally {
    _avatarQueueRunning = false
  }
}

/** Busca e persiste avatar de um lead em background — falhas são silenciosas */

async function _fetchAvatarBackground(leadId, session) {
  const lead = S.leads.find(l => l.id === leadId)
  if (!lead || lead.avatarUrl || !lead.phone) return

  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 10000)
    let dataUrl
    try {
      const res = await apiUnoff(
        `/sessions/${session.id}/profile-pic/${encodeURIComponent(lead.phone)}`,
        { signal: ctrl.signal }
      ).finally(() => clearTimeout(tid))
      dataUrl = res.dataUrl
    } catch(sessionErr) {
      // Falha de sessão (indisponível, não conectada, timeout) — NÃO marca como tentado
      // para que o lead seja elegível novamente quando a sessão estiver ok
      const msg = sessionErr?.message || ''
      if (msg.includes('não conectada') || msg.includes('not connected') || msg.includes('503') || sessionErr?.name === 'AbortError') return
      // Outros erros (contato não existe, foto privada): marca como tentado e sai
      _avatarMarkAttempted(leadId)
      return
    }
    // Marca como tentado: foto foi buscada (null = privada/inexistente, string = ok)
    _avatarMarkAttempted(leadId)
    if (!dataUrl) return  // foto privada ou inexistente

    const updated = await api(`/${leadId}/avatar`, {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl: dataUrl }),
    })
    if (!updated?.avatarUrl) return

    // Atualiza estado em memória
    S.leads = S.leads.map(l => l.id === leadId ? { ...l, avatarUrl: updated.avatarUrl } : l)

    // Atualiza headers da conversa aberta
    if (S.conversationLeadId === leadId) {
      _convChatHeaderFp = ''
      _patchConvChatHeader()
      _patchInboxChatHeader()
    }

    // Atualiza o item do sidebar: replace cirúrgico direto (avatar acabou de mudar, FP sempre difere)
    const updatedLead = S.leads.find(l => l.id === leadId)
    if (updatedLead) {
      const el = document.querySelector(`[data-lead-id="${leadId}"]`)
      if (el) {
        const tmp = document.createElement('div')
        tmp.innerHTML = _renderInboxItem(updatedLead)
        const newEl = tmp.firstElementChild
        if (newEl) el.replaceWith(newEl)
      }
      // Garante sidebar atualizado independentemente de a conversa estar visível
      _patchInboxListPanel()
    }
  } catch {
    // Serviço não-oficial indisponível ou timeout — CRM continua normalmente
  }
}

// ─── Sessão dedicada: Foto de Perfil WhatsApp ──────────────────────────────────

function apiTelegram(path, opts={}) { return api(path, opts, API_TELEGRAM) }


function apiTemplates(path, opts={}) { return api(path, opts, API_TEMPLATES) }


async function ensureNotificationPermission() {
  if (!('Notification' in window)) return
  let perm = Notification.permission
  if (perm === 'default') {
    if (localStorage.getItem('crm_notif_asked') === '1') return
    localStorage.setItem('crm_notif_asked', '1')
    try { perm = await Notification.requestPermission() } catch { return }
  }
  if (perm === 'granted') registerWebPush().catch(() => {})
}
// ─── Web Push (browser fechado) ─────────────────────────────────────────────

function _urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(s)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registerWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[webpush] browser nao suporta ServiceWorker/PushManager'); return
  }
  if (!S.token) { console.warn('[webpush] sem token, pulando'); return }
  if (Notification.permission !== 'granted') { console.warn('[webpush] permissao=' + Notification.permission); return }
  try {
    // sw.js servido em /sw.js (raiz) — scope /  cobre toda a app
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    console.log('[webpush] SW registered, scope:', reg.scope)
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const vapidRes = await fetch('/api/v1/push/vapid-public', { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!vapidRes.ok) { console.warn('[webpush] vapid-public failed:', vapidRes.status); return }
      const r = await vapidRes.json()
      if (!r?.key) { console.warn('[webpush] vapid key vazia'); return }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlB64ToUint8(r.key),
      })
      console.log('[webpush] subscription criada')
    } else {
      console.log('[webpush] subscription ja existia')
    }
    // Manda subscription pro backend (idempotente — ON CONFLICT update)
    const subRes = await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(sub.toJSON()),
    })
    if (subRes.ok) console.log('[webpush] subscription registrada no backend ✓')
    else console.warn('[webpush] subscribe POST failed:', subRes.status)
  } catch (e) {
    console.warn('[webpush] register failed:', e?.message || e)
  }
}
// Tenta registrar no boot quando permission ja concedida (em login subsequente)

function _bootWebPush() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') registerWebPush().catch(() => {})
}
// SW manda mensagem ao clicar na notificacao — abre conversa
// SW tambem avisa quando recebe push — usado pra deduplicar com Notification API
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type === 'open-lead' && ev.data.leadId) {
      try { _openLeadFromNotification(ev.data.leadId) } catch {}
    }
    if (ev.data?.type === 'push-received') {
      _lastPushAt = Date.now()
    }
  })
}

// Garante que a conversa abre dentro do contexto correto (aba inbox).
// Sem isso, em mobile com bottom-nav em outra aba, abre o overlay de conversa
// sem classes de mobile (has-mobile-inbox) e a UI fica quebrada.

function _openLeadFromNotification(leadId) {
  if (!leadId || typeof openConversation !== 'function') return
  const currentTab = isAdmin() ? S.adminTab : S.collabTab
  if (currentTab !== 'inbox') {
    if (typeof navigate === 'function') navigate('inbox')
  }
  openConversation(leadId)
}
// Notificacao via Notification API SO quando NAO ha Service Worker ativo (sem Web Push).
// Quando SW ativo, o Web Push do backend cuida — evita conflito de tag entre fontes diferentes.
var _lastPushAt = 0

function showInboundNotification(leadName, preview, leadId) {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (!document.hidden) return  // aba visivel — som basta
  // Se SW ativo, deixa o Web Push do backend mostrar (evita 2 fontes do mesmo notif)
  if (navigator.serviceWorker?.controller) return
  // Sem SW (browser sem support / push desativado): fallback aqui
  try {
    const n = new Notification(`Lowan · ${leadName}`, {
      body: preview || 'Nova mensagem',
      tag: `lead-${leadId}`,
      renotify: true,
    })
    n.onclick = () => {
      window.focus()
      try { if (leadId) _openLeadFromNotification(leadId) } catch {}
      n.close()
    }
    setTimeout(() => { try { n.close() } catch {} }, 8000)
  } catch {}
}

// HTMLAudioElement: tocar em background tab (WhatsApp Web/Kommo style).
// AudioContext suspende quando aba esta hidden — HTMLAudio nao suspende uma vez "unlocked".
// Usa um data-URL WAV inline (2 tons ascendentes 520Hz + 780Hz, ~280ms).

var _NOTIF_AUDIO_DATA = (() => {
  // Gera WAV de 2 tons (520Hz por 120ms + 780Hz por 150ms) em base64
  // Sample rate 22050, mono, 16-bit PCM
  const SR = 22050, dur1 = 0.12, dur2 = 0.15, gap = 0.01
  const total = Math.floor(SR * (dur1 + gap + dur2))
  const buf = new Int16Array(total)
  for (let i = 0; i < total; i++) {
    const t = i / SR
    let v = 0
    if (t < dur1) {
      const env = Math.min(t / 0.02, 1, (dur1 - t) / 0.02)
      v = Math.sin(2 * Math.PI * 520 * t) * 0.25 * env
    } else if (t > dur1 + gap && t < dur1 + gap + dur2) {
      const t2 = t - dur1 - gap
      const env = Math.min(t2 / 0.02, 1, (dur2 - t2) / 0.02)
      v = Math.sin(2 * Math.PI * 780 * t2) * 0.25 * env
    }
    buf[i] = Math.max(-32767, Math.min(32767, Math.floor(v * 32767)))
  }
  // Header WAV
  const wav = new ArrayBuffer(44 + buf.byteLength)
  const dv = new DataView(wav)
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); dv.setUint32(4, 36 + buf.byteLength, true); ws(8, 'WAVE')
  ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  ws(36, 'data'); dv.setUint32(40, buf.byteLength, true)
  new Int16Array(wav, 44).set(buf)
  // base64 encode
  const bytes = new Uint8Array(wav)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return 'data:audio/wav;base64,' + btoa(s)
})()
var _notifAudioEl = new Audio(_NOTIF_AUDIO_DATA)
_notifAudioEl.preload = 'auto'

async function playNotifSound() {
  try {
    _notifAudioEl.currentTime = 0
    await _notifAudioEl.play()
  }
  catch (e) {
    // Fallback: AudioContext (caso HTMLAudio falhe — raro)
    try {
      const ctx = getAudioCtx()
      if (ctx.state === 'suspended') await ctx.resume()
      if (ctx.state !== 'running') return
      const t = ctx.currentTime
      ;[[520, t, t+0.12], [780, t+0.13, t+0.28]].forEach(([freq, start, end]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, start)
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02)
        gain.gain.setValueAtTime(0.25, end - 0.04)
        gain.gain.linearRampToValueAtTime(0, end)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(start); osc.stop(end)
      })
    } catch {}
  }
}


async function playSendSound() {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    if (ctx.state !== 'running') return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(900, t)
    osc.frequency.linearRampToValueAtTime(1100, t + 0.08)
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.linearRampToValueAtTime(0, t + 0.12)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(t); osc.stop(t + 0.12)
  } catch {}
}


function startPolling() {
  if (_pollTimer) return
  _pollTimer = setInterval(async () => {
    if (!S.token || S.view === 'loading' || S.view === 'login' || S.view === 'workspace-select' || S.view === 'setup') return

    // Backoff — pula ticks conforme ciclos idle acumulados
    _pollTickCount++
    // Aba oculta: roda so 1 a cada 10 ticks (~30s) — mantem notificacoes vivas sem stress.
    if (!_tabVisible && _pollTickCount % 10 !== 0) return
    // Backoff (com tick=3s): 0-20 idle → 3s, 21-50 → 6s, 51+ → 9s
    const skipEvery = _pollIdleCycles > 50 ? 3 : _pollIdleCycles > 20 ? 2 : 1
    if (_pollTickCount % skipEvery !== 0) return

    try {
      // Salva estado anterior — usa inboxLeads (todos com mensagens) para detecção correta de novas msgs
      const prevUnread = {}
      const prevAvatars = {}
      const prevOrder = inboxLeads().map(l => l.id).join(',')
      const _allForPrev = S.inboxLeads.length > 0 ? S.inboxLeads : S.leads
      for (const l of _allForPrev) { prevUnread[l.id] = l.unreadCount || 0; prevAvatars[l.id] = l.avatarUrl || null }

      await fetchLeads()

      // Detecta leads com novas mensagens não lidas ou avatar novo — verifica inboxLeads (completo)
      let gotNew = false
      let gotAvatar = false
      let _newMsgLead = null
      const _allForCheck = S.inboxLeads.length > 0 ? S.inboxLeads : S.leads
      for (const l of _allForCheck) {
        if ((l.unreadCount || 0) > (prevUnread[l.id] || 0)) { gotNew = true; if (!_newMsgLead) _newMsgLead = l; break }
        if (!(l.id in prevUnread) && (l.unreadCount || 0) > 0) { gotNew = true; if (!_newMsgLead) _newMsgLead = l; break }
        if (l.avatarUrl && !prevAvatars[l.id]) gotAvatar = true
      }
      const activeTab = (isAdmin() ? S.adminTab : S.collabTab)
      const isInboxTab = activeTab === 'inbox'
      const isLeadsTab = activeTab === 'leads'
      if (gotNew) {
        _pollIdleCycles = 0  // FASE1-B: reseta backoff ao detectar mudança
        playNotifSound()
        if (_newMsgLead) {
          const _preview = S.msgPreviews[_newMsgLead.id]?.text || ''
          showInboundNotification(_newMsgLead.name || 'Lead', _preview, _newMsgLead.id)
        }
        if (isInboxTab && document.getElementById('inbox-list-panel')) _patchInboxListPanel()
        else if (isLeadsTab) _patchLeadsBadges()
        else scheduleRender()
      } else if (inboxLeads().map(l => l.id).join(',') !== prevOrder || gotAvatar) {
        _pollIdleCycles = 0  // FASE1-B: reordenação ou novo avatar
        if (isInboxTab && document.getElementById('inbox-list-panel')) _patchInboxListPanel()
        // Na aba Leads não faz rebuild — dados já estão em S.leads
      } else {
        _pollIdleCycles++    // FASE1-B: nenhuma mudança → acumula idle
      }

      // Se conversa aberta, verifica mensagens novas OU mudança de status (SENT→DELIVERED→READ)
      if (S.conversationLeadId && S.conversation) {
        // FASE2-C: backoff independente da conversa
        // 0–5 idle  → poll toda vez que o tick global roda
        // 6–12 idle → pula 1 de cada 2 ticks globais
        // 13+ idle  → pula 2 de cada 3 ticks globais
        _convTickCount++
        const convSkip = _convIdleCycles > 40 ? 3 : _convIdleCycles > 15 ? 2 : 1
        if (_convTickCount % convSkip !== 0) return

        const pollLeadId = S.conversationLeadId
        const prevMsgs = S.conversation.messages || []
        const prevLen = prevMsgs.length
        const conv = await api(`/${pollLeadId}/conversation`).catch(() => null)
        if (!conv || S.conversationLeadId !== pollLeadId) return

        const newLen = conv.messages?.length || 0
        const hasNewMsgs = newLen > prevLen

        // Detecta mudança de status em mensagens existentes (ex: SENT→DELIVERED→READ)
        const prevById = {}
        for (const m of prevMsgs) prevById[m.id] = m.status
        const hasStatusChange = !hasNewMsgs && (conv.messages || []).some(m => prevById[m.id] && prevById[m.id] !== m.status)

        // Detecta novos eventos (atribuições, etc.)
        const prevEventsLen = (S.conversation.events || []).length
        const hasNewEvents = (conv.events?.length || 0) > prevEventsLen

        if (hasNewMsgs || hasStatusChange || hasNewEvents) {
          _pollIdleCycles = 0  // FASE1-B: reseta backoff global
          _convIdleCycles = 0  // FASE2-C: reseta backoff de conversa
          const newMsgs = hasNewMsgs ? conv.messages.slice(prevLen) : []
          const hasInbound = newMsgs.some(m => m.direction === 'INBOUND')
          S.conversation = conv
          const last = conv.messages?.length ? conv.messages[conv.messages.length - 1] : null
          const lastPreview = _msgPreviewText(last)
          if (lastPreview) S.msgPreviews[pollLeadId] = { text: lastPreview, out: last.direction === 'OUTBOUND' }
          if (hasInbound) {
            playNotifSound()
            const _lastIn = newMsgs.slice().reverse().find(m => m.direction === 'INBOUND')
            if (_lastIn) {
              const _l = (S.leads || []).find(x => x.id === pollLeadId) || (S.inboxLeads || []).find(x => x.id === pollLeadId)
              showInboundNotification(_l?.name || 'Lead', _msgPreviewText(_lastIn) || 'Nova mensagem', pollLeadId)
            }
          }

          if (hasStatusChange && !hasNewMsgs && !hasNewEvents) {
            // Apenas status mudou: atualiza ícone in-place, sem tocar no DOM/scroll
            patchMsgStatuses(conv.messages || [])
          } else if (hasNewMsgs && !hasNewEvents) {
            // Novas mensagens: adiciona ao DOM sem recriar tudo
            for (const m of newMsgs) {
              if (!appendChatMsg(m, pollLeadId)) { patchChatMsgs(pollLeadId, hasInbound); break }
            }
          } else {
            // Eventos novos ou combinação: recria com preservação de scroll
            if (!patchChatMsgs(pollLeadId, hasInbound)) {
              scheduleRender()
              if (hasInbound) scrollToBottomChat()
            }
          }
        } else {
          _convIdleCycles++  // FASE2-C: conversa sem mudança → acumula idle
        }
      }
    } catch {}
  }, 3000)
}

// ─── Init ─────────────────────────────────────────────────────────────────────
// Init movido pro <script> inline (final).


// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO FINANCEIRO
// ─────────────────────────────────────────────────────────────────────────────

var FIN_API = `/api/v1/financial`

function apiFin(path, opts={}) {
  const hasBody = opts.body != null
  const headers = { Authorization: `Bearer ${getToken()}`, ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...opts.headers }
  return fetch(FIN_API + path, { headers, ...opts })
    .then(async r => { const d = await r.json().catch(()=>({})); if (!r.ok) throw new Error(d.error||d.message||`Erro ${r.status}`); return d })
}


function apiSched(path, opts={}) {
  const hasBody = opts.body != null
  const headers = { Authorization: `Bearer ${getToken()}`, ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...opts.headers }
  return fetch(SCHED_API + path, { headers, ...opts })
    .then(async r => {
      if (r.status === 204) return null
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || body.message || `Erro ${r.status}`)
      return body
    })
}


function apiInt(path, opts={}) {
  const hasBody = opts.body != null
  const headers = { Authorization: `Bearer ${getToken()}`, ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...opts.headers }
  return fetch(INT_API + path, { headers, ...opts })
    .then(async r => {
      if (r.status === 204) return null
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || d.message || `Erro ${r.status}`)
      return d
    })
}


function apiBc(path, opts = {}) {
  const hasBody = opts.body != null
  return fetch(BC_API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  }).then(async r => {
    if (r.status === 204) return null
    const b = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(b.error || b.message || 'Erro ' + r.status)
    return b
  })
}

Object.assign(S, {
  broadcasts: [],
  bcMetrics: null,
  broadcastsLoaded: false,
  broadcastsConnections: [],
  bcEditing: null,       // broadcast em edição
  bcPreviewCount: null,  // resultado de preview
})
