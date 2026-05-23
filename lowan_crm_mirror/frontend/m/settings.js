// settings.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

async function fetchUsers() {
  S.usersLoading = true
  try {
    if (isAdmin() || S.me?.permissions?.manageUsers) {
      try { S.users = await api('/users') } catch (e) { console.error('fetchUsers /users falhou:', e.message); S.users = [] }
    } else {
      try { S.users = await api('/users-list') } catch { S.users = [] }
    }
  } finally { S.usersLoading = false; scheduleRender() }
}

// ─── Auth actions ─────────────────────────────────────────────────────────────

function openUserForm(user=null) {
  S.editId=user?.id||null
  const perms=user?.permissions||{}
  // allowedConnections: null = todos, [] = nenhum, [ids] = específicos
  // Se não definido ainda, default = null (todos permitidos)
  const allowedConns = Array.isArray(perms.allowedConnections) ? perms.allowedConnections : null
  S.form=user
    ?{name:user.name,email:user.email,password:'',isActive:user.isActive,role:user.role||'COLLABORATOR',
      viewAllLeads:!!perms.viewAllLeads,manageLeads:!!perms.manageLeads,exportLeads:!!perms.exportLeads,canDelete:perms.canDelete!==false,
      manageConnections:!!perms.manageConnections,
      allowedConnections:allowedConns, restrictConnections: allowedConns !== null}
    :{name:'',email:'',password:'',role:'COLLABORATOR',viewAllLeads:false,manageLeads:false,exportLeads:false,canDelete:true,
      manageConnections:false,
      allowedConnections:null, restrictConnections:false}
  S.formError=''; S.modal='user'
  // Garante que conexões oficiais E não-oficiais estejam carregadas
  const needConns = !S.connections.length
  const needUnoff = !S.unofficialSessions.length
  if (needConns || needUnoff) {
    Promise.all([
      needConns ? fetchConnections() : Promise.resolve(),
      needUnoff ? fetchUnofficialSessions().catch(()=>{}) : Promise.resolve(),
    ]).then(()=>scheduleRender())
  } else {
    render()
  }
}


async function submitUser() {
  if (S.userFormSaving) return
  const { name, email, password } = S.form
  if (!name?.trim()||!email?.trim()) { S.formError='Nome e e-mail obrigatórios.'; render(); return }
  if (!S.editId&&!password) { S.formError='Senha obrigatória para novo usuário.'; render(); return }
  const body={name:name.trim(),email:email.trim()}
  if (password) body.password=password
  if (S.editId&&S.form.isActive!==undefined) body.isActive=S.form.isActive
  body.role = S.form.role || 'COLLABORATOR'
  // Admin tem acesso total: força todas as permissões true (sem allowedConnections — admin vê tudo).
  // canDelete continua opt-in mesmo pra admin (ação destrutiva, segue toggle do form).
  if (body.role === 'ADMIN') {
    body.permissions = {
      viewAllLeads: true,
      manageLeads: true,
      exportLeads: true,
      manageConnections: true,
      canDelete: S.form.canDelete !== false,
      allowedConnections: null,
    }
  } else {
    body.permissions = {
      viewAllLeads: !!S.form.viewAllLeads,
      manageLeads: !!S.form.manageLeads,
      exportLeads: !!S.form.exportLeads,
      manageConnections: !!S.form.manageConnections,
      canDelete: S.form.canDelete !== false,
      allowedConnections: S.form.restrictConnections ? (S.form.allowedConnections || []) : null,
    }
  }
  S.userFormSaving = true; S.formError = ''; render()
  try {
    if (S.editId) {
      const r=await api(`/users/${S.editId}`,{method:'PUT',body:JSON.stringify(body)})
      S.users=S.users.map(u=>u.id===S.editId?r:u)
    } else {
      const r=await api('/users',{method:'POST',body:JSON.stringify(body)})
      S.users.push(r)
    }
    S.userFormSaving = false
    showToast?.(S.editId?'Colaborador atualizado':'Colaborador criado', 'success')
    closeModal()
  } catch(e) {
    S.userFormSaving = false
    S.formError=e.message; render()
  }
}


function confirmDeleteUser(id) { S.deleteTarget=id; S.modal='delete_user'; render() }

async function deleteUser() {
  try {
    await api(`/users/${S.deleteTarget}`,{method:'DELETE'})
    S.users=S.users.filter(u=>u.id!==S.deleteTarget); closeModal()
  } catch(e) { alert(e.message); closeModal() }
}


async function fetchBlacklist() {
  S.blacklistLoading = true; render()
  try {
    const r = await api('/blocked-phones')
    S.blacklistPhones = r?.data || []
  } catch(e) { showToast(e?.message || 'Erro ao carregar blacklist', 'error') }
  finally {
    // Sempre marca como loaded — evita loop infinito de re-fetch quando API falha
    S.blacklistLoaded = true
    S.blacklistLoading = false
    render()
  }
}


async function addToBlacklist() {
  const phone = (S.blacklistInput || '').trim()
  if (!phone) { showToast('Digite um telefone', 'error'); return }
  S.blacklistAdding = true; render()
  try {
    await api('/blocked-phones', { method:'POST', body: JSON.stringify({ phone }) })
    S.blacklistInput = ''
    showToast('Adicionado à blacklist', 'success')
    fetchBlacklist()
  } catch(e) {
    showToast(e?.message || 'Erro ao adicionar', 'error')
  }
  finally { S.blacklistAdding = false; render() }
}


async function removeFromBlacklist(phone) {
  if (!confirm(`Remover ${phone} da blacklist? O número volta a poder ser usado.`)) return
  try {
    await api(`/blocked-phones/${encodeURIComponent(phone)}`, { method:'DELETE' })
    S.blacklistPhones = (S.blacklistPhones||[]).filter(b => b.phone !== phone)
    showToast('Removido da blacklist', 'success')
    render()
  } catch(e) { showToast(e?.message || 'Erro', 'error') }
}


