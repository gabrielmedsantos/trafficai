// utils.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do índex.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

// ─── Lazy-load infrastructure (Fase 2) ────────────────────────────────────────
// Lazy é sempre ativo: loadModule(name) sempre fetcha módulos não-eager quando
// chamada pela primeira vez. PRs #15+ adicionam `await loadModule(view)` no
// router pra carregar a view sob demanda.
//
// Flag `localStorage.lazyLoad` controla preload opcional em idle (futuro).
// Default OFF = pure on-demand (atual).
var __lazyEnabled = (function(){
  try { return localStorage.getItem('lazyLoad') === '1' } catch { return false }
})()

// Registry: name → { v: cache buster, eager: sempre carrega no boot via <script src> }.
// Eager set inclui utils, core, modals e inbox (deps cross-module pesadas — ver
// memory/project_lowan_fase2_plan.md).
var MODULE_REGISTRY = {
  utils:        { v: 33, eager: true  },
  core:         { v: 23, eager: true  },
  modals:       { v: 1, eager: true  },
  inbox:        { v: 16, eager: true  },
  dashboard:    { v: 1, eager: false },
  kanban:       { v: 6, eager: false },
  leads:        { v: 5, eager: false },
  connections:  { v: 6, eager: false },
  broadcasts:   { v: 3, eager: false },
  'ai-agents':  { v: 4, eager: false },
  settings:     { v: 3, eager: false },
  scheduled:    { v: 1, eager: false },
  'meta-ads':   { v: 1, eager: false },
  integrations: { v: 1, eager: false },
  financial:    { v: 1, eager: false },
}

var __loadedModules = new Set()
var __loadingModules = new Map()

// loadModule(name) → Promise<void>. Idempotente. Safe pra chamar várias vezes.
// - Se já carregado: resolve imediato
// - Se em flight: retorna a mesma Promise
// - Senão: injeta <script src> dinâmico e aguarda onload
function loadModule(name) {
  if (__loadedModules.has(name)) return Promise.resolve()
  if (__loadingModules.has(name)) return __loadingModules.get(name)

  var reg = MODULE_REGISTRY[name]
  if (!reg) return Promise.reject(new Error('Unknown module: ' + name))

  var p = new Promise(function(resolve, reject){
    var s = document.createElement('script')
    s.src = '/m/' + name + '.js?v=' + reg.v
    s.onload = function(){ __loadedModules.add(name); __loadingModules.delete(name); resolve() }
    s.onerror = function(){ __loadingModules.delete(name); reject(new Error('Failed to load ' + name)) }
    document.head.appendChild(s)
  })
  __loadingModules.set(name, p)
  return p
}

// Pre-registra módulos eager como já carregados — eles vêm via <script src>
// do HTML antes mesmo de utils.js (na verdade, utils.js é o primeiro, mas
// pre-registro vale pra resto).
for (var __mname in MODULE_REGISTRY) {
  if (MODULE_REGISTRY[__mname].eager) __loadedModules.add(__mname)
}

// ─── window.DL polyfill (degradação segura) ───────────────────────────────────
// data-lite.js (PR #25) sobrescreve isso com a impl real. Se data-lite.js falhar
// ao carregar por qualquer motivo, este stub mantém o app funcionando: counter()
// sempre cai no legacyFn, enabled() retorna false. Consumidores em kanban/leads/
// core (PR #26) chamam DL.counter sem precisar checar typeof.
window.DL = window.DL || {
  enabled: function(){ return false },
  counter: function(_, __, legacyFn){ return legacyFn() },
  getSummary: function(){ return null },
  fetchSummary: function(){ return Promise.resolve(null) },
  invalidate: function(){},
  prefetchAll: function(){ return Promise.resolve() },
}

// Helper pra render dispatchers chamarem renders de views possivelmente lazy.
// Retorna placeholder quando o módulo dono ainda não foi carregado.
// Uso: _safeRender('renderDashboardPanel') ou _safeRender('renderLeadUtmSection', lead)
function _safeRender(fnName) {
  var fn = window[fnName]
  if (typeof fn === 'function') {
    var args = Array.prototype.slice.call(arguments, 1)
    return fn.apply(null, args)
  }
  return '<div style="padding:40px;text-align:center;color:var(--text-muted)">Carregando módulo…</div>'
}

