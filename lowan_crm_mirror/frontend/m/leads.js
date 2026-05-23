// leads.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

function _setupLeadDdClickOutside() {
  // Reposiciona menu via position:fixed pra escapar de overflow:auto do card
  _positionLeadDdMenu()
  if (window._leadDdHandler) return
  window._leadDdHandler = (e) => {
    if (!S.leadModalDdOpen && !S.leadModalCountryOpen) return
    const inMenu = e.target.closest('.lm-dd-menu') || e.target.closest('.lds-menu')
    const inTrigger = e.target.closest('.lm-dd-trigger') || e.target.closest('.lm-tel-prefix-btn')
    if (inMenu || inTrigger) return
    let dirty = false
    if (S.leadModalDdOpen) { S.leadModalDdOpen = false; dirty = true }
    if (S.leadModalCountryOpen) { S.leadModalCountryOpen = false; dirty = true }
    if (dirty) { _positionLeadDdMenu(); render() }
  }
  // mousedown + capture phase: dispara ANTES do click e ANTES de focus em inputs,
  // garantindo que o dropdown fecha mesmo quando o user clica num <input> (que ia
  // ganhar foco e não bubblear click pro document de forma confiável).
  document.addEventListener('mousedown', window._leadDdHandler, true)
}

function _teardownLeadDdClickOutside() {
  if (window._leadDdHandler) {
    document.removeEventListener('mousedown', window._leadDdHandler, true)
    delete window._leadDdHandler
  }
  S.leadModalDdOpen = false
  S.leadModalCountryOpen = false
  // Remove menus portal'd órfãos do body
  document.body.querySelectorAll(':scope > .lm-dd-menu, :scope > .lm-country-menu').forEach(el => el.remove())
}
// Posiciona menu(s) abertos com position:fixed baseado no rect do trigger.
// Isso escapa do overflow:auto do card. Lida com dropdown de operador E país.
// PORTAL: move o menu pra document.body pra escapar de backdrop-filter
// no .modal-backdrop (que cria containing block e quebra position:fixed).

function _positionLeadDdMenu() {
  // Cleanup: remove menus órfãos no body se nada estiver aberto
  if (!S.leadModalDdOpen) {
    document.body.querySelectorAll(':scope > .lm-dd-menu:not(.lm-country-menu)').forEach(el => el.remove())
  }
  if (!S.leadModalCountryOpen) {
    document.body.querySelectorAll(':scope > .lm-country-menu').forEach(el => el.remove())
  }
  // Operador
  if (S.leadModalDdOpen) {
    const trigger = document.querySelector('.lm-dd .lm-dd-trigger')
    // Procura menu primeiro no modal, depois no body (caso já foi movido)
    let menu = document.querySelector('.lm-dd .lm-dd-menu:not(.lm-country-menu)')
    if (!menu) menu = document.body.querySelector(':scope > .lm-dd-menu:not(.lm-country-menu)')
    if (trigger && menu) {
      if (menu.parentElement !== document.body) document.body.appendChild(menu)
      _placeMenu(trigger, menu, trigger.getBoundingClientRect().width)
    }
  }
  // País — menu fica do mesmo tamanho do trigger (compacto, só com sigla + dial)
  if (S.leadModalCountryOpen) {
    const trigger = document.querySelector('.lm-tel-prefix-btn')
    let menu = document.querySelector('.lm-country-menu')
    if (!menu) menu = document.body.querySelector(':scope > .lm-country-menu')
    if (trigger && menu) {
      if (menu.parentElement !== document.body) document.body.appendChild(menu)
      const r = trigger.getBoundingClientRect()
      _placeMenu(trigger, menu, Math.max(r.width, 110))
    }
  }
}

function _patchLeadModalAvatar() {
  const av = document.querySelector('.lm-head-av')
  if (!av) return
  const name = (S.form?.name || '').trim()
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const hue = name ? Math.abs(name.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0)) % 360 : null
  if (hue !== null) {
    av.textContent = initials
    av.style.background = `hsl(${hue},55%,92%)`
    av.style.color = `hsl(${hue},55%,28%)`
    av.style.boxShadow = `0 0 0 1px hsl(${hue},55%,85%)`
    av.style.animation = ''
  } else {
    av.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>'
    av.style.background = 'linear-gradient(135deg,#6366f1 0%,#4f46e5 100%)'
    av.style.color = '#fff'
    av.style.boxShadow = '0 4px 12px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
    av.style.animation = 'lmFloat 3s ease-in-out infinite'
  }
}

// ─── Origin badge ────────────────────────────────────────────────────────────

async function fetchLeads(forceFull = false) {
  // Full-fetch: primeiro carregamento OU a cada LEADS_FULL_EVERY ciclos (safety net para deletados/dessincronizados)
  const doFull = forceFull || !_leadsFetchedAt || _leadsDeltaCycles >= LEADS_FULL_EVERY

  // Cache warmup — apenas no primeiro boot (doFull + dados ainda não carregados)
  if (doFull && !S.leadsLoaded) {
    const _leadsCached = crmCache.get('leads', crmCache.TTL.leads)
    if (_leadsCached?.length) {
      S.leads = _leadsCached
      S.leadsLoaded = true
      scheduleRender()
    }
  }

  const fetchedAt = new Date().toISOString()
  const url = (!doFull && _leadsFetchedAt) ? `/?since=${encodeURIComponent(_leadsFetchedAt)}` : '/'
  const _response = await api(url)
  _leadsFetchedAt = fetchedAt
  const leads = Array.isArray(_response) ? _response : (_response.data ?? [])
  const _isDelta = Array.isArray(_response) ? false : (_response.isDelta === true)

  if (!doFull && leads.length === 0) {
    // Delta vazio: nada mudou, preserva tudo
    _leadsDeltaCycles++
    S.leadsLoaded = true
    return
  }

  const localMap = {}
  for (const l of S.leads) localMap[l.id] = l

  // Aplica merge de preview/lastMessageAt/starred em todos os leads recebidos
  for (const l of leads) {
    if (l.lastMessagePreview) {
      S.msgPreviews[l.id] = { text: l.lastMessagePreview, out: l.lastMessageOut === true }
    }
    const local = localMap[l.id]
    if (local?.lastMessageAt) {
      if (!l.lastMessageAt || new Date(local.lastMessageAt) > new Date(l.lastMessageAt)) {
        l.lastMessageAt = local.lastMessageAt
      }
    }
    if (local?.starred !== undefined) l.starred = local.starred
    if (!l.avatarUrl && local?.avatarUrl) l.avatarUrl = local.avatarUrl
  }

  if (doFull) {
    // Full replace
    _leadsDeltaCycles = 0
    S.leads = leads
    // Cache só warm-up (primeiros leads ordenados por relevância). Reduzido pra evitar
    // QuotaExceededError em workspaces grandes — leads completos vêm do fetch da rede.
    const MAX_CACHE_LEADS = 100
    crmCache.set('leads', leads.length <= MAX_CACHE_LEADS ? leads : leads.slice(0, MAX_CACHE_LEADS))
  } else {
    // Merge delta: atualiza/insere os leads recebidos, mantém os demais
    _leadsDeltaCycles++
    const map = new Map(S.leads.map(l => [l.id, l]))
    for (const l of leads) map.set(l.id, { ...(map.get(l.id) || {}), ...l })
    S.leads = [...map.values()]
    // Propaga delta para S.inboxLeads
    if (S.inboxLeads.length > 0) {
      const imap = new Map(S.inboxLeads.map(l => [l.id, l]))
      for (const l of leads) {
        const merged = { ...(imap.get(l.id) || {}), ...l }
        if (merged.lastMessageAt) imap.set(l.id, merged)
      }
      S.inboxLeads = [...imap.values()]
    }
  }
  S.leadsLoaded = true
  if (S.kanban && !S.kanbanLoading) cleanOrphanStages()
  _scheduleAvatarQueue()
}
// Busca separada para o painel de Conversas: retorna todos os leads com mensagens,
// sem paginação, sem interferir com S.leads (que é paginado pela tabela de leads).

async function fetchTagOptions() {
  try { S.tagOptions = await api('/tag-options') } catch {}
}

function openLeadForm(lead=null) {
  S.editId = lead?.id||null
  let phoneCountry = 'BR'
  let phoneVal = lead?.phone || ''
  if (lead?.phone) {
    const digits = String(lead.phone).replace(/\D/g, '')
    // Detecta país pelo prefixo DDI (mais longo wins — ex: 351 antes de 35)
    const sorted = [...COUNTRIES].sort((a,b) => b.dial.length - a.dial.length)
    const match = sorted.find(c => digits.startsWith(c.dial))
    if (match) {
      phoneCountry = match.code
      // Para BR, mostra sem o 55 (formatador remove). Para outros, mantém local.
      phoneVal = digits.slice(match.dial.length)
    }
  }
  S.form = lead ? {
    name:lead.name, phone:phoneVal, phoneCountry,
    email:lead.email||'', origin:lead.origin||'', notes:lead.notes||'',
    assignedToId:lead.assignedToId||'',
  } : { name:'',phone:'',phoneCountry:'BR',email:'',origin:'',notes:'',assignedToId:'' }
  S.formError=''
  S.modal='lead'; render()
  // Garante que lista de operadores esteja carregada — caso o fetch do boot falhou ou está pendente.
  if (!S.users?.length && !S.usersLoading) fetchUsers().catch(()=>{})
}

var EMAIL_VALID_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/