function renderBlacklistPanel() {
  if (!S.blacklistLoaded && !S.blacklistLoading) fetchBlacklist().catch(()=>{})
  const list = S.blacklistPhones || []
  return `
  <div style="display:flex;flex-direction:column;gap:18px">
    <div>
      <h2 style="font-family:'Bricolage Grotesque',serif;font-size:24px;font-weight:800;letter-spacing:-0.025em;color:var(--text-primary);margin:0">Blacklist</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-top:4px">Telefones bloqueados no workspace. Esses números não podem ser cadastrados como leads (manualmente ou por importação) e webhooks recebidos deles são ignorados.</p>
    </div>

    <div class="cn-form-card" style="border-color:var(--cn-q-bad-border)">
      <div>
        <p class="form-title">Adicionar à blacklist</p>
        <p class="form-sub">Cole o telefone (com DDD). O sistema bloqueia também as variantes BR (8 e 9 dígitos no celular).</p>
      </div>
      <div class="cn-form-row">
        <input type="text" class="cn-input mono" placeholder="Ex: 5511987654321"
          value="${esc(S.blacklistInput||'')}"
          oninput="S.blacklistInput=this.value"
          onkeydown="if(event.key==='Enter')addToBlacklist()"/>
        <button class="cn-btn-inline" style="background:linear-gradient(135deg, var(--cn-q-bad) 0%, #b91c1c 100%);color:white" onclick="addToBlacklist()" ${S.blacklistAdding?'disabled':''}>
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 18.364M5.636 5.636l12.728 12.728"/></svg>
          ${S.blacklistAdding?'Adicionando…':'Bloquear'}
        </button>
      </div>
    </div>

    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
      <h3 style="font-family:'Bricolage Grotesque',serif;font-size:16px;font-weight:700;letter-spacing:-0.015em;color:var(--text-primary);margin:0">Números bloqueados <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-muted);font-weight:600;background:var(--surface-2);padding:2px 8px;border-radius:99px;margin-left:8px">${list.length}</span></h3>
      <button class="cn-btn-inline ghost" onclick="fetchBlacklist()" title="Atualizar" style="font-size:11.5px">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="${S.blacklistLoading?'animation:spin 0.7s linear infinite':''}"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        Atualizar
      </button>
    </div>

    ${S.blacklistLoading && list.length===0 ? `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Carregando...</div>` :
      list.length === 0 ? `
      <div class="cn-empty">
        <div class="cn-empty-icon" style="background:var(--cn-q-bad-bg);color:var(--cn-q-bad)">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 18.364M5.636 5.636l12.728 12.728"/></svg>
        </div>
        <h3>Nenhum número bloqueado</h3>
        <p>Quando alguém é excluído com "Adicionar à blacklist" ou bloqueado pelo painel, aparece aqui.</p>
      </div>` :
      `<div class="cn-tpl-table-wrap">
        <table class="cn-tpl-table">
          <thead>
            <tr>
              <th>Telefone</th>
              <th>Lead vinculado</th>
              <th>Bloqueado em</th>
              <th class="right">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(b => {
              const blockedAt = b.blockedAt ? new Date(b.blockedAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—'
              const formatted = fmtPhone(b.phone) || b.phone
              return `
              <tr>
                <td><span class="name">${esc(formatted)}</span></td>
                <td>${b.lead ? `<span style="font-size:12.5px;color:var(--text-primary);font-weight:600">${esc(b.lead.name||'Sem nome')}</span>${b.lead.isBlocked?` <span style="font-size:10px;font-weight:700;padding:1px 6px;background:var(--cn-q-bad-bg);color:var(--cn-q-bad);border-radius:4px;margin-left:4px">lead bloqueado</span>`:''}` : `<span class="muted">— não há lead</span>`}</td>
                <td><span class="muted">${blockedAt}</span></td>
                <td class="right">
                  <button class="cn-btn-inline ghost" onclick="removeFromBlacklist('${esc(b.phone)}')" style="font-size:11.5px;color:var(--cn-q-good);border-color:var(--cn-q-good-border);background:var(--cn-q-good-bg)" title="Remover da blacklist">
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


function renderSettingsPanel() {
  const allSubNav = [
    { key: 'equipe',     label: 'Equipe',      adminOnly: true,  icon: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`,
      meta: () => (S.users || []).filter(u => u.isActive !== false).length },
    { key: 'tags',       label: 'Tags',         adminOnly: true,  icon: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>`,
      meta: () => (S.tagOptions || []).length },
    { key: 'modelos',    label: 'Modelos',      adminOnly: false, icon: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`,
      meta: () => ((S.textModels || []).length + (S.audioModels || []).length) || null },
    { key: 'financeiro', label: 'Financeiro',   adminOnly: true,  icon: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>` },
    { key: 'integracoes', label: 'API · Integrações', adminOnly: true, icon: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>` },
    { key: 'blacklist',   label: 'Blacklist',    adminOnly: true,  icon: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 18.364M5.636 5.636l12.728 12.728"/></svg>`,
      meta: () => (S.blacklistPhones || []).length || null },
  ]
  const subNav = allSubNav.filter(item => !item.adminOnly || isAdmin())
  const defaultTab = subNav[0]?.key || 'modelos'
  const active = (S.settingsTab && subNav.find(i => i.key === S.settingsTab)) ? S.settingsTab : defaultTab
  let content = ''
  if (active === 'equipe') content = renderUsersPanel()
  else if (active === 'tags') content = renderTagsPanel()
  else if (active === 'modelos') content = renderModelosPanel()
  else if (active === 'financeiro') content = renderFinancialSettingsPanel()
  else if (active === 'integracoes') content = renderIntegrationsPanel()
  else if (active === 'blacklist') content = renderBlacklistPanel()

  const wsName = S.workspaceName || 'Workspace'
  const wsInitial = (wsName.trim()[0] || 'W').toUpperCase()

  return `
  <div class="cfg-shell">
    <aside class="cfg-side">
      <div class="cfg-side-ws">
        <div class="cfg-side-ws-mark">${esc(wsInitial)}</div>
        <div class="cfg-side-ws-info">
          <div class="cfg-side-ws-name">${esc(wsName)}</div>
          <div class="cfg-side-ws-tag">workspace</div>
        </div>
      </div>
      <div class="cfg-side-label">Configurações</div>
      ${subNav.map(item => {
        const isActive = active === item.key
        const metaVal = item.meta ? item.meta() : null
        const metaHtml = metaVal != null && metaVal !== '' ? `<span class="cfg-side-item-meta">${metaVal}</span>` : ''
        return `<button class="cfg-side-item${isActive ? ' active' : ''}" onclick="S.settingsTab='${item.key}';render()">
          <span class="cfg-side-item-ic">${item.icon}</span>
          ${item.label}
          ${metaHtml}
        </button>`
      }).join('')}
      <div class="cfg-side-foot">
        <span>Lowan CRM</span>
        <span class="cfg-side-foot-version">v2.4.1</span>
      </div>
    </aside>
    <main class="cfg-main">
      <div class="cfg-main-inner">${content}</div>
    </main>
  </div>`
}


async function createTagLocal() {
  const input = document.getElementById('new-tag-input')
  if (!input) return
  const tag = input.value.trim()
  if (!tag) return
  if (S.tagOptions.includes(tag)) { showToast('Tag já existe', 'error'); return }
  try {
    await api('/tag-options', { method: 'POST', body: JSON.stringify({ tag }) })
    S.tagOptions = [...new Set([...S.tagOptions, tag])].sort((a,b) => a.localeCompare(b,'pt-BR'))
    input.value = ''
    showToast(`Tag "${tag}" criada`, 'success')
    render()
  } catch(e) { showToast(e.message, 'error') }
}


async function deleteTagGlobal(tag) {
  if (!confirm(`Remover a tag "${tag}" de todos os leads?`)) return
  showToast('Removendo tag...', 'info')
  try {
    await api(`/tag-options/${encodeURIComponent(tag)}`, { method: 'DELETE' })
    // Atualiza estado local: remove dos leads e das opções
    S.leads = S.leads.map(l => l.tags?.includes(tag) ? { ...l, tags: l.tags.filter(t => t !== tag) } : l)
    S.tagOptions = S.tagOptions.filter(t => t !== tag)
    showToast(`Tag "${tag}" removida`, 'success')
  } catch(e) { showToast(e.message, 'error') }
  render()
}


function renderTagsPanel() {
  const tags = (S.tagOptions || []).slice().sort((a,b) => a.localeCompare(b, 'pt-BR'))
  const TAG_COLORS = [
    ['#dbeafe','#1e3a8a'],['#dcfce7','#166534'],['#fef9c3','#854d0e'],
    ['#fee2e2','#991b1b'],['#f3e8ff','#6b21a8'],['#fce7f3','#9d174d'],
    ['#cffafe','#155e75'],['#e0e7ff','#3730a3'],['#ffedd5','#9a3412'],
    ['#ecfccb','#3f6212'],['#dbeafe','#1e40af'],['#fae8ff','#86198f']
  ]

  const tagCounts = tags.map(t => ({
    tag: t,
    count: (S.leads || []).filter(l => (l.tags || []).includes(t)).length
  }))
  const totalUsage = tagCounts.reduce((a, b) => a + b.count, 0)
  const taggedLeads = (S.leads || []).filter(l => (l.tags || []).length > 0).length
  const topTag = [...tagCounts].sort((a, b) => b.count - a.count)[0]

  const X_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`

  return `
  <div class="cfg-page-head">
    <div class="cfg-page-head-titles">
      <div class="cfg-page-eyebrow"><span class="dot"></span>Workspace · Organização</div>
      <h1>Tags</h1>
      <p>Etiquetas livres pra segmentar leads. Use em filtros do kanban, audiência de disparos e relatórios.</p>
    </div>
  </div>

  <div class="qcards">
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,var(--accent),#6366f1);box-shadow:0 6px 14px rgba(79,70,229,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${tags.length}</div><div class="qcard-label">Tags ativas</div></div>
    </div>
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 6px 14px rgba(22,163,74,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num" style="font-size:${topTag && topTag.tag.length > 8 ? '15px' : '20px'}">${topTag ? esc(topTag.tag) : '—'}</div><div class="qcard-label">${topTag ? `Mais usada · ${topTag.count} leads` : 'Sem uso ainda'}</div></div>
    </div>
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,#a855f7,#ec4899);box-shadow:0 6px 14px rgba(168,85,247,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${taggedLeads.toLocaleString('pt-BR')}</div><div class="qcard-label">Leads etiquetados</div></div>
    </div>
  </div>

  <div class="tag-card">
    ${tags.length === 0 ? `
      <div style="padding:32px 24px;text-align:center;color:var(--text-muted)">
        <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 10px;opacity:0.4"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>
        <p style="font-size:14px;font-weight:600;color:var(--text-primary);margin:0 0 4px">Nenhuma tag criada ainda</p>
        <p style="font-size:12px;margin:0">Use o campo abaixo pra criar sua primeira tag</p>
      </div>
    ` : `
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${tagCounts.map((tc, i) => {
          const [bg, tx] = TAG_COLORS[i % TAG_COLORS.length]
          const safeTag = esc(tc.tag).replace(/'/g, "\\'")
          return `<span class="tag-bigchip" style="background:${bg};color:${tx}" onclick="navigate('leads',{filterTags:['${safeTag}']});render()" title="Ver ${tc.count} lead${tc.count!==1?'s':''}">
            <span class="tag-bigchip-dot"></span>${esc(tc.tag)}
            <span class="tag-bigchip-count">${tc.count}</span>
            <button class="tag-bigchip-rm" onclick="event.stopPropagation();deleteTagGlobal('${safeTag}')" title="Remover tag">${X_SVG}</button>
          </span>`
        }).join('')}
      </div>
    `}

    <div class="tag-create-row">
      <div class="cfg-search">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        <input id="new-tag-input" type="text" placeholder="Nova tag... (Enter para criar)" onkeydown="if(event.key==='Enter')createTagLocal()"/>
      </div>
      <button class="cfg-btn cfg-btn-primary" onclick="createTagLocal()">
        <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Criar
      </button>
    </div>
  </div>
  `
}

// ─── Modelos Panel ───────────────────────────────────────────────────────────


function renderModelosPanel() {
  const subTab = S.modelSubTab || 'text'
  if (!S.textModelsLoaded) { loadTextModels().then(render) }
  if (!S.audioModelsLoaded) { loadAudioModels().then(render) }

  const TRASH_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L4 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
  const EDIT_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`
  const COPY_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>`

  const textModels = S.textModels || []
  const audioModels = S.audioModels || []
  const metaTemplates = S.metaTemplates || []
  const totalModels = textModels.length + audioModels.length

  const categoryClass = (cat) => {
    const c = (cat || '').toLowerCase()
    if (c.includes('abord') || c.includes('saud')) return 'abord'
    if (c.includes('follow') || c.includes('fup')) return 'fup'
    if (c.includes('curso') || c.includes('cur')) return 'cur'
    if (c.includes('venda') || c.includes('ven')) return 'ven'
    return 'ger'
  }
  const categoryLabel = (cat) => cat && cat !== 'geral' ? cat : 'Geral'

  const cats = [...new Set(textModels.map(m => (m.category || 'geral').toLowerCase()))].length

  const tabIcon = {
    text: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H7l-4 4V5z"/></svg>`,
    audio: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>`,
    meta: `<svg viewBox="0 0 24 24" fill="currentColor" style="color:var(--brand-wa)"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
  }

  const tabBtnHtml = (key, label, count) => {
    const active = subTab === key
    return `<button class="tab-btn${active?' active':''}" onclick="S.modelSubTab='${key}';render()">
      ${tabIcon[key]}
      ${label}
      <span class="tab-count">${count}</span>
    </button>`
  }

  let primaryCta = ''
  if (subTab === 'text') {
    primaryCta = `<button class="cfg-btn cfg-btn-primary" onclick="S.modelForm={_type:'text',id:null,name:'',content:'',category:''};render()">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
      Novo modelo
    </button>`
  } else if (subTab === 'audio') {
    primaryCta = `<button class="cfg-btn cfg-btn-secondary" onclick="startModelAudioRec()" ${S.modelAudioRec||S.modelAudioBlob?'disabled':''}>
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"/></svg>
      Gravar
    </button>
    <label class="cfg-btn cfg-btn-primary" for="audio-model-upload" style="cursor:pointer">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
      Upload
      <input id="audio-model-upload" type="file" accept=".ogg,.mp3,.m4a,.webm,.opus" style="display:none" onchange="uploadAudioModel(this)"/>
    </label>`
  } else if (subTab === 'meta') {
    const conns = (S.connections || []).filter(c => c.status === 'ACTIVE')
    primaryCta = `<button class="cfg-btn cfg-btn-primary" onclick="S.metaTemplateForm={name:'',language:'pt_BR',category:'',body:'',headerType:'',headerContent:'',footer:'',connectionId:'${conns[0]?.id||''}',buttons:[]};render()">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
      Novo template
    </button>`
  }

  // Build tab content
  let content = ''
  if (subTab === 'text') {
    content = renderTextModelsContent(textModels, { TRASH_SVG, EDIT_SVG, COPY_SVG, categoryClass, categoryLabel })
  } else if (subTab === 'audio') {
    content = renderAudioModelsContent(audioModels, { TRASH_SVG })
  } else if (subTab === 'meta') {
    content = renderMetaTemplatesPanel()
  }

  return `
  <div class="cfg-page-head">
    <div class="cfg-page-head-titles">
      <div class="cfg-page-eyebrow"><span class="dot"></span>Workspace · Biblioteca</div>
      <h1>Modelos</h1>
      <p>Mensagens prontas e áudios pra acionar via <code style="font-family:'JetBrains Mono',monospace;background:var(--surface-2);padding:1px 6px;border-radius:4px;font-size:12px">/</code> no chat. Suporte a variáveis e categorias.</p>
    </div>
    <div class="cfg-page-head-cta">
      ${primaryCta}
    </div>
  </div>

  <div class="tabs-row">
    ${tabBtnHtml('text', 'Mensagens', textModels.length)}
    ${tabBtnHtml('audio', 'Áudios', audioModels.length)}
    ${tabBtnHtml('meta', 'Templates Meta', metaTemplates.length)}
  </div>

  <div class="qcards">
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,var(--accent),#6366f1);box-shadow:0 6px 14px rgba(79,70,229,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${totalModels + metaTemplates.length}</div><div class="qcard-label">Total de modelos</div></div>
    </div>
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 6px 14px rgba(22,163,74,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H7l-4 4V5z"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${textModels.length}</div><div class="qcard-label">Mensagens de texto</div></div>
    </div>
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,#a855f7,#ec4899);box-shadow:0 6px 14px rgba(168,85,247,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${cats}</div><div class="qcard-label">Categoria${cats!==1?'s':''} ativa${cats!==1?'s':''}</div></div>
    </div>
  </div>

  ${content}
  `
}


function renderTextModelsContent(models, { TRASH_SVG, EDIT_SVG, COPY_SVG, categoryClass, categoryLabel }) {
  const form = S.modelForm && S.modelForm._type === 'text' ? S.modelForm : null

  const formHtml = form ? `
    <section class="cfg-card" style="border:1.5px solid #c7d2fe;box-shadow:0 8px 24px -8px rgba(79,70,229,0.18);background:linear-gradient(135deg, var(--accent-soft) 0%, var(--surface) 30%)">
      <div class="cfg-card-head" style="display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;border-radius:11px;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H7l-4 4V5z"/></svg>
        </div>
        <div class="cfg-card-title-block" style="flex:1">
          <h3 class="cfg-card-title" style="font-family:'Bricolage Grotesque',serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary)">${form.id ? 'Editar' : 'Novo'} modelo de texto</h3>
          <p class="cfg-card-sub" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
            <span style="font-size:11.5px;color:var(--text-muted)">Use variáveis:</span>
            <button type="button" class="cn-var-btn" onclick="_insertModelVar('{{nome}}')">{{nome}}</button>
            <button type="button" class="cn-var-btn" onclick="_insertModelVar('{{nome_completo}}')">{{nome_completo}}</button>
            <button type="button" class="cn-var-btn" onclick="_insertModelVar('{{telefone}}')">{{telefone}}</button>
          </p>
        </div>
      </div>
      <div class="cfg-card-body" style="display:flex;flex-direction:column;gap:14px">
        <div class="cn-grid-2">
          <div class="cn-field">
            <label class="cn-field-label">Nome do modelo<span class="req">obrigatório</span></label>
            <input id="mf-name" type="text" class="cn-input" value="${esc(form.name||'')}" placeholder="Ex: Saudação inicial" oninput="S.modelForm={...S.modelForm,name:this.value}"/>
          </div>
          <div class="cn-field">
            <label class="cn-field-label">Categoria<span class="opt">opcional</span></label>
            <input id="mf-cat" type="text" class="cn-input" value="${esc(form.category||'')}" placeholder="abordagem, follow-up, vendas..." oninput="S.modelForm={...S.modelForm,category:this.value}"/>
          </div>
        </div>
        <div class="cn-field">
          <label class="cn-field-label">Conteúdo<span class="req">obrigatório</span></label>
          <textarea id="mf-content" class="cn-textarea" style="min-height:120px" placeholder="Olá {{nome}}, vi que você se interessou..." oninput="S.modelForm={...S.modelForm,content:this.value}">${esc(form.content||'')}</textarea>
          <p class="cn-field-help"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>Clique nas variáveis acima para inserir no cursor.</span></p>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="cn-btn-back" onclick="S.modelForm=null;render()">Cancelar</button>
          <button class="cn-btn-save" onclick="saveTextModel()" ${S.modelFormSaving?'disabled style="opacity:.6;cursor:wait"':''}>
            <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            ${S.modelFormSaving ? 'Salvando…' : (form.id ? 'Salvar alterações' : 'Criar modelo')}
          </button>
        </div>
      </div>
    </section>
  ` : ''

  if (models.length === 0) {
    return `${formHtml}
      <div class="cfg-empty">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <div class="cfg-empty-title">Nenhum modelo de texto criado</div>
        <div class="cfg-empty-text">Crie modelos para usar no chat com o atalho <code style="background:var(--surface-2);padding:1px 5px;border-radius:4px;font-family:'JetBrains Mono',monospace">/</code></div>
      </div>
    `
  }

  const VAR_RE = /\{\{(nome_completo|nome|telefone|\d+)\}\}/g

  return `${formHtml}
    <div class="tpl-grid">
      ${models.map(m => {
        const cat = categoryClass(m.category)
        const catLabel = categoryLabel(m.category)
        const safeName = esc(m.name || '').replace(/'/g, '&#39;')
        const previewContent = esc(m.content || '').replace(VAR_RE, (match) => `<span class="var-token">${match}</span>`)
        return `<div class="tpl-card">
          <div class="tpl-card-head">
            <div class="tpl-card-name">${esc(m.name || 'Sem nome')}</div>
            <span class="tpl-card-cat ${cat}">${esc(catLabel)}</span>
          </div>
          <div class="tpl-card-content">${previewContent}</div>
          <div class="tpl-card-foot">
            <div class="tpl-card-meta">
              <span class="tpl-card-meta-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></span>
              ${(m.content || '').length} caracteres
            </div>
            <div class="tpl-card-actions">
              <button class="cfg-icon-btn" title="Editar" onclick="editTextModel('${m.id}')">${EDIT_SVG}</button>
              <button class="cfg-icon-btn" title="Copiar" onclick="copyToClipboard(${JSON.stringify(m.content||'').replace(/"/g,'&quot;')},'Conteúdo copiado')">${COPY_SVG}</button>
              <button class="cfg-icon-btn danger" title="Excluir" onclick="deleteTextModel('${m.id}','${safeName}')">${TRASH_SVG}</button>
            </div>
          </div>
        </div>`
      }).join('')}
    </div>
  `
}