// Stubs pra fns lazy chamadas via onclick/handler antes do módulo dono carregar.
// Carrega o módulo dinamicamente e re-invoca a fn real (function decl no módulo
// sobrescreve estes stubs em window via hoisting do classic script).
function openLeadForm() {
  var a = arguments
  loadModule('leads').then(function(){ window.openLeadForm.apply(null, a) })
}
function openShareContactModal() {
  var a = arguments
  loadModule('leads').then(function(){ window.openShareContactModal.apply(null, a) })
}
function ldsToggleStageMenu() {
  var a = arguments
  loadModule('leads').then(function(){ window.ldsToggleStageMenu.apply(null, a) })
}
function ldsToggleOpMenu() {
  var a = arguments
  loadModule('leads').then(function(){ window.ldsToggleOpMenu.apply(null, a) })
}
// Scheduled (módulo lazy)
function openScheduleModal() {
  var a = arguments
  loadModule('scheduled').then(function(){ window.openScheduleModal.apply(null, a) })
}
// Settings (módulo lazy) — sendAudioModel é onclick de áudio gravado
function sendAudioModel() {
  var a = arguments
  loadModule('settings').then(function(){ window.sendAudioModel.apply(null, a) })
}

function _safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014 || /quota|exceeded/i.test(err.message||''))
    if (!isQuota) { console.error('localStorage.setItem failed:', err); return false }
    try {
      // Limpeza agressiva: remove TUDO que começa com crm_/avatar_/cache_ (caches recriáveis)
      const toRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith('crm_') || k.startsWith('avatar_') || k.startsWith('cache_'))) toRemove.push(k)
      }
      toRemove.forEach(k => { try { localStorage.removeItem(k) } catch {} })
      try {
        localStorage.setItem(key, value)
        console.warn(`localStorage cheia — limpou ${toRemove.length} entradas de cache pra salvar "${key}"`)
        return true
      } catch (err2) {
        // Mesmo após limpar caches recriáveis, ainda não coube. O valor sendo salvo
        // provavelmente é grande demais (ex: lista de 11k+ leads). Desiste silenciosamente
        // — o cache é opcional, a app continua funcional via fetch direto.
        return false
      }
    } catch (err2) {
      return false
    }
  }
}


function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