async function submitLead() {
  if (S.formLoading) return
  const { name, phone, email, origin, notes, assignedToId } = S.form
  if (!name?.trim())  { S.formError='Nome obrigatório.';     render(); return }
  if (!phone?.trim()) { S.formError='Telefone obrigatório.'; render(); return }
  // Validação leve do telefone: 8+ dígitos
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) { S.formError='Telefone inválido (mínimo 8 dígitos).'; render(); return }
  // Email opcional, mas se preenchido precisa ser válido
  const emailTrimmed = (email||'').trim()
  if (emailTrimmed && !EMAIL_VALID_RE.test(emailTrimmed)) {
    S.formError='E-mail inválido.'; render(); return
  }
  // Prefixa DDI baseado no país selecionado (default BR=55).
  // Se o usuário já digitou com DDI, evita duplicar.
  const ctry = getCountry(S.form.phoneCountry || 'BR')
  let phoneToSend = digits
  if (!phoneToSend.startsWith(ctry.dial)) {
    phoneToSend = ctry.dial + phoneToSend
  }
  const body = { name:name.trim(), phone: phoneToSend,
    email: emailTrimmed || (S.editId ? null : undefined),
    origin:origin?.trim()||undefined,
    notes:notes?.trim()||undefined, assignedToId:assignedToId||null }
  S.formLoading = true; S.formError=''; render()
  try {
    if (S.editId) {
      const r = await api(`/${S.editId}`, { method:'PUT', body:JSON.stringify(body) })
      S.leads = S.leads.map(l=>l.id===S.editId?{...l, ...r}:l)
      showToast('Lead atualizado', 'success')
    } else {
      const r = await api('/', { method:'POST', body:JSON.stringify(body) })
      // Dispara re-fetch pra pegar stage/contactId/relacionamentos completos
      S.leads.unshift(r)
      fetchLeads().catch(()=>{})
      showToast('Lead criado', 'success')
    }
    S.formLoading = false
    closeModal()
  } catch(e) {
    S.formLoading = false
    S.formError = e.message || 'Falha ao salvar'
    render()
  }
}

// Migração concluída: status legado aposentado. Etapa (stageId) é a única fonte de verdade.
// Funções abaixo só manipulam stageId — backend ignora qualquer status enviado.


async function deleteLead() {
  try {
    const params = new URLSearchParams()
    if (S.deleteConversation) params.set('deleteConversation', 'true')
    if (S.deleteLeadBlacklist) params.set('blacklist', 'true')
    const qs = params.toString()
    const url = `/${S.deleteTarget}${qs ? '?' + qs : ''}`
    await api(url, { method:'DELETE' })
    const deleted = S.deleteTarget
    S.leads = S.leads.filter(l=>l.id!==deleted)
    delete S.msgPreviews[deleted]
    if (S.conversationLeadId === deleted) { S.conversationLeadId = null; S.conversation = null }
    if (S.newConvLeadId === deleted) S.newConvLeadId = null
    closeModal()
  } catch(e) { alert(e.message); closeModal() }
}


function triggerImport() {
  const inp = document.createElement('input')
  inp.type='file'; inp.accept='.csv,text/csv'
  inp.style.display='none'
  inp.onchange = e => {
    if (document.body.contains(inp)) document.body.removeChild(inp)
    if (e.target.files[0]) runImport(e.target.files[0])
  }
  document.body.appendChild(inp)
  inp.click()
}


function parseCsvLine(line, sep) {
  const r=[]; let cur='', q=false
  for (let i=0;i<line.length;i++) {
    const c=line[i]
    if (c==='"') { if (q&&line[i+1]==='"'){cur+='"';i++}else q=!q }
    else if (c===sep&&!q){r.push(cur);cur=''}
    else cur+=c
  }
  r.push(cur); return r
}


async function runImport(file) {
  try {
    let text = await file.text()
    if (text.charCodeAt(0)===0xFEFF) text=text.slice(1)
    const lines = text.split(/\r?\n/).filter(l=>l.trim())
    if (lines.length<2) { showToast('Arquivo vazio ou sem dados.','error'); return }
    const sep = lines[0].includes(';')?';':','
    const norm = s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_]/g,'')
    const headers = parseCsvLine(lines[0],sep).map(norm)
    const aliases={name:['nome','name'],phone:['telefone','phone','fone','celular','whatsapp'],
      origin:['origem','origin','fonte','source'],notes:['observacao','observacoes','notes','nota','notas','obs']}
    const idx={}
    headers.forEach((h,i)=>{ for(const[k,list]of Object.entries(aliases)){if(list.includes(h)&&!(k in idx)){idx[k]=i;break}} })
    if (idx.name===undefined&&idx.phone===undefined) { showToast('Colunas "nome"/"telefone" não encontradas.','error'); return }
    const get=(row,k)=>(idx[k]!==undefined?row[idx[k]]||'':'').trim()
    const items=[]
    for(let i=1;i<lines.length;i++){
      const row=parseCsvLine(lines[i],sep)
      const name=get(row,'name'), phone=get(row,'phone')
      if(!phone) continue
      items.push({name:name||phone,phone,origin:get(row,'origin')||undefined,notes:get(row,'notes')||undefined})
    }
    if (items.length===0) { showToast('Nenhum lead com telefone encontrado.','error'); return }
    // Armazena itens já parseados e abre modal para escolher atribuição
    S.importItems=items; S.modal='import_pick'; S.form={assignedToId:''}; S.formError=''; render()
  } catch(e) { showToast(e.message,'error') }
}


async function doImport() {
  const items = S.importItems
  if (!items?.length) { showToast('Nenhum item para importar','error'); return }
  const assignedToId = S.form.assignedToId || null
  const btn = document.querySelector('[onclick="doImport()"]')
  if (btn) { btn.disabled=true; btn.textContent='Importando...' }
  try {
    const r = await api('/import',{method:'POST',body:JSON.stringify({ assignedToId, items })})
    await fetchLeads()
    closeModal()
    showToast(`${r.imported} lead(s) importado(s)${r.skipped?`, ${r.skipped} duplicado(s) ignorado(s).`:'.'}`, 'success')
  } catch(e) {
    showToast('Erro ao importar: ' + e.message, 'error')
    if (btn) { btn.disabled=false; btn.textContent='Importar' }
  }
}

// ─── User actions ─────────────────────────────────────────────────────────────

function exportCsv() {
  const rows=filteredLeads()
  const hdr='nome,telefone,origem,observacao,status,atribuido_a,criado_em'
  const esc2=v=>`"${String(v||'').replace(/"/g,'""')}"`
  const lines=rows.map(l=>[
    esc2(l.name),l.phone||'',esc2(l.origin||''),esc2(l.notes||''),
    STATUS[l.status]?.label||l.status,
    l.assignedTo?.name||'',new Date(l.createdAt).toLocaleDateString('pt-BR')
  ].join(','))
  const csv='\uFEFF'+[hdr,...lines].join('\n')
  const a=document.createElement('a')
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}))
  a.download='leads.csv'; a.click()
}


function _getLeadsForCards() {
  const fp = `${S.filterUser}|${(S.filterTags||[]).join(',')}|${S.searchInput||S.search||''}`
  if (S.leads === _cLeadsRef && fp === _cLeadsFp && _cLeadsCache) return _cLeadsCache
  _cLeadsRef = S.leads; _cLeadsFp = fp
  _cLeadsCache = S.leads.filter(l => {
    if (isAdmin()&&S.filterUser!=='todos') {
      if (S.filterUser===''&&l.assignedToId!=null) return false
      if (S.filterUser!==''&&l.assignedToId!==S.filterUser) return false
    }
    const q=(S.searchInput||S.search||'').toLowerCase()
    if (!q && S.filterTags.length > 0 && !S.filterTags.some(ft => (l.tags||[]).includes(ft))) return false
    if (q&&!l.name.toLowerCase().includes(q)&&!(l.phone||'').includes(q)&&
      !(l.origin||'').toLowerCase().includes(q)&&!(l.assignedTo?.name||'').toLowerCase().includes(q)&&
      !(l.tags||[]).some(t=>(t||'').toLowerCase().includes(q))) return false
    return true
  })
  return _cLeadsCache
}

// Memoização de filteredLeads — server já aplica status/stage/user/search; cliente aplica só filterTags
var _fLeadsRef = null, _fLeadsFp = '', _fLeadsCache = null

function filteredLeads() {
  return S.leads.filter(l => {
    // Segurança: não-admin sem viewAllLeads só vê seus próprios leads
    if (!isAdmin() && !S.me?.permissions?.viewAllLeads && l.assignedToId !== S.me?.id) return false
    if (S.filterStage !== 'todos') {
      if (S.filterStage === 'sem_etapa') { if (l.stageId) return false }
      else if (l.stageId !== S.filterStage) return false
    }
    if (isAdmin() && S.filterUser !== 'todos') {
      if (S.filterUser === '' && l.assignedToId != null) return false
      if (S.filterUser !== '' && l.assignedToId !== S.filterUser) return false
    }
    const q = (S.searchInput || S.search || '').toLowerCase()
    if (!q && S.filterTags.length > 0 && !S.filterTags.some(ft => (l.tags||[]).includes(ft))) return false
    if (q && !l.name.toLowerCase().includes(q) && !(l.phone||'').includes(q) &&
      !(l.origin||'').toLowerCase().includes(q) && !(l.assignedTo?.name||'').toLowerCase().includes(q) &&
      !(l.tags||[]).some(t => (t||'').toLowerCase().includes(q))) return false
    return true
  })
}


function applySearch() {
  S.search = S.searchInput
  S.leadsPage = 0
  S.leadsScrollLimit = LEADS_PAGE_SIZE
  render()
  if (S.searchInput) requestAnimationFrame(() => filterLeadsTable(S.searchInput))
}


function applyLeadsFilter(changes) {
  Object.assign(S, changes)
  S.leadsPage = 0
  S.leadsScrollLimit = LEADS_PAGE_SIZE
  render()
}


// Data-Lite: infinite scroll na tabela de leads (modo lite). Observer
// monitora o sentinel renderizado depois da tbody; quando entra em
// viewport, incrementa S.leadsScrollLimit e re-renderiza.
var _leadsScrollObserver = null

function attachLeadsScrollListener() {
  if (_leadsScrollObserver) { _leadsScrollObserver.disconnect(); _leadsScrollObserver = null }
  const sentinel = document.querySelector('[data-leads-scroll-sentinel]')
  if (!sentinel) return
  _leadsScrollObserver = new IntersectionObserver(function(entries){
    for (const entry of entries) {
      if (entry.isIntersecting) {
        S.leadsScrollLimit = (S.leadsScrollLimit || LEADS_PAGE_SIZE) + LEADS_PAGE_SIZE
        if (typeof scheduleRender === 'function') scheduleRender()
        else render()
      }
    }
  }, { threshold: 0.1 })
  _leadsScrollObserver.observe(sentinel)
}