function renderAudioModelsContent(models, { TRASH_SVG }) {
  const recDur = fmtAudioDur(S.modelAudioDuration || 0)
  const recBar = S.modelAudioRec ? `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;background:#fff1f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:14px">
      <span style="width:10px;height:10px;border-radius:50%;background:#ef4444;animation:cfgPulse 1s infinite;flex-shrink:0"></span>
      <span class="model-rec-timer" style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#dc2626;min-width:50px">${recDur}</span>
      <span style="font-size:13px;color:#ef4444;flex:1">Gravando... fale agora</span>
      <button class="cfg-btn" onclick="stopModelAudioRec()" style="background:#ef4444;color:#fff">Parar</button>
      <button class="btn-row-act" onclick="cancelModelAudioRec()">Cancelar</button>
    </div>` : S.modelAudioBlob ? `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:14px;flex-wrap:wrap">
      <audio controls src="${URL.createObjectURL(S.modelAudioBlob)}" style="height:36px;flex:1;min-width:200px;max-width:300px"></audio>
      <input id="model-audio-name" type="text" placeholder="Nome do áudio..." style="flex:1;min-width:140px;height:36px;padding:0 12px;border:1px solid #86efac;border-radius:8px;font-size:13px;background:#fff;outline:none;font-family:inherit"/>
      <button class="cfg-btn cfg-btn-primary" onclick="saveModelAudioRec()" ${S.modelAudioSaving?'disabled':''} style="background:#16a34a;border-color:#16a34a;${S.modelAudioSaving?'opacity:.6':''}">${S.modelAudioSaving ? 'Salvando...' : 'Salvar'}</button>
      <button class="btn-row-act" onclick="S.modelAudioBlob=null;S.modelAudioDuration=0;render()">Descartar</button>
    </div>` : ''

  if (models.length === 0 && !recBar) {
    return `
      <div class="cfg-empty">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
        <div class="cfg-empty-title">Nenhum modelo de áudio</div>
        <div class="cfg-empty-text">Grave ou faça upload de arquivos de áudio (ogg, mp3, m4a, webm, opus)</div>
      </div>
    `
  }

  return `
    ${recBar}
    <div class="tpl-grid">
      ${models.map(m => {
        const safeName = esc(m.name || '').replace(/'/g, '&#39;')
        return `<div class="tpl-card audio">
          <div class="tpl-card-head">
            <div class="tpl-card-name">${esc(m.name || 'Sem nome')}</div>
            <span class="tpl-card-cat" style="background:var(--accent-soft);color:var(--accent)">Áudio</span>
          </div>
          <div class="tpl-audio-player">
            <audio controls src="${esc(m.fileUrl)}" style="width:100%;height:36px"></audio>
          </div>
          <div class="tpl-card-foot">
            <div class="tpl-card-meta">
              <span class="tpl-card-meta-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg></span>
              ${m.fileUrl ? 'Disponível' : '—'}
            </div>
            <div class="tpl-card-actions">
              <button class="cfg-icon-btn danger" data-del-audio="${m.id}" title="Excluir" onclick="deleteAudioModel('${m.id}','${safeName}')">${TRASH_SVG}</button>
            </div>
          </div>
        </div>`
      }).join('')}
    </div>
  `
}

/* ── META TEMPLATES PANEL ─────────────────────────────────────────── */
// Aponta pra namespace leadUser (com workspace scope). Backend tem GET / + POST / + POST :id/resubmit + PUT :id + DELETE :id + POST :id/sync-status.
var API_TEMPLATES = '/api/v1/leads/templates'

async function loadMetaTemplates() {
  if (S.metaTemplatesLoaded) return
  try {
    const [r, conns] = await Promise.all([
      apiTemplates('?limit=100'),
      S.connections.length ? Promise.resolve(null) : api('/connections?limit=200', {}, '/api/v1/leads').catch(() => null),
    ])
    S.metaTemplates = r.data || []
    if (conns?.data) S.connections = conns.data
    S.metaTemplatesLoaded = true
  } catch(e) { showToast(e.message, 'error') }
}

// ── Custom dropdown (cn-dd) ───────────────────────────────────────────────────

function cnDD(currentValue, options, onChangeCode) {
  const selected = options.find(o => String(o.value) === String(currentValue))
  const placeholderCls = selected ? '' : 'placeholder'
  return `<div class="cn-dd">
    <button type="button" class="cn-dd-trigger ${placeholderCls}" onclick="_cnDDToggle(this, event)">
      <span>${selected ? esc(selected.label) : 'Selecione...'}</span>
      <svg class="chev" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="cn-dd-menu hidden">
      ${options.map(o => {
        const isSel = String(o.value) === String(currentValue)
        const code = JSON.stringify(onChangeCode)
        return `<button type="button" class="cn-dd-option ${isSel?'selected':''}" data-val="${esc(String(o.value))}" onclick='_cnDDPick.call(this, ${code})'>
          <span class="cn-dd-check">${isSel ? '<svg fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.8\" viewBox=\"0 0 24 24\"><polyline points=\"20 6 9 17 4 12\"/></svg>' : ''}</span>
          <span>${esc(o.label)}</span>
        </button>`
      }).join('')}
    </div>
  </div>`
}


function _cnDDToggle(btn, e) {
  if (e) e.stopPropagation()
  const menu = btn.nextElementSibling
  if (!menu) return
  const wasOpen = !menu.classList.contains('hidden')
  document.querySelectorAll('.cn-dd-menu').forEach(m => m.classList.add('hidden'))
  document.querySelectorAll('.cn-dd-trigger.open').forEach(t => t.classList.remove('open'))
  if (!wasOpen) { menu.classList.remove('hidden'); btn.classList.add('open') }
}


function _cnDDPick(code) {
  const value = this.dataset.val
  try {
    new Function('value', code + ';if (typeof render==="function") render()')(value)
  } catch (err) { console.error('cnDD pick error:', err) }
}

if (typeof window !== 'undefined' && !window._cnDDInstalled) {
  window._cnDDInstalled = true
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cn-dd')) {
      document.querySelectorAll('.cn-dd-menu:not(.hidden)').forEach(m => m.classList.add('hidden'))
      document.querySelectorAll('.cn-dd-trigger.open').forEach(t => t.classList.remove('open'))
    }
  })
}

// ─── Swipe gestures (mobile) ──────────────────────────────────────────────────
// (setupGlobalTooltip foi movido pra utils.js — eager — pra ficar ativo
// desde o primeiro hover do boot, antes de settings.js carregar)