// ─── Tooltip global (substitui o nativo do browser) ───────────────────────────
// Antes vivia em settings.js (lazy-loaded), o que deixava o tooltip nativo do
// browser dar as caras antes do settings carregar — o nativo é lento e demora a
// sumir. Movido pra utils (eager) pra ficar ativo desde o primeiro paint.
//
// Intercepta hover em [title] e [data-tooltip] e renderiza tooltip estilizado.
// O title nativo fica suprimido durante hover e restaurado ao sair (preserva a11y).
// Pra usar HTML formatado (ex: <kbd>): use data-tooltip-html="true".
;(function setupGlobalTooltip() {
  if (typeof window === 'undefined' || window._lwnTooltipInstalled) return
  if (typeof document === 'undefined') return
  // Touch-only devices: tooltip nativo não é exibido; nosso também fica off
  // (touch+hold provoca tooltip do OS que conflita).
  var isTouch = ('ontouchstart' in window) && !(window.matchMedia && window.matchMedia('(hover: hover)').matches)
  if (isTouch) return
  window._lwnTooltipInstalled = true

  var tip = document.createElement('div')
  tip.className = 'lwn-tooltip'
  tip.setAttribute('role', 'tooltip')
  // body pode ainda não existir se utils carrega muito cedo
  function attach() { document.body.appendChild(tip) }
  if (document.body) attach()
  else document.addEventListener('DOMContentLoaded', attach, { once: true })

  var cur = null
  var showTimer = null
  var hideTimer = null

  function findTarget(node) {
    if (!node || node.nodeType !== 1) return null
    return node.closest('[data-tooltip]:not([data-tooltip=""]), [title]:not([title=""])')
  }
  function getText(el) {
    return el.dataset.tooltip || el.dataset.lwnTitle || el.getAttribute('title') || ''
  }
  function isHtml(el) { return el.dataset.tooltipHtml === 'true' }

  function suppress(el) {
    if (el.hasAttribute('title')) {
      el.dataset.lwnTitle = el.getAttribute('title')
      el.removeAttribute('title')
    }
  }
  function restore(el) {
    if (el && el.dataset && el.dataset.lwnTitle != null) {
      el.setAttribute('title', el.dataset.lwnTitle)
      delete el.dataset.lwnTitle
    }
  }

  function position(el) {
    var r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) { hide(); return }
    var tr = tip.getBoundingClientRect()
    var top = r.top - tr.height - 8
    var placement = 'top'
    if (top < 8) { top = r.bottom + 8; placement = 'bottom' }
    var left = r.left + (r.width - tr.width) / 2
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8))
    tip.style.top = top + 'px'
    tip.style.left = left + 'px'
    tip.dataset.placement = placement
  }

  function show(el) {
    if (!el || !document.body.contains(el)) { cur = null; return }
    var text = getText(el)
    if (!text) return
    cur = el
    if (isHtml(el)) tip.innerHTML = text
    else tip.textContent = text
    tip.classList.add('is-visible')
    requestAnimationFrame(function(){ position(el) })
  }
  function hide() {
    clearTimeout(showTimer); clearTimeout(hideTimer)
    if (cur) restore(cur)
    cur = null
    tip.classList.remove('is-visible')
  }

  // FIX: ao re-render do SPA o elemento `cur` pode ter sido removido do DOM
  // ANTES de mouseout disparar. Sem este guard, o tooltip permanece visível.
  // Roda em todo mouseover e auto-cura.
  function checkCurStillInDom() {
    if (cur && !document.body.contains(cur)) {
      clearTimeout(showTimer); clearTimeout(hideTimer)
      cur = null
      tip.classList.remove('is-visible')
    }
  }

  // 500ms — balanceado entre "passa rápido sem ver" e "demorou demais".
  // Antes era 3000ms (3s), reclamado como "demorando demais".
  var SHOW_DELAY_MS = 500
  document.addEventListener('mouseover', function(e){
    checkCurStillInDom()
    var t = findTarget(e.target)
    if (!t || t === cur) return
    if (cur) restore(cur)
    suppress(t)
    cur = t
    clearTimeout(showTimer); clearTimeout(hideTimer)
    showTimer = setTimeout(function(){ show(t) }, SHOW_DELAY_MS)
  })
  document.addEventListener('mouseout', function(e){
    var t = findTarget(e.target)
    if (!t || t !== cur) return
    if (e.relatedTarget && t.contains(e.relatedTarget)) return
    clearTimeout(showTimer); clearTimeout(hideTimer)
    hideTimer = setTimeout(hide, 80)
  })
  // Mouse saiu do viewport — force hide
  document.addEventListener('mouseleave', hide)
  // Keyboard a11y: foca via tab → mostra tooltip
  document.addEventListener('focusin', function(e){
    var t = findTarget(e.target)
    if (!t || t === cur) return
    try { if (!t.matches(':focus-visible')) return } catch (err) { return }
    if (cur) restore(cur)
    suppress(t)
    cur = t
    show(t)
  })
  document.addEventListener('focusout', function(){
    clearTimeout(showTimer); clearTimeout(hideTimer)
    hide()
  })
  window.addEventListener('scroll', hide, true)
  document.addEventListener('mousedown', hide, true)
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') hide() })
})()

// ─── Custom Dropdown (CDD) ────────────────────────────────────────────────────
// LOWAN_BUILD_MARKER_v2026_05_08_1150