function clearFilters() {
  S.search = ''; S.searchInput = ''
  S.filterStatus = 'todos'; S.filterStage = 'todos'; S.filterUser = 'todos'; S.filterTags = []
  S.leadsPage = 0
  S.leadsScrollLimit = LEADS_PAGE_SIZE
  render()
}


function totals(leads) {
  const byStage = {}
  const stages = S.kanban?.stages || []
  stages.forEach(s => { byStage[s.id] = leads.filter(l => l.stageId === s.id).length })
  return {
    total: leads.length,
    sem_etapa: leads.filter(l => !l.stageId).length,
    byStage,
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
// ─── Kanban click-and-drag pan (estilo Trello/Notion) ────────────────────────
// Permite arrastar o board horizontalmente clicando em espaço vazio.
// Não interfere com: clique em card (abre lead), drag de card (move entre etapas),
// botões/inputs interativos. Threshold de 5px evita acionar em clique acidental.

function filterLeadsTable(q) {
  S.searchInput = q
  S.search = q.trim().toLowerCase()
  const term = S.search
  const rows = document.querySelectorAll('#leads-tbody tr[data-search]')
  let visible = 0
  rows.forEach(row => {
    const match = !term || row.dataset.search.includes(term)
    row.style.display = match ? '' : 'none'
    if (match) visible++
  })
  clearTimeout(filterLeadsTable._t)
  filterLeadsTable._t = setTimeout(() => {
    if (!document.getElementById('leads-tbody')) return
    const inp = document.getElementById('leads-search-input')
    const ss = inp?.selectionStart ?? q.length
    const se = inp?.selectionEnd ?? q.length
    render()
    requestAnimationFrame(() => {
      const i = document.getElementById('leads-search-input')
      if (i) { i.focus(); try { i.setSelectionRange(ss, se) } catch(_){} }
    })
  }, 250)
  // Mostra/oculta mensagem de "nenhum resultado"
  let empty = document.getElementById('leads-empty-search')
  if (!empty && rows.length > 0) {
    empty = document.createElement('tr')
    empty.id = 'leads-empty-search'
    empty.innerHTML = '<td colspan="10" style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum lead encontrado para "<span id="leads-empty-term"></span>"</td>'
    rows[0].parentNode.appendChild(empty)
  }
  if (empty) {
    const termEl = empty.querySelector('#leads-empty-term')
    if (termEl) termEl.textContent = q
    empty.style.display = (term && visible === 0) ? '' : 'none'
  }
}

// Atualiza apenas o badge de não lidos no sidebar — sem rebuild da tela de Leads

function _patchLeadsBadges() {
  const unread = S.leads.filter(l => isAdmin() ? l.unreadCount > 0 : (l.assignedToId === S.me?.id && l.unreadCount > 0)).length
  const badge = document.getElementById('sidebar-badge-inbox')
  if (badge) {
    badge.textContent = unread > 0 ? unread : ''
    badge.style.display = unread > 0 ? '' : 'none'
  }
}


function openShareContactModal() {
  const leadId = S.conversationLeadId
  if (!leadId) return

  function renderContactItems(contacts, allowDelete) {
    if (!contacts.length) return `<p style="text-align:center;color:#9ca3af;font-size:13px;padding:28px 20px">Nenhum contato na agenda.<br><span style="font-size:12px">Adicione um acima.</span></p>`
    return contacts.map(c => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #f3f4f6">
        <button onclick="shareContactSend('${esc(c.name||c.phone)}','${esc(c.phone)}')"
          style="flex:1;display:flex;align-items:center;gap:10px;background:transparent;border:none;cursor:pointer;text-align:left;padding:0;min-width:0"
          onmouseover="this.querySelector('.sc-name').style.color='var(--accent)'" onmouseout="this.querySelector('.sc-name').style.color=''">
          <div style="width:36px;height:36px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;font-weight:700;color:#4f46e5">${esc((c.name||c.phone||'?')[0].toUpperCase())}</div>
          <div style="min-width:0">
            <p class="sc-name" style="margin:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color 0.15s">${esc(c.name||c.phone)}</p>
            <p style="margin:1px 0 0;font-size:11px;color:#9ca3af">${esc(fmtPhone(c.phone))}</p>
          </div>
        </button>
        ${allowDelete ? `<button onclick="window._scDelete('${c.id}')" title="Remover da agenda"
          style="flex-shrink:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#d1d5db;font-size:14px"
          onmouseover="this.style.color='#ef4444';this.style.background='#fef2f2'" onmouseout="this.style.color='#d1d5db';this.style.background='transparent'">✕</button>` : ''}
      </div>`).join('')
  }

  const modal = document.createElement('div')
  modal.id = 'share-contact-modal'
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45)'
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:380px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,0.2);overflow:hidden;display:flex;flex-direction:column;max-height:84vh">
      <div style="padding:14px 14px 12px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <h3 style="margin:0;font-size:15px;font-weight:700">Compartilhar contato</h3>
          <p style="margin:2px 0 0;font-size:11px;color:#9ca3af">Agenda compartilhada com todos os operadores</p>
        </div>
        <button onclick="document.getElementById('share-contact-modal')?.remove()" style="width:28px;height:28px;border-radius:50%;background:#f3f4f6;border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:#6b7280">&times;</button>
      </div>

      <!-- Adicionar à agenda -->
      <div style="padding:11px 12px 13px;border-bottom:1px solid #f3f4f6;flex-shrink:0;background:#fafafa">
        <p style="margin:0 0 7px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af">Salvar novo contato</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          <input id="sc-new-name" type="text" placeholder="Nome"
            style="padding:7px 11px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;font-family:inherit;background:#fff"
            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='#e5e7eb'"
            onkeydown="if(event.key==='Enter')document.getElementById('sc-new-phone')?.focus()"/>
          <div style="display:flex;gap:6px">
            <input id="sc-new-phone" type="tel" placeholder="Telefone (com DDD)"
              style="flex:1;padding:7px 11px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;font-family:inherit;background:#fff"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='#e5e7eb'"
              onkeydown="if(event.key==='Enter')window._scSaveAndSend()"/>
            <button onclick="window._scSaveAndSend()" id="sc-save-btn"
              style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit"
              onmouseover="this.style.opacity='0.88'" onmouseout="this.style.opacity='1'">Salvar e enviar</button>
          </div>
        </div>
      </div>

      <!-- Busca na agenda -->
      <div style="padding:9px 12px;flex-shrink:0;border-bottom:1px solid #f0f0f0">
        <div style="display:flex;align-items:center;gap:7px;background:#f0f2f5;border-radius:20px;padding:7px 12px">
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="flex-shrink:0;opacity:0.45"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input id="share-contact-search" type="text" placeholder="Buscar na agenda..."
            style="flex:1;border:none;background:transparent;font-size:13px;outline:none;font-family:inherit;min-width:0"
            oninput="window._scSearch(this.value)"/>
        </div>
      </div>
      <div id="share-contact-list" style="flex:1;overflow-y:auto;min-height:0">
        <p style="text-align:center;color:#9ca3af;font-size:13px;padding:28px 20px">Carregando...</p>
      </div>
    </div>`
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
  document.body.appendChild(modal)

  // Load initial list
  let _allContacts = []
  api('/contact-book').then(list => {
    _allContacts = list || []
    const el = document.getElementById('share-contact-list')
    if (el) el.innerHTML = renderContactItems(_allContacts, true)
  }).catch(() => {
    const el = document.getElementById('share-contact-list')
    if (el) el.innerHTML = `<p style="text-align:center;color:#ef4444;font-size:13px;padding:20px">Erro ao carregar agenda</p>`
  })

  let _scTimer = null
  window._scSearch = (q) => {
    const listEl = document.getElementById('share-contact-list')
    if (!listEl) return
    clearTimeout(_scTimer)
    if (!q.trim()) { listEl.innerHTML = renderContactItems(_allContacts, true); return }
    _scTimer = setTimeout(async () => {
      try {
        const results = await api(`/contact-book?search=${encodeURIComponent(q.trim())}`)
        listEl.innerHTML = renderContactItems(results || [], true)
      } catch { listEl.innerHTML = `<p style="text-align:center;color:#ef4444;font-size:13px;padding:20px">Erro ao buscar</p>` }
    }, 350)
  }

  window._scSaveAndSend = async () => {
    const name = document.getElementById('sc-new-name')?.value.trim()
    const phone = document.getElementById('sc-new-phone')?.value.trim()
    if (!phone) { document.getElementById('sc-new-phone')?.focus(); return }
    const btn = document.getElementById('sc-save-btn')
    if (btn) { btn.disabled = true; btn.textContent = '...' }
    try {
      await api('/contact-book', { method: 'POST', body: JSON.stringify({ name: name || phone, phone }) })
    } catch(e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar e enviar' }
      if (!e.message?.includes('já existe')) { showToast(e.message || 'Erro ao salvar', 'error'); return }
    }
    shareContactSend(name || phone, phone)
  }

  window._scDelete = async (contactId) => {
    try {
      await api(`/contact-book/${contactId}`, { method: 'DELETE' })
      _allContacts = _allContacts.filter(c => c.id !== contactId)
      const listEl = document.getElementById('share-contact-list')
      if (listEl) listEl.innerHTML = renderContactItems(_allContacts, true)
    } catch(e) { showToast(e.message || 'Erro ao remover', 'error') }
  }

  setTimeout(() => document.getElementById('sc-new-name')?.focus(), 50)
}


function _skeletonRow() {
  return `<tr style="border-bottom:1px solid var(--border)">
    ${[40,140,100,90,80,70,60].map(w=>`<td style="padding:11px 12px"><div style="height:12px;width:${w}px;background:linear-gradient(90deg,var(--border) 25%,var(--surface-2) 50%,var(--border) 75%);background-size:400% 100%;border-radius:6px;animation:skeletonShimmer 1.4s ease infinite"></div></td>`).join('')}
  </tr>`
}


function renderLeadsPanel() {
  // ── View "Bloqueados" (lista alternativa) ──
  if (S.viewBlocked) {
    if (!S.blockedLoaded && !S.blockedLoading) fetchBlockedLeads().catch(()=>{})
    const list = S.blockedLeads || []
    return `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="lds-fbtn" onclick="S.viewBlocked=false;render()" style="display:flex;align-items:center;gap:6px">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          Voltar pros leads ativos
        </button>
        <h2 style="font-family:'Bricolage Grotesque',serif;font-size:22px;font-weight:800;letter-spacing:-0.025em;color:var(--text-primary);margin:0">Leads bloqueados</h2>
        <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-muted);background:var(--surface-2);padding:3px 9px;border-radius:99px">${list.length}</span>
        <button class="lds-fbtn" onclick="fetchBlockedLeads()" style="margin-left:auto" title="Atualizar">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;${S.blockedLoading?'animation:spin 0.7s linear infinite':''}"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        </button>
      </div>
      ${S.blockedLoading && list.length===0 ? `<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">Carregando...</div>` :
        list.length === 0 ? `
        <div class="lds-empty">
          <div class="ic">🚫</div>
          <h3>Nenhum lead bloqueado</h3>
          <p>Quando você bloquear um lead pelos detalhes da conversa, ele aparece aqui.</p>
        </div>` :
        `<div style="background:#fff;border-radius:12px;border:1px solid var(--border);overflow:hidden">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:var(--surface-2);border-bottom:1px solid var(--border)">
              ${['Nome','Telefone','Origem','Bloqueado em','Ações'].map(h=>`<th style="padding:11px 14px;text-align:left;font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em">${h}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${list.map(l => {
                const blockedAt = l.blockedAt ? new Date(l.blockedAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—'
                const isTg = (l.phone||'').startsWith('tg_')
                return `
                <tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.12s" onclick="openConversation('${l.id}')" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
                  <td style="padding:11px 14px">
                    <div style="display:flex;align-items:center;gap:9px">
                      ${_leadAvatar(l, 32)}
                      <span style="font-weight:600;color:var(--text-primary)">${esc(l.name||'Sem nome')}</span>
                    </div>
                  </td>
                  <td style="padding:11px 14px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-secondary)">${isTg ? esc(l.phone) : esc(fmtPhone(l.phone)||l.phone||'—')}</td>
                  <td style="padding:11px 14px;color:var(--text-muted);font-size:12px">${esc(l.origin||'—')}</td>
                  <td style="padding:11px 14px;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--text-muted)">${blockedAt}</td>
                  <td style="padding:11px 14px;text-align:right">
                    <button class="lds-fbtn" onclick="event.stopPropagation();unblockFromList('${l.id}')" style="font-size:11.5px;padding:5px 11px;color:var(--cn-q-good);border-color:var(--cn-q-good-border);background:var(--cn-q-good-bg)" title="Desbloquear">
                      Desbloquear
                    </button>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>`}
    </div>`
  }

  if (!S.leadsLoaded) {
    return `
    <style>@keyframes skeletonShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}</style>
    <div style="display:flex;flex-direction:column;gap:16px">
      <!-- Barra de ações desabilitada (skeleton) -->
      <div style="display:flex;gap:8px;align-items:center">
        <div style="height:34px;width:260px;background:linear-gradient(90deg,var(--border) 25%,var(--surface-2) 50%,var(--border) 75%);background-size:400% 100%;border-radius:8px;animation:skeletonShimmer 1.4s ease infinite"></div>
        <div style="height:34px;width:140px;background:linear-gradient(90deg,var(--border) 25%,var(--surface-2) 50%,var(--border) 75%);background-size:400% 100%;border-radius:8px;animation:skeletonShimmer 1.4s ease infinite 0.1s"></div>
        <div style="margin-left:auto;height:34px;width:100px;background:linear-gradient(90deg,var(--border) 25%,var(--surface-2) 50%,var(--border) 75%);background-size:400% 100%;border-radius:8px;animation:skeletonShimmer 1.4s ease infinite 0.2s"></div>
      </div>
      <!-- Tabela skeleton -->
      <div style="background:#fff;border-radius:12px;border:1px solid var(--border);overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:var(--surface-2);border-bottom:1px solid var(--border)">
            ${['','Nome','Telefone','Origem','Atribuído','Status','Última msg'].map(h=>`<th style="padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}
          </tr></thead>
          <tbody>${Array(8).fill(0).map(_skeletonRow).join('')}</tbody>
        </table>
      </div>
    </div>`
  }

  const allLeads=filteredLeads()
  const totalLeads = allLeads.length
  const totalPages = Math.ceil(totalLeads / LEADS_PAGE_SIZE)
  if (S.leadsPage >= totalPages && totalPages > 0) S.leadsPage = totalPages - 1
  // Data-Lite: infinite scroll em vez de botões prev/next. Renderiza 0 até
  // S.leadsScrollLimit (cresce em incrementos de LEADS_PAGE_SIZE quando o
  // sentinel entra em viewport). Default já carrega 1 página.
  if (typeof S.leadsScrollLimit !== 'number' || S.leadsScrollLimit < LEADS_PAGE_SIZE) {
    S.leadsScrollLimit = LEADS_PAGE_SIZE
  }
  const useLiteScroll = DL.enabled()
  const leads = useLiteScroll
    ? allLeads.slice(0, S.leadsScrollLimit)
    : allLeads.slice(S.leadsPage * LEADS_PAGE_SIZE, (S.leadsPage + 1) * LEADS_PAGE_SIZE)
  const hasMoreScroll = useLiteScroll && totalLeads > leads.length
  const leadsForCards = _getLeadsForCards()
  const t = totals(leadsForCards)

  // Quando localStorage.useDataLite === '1', vem do summary endpoint (PR #24)
  // via window.DL.counter — fallback automático para o cálculo em S.leads.
  const _legacyTotalAll = (S.leadsTotal && S.leadsTotal > S.leads.length) ? S.leadsTotal : S.leads.length
  const totalAll        = DL.counter('leads', s => s.total,       () => _legacyTotalAll)
  const semEtapaCount   = DL.counter('leads', s => s.semEtapa,    () => S.leads.filter(l => !l.stageId).length)
  const semOpCount      = DL.counter('leads', s => s.semOperador, () => S.leads.filter(l => !l.assignedToId).length)
  const aguardandoCount = DL.counter('leads', s => s.unread,      () => S.leads.filter(l => l.unreadCount > 0).length)
  const stages = S.kanban?.stages || []
  const hasFilters = !!(S.search || S.searchInput || S.filterStage !== 'todos' || S.filterUser !== 'todos' || S.filterTags.length > 0)

  // Stage chips (todos + sem etapa + cada etapa + bloqueados)
  const stageChipsHtml = [
    `<button class="lds-stage-chip ${S.filterStage==='todos'?'active':''}" onclick="applyLeadsFilter({filterStage:'todos'})">Todas <span class="count">${t.total}</span></button>`,
    ...(t.sem_etapa > 0 ? [`<button class="lds-stage-chip ${S.filterStage==='sem_etapa'?'active':''}" onclick="applyLeadsFilter({filterStage:'sem_etapa'})"><span class="dot" style="background:#94a3b8"></span>Sem Etapa <span class="count">${t.sem_etapa}</span></button>`] : []),
    ...stages.map(s => {
      const active = S.filterStage === s.id
      return `<button class="lds-stage-chip ${active?'active':''}" onclick="applyLeadsFilter({filterStage:'${s.id}'})"><span class="dot" style="background:${esc(s.color||'#94a3b8')}"></span>${esc(s.name)} <span class="count">${t.byStage[s.id]||0}</span></button>`
    }),
    `<button class="lds-stage-chip" onclick="S.viewBlocked=true;if(!S.blockedLoaded)fetchBlockedLeads();else render()" title="Ver leads bloqueados" style="border-color:var(--cn-q-bad-border);color:var(--cn-q-bad)"><span class="dot" style="background:var(--cn-q-bad)"></span>Bloqueados</button>`,
  ].join('')

  // Tag filter — colapsado por padrão; botão "Tags" no actions row expande
  const tagsAvailable = (S.tagOptions || [])
  const activeTagsCount = S.filterTags.length
  const tagsOpen = !!S._lds_tagsOpen
  const tagsHtml = (tagsAvailable.length > 0 && tagsOpen) ? `
  <div class="lds-tags-row">
    <span class="lds-tags-label">Tags:</span>
    ${tagsAvailable.map(tag => {
      const active = S.filterTags.includes(tag)
      const count = S.leads.filter(l => (l.tags||[]).includes(tag)).length
      const tagEsc = esc(tag).replace(/'/g,"\\'")
      return `<button class="lds-tag-chip ${active?'active':''}" onclick="(function(){const i=S.filterTags.indexOf('${tagEsc}');if(i>-1)S.filterTags.splice(i,1);else S.filterTags.push('${tagEsc}');S.leadsPage=0;render()})()">${esc(tag)} <span class="count">${count}</span></button>`
    }).join('')}
  </div>` : ''

  // Bulk bar
  const bulkBar = (isAdmin() && S.selected.size > 0) ? `
  <div class="lds-bulk">
    <span class="count">${S.selected.size}</span> selecionado${S.selected.size>1?'s':''}
    <button class="lds-bulk-btn" onclick="openBulkAssign()">Atribuir operador</button>
    <div style="flex:1"></div>
    <button class="lds-bulk-clear" onclick="clearSelection()">✕ Limpar</button>
  </div>` : ''

  // Empty state
  const emptyHtml = `
  <div class="lds-empty">
    <div class="ic">📋</div>
    <h3>Nenhum lead encontrado</h3>
    <p>${hasFilters ? 'Ajuste os filtros pra ampliar a busca.' : 'Crie seu primeiro lead pra começar.'}</p>
    ${hasFilters ? `<button class="lds-fbtn" onclick="clearFilters()">Limpar filtros</button>` : ((isAdmin()||S.me?.permissions?.manageLeads) ? `<button class="lds-fbtn lds-fbtn-primary" onclick="openLeadForm()"><svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>Novo lead</button>` : '')}
  </div>`

  // Table rows
  const rowsHtml = leads.map(l => {
    const initials = (l.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()
    const hue = Math.abs((l.name||'?').split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
    const isTg = (l.phone || '').startsWith('tg_')
    const channel = isTg ? '<span class="lds-chbadge lds-ch-tg">T</span>' : '<span class="lds-chbadge lds-ch-wa">W</span>'
    const visTags = (l.tags || []).slice(0, 3)
    const moreTags = Math.max(0, (l.tags||[]).length - 3)
    const tagClass = (tg) => {
      const lower = String(tg).toLowerCase()
      if (lower === 'telegram') return 'lds-itag tg'
      if (lower === 'vip') return 'lds-itag vip'
      if (lower.includes('agente')) return 'lds-itag agente'
      return 'lds-itag'
    }
    const _srch = esc([l.name,l.phone,l.origin,l.assignedTo?.name,...(l.tags||[])].filter(Boolean).join(' ').toLowerCase())
    const isSel = S.selected.has(l.id)
    const curStage = stages.find(s => s.id === l.stageId)
    const stageName = curStage?.name || 'Sem Etapa'
    const stageColor = curStage?.color || '#94a3b8'
    const op = l.assignedTo
    const opHue = op ? Math.abs(op.name.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360 : 0

    return `
    <tr data-search="${_srch}" data-lead-id="${l.id}"${isSel?' class="selected"':''} onclick="ldsRowClick(event,'${l.id}')">
      ${isAdmin()?`<td style="width:36px"><input type="checkbox" class="lds-cb" ${isSel?'checked':''} onclick="event.stopPropagation();toggleSelect('${l.id}')"></td>`:''}
      <td>
        <div class="lds-leadcell">
          ${_leadAvatar(l, 32)}
          <div class="lds-leadname-block">
            <div class="lds-leadname">${esc(l.name)}${l.unreadCount > 0 ? ` <span class="lds-unread">${l.unreadCount}</span>` : ''}</div>
            ${visTags.length ? `<div class="lds-tags-inline">${visTags.map(tg => `<span class="${tagClass(tg)}">${esc(tg)}</span>`).join('')}${moreTags > 0 ? `<span class="lds-itag">+${moreTags}</span>` : ''}</div>` : ''}
          </div>
        </div>
      </td>
      <td><div class="lds-phone">${channel}${l.phone ? esc(fmtPhone(l.phone)) : '—'}</div></td>
      <td>${l.origin ? `<span class="lds-origin"><span class="dot"></span>${esc(l.origin)}</span>` : '<span style="color:var(--text-muted);font-size:12px">—</span>'}</td>
      <td>
        <span class="lds-pill-trigger" onclick="event.stopPropagation();ldsToggleStageMenu(this,'${l.id}')">
          <span class="dot" style="background:${esc(stageColor)}"></span>${esc(stageName)}
          <svg class="chevron" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </span>
      </td>
      <td>
        <span class="lds-op-trigger" onclick="event.stopPropagation();ldsToggleOpMenu(this,'${l.id}')">
          ${op ? `<span class="lds-op-av" style="background:hsl(${opHue},55%,88%);color:hsl(${opHue},55%,35%)">${esc(op.name.charAt(0).toUpperCase())}</span><span class="lds-op-name">${esc(op.name)}</span>` : `<span class="lds-op-av empty">?</span><span class="lds-op-name" style="color:var(--text-muted);font-style:italic">Sem operador</span>`}
          <svg class="lds-op-chev" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </span>
      </td>
      <td>${l.lastMessageAt ? `<span class="lds-lastact">${fmtRelativeTime(l.lastMessageAt)}</span>` : '<span style="color:var(--text-muted);font-size:11px">—</span>'}</td>
      <td>
        <div class="lds-row-actions">
          ${(isAdmin()||S.me?.permissions?.manageLeads) ? `<button class="lds-row-action" title="Editar" onclick="event.stopPropagation();openLeadForm(${JSON.stringify(l).replace(/"/g,'&quot;')})"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''}
          ${canDeleteLead(l) ? `<button class="lds-row-action danger" title="Excluir" onclick="event.stopPropagation();confirmDeleteLead('${l.id}')"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V3a1 1 0 011-1h4a1 1 0 011 1v4"/></svg></button>` : ''}
        </div>
      </td>
    </tr>`
  }).join('')

  return `
    <div class="lds-page-head">
      <div>
        <h1 class="lds-page-h1">Leads</h1>
        <div class="lds-page-meta">
          <span class="lds-pipe-pill"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg><strong>${totalAll.toLocaleString('pt-BR').replace(',','.')}</strong> leads no total</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isAdmin()?`<button class="lds-fbtn" onclick="openRedistribute()"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>Distribuir</button>
        <button class="lds-fbtn" onclick="triggerImport()"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Importar</button>`:''}
        <button class="lds-fbtn" onclick="exportCsv()"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Exportar</button>
        ${(isAdmin()||S.me?.permissions?.manageLeads)?`<button class="lds-fbtn lds-fbtn-primary" onclick="openLeadForm()"><svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>Novo lead</button>`:''}
      </div>
    </div>

    <div class="lds-rail">
      <div class="lds-rail-item"><div class="lds-rail-label">Total no workspace</div><div class="lds-rail-num">${totalAll.toLocaleString('pt-BR').replace(',','.')}</div></div>
      <div class="lds-rail-item"><div class="lds-rail-label">Sem etapa</div><div class="lds-rail-num">${semEtapaCount.toLocaleString('pt-BR').replace(',','.')}</div><div class="lds-rail-meta">${totalAll>0?Math.round((semEtapaCount/totalAll)*100):0}% da base</div></div>
      <div class="lds-rail-item"><div class="lds-rail-label">Sem operador</div><div class="lds-rail-num">${semOpCount.toLocaleString('pt-BR').replace(',','.')}</div><div class="lds-rail-meta">aguardando atribuição</div></div>
      <div class="lds-rail-item"><div class="lds-rail-label">Aguardando resposta</div><div class="lds-rail-num">${aguardandoCount.toLocaleString('pt-BR').replace(',','.')}</div><div class="lds-rail-meta">com mensagens não lidas</div></div>
    </div>

    <div class="lds-body">
      <div class="lds-stage-row">${stageChipsHtml}</div>

      <div class="lds-actions">
        <div class="lds-search">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input id="leads-search-input" type="text" placeholder="Buscar nome, telefone, origem..." value="${esc(S.searchInput)}" oninput="filterLeadsTable(this.value)" onkeydown="if(event.key==='Escape'){filterLeadsTable('');this.value=''}">
        </div>
        ${isAdmin() ? renderCDD({id:'cdd-filter-user',value:S.filterUser,options:[{value:'todos',label:'Todos os colaboradores'},{value:'',label:'Sem atribuição'},...S.users.map(u=>({value:u.id,label:u.name}))],onchange:"applyLeadsFilter({filterUser:this.value})"}) : ''}
        ${tagsAvailable.length > 0 ? `<button class="lds-fbtn ${activeTagsCount > 0 || tagsOpen ? 'lds-fbtn-active' : ''}" onclick="ldsToggleTagsRow()" title="${tagsOpen?'Esconder':'Mostrar'} filtros de tag">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>
          Tags${activeTagsCount > 0 ? ` <span class="lds-fbtn-badge">${activeTagsCount}</span>` : ''}
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:11px;height:11px;transition:transform 0.18s var(--bc-easing);${tagsOpen?'transform:rotate(180deg)':''}"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </button>` : ''}
        ${hasFilters ? `<button class="lds-fbtn" onclick="clearFilters()"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>Limpar filtros</button>` : ''}
        <div class="lds-actions-spacer"></div>
      </div>

      ${bulkBar}

      ${tagsHtml}

      ${leads.length === 0 ? emptyHtml : `
      <div class="lds-tablewrap">
        <div class="lds-table-scroll">
        <table class="lds-table">
          <thead>
            <tr>
              ${isAdmin() ? `<th style="width:36px"><input type="checkbox" class="lds-cb" ${filteredLeads().every(l=>S.selected.has(l.id))?'checked':''} onchange="toggleSelectAll()"></th>` : ''}
              <th>Lead</th>
              <th>Telefone</th>
              <th>Origem</th>
              <th>Etapa</th>
              <th>Operador</th>
              <th>Última msg</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody id="leads-tbody">${rowsHtml}</tbody>
        </table>
        </div>
        ${useLiteScroll && hasMoreScroll ? `
        <div class="lds-scroll-sentinel" data-leads-scroll-sentinel="1" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;color:var(--text-muted);font-size:12px">
          <svg style="width:14px;height:14px;animation:spin 0.8s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          <span>${(totalLeads - leads.length).toLocaleString('pt-BR').replace(',','.')} restantes · role pra carregar</span>
        </div>` : (totalPages > 1 && !useLiteScroll ? `
        <div class="lds-pag">
          <div class="lds-pag-info">Mostrando <strong>${(S.leadsPage * LEADS_PAGE_SIZE + 1).toLocaleString('pt-BR').replace(',','.')}–${Math.min((S.leadsPage + 1) * LEADS_PAGE_SIZE, totalLeads).toLocaleString('pt-BR').replace(',','.')}</strong> de <strong>${totalLeads.toLocaleString('pt-BR').replace(',','.')}</strong></div>
          <div class="lds-pag-btns">
            <button class="lds-pag-btn" ${S.leadsPage===0?'disabled':''} onclick="S.leadsPage=Math.max(0,S.leadsPage-1);render()"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
            <button class="lds-pag-btn active">${S.leadsPage+1}</button>
            <span style="color:var(--text-muted);padding:0 6px;align-self:center">de ${totalPages}</span>
            <button class="lds-pag-btn" ${S.leadsPage>=totalPages-1?'disabled':''} onclick="S.leadsPage=Math.min(${totalPages-1},S.leadsPage+1);render()"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
          </div>
        </div>` : '')}
      </div>`}
    </div>
  `
}

// ─── Helpers do redesign de Leads ─────────────────────────────────────────────

function ldsRowClick(event, leadId) {
  if (event.target.closest('button, input, .lds-pill-trigger, .lds-op-trigger, .lds-menu')) return
  openConversation(leadId)
}


function ldsToggleTagsRow() {
  S._lds_tagsOpen = !S._lds_tagsOpen
  render()
}

var _ldsActiveMenu = null

function ldsCloseAllMenus() {
  if (_ldsActiveMenu) {
    _ldsActiveMenu.menu.remove()
    _ldsActiveMenu.trigger.classList.remove('open')
    _ldsActiveMenu = null
  }
}

function ldsToggleStageMenu(trigger, leadId) {
  if (trigger.classList.contains('open')) { ldsCloseAllMenus(); return }
  ldsCloseAllMenus()
  const lead = S.leads.find(l => l.id === leadId)
  if (!lead) return
  trigger.classList.add('open')
  const stages = S.kanban?.stages || []
  const items = [
    `<button class="lds-menu-item ${!lead.stageId?'selected':''}" data-name="sem etapa" onclick="ldsSelectStage('${leadId}','')"><span class="dot" style="background:#94a3b8"></span><span>Sem Etapa</span>${!lead.stageId ? '<svg class="check" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : ''}</button>`,
    ...stages.map(s => {
      const active = lead.stageId === s.id
      const dataName = (s.name || '').toLowerCase().replace(/"/g,'&quot;')
      return `<button class="lds-menu-item ${active?'selected':''}" data-name="${dataName}" onclick="ldsSelectStage('${leadId}','${s.id}')"><span class="dot" style="background:${esc(s.color||'#94a3b8')}"></span><span>${esc(s.name)}</span>${active ? '<svg class="check" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : ''}</button>`
    })
  ].join('')
  const menu = document.createElement('div')
  menu.className = 'lds-menu'
  menu.innerHTML = `<div class="lds-menu-search"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><input type="text" placeholder="Buscar etapa..." oninput="ldsFilterMenu(this)"></div>${items}`
  trigger.appendChild(menu)
  _ldsActiveMenu = { menu, trigger }
  setTimeout(() => menu.querySelector('input')?.focus(), 0)
}

function ldsSelectStage(leadId, stageId) {
  ldsCloseAllMenus()
  changeStage(leadId, stageId)
}

function ldsToggleOpMenu(trigger, leadId) {
  if (trigger.classList.contains('open')) { ldsCloseAllMenus(); return }
  ldsCloseAllMenus()
  const lead = S.leads.find(l => l.id === leadId)
  if (!lead) return
  trigger.classList.add('open')
  const items = [
    `<button class="lds-menu-item ${!lead.assignedToId?'selected':''}" data-name="sem operador" onclick="ldsSelectOp('${leadId}','')"><span class="lds-op-av empty" style="width:18px;height:18px;font-size:8px">?</span><span style="color:var(--text-muted);font-style:italic">— Sem operador</span>${!lead.assignedToId ? '<svg class="check" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : ''}</button>`,
    `<div class="lds-menu-divider"></div>`,
    ...S.users.map(u => {
      const active = u.id === lead.assignedToId
      const hue = Math.abs(u.name.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
      const initial = u.name.charAt(0).toUpperCase()
      const dataName = (u.name || '').toLowerCase().replace(/"/g,'&quot;')
      return `<button class="lds-menu-item ${active?'selected':''}" data-name="${dataName}" onclick="ldsSelectOp('${leadId}','${u.id}')"><span class="lds-op-av" style="background:hsl(${hue},55%,88%);color:hsl(${hue},55%,35%);width:18px;height:18px;font-size:8px">${esc(initial)}</span><span>${esc(u.name)}</span>${active ? '<svg class="check" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : ''}</button>`
    })
  ].join('')
  const menu = document.createElement('div')
  menu.className = 'lds-menu'
  menu.innerHTML = `<div class="lds-menu-search"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><input type="text" placeholder="Buscar operador..." oninput="ldsFilterMenu(this)"></div>${items}`
  trigger.appendChild(menu)
  _ldsActiveMenu = { menu, trigger }
  setTimeout(() => menu.querySelector('input')?.focus(), 0)
}

function ldsSelectOp(leadId, userId) {
  ldsCloseAllMenus()
  reassign(leadId, userId)
}

function ldsFilterMenu(input) {
  const term = input.value.toLowerCase().trim()
  const menu = input.closest('.lds-menu')
  const items = menu.querySelectorAll('.lds-menu-item')
  let any = false
  items.forEach(it => {
    const name = it.dataset.name || ''
    const match = !term || name.includes(term)
    it.style.display = match ? 'flex' : 'none'
    if (match) any = true
  })
  const existing = menu.querySelector('.lds-menu-empty')
  if (!any && !existing) {
    const div = document.createElement('div')
    div.className = 'lds-menu-empty'
    div.textContent = 'Nenhum resultado'
    menu.appendChild(div)
  } else if (any && existing) {
    existing.remove()
  }
}
document.addEventListener('click', e => {
  if (_ldsActiveMenu && !_ldsActiveMenu.menu.contains(e.target) && !_ldsActiveMenu.trigger.contains(e.target)) ldsCloseAllMenus()
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _ldsActiveMenu) ldsCloseAllMenus()
})


function _legacyRenderLeadsPanelDeprecated() { return `
    <div style="display:flex;flex-direction:column;gap:16px">
      <!-- Actions bar -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center">
        <div style="display:flex;flex-wrap:wrap;gap:7px;flex:1">
          <!-- Search -->
          <div style="display:flex;border:1.5px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;min-width:220px" onfocusin="this.style.borderColor='var(--accent)'" onfocusout="this.style.borderColor='var(--border)'">
            <input id="leads-search-input" type="text" placeholder="Buscar nome, telefone, origem..."
              value="${esc(S.searchInput)}"
              oninput="filterLeadsTable(this.value)"
              onkeydown="if(event.key==='Escape'){filterLeadsTable('');this.value=''}"
              style="flex:1;font-size:13px;padding:7px 11px;border:none;outline:none;background:transparent;color:var(--text-primary);font-family:inherit"/>
          </div>
          ${renderCDD({id:'cdd-filter-stage',value:S.filterStage,options:[{value:'todos',label:'Todas as etapas'},{value:'sem_etapa',label:'Sem etapa'},...(S.kanban?.stages||[]).map(s=>({value:s.id,label:s.name}))],onchange:"applyLeadsFilter({filterStage:this.value})"})}
          ${isAdmin()?renderCDD({id:'cdd-filter-user',value:S.filterUser,options:[{value:'todos',label:'Todos os colaboradores'},{value:'',label:'Sem atribuição'},...S.users.map(u=>({value:u.id,label:u.name}))],onchange:"applyLeadsFilter({filterUser:this.value})"}):''}
          ${(S.search||S.searchInput||S.filterStage!=='todos'||S.filterUser!=='todos'||S.filterTags.length>0)?`
          <button onclick="clearFilters()" style="font-size:12.5px;padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;color:var(--text-muted);background:#fff;cursor:pointer;font-family:inherit" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">✕ Limpar</button>`:''}
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center">
          ${isAdmin() && S.selected.size > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.25);border-radius:8px;padding:6px 12px">
            <span style="font-size:12.5px;font-weight:600;color:var(--accent)">${S.selected.size} selecionado(s)</span>
            <button onclick="openBulkAssign()" style="font-size:11.5px;padding:4px 10px;background:var(--accent);color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit">Atribuir</button>
            <button onclick="clearSelection()" style="font-size:13px;color:var(--accent);background:none;border:none;cursor:pointer;opacity:0.7">✕</button>
          </div>` : ''}
          ${isAdmin()?`
          <button onclick="openRedistribute()" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;color:#6b7280;background:#fff;cursor:pointer;font-family:inherit" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
            Distribuir
          </button>
          <button onclick="triggerImport()" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;color:#6b7280;background:#fff;cursor:pointer;font-family:inherit" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            Importar
          </button>`:''}
          <button onclick="exportCsv()" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;color:#6b7280;background:#fff;cursor:pointer;font-family:inherit" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Exportar
          </button>
          ${isAdmin()||S.me?.permissions?.manageLeads?`<button onclick="openLeadForm()" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 14px;background:var(--accent);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            Novo Lead
          </button>`:''}
        </div>
      </div>

      <!-- Chips de tag -->
      ${(S.tagOptions||[]).length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
        <span style="font-size:11.5px;font-weight:600;color:var(--text-muted);letter-spacing:.03em;white-space:nowrap">Tags:</span>
        ${(S.tagOptions||[]).map(tag => {
          const active = S.filterTags.includes(tag)
          const TAG_COLORS = [['#e0e7ff','#3730a3'],['#dcfce7','#166534'],['#fef9c3','#854d0e'],['#fee2e2','#991b1b'],['#f3e8ff','#6b21a8'],['#fce7f3','#9d174d'],['#dbeafe','#1e3a8a']]
          const idx = (S.tagOptions||[]).indexOf(tag)
          const [bg, tx] = TAG_COLORS[idx % TAG_COLORS.length]
          const count = S.leads.filter(l => (l.tags||[]).includes(tag)).length
          return `<button onclick="(function(){const i=S.filterTags.indexOf('${esc(tag)}');if(i>-1)S.filterTags.splice(i,1);else S.filterTags.push('${esc(tag)}');S.leadsPage=0;render()})()"
            style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.12s;
                   background:${active ? tx : bg};color:${active ? '#fff' : tx};
                   border:1.5px solid ${active ? tx : 'transparent'};
                   box-shadow:${active ? '0 0 0 2px '+tx+'33' : 'none'}"
            onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
            <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>
            ${esc(tag)}
            <span style="font-size:10px;opacity:${active?'0.8':'0.6'};font-weight:500">${count}</span>
          </button>`
        }).join('')}
      </div>` : ''}

      <!-- Totals por etapa -->
      ${(()=>{
        const stages = S.kanban?.stages || []
        const stageMap = Object.fromEntries(stages.map(s => [s.id, s]))
        // Etapas que estão nos leads mas não no kanban (ex: kanban ainda carregando ou etapa deletada)
        const cols = [
          { stageId:'todos', lb:'Total', v:t.total, color:'#6366f1' },
          ...stages.map(s => ({ stageId:s.id, lb:esc(s.name), v:(t.byStage[s.id]||0), color:s.color||'#94a3b8' })),
          ...(t.sem_etapa > 0 ? [{ stageId:'sem_etapa', lb:'Sem etapa', v:t.sem_etapa, color:'#94a3b8' }] : []),
        ]
        const numCols = Math.min(cols.length, 8)
        return `<div style="display:grid;grid-template-columns:repeat(${Math.min(numCols,4)},1fr);gap:10px">
          ${cols.map(c=>{
            const active = S.filterStage===c.stageId
            const r = parseInt(c.color.slice(1,3),16)||148, g = parseInt(c.color.slice(3,5),16)||163, b = parseInt(c.color.slice(5,7),16)||184
            return `<button onclick="applyLeadsFilter({filterStage:'${c.stageId}'})" style="text-align:left;padding:12px 14px;border-radius:10px;border:${active?'2px solid '+c.color:'1.5px solid var(--border)'};background:${active?'rgba('+r+','+g+','+b+',0.08)':'#fff'};cursor:pointer;transition:all 0.12s;box-shadow:${active?'0 0 0 2px rgba('+r+','+g+','+b+',0.15)':'none'}" onmouseover="this.style.borderColor='${c.color}'" onmouseout="if(!${active})this.style.borderColor='var(--border)'">
              <p style="font-size:22px;font-weight:800;color:${active?c.color:'var(--text-primary)'};margin:0;line-height:1.1">${c.v}</p>
              <p style="font-size:11.5px;font-weight:600;color:${active?c.color:'var(--text-muted)'};margin:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${c.lb}">${c.lb}</p>
            </button>`
          }).join('')}
        </div>`
      })()}

      <!-- Table / Empty state -->
      ${leads.length===0?`
        <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
          <svg style="width:44px;height:44px;margin:0 auto 12px;opacity:0.22;display:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <p style="font-size:14px;font-weight:600;margin:0">Nenhum lead encontrado</p>
        </div>
      `:`
        <!-- Desktop table -->
        <div style="background:#fff;border-radius:12px;border:1px solid var(--border);overflow:hidden;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:1px solid var(--border);background:#f9fafb">
                ${isAdmin()?`<th style="padding:10px 14px;width:36px"><input type="checkbox" ${filteredLeads().every(l=>S.selected.has(l.id))?'checked':''} onchange="toggleSelectAll()"/></th>`:''}
                <th style="text-align:left;padding:10px 14px;font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Lead</th>
                <th style="text-align:left;padding:10px 14px;font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Telefone</th>
                <th style="text-align:left;padding:10px 14px;font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Origem</th>
                <th style="text-align:left;padding:10px 14px;font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Etapa</th>
                <th style="text-align:left;padding:10px 14px;font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Atribuído a</th>
                <th style="padding:10px 14px;width:80px"></th>
              </tr>
            </thead>
            <tbody id="leads-tbody">
              ${leads.map(l=>{
                const rowBg = S.selected.has(l.id) ? 'rgba(99,102,241,0.05)' : 'transparent'
                const _srch = esc([l.name,l.phone,l.origin,l.assignedTo?.name,...(l.tags||[])].filter(Boolean).join(' ').toLowerCase())
                return `<tr data-search="${_srch}" style="border-bottom:1px solid #f3f4f6;background:${rowBg}" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='${rowBg}'">
                  ${isAdmin()?`<td style="padding:10px 14px;width:36px"><input type="checkbox" ${S.selected.has(l.id)?'checked':''} onchange="toggleSelect('${l.id}')"/></td>`:''}
                  <td style="padding:10px 14px">
                    <div style="display:flex;align-items:center;gap:6px">
                      <p style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin:0;cursor:pointer" class="copy-btn" onclick="copyText('${esc(l.name)}')" title="Clique para copiar">${esc(l.name)}</p>
                      ${l.unreadCount > 0 ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 3px;border-radius:99px;background:#ef4444;color:white;font-size:9px;font-weight:700">${l.unreadCount}</span>` : ''}
                    </div>
                    ${l.notes?`<p style="font-size:11.5px;color:var(--text-muted);margin:2px 0 0;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(l.notes)}">${esc(l.notes)}</p>`:''}
                  </td>
                  <td style="padding:10px 14px;white-space:nowrap">
                    ${l.phone?`<span style="color:#6b7280;cursor:pointer" class="copy-btn" onclick="copyText('${esc(l.phone)}')" title="Clique para copiar">${fmtPhone(l.phone)}</span>`:'—'}
                  </td>
                  <td style="padding:10px 14px">${renderOriginBadge(l.origin)}</td>
                  <td style="padding:10px 14px">${stageSelectHtml(l,'','tbl')}</td>
                  <td style="padding:10px 14px">
                    ${renderCDD({id:`cdd-ra-${l.id}`,value:l.assignedToId||'',options:[{value:'',label:'— Sem atribuição'},...S.users.map(u=>({value:u.id,label:u.name}))],onchange:`reassign('${l.id}',this.value)`,style:'max-width:150px;width:150px'})}
                  </td>
                  <td style="padding:10px 14px;text-align:right">
                    <div style="display:flex;align-items:center;justify-content:flex-end;gap:2px">
                      <button onclick="openConversation('${l.id}')" title="Ver conversa" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:none;background:transparent;cursor:pointer;color:#9ca3af" onmouseover="this.style.background='rgba(99,102,241,0.08)';this.style.color='var(--accent)'" onmouseout="this.style.background='transparent';this.style.color='#9ca3af'">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                      </button>
                      ${isAdmin()||S.me?.permissions?.manageLeads?`
                      <button onclick="openLeadForm(${JSON.stringify(l).replace(/"/g,'&quot;')})" title="Editar" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:none;background:transparent;cursor:pointer;color:#9ca3af" onmouseover="this.style.background='#f3f4f6';this.style.color='#374151'" onmouseout="this.style.background='transparent';this.style.color='#9ca3af'">
                        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      ${canDeleteLead(l) ? `<button onclick="confirmDeleteLead('${l.id}')" title="Apagar" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:none;background:transparent;cursor:pointer;color:#9ca3af" onmouseover="this.style.background='#fef2f2';this.style.color='#ef4444'" onmouseout="this.style.background='transparent';this.style.color='#9ca3af'">
                        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>` : ''}`:''}
                    </div>
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
        ${useLiteScroll && hasMoreScroll ? `
        <div class="lds-scroll-sentinel" data-leads-scroll-sentinel="1" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;color:var(--text-muted);font-size:12px">
          <svg style="width:14px;height:14px;animation:spin 0.8s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          <span>${(totalLeads - leads.length).toLocaleString('pt-BR').replace(',','.')} restantes · role pra carregar</span>
        </div>` : (totalPages > 1 && !useLiteScroll ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 4px">
          <span style="font-size:12.5px;color:var(--text-muted)">${S.leadsPage * LEADS_PAGE_SIZE + 1}–${Math.min((S.leadsPage + 1) * LEADS_PAGE_SIZE, totalLeads)} de ${totalLeads}</span>
          <div style="display:flex;gap:6px">
            <button onclick="S.leadsPage=Math.max(0,S.leadsPage-1);render()" ${S.leadsPage===0?'disabled':''} style="padding:5px 12px;font-size:12.5px;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-family:inherit;color:var(--text-primary);opacity:${S.leadsPage===0?'0.4':'1'}">← Anterior</button>
            <button onclick="S.leadsPage=Math.min(${totalPages-1},S.leadsPage+1);render()" ${S.leadsPage>=totalPages-1?'disabled':''} style="padding:5px 12px;font-size:12.5px;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-family:inherit;color:var(--text-primary);opacity:${S.leadsPage>=totalPages-1?'0.4':'1'}">Próxima →</button>
          </div>
        </div>` : '')}
      `}
    </div>
  `
}

// ─── Bulk selection ──────────────────────────────────────────────────────────

function toggleSelect(id) {
  if (S.selected.has(id)) S.selected.delete(id)
  else S.selected.add(id)
  render()
}

function toggleSelectAll() {
  const visible = filteredLeads().map(l=>l.id)
  if (visible.every(id=>S.selected.has(id))) {
    visible.forEach(id=>S.selected.delete(id))
  } else {
    visible.forEach(id=>S.selected.add(id))
  }
  render()
}

function clearSelection() { S.selected.clear(); render() }

// ─── Bulk assign modal ────────────────────────────────────────────────────────

function openBulkAssign() {
  S.form = { assignedToId: '' }
  S.formError = ''
  S.modal = 'bulk_assign'
  render()
}

async function submitBulkAssign() {
  const ids = [...S.selected]
  if (ids.length === 0) { S.formError='Nenhum lead selecionado.'; render(); return }
  try {
    const r = await api('/bulk-assign', { method:'POST', body:JSON.stringify({ leadIds:ids, assignedToId:S.form.assignedToId||null }) })
    await fetchLeads()
    S.selected.clear()
    closeModal()
    alert(`${r.updated} lead(s) atribuídos com sucesso.`)
  } catch(e) { S.formError=e.message; render() }
}

// ─── Redistribute modal ───────────────────────────────────────────────────────

function openRedistribute() {
  S.form = { scope:'filtered', userIds: [], limit: '', redistributing: false, redistributeResult: null }
  S.formError = ''
  S.modal = 'redistribute'
  render()
}

function toggleRedistUser(id) {
  const arr = S.form.userIds || []
  S.form.userIds = arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id]
  render()
}

function _redistPreviewHtml(cnt, nUsers) {
  const limit = parseInt(S.form.limit) || 0
  const effective = limit > 0 && limit < cnt ? limit : cnt
  if (!cnt || !nUsers) return ''
  const isLimited = limit > 0 && limit < cnt
  return `<div style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);border:1.5px solid #c7d2fe;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:12px">
    <svg style="width:16px;height:16px;color:#6366f1;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    <div>
      <span style="font-size:13px;font-weight:700;color:#4338ca">${effective.toLocaleString('pt-BR')}</span>
      <span style="font-size:12.5px;color:#6366f1"> de ${cnt.toLocaleString('pt-BR')} leads → </span>
      <span style="font-size:13px;font-weight:700;color:#4338ca">~${Math.ceil(effective/nUsers).toLocaleString('pt-BR')}</span>
      <span style="font-size:12.5px;color:#6366f1"> por operador</span>
      ${isLimited ? `<div style="font-size:11px;color:#818cf8;margin-top:2px">limitado a ${limit.toLocaleString('pt-BR')} leads</div>` : ''}
    </div>
  </div>`
}


function _patchRedistPreview() {
  const el = document.getElementById('redist-preview')
  if (!el) return
  const unassigned = S.leads.filter(l=>!l.assignedToId).length
  const total = S.leads.length
  const filteredCount = filteredLeads().length
  const cnt = S.form.scope==='unassigned' ? unassigned : (S.form.scope==='filtered' ? filteredCount : total)
  const nUsers = S.form.userIds?.length || 0
  el.innerHTML = _redistPreviewHtml(cnt, nUsers)
}


async function submitRedistribute() {
  if (!S.form.userIds?.length) { S.formError='Selecione ao menos um colaborador.'; render(); return }
  S.form.redistributing = true
  render()
  try {
    const body = { scope: S.form.scope, userIds: S.form.userIds }
    if (S.form.scope === 'filtered') body.leadIds = filteredLeads().map(l => l.id)
    const lim = parseInt(S.form.limit)
    if (lim > 0) body.limit = lim
    const r = await api('/redistribute', { method:'POST', body:JSON.stringify(body) })
    await fetchLeads()
    const perUser = Object.entries(r.perUser).map(([uid,cnt])=>{
      const u=S.users.find(x=>x.id===uid); return `${u?.name||uid}: ${cnt}`
    }).join(', ')
    S.form.redistributing = false
    S.form.redistributeResult = { distributed: r.distributed, perUser, perUserRaw: r.perUser }
    render()
  } catch(e) {
    S.form.redistributing = false
    S.formError = e.message
    render()
  }
}



async function reassign(id, assignedToId) {
  try {
    const r=await api(`/${id}`,{method:'PUT',body:JSON.stringify({assignedToId:assignedToId||null})})
    S.leads=S.leads.map(l=>l.id===id?r:l); renderKeepScroll()
    if (S.leadActivity[id] !== undefined) loadLeadActivity(id)
  } catch(e) { alert(e.message); renderKeepScroll() }
}


// ─── UTM / Marketing section ────────────────────────────────────────────────
// State movido pra cá no PR 19 (estava em ai-agents.js por adjacência do PR 16).
S.leadUtmCache = {}
S.leadUtmLoading = new Set()
S.leadUtmEditing = null
S.intakeToken = null

var UTM_LABELS = {
  utmSource: 'source',
  utmMedium: 'medium',
  utmCampaign: 'campaign',
  utmContent: 'content',
}

function renderLeadUtmSection(lead) {
  const utm = S.leadUtmCache[lead.id]
  if (utm === undefined) {
    loadLeadUtm(lead.id)
    return `
      <div class="det-section">
        <div class="det-label" style="display:flex;align-items:center;justify-content:space-between">
          <span>Marketing / UTM</span>
        </div>
        <div class="det-utm-empty">Carregando…</div>
      </div>`
  }
  const has = utm && (utm.utmSource || utm.utmMedium || utm.utmCampaign || utm.utmContent || utm.utmTerm || utm.fbclid || utm.gclid)
  const editable = isAdmin() || (S.me?.permissions?.manageLeads !== false)

  let body
  if (!has) {
    body = `<div class="det-utm-empty">Nenhum UTM registrado.</div>`
  } else {
    const rows = []
    for (const [key, lbl] of Object.entries(UTM_LABELS)) {
      if (utm[key]) {
        rows.push(`
          <div class="det-utm-row">
            <span class="det-utm-key">${lbl}</span>
            <span class="det-utm-val" title="${esc(utm[key])}">${esc(utm[key])}</span>
          </div>`)
      }
    }
    body = rows.join('')
    if (utm.utmCapturedAt) {
      body += `<div class="det-utm-row" style="margin-top:6px;border-top:1px dashed var(--border);padding-top:6px">
        <span class="det-utm-key">capturado em</span>
        <span class="det-utm-val" style="font-family:inherit;color:var(--text-muted);font-size:10.5px">${esc(new Date(utm.utmCapturedAt).toLocaleString('pt-BR'))}</span>
      </div>`
    }
  }

  return `
    <div class="det-section">
      <div class="det-label" style="display:flex;align-items:center;justify-content:space-between">
        <span>Marketing / UTM</span>
        <div style="display:flex;gap:4px">
          ${isAdmin() ? `<button class="det-utm-edit-btn" onclick="openIntakeTokenModal()" title="Token API para integrações">🔗 API</button>` : ''}
          ${editable ? `<button class="det-utm-edit-btn" onclick="openLeadUtmEditModal('${esc(lead.id)}')">${has?'editar':'+ adicionar'}</button>` : ''}
        </div>
      </div>
      ${body}
    </div>`
}


async function loadLeadUtm(leadId) {
  // Guard: evita disparos concorrentes pelo mesmo leadId quando o painel
  // re-renderiza durante a request (cada render que ve cache undefined
  // chamava loadLeadUtm de novo, podendo empilhar dezenas em voo).
  if (S.leadUtmLoading.has(leadId)) return
  S.leadUtmLoading.add(leadId)
  // Timeout defensivo: se o backend pendurar (sem 4xx/5xx, sem timeout TCP),
  // a request fica esperando para sempre e a UI fica presa em "Carregando…".
  // 10s de teto força um fallback para {} (= "Nenhum UTM registrado").
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('UTM request timeout (10s)')), 10000))
  try {
    const r = await Promise.race([apiIntake('/leads/' + leadId + '/utm'), timeout])
    S.leadUtmCache[leadId] = r || {}
  } catch(e) {
    console.error('Lead UTM load error:', e?.message || e)
    S.leadUtmCache[leadId] = {}
  } finally {
    S.leadUtmLoading.delete(leadId)
  }
  scheduleRender()
}


function openLeadUtmEditModal(leadId) {
  const cur = S.leadUtmCache[leadId] || {}
  S.leadUtmEditing = {
    leadId,
    utmSource: cur.utmSource || '',
    utmMedium: cur.utmMedium || '',
    utmCampaign: cur.utmCampaign || '',
    utmContent: cur.utmContent || '',
    utmTerm: cur.utmTerm || '',
    fbclid: cur.fbclid || '',
    gclid: cur.gclid || '',
    landingUrl: cur.landingUrl || '',
    referrer: cur.referrer || '',
  }
  renderLeadUtmEditModal()
}


function closeLeadUtmEditModal() {
  S.leadUtmEditing = null
  document.getElementById('utm-modal-root')?.remove()
}


function renderLeadUtmEditModal() {
  const u = S.leadUtmEditing
  if (!u) return
  const html = `
    <div class="utm-modal-bd" onclick="if(event.target===this)closeLeadUtmEditModal()">
      <div class="utm-modal">
        <div class="utm-modal-head">
          <h3 class="utm-modal-title">📊 UTM / Marketing</h3>
          <button onclick="closeLeadUtmEditModal()" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:var(--text-muted)">✕</button>
        </div>
        <div class="utm-modal-body">
          <div class="utm-row-2">
            <div><label>Source</label><input value="${esc(u.utmSource)}" oninput="S.leadUtmEditing.utmSource = this.value" placeholder="facebook, google, instagram"/></div>
            <div><label>Medium</label><input value="${esc(u.utmMedium)}" oninput="S.leadUtmEditing.utmMedium = this.value" placeholder="cpc, organic, email"/></div>
          </div>
          <div><label>Campaign</label><input value="${esc(u.utmCampaign)}" oninput="S.leadUtmEditing.utmCampaign = this.value" placeholder="black_friday_2026"/></div>
          <div class="utm-row-2">
            <div><label>Content</label><input value="${esc(u.utmContent)}" oninput="S.leadUtmEditing.utmContent = this.value" placeholder="video_a, banner_topo"/></div>
            <div><label>Term</label><input value="${esc(u.utmTerm)}" oninput="S.leadUtmEditing.utmTerm = this.value" placeholder="palavra-chave"/></div>
          </div>
          <div class="utm-row-2">
            <div><label>fbclid (Meta)</label><input value="${esc(u.fbclid)}" oninput="S.leadUtmEditing.fbclid = this.value" placeholder="IwAR..."/></div>
            <div><label>gclid (Google)</label><input value="${esc(u.gclid)}" oninput="S.leadUtmEditing.gclid = this.value" placeholder="Cj0..."/></div>
          </div>
          <div><label>Landing URL</label><input value="${esc(u.landingUrl)}" oninput="S.leadUtmEditing.landingUrl = this.value" placeholder="https://lp.lowan.site/promo"/></div>
          <div><label>Referrer</label><input value="${esc(u.referrer)}" oninput="S.leadUtmEditing.referrer = this.value" placeholder="https://google.com"/></div>
        </div>
        <div class="utm-modal-foot">
          ${isAdmin() ? `<button onclick="clearLeadUtm()" class="bc-btn bc-btn-ghost" style="color:#dc2626">Limpar tudo</button>` : '<div></div>'}
          <div style="display:flex;gap:8px">
            <button onclick="closeLeadUtmEditModal()" class="bc-btn bc-btn-secondary">Cancelar</button>
            <button onclick="saveLeadUtm()" class="bc-btn bc-btn-primary">Salvar</button>
          </div>
        </div>
      </div>
    </div>`
  let root = document.getElementById('utm-modal-root')
  if (!root) { root = document.createElement('div'); root.id = 'utm-modal-root'; document.body.appendChild(root) }
  root.innerHTML = html
}


async function saveLeadUtm() {
  const u = S.leadUtmEditing
  if (!u) return
  const body = {
    utmSource: u.utmSource || null,
    utmMedium: u.utmMedium || null,
    utmCampaign: u.utmCampaign || null,
    utmContent: u.utmContent || null,
    utmTerm: u.utmTerm || null,
    fbclid: u.fbclid || null,
    gclid: u.gclid || null,
    landingUrl: u.landingUrl || null,
    referrer: u.referrer || null,
  }
  try {
    const r = await apiIntake('/leads/' + u.leadId + '/utm', { method: 'PATCH', body })
    S.leadUtmCache[u.leadId] = r
    closeLeadUtmEditModal()
    showToast('UTM atualizado', 'success')
    scheduleRender()
  } catch(e) {
    showToast(e?.message || 'Erro ao salvar', 'error')
  }
}


async function clearLeadUtm() {
  const u = S.leadUtmEditing
  if (!u) return
  if (!confirm('Apagar todas as informações de UTM deste lead?')) return
  try {
    await apiIntake('/leads/' + u.leadId + '/utm', { method: 'DELETE' })
    S.leadUtmCache[u.leadId] = {}
    closeLeadUtmEditModal()
    showToast('UTM removido', 'success')
    scheduleRender()
  } catch(e) {
    showToast(e?.message || 'Erro', 'error')
  }
}

// ─── Intake Token modal (admin) ───────────────────────────────────