// 3 ações detectadas pelo gesto:
//   • Chat aberto + swipe direita → fecha conversa (volta pra lista)
//   • Chat aberto + swipe esquerda → abre painel de detalhes
//   • Detalhes aberto + swipe direita → fecha detalhes (volta pro chat)
// Live transform durante drag + snap/commit animation. Padrão iOS/WhatsApp.
;(function setupSwipeGestures() {
  if (typeof window === 'undefined' || window._swipeGesturesInstalled) return
  window._swipeGesturesInstalled = true

  const SWIPE_THRESHOLD_PX = 60           // mínimo de deslocamento pra aceitar
  const SWIPE_VELOCITY_PXMS = 0.3         // OU velocidade alta
  const VERTICAL_RATIO = 0.7              // |dy| > |dx|*0.7 → vertical scroll, abort
  const SCREEN_PCT_TO_COMMIT = 0.3        // 30% da largura → commit (mais permissivo)
  const PARALLAX_FACTOR = 0.25            // chat se move 25% da distância do dedo
  let s = null

  // ─── DEBUG OVERLAY (gated por ?debug=swipe na URL ou localStorage.swipeDebug=1) ───
  // Pra ativar no celular: abra https://lowan.site/leads/?debug=swipe uma vez
  // (seta localStorage). Depois funciona em qualquer navegação.
  // Pra desligar: localStorage.removeItem('swipeDebug') no console, ou tap-and-hold
  // 3 dedos por 800ms pra esconder/mostrar.
  try {
    if (location.search.includes('debug=swipe')) localStorage.setItem('swipeDebug', '1')
    if (location.search.includes('debug=off')) localStorage.removeItem('swipeDebug')
  } catch {}
  window.__swipeDebug = (() => {
    try { return localStorage.getItem('swipeDebug') === '1' } catch { return false }
  })()
  const _dbgEl = (() => {
    if (typeof document === 'undefined' || !window.__swipeDebug) return null
    const d = document.createElement('div')
    d.id = '__swipe-debug'
    d.style.cssText = 'position:fixed;top:50px;left:8px;right:8px;z-index:99999;font:11px/1.3 monospace;background:rgba(0,0,0,0.85);color:#0f0;padding:6px 8px;border-radius:6px;pointer-events:none;max-height:30vh;overflow:hidden;white-space:pre-wrap'
    d.textContent = 'SWIPE DEBUG READY (3-finger long-press to toggle, ?debug=off to disable)'
    document.body.appendChild(d)
    return d
  })()
  const _dbgLines = []
  const _dbg = (msg) => {
    if (!window.__swipeDebug || !_dbgEl) return
    const t = new Date()
    const ts = `${String(t.getSeconds()).padStart(2,'0')}.${String(t.getMilliseconds()).padStart(3,'0')}`
    _dbgLines.push(`${ts} ${msg}`)
    while (_dbgLines.length > 18) _dbgLines.shift()
    _dbgEl.style.display = 'block'
    _dbgEl.textContent = _dbgLines.join('\n')
  }
  window.__dbg = _dbg
  let _dbgTapTimer = null
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 3 && _dbgEl) {
      _dbgTapTimer = setTimeout(() => {
        _dbgEl.style.display = _dbgEl.style.display === 'none' ? 'block' : 'none'
      }, 800)
    }
  }, { passive: true })
  document.addEventListener('touchend', () => {
    if (_dbgTapTimer) { clearTimeout(_dbgTapTimer); _dbgTapTimer = null }
  }, { passive: true })

  const isMobile = () =>
    window.matchMedia && window.matchMedia('(max-width: 768px)').matches
  const isActiveChat = () =>
    document.body.classList.contains('has-mobile-inbox') &&
    document.body.classList.contains('has-active-conv')

  const isInteractive = (target) => {
    if (!target) return false
    return !!target.closest(
      'textarea, input, button, select, audio, video, ' +
      '.cv-composer, .cv-conn-drop, .ai-modal-bd, ' +
      '[data-lightbox], [contenteditable="true"]'
    )
  }

  // Decide a ação baseada na direção e estado atual da UI
  const decideAction = (dx) => {
    const detailsOpen = !!S.detailsOpen
    if (dx > 0) {
      return detailsOpen ? 'close_details' : 'close_chat'
    } else {
      return detailsOpen ? null : 'open_details'
    }
  }

  // Aplica transform conforme ação + delta. dx é o deslocamento do dedo.
  const applyLiveTransform = (action, dx, screenW, chat, details) => {
    switch (action) {
      case 'close_chat': {
        const off = Math.max(0, dx)
        if (chat) chat.style.transform = `translateX(${off}px)`
        break
      }
      case 'close_details': {
        const off = Math.max(0, dx)
        if (details) details.style.transform = `translateX(${off}px)`
        break
      }
      case 'open_details': {
        const off = Math.min(0, dx)  // negativo
        if (chat) chat.style.transform = `translateX(${off * PARALLAX_FACTOR}px)`
        if (details) details.style.transform = `translateX(${screenW + off}px)`
        break
      }
    }
  }

  document.addEventListener('touchstart', (e) => {
    if (!isMobile() || !isActiveChat()) return
    if (e.touches.length !== 1) return
    if (isInteractive(e.target)) return
    // Bloqueia gestos quando há outro modal/sheet aberto
    if (S.modal || S.mobMoreOpen || S.showWsSwitcher) return
    const t = e.touches[0]
    s = {
      startX: t.clientX, startY: t.clientY,
      lastX: t.clientX,  lastY: t.clientY,
      startTime: Date.now(),
      tracking: false,
      action: null,
      chat: document.getElementById('inbox-chat-area'),
      details: document.getElementById('inbox-details-panel'),
    }
    _dbg(`START x=${t.clientX|0} y=${t.clientY|0} dOpen=${!!S.detailsOpen}`)
  }, { passive: true })

  document.addEventListener('touchmove', (e) => {
    if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.startX
    const dy = t.clientY - s.startY
    s.lastX = t.clientX; s.lastY = t.clientY

    // Decisão de tracking + ação na primeira movimentação significativa
    if (!s.tracking) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      if (Math.abs(dy) > Math.abs(dx) * VERTICAL_RATIO) {
        _dbg(`ABORT vertical dy=${dy|0} dx=${dx|0}`)
        s = null; return
      }

      const action = decideAction(dx)
      if (!action) { _dbg(`ABORT no-action dx=${dx|0}`); s = null; return }
      s.action = action
      s.tracking = true
      _dbg(`TRACK ${action} dx=${dx|0}`)

      // Setup específico por ação — usa classes CSS pra animação consistente
      const screenW = window.innerWidth
      if (action === 'open_details') {
        // Mostra painel manualmente sem alterar S.detailsOpen ainda (commit só seta no final).
        // Isso evita race com outros patches durante o gesto.
        s.details = document.getElementById('inbox-details-panel')
        if (s.details) {
          s.details.style.display = 'flex'
          s.details.style.width = ''
          s.details.innerHTML = renderLeadDetailsPanel(_findActiveLead())
          s.details.classList.add('is-dragging')   // desativa CSS transition durante drag
          s.details.classList.remove('is-open')    // garante que não tem class .is-open
          s.details.style.transform = `translateX(${screenW}px)`  // off-screen direita
          s.details.style.willChange = 'transform'
          // Force reflow: garante que o browser compute o layout do elemento
          // que estava display:none ANTES dos próximos touchmove tentarem
          // aplicar transforms. Sem isso, na primeira abertura o transform
          // não fica consistente porque o painel ainda não tinha layout calculado.
          void s.details.offsetHeight
          // onclick handler pro botão de fechar
          s.details.onclick = (e) => {
            if (e.target.closest('[data-action="close-details"]')) {
              S.detailsOpen = false
              if (typeof _patchInboxDetailsPanel === 'function') _patchInboxDetailsPanel()
              if (typeof _patchInboxChatHeader === 'function') _patchInboxChatHeader()
            }
          }
        }
        if (s.chat) {
          s.chat.style.transition = 'none'
          s.chat.style.willChange = 'transform'
        }
      } else if (action === 'close_chat') {
        // Mostra lista atrás do chat durante o swipe pra revelar conforme desliza
        document.body.classList.add('gesture-back-active')
        if (s.chat) {
          s.chat.style.transition = 'none'
          s.chat.style.willChange = 'transform'
        }
      } else if (action === 'close_details') {
        if (s.details) {
          s.details.classList.add('is-dragging')   // desativa CSS transition durante drag
          s.details.style.willChange = 'transform'
        }
      }
    }

    if (s.tracking) {
      applyLiveTransform(s.action, dx, window.innerWidth, s.chat, s.details)
    }
  }, { passive: true })

  document.addEventListener('touchend', () => {
    if (!s) { _dbg(`END (no-s)`); return }
    const ref = s; s = null
    if (!ref.tracking) { _dbg(`END (no-track)`); return }

    const dx = ref.lastX - ref.startX
    const elapsed = Date.now() - ref.startTime
    const velocity = elapsed > 0 ? dx / elapsed : 0
    const screenW = window.innerWidth
    const absDx = Math.abs(dx)
    const past = absDx >= screenW * SCREEN_PCT_TO_COMMIT ||
                 (Math.abs(velocity) >= SWIPE_VELOCITY_PXMS && absDx >= SWIPE_THRESHOLD_PX)
    _dbg(`END ${ref.action} dx=${dx|0} v=${velocity.toFixed(2)} past=${past}`)

    const T = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)'

    switch (ref.action) {
      case 'close_chat': {
        // Usa transição inline porque chat-area não tem CSS transition setado
        if (past) {
          if (ref.chat) {
            ref.chat.style.transition = T
            ref.chat.style.transform = `translateX(${screenW}px)`
          }
          setTimeout(() => {
            if (ref.chat) {
              ref.chat.style.transition = ''
              ref.chat.style.transform = ''
              ref.chat.style.willChange = ''
            }
            document.body.classList.remove('gesture-back-active')
            try { if (typeof closeConversation === 'function') closeConversation() } catch {}
          }, 220)
        } else {
          if (ref.chat) {
            ref.chat.style.transition = T
            ref.chat.style.transform = ''
          }
          setTimeout(() => {
            if (ref.chat) { ref.chat.style.transition = ''; ref.chat.style.willChange = '' }
            document.body.classList.remove('gesture-back-active')
          }, 240)
        }
        break
      }
      case 'open_details': {
        if (!ref.details) break
        if (past) {
          // Commit: usa transição inline pra ter controle total e evitar conflito
          // entre is-dragging→remove e is-open→add no mesmo tick.
          // Lock _detailsAnimating impede _patchInboxDetailsPanel de interferir.
          S._detailsAnimating = true
          ref.details.classList.remove('is-dragging')
          ref.details.classList.add('is-open')
          ref.details.style.transition = T
          ref.details.style.transform = 'translateX(0)'
          if (ref.chat) {
            ref.chat.style.transition = T
            ref.chat.style.transform = ''
          }
          S.detailsOpen = true
          try { if (typeof _patchInboxChatHeader === 'function') _patchInboxChatHeader() } catch {}
          setTimeout(() => {
            if (ref.details) {
              ref.details.style.transition = ''
              ref.details.style.transform = ''
              ref.details.style.willChange = ''
            }
            if (ref.chat) { ref.chat.style.transition = ''; ref.chat.style.willChange = '' }
            S._detailsAnimating = false
          }, 240)
        } else {
          // Cancel: anima inline até off-screen, depois esconde
          // Lock _detailsAnimating impede patch externo de hard-reset durante anim.
          S._detailsAnimating = true
          ref.details.classList.remove('is-dragging')
          ref.details.style.transition = T
          ref.details.style.transform = `translateX(${screenW}px)`
          if (ref.chat) {
            ref.chat.style.transition = T
            ref.chat.style.transform = ''
          }
          setTimeout(() => {
            if (ref.details) {
              ref.details.style.display = 'none'
              ref.details.style.width = '0'
              ref.details.innerHTML = ''
              ref.details.onclick = null
              ref.details.style.transform = ''
              ref.details.style.transition = ''
              ref.details.style.willChange = ''
            }
            if (ref.chat) { ref.chat.style.transition = ''; ref.chat.style.willChange = '' }
            S._detailsAnimating = false
          }, 240)
        }
        break
      }
      case 'close_details': {
        if (!ref.details) break
        if (past) {
          // Commit close: remove .is-open → CSS default translateX(100%) → slide-out
          S._detailsAnimating = true
          ref.details.classList.remove('is-dragging')
          ref.details.classList.remove('is-open')
          ref.details.style.transform = ''             // limpa inline → CSS default assume
          setTimeout(() => {
            S.detailsOpen = false
            S._detailsAnimating = false
            try { if (typeof _patchInboxDetailsPanel === 'function') _patchInboxDetailsPanel() } catch {}
            try { if (typeof _patchInboxChatHeader === 'function') _patchInboxChatHeader() } catch {}
            if (ref.details) ref.details.style.willChange = ''
          }, 240)
        } else {
          // Cancel: mantém .is-open, limpa inline → CSS class translateX(0) anima de volta
          S._detailsAnimating = true
          ref.details.classList.remove('is-dragging')
          ref.details.style.transform = ''
          setTimeout(() => {
            if (ref.details) ref.details.style.willChange = ''
            S._detailsAnimating = false
          }, 240)
        }
        break
      }
    }
  }, { passive: true })

  // touchcancel — restaura ao estado original (mesma lógica de cancel)
  document.addEventListener('touchcancel', () => {
    if (!s) { _dbg(`CANCEL (no-s)`); return }
    const ref = s; s = null
    if (!ref.tracking) { _dbg(`CANCEL (no-track) action=${ref.action||'-'}`); return }
    _dbg(`CANCEL ${ref.action} dx=${(ref.lastX-ref.startX)|0}`)
    const T = 'transform 0.18s ease-out'
    if (ref.action === 'open_details' && ref.details) {
      S._detailsAnimating = true
      ref.details.classList.remove('is-dragging')
      ref.details.style.transform = ''  // CSS default translateX(100%) com transition
      if (ref.chat) { ref.chat.style.transition = T; ref.chat.style.transform = '' }
      setTimeout(() => {
        if (ref.details) {
          ref.details.style.display = 'none'
          ref.details.style.width = '0'
          ref.details.innerHTML = ''
          ref.details.onclick = null
          ref.details.style.transform = ''
          ref.details.style.willChange = ''
        }
        if (ref.chat) { ref.chat.style.transition = ''; ref.chat.style.willChange = '' }
        S._detailsAnimating = false
      }, 240)
    } else if (ref.action === 'close_details' && ref.details) {
      S._detailsAnimating = true
      ref.details.classList.remove('is-dragging')
      ref.details.style.transform = ''  // CSS class is-open transform translateX(0) com transition
      setTimeout(() => {
        if (ref.details) ref.details.style.willChange = ''
        S._detailsAnimating = false
      }, 240)
    } else if (ref.action === 'close_chat' && ref.chat) {
      ref.chat.style.transition = T
      ref.chat.style.transform = ''
      setTimeout(() => {
        if (ref.chat) { ref.chat.style.transition = ''; ref.chat.style.willChange = '' }
        document.body.classList.remove('gesture-back-active')
      }, 240)
    }
  }, { passive: true })
})()