function cddToggle(id,ev){
  ev?.stopPropagation()
  ev?.preventDefault?.()
  const el=document.getElementById(id)
  const was=el?.classList.contains('cdd--open')
  cddCloseAll()
  if(!was&&el){
    el.classList.add('cdd--open')
    if(typeof __cddOpenedAt!=='undefined')__cddOpenedAt=Date.now()
    const btn=el.querySelector('.cdd-btn')
    let drop=el.querySelector('.cdd-drop') || document.querySelector(`.cdd-drop[data-cdd-portal="${id}"]`)
    if(btn&&drop){
      const r=btn.getBoundingClientRect()
      const spaceBelow=window.innerHeight-r.bottom
      // Portal: move o drop pra document.body pra escapar de stacking contexts
      // criados por backdrop-filter, transform, will-change, etc nos pais.
      // Sem isso, dropdown abre invisivel dentro do modal (issue conhecido em iOS Safari).
      if(drop.parentElement!==document.body){
        drop.dataset.cddPortal=id
        document.body.appendChild(drop)
        drop.classList.add('cdd-portal-open')
      }
      // Força visibilidade via inline style (defensivo contra CSS de outros lugares)
      drop.style.position='fixed'
      drop.style.left=r.left+'px'
      drop.style.minWidth=r.width+'px'
      drop.style.width=''
      drop.style.zIndex='99999'
      drop.style.opacity='1'
      drop.style.transform='none'
      drop.style.pointerEvents='auto'
      drop.style.display='block'
      drop.style.height='auto'
      drop.style.maxHeight='256px'
      drop.style.overflowY='auto'
      // Garante que cada item tenha altura — fix pra h=2px quando portado
      drop.querySelectorAll('.cdd-item').forEach(item=>{
        item.style.display='flex'
        item.style.alignItems='center'
        item.style.gap='8px'
        item.style.padding='8px 12px'
        item.style.fontSize='13px'
        item.style.minHeight='34px'
        item.style.boxSizing='border-box'
        item.style.cursor='pointer'
        item.style.whiteSpace='nowrap'
      })
      if(spaceBelow<220&&r.top>spaceBelow){
        drop.style.top=''
        drop.style.bottom=(window.innerHeight-r.top+4)+'px'
      } else {
        drop.style.bottom=''
        drop.style.top=(r.bottom+4)+'px'
      }
    }
  }
}

function cddClose(id){
  const el=document.getElementById(id)
  if(el) el.classList.remove('cdd--open')
  // Devolve o drop portado pro CDD original
  const drop=document.querySelector(`.cdd-drop[data-cdd-portal="${id}"]`)
  if(drop && el){
    drop.classList.remove('cdd-portal-open')
    delete drop.dataset.cddPortal
    // cssText='' limpa TODOS os inline styles setados em cddToggle
    // (display, opacity, pointerEvents, transform, width, height, maxHeight,
    //  overflowY além de position/top/bottom/left/minWidth/zIndex).
    // Sem isso, o drop fechado continua visualmente aberto após portal.
    drop.style.cssText=''
    drop.querySelectorAll('.cdd-item').forEach(item => { item.style.cssText='' })
    el.appendChild(drop)
  }
}

function cddCloseAll(){
  document.querySelectorAll('.cdd--open').forEach(el=>cddClose(el.id))
  // Defensivo: limpa drops portados orfaos
  document.querySelectorAll('.cdd-drop[data-cdd-portal]').forEach(d=>{
    const id=d.dataset.cddPortal
    const owner=document.getElementById(id)
    if(owner){
      d.classList.remove('cdd-portal-open')
      delete d.dataset.cddPortal
      d.style.cssText=''
      owner.appendChild(d)
    } else {
      d.remove()
    }
  })
}
// Click-outside fecha dropdowns abertos.
// Proteção: ignora cliques nos primeiros 100ms depois de abrir (evita race com
// o evento que abriu, principalmente em mobile onde o click sintético pode
// disparar duas vezes).
var __cddOpenedAt =0
var __origCddOpen =window.cddToggle
document.addEventListener('click',(e)=>{
  if(Date.now()-__cddOpenedAt<150)return
  // Não fecha se clique foi DENTRO de um dropdown (portado ou no DOM)
  if(e.target.closest('.cdd-drop')||e.target.closest('.cdd-btn'))return
  cddCloseAll()
}, true)  // capture phase pra rodar antes que stopPropagation possa mascarar

function renderCDD({id,value,options,onchange,placeholder='Selecionar...',style='',cls=''}){
  const sv=String(value??'')
  const sel=options.find(o=>String(o.value??'')===sv)
  const lbl=sel?sel.label:placeholder
  const arr=`<svg class="cdd-arr" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
  const chk=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  const items=options.map(o=>{
    const ov=String(o.value??''),active=ov===sv
    const safe=ov.replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    const action=onchange.replace(/this\.value/g,`'${safe}'`)
    return `<div class="cdd-item${active?' is-sel':''}" onclick="${esc(action)};cddClose('${id}')"><span class="cdd-ck">${active?chk:''}</span><span>${esc(o.label)}</span></div>`
  }).join('')
  return `<div class="cdd${cls?' '+cls:''}" id="${id}"${style?` style="${style}"`:''}><button type="button" class="cdd-btn" onclick="cddToggle('${id}',event)"><span class="cdd-val">${esc(lbl)}</span>${arr}</button><div class="cdd-drop">${items}</div></div>`
}

// ─── Conteúdo de mensagem (texto ou mídia) ────────────────────────────────────

function fmtPhone(p) {
  if (!p) return ''
  const d = String(p).replace(/\D/g,'')
  if (!d) return ''  // sem dígitos — não é telefone (ex: 'WhatsApp', 'API')
  // Remove prefixo 55 se tiver 12-13 dígitos
  const n = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
  return esc(p)
}

// fmtPhoneLive: formatador progressivo pra inputs (formata mesmo com digitação parcial).
// Aceita ate 11 dígitos (móvel BR com 9). Drop DDI 55 se digitado pra evitar confusão.

function fmtPhoneLive(raw) {
  let d = String(raw||'').replace(/\D/g,'')
  // Se começou com 55 e tem 12-13 dígitos (DDI + DDD + número), remove o 55
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}
window.fmtPhoneLive = fmtPhoneLive  // expose pra reuso global

// Lista de países pra seleção de DDI no form de lead.
// Top usado em primeiro, depois ordem alfabética.
var COUNTRIES = [
  { code: 'BR', flag: '🇧🇷', dial: '55',  name: 'Brasil' },
  { code: 'US', flag: '🇺🇸', dial: '1',   name: 'Estados Unidos' },
  { code: 'PT', flag: '🇵🇹', dial: '351', name: 'Portugal' },
  { code: 'AR', flag: '🇦🇷', dial: '54',  name: 'Argentina' },
  { code: 'CL', flag: '🇨🇱', dial: '56',  name: 'Chile' },
  { code: 'CO', flag: '🇨🇴', dial: '57',  name: 'Colômbia' },
  { code: 'MX', flag: '🇲🇽', dial: '52',  name: 'México' },
  { code: 'PE', flag: '🇵🇪', dial: '51',  name: 'Peru' },
  { code: 'PY', flag: '🇵🇾', dial: '595', name: 'Paraguai' },
  { code: 'UY', flag: '🇺🇾', dial: '598', name: 'Uruguai' },
  { code: 'CA', flag: '🇨🇦', dial: '1',   name: 'Canadá' },
  { code: 'GB', flag: '🇬🇧', dial: '44',  name: 'Reino Unido' },
  { code: 'ES', flag: '🇪🇸', dial: '34',  name: 'Espanha' },
  { code: 'IT', flag: '🇮🇹', dial: '39',  name: 'Itália' },
  { code: 'FR', flag: '🇫🇷', dial: '33',  name: 'França' },
  { code: 'DE', flag: '🇩🇪', dial: '49',  name: 'Alemanha' },
  { code: 'AU', flag: '🇦🇺', dial: '61',  name: 'Austrália' },
  { code: 'JP', flag: '🇯🇵', dial: '81',  name: 'Japão' },
  { code: 'CN', flag: '🇨🇳', dial: '86',  name: 'China' },
  { code: 'IN', flag: '🇮🇳', dial: '91',  name: 'Índia' },
]

function getCountry(code) { return COUNTRIES.find(c => c.code === code) || COUNTRIES[0] }

// Click-outside handler do dropdown custom do modal de lead.
// Setup uma vez (idempotente) — limpa quando modal fecha.

function whatsappUrl(phone, name) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const number = digits.length >= 12 ? digits : '55' + digits
  const n = (name || '').trim().split(/\s+/)[0]
  const templates = [
    `${n}, oi! Tudo bem contigo?\nTava aqui e lembrei de você, tenho seu contato salvo, acho que a gente se cruzou em algum grupo ou projeto do mercado financeiro... Me conta, como foi sua última experiência com o mercado? Pergunto porque a minha foi horrível, fiquei bem chateada 😔`,
    `Oi! Tá por aí? Tem um minutinho?\nSeu contato tá salvo aqui no meu celular, imagino que seja de algum grupo ou projeto de investimentos que participamos juntos. Queria te perguntar: como foi sua experiência com o mercado ultimamente? Porque a minha foi péssima, fiquei muito frustrada 😕`,
    `${n}, tudo bem aí?\nPeguei seu contato de algum grupo ou projeto do mercado financeiro que a gente deve ter participado juntos. Me fala uma coisa, como tão sendo seus resultados? Os meus foram bem decepcionantes dessa última vez 😞`,
    `Oi, tudo certo por aí?\nTe encontrei aqui na minha lista, provavelmente de alguma comunidade ou projeto de finanças que compartilhamos. Posso te fazer uma pergunta rápida? Você teve boas experiências com o mercado recentemente? Porque eu saí bem machucada da minha última 😔`,
    `Eai ${n}! Você por aí?\nSeu número ficou salvo aqui comigo, deve ser de algum grupo ou iniciativa do mercado financeiro que a gente fez parte juntos. Me diz, você ainda tá ativo(a) em investimentos? Pergunto porque eu passei por uma experiência muito ruim e fiquei bem abalada 😕`,
    `Olá! Como você tá?\nVi seu contato aqui no celular, acredito que venha de algum projeto ou grupo de finanças que participamos em algum momento. Queria bater um papo, como foi pra você no mercado? Porque pra mim foi terrível, saí muito decepcionada 😞`,
    `${n}, boa tarde! Tudo bem?\nAchei seu contato aqui, imagino que seja de algum grupo ou projeto ligado a investimentos que cruzamos juntos. Me conta uma coisa: sua experiência com o mercado tem sido boa? Pergunto porque a minha foi péssima, fiquei bem frustrada dessa vez 😔`,
    `Ei, tudo certo?\nTeu contato tá aqui no meu celular, acho que a gente se conheceu por alguma iniciativa ou comunidade do mercado financeiro. Antes de tudo, queria saber, você ainda mexe com mercado? Porque eu tive uma experiência horrível recentemente e queria conversar sobre isso 😕`,
    `Oi ${n}! Sumido(a)!\nTe encontrei aqui nos meus contatos, provavelmente de algum projeto ou grupo de investimentos que participamos juntos em algum momento. Me fala, como tá sendo sua jornada no mercado? A minha foi bem negativa dessa última vez, fiquei chateada 😞`,
    `Olá! Você tá disponível agora?\nSeu contato ficou salvo aqui comigo, acredito que seja de algum grupo ou projeto do financeiro que a gente compartilhou. Queria te perguntar uma coisa: como foi sua última experiência com investimentos? Porque a minha foi muito ruim, saí bem abalada 😔`,
  ]
  // Sorteia aleatoriamente a cada clique para variar as mensagens
  const msg = templates[Math.floor(Math.random() * templates.length)]
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`
}