function _insertModelVar(token) {
  const ta = document.getElementById('mf-content')
  if (!ta) return
  const start = ta.selectionStart, end = ta.selectionEnd
  ta.value = ta.value.slice(0, start) + token + ta.value.slice(end)
  const pos = start + token.length
  ta.focus()
  ta.setSelectionRange(pos, pos)
  S.modelForm = { ...S.modelForm, content: ta.value }
}


function _insertMetaVar(token) {
  const ta = document.getElementById('meta-body-textarea')
  if (!ta) return
  const start = ta.selectionStart, end = ta.selectionEnd
  const before = ta.value.slice(0, start), after = ta.value.slice(end)
  ta.value = before + token + after
  const pos = start + token.length
  ta.focus()
  ta.setSelectionRange(pos, pos)
  _patchMetaBody(ta.value)
}


async function saveMetaTemplate() {
  const f = S.metaTemplateForm
  if (!f) return
  if (!f.name.trim())     { showToast('Nome obrigatório', 'error'); return }
  if (!f.body.trim())     { showToast('Corpo obrigatório', 'error'); return }
  if (!f.connectionId)    { showToast('Selecione uma conexão', 'error'); return }
  if (!f.category)        { showToast('Selecione uma categoria', 'error'); return }

  // Parse variables from body {{1}}, {{2}}...
  const varMatches = [...f.body.matchAll(/\{\{(\d+)\}\}/g)]
  const varIndexes = [...new Set(varMatches.map(m => parseInt(m[1])))].sort((a,b)=>a-b)
  const variables = varIndexes.map(i => ({
    index: i,
    name: `var${i}`,
    example: f[`varEx_${i}`] || `exemplo${i}`
  }))

  // Validate sequential
  if (varIndexes.length > 0 && varIndexes[varIndexes.length-1] !== varIndexes.length) {
    showToast(`Variáveis devem ser sequenciais: {{1}}, {{2}}...`, 'error'); return
  }

  const payload = {
    name: f.name.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''),
    language: f.language || 'pt_BR',
    category: f.category,
    body: f.body.trim(),
    connectionId: f.connectionId,
    variables,
    ...(f.headerType && f.headerContent ? { headerType: f.headerType, headerContent: f.headerContent } : {}),
    ...(f.footer ? { footer: f.footer } : {}),
    ...(f.buttons && f.buttons.length > 0 ? { buttons: f.buttons } : {}),
  }

  S.metaTemplateSaving = true; render()
  try {
    await apiTemplates('', { method:'POST', body: JSON.stringify(payload) })
    showToast('Template enviado para aprovação da Meta')
    S.metaTemplateForm = null
    S.metaTemplatesLoaded = false
    await loadMetaTemplates()
    render()
  } catch(e) {
    showToast(e.message || 'Erro ao criar template', 'error')
  } finally {
    S.metaTemplateSaving = false; render()
  }
}


async function resubmitMetaTemplate(id) {
  try {
    await apiTemplates(`/${id}/resubmit`, { method:'POST', body:'{}' })
    showToast('Template reenviado para a Meta')
    S.metaTemplatesLoaded = false
    await loadMetaTemplates(); render()
  } catch(e) { showToast(e.message, 'error') }
}


async function syncMetaTemplateStatus(id) {
  try {
    await apiTemplates(`/${id}/sync-status`, { method:'POST', body:'{}' })
    S.metaTemplatesLoaded = false
    await loadMetaTemplates(); render()
  } catch(e) { showToast(e.message, 'error') }
}

// ─── Duplicar template em outras conexões ─────────────────────────────
// Reaproveita POST /api/v1/templates passando connectionIds: [...] — o backend
// já suporta multi-conexão nativamente (itera criando 1 template por WABA).

function toggleDupTplConn(connId) {
  const d = S.duplicateTemplate
  if (!d) return
  const idx = d.selectedConnIds.indexOf(connId)
  if (idx >= 0) d.selectedConnIds.splice(idx, 1)
  else d.selectedConnIds.push(connId)
  renderDuplicateTemplateModal()
}


async function submitDuplicateTemplate() {
  const d = S.duplicateTemplate
  if (!d || d.selectedConnIds.length === 0 || d.saving) return
  d.saving = true; renderDuplicateTemplateModal()
  const src = d.source
  // Variables vem como JSON do DB (pode ser [{index,name,example},...]) — repassa igual.
  const payload = {
    name: src.name,
    language: src.language || 'pt_BR',
    category: src.category,
    body: src.body,
    variables: Array.isArray(src.variables) ? src.variables : [],
    connectionIds: d.selectedConnIds,
    ...(src.headerType && src.headerContent ? { headerType: src.headerType, headerContent: src.headerContent } : {}),
    ...(src.footer ? { footer: src.footer } : {}),
    ...(src.buttons && Array.isArray(src.buttons) && src.buttons.length > 0 ? { buttons: src.buttons } : {}),
  }
  try {
    const result = await apiTemplates('', { method:'POST', body: JSON.stringify(payload) })
    const created = Array.isArray(result) ? result.length : (result ? 1 : 0)
    showToast(`Template duplicado em ${created} conexão${created>1?'ões':''}. Aprovação Meta em andamento.`, 'success')
    closeDuplicateTemplateModal()
    S.metaTemplatesLoaded = false
    await loadMetaTemplates(); render()
  } catch(e) {
    d.saving = false
    showToast(e?.message || 'Erro ao duplicar template', 'error')
    renderDuplicateTemplateModal()
  }
}