async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text; el.style.position='fixed'; el.style.opacity='0'
    document.body.appendChild(el); el.select(); document.execCommand('copy')
    document.body.removeChild(el)
  }
  showToast(`Copiado: ${text}`)
}

var _toastTimer = null

function fmtAudioTime(s) {
  if (!isFinite(s) || isNaN(s)) return '–:––'
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

var _AUDIO_BARS = '<i></i>'.repeat(28)

// Liga o <audio> ao container (.audio-bubble): atualiza tempo (parado=duração, tocando=elapsed),
// progresso da onda e ícones. Lida com o bug duration=Infinity em OGG/Opus do WhatsApp Web.

function fmtMsgError(m) {
  if (!m) return 'Mensagem não entregue.'
  const code = m.errorCode || ''
  const friendly = code && WA_ERRORS[code] ? WA_ERRORS[code] : null
  if (friendly) return code ? `${friendly} (${code})` : friendly
  if (m.errorMessage) return code ? `${m.errorMessage} (${code})` : m.errorMessage
  return code ? `Mensagem não entregue. (${code})` : 'Mensagem não entregue.'
}

// Ícones de status estilo WhatsApp (SVG inline, apenas para OUTBOUND)

function _fmtDateSep(date) {
  const now  = new Date()
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today - 86400000)
  const msgDay    = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (msgDay.getTime() === today.getTime())     return 'Hoje'
  if (msgDay.getTime() === yesterday.getTime()) return 'Ontem'
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function fmtAudioDur(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2,'0')}`
}


function fmtMin(m) {
  if (m === null || m === undefined) return '–'
  if (m < 60) return m + 'min'
  const h = Math.floor(m/60), r = m%60
  return h + 'h' + (r > 0 ? r + 'm' : '')
}


function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(dateStr).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
}

// ─── Inbox search (state persiste entre patches parciais) ────────────────────
var _inboxSearch = ''
var _inboxFilter = 'all' // 'all' | 'unread' | 'starred'


function autoResize(el) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 128) + 'px'
}


function renderKeepScroll() {
  const scroller = document.querySelector('.overflow-y-auto.bg-gray-50')
  const top = scroller ? scroller.scrollTop : 0
  render()
  if (top > 0) {
    const el = document.querySelector('.overflow-y-auto.bg-gray-50')
    if (el) el.scrollTop = top
  }
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

function fmtRelativeTime(d) {
  if (!d) return ''
  const now = new Date()
  const then = new Date(d)
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d`
  return then.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
}

// Variante para o kanban: sempre dias (sem fallback pra data) — pressão crescente
// pra o time mover leads. Resto do CRM usa fmtRelativeTime normal.

function fmtRelativeTimeKanban(d) {
  if (!d) return ''
  const diffMs = Date.now() - new Date(d).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d`
}

// ─── Audio context (lazy, global) ─────────────────────────────────────────────
var _audioCtx = null

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return _audioCtx
}
// Mantem AudioContext sempre ativo: a cada clique/tecla, tenta retomar se suspendeu.
// Browsers (Chrome) suspendem AudioContext apos inatividade — sem isso, polling toca som mudo.
var _notifAskedOnce = false
var _audioUnlocked = false

function _resumeAudio() {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  } catch {}
  // Unlock HTMLAudioElement: play silenciado uma vez pra liberar autoplay em background
  if (!_audioUnlocked && typeof _notifAudioEl !== 'undefined') {
    _audioUnlocked = true
    try {
      _notifAudioEl.muted = true
      _notifAudioEl.play().then(() => {
        _notifAudioEl.pause()
        _notifAudioEl.currentTime = 0
        _notifAudioEl.muted = false
      }).catch(() => { _notifAudioEl.muted = false })
    } catch {}
  }
  if (!_notifAskedOnce) {
    _notifAskedOnce = true
    ensureNotificationPermission()
  }
}
document.addEventListener('click', _resumeAudio, true)
document.addEventListener('keydown', _resumeAudio, true)
// Tambem tenta retomar quando aba volta a ficar visivel (gesture-equivalent em alguns browsers)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) _resumeAudio()
})

// ─── Notificações nativas do browser ────────────────────────────────────────
// Pop-up do OS via Notification API (foreground/background) + Web Push
// (com browser fechado, via service worker).

function toLocalInputValue(d) {
  const pad = n => String(n).padStart(2,'0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}


function formatSchedWhen(isoStr) {
  try {
    const d = new Date(isoStr)
    const diff = d.getTime() - Date.now()
    const min = Math.round(diff/60000)
    let rel = ''
    if (min < 1) rel = 'agora'
    else if (min < 60) rel = `em ${min}min`
    else if (min < 60*24) rel = `em ${Math.round(min/60)}h`
    else rel = `em ${Math.round(min/60/24)}d`
    const abs = d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    return `${abs} (${rel})`
  } catch { return isoStr }
}


function copyToClipboard(text, msg) {
  const label = msg || 'Copiado'
  ;(navigator.clipboard?.writeText(text) || Promise.reject())
    .then(() => showToast(label, 'success'))
    .catch(() => {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); showToast(label, 'success') }
      catch { showToast('Copie manualmente: ' + text.slice(0, 30) + '...', 'info') }
      document.body.removeChild(ta)
    })
}


function fmtBRL(n) {
  if (n == null) return '—'
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtNum(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('pt-BR')
}

function fmtPct(n) {
  if (n == null) return '—'
  return Number(n).toFixed(2).replace('.', ',') + '%'
}

function ymd(d) {
  if (typeof d === 'string') return d
  const x = d || new Date()
  return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0')
}