function renderMetaTemplatesPanel() {
  if (!S.metaTemplatesLoaded) { loadMetaTemplates().then(render) }
  const templates = S.metaTemplates || []
  const f = S.metaTemplateForm
  const conns = (S.connections || []).filter(c => c.status === 'ACTIVE')

  const STATUS_KLASS = { APPROVED:'approved', PENDING:'pending', REJECTED:'rejected', PAUSED:'paused' }
  const STATUS_LBL   = { APPROVED:'Aprovado', PENDING:'Aguardando', REJECTED:'Rejeitado', PAUSED:'Pausado' }
  const connMap = {}; for (const c of (S.connections||[])) connMap[c.id] = c.name

  const bodyVars = f ? [...new Set([...(f.body||'').matchAll(/\{\{(\d+)\}\}/g)].map(m=>parseInt(m[1])))].sort((a,b)=>a-b) : []

  const previewBody = f ? (() => {
    let p = esc(f.body||'')
    bodyVars.forEach(i => {
      p = p.replace(new RegExp(`\\{\\{${i}\\}\\}`,'g'), `<span class="var-chip">${esc(f[`varEx_${i}`]||`var${i}`)}</span>`)
    })
    return p.replace(/\n/g,'<br>')
  })() : ''

  // ─── Form (when active) ───
  const formHtml = f ? `
  <div class="cn-wizard-card" style="border-color:#c7d2fe;border-width:1.5px;background:linear-gradient(135deg, var(--accent-soft) 0%, var(--surface) 30%)">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:36px;height:36px;border-radius:11px;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      </div>
      <div>
        <h3 style="font-family:'Bricolage Grotesque',serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary)">Novo template</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-top:2px">Será enviado pra Meta para aprovação</p>
      </div>
    </div>

    <div class="cn-grid-3">
      <div class="cn-field">
        <label class="cn-field-label">Conexão<span class="req">obrigatório</span></label>
        ${cnDD(f.connectionId||'', [{value:'',label:'Selecione...'}, ...conns.map(c=>({value:c.id,label:c.name}))], 'S.metaTemplateForm={...S.metaTemplateForm,connectionId:value}')}
      </div>
      <div class="cn-field">
        <label class="cn-field-label">Categoria<span class="req">obrigatório</span></label>
        ${cnDD(f.category||'', [
          {value:'',label:'Selecione...'},
          {value:'MARKETING',label:'Marketing'},
          {value:'UTILITY',label:'Utilidade'},
          {value:'AUTHENTICATION',label:'Autenticação'},
        ], 'S.metaTemplateForm={...S.metaTemplateForm,category:value}')}
      </div>
      <div class="cn-field">
        <label class="cn-field-label">Idioma</label>
        ${cnDD(f.language||'pt_BR', [
          {value:'pt_BR',label:'Português (BR)'},
          {value:'en_US',label:'English (US)'},
          {value:'es_ES',label:'Español'},
          {value:'es_AR',label:'Español (AR)'},
        ], 'S.metaTemplateForm={...S.metaTemplateForm,language:value}')}
      </div>
    </div>

    <div class="cn-field">
      <label class="cn-field-label">Nome do template<span class="req">obrigatório</span></label>
      <input type="text" class="cn-input mono" value="${esc(f.name||'')}" placeholder="ex: saudacao_inicial"
        oninput="S.metaTemplateForm={...S.metaTemplateForm,name:this.value}"/>
      <p class="cn-field-help"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>Apenas letras minúsculas, números e underscore. Enviado: <code style="background:var(--surface-2);padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace;color:var(--text-primary)">${(f.name||'').toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'') || '—'}</code></span></p>
    </div>

    <div style="display:grid;grid-template-columns:200px 1fr;gap:14px;align-items:start">
      <div class="cn-field">
        <label class="cn-field-label">Cabeçalho<span class="opt">opcional</span></label>
        ${cnDD(f.headerType||'', [
          {value:'',label:'Sem cabeçalho'},
          {value:'TEXT',label:'Texto'},
          {value:'IMAGE',label:'Imagem (URL)'},
          {value:'VIDEO',label:'Vídeo (URL)'},
          {value:'DOCUMENT',label:'Documento (URL)'},
        ], 'S.metaTemplateForm={...S.metaTemplateForm,headerType:value,headerContent:""}')}
      </div>
      ${f.headerType ? `<div class="cn-field">
        <label class="cn-field-label">${f.headerType==='TEXT' ? 'Texto do cabeçalho' : 'URL da mídia'}</label>
        <input type="text" class="cn-input ${f.headerType!=='TEXT'?'mono':''}" value="${esc(f.headerContent||'')}" placeholder="${f.headerType==='TEXT'?'Ex: Promoção especial':'https://...'}"
          oninput="S.metaTemplateForm={...S.metaTemplateForm,headerContent:this.value}"/>
      </div>` : '<div></div>'}
    </div>

    <div class="cn-field">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:6px">
        <label class="cn-field-label" style="margin:0">Corpo<span class="req">obrigatório</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${[
            ['{{1}}','Nome'],['{{2}}','Empresa'],['{{3}}','Valor'],
            ['{{4}}','Data'],['{{5}}','Link'],['{{6}}','Produto'],
          ].map(([v,l])=>`<button type="button" class="cn-var-btn" onclick="_insertMetaVar('${v}')" title="Inserir ${v}">${v}<span class="lbl">${l}</span></button>`).join('')}
        </div>
      </div>
      <textarea id="meta-body-textarea" class="cn-textarea" placeholder="Ex: Olá {{1}}, temos uma oferta especial para você: {{2}}. Responda para saber mais!"
        style="min-height:120px"
        oninput="_patchMetaBody(this.value)">${esc(f.body||'')}</textarea>
      <p class="cn-field-help"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>Clique nos botões acima para inserir variáveis no cursor · <span id="meta-body-count" style="font-family:'JetBrains Mono',monospace;color:var(--text-secondary);font-weight:600">${f.body?.length||0}/1024</span></span></p>
    </div>

    <div id="meta-body-vars" class="cn-vars-block" style="${bodyVars.length>0?'':'display:none'}">
      <p class="title">Exemplos de variáveis<span class="req-note">(obrigatório para aprovação da Meta)</span></p>
      <div class="vars-grid">
        ${bodyVars.map(i=>`
        <div class="cn-field">
          <label class="cn-field-label" style="font-family:'JetBrains Mono',monospace">{{${i}}}</label>
          <input type="text" class="cn-input" value="${esc(f['varEx_'+i]||'')}" placeholder="Exemplo para {{${i}}}"
            oninput="S.metaTemplateForm={...S.metaTemplateForm,'varEx_${i}':this.value}"/>
        </div>`).join('')}
      </div>
    </div>

    <div class="cn-grid-2">
      <div class="cn-field">
        <label class="cn-field-label">Rodapé<span class="opt">opcional</span></label>
        <input type="text" class="cn-input" value="${esc(f.footer||'')}" placeholder="Ex: Não responder após 24h" maxlength="60"
          oninput="S.metaTemplateForm={...S.metaTemplateForm,footer:this.value}"/>
        <p class="cn-field-help" style="justify-content:flex-end"><span style="font-family:'JetBrains Mono',monospace;color:var(--text-muted)">${f.footer?.length||0}/60</span></p>
      </div>
    </div>

    <div class="cn-field">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <label class="cn-field-label" style="margin:0">Botões<span class="opt">opcional · máx 3</span></label>
        ${(f.buttons||[]).length < 3 ? `<button class="cn-btn-inline ghost" onclick="S.metaTemplateForm={...S.metaTemplateForm,buttons:[...(S.metaTemplateForm.buttons||[]),{type:'QUICK_REPLY',text:''}]};render()"><svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>Botão</button>` : ''}
      </div>
      ${(f.buttons||[]).length === 0 ? `<p style="font-size:12px;color:var(--text-muted)">Nenhum botão adicionado</p>` :
      (f.buttons||[]).map((b,i)=>`
      <div class="cn-tpl-buttons-row">
        ${cnDD(b.type||'QUICK_REPLY', [
          {value:'QUICK_REPLY',label:'Resposta rápida'},
          {value:'URL',label:'URL'},
          {value:'PHONE_NUMBER',label:'Telefone'},
        ], `(()=>{const bs=[...S.metaTemplateForm.buttons];bs[${i}]={...bs[${i}],type:value,url:undefined,phone_number:undefined};S.metaTemplateForm={...S.metaTemplateForm,buttons:bs}})()`)}
        <input type="text" class="cn-input" value="${esc(b.text||'')}" placeholder="Texto do botão" maxlength="200"
          oninput="(()=>{const bs=[...S.metaTemplateForm.buttons];bs[${i}]={...bs[${i}],text:this.value};S.metaTemplateForm={...S.metaTemplateForm,buttons:bs}})()"/>
        ${b.type==='URL'
          ? `<input type="text" class="cn-input mono" value="${esc(b.url||'')}" placeholder="https://..."
              oninput="(()=>{const bs=[...S.metaTemplateForm.buttons];bs[${i}]={...bs[${i}],url:this.value};S.metaTemplateForm={...S.metaTemplateForm,buttons:bs}})()"/>`
          : b.type==='PHONE_NUMBER'
            ? `<input type="text" class="cn-input mono" value="${esc(b.phone_number||'')}" placeholder="+5511..."
                oninput="(()=>{const bs=[...S.metaTemplateForm.buttons];bs[${i}]={...bs[${i}],phone_number:this.value};S.metaTemplateForm={...S.metaTemplateForm,buttons:bs}})()"/>`
            : `<div></div>`}
        <button class="remove-btn" title="Remover botão"
          onclick="(()=>{const bs=[...S.metaTemplateForm.buttons];bs.splice(${i},1);S.metaTemplateForm={...S.metaTemplateForm,buttons:bs};render()})()">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>`).join('')}
    </div>

    ${previewBody ? `
    <div class="cn-preview-box">
      <span class="pv-label">Preview</span>
      ${f.headerType==='TEXT' && f.headerContent ? `<div class="pv-header">${esc(f.headerContent)}</div>` : ''}
      <div class="pv-body" id="meta-body-preview">${previewBody}</div>
      ${f.footer ? `<div class="pv-footer">${esc(f.footer)}</div>` : ''}
      ${(f.buttons||[]).length>0 ? `<div class="pv-buttons">${(f.buttons||[]).map(b=>`<span>${esc(b.text||'...')}</span>`).join('')}</div>` : ''}
    </div>` : ''}

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="cn-btn-back" onclick="S.metaTemplateForm=null;render()">Cancelar</button>
      <button class="cn-btn-save" onclick="saveMetaTemplate()" ${S.metaTemplateSaving?'disabled style="opacity:0.6;cursor:wait"':''}>
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        ${S.metaTemplateSaving ? 'Enviando…' : 'Enviar para Meta'}
      </button>
    </div>
  </div>` : ''

  // ─── Templates list ───
  let listHtml = ''
  if (!S.metaTemplatesLoaded) {
    listHtml = `<div class="cn-tpl-empty-table" style="padding:48px"><p>Carregando...</p></div>`
  } else if (templates.length === 0) {
    listHtml = `
    <div class="cn-tpl-empty-table">
      <div class="icon">
        <svg fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      </div>
      <p>Nenhum template criado ainda</p>
    </div>`
  } else {
    listHtml = `
    <div class="cn-tpl-table-wrap">
      <table class="cn-tpl-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Conexão</th>
            <th>Categoria</th>
            <th>Idioma</th>
            <th class="center">Status</th>
            <th class="right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${templates.map(t => `
          <tr>
            <td>
              <span class="name">${esc(t.name)}</span>
              ${t.variablesCount>0?`<span class="vars-tag">{${t.variablesCount}} ${t.variablesCount>1?'vars':'var'}</span>`:''}
            </td>
            <td>
              ${t.connectionId && connMap[t.connectionId]
                ? `<span class="conn-name" title="${esc(connMap[t.connectionId])}">${esc(connMap[t.connectionId])}</span>`
                : `<span class="muted">—</span>`}
            </td>
            <td><span class="muted">${t.category||'—'}</span></td>
            <td>${t.language ? `<span class="lang-tag">${esc(t.language)}</span>` : `<span class="muted">—</span>`}</td>
            <td class="center"><span class="status-pill ${STATUS_KLASS[t.status]||'paused'}">${STATUS_LBL[t.status]||t.status}</span></td>
            <td class="right">
              <div class="row-actions">
                <button class="cn-action" title="Atualizar status" onclick="syncMetaTemplateStatus('${t.id}')">
                  <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                </button>
                <button class="cn-action" title="Duplicar em outras conexões" onclick="openDuplicateTemplateModal('${t.id}')">
                  <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
                ${t.status==='REJECTED'||t.status==='PAUSED' ? `<button class="resub-btn" onclick="resubmitMetaTemplate('${t.id}')">Reenviar</button>` : ''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`
  }

  return `<div style="display:flex;flex-direction:column;gap:18px">${formHtml}${listHtml}</div>`
}


function editTextModel(id) {
  const m = S.textModels.find(x => x.id === id)
  if (!m) return
  S.modelForm = { _type: 'text', id: m.id, name: m.name, content: m.content, category: m.category || '' }
  render()
}


async function saveTextModel() {
  if (S.modelFormSaving) return
  const form = S.modelForm
  if (!form || form._type !== 'text') return
  const name = document.getElementById('mf-name')?.value?.trim() || form.name
  const content = document.getElementById('mf-content')?.value || form.content
  const category = document.getElementById('mf-cat')?.value?.trim() || form.category
  if (!name) { showToast('Nome obrigatório', 'error'); return }
  if (!content.trim()) { showToast('Conteúdo obrigatório', 'error'); return }
  S.modelFormSaving = true
  try {
    if (form.id) {
      const updated = await apiModels(`/text/${form.id}`, { method: 'PUT', body: JSON.stringify({ name, content, category }) })
      S.textModels = S.textModels.map(m => m.id === form.id ? updated : m)
      showToast('Modelo atualizado', 'success')
    } else {
      const created = await apiModels('/text', { method: 'POST', body: JSON.stringify({ name, content, category }) })
      S.textModels = [...S.textModels, created]
      showToast('Modelo criado', 'success')
    }
    S.modelForm = null
  } catch(e) { showToast(e.message, 'error') }
  S.modelFormSaving = false
  render()
}


async function deleteTextModel(id, name) {
  if (!confirm(`Remover o modelo "${name}"?`)) return
  try {
    await apiModels(`/text/${id}`, { method: 'DELETE' })
    S.textModels = S.textModels.filter(m => m.id !== id)
    showToast('Modelo removido', 'success')
    render()
  } catch(e) { showToast(e.message, 'error') }
}


async function uploadAudioModel(input) {
  const file = input.files?.[0]
  if (!file) return
  const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
  showToast('Enviando áudio...', 'info')
  try {
    const fd = new FormData()
    fd.append('file', file, file.name)
    fd.append('name', name)
    const token = getToken()
    const res = await fetch(API_MODELS + '/audio/upload', {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: fd,
    })
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Erro no upload') }
    const created = await res.json()
    S.audioModels = [...S.audioModels, created]
    S.audioModelsLoaded = true
    showToast('Áudio salvo', 'success')
    render()
  } catch(e) { showToast(e.message, 'error') }
  input.value = ''
}

// ── Gravação de áudio no painel de Modelos ────────────────────────────────────
var _modelAudioRecorder = null
var _modelAudioChunks = []
var _modelAudioTimer = null


async function startModelAudioRec() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    _modelAudioChunks = []
    const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
                   : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                   : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                   : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
                   : ''
    _modelAudioRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    _modelAudioRecorder.ondataavailable = e => { if (e.data.size > 0) _modelAudioChunks.push(e.data) }
    _modelAudioRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(_modelAudioChunks, { type: _modelAudioRecorder.mimeType })
      S.modelAudioBlob = blob
      S.modelAudioRec = false
      clearInterval(_modelAudioTimer)
      render()
    }
    _modelAudioRecorder.start(100)
    S.modelAudioRec = true
    S.modelAudioDuration = 0
    S.modelAudioBlob = null
    _modelAudioTimer = setInterval(() => {
      S.modelAudioDuration++
      // Atualiza o timer no DOM diretamente para não fazer render completo
      const timerEls = document.querySelectorAll('.model-rec-timer')
      timerEls.forEach(el => { el.textContent = fmtAudioDur(S.modelAudioDuration) })
    }, 1000)
    render()
  } catch(e) {
    showToast('Permissão de microfone negada', 'error')
  }
}


function stopModelAudioRec() {
  if (_modelAudioRecorder && _modelAudioRecorder.state !== 'inactive') _modelAudioRecorder.stop()
}


function cancelModelAudioRec() {
  if (_modelAudioRecorder && _modelAudioRecorder.state !== 'inactive') {
    _modelAudioRecorder.ondataavailable = null
    _modelAudioRecorder.onstop = null
    _modelAudioRecorder.stop()
    _modelAudioRecorder.stream?.getTracks().forEach(t => t.stop())
  }
  clearInterval(_modelAudioTimer)
  S.modelAudioRec = false
  S.modelAudioBlob = null
  S.modelAudioDuration = 0
  render()
}


async function saveModelAudioRec() {
  if (!S.modelAudioBlob || S.modelAudioSaving) return
  const nameEl = document.getElementById('model-audio-name')
  const name = nameEl?.value?.trim() || `Áudio ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`
  S.modelAudioSaving = true
  render()
  try {
    const mimeType = S.modelAudioBlob.type || 'audio/ogg'
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : 'ogg'
    const fd = new FormData()
    fd.append('file', S.modelAudioBlob, `${name.replace(/\s+/g,'_')}.${ext}`)
    fd.append('name', name)
    const token = getToken()
    const res = await fetch(API_MODELS + '/audio/upload', {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: fd,
    })
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || 'Erro ao salvar') }
    const created = await res.json()
    S.audioModels = [...S.audioModels, created]
    S.modelAudioBlob = null
    S.modelAudioDuration = 0
    showToast('Áudio salvo como modelo!', 'success')
  } catch(e) { showToast(e.message, 'error') }
  S.modelAudioSaving = false
  render()
}


function deleteAudioModel(id, name) {
  const btn = document.querySelector(`[data-del-audio="${id}"]`)
  if (!btn) return
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1'
    btn.textContent = 'Tem certeza?'
    btn.style.background = '#ef4444'
    btn.style.color = '#fff'
    btn.style.borderColor = '#ef4444'
    setTimeout(() => {
      if (btn.dataset.confirm === '1') {
        btn.dataset.confirm = '0'
        btn.textContent = 'Remover'
        btn.style.background = '#fff1f2'
        btn.style.color = '#ef4444'
        btn.style.borderColor = '#fecaca'
      }
    }, 3000)
    return
  }
  btn.disabled = true
  btn.textContent = 'Removendo...'
  apiModels(`/audio/${id}`, { method: 'DELETE' })
    .then(() => {
      S.audioModels = S.audioModels.filter(m => m.id !== id)
      showToast('Áudio removido', 'success')
      render()
    })
    .catch(e => { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Remover' })
}


async function sendAudioModel(modelId) {
  const leadId = S.conversationLeadId
  if (!leadId) { showToast('Abra uma conversa primeiro', 'error'); return }
  const model = S.audioModels.find(m => m.id === modelId)
  if (!model) return

  // Fecha o picker imediatamente no DOM (surgical path do render() ignora S.templatePicker no fingerprint)
  S.templatePicker = false
  S.templateSearch = ''
  const pickerEl = document.getElementById('template-picker-container')
  if (pickerEl) pickerEl.innerHTML = ''

  // Limpa o "/" do input
  S.replyText = ''
  const ta = document.getElementById('reply-input')
  if (ta) ta.value = ''

  // ── Mensagem temporária aparece no chat imediatamente ──────────────────────
  // Usa model.fileUrl diretamente como source — já está no servidor, sem precisar baixar
  const tempId  = 'audio_temp_' + Date.now()
  const tempPid = `audio-player-${tempId}`
  const previewUrl = model.fileUrl  // URL servida pelo backend (autenticada via token na query ou header)

  const tempMsg = {
    id: tempId, direction: 'OUTBOUND', status: 'PENDING',
    messageContent: '🎧 Áudio',
    metaResponse: { audio: {}, _localBlobUrl: previewUrl },
    sentAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    payloadSent: S.me ? { senderUserId: S.me.id, senderUserName: S.me.name } : undefined,
  }
  if (!S.conversation) S.conversation = { messages: [], hasContact: true }
  S.conversation.messages.push(tempMsg)

  // Pré-registra o player com a URL do modelo para reprodução imediata
  const audioEl = new Audio(`${previewUrl}?token=${encodeURIComponent(getToken())}`)
  _audioPlayers[tempPid] = { el: audioEl, blobUrl: previewUrl }

  if (!appendChatMsg(tempMsg, leadId)) { render(); scrollToBottomChat() }
  else scrollToBottomChat()

  // Conecta eventos do player ao container
  const container = document.getElementById(tempPid)
  if (container) {
    container.setAttribute('data-audio-loaded', '1')
    _bindAudioContainer(container, audioEl)
  }
  _patchInboxReplyBox(); _patchConvReplyBox()

  // ── GET blob + POST reply-audio em background ──────────────────────────────
  try {
    const res = await fetch(model.fileUrl, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw new Error('Erro ao buscar áudio do modelo')
    const blob = await res.blob()
    const mimeType = blob.type || 'audio/ogg'
    const ext = mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('webm') ? 'webm' : 'ogg'
    const formData = new FormData()
    formData.append('file', blob, `${model.name.replace(/\s+/g,'_')}.${ext}`)
    const url = S.convConnId
      ? `${API}/${encodeURIComponent(leadId)}/reply-audio?connectionId=${encodeURIComponent(S.convConnId)}`
      : `${API}/${encodeURIComponent(leadId)}/reply-audio`
    const sendRes = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    })
    if (!sendRes.ok) { const e = await sendRes.json().catch(()=>({})); throw new Error(e.message || `Erro ${sendRes.status}`) }
    const msg = await sendRes.json()

    // ── Troca temp ID → ID real no DOM ────────────────────────────────────────
    const node = document.querySelector(`[data-msg-id="${tempId}"]`)
    if (node) {
      node.setAttribute('data-msg-id', msg.id)
      const statusEl = node.querySelector('[data-msg-status]')
      if (statusEl) statusEl.innerHTML = msgStatusIcon(msg.status, msg.status === 'FAILED')
    }
    // Migra entrada do player: tempPid → pid real
    const realPid = `audio-player-${msg.id}`
    if (_audioPlayers[tempPid]) {
      _audioPlayers[realPid] = _audioPlayers[tempPid]
      delete _audioPlayers[tempPid]
      const playerEl = document.getElementById(tempPid)
      if (playerEl) { playerEl.id = realPid; playerEl.setAttribute('data-audio-loaded', '1') }
    }
    // Atualiza estado preservando previewUrl para reprodução sem novo fetch
    if (S.conversation) {
      S.conversation.messages = S.conversation.messages.map(m =>
        m.id === tempId ? { ...msg, metaResponse: { ...(msg.metaResponse || {}), _localBlobUrl: previewUrl } } : m
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

// ─────────────────────────────────────────────────────────────────────────────


function renderUsersPanel() {
  const TRASH_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L4 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
  const EDIT_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`

  if (S.usersLoading) {
    const skeletonCss = `<style>@keyframes skeletonShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}.skel{background:linear-gradient(90deg,var(--surface-3) 25%,var(--surface-2) 50%,var(--surface-3) 75%);background-size:400% 100%;animation:skeletonShimmer 1.4s ease infinite;border-radius:6px}</style>`
    return `${skeletonCss}
      <div class="cfg-page-head">
        <div class="cfg-page-head-titles">
          <div class="cfg-page-eyebrow"><span class="dot"></span>Workspace · Equipe</div>
          <h1>Colaboradores</h1>
          <p>Carregando colaboradores…</p>
        </div>
      </div>
      <div class="team-card"><table class="team-table">
        <thead><tr><th>Colaborador</th><th>Status</th><th>Permissões</th><th style="text-align:right">Leads</th><th style="width:60px"></th></tr></thead>
        <tbody>${Array(4).fill(0).map((_,i)=>`<tr>
          <td><div class="skel" style="height:14px;width:${140+i*18}px"></div></td>
          <td><div class="skel" style="height:18px;width:54px;border-radius:99px"></div></td>
          <td><div class="skel" style="height:18px;width:84px;border-radius:99px"></div></td>
          <td style="text-align:right"><div class="skel" style="height:14px;width:34px;margin-left:auto"></div></td>
          <td></td>
        </tr>`).join('')}</tbody>
      </table></div>`
  }

  const users = S.users || []
  const activeCount = users.filter(u => u.isActive !== false).length
  const adminCount = users.filter(u => (u.role||'').toUpperCase() === 'ADMIN').length
  const assignedLeads = (S.leads || []).filter(l => l.assignedToId).length
  const totalLeads = (S.leads || []).length
  const assignedPct = totalLeads > 0 ? Math.round((assignedLeads / totalLeads) * 100) : 0

  return `
  <div class="cfg-page-head">
    <div class="cfg-page-head-titles">
      <div class="cfg-page-eyebrow"><span class="dot"></span>Workspace · Equipe</div>
      <h1>Colaboradores</h1>
      <p>Adicione operadores, defina permissões granulares e acompanhe a distribuição de leads em tempo real.</p>
    </div>
    <div class="cfg-page-head-cta">
      <button class="cfg-btn cfg-btn-primary" onclick="openUserForm()">
        <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Novo colaborador
      </button>
    </div>
  </div>

  <div class="qcards">
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 6px 14px rgba(22,163,74,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${activeCount}</div><div class="qcard-label">Ativos</div></div>
    </div>
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,var(--accent),#6366f1);box-shadow:0 6px 14px rgba(79,70,229,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${adminCount}</div><div class="qcard-label">Administrador${adminCount!==1?'es':''}</div></div>
    </div>
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,#d97706,#f59e0b);box-shadow:0 6px 14px rgba(217,119,6,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${assignedLeads}</div><div class="qcard-label">Leads atribuídos</div></div>
      ${totalLeads > 0 ? `<span class="qcard-trend up">${assignedPct}%</span>` : ''}
    </div>
  </div>

  ${users.length === 0 ? `
    <div class="cfg-empty">
      <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
      <div class="cfg-empty-title">Nenhum colaborador cadastrado</div>
      <div class="cfg-empty-text">Comece adicionando o primeiro membro da equipe pra distribuir leads e personalizar permissões.</div>
      <button class="cfg-btn cfg-btn-primary" onclick="openUserForm()">
        <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Adicionar colaborador
      </button>
    </div>
  ` : `
  <div class="team-card">
    <table class="team-table">
      <thead><tr>
        <th>Colaborador</th>
        <th>Status</th>
        <th>Permissões</th>
        <th style="text-align:right">Leads</th>
        <th style="width:80px"></th>
      </tr></thead>
      <tbody>
        ${users.map(u => {
          const leadsCount = (S.leads || []).filter(l => l.assignedToId === u.id).length
          const perms = u.permissions || {}
          const isUserAdmin = (u.role || '').toUpperCase() === 'ADMIN'
          const initial = (u.name || '?').trim()[0]?.toUpperCase() || '?'
          const hue = Math.abs((u.name || u.email || '').split('').reduce((a,c) => a*31 + c.charCodeAt(0), 0)) % 360
          let permPill
          if (isUserAdmin) {
            permPill = `<span class="cfg-pill cfg-pill-admin">
              <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              Administrador
            </span>`
          } else if (perms.manageLeads) {
            permPill = `<span class="cfg-pill cfg-pill-warn">Gerenciar</span>`
          } else if (perms.viewAllLeads) {
            permPill = `<span class="cfg-pill cfg-pill-warn" style="background:rgba(59,130,246,0.10);color:#1d4ed8">Ver todos</span>`
          } else {
            permPill = `<span class="cfg-pill cfg-pill-muted">Básico</span>`
          }
          const userJson = JSON.stringify(u).replace(/"/g, '&quot;')
          return `<tr>
            <td>
              <div class="team-user">
                <div class="team-av" style="background:hsl(${hue},55%,88%);color:hsl(${hue},55%,35%)">${esc(initial)}</div>
                <div>
                  <div class="team-name">${esc(u.name || '—')}</div>
                  <div class="team-email">${esc(u.email || '')}</div>
                </div>
              </div>
            </td>
            <td>${u.isActive !== false
              ? `<span class="cfg-pill cfg-pill-success">Ativo</span>`
              : `<span class="cfg-pill cfg-pill-muted">Inativo</span>`}</td>
            <td>${permPill}</td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace">${leadsCount}</td>
            <td>
              <div style="display:flex;gap:2px;justify-content:flex-end">
                <button class="cfg-icon-btn" title="Editar" onclick="openUserForm(${userJson})">${EDIT_SVG}</button>
                ${!isUserAdmin || users.filter(x=>(x.role||'').toUpperCase()==='ADMIN').length > 1
                  ? `<button class="cfg-icon-btn danger" title="Excluir" onclick="confirmDeleteUser('${u.id}')">${TRASH_SVG}</button>`
                  : ''}
              </div>
            </td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>`}
  `
}




function renderAuditTab(fmtMoney, initials, avatarHue) {
  const audit = S.statsAudit || []
  const f = S._auditFilter || {}

  // Unique operators and types for filters
  const auditOps = [...new Set(audit.map(r => r.operator_name).filter(Boolean))].sort()
  const auditTypes = [...new Set(audit.map(r => r.type_name).filter(Boolean))].sort()

  // Apply filters
  let rows = audit
  if (f.operator) rows = rows.filter(r => r.operator_name === f.operator)
  if (f.type) rows = rows.filter(r => r.type_name === f.type)
  if (f.deleted === 'active') rows = rows.filter(r => !r.deleted_at)
  if (f.deleted === 'deleted') rows = rows.filter(r => !!r.deleted_at)

  const totalActive = audit.filter(r => !r.deleted_at).reduce((a,r) => a + parseFloat(r.amount||0), 0)
  const totalDeleted = audit.filter(r => r.deleted_at).reduce((a,r) => a + parseFloat(r.amount||0), 0)
  const countDeleted = audit.filter(r => r.deleted_at).length

  return `
  <div>
    <!-- KPIs auditoria -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
      <div style="background:#fff;border-radius:12px;border:1px solid #e8edf3;padding:16px 18px">
        <p style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin:0 0 8px">Lançamentos ativos</p>
        <p style="font-size:20px;font-weight:800;color:#0f172a;margin:0">${fmtMoney(totalActive)}</p>
        <p style="font-size:11.5px;color:#94a3b8;margin:4px 0 0">${audit.filter(r=>!r.deleted_at).length} registros</p>
      </div>
      <div style="background:#fff;border-radius:12px;border:1px solid #fecaca;padding:16px 18px">
        <p style="font-size:11px;font-weight:600;color:#f87171;text-transform:uppercase;letter-spacing:.07em;margin:0 0 8px">Excluídos (auditoria)</p>
        <p style="font-size:20px;font-weight:800;color:#dc2626;margin:0">${fmtMoney(totalDeleted)}</p>
        <p style="font-size:11.5px;color:#f87171;margin:4px 0 0">${countDeleted} registro${countDeleted!==1?'s':''}</p>
      </div>
      <div style="background:#fff;border-radius:12px;border:1px solid #e8edf3;padding:16px 18px">
        <p style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin:0 0 8px">Total bruto</p>
        <p style="font-size:20px;font-weight:800;color:#0f172a;margin:0">${fmtMoney(totalActive + totalDeleted)}</p>
        <p style="font-size:11.5px;color:#94a3b8;margin:4px 0 0">${audit.length} lançamentos no período</p>
      </div>
    </div>

    <!-- Filtros -->
    <div style="background:#fff;border-radius:12px;border:1px solid #e8edf3;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <svg width="14" height="14" fill="none" stroke="#94a3b8" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/></svg>
      <span style="font-size:12px;font-weight:600;color:#64748b">Filtrar:</span>
      <select onchange="S._auditFilter={...(S._auditFilter||{}),operator:this.value};render()"
        style="padding:5px 10px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:12px;font-family:inherit;color:#374151;background:#fff;outline:none">
        <option value="">Todos operadores</option>
        ${auditOps.map(op => `<option value="${esc(op)}" ${f.operator===op?'selected':''}>${esc(op)}</option>`).join('')}
      </select>
      <select onchange="S._auditFilter={...(S._auditFilter||{}),type:this.value};render()"
        style="padding:5px 10px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:12px;font-family:inherit;color:#374151;background:#fff;outline:none">
        <option value="">Todos os tipos</option>
        ${auditTypes.map(t => `<option value="${esc(t)}" ${f.type===t?'selected':''}>${esc(t)}</option>`).join('')}
      </select>
      <select onchange="S._auditFilter={...(S._auditFilter||{}),deleted:this.value};render()"
        style="padding:5px 10px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:12px;font-family:inherit;color:#374151;background:#fff;outline:none">
        <option value="all" ${(!f.deleted||f.deleted==='all')?'selected':''}>Todos</option>
        <option value="active" ${f.deleted==='active'?'selected':''}>Somente ativos</option>
        <option value="deleted" ${f.deleted==='deleted'?'selected':''}>Somente excluídos</option>
      </select>
      ${(f.operator||f.type||(f.deleted&&f.deleted!=='all')) ? `
      <button onclick="S._auditFilter={operator:'',type:'',deleted:'all'};render()"
        style="padding:5px 10px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:12px;font-weight:600;color:#64748b;background:#fff;cursor:pointer;font-family:inherit">
        Limpar filtros
      </button>` : ''}
      <span style="margin-left:auto;font-size:11.5px;color:#94a3b8">${rows.length} registro${rows.length!==1?'s':''}</span>
    </div>

    <!-- Tabela de auditoria -->
    <div style="background:#fff;border-radius:14px;border:1px solid #e8edf3;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
      ${rows.length === 0 ? `
      <div style="padding:48px;text-align:center">
        <svg width="40" height="40" fill="none" stroke="#e2e8f0" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 12px;display:block"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <p style="font-size:13px;color:#94a3b8;margin:0">Nenhum registro encontrado</p>
      </div>` : `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:640px">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e8edf3">
              <th style="padding:10px 18px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">Status</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">Lead</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">Tipo</th>
              <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">Valor</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">Operador</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">Lançado em</th>
              <th style="padding:10px 18px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">Excluído por</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const isDeleted = !!r.deleted_at
              const hue = avatarHue(r.operator_name || '')
              const fmtDate = dt => dt ? new Date(dt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'
              return `
              <tr style="border-top:1px solid #f1f5f9;background:${isDeleted?'#fffbfb':'#fff'}" onmouseover="this.style.background='${isDeleted?'#fef2f2':'#f8fafc'}'" onmouseout="this.style.background='${isDeleted?'#fffbfb':'#fff'}'">
                <td style="padding:10px 18px">
                  ${isDeleted
                    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:2px 8px">
                        <svg width="9" height="9" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        Excluído
                      </span>`
                    : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:#059669;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;padding:2px 8px">
                        <svg width="9" height="9" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                        Ativo
                      </span>`}
                </td>
                <td style="padding:10px 14px;max-width:160px">
                  <p style="font-size:12.5px;font-weight:600;color:${isDeleted?'#9ca3af':'#0f172a'};margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isDeleted?'text-decoration:line-through':''}">${esc(r.lead_name||'—')}</p>
                  ${r.lead_phone ? `<p style="font-size:10.5px;color:#94a3b8;margin:2px 0 0">${esc(r.lead_phone)}</p>` : ''}
                </td>
                <td style="padding:10px 14px">
                  <span style="font-size:11.5px;font-weight:600;color:#6d28d9;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:5px;padding:2px 8px">${esc(r.type_name||'—')}</span>
                </td>
                <td style="padding:10px 14px;text-align:right">
                  <span style="font-size:13px;font-weight:700;color:${isDeleted?'#9ca3af':'#059669'};${isDeleted?'text-decoration:line-through':''}">${fmtMoney(r.amount)}</span>
                </td>
                <td style="padding:10px 14px">
                  <div style="display:flex;align-items:center;gap:7px">
                    <div style="width:24px;height:24px;border-radius:50%;background:hsl(${hue},55%,88%);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:hsl(${hue},55%,32%);flex-shrink:0">${initials(r.operator_name||'?')}</div>
                    <span style="font-size:12px;color:#374151;font-weight:500">${esc(r.operator_name||'—')}</span>
                  </div>
                  ${r.description ? `<p style="font-size:10.5px;color:#94a3b8;margin:3px 0 0 31px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px" title="${esc(r.description)}">${esc(r.description)}</p>` : ''}
                </td>
                <td style="padding:10px 14px">
                  <span style="font-size:11.5px;color:#64748b">${fmtDate(r.created_at)}</span>
                </td>
                <td style="padding:10px 18px">
                  ${isDeleted ? `
                  <div>
                    <span style="font-size:11.5px;font-weight:600;color:#dc2626">${esc(r.deleted_by_name||'—')}</span>
                    <p style="font-size:10.5px;color:#f87171;margin:2px 0 0">${fmtDate(r.deleted_at)}</p>
                  </div>` : `<span style="font-size:12px;color:#d1d5db">—</span>`}
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  </div>`
}

// ── API / Integrações ─────────────────────────────────────────────────────────


// ─── Schedule Messages (agendamento de chat) ─────────────────────────────
var SCHED_API = `/api/v1/scheduled-messages`