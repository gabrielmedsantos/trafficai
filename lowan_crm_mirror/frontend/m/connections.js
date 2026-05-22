// connections.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

async function fetchConnections() {
  S.connLoading = true; render()
  try {
    const r = await api('/connections?limit=50')
    let list = r.data || r
    // Funde business_id/name do business-map (rápido, lê do DB)
    try {
      const bMap = await api('/whatsapp-signup/business-map').catch(() => ({}))
      list = list.map(c => {
        const b = bMap && bMap[c.id]
        return b ? { ...c, businessId: b.businessId, businessName: b.businessName } : c
      })
    } catch {}
    S.connections = list
    // Auto-refresh em background pras connections sem business_id (cadastro manual ou pré-fix)
    if (canManageConns()) {
      const needsRefresh = list.filter(c => !c.businessId && c.wabaId).slice(0, 5)
      if (needsRefresh.length > 0) {
        Promise.all(needsRefresh.map(c =>
          api('/whatsapp-signup/refresh-business/' + c.id, { method: 'POST' }).then(res => ({ id: c.id, res })).catch(() => null)
        )).then(results => {
          let changed = false
          for (const r of results) {
            if (!r || !r.res) continue
            const c = S.connections.find(x => x.id === r.id)
            if (c && r.res.businessId) { c.businessId = r.res.businessId; c.businessName = r.res.businessName; changed = true }
          }
          if (changed) scheduleRender()
        })
      }
    }
  } catch(e) { showToast(e.message, 'error') }
  finally { S.connLoading = false; scheduleRender() }
}

var UNOFF_API = '/api/v1/unofficial'

function getAvatarSessionId() { return 'avatar-fetcher-' + (S.workspaceSlug || S.me?.id || 'default') }


async function loadAvatarSession() {
  S.avatarSessionLoading = true; render()
  try {
    const sessions = await apiUnoff('/sessions', { cache: 'no-store' })
    S.avatarSession = Array.isArray(sessions) ? (sessions.find(s => s.id === getAvatarSessionId()) || null) : null
  } catch(_) { S.avatarSession = null }
  finally {
    S.avatarSessionLoading = false
    S.avatarSessionLoaded = true
    render()
    // Se a sessão está conectada, dispara a fila de busca de avatares em background
    if (S.avatarSession?.sessionStatus === 'connected') {
      _enqueueLeadsForAvatarFetch()
      _runAvatarQueue()
    }
  }
}


async function connectAvatarSession() {
  S.avatarSessionLoading = true; render()
  try {
    // Cria sessão se não existe
    if (!S.avatarSession) {
      await apiUnoff('/sessions', { method: 'POST', body: JSON.stringify({ id: getAvatarSessionId(), name: 'Foto de Perfil' }) })
    }
    const r = await apiUnoff(`/sessions/${getAvatarSessionId()}/start`, { method: 'POST' })
    S.avatarSession = { id: getAvatarSessionId(), name: 'Foto de Perfil', sessionStatus: r.status, qrDataUrl: r.qrDataUrl }
    if (r.status === 'connecting' || r.status === 'qr') _startAvatarQrPoll()
  } catch(e) { showToast(e.message, 'error') }
  finally { S.avatarSessionLoading = false; scheduleRender() }
}


async function disconnectAvatarSession() {
  _stopAvatarQrPoll()
  try {
    await apiUnoff(`/sessions/${getAvatarSessionId()}/disconnect`, { method: 'POST' })
    S.avatarSession = { ...S.avatarSession, sessionStatus: 'disconnected', qrDataUrl: null }
  } catch(e) { showToast(e.message, 'error') }
  render()
}


function _startAvatarQrPoll() {
  _stopAvatarQrPoll()
  S.avatarSessionQrPoll = setInterval(async () => {
    try {
      const r = await apiUnoff(`/sessions/${getAvatarSessionId()}/qr`)
      S.avatarSession = { ...S.avatarSession, sessionStatus: r.status, qrDataUrl: r.qrDataUrl }
      if (r.status === 'connected') {
        _stopAvatarQrPoll()
        // Sessão acabou de conectar — inicia busca de avatares em background
        _enqueueLeadsForAvatarFetch()
        setTimeout(_runAvatarQueue, 1000)
      }
      render()
    } catch(_) {}
  }, 2500)
}


function _stopAvatarQrPoll() {
  if (S.avatarSessionQrPoll) { clearInterval(S.avatarSessionQrPoll); S.avatarSessionQrPoll = null }
}

// ─── Telegram API ─────────────────────────────────────────────────────────────
var API_TELEGRAM = '/api/v1/leads/telegram'

async function fetchTelegramBots() {
  // Backend telegram.routes.js exige admin (requireLeadAdmin global no hook).
  // Pra COLLABORATOR, pula early — bots Telegram são admin-only por design.
  if (!isAdmin()) { S.telegramBots = []; return }
  S.telegramLoading = true; render()
  try { S.telegramBots = await apiTelegram('/') }
  catch(e) { showToast(e.message, 'error') }
  finally { S.telegramLoading = false; scheduleRender() }
}


async function addTelegramBot() {
  const f = S.telegramForm
  if (!f?.name?.trim()) { S.telegramFormError = 'Nome obrigatório'; render(); return }
  if (!f?.botToken?.trim()) { S.telegramFormError = 'Token obrigatório'; render(); return }
  S.telegramFormError = ''
  const saving = true; render()
  try {
    const bot = await apiTelegram('/', { method: 'POST', body: JSON.stringify({ name: f.name.trim(), botToken: f.botToken.trim() }) })
    S.telegramBots = [bot, ...S.telegramBots]
    S.telegramForm = null
    showToast(`Bot @${bot.botUsername || bot.name} conectado!`)
  } catch(e) { S.telegramFormError = e.message }
  finally { render() }
}


async function deleteTelegramBot(id) {
  if (!confirm('Remover este bot? O webhook será cancelado.')) return
  try {
    await apiTelegram(`/${id}`, { method: 'DELETE' })
    S.telegramBots = S.telegramBots.filter(b => b.id !== id)
    showToast('Bot removido')
    render()
  } catch(e) { showToast(e.message, 'error') }
}


async function checkTelegramBot(id) {
  S.telegramChecking = { ...S.telegramChecking, [id]: true }; render()
  try {
    const r = await apiTelegram(`/${id}/check`, { method: 'POST', body: '{}' })
    S.telegramBots = S.telegramBots.map(b => b.id === id ? { ...b, status: r.status } : b)
    if (r.valid && r.webhookOk) showToast('Bot ativo e webhook configurado ✓')
    else if (!r.valid) showToast('Token inválido ou bot desativado', 'error')
    else showToast('Token válido, webhook reconfigurado ✓')
  } catch(e) { showToast(e.message, 'error') }
  finally { delete S.telegramChecking[id]; render() }
}


async function fetchUnofficialSessions() {
  S.unofficialLoading = true; render()
  try { S.unofficialSessions = await apiUnoff('/sessions') }
  catch(e) { console.error('Unofficial sessions unavailable:', e.message) }
  finally { S.unofficialLoading = false; scheduleRender() }
}


async function createUnofficialSession() {
  const name = S.unofficialNewName.trim()
  if (!name) return showToast('Informe um nome para a conexão', 'error')
  const proxyUrl = (S.unofficialNewProxyUrl||'').trim() || null
  const proxyLabel = (S.unofficialNewProxyLabel||'').trim() || null
  const proxyCountry = (S.unofficialNewProxyCountry||'').trim() || null
  try {
    const sess = await apiUnoff('/sessions', {
      method:'POST',
      body: JSON.stringify({ name, proxyUrl, proxyLabel, proxyCountry })
    })
    S.unofficialNewName = ''
    S.unofficialNewProxyUrl = ''
    S.unofficialNewProxyLabel = ''
    S.unofficialNewProxyCountry = ''
    S.unofficialSessions = [...S.unofficialSessions, {...sess, sessionStatus:'connecting', qrDataUrl:null}]
    render()
    startUnofficialQrPoll(sess.id)
  } catch(e) { showToast(e.message, 'error') }
}


async function updateUnofficialSessionProxy(id) {
  const proxyUrl = prompt('Proxy URL (http://user:pass@host:port). Vazio = sem proxy. Requer reconectar.', '')
  if (proxyUrl === null) return // canceled
  const proxyLabel = prompt('Label (opcional):', '') || null
  const proxyCountry = prompt('País 2 letras (opcional):', 'BR') || null
  try {
    await apiUnoff(`/sessions/${id}/proxy`, {
      method:'PATCH',
      body: JSON.stringify({ proxyUrl: proxyUrl.trim() || null, proxyLabel, proxyCountry })
    })
    showToast('Proxy atualizado. Reconecte a sessão para aplicar.', 'success')
    fetchUnofficialSessions()
  } catch(e) { showToast(e.message, 'error') }
}


async function startUnofficialSession(id) {
  try {
    const r = await apiUnoff(`/sessions/${id}/start`, { method:'POST' })
    S.unofficialSessions = S.unofficialSessions.map(s => s.id===id ? {...s, sessionStatus:r.status, qrDataUrl:r.qrDataUrl} : s)
    render()
    if (r.status !== 'connected') startUnofficialQrPoll(id)
  } catch(e) { showToast(e.message, 'error') }
}


async function disconnectUnofficialSession(id) {
  try {
    await apiUnoff(`/sessions/${id}/disconnect`, { method:'POST' })
    S.unofficialSessions = S.unofficialSessions.map(s => s.id===id ? {...s, sessionStatus:'disconnected', qrDataUrl:null} : s)
    stopUnofficialQrPoll()
    render()
  } catch(e) { showToast(e.message, 'error') }
}

// Liga/desliga proteções anti-ban (cold open, spam content, warmup, quota) por sessão

async function toggleUnofficialAntiban(id, enabled) {
  enabled = !!enabled
  // Confirmação: desligar = perigo real; ligar = OK mas pede ciência
  const msg = enabled
    ? 'Ligar anti-ban (cold open check, spam detector, warmup, quota)?'
    : 'DESLIGAR anti-ban? Você libera cold outbound livre, sem warmup cap, sem detecção de spam. Risco real de ban precoce. Continuar?'
  if (!confirm(msg)) return
  try {
    await apiUnoff(`/sessions/${id}/antiban`, { method:'PATCH', body: JSON.stringify({ enabled }) })
    S.unofficialSessions = S.unofficialSessions.map(s => s.id===id ? {...s, antibanEnabled: enabled} : s)
    showToast(enabled ? 'Anti-ban ativado' : 'Anti-ban desativado — cuidado com ban precoce', enabled ? 'success' : 'error')
    render()
  } catch(e) { showToast(e?.message || 'Erro ao atualizar', 'error') }
}


async function deleteUnofficialSession(id) {
  if (!confirm('Remover esta conexão não oficial?')) return
  try {
    await apiUnoff(`/sessions/${id}`, { method:'DELETE' })
    S.unofficialSessions = S.unofficialSessions.filter(s => s.id !== id)
    stopUnofficialQrPoll()
    render()
  } catch(e) { showToast(e.message, 'error') }
}


function startUnofficialQrPoll(id) {
  stopUnofficialQrPoll()
  S.unofficialQrPoll = setInterval(async () => {
    try {
      const r = await apiUnoff(`/sessions/${id}/qr`)
      S.unofficialSessions = S.unofficialSessions.map(s => s.id===id ? {...s, sessionStatus:r.status, qrDataUrl:r.qrDataUrl} : s)
      if (r.status === 'connected' || r.status === 'logged_out') stopUnofficialQrPoll()
      render()
    } catch {}
  }, 3000)
}


function stopUnofficialQrPoll() {
  if (S.unofficialQrPoll) { clearInterval(S.unofficialQrPoll); S.unofficialQrPoll = null }
}

// ─── uazapi (WhatsApp não-oficial via terceiro) ──────────────────────────────

async function fetchUazapiInstances() {
  S.uazapiLoading = true; render()
  try {
    const r = await api('/uazapi-instances')
    S.uazapiInstances = r.instances || []
  } catch(e) { console.error('uazapi list failed:', e.message) }
  finally { S.uazapiLoading = false; scheduleRender() }
}


async function createUazapiInstance() {
  const name = (S.uazapiNewName||'').trim()
  if (!name) return showToast('Informe um nome', 'error')
  try {
    const r = await api('/uazapi-instances', { method:'POST', body:{ name } })
    S.uazapiNewName = ''
    S.uazapiInstances = [...(S.uazapiInstances||[]), r.instance]
    render()
  } catch(e) { showToast(e.message, 'error') }
}


async function connectUazapiInstance(id) {
  try {
    const r = await api(`/uazapi-instances/${id}/connect`, { method:'POST', body:{} })
    if (r.qrcode) {
      S.uazapiQrData = S.uazapiQrData || {}
      S.uazapiQrData[id] = { qrDataUrl: r.qrcode, expiresAt: Date.now() + 60000 }
    }
    if (r.status) S.uazapiInstances = S.uazapiInstances.map(i => i.id===id ? {...i, status:r.status} : i)
    render()
    startUazapiQrPoll(id)
  } catch(e) { showToast(e.message, 'error') }
}


async function disconnectUazapiInstance(id) {
  try {
    await api(`/uazapi-instances/${id}/disconnect`, { method:'POST' })
    stopUazapiQrPoll(id)
    if (S.uazapiQrData) delete S.uazapiQrData[id]
    S.uazapiInstances = S.uazapiInstances.map(i => i.id===id ? {...i, status:'disconnected'} : i)
    render()
  } catch(e) { showToast(e.message, 'error') }
}


async function deleteUazapiInstance(id) {
  if (!confirm('Remover esta instância uazapi? A sessão será desconectada.')) return
  try {
    await api(`/uazapi-instances/${id}`, { method:'DELETE' })
    stopUazapiQrPoll(id)
    if (S.uazapiQrData) delete S.uazapiQrData[id]
    S.uazapiInstances = (S.uazapiInstances||[]).filter(i => i.id !== id)
    render()
  } catch(e) { showToast(e.message, 'error') }
}


async function toggleAntibanUazapi(id, enabled) {
  try {
    await api(`/uazapi-instances/${id}/antiban`, { method:'PATCH', body:{ enabled } })
    S.uazapiInstances = S.uazapiInstances.map(i => i.id===id ? {...i, antibanEnabled:enabled} : i)
    render()
  } catch(e) { showToast(e.message, 'error') }
}


function startUazapiQrPoll(id) {
  stopUazapiQrPoll(id)
  S.uazapiQrPolls = S.uazapiQrPolls || {}
  S.uazapiQrPolls[id] = setInterval(async () => {
    try {
      const r = await api(`/uazapi-instances/${id}/qr`)
      const cur = S.uazapiInstances.find(i => i.id===id) || {}
      const patch = {}
      let needsRender = false
      if (r.status && r.status !== cur.status) { patch.status = r.status; needsRender = true }
      if (r.phoneNumber && r.phoneNumber !== cur.phoneNumber) { patch.phoneNumber = r.phoneNumber; needsRender = true }
      if (r.profileName && r.profileName !== cur.profileName) { patch.profileName = r.profileName; needsRender = true }
      if (r.jid && r.jid !== cur.jid) { patch.jid = r.jid; needsRender = true }
      if (Object.keys(patch).length) S.uazapiInstances = S.uazapiInstances.map(i => i.id===id ? {...i, ...patch} : i)
      if (r.qrcode) {
        S.uazapiQrData = S.uazapiQrData || {}
        const hadQr = !!S.uazapiQrData[id]
        S.uazapiQrData[id] = { qrDataUrl: r.qrcode, expiresAt: Date.now() + 60000 }
        // Se já tinha QR no DOM, só atualiza src — evita re-render que pisca a tela
        const img = document.getElementById('uazapi-qr-' + id)
        if (hadQr && img) img.src = r.qrcode
        else needsRender = true  // primeira vez: precisa render pra criar o <img>
      }
      if (r.status === 'connected') {
        stopUazapiQrPoll(id)
        if (S.uazapiQrData) delete S.uazapiQrData[id]
        showToast('WhatsApp conectado!', 'success')
        needsRender = true
      }
      if (needsRender) render()
    } catch {}
  }, 4000)
}


function stopUazapiQrPoll(id) {
  if (!S.uazapiQrPolls) return
  if (S.uazapiQrPolls[id]) { clearInterval(S.uazapiQrPolls[id]); delete S.uazapiQrPolls[id] }
}


async function connUpdateStatus(id, status) {
  try {
    const r = await apiAdmin(`/connections/${id}/status`, { method:'PATCH', body:JSON.stringify({ status }) })
    S.connections = S.connections.map(c => c.id===id ? {...c, status:r.status} : c)
    showToast(`Status: ${CONN_STATUS[status]?.label}`)
    render()
  } catch(e) { showToast(e.message,'error') }
}


async function connDelete() {
  try {
    await apiAdmin(`/connections/${S.connSelectedId}`, { method:'DELETE' })
    S.connections = S.connections.filter(c => c.id!==S.connSelectedId)
    S.connModal = null; S.connSelectedId = null
    showToast('Conexão removida')
    render()
  } catch(e) { showToast(e.message,'error') }
}


async function connOpenDetail(id) {
  S.connSelectedId = id
  S.connDetail = S.connections.find(c=>c.id===id)||null
  S.connDetailHealth = null
  S.connDetailLoading = true
  S.connModal = 'detail'
  render()
  try {
    const [conn, health] = await Promise.all([apiAdmin(`/connections/${id}`), apiAdmin(`/connections/${id}/health`)])
    S.connDetail = conn; S.connDetailHealth = health
  } catch(e) { showToast(e.message,'error') }
  finally { S.connDetailLoading=false; scheduleRender() }
}


function connCloseModal() { S.connModal=null; S.connSelectedId=null; S.connDetail=null; S.connDetailHealth=null; render() }

// ── Proxy pool ────────────────────────────────────────────────────────────────
// Carrega lista de proxies do pool com status derivado (free/in_use/burned).
// Cache de 30s pra evitar refetch a cada abertura do wizard.

async function loadProxyPool(force=false) {
  if (!force && S.proxyPool.length && (Date.now() - S.proxyPoolLoadedAt) < 30000) return
  S.proxyPoolLoading = true
  try {
    const data = await apiProxyPool('')
    S.proxyPool = data?.proxies || []
    S.proxyPoolLoadedAt = Date.now()
  } catch (e) {
    console.error('loadProxyPool failed:', e)
    S.proxyPool = []
  } finally {
    S.proxyPoolLoading = false
    scheduleRender()
  }
}

// Aplica proxy escolhido no S.connForm (wizard Cloud API)

function selectProxyForConn(proxyId) {
  if (!proxyId) {
    S.connForm.proxyUrl = ''
    S.connForm.proxyLabel = ''
    S.connForm.proxyCountry = ''
  } else {
    const p = S.proxyPool.find(x => x.id === proxyId)
    if (p) {
      S.connForm.proxyUrl = p.url
      S.connForm.proxyLabel = p.label || ''
      S.connForm.proxyCountry = p.country || 'BR'
    }
  }
  render()
}

// Aplica proxy escolhido no state da sessão unofficial nova

function selectProxyForUnoff(proxyId) {
  if (!proxyId) {
    S.unofficialNewProxyUrl = ''
    S.unofficialNewProxyLabel = ''
    S.unofficialNewProxyCountry = ''
  } else {
    const p = S.proxyPool.find(x => x.id === proxyId)
    if (p) {
      S.unofficialNewProxyUrl = p.url
      S.unofficialNewProxyLabel = p.label || ''
      S.unofficialNewProxyCountry = p.country || 'BR'
    }
  }
  render()
}

// Render do dropdown — usado em ambos wizards (Cloud + Baileys).
// Args: currentUrl (URL atualmente atribuída, pra manter selecionável mesmo se in_use); onChangeFn (string com JS pra onchange)

function renderProxyDropdown(currentUrl, onChangeFn) {
  if (S.proxyPoolLoading) return '<div style="font-size:12.5px;color:var(--text-secondary);padding:8px 0">Carregando pool de proxies...</div>'
  if (!S.proxyPool.length) {
    return `<div style="font-size:12.5px;color:var(--text-secondary);padding:8px 0">
      Nenhum proxy cadastrado no pool. <button type="button" onclick="loadProxyPool(true)" style="background:none;border:none;color:var(--accent);cursor:pointer;text-decoration:underline;font-size:12.5px">Recarregar</button>
    </div>`
  }
  const matchUrl = currentUrl && currentUrl.trim()
  const opts = ['<option value="">— Sem proxy (sai pelo IP da VPS) —</option>']
  for (const p of S.proxyPool) {
    const isCurrent = matchUrl && p.url === matchUrl
    const disabled = !isCurrent && (p.status === 'in_use' || p.status === 'burned')
    let label = `${p.label || p.host} (${p.host})`
    if (p.status === 'free') label += ' — livre'
    else if (p.status === 'in_use') {
      const usedBy = p.assignedTo?.[0]?.name || 'outra conexão'
      label += isCurrent ? ' — atribuído a esta conexão' : ` — em uso por ${usedBy}`
    } else if (p.status === 'burned') {
      label += ' — queimado' + (p.burnedReason ? ` (${p.burnedReason})` : '')
    }
    const selected = isCurrent ? ' selected' : ''
    opts.push(`<option value="${esc(p.id)}"${selected}${disabled?' disabled':''}>${esc(label)}</option>`)
  }
  return `<select onchange="${onChangeFn}" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font-size:13.5px;background:var(--surface);color:var(--text-primary);font-family:inherit">
    ${opts.join('')}
  </select>
  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;display:flex;justify-content:space-between;align-items:center">
    <span>${S.proxyPool.filter(p=>p.status==='free').length} livres · ${S.proxyPool.filter(p=>p.status==='in_use').length} em uso · ${S.proxyPool.filter(p=>p.status==='burned').length} queimados</span>
    <button type="button" onclick="loadProxyPool(true)" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11.5px">↻ atualizar</button>
  </div>`
}

// ── Wizard ────────────────────────────────────────────────────────────────────

function openConnWizard(conn=null) {
  S.wizardEditId = conn?.id||null
  S.wizardStep = 1
  S.wizardChecked = false
  S.wizardCheckResult = null
  S.connForm = conn ? {
    name: conn.name, phoneNumberId: conn.phoneNumberId, wabaId: conn.wabaId,
    accessToken:'', appSecret:'', webhookVerifyToken: conn.webhookVerifyToken||'',
    priority: conn.priority??1, rateLimitPerMinute: conn.rateLimitPerMinute??10, rateLimitPerDay: conn.rateLimitPerDay??1000,
    proxyUrl: conn.proxyUrl||'', proxyLabel: conn.proxyLabel||'', proxyCountry: conn.proxyCountry||'',
  } : {
    name:'', phoneNumberId:'', wabaId:'', accessToken:'', appSecret:'',
    webhookVerifyToken: genToken(),
    priority:1, rateLimitPerMinute:10, rateLimitPerDay:1000,
    proxyUrl:'', proxyLabel:'', proxyCountry:'',
  }
  S.connFormError = ''
  S.connView = 'wizard'
  loadProxyPool() // carrega em background, dropdown re-renderiza quando pronto
  render()
}


function genToken() {
  const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({length:24},()=>c[Math.floor(Math.random()*c.length)]).join('')
}


function wizardNext() {
  S.connFormError=''
  if (S.wizardStep===1) {
    if (!S.connForm.name?.trim()) { S.connFormError='Nome obrigatório.'; render(); return }
    if (!S.connForm.phoneNumberId?.trim()) { S.connFormError='Phone Number ID obrigatório.'; render(); return }
    if (!S.connForm.wabaId?.trim()) { S.connFormError='WABA ID obrigatório.'; render(); return }
  }
  if (S.wizardStep===2 && !S.wizardEditId && !S.connForm.accessToken?.trim()) {
    S.connFormError='Access Token obrigatório.'; render(); return
  }
  S.wizardStep++; render()
}

function wizardBack() { S.wizardStep--; S.connFormError=''; render() }


async function wizardSave() {
  S.connFormError=''
  const body = {
    name: S.connForm.name.trim(), phoneNumberId: S.connForm.phoneNumberId.trim(),
    wabaId: S.connForm.wabaId.trim(),
    priority: Number(S.connForm.priority),
    rateLimitPerMinute: Number(S.connForm.rateLimitPerMinute),
    rateLimitPerDay: Number(S.connForm.rateLimitPerDay),
  }
  if (S.connForm.accessToken?.trim()) body.accessToken = S.connForm.accessToken.trim()
  if (S.connForm.appSecret?.trim()) body.appSecret = S.connForm.appSecret.trim()
  if (S.connForm.webhookVerifyToken?.trim()) body.webhookVerifyToken = S.connForm.webhookVerifyToken.trim()
  try {
    let saved
    if (S.wizardEditId) {
      saved = await apiAdmin(`/connections/${S.wizardEditId}`, { method:'PUT', body:JSON.stringify(body) })
      S.connections = S.connections.map(c => c.id===S.wizardEditId ? {...c,...saved} : c)
    } else {
      saved = await apiAdmin('/connections', { method:'POST', body:JSON.stringify(body) })
      S.connections.unshift(saved)
    }
    // Salva proxy (endpoint separado — campos fora do schema Zod do connection)
    const _hasProxy = S.connForm.proxyUrl?.trim() || S.connForm.proxyLabel?.trim() || S.connForm.proxyCountry?.trim()
    if (_hasProxy) {
      try {
        await apiAdmin(`/connections/${saved.id}/proxy`, {
          method: 'PATCH',
          body: JSON.stringify({
            proxyUrl: S.connForm.proxyUrl?.trim() || null,
            proxyLabel: S.connForm.proxyLabel?.trim() || null,
            proxyCountry: S.connForm.proxyCountry?.trim() || null,
          })
        })
        saved.proxyUrl = S.connForm.proxyUrl?.trim() || null
        saved.proxyLabel = S.connForm.proxyLabel?.trim() || null
        saved.proxyCountry = S.connForm.proxyCountry?.trim() || null
      } catch(e) {
        showToast('Conexão salva mas falha ao salvar proxy: ' + e.message, 'error')
      }
    }
    S.wizardEditId = saved.id
    S.wizardStep = 4; render()
  } catch(e) { S.connFormError=e.message; render() }
}


async function wizardCheckToken() {
  S.wizardCheckLoading=true; render()
  try {
    const r = await apiAdmin(`/connections/${S.wizardEditId}/check`, { method:'POST' })
    S.wizardChecked=true; S.wizardCheckResult=r
    showToast('Token válido!')
  } catch(e) { S.wizardChecked=false; S.wizardCheckResult={error:e.message}; showToast(e.message,'error') }
  finally { S.wizardCheckLoading=false; scheduleRender() }
}


function wizardFinish() { S.connView='list'; render() }

// ── Meta Embedded Signup (Cadastro Incorporado v4) ────────────────────────────
var __metaSdkPromise = null

function loadMetaSdk() {
  if (window.FB) return Promise.resolve()
  if (__metaSdkPromise) return __metaSdkPromise
  __metaSdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/en_US/sdk.js'
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous'
    s.onload = () => {
      let tries = 0
      const wait = setInterval(() => {
        if (window.FB) { clearInterval(wait); resolve() }
        else if (++tries > 100) { clearInterval(wait); reject(new Error('FB SDK timeout')) }
      }, 50)
    }
    s.onerror = () => { __metaSdkPromise = null; reject(new Error('Falha ao carregar SDK do Facebook')) }
    document.head.appendChild(s)
  })
  return __metaSdkPromise
}

var _MES = {
  state: 'idle', config: null, sessionId: null, preview: null, result: null,
  errorMsg: null, formName: '', formPin: '', metaResult: null, messageHandler: null
}


function _mesEsc(s) { return esc(s) }


function _mesRender() {
  const o = document.getElementById('mes-overlay')
  if (!o) return
  o.innerHTML = _mesHtml()
}


function _mesFail(msg) { _MES.state = 'error'; _MES.errorMsg = msg; _mesRender() }


function closeMetaSignup() {
  if (_MES.messageHandler) { window.removeEventListener('message', _MES.messageHandler); _MES.messageHandler = null }
  const o = document.getElementById('mes-overlay'); if (o) o.remove()
  _MES.state = 'idle'; _MES.metaResult = null
}


function openMetaSignup() {
  Object.assign(_MES, { state: 'loading', config: null, sessionId: null, preview: null,
                         result: null, errorMsg: null, formName: '', formPin: '', metaResult: null })
  let o = document.getElementById('mes-overlay')
  if (!o) {
    o = document.createElement('div')
    o.id = 'mes-overlay'
    o.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px'
    document.body.appendChild(o)
  }
  _mesRender()

  _MES.messageHandler = (e) => {
    if (!e.origin || !e.origin.endsWith('facebook.com')) return
    let data; try { data = JSON.parse(e.data) } catch { return }
    if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return
    console.log('[MES] postMessage', data)  // debug — remove se ficar barulhento
    const ev = String(data.event || '')
    // FINISH, FINISH_ONLY_WABA, FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING, FINISH_OBO_MIGRATION, FINISH_GRANT_ONLY_API_ACCESS
    if (ev.startsWith('FINISH')) {
      _MES.metaResult = data.data || {}
      _MES.metaEvent = ev
      console.log('[MES] FINISH variant captured:', ev, _MES.metaResult)
    } else if (ev === 'CANCEL') {
      // Ignora CANCEL se já recebemos FINISH (race condition Meta)
      if (_MES.metaResult) {
        console.log('[MES] ignoring CANCEL after FINISH (race)'); return
      }
      const step = (data.data && data.data.current_step) || ''
      _mesFail('Cadastro cancelado no flow Meta' + (step ? ' (' + step + ')' : '') + '.')
    } else if (ev === 'ERROR') {
      const m = (data.data && (data.data.error_message || data.data.error_code)) || 'Erro desconhecido'
      _mesFail('Erro Meta: ' + m)
    }
  }
  window.addEventListener('message', _MES.messageHandler)

  ;(async () => {
    try {
      _MES.config = await apiAdmin('/whatsapp-signup/config')
      await loadMetaSdk()
      window.FB.init({ appId: _MES.config.appId, autoLogAppEvents: true, xfbml: true, version: _MES.config.graphApiVersion })
      _MES.state = 'meta'; _mesRender()
      window.FB.login(_mesLoginCb, {
        config_id: _MES.config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {} }
      })
    } catch (err) {
      const msg = (err && err.message) || (err && err.error) || String(err)
      _mesFail(msg)
    }
  })()
}


function _mesLoginCb(response) {
  console.log('[MES] FB.login callback', response, 'metaResult:', _MES.metaResult)
  if (_MES.state === 'error') return  // já cancelou
  if (!response || !response.authResponse || !response.authResponse.code) {
    const errMsg = response && response.error_message ? response.error_message : (response && response.status ? 'status=' + response.status : 'sem código')
    _mesFail('FB.login não retornou código (' + errMsg + '). Você cancelou ou fechou o popup antes do final?'); return
  }
  const code = response.authResponse.code
  const meta = _MES.metaResult
  if (!meta || !meta.phone_number_id || !meta.waba_id) {
    _mesFail('Não recebi os IDs do número via postMessage Meta (tipo do evento: ' + (_MES.metaEvent || 'nenhum') + '). Verifique se App Domains do app Meta inclui lowan.site e se o flow chegou até a tela final.'); return
  }
  _MES.state = 'loading'; _MES.errorMsg = 'Validando token Meta…'; _mesRender()
  apiAdmin('/whatsapp-signup/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code, phoneNumberId: meta.phone_number_id, wabaId: meta.waba_id,
      businessId: meta.business_id || undefined
    })
  }).then((resp) => {
    _MES.sessionId = resp.sessionId; _MES.preview = resp.preview
    _MES.formName = resp.suggestedName || ''
    _MES.state = 'preview'; _mesRender()
  }).catch((err) => _mesFail((err && err.message) || String(err)))
}


function _mesConfirm() {
  const nameEl = document.getElementById('mes-name')
  const pinEl = document.getElementById('mes-pin')
  if (nameEl) _MES.formName = nameEl.value.trim()
  if (pinEl) _MES.formPin = pinEl.value.trim()
  if (!_MES.formName) { showToast('Dê um nome à conexão', 'error'); return }
  if (!/^\d{6}$/.test(_MES.formPin)) { showToast('PIN deve ter exatamente 6 dígitos', 'error'); return }
  _MES.state = 'finalizing'; _mesRender()
  apiAdmin('/whatsapp-signup/complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: _MES.sessionId, name: _MES.formName, pin: _MES.formPin })
  }).then((resp) => {
    _MES.result = resp; _MES.state = 'done'; _mesRender()
    fetchConnections().catch(()=>{}).finally(() => scheduleRender())
    setTimeout(closeMetaSignup, 3500)
  }).catch((err) => _mesFail((err && err.message) || String(err)))
}


function _mesHtml() {
  const card = (inner) => '<div style="background:#fff;border-radius:18px;padding:32px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:\'Plus Jakarta Sans\',sans-serif;max-height:90vh;overflow-y:auto">' + inner + '</div>'
  const spin = '<svg style="width:48px;height:48px;color:#1877f2" class="animate-spin" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>'

  if (_MES.state === 'loading' || _MES.state === 'meta') {
    const msg = _MES.state === 'meta' ? 'Aguardando popup da Meta…' : (_MES.errorMsg || 'Carregando configuração…')
    return card(
      '<div style="text-align:center">' + spin +
      '<h3 style="font-size:18px;font-weight:700;margin:16px 0 8px">' + _mesEsc(msg) + '</h3>' +
      '<p style="font-size:13px;color:#64748b">Não feche esta janela.</p>' +
      '<button onclick="closeMetaSignup()" style="margin-top:24px;padding:10px 24px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#475569;font-weight:600;cursor:pointer">Cancelar</button>' +
      '</div>'
    )
  }

  if (_MES.state === 'error') {
    return card(
      '<div style="text-align:center">' +
      '<div style="width:48px;height:48px;border-radius:50%;background:#fee2e2;color:#dc2626;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;margin-bottom:16px">!</div>' +
      '<h3 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#dc2626">Falha no cadastro</h3>' +
      '<p style="font-size:14px;color:#475569;margin:0 0 24px;line-height:1.5">' + _mesEsc(_MES.errorMsg || 'Erro desconhecido') + '</p>' +
      '<button onclick="closeMetaSignup()" style="padding:10px 24px;border:0;border-radius:8px;background:#1877f2;color:#fff;font-weight:600;cursor:pointer">Fechar</button>' +
      '</div>'
    )
  }

  if (_MES.state === 'preview') {
    const p = _MES.preview || {}
    const row = (label, val) => val ? '<div><b style="color:#475569">' + label + ':</b> ' + _mesEsc(val) + '</div>' : ''
    return card(
      '<div style="text-align:center;margin-bottom:24px">' +
      '<div style="width:48px;height:48px;border-radius:50%;background:#dcfce7;color:#16a34a;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:8px">✓</div>' +
      '<h3 style="font-size:20px;font-weight:700;margin:0 0 4px;color:#16a34a">Token recebido!</h3>' +
      '<p style="font-size:13px;color:#64748b;margin:0">Confira os dados e clique em "Criar Canal" para finalizar.</p>' +
      '</div>' +
      '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px;font-size:13px;line-height:1.7">' +
      row('WABA ID', p.wabaId) + row('Account Name', p.wabaName) +
      row('Phone Number ID', p.phoneNumberId) + row('Phone Number', p.displayPhoneNumber) +
      row('Verified Name', p.verifiedName) + row('Status', p.codeVerificationStatus) +
      row('Quality Rating', p.qualityRating) + row('Messaging Limit', p.messagingLimitTier) +
      '<div><b style="color:#475569">Business Token:</b> Obtained successfully</div>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
      '<label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Nome da conexão</label>' +
      '<input id="mes-name" value="' + _mesEsc(_MES.formName) + '" placeholder="Ex: Comercial Lowan" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box"/>' +
      '</div>' +
      '<div style="margin-bottom:24px">' +
      '<label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">PIN 2FA do número (6 dígitos)</label>' +
      '<input id="mes-pin" maxlength="6" inputmode="numeric" autocomplete="off" placeholder="123456" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;letter-spacing:6px;text-align:center;font-family:inherit;box-sizing:border-box"/>' +
      '<p style="font-size:11px;color:#94a3b8;margin:6px 0 0">Esse PIN é usado pra registrar o número na Cloud API e como 2FA em re-registros futuros.</p>' +
      '</div>' +
      '<div style="display:flex;gap:12px">' +
      '<button onclick="closeMetaSignup()" style="flex:1;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#475569;font-weight:600;cursor:pointer">Cancelar</button>' +
      '<button onclick="_mesConfirm()" style="flex:2;padding:12px;border:0;border-radius:10px;background:#1877f2;color:#fff;font-weight:700;cursor:pointer">Criar Canal</button>' +
      '</div>'
    )
  }

  if (_MES.state === 'finalizing') {
    return card(
      '<div style="text-align:center">' + spin +
      '<h3 style="font-size:18px;font-weight:700;margin:16px 0 8px">Criando canal…</h3>' +
      '<p style="font-size:13px;color:#64748b">Inscrevendo app na WABA + registrando número.</p>' +
      '</div>'
    )
  }

  if (_MES.state === 'done') {
    const r = _MES.result || {}
    const p = _MES.preview || {}
    const warning = r.registerWarning
    return card(
      '<div style="text-align:center;margin-bottom:20px">' +
      '<div style="width:56px;height:56px;border-radius:50%;background:#dcfce7;color:#16a34a;display:inline-flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:8px">✓</div>' +
      '<h3 style="font-size:22px;font-weight:700;margin:0 0 4px;color:#16a34a">Canal criado!</h3>' +
      '<p style="font-size:13px;color:#64748b;margin:0">Conexão criada com sucesso. Atualizando lista…</p>' +
      '</div>' +
      '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:13px;line-height:1.7">' +
      '<div><b style="color:#475569">WABA ID:</b> ' + _mesEsc(p.wabaId || '') + '</div>' +
      '<div><b style="color:#475569">Phone Number ID:</b> ' + _mesEsc(p.phoneNumberId || '') + '</div>' +
      (p.displayPhoneNumber ? '<div><b style="color:#475569">Phone Number:</b> ' + _mesEsc(p.displayPhoneNumber) + '</div>' : '') +
      '<div><b style="color:#475569">Business Token:</b> Obtained successfully</div>' +
      '<div><b style="color:#475569">Channel ID:</b> ' + _mesEsc(r.connectionId || '') + '</div>' +
      '<div><b style="color:#475569">Status:</b> ' + _mesEsc(r.status || '') + '</div>' +
      '</div>' +
      (warning ? '<div style="margin-top:16px;padding:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:12px;color:#92400e;line-height:1.5"><b>Aviso:</b> ' + _mesEsc(warning) + '<br/>Conexão criada como <b>PAUSED</b>. Resolva o problema acima e reative na lista.</div>' : '')
    )
  }
  return card('<p>…</p>')
}

// ── Render connections panel ──────────────────────────────────────────────────

function renderConnectionsPanel() {
  if (S.connView==='wizard') return renderConnWizard()
  if (S.connView==='templates') return renderConnTemplates()
  return renderConnList()
}


async function openConnTemplates(conn) {
  S.connTemplatesConn = conn
  S.connView = 'templates'
  S.connTemplatesList = []
  S.connTemplatesLoading = true
  render()
  try {
    S.connTemplatesList = await apiAdmin(`/connections/${conn.id}/templates`)
  } catch(e) { showToast(e.message,'error') }
  finally { S.connTemplatesLoading = false; scheduleRender() }
}


async function syncConnTemplates() {
  if (!S.connTemplatesConn) return
  S.connTemplatesLoading = true; render()
  try {
    const r = await apiAdmin(`/connections/${S.connTemplatesConn.id}/templates/sync`, { method:'POST', body:'{}' })
    showToast(`Sincronizado: ${r.created} novos, ${r.synced} atualizados`)
    S.connTemplatesList = await apiAdmin(`/connections/${S.connTemplatesConn.id}/templates`)
  } catch(e) { showToast(e.message,'error') }
  finally { S.connTemplatesLoading = false; scheduleRender() }
}


function renderConnTemplates() {
  const conn = S.connTemplatesConn
  const templates = S.connTemplatesList || []

  const STATUS_LABEL = { APPROVED:'Aprovado', PENDING:'Pendente', REJECTED:'Rejeitado', DISABLED:'Desativado' }
  const STATUS_PILL  = { APPROVED:'q-good',   PENDING:'q-mid',    REJECTED:'q-bad',   DISABLED:'status-inactive' }
  const STATUS_KLASS = { APPROVED:'approved', PENDING:'pending',  REJECTED:'rejected',DISABLED:'disabled' }
  const CAT_LABEL = { MARKETING:'Marketing', UTILITY:'Utilidade', AUTHENTICATION:'Autenticação' }
  const CAT_KLASS = { MARKETING:'cat-marketing', UTILITY:'cat-utility', AUTHENTICATION:'cat-auth' }

  // ─── Filter ───
  const activeFilter = S.connTplFilter || 'ALL'
  const counts = templates.reduce((acc, t) => {
    acc.total = (acc.total||0) + 1
    acc[t.status] = (acc[t.status]||0) + 1
    return acc
  }, {})
  const filtered = activeFilter === 'ALL' ? templates : templates.filter(t => t.status === activeFilter)

  // ─── Header ───
  const header = `
  <div class="cn-tpl-head">
    <button class="back-btn" onclick="S.connView='list';render()" title="Voltar">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
    </button>
    <div class="title-block">
      <h1>Templates ${conn?.name?`<span class="conn-name">${esc(conn.name)}</span>`:''}</h1>
      <p class="sub">aprovados pela Meta · ${templates.length} ${templates.length===1?'template':'templates'}</p>
    </div>
    <button class="cn-tpl-sync-btn" onclick="syncConnTemplates()" ${S.connTemplatesLoading?'disabled':''}>
      <svg class="${S.connTemplatesLoading?'animate-spin':''}" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
      ${S.connTemplatesLoading?'Sincronizando…':'Sincronizar da Meta'}
    </button>
  </div>`

  // ─── Loading ───
  if (S.connTemplatesLoading && templates.length === 0) {
    return `<div class="cn-tpl-page">${header}<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">Carregando templates...</div></div>`
  }

  // ─── Empty ───
  if (templates.length === 0) {
    return `<div class="cn-tpl-page">${header}
    <div class="cn-empty">
      <div class="cn-empty-icon" style="background:var(--accent-soft);color:var(--accent)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      </div>
      <h3>Nenhum template encontrado</h3>
      <p>Clique em "Sincronizar da Meta" para importar os templates aprovados.</p>
      <button class="cn-tpl-sync-btn" onclick="syncConnTemplates()">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        Sincronizar da Meta
      </button>
    </div></div>`
  }

  // ─── Stats ───
  const stats = `
  <section class="cn-tpl-stats">
    <div class="stat">
      <div class="label">Total</div>
      <div class="value">${counts.total||0}</div>
      <div class="sub">templates importados</div>
    </div>
    <div class="stat approved">
      <div class="label">Aprovados</div>
      <div class="value">${counts.APPROVED||0}</div>
      <div class="sub">prontos pra envio</div>
    </div>
    <div class="stat pending">
      <div class="label">Pendentes</div>
      <div class="value">${counts.PENDING||0}</div>
      <div class="sub">em análise pela Meta</div>
    </div>
    <div class="stat rejected">
      <div class="label">Rejeitados</div>
      <div class="value">${(counts.REJECTED||0) + (counts.DISABLED||0)}</div>
      <div class="sub">${counts.REJECTED||0} rej · ${counts.DISABLED||0} desativ</div>
    </div>
  </section>`

  // ─── Filters ───
  const filterDefs = [
    { id:'ALL',      label:'Todos',      count: counts.total||0 },
    { id:'APPROVED', label:'Aprovados',  count: counts.APPROVED||0 },
    { id:'PENDING',  label:'Pendentes',  count: counts.PENDING||0 },
    { id:'REJECTED', label:'Rejeitados', count: counts.REJECTED||0 },
    { id:'DISABLED', label:'Desativados', count: counts.DISABLED||0 },
  ]
  const filters = `
  <div class="cn-tpl-filters">
    ${filterDefs.map(f => `
      <button class="cn-tpl-filter ${activeFilter===f.id?'active':''}" onclick="S.connTplFilter='${f.id}';render()">
        ${f.label}
        <span class="count">${f.count}</span>
      </button>
    `).join('')}
  </div>`

  // ─── Cards ───
  const cards = filtered.length === 0
    ? `<div style="background:var(--surface);border:1px dashed var(--border-2);border-radius:14px;padding:40px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum template ${(STATUS_LABEL[activeFilter]||'').toLowerCase()} no momento</div>`
    : `<section class="cn-tpl-list">
      ${filtered.map(t => {
        const klass = STATUS_KLASS[t.status] || 'pending'
        const pill = STATUS_PILL[t.status] || 'q-mid'
        const stLabel = STATUS_LABEL[t.status] || t.status
        const cat = CAT_LABEL[t.category] || t.category || '—'
        const catK = CAT_KLASS[t.category] || 'cat-default'
        return `
        <article class="cn-tpl-card ${klass}">
          <div class="cn-tpl-name">
            ${esc(t.name)}
            <span class="cn-pill ${pill}">${stLabel}</span>
          </div>
          <div class="cn-tpl-meta">
            <span class="cat-pill ${catK}">${cat}</span>
            <span class="lang">${esc(t.language)}</span>
            ${t.variablesCount > 0 ? `<span class="vars">{${t.variablesCount}} ${t.variablesCount>1?'vars':'var'}</span>` : ''}
          </div>
          ${t.body ? `<div class="cn-tpl-body">${esc(t.body)}</div>` : ''}
        </article>`
      }).join('')}
    </section>`

  return `<div class="cn-tpl-page">${header}${stats}${filters}${cards}</div>`
}

// ─── Telegram MTProto (user/personal) ────────────────────────────────────────

async function fetchTelegramUserConnections() {
  try {
    const r = await api('/telegram-user/')
    S.telegramUserConnections = Array.isArray(r) ? r : []
  } catch(e) { showToast(e.message, 'error') }
  finally { scheduleRender() }
}


async function checkTelegramUser(id) {
  S.tgUserChecking = S.tgUserChecking || {}
  S.tgUserChecking[id] = true; render()
  try {
    const r = await api('/telegram-user/' + id + '/check', { method:'POST' })
    showToast('Conexão ' + (r.status||'verificada'))
    await fetchTelegramUserConnections()
  } catch(e) { showToast(e.message, 'error') }
  finally { delete S.tgUserChecking[id]; scheduleRender() }
}


async function pauseTelegramUser(id) {
  try { await api('/telegram-user/' + id + '/pause', { method:'POST' }); await fetchTelegramUserConnections() }
  catch(e) { showToast(e.message, 'error') }
}

async function resumeTelegramUser(id) {
  try { await api('/telegram-user/' + id + '/resume', { method:'POST' }); await fetchTelegramUserConnections() }
  catch(e) { showToast(e.message, 'error') }
}

async function deleteTelegramUser(id, name) {
  const ok = await lowanConfirm('Desconectar Telegram pessoal', `Tem certeza que quer desconectar "${name}"? A sessão será encerrada no Telegram do número.`, { danger:true })
  if (!ok) return
  try {
    await api('/telegram-user/' + id, { method:'DELETE' })
    S.telegramUserConnections = (S.telegramUserConnections||[]).filter(c => c.id !== id)
    showToast('Desconectado')
    scheduleRender()
  } catch(e) { showToast(e.message, 'error') }
}

// Modal de auth state machine: phone → code → twofa? → done
var _TGU_AUTH = {
  reset() { return { step:'phone', name:'', phone:'', sessionTempId:null, code:'', password:'', error:null, codeCountdown:0 } }
}


function openTgUserAuth() {
  S.telegramUserAuth = _TGU_AUTH.reset()
  _tguRender()
}

function closeTgUserAuth() {
  if (S.telegramUserAuth && S.telegramUserAuth.codeTimer) clearInterval(S.telegramUserAuth.codeTimer)
  S.telegramUserAuth = null
  const o = document.getElementById('tgu-auth-overlay'); if (o) o.remove()
}


function _tguRender() {
  let o = document.getElementById('tgu-auth-overlay')
  if (!o) {
    o = document.createElement('div')
    o.id = 'tgu-auth-overlay'
    o.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px'
    document.body.appendChild(o)
  }
  o.innerHTML = _tguHtml()
  // Auto-focus do input principal
  setTimeout(() => {
    const id = (S.telegramUserAuth?.step === 'code') ? 'tgu-code' : (S.telegramUserAuth?.step === 'twofa') ? 'tgu-password' : 'tgu-phone'
    const el = document.getElementById(id); if (el) el.focus()
  }, 30)
}


function _tguFail(msg) {
  if (!S.telegramUserAuth) return
  S.telegramUserAuth.error = msg
  S.telegramUserAuth.busy = false
  _tguRender()
}


async function _tguStart() {
  const a = S.telegramUserAuth; if (!a) return
  a.name = (document.getElementById('tgu-name')?.value || '').trim()
  a.phone = (document.getElementById('tgu-phone')?.value || '').trim()
  if (!a.name) { _tguFail('Dê um nome à conexão'); return }
  if (!/^\+[1-9]\d{8,14}$/.test(a.phone)) { _tguFail('Telefone em formato E.164 (ex: +5511999999999)'); return }
  a.busy = true; a.error = null; _tguRender()
  try {
    const r = await api('/telegram-user/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:a.name, phone:a.phone }) })
    a.sessionTempId = r.sessionTempId
    a.step = 'code'; a.busy = false; a.codeCountdown = 120
    a.codeTimer = setInterval(() => {
      if (!S.telegramUserAuth) return
      // Salva valor atual do input antes do tick pra não perder digitação
      const inp = document.getElementById('tgu-code')
      if (inp) S.telegramUserAuth.code = inp.value
      S.telegramUserAuth.codeCountdown--
      // Atualiza só o texto do countdown sem re-render (evita perder foco/valor do input)
      const cd = document.getElementById('tgu-countdown')
      if (cd) cd.textContent = S.telegramUserAuth.codeCountdown + 's'
      if (S.telegramUserAuth.codeCountdown <= 0) {
        clearInterval(S.telegramUserAuth.codeTimer)
        S.telegramUserAuth.codeTimer = null
        _tguRender()  // re-render só quando expira pra mostrar "expirado"
      }
    }, 1000)
    _tguRender()
  } catch(err) {
    _tguFail(err.message || 'Erro ao enviar código')
  }
}


async function _tguVerify(withPassword = false) {
  const a = S.telegramUserAuth; if (!a) return
  if (withPassword) {
    a.password = (document.getElementById('tgu-password')?.value || '').trim()
    if (!a.password) { _tguFail('Digite a senha de 2 etapas'); return }
  } else {
    a.code = (document.getElementById('tgu-code')?.value || '').trim()
    if (!/^\d{4,7}$/.test(a.code)) { _tguFail('Código deve ter 4-7 dígitos'); return }
  }
  a.busy = true; a.error = null; _tguRender()
  const body = { sessionTempId: a.sessionTempId, code: a.code }
  if (a.password) body.password = a.password
  try {
    const r = await api('/telegram-user/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    a.result = r
    a.step = 'done'; a.busy = false
    if (a.codeTimer) { clearInterval(a.codeTimer); a.codeTimer = null }
    _tguRender()
    fetchTelegramUserConnections().catch(()=>{})
    setTimeout(closeTgUserAuth, 3500)
  } catch(err) {
    if (err.message && /2FA|SESSION_PASSWORD_NEEDED|428/.test(err.message)) {
      a.step = 'twofa'; a.error = null; a.busy = false
      _tguRender()
      return
    }
    if (err.message && /expirou|EXPIRED|AUTH_NOT_STARTED/i.test(err.message)) {
      a.step = 'phone'; a.error = 'Código expirou. Recomece.'; a.busy = false; a.code = ''
      _tguRender()
      return
    }
    _tguFail(err.message || 'Código inválido')
  }
}


function _tguHtml() {
  const a = S.telegramUserAuth; if (!a) return ''
  const card = (inner) => '<div style="background:#fff;border-radius:18px;padding:28px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:\'Plus Jakarta Sans\',sans-serif;max-height:90vh;overflow-y:auto">' + inner + '</div>'
  const spin = '<svg style="width:36px;height:36px;color:#0ea5e9" class="animate-spin" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>'
  const errBlock = a.error ? `<div style="margin-top:12px;padding:10px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:12px;line-height:1.4">${esc(a.error)}</div>` : ''

  if (a.step === 'phone') {
    return card(
      '<div style="text-align:center;margin-bottom:18px">' +
      '<div style="width:48px;height:48px;border-radius:50%;background:#e0f2fe;color:#0284c7;display:inline-flex;align-items:center;justify-content:center;margin-bottom:8px">' +
      '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg></div>' +
      '<h3 style="font-size:18px;font-weight:700;margin:0 0 4px;color:#0c4a6e">Conectar Telegram pessoal</h3>' +
      '<p style="font-size:12.5px;color:#64748b;margin:0">Digite o número. O código chega no app Telegram desse número.</p>' +
      '</div>' +
      '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:11.5px;color:#78350f;line-height:1.45">' +
      '⚠ <b>Risco de banimento.</b> Use pra atendimento 1-a-1 e grupos. Para disparos em massa, use Bot (sem risco). Veja seu painel "Sessões ativas" no Telegram pra revogar a qualquer momento.</div>' +
      '<div style="margin-bottom:12px"><label style="display:block;font-size:11.5px;font-weight:600;color:#475569;margin-bottom:4px">Nome da conexão</label>' +
      '<input id="tgu-name" type="text" value="' + esc(a.name) + '" placeholder="Ex: Atendimento" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box"/></div>' +
      '<div style="margin-bottom:16px"><label style="display:block;font-size:11.5px;font-weight:600;color:#475569;margin-bottom:4px">Telefone (E.164)</label>' +
      '<input id="tgu-phone" type="tel" value="' + esc(a.phone) + '" placeholder="+5511999999999" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box;letter-spacing:1px"/>' +
      '<p style="font-size:10.5px;color:#94a3b8;margin:5px 0 0">Use formato internacional com + e código do país.</p></div>' +
      errBlock +
      '<div style="display:flex;gap:8px;margin-top:18px">' +
      '<button onclick="closeTgUserAuth()" style="flex:1;padding:11px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#475569;font-weight:600;cursor:pointer">Cancelar</button>' +
      '<button onclick="_tguStart()" ' + (a.busy?'disabled':'') + ' style="flex:2;padding:11px;border:0;border-radius:8px;background:#0ea5e9;color:#fff;font-weight:700;cursor:pointer;opacity:' + (a.busy?'.6':'1') + '">' + (a.busy?'Enviando…':'Enviar código') + '</button></div>'
    )
  }

  if (a.step === 'code') {
    const c = Math.max(0, a.codeCountdown||0)
    return card(
      '<div style="text-align:center;margin-bottom:18px">' + spin +
      '<h3 style="font-size:18px;font-weight:700;margin:12px 0 4px">Confira o app Telegram</h3>' +
      '<p style="font-size:12.5px;color:#64748b;margin:0">Enviamos um código pra <b>' + esc(a.phone) + '</b> via Telegram do próprio número. <br/>(<b>não</b> chega por SMS)</p>' +
      '</div>' +
      '<div style="margin-bottom:14px"><label style="display:block;font-size:11.5px;font-weight:600;color:#475569;margin-bottom:4px">Código de 5 dígitos ' + (c>0?`<span id="tgu-countdown" style="float:right;color:#0ea5e9">${c}s</span>`:'<span style="float:right;color:#dc2626">expirado</span>') + '</label>' +
      '<input id="tgu-code" type="tel" maxlength="7" inputmode="numeric" autocomplete="off" placeholder="12345" value="' + esc(a.code || '') + '" style="width:100%;padding:14px;border:1px solid #cbd5e1;border-radius:10px;font-size:24px;letter-spacing:14px;text-align:center;font-family:inherit;box-sizing:border-box;font-weight:700"/></div>' +
      errBlock +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button onclick="closeTgUserAuth()" style="flex:1;padding:11px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#475569;font-weight:600;cursor:pointer">Cancelar</button>' +
      '<button onclick="_tguVerify(false)" ' + (a.busy?'disabled':'') + ' style="flex:2;padding:11px;border:0;border-radius:8px;background:#0ea5e9;color:#fff;font-weight:700;cursor:pointer;opacity:' + (a.busy?'.6':'1') + '">' + (a.busy?'Verificando…':'Verificar') + '</button></div>'
    )
  }

  if (a.step === 'twofa') {
    return card(
      '<div style="text-align:center;margin-bottom:18px">' +
      '<div style="width:44px;height:44px;border-radius:50%;background:#fef3c7;color:#92400e;display:inline-flex;align-items:center;justify-content:center;margin-bottom:8px">' +
      '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg></div>' +
      '<h3 style="font-size:18px;font-weight:700;margin:0 0 4px;color:#78350f">Senha de 2 etapas</h3>' +
      '<p style="font-size:12.5px;color:#64748b;margin:0">Sua conta tem 2FA ativo. Digite a senha cloud que você criou no app Telegram.</p>' +
      '</div>' +
      '<div style="margin-bottom:14px"><label style="display:block;font-size:11.5px;font-weight:600;color:#475569;margin-bottom:4px">Senha 2FA</label>' +
      '<input id="tgu-password" type="password" autocomplete="off" placeholder="•••••" style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;font-family:inherit;box-sizing:border-box"/></div>' +
      errBlock +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button onclick="closeTgUserAuth()" style="flex:1;padding:11px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#475569;font-weight:600;cursor:pointer">Cancelar</button>' +
      '<button onclick="_tguVerify(true)" ' + (a.busy?'disabled':'') + ' style="flex:2;padding:11px;border:0;border-radius:8px;background:#0ea5e9;color:#fff;font-weight:700;cursor:pointer;opacity:' + (a.busy?'.6':'1') + '">' + (a.busy?'Conectando…':'Conectar') + '</button></div>'
    )
  }

  if (a.step === 'done') {
    const r = a.result || {}
    return card(
      '<div style="text-align:center">' +
      '<div style="width:56px;height:56px;border-radius:50%;background:#dcfce7;color:#16a34a;display:inline-flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:8px">✓</div>' +
      '<h3 style="font-size:20px;font-weight:700;margin:0 0 4px;color:#16a34a">Conectado!</h3>' +
      '<p style="font-size:13px;color:#64748b;margin:0 0 16px">' + (r.meUsername ? '@' + esc(r.meUsername) : esc(r.phone || a.phone)) + (r.meFirstName ? ' · ' + esc(r.meFirstName) : '') + '</p>' +
      '<p style="font-size:11.5px;color:#94a3b8">Atualizando lista…</p></div>'
    )
  }
  return card('<p>…</p>')
}


function renderTelegramPanel() {
  const bots = S.telegramBots || []
  const tgUserConns = S.telegramUserConnections || []
  const statusPill = (status) => {
    switch (status) {
      case 'ACTIVE':            return { cls:'status-active',   label:'Ativo' }
      case 'ERROR':             return { cls:'q-bad',           label:'Erro' }
      case 'PAUSED':            return { cls:'status-paused',   label:'Pausado' }
      case 'REAUTH_REQUIRED':   return { cls:'cn-pill-amber',   label:'Reauth necessário' }
      case 'DISCONNECTED':      return { cls:'q-bad',           label:'Desconectado' }
      default:                  return { cls:'status-inactive', label:'Inativo' }
    }
  }

  // ─── Form (when adding new bot) ───
  const formHtml = S.telegramForm ? `
  <div class="cn-form-card blue">
    <div>
      <p class="form-title">Novo bot Telegram</p>
      <p class="form-sub">Crie um bot via <a href="https://t.me/BotFather" target="_blank">@BotFather</a> e cole o token abaixo.</p>
    </div>
    <div class="cn-field">
      <label class="cn-field-label">Nome do Bot</label>
      <input type="text" class="cn-input" value="${esc(S.telegramForm.name||'')}" oninput="S.telegramForm.name=this.value" placeholder="Ex: Suporte Lowan"/>
    </div>
    <div class="cn-field">
      <label class="cn-field-label">Token do Bot<span class="req">obrigatório</span></label>
      <input type="text" class="cn-input mono" value="${esc(S.telegramForm.botToken||'')}" oninput="S.telegramForm.botToken=this.value" placeholder="1234567890:AAHxxxxx..." autocomplete="off" spellcheck="false"/>
    </div>
    ${S.telegramFormError ? `<p class="cn-form-err">${esc(S.telegramFormError)}</p>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="cn-btn-inline ghost" onclick="S.telegramForm=null;render()">Cancelar</button>
      <button class="cn-btn-inline blue" onclick="addTelegramBot()">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        Conectar Bot
      </button>
    </div>
  </div>` : ''

  // ─── Loading ───
  if (S.telegramLoading && !bots.length) {
    return `<div style="display:flex;flex-direction:column;gap:14px">${formHtml}<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">Carregando...</div></div>`
  }

  // ─── Empty ───
  const emptyHtml = `
  <div class="cn-empty">
    <div class="cn-empty-icon" style="background:var(--cn-tg-soft);color:var(--cn-tg)">${CN_TG_SVG}</div>
    <h3>Nenhum bot conectado</h3>
    <p>Adicione um bot do Telegram para receber e enviar mensagens pelo CRM.</p>
    ${isAdmin() ? `<button class="cn-btn-new" style="background:linear-gradient(135deg, var(--cn-tg) 0%, #0369a1 100%)" onclick="S.telegramForm={name:'',botToken:''};S.telegramFormError='';render()">
      <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
      Adicionar Bot
    </button>` : ''}
  </div>`

  // ─── Cards ───
  const botsHtml = bots.length === 0 ? emptyHtml : `
  <section class="cn-list">
    ${bots.map(b => {
      const sp = statusPill(b.status)
      const checking = !!(S.telegramChecking && S.telegramChecking[b.id])
      return `
      <article class="cn-card" style="--cn-q-color: var(--cn-tg)">
        <div class="cn-card-row">
          <div class="cn-card-icon cn-icon-blue">${CN_TG_SVG}</div>
          <div class="cn-info">
            <div class="cn-name-row">
              <h3 class="cn-name">${esc(b.name)}</h3>
              <span class="cn-pill ${sp.cls}">${sp.label}</span>
              <span class="cn-pill cn-pill-blue">Telegram</span>
            </div>
            ${b.botUsername || b.botId || b.webhookUrl ? `
            <div class="cn-ids">
              ${b.botUsername ? `<span class="id-label">USER</span><span class="id-val">@${esc(b.botUsername)}</span>` : ''}
              ${b.botUsername && b.botId ? `<span class="id-sep"></span>` : ''}
              ${b.botId ? `<span class="id-label">ID</span><span class="id-val">${esc(b.botId)}</span>` : ''}
              ${b.webhookUrl ? `<span class="id-sep"></span><span class="id-label">WEBHOOK</span><span class="id-val" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(b.webhookUrl)}">${esc(b.webhookUrl.replace(/^https?:\/\//,''))}</span>` : ''}
            </div>` : ''}
          </div>
          ${isAdmin() ? `
          <div class="cn-actions">
            <button class="cn-btn-inline ghost" onclick="checkTelegramBot('${b.id}')" ${checking?'disabled':''}>
              <svg class="${checking?'animate-spin':''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              ${checking?'Verificando…':'Verificar'}
            </button>
            <button class="cn-action danger" title="Remover bot" onclick="deleteTelegramBot('${b.id}')">
              <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>` : ''}
        </div>
      </article>`
    }).join('')}
  </section>`

  // ─── Cards de Telegram User (MTProto) ───
  const tgUserCards = tgUserConns.length === 0 ? '' : tgUserConns.map(c => {
    const sp = statusPill(c.status)
    const checking = !!(S.tgUserChecking && S.tgUserChecking[c.id])
    const initials = (c.meFirstName || c.meUsername || c.phone || '?').slice(0,2).toUpperCase()
    const hue = Math.abs((c.id||'').split('').reduce((a,x)=>a*31+x.charCodeAt(0),0)) % 360
    return `
      <article class="cn-card" style="--cn-q-color: var(--cn-tg)">
        <div class="cn-card-row">
          <div class="cn-card-icon" style="background:hsl(${hue},55%,88%);color:hsl(${hue},55%,30%);font-weight:700;font-size:14px;letter-spacing:.5px">${esc(initials)}</div>
          <div class="cn-info">
            <div class="cn-name-row">
              <h3 class="cn-name">${esc(c.name||'Telegram pessoal')}</h3>
              <span class="cn-pill ${sp.cls}">${sp.label}</span>
              <span class="cn-pill cn-pill-blue">Pessoal · MTProto</span>
            </div>
            <div class="cn-ids">
              ${c.meUsername ? `<span class="id-label">USER</span><span class="id-val">@${esc(c.meUsername)}</span><span class="id-sep"></span>` : ''}
              <span class="id-label">PHONE</span><span class="id-val">${esc(c.phone||'')}</span>
              ${c.lastSeenAt ? `<span class="id-sep"></span><span class="id-label">SEEN</span><span class="id-val">${new Date(c.lastSeenAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>` : ''}
            </div>
          </div>
          ${isAdmin() ? `
          <div class="cn-actions">
            <button class="cn-btn-inline ghost" onclick="checkTelegramUser('${c.id}')" ${checking?'disabled':''}>
              <svg class="${checking?'animate-spin':''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              ${checking?'Verificando…':'Verificar'}
            </button>
            ${c.status === 'PAUSED'
              ? `<button class="cn-btn-inline ghost" onclick="resumeTelegramUser('${c.id}')">Retomar</button>`
              : `<button class="cn-btn-inline ghost" onclick="pauseTelegramUser('${c.id}')">Pausar</button>`}
            <button class="cn-action danger" title="Desconectar" onclick="deleteTelegramUser('${c.id}', '${esc(c.name||'').replace(/'/g,'')}')">
              <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>` : ''}
        </div>
      </article>`
  }).join('')

  // ─── Section pessoal ───
  const personalSection = tgUserConns.length > 0 ? `
    <div style="margin-top:8px;display:flex;align-items:baseline;justify-content:space-between;gap:12px">
      <h3 style="font-family:'Bricolage Grotesque',serif;font-size:14px;font-weight:700;color:var(--text-primary);margin:0">
        Pessoal <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--text-muted);font-weight:600;margin-left:6px">${tgUserConns.length} ${tgUserConns.length===1?'conexão':'conexões'}</span>
      </h3>
      <span style="font-size:11px;color:var(--text-muted)">MTProto · número humano</span>
    </div>
    <section class="cn-list">${tgUserCards}</section>` : ''

  // ─── Banner de risco permanente ───
  const riskBanner = `
    <div style="padding:10px 14px;border-radius:10px;background:#fef3c7;border:1px solid #fcd34d;color:#78350f;font-size:11.5px;line-height:1.5;display:flex;align-items:flex-start;gap:10px">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
      <div>
        <b>Bot vs Pessoal:</b> Bot é oficial (sem risco, mas só recebe quando alguém fala com o bot). Pessoal usa MTProto (vê DMs/grupos do número, <b>mas pode ser banido se detectarem spam</b>). Para disparos em massa use <b>Bot</b>; para atendimento 1-a-1 use <b>Pessoal</b>.
      </div>
    </div>`

  // ─── Header: 2 botões (Bot + Pessoal) ───
  const ctaBtns = isAdmin() ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="cn-btn-new" style="background:linear-gradient(135deg, var(--cn-tg) 0%, #0369a1 100%)" onclick="S.telegramForm={name:'',botToken:''};S.telegramFormError='';render()">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Adicionar Bot
      </button>
      <button class="cn-btn-new" style="background:linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)" onclick="openTgUserAuth()">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        Conectar Telegram pessoal
      </button>
    </div>` : ''

  // ─── Section Bots header ───
  const botsSectionHeader = bots.length > 0 ? `
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
      <h3 style="font-family:'Bricolage Grotesque',serif;font-size:14px;font-weight:700;color:var(--text-primary);margin:0">
        Bots <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--text-muted);font-weight:600;margin-left:6px">${bots.length} ${bots.length===1?'bot':'bots'}</span>
      </h3>
      <span style="font-size:11px;color:var(--text-muted)">Oficial · via @BotFather</span>
    </div>` : ''

  return `<div style="display:flex;flex-direction:column;gap:14px">${riskBanner}${ctaBtns}${formHtml}${botsSectionHeader}${botsHtml}${personalSection}</div>`
}


function renderUnofficialPanel() {
  const sessions = S.unofficialSessions || []
  // Pill mapping for status: leverages existing cn-pill variants
  const statusPill = (status) => {
    switch (status) {
      case 'connected':    return { cls:'status-active',  label:'Conectado' }
      case 'connecting':   return { cls:'cn-pill-blue',   label:'Conectando…' }
      case 'qr_pending':   return { cls:'cn-pill-amber',  label:'Aguardando QR' }
      case 'reconnecting': return { cls:'cn-pill-amber',  label:'Reconectando' }
      case 'logged_out':   return { cls:'q-bad',          label:'Desconectado' }
      case 'error':        return { cls:'q-bad',          label:'Erro' }
      default:             return { cls:'status-inactive',label:'Inativo' }
    }
  }

  // Banner removido — info redundante (tab já indica WhatsApp Web)
  const banner = ''

  // ─── Loading ───
  if (S.unofficialLoading && sessions.length === 0) {
    return `<div style="display:flex;flex-direction:column;gap:14px">${banner}<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">Carregando...</div></div>`
  }

  // ─── Empty ───
  const emptyHtml = `
  <div class="cn-empty" style="--cn-wa-soft:#fef3c7;--cn-wa:#d97706">
    <div class="cn-empty-icon" style="background:#fef3c7;color:#d97706">${CN_WA_SVG}</div>
    <h3>Nenhuma conexão não oficial</h3>
    <p>Crie uma conexão para conectar via QR Code.</p>
  </div>`

  // ─── Session cards ───
  const cardsHtml = sessions.length === 0 ? emptyHtml : `
  <section class="cn-list">
    ${sessions.map(s => {
      const sp = statusPill(s.sessionStatus)
      const isConnected = s.sessionStatus === 'connected'
      const hasQr = !!s.qrDataUrl
      return `
      <article class="cn-card" style="--cn-q-color: #d97706">
        <div class="cn-card-row">
          <div class="cn-card-icon cn-icon-amber">${CN_WA_SVG}</div>
          <div class="cn-info">
            <div class="cn-name-row">
              <h3 class="cn-name">${esc(s.name)}</h3>
              <span class="cn-pill ${sp.cls}">${sp.label}</span>
              ${(() => {
                // Toggle anti-ban: default ATIVO. Mostra vermelho quando DESATIVADO.
                const ab = s.antibanEnabled !== false;
                const color = ab ? '#10b981' : '#dc2626';
                const bg = ab ? '#ecfdf5' : '#fef2f2';
                const border = ab ? '#a7f3d0' : '#fecaca';
                const label = ab ? 'Anti-ban ATIVO' : 'Anti-ban OFF';
                const sty = `display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;border:1px solid ${border};background:${bg};color:${color};font-size:11px;font-weight:700;font-family:inherit`;
                if (!canManageConns()) return `<span style="${sty}">🛡 ${label}</span>`;
                return `<button onclick="toggleUnofficialAntiban('${s.id}', ${!ab})" title="${ab ? 'Clique pra desligar' : 'Clique pra ligar'}" style="${sty};cursor:pointer">🛡 ${label}</button>`;
              })()}
            </div>
            ${s.phone_number ? `<div class="cn-ids"><span class="id-label">PHONE</span><span class="id-val">${esc(s.phone_number)}</span></div>` : ''}
            ${hasQr ? `
            <div class="cn-qr-card">
              <span class="qr-label">Escaneie com o WhatsApp do celular</span>
              <img src="${s.qrDataUrl}" alt="QR Code"/>
              <span class="qr-hint">aguardando conexão · atualiza automaticamente</span>
            </div>` : ''}
          </div>
          ${canManageConns() ? `
          <div class="cn-actions">
            ${!isConnected
              ? `<button class="cn-btn-inline amber" onclick="startUnofficialSession('${s.id}')">
                  <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  Conectar
                </button>`
              : `<button class="cn-btn-inline ghost" onclick="disconnectUnofficialSession('${s.id}')">Desconectar</button>`}
            <button class="cn-action danger" title="Remover" onclick="deleteUnofficialSession('${s.id}')">
              <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>` : ''}
        </div>
      </article>`
    }).join('')}
  </section>`

  // ─── New session form ───
  const newFormHtml = canManageConns() ? `
  <div class="cn-form-card amber">
    <div>
      <p class="form-title">Nova conexão não oficial</p>
      <p class="form-sub">Crie uma sessão e escaneie o QR Code com o WhatsApp do seu celular.</p>
    </div>
    <div class="cn-form-row">
      <input type="text" class="cn-input" placeholder="Nome da conexão (ex: Número contingência)"
        value="${esc(S.unofficialNewName||'')}"
        oninput="S.unofficialNewName=this.value"
        onkeydown="if(event.key==='Enter')createUnofficialSession()"/>
      <button class="cn-btn-inline amber" onclick="createUnofficialSession()">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Criar
      </button>
    </div>
    <details ${S.unoffProxyOpen?'open':''} style="margin-top:10px;padding:10px 12px;border:1px dashed var(--border);border-radius:8px;background:var(--surface-2)" ontoggle="S.unoffProxyOpen=this.open;if(this.open)loadProxyPool()">
      <summary style="cursor:pointer;font-size:12.5px;font-weight:600;color:var(--text-primary)">🛡 Proxy residencial (recomendado pra evitar banimento)</summary>
      <p style="font-size:11.5px;color:var(--text-muted);margin:8px 0 10px;line-height:1.5">Cada sessão sai por IP residencial próprio — reduz risco do WhatsApp banir por correlação com IP de servidor. Sem isso, todas as sessões saem pelo IP do VPS.</p>
      ${renderProxyDropdown(S.unofficialNewProxyUrl, "selectProxyForUnoff(this.value)")}
    </details>
  </div>` : ''

  // ─── uazapi panel (recomendado — substituirá Baileys legado) ──────────────
  const uazapiInstances = S.uazapiInstances || []
  const uazapiStatusPill = (status) => {
    switch (status) {
      case 'connected':    return { cls:'status-active',  label:'Conectado' }
      case 'connecting':   return { cls:'cn-pill-blue',   label:'Conectando…' }
      case 'qr_pending':   return { cls:'cn-pill-amber',  label:'Aguardando QR' }
      case 'disconnected': return { cls:'status-inactive',label:'Desconectado' }
      default:             return { cls:'status-inactive',label:status||'Inativo' }
    }
  }
  const uazapiBanner = `
  <div class="cn-channel-banner" style="background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%);border-color:#c7d2fe">
    <div class="icon" style="background:#4f46e5;color:#fff">
      <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    </div>
    <div class="body">
      <h4>WhatsApp Web (conexão pessoal)</h4>
      <p>Conta WhatsApp pessoal com proteção anti-banimento integrada. <b>Recomendado</b> pra atendimento em volume.</p>
    </div>
  </div>`
  const uazapiCards = uazapiInstances.length === 0 ? `
  <div class="cn-empty" style="--cn-wa-soft:#eef2ff;--cn-wa:#4f46e5">
    <div class="cn-empty-icon" style="background:#eef2ff;color:#4f46e5">${CN_WA_SVG}</div>
    <h3>Nenhuma conexão WhatsApp Web</h3>
    <p>Crie uma conexão e escaneie o QR Code com o WhatsApp do seu celular.</p>
  </div>` : `
  <section class="cn-list">
    ${uazapiInstances.map(i => {
      const sp = uazapiStatusPill(i.status)
      const isConnected = i.status === 'connected'
      const qr = (S.uazapiQrData && S.uazapiQrData[i.id]) || null
      const phone = i.phoneNumber || (i.jid ? String(i.jid).split('@')[0] : null)
      return `
      <article class="cn-card" style="--cn-q-color:#4f46e5">
        <div class="cn-card-row">
          <div class="cn-card-icon" style="background:#eef2ff;color:#4f46e5">${CN_WA_SVG}</div>
          <div class="cn-info">
            <div class="cn-name-row">
              <h3 class="cn-name">${esc(i.name)}</h3>
              <span class="cn-pill ${sp.cls}">${sp.label}</span>
              <span class="cn-pill" style="background:#eef2ff;color:#4f46e5;border-color:#c7d2fe">WhatsApp Web</span>
              ${i.antibanEnabled ? `<span class="cn-pill" style="background:#ecfdf5;color:#059669;border-color:#a7f3d0" title="Anti-ban ativado">🛡 Anti-ban</span>` : ''}
            </div>
            ${phone ? `
            <div class="cn-ids">
              <span class="id-label">PHONE</span><span class="id-val">${esc(phone)}</span>
            </div>` : ''}
            ${qr ? `
            <div class="cn-qr-card">
              <span class="qr-label">Escaneie com o WhatsApp do celular</span>
              <img id="uazapi-qr-${i.id}" src="${qr.qrDataUrl}" alt="QR Code"/>
              <span class="qr-hint">aguardando conexão · atualiza automaticamente</span>
            </div>` : ''}
          </div>
          ${isAdmin() ? `
          <div class="cn-actions">
            ${!isConnected
              ? `<button class="cn-btn-inline" style="background:#4f46e5;color:#fff" onclick="connectUazapiInstance('${i.id}')">
                  <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  Conectar
                </button>`
              : `<button class="cn-btn-inline ghost" onclick="disconnectUazapiInstance('${i.id}')">Desconectar</button>`}
            <button class="cn-action" title="${i.antibanEnabled?'Desativar':'Ativar'} anti-ban" onclick="toggleAntibanUazapi('${i.id}', ${!i.antibanEnabled})">
              <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </button>
            <button class="cn-action danger" title="Remover" onclick="deleteUazapiInstance('${i.id}')">
              <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>` : ''}
        </div>
      </article>`
    }).join('')}
  </section>`
  const uazapiNewForm = isAdmin() ? `
  <div class="cn-form-card" style="border-color:#c7d2fe;background:#fafbff">
    <div>
      <p class="form-title" style="color:#3730a3">Nova conexão WhatsApp Web</p>
      <p class="form-sub">Crie uma nova conexão. Depois clique em <b>Conectar</b> pra gerar o QR Code.</p>
    </div>
    <div class="cn-form-row">
      <input type="text" class="cn-input" placeholder="Nome da conexão (ex: Atendimento principal)"
        value="${esc(S.uazapiNewName||'')}"
        oninput="S.uazapiNewName=this.value"
        onkeydown="if(event.key==='Enter')createUazapiInstance()"/>
      <button class="cn-btn-inline" style="background:#4f46e5;color:#fff" onclick="createUazapiInstance()">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Criar instância
      </button>
    </div>
  </div>` : ''
  const uazapiPanel = `${uazapiBanner}${uazapiCards}${uazapiNewForm}`

  return `<div style="display:flex;flex-direction:column;gap:14px">${uazapiPanel}</div>`
}

// SVG icons reused inside Conexões
var CN_WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`
var CN_TG_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`
var CN_IG_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`
var CN_TT_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.52V6.75a4.85 4.85 0 01-1.02-.06z"/></svg>`


function renderConnList() {
  const ch = S.connChannel || 'whatsapp'
  const conns = S.connections || []
  const wsName = S.workspaceName || (S.user && S.user.workspaceName) || 'Workspace'

  const channels = [
    { id:'whatsapp',   label:'WhatsApp API',  klass:'tab-wa', icon: CN_WA_SVG, soon:false },
    { id:'unofficial', label:'WhatsApp Web',  klass:'tab-wa', icon: CN_WA_SVG, soon:false },
    { id:'telegram',   label:'Telegram',      klass:'tab-tg', icon: CN_TG_SVG, soon:false },
    { id:'instagram',  label:'Instagram',     klass:'',       icon: CN_IG_SVG, soon:true  },
    { id:'tiktok',     label:'TikTok',        klass:'',       icon: CN_TT_SVG, soon:true  },
  ]

  // ─── Top-right action button (varies by channel) ───
  let actionBtn = ''
  if (ch === 'whatsapp' && canManageConns()) {
    actionBtn = `<div style="display:flex;gap:8px;align-items:center">
      <button onclick="openMetaSignup()" class="cn-btn-new" style="background:#1877f2;color:#fff" title="Cadastro Incorporado oficial Meta">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Conectar via Meta
      </button>
      <button onclick="openConnWizard()" class="cn-btn-new" style="background:var(--surface);color:var(--text-primary);border:1px solid var(--border);box-shadow:none" title="Cadastro manual com token copia-e-cola">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Manual
      </button>
    </div>`
  } else if (ch === 'unofficial' && canManageConns()) {
    actionBtn = `<button onclick="fetchUnofficialSessions()" class="cn-btn-new" style="background:var(--surface);color:var(--text-primary);border:1px solid var(--border);box-shadow:none">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" class="${S.unofficialLoading?'animate-spin':''}"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
      Atualizar
    </button>`
  } else if (ch === 'telegram' && isAdmin()) {
    actionBtn = `<button onclick="S.telegramForm={name:'',botToken:''};S.telegramFormError='';render()" class="cn-btn-new">
      <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
      Adicionar Bot
    </button>`
  }

  // ─── Stats overview (whatsapp only with conns) ───
  let statsHtml = ''
  if (ch === 'whatsapp' && !S.connLoading && conns.length > 0) {
    const totalActive = conns.filter(c => c.status === 'ACTIVE').length
    const totalPaused = conns.filter(c => c.status === 'PAUSED').length
    const totalError = conns.filter(c => c.status === 'ERROR').length
    const alertCount = totalError + conns.filter(c => c.status === 'PAUSED' && /^AUTO:/.test(c.pausedReason||'')).length
    const goodCount = conns.filter(c => c.metaQualityRating === 'GREEN').length
    const badCount  = conns.filter(c => c.metaQualityRating === 'RED').length
    const totalSent = conns.reduce((s,c)=> s + (c.messagesSentToday || 0), 0)
    const totalLimit = conns.reduce((s,c)=> s + (c.metaQualityRating === 'RED' ? 20 : (c.rateLimitPerDay || 0)), 0)
    const usedPct = totalLimit > 0 ? Math.round((totalSent/totalLimit)*100) : 0
    const breakdown = conns.slice(0,3).map(c => {
      const cap = c.metaQualityRating === 'RED' ? 20 : (c.rateLimitPerDay || 0)
      const firstWord = (c.name || '').split(/\s+/)[0] || '—'
      return `<b>${cap.toLocaleString()}</b> ${esc(firstWord)}${c.metaQualityRating === 'RED' ? ' (Ruim)' : ''}`
    }).join(' · ')

    statsHtml = `
    <section class="cn-stats">
      <div class="cn-stat" ${alertCount > 0 ? 'style="border-left:3px solid #dc2626;padding-left:13px"' : ''}>
        <div class="label">${alertCount > 0 ? `<span style="color:#dc2626">⚠ ${alertCount} alerta${alertCount===1?'':'s'}</span>` : 'Total conexões'}</div>
        <div class="value" ${alertCount > 0 ? 'style="color:#dc2626"' : ''}>${alertCount > 0 ? alertCount : conns.length}</div>
        <div class="sub"><b>${totalActive}</b> ativas${totalPaused?` · <b>${totalPaused}</b> pausadas`:''}${totalError?` · <b style="color:#dc2626">${totalError}</b> erro`:''}</div>
      </div>
      <div class="cn-stat">
        <div class="label">Qualidade</div>
        <div class="value">${goodCount}<span class="small">/${conns.length} ótima</span></div>
        ${badCount > 0
          ? `<div class="sub danger"><b>${badCount} com qualidade Ruim</b> · ação necessária</div>`
          : `<div class="sub">todas saudáveis</div>`}
      </div>
      <div class="cn-stat">
        <div class="label">Mensagens hoje</div>
        <div class="value">${totalSent.toLocaleString()}</div>
        <div class="sub">de <b>${totalLimit.toLocaleString()}</b> disponíveis · ${usedPct}%</div>
      </div>
      <div class="cn-stat">
        <div class="label">Limite combinado</div>
        <div class="value">${totalLimit.toLocaleString()}</div>
        <div class="sub">${breakdown || '—'}</div>
      </div>
    </section>`
  }

  // ─── Empty state (whatsapp only) ───
  let emptyHtml = ''
  if (ch === 'whatsapp' && !S.connLoading && conns.length === 0) {
    emptyHtml = `
    <div class="cn-empty">
      <div class="cn-empty-icon">${CN_WA_SVG}</div>
      <h3>Nenhuma conexão cadastrada</h3>
      <p>Conecte seu número WhatsApp Business para enviar mensagens.</p>
      ${canManageConns() ? `<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button onclick="openMetaSignup()" class="cn-btn-new" style="background:#1877f2;color:#fff">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Conectar via Meta (recomendado)
        </button>
        <button onclick="openConnWizard()" class="cn-btn-new" style="background:var(--surface);color:var(--text-primary);border:1px solid var(--border);box-shadow:none">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Cadastro manual
        </button>
      </div>` : ''}
    </div>`
  }

  // ─── Cards ───
  let cardsHtml = ''
  if (ch === 'whatsapp' && !S.connLoading && conns.length > 0) {
    cardsHtml = `
    <div class="cn-sec-title">
      <h2><span class="ix">01 /</span> Canais ativos</h2>
      <span class="hint">Clique em uma conexão pra ver templates, saúde Meta e logs</span>
    </div>
    <section class="cn-list">
      ${conns.map(c => {
        const st = CONN_STATUS[c.status] || CONN_STATUS.INACTIVE
        const q  = c.metaQualityRating
        const isRed = q === 'RED'
        const cap = isRed ? 20 : (c.rateLimitPerDay || 0)
        const sent = c.messagesSentToday || 0
        const usedPct = cap > 0 ? Math.round((sent/cap)*100) : 0
        const qClass = q==='GREEN'?'q-good':q==='YELLOW'?'q-mid':q==='RED'?'q-bad':''
        const qColor = q==='GREEN'?'var(--cn-q-good)':q==='YELLOW'?'var(--cn-q-mid)':q==='RED'?'var(--cn-q-bad)':'var(--accent)'
        const qLabel = q==='GREEN'?'Ótima':q==='YELLOW'?'Regular':q==='RED'?'Ruim':null
        const statCls = c.status==='ACTIVE'?'status-active':c.status==='PAUSED'?'status-paused':'status-inactive'
        const cJson = JSON.stringify(c).replace(/"/g,'&quot;')
        // Banner inteligente — detecta tipo do problema e oferece ação contextual (deep-link Meta)
        const reason = c.pausedReason || ''
        const isErr = c.status === 'ERROR'
        const isPaused = c.status === 'PAUSED'
        const showBanner = (isErr || isPaused) && reason
        const isAutoPaused = /^AUTO:/.test(reason)
        const isPayment = /pagamento|payment/i.test(reason)
        const isBanned = /banida|banned/i.test(reason)
        const isRestricted = /restrit|verifica/i.test(reason)
        const isQualityFlagged = /qualidade|flagged|quality/i.test(reason)
        const wabaForLink = encodeURIComponent(c.wabaId || '')
        const _iconErr = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>'
        const _iconPause = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5"/></svg>'
        const _iconCard = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>'
        const _iconExt = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>'
        const _iconChart = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>'
        const _iconRefresh = '<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992V4.356m0 0L18.62 6.75A8.25 8.25 0 105.34 17.94l1.42-1.42M3.985 14.652h-4.992M3 19.644l2.395-2.395A8.25 8.25 0 0018.66 6.06l-1.42 1.42"/></svg>'
        const bannerHtml = showBanner ? `
          <div class="cn-alert ${isErr?'err':'warn'}">
            <div class="cn-alert-icon">${isErr ? _iconErr : _iconPause}</div>
            <div class="cn-alert-body">
              <div class="cn-alert-title">
                ${isErr?'Conexão bloqueada':'Conexão pausada'}
                ${isAutoPaused?'<span class="cn-alert-meta">automático</span>':''}
              </div>
              <div class="cn-alert-sub">${esc(reason.replace(/^AUTO:\s*/,''))}</div>
              <div class="cn-alert-actions">
                ${isPayment ? `<a class="cn-alert-btn primary" href="https://business.facebook.com/billing_hub/payment_settings?asset_id=${wabaForLink}" target="_blank" rel="noopener">${_iconCard} Adicionar pagamento</a>` : ''}
                ${(isBanned || isRestricted) ? `<a class="cn-alert-btn primary" href="https://business.facebook.com/wa/manage/phone-numbers?waba_id=${wabaForLink}" target="_blank" rel="noopener">${_iconExt} Abrir Meta Business</a>` : ''}
                ${isQualityFlagged ? `<a class="cn-alert-btn primary" href="https://business.facebook.com/wa/manage/insights?waba_id=${wabaForLink}" target="_blank" rel="noopener">${_iconChart} Insights de qualidade</a>` : ''}
                <button class="cn-alert-btn ghost" onclick="connCheck('${c.id}')">${_iconRefresh} Verificar agora</button>
                ${isAutoPaused && canManageConns() ? `<button class="cn-alert-btn ghost" onclick="connUpdateStatus('${c.id}','ACTIVE')">Forçar reativar</button>` : ''}
              </div>
            </div>
          </div>` : ''
        return `
        <article class="cn-card ${qClass}" style="--cn-q-color: ${qColor}">
          <div class="cn-card-row">
            <div class="cn-card-icon">${CN_WA_SVG}</div>
            <div class="cn-info">
              <div class="cn-name-row">
                <h3 class="cn-name">${esc(c.name)}</h3>
                <span class="cn-pill ${statCls}">${st.label}</span>
                ${qLabel ? `<span class="cn-pill ${qClass}">${qLabel}</span>` : ''}
                ${c.accountRestricted ? `<span class="cn-pill danger">⚠ Conta restrita pela Meta</span>` : ''}
              </div>
              <div class="cn-ids">
                <span class="id-label">PNI</span><span class="id-val">${esc(c.phoneNumberId)}</span>
                <span class="id-sep"></span>
                <span class="id-label">WABA</span><span class="id-val">${esc(c.wabaId)}</span>
                ${(c.businessName || c.businessId) ? `<span class="id-sep"></span><span class="id-label">BM</span><span class="id-val" title="${esc(c.businessId||'')}">${esc(c.businessName || c.businessId)}</span>` : ''}
              </div>
              <div class="cn-usage">
                <div class="cn-usage-meta">
                  <span class="cn-usage-label">
                    Uso hoje
                    ${isRed ? `<span class="warn-pill"><svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Limitado</span>` : ''}
                  </span>
                  <div class="cn-usage-bar"><div style="width:${Math.min(usedPct,100)}%"></div></div>
                </div>
                <div class="cn-usage-num">${sent.toLocaleString()}<span class="div">/</span><span class="total">${cap.toLocaleString()}</span></div>
              </div>
            </div>
            <div class="cn-actions">
              <button class="cn-action" title="Templates" onclick="openConnTemplates(${cJson})">
                <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </button>
              ${c.wabaId ? `<a class="cn-action" title="Abrir no Meta WhatsApp Manager" href="https://business.facebook.com/wa/manage/phone-numbers?waba_id=${encodeURIComponent(c.wabaId)}${c.phoneNumberId?`&phone_number=${encodeURIComponent(c.phoneNumberId)}`:''}" target="_blank" rel="noopener" style="text-decoration:none">${_iconExt}</a>` : ''}
              ${canManageConns() ? `<button class="cn-action" title="Editar" onclick="openConnWizard(${cJson})">
                <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>` : ''}
              <button class="cn-action" title="Detalhes" onclick="connOpenDetail('${c.id}')">
                <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>
              ${canManageConns() ? `<div style="position:relative">
                <button class="cn-action" title="Mais opções" onclick="connToggleMenu('${c.id}')">
                  <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/></svg>
                </button>
                <div id="cmenu-${c.id}" class="cn-menu hidden">
                  <button onclick="connCheck('${c.id}')">
                    <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Verificar conexão
                  </button>
                  <div class="sep"></div>
                  ${c.status!=='ACTIVE'?`<button onclick="connUpdateStatus('${c.id}','ACTIVE')">Ativar</button>`:''}
                  ${c.status!=='PAUSED'?`<button onclick="connUpdateStatus('${c.id}','PAUSED')">Pausar</button>`:''}
                  ${c.status!=='INACTIVE'?`<button onclick="connUpdateStatus('${c.id}','INACTIVE')">Desativar</button>`:''}
                  ${isAdmin() ? `<div class="sep"></div>
                  <button class="danger" onclick="S.connSelectedId='${c.id}';S.connModal='delete';render()">Remover</button>` : ''}
                </div>
              </div>` : ''}
            </div>
          </div>
          ${bannerHtml}
        </article>`
      }).join('')}
    </section>`
  }

  // ─── Other channels ───
  let otherHtml = ''
  if (ch === 'unofficial') otherHtml = renderUnofficialPanel()
  else if (ch === 'telegram') otherHtml = renderTelegramPanel()
  else if (ch === 'instagram' || ch === 'tiktok') {
    const cc = channels.find(x => x.id === ch)
    const accent = ch === 'instagram' ? 'background:rgba(236,72,153,0.10);color:#ec4899' : 'background:var(--surface-2);color:var(--text-muted)'
    otherHtml = `
      <div class="cn-empty">
        <div class="cn-empty-icon" style="${accent}">${cc.icon}</div>
        <h3>Integração ${cc.label} em breve</h3>
        <p>Estamos trabalhando para disponibilizar esta integração em breve.</p>
      </div>`
  }

  return `
  <div class="cn-page">
    <header class="cn-head">
      <div class="cn-head-left">
        <h1>Conexões<span class="dot">.</span></h1>
        <p class="lead">
          <span class="ws-pill">${esc(wsName)}</span>
          ${ch==='whatsapp' && conns.length>0 ? `
            <span class="sep"></span>
            <span><b>${conns.filter(c=>c.status==='ACTIVE').length}</b> canais ativos</span>
            <span class="sep"></span>
            <span><b>${conns.reduce((s,c)=>s+(c.messagesSentToday||0),0).toLocaleString()}</b> mensagens hoje</span>
          ` : ''}
        </p>
      </div>
      ${actionBtn}
    </header>

    <div class="cn-tabs">
      ${channels.map(c => {
        const active = ch === c.id
        const onclick = c.id === 'unofficial'
          ? `S.connChannel='unofficial';fetchUazapiInstances()`
          : c.soon ? '' : `S.connChannel='${c.id}';render()`
        return `<button class="cn-tab ${active?'active':''} ${c.klass||''} ${c.soon?'soon':''}" ${c.soon?'':`onclick="${onclick}"`}>
          ${c.icon}
          ${c.label}
          ${c.soon ? `<span class="soon-pill">Em breve</span>` : ''}
        </button>`
      }).join('')}
    </div>

    ${ch === 'whatsapp' && S.connLoading ? `<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">Carregando...</div>` : ''}
    ${statsHtml}
    ${emptyHtml}
    ${cardsHtml}
    ${otherHtml}

    ${renderConnModal()}
  </div>`
}

var TIER_LABELS = {
  TIER_250: '250/dia', TIER_1K: '1.000/dia', TIER_10K: '10.000/dia',
  TIER_100K: '100.000/dia', UNLIMITED: 'Ilimitado',
}

async function connCheck(id) {
  document.querySelectorAll('[id^="cmenu-"]').forEach(m=>m.classList.add('hidden'))
  showToast('Verificando conexão...', 'info')
  try {
    const r = await apiAdmin(`/connections/${id}/check`, { method:'POST' })
    const conn = S.connections.find(c=>c.id===id)
    if (r.status && conn) { conn.status = r.status }
    // Salva tier e qualityRating no objeto da conexão para exibição
    if (r.messagingLimit && conn) { conn._metaTier = r.messagingLimit }
    if (r.qualityRating && conn) { conn._metaQuality = r.qualityRating }
    // Se o modal de detalhe está aberto para esta conexão, atualiza também
    if (S.connModal === 'detail' && S.connDetail?.id === id) {
      if (r.messagingLimit) S.connDetail._metaTier = r.messagingLimit
      if (r.qualityRating)  S.connDetail._metaQuality = r.qualityRating
    }
    render()
    if (!r.valid) {
      showToast(`Token inválido: ${r.errorMessage || 'verifique o access token'}`, 'error')
    } else if (r.status === 'ACTIVE') {
      const tierLabel = TIER_LABELS[r.messagingLimit] || r.messagingLimit || '—'
      showToast(`✓ Conexão OK — Tier Meta: ${tierLabel}`)
    } else if (r.status === 'ERROR') {
      const reason = r.blockReason === 'PAYMENT_ISSUE' ? 'Pagamento pendente no WABA' : (r.banned ? 'WABA banida pela Meta' : 'Erro na conexão')
      showToast(reason, 'error')
    } else {
      showToast(`Status: ${r.status||'desconhecido'}`, 'error')
    }
  } catch(e) { showToast(e.message, 'error') }
}


function connToggleMenu(id) {
  const menu = document.getElementById('cmenu-'+id)
  if (!menu) return
  const isHidden = menu.classList.contains('hidden')
  // Fecha qualquer menu aberto (e remove z-index do card correspondente)
  document.querySelectorAll('[id^="cmenu-"]').forEach(m => {
    m.classList.add('hidden')
    const card = m.closest('.cn-card')
    if (card) card.classList.remove('cn-card-menu-open')
  })
  if (isHidden) {
    menu.classList.remove('hidden')
    const card = menu.closest('.cn-card')
    if (card) card.classList.add('cn-card-menu-open')
    const close = e => {
      if (!menu.contains(e.target)) {
        menu.classList.add('hidden')
        if (card) card.classList.remove('cn-card-menu-open')
        document.removeEventListener('click', close)
      }
    }
    setTimeout(() => document.addEventListener('click', close), 10)
  }
}


function renderConnModal() {
  if (!S.connModal) return ''
  let content = ''

  if (S.connModal==='delete') {
    const c = S.connections.find(x=>x.id===S.connSelectedId)
    content = `
      <div class="text-center">
        <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        </div>
        <h2 class="text-lg font-bold text-gray-900 mb-1">Remover conexão?</h2>
        <p class="text-sm text-gray-500 mb-5">Tem certeza que deseja remover <strong>${esc(c?.name)}</strong>?</p>
        <div class="flex gap-2">
          <button onclick="connCloseModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button onclick="connDelete()" class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Remover</button>
        </div>
      </div>`
  }

  if (S.connModal==='detail') {
    const c = S.connDetail; const h = S.connDetailHealth
    content = `
      <h2 class="text-lg font-bold text-gray-900 mb-4">${esc(c?.name||'Detalhes')}</h2>
      ${S.connDetailLoading ? `<div class="text-center py-8 text-gray-400 text-sm">Carregando...</div>` : `
      <div class="space-y-2 text-sm">
        ${[['Phone Number ID', c?.phoneNumberId],['WABA ID', c?.wabaId],['Verify Token', c?.webhookVerifyToken]].map(([l,v])=>v?`
          <div class="flex justify-between gap-3 py-1.5 border-b border-gray-50">
            <span class="text-gray-500 shrink-0">${l}</span>
            <span class="font-mono text-xs text-right text-gray-800 break-all">${esc(v)}</span>
          </div>`:''
        ).join('')}
        ${h?`<div class="grid grid-cols-2 gap-2 pt-2">
          ${(() => {
            const qualityRating = c?._metaQuality || h.qualityRating
            const tierRaw = c?._metaTier
            const tierLabel = tierRaw ? (TIER_LABELS[tierRaw] || tierRaw) : '—'
            const tierNote = tierRaw ? '' : 'Clique em Verificar'
            const usedToday = h.sentToday ?? 0
            // Quando qualidade RUIM (RED), limit efetivo = 20/dia (backend impoe)
            const _detailIsRed = qualityRating === 'RED'
            const limitDay = _detailIsRed ? 20 : (c?.rateLimitPerDay ?? 0)
            const usagePct = limitDay > 0 ? Math.round(usedToday / limitDay * 100) : 0
            const usageCls = usagePct >= 90 ? 'text-red-600' : usagePct >= 70 ? 'text-yellow-600' : 'text-gray-900'
            return [
              ['Health', `${h.healthScore??'—'}${h.healthScore!=null?'%':''}`, h.healthScore>=80?'text-green-600':h.healthScore>=50?'text-yellow-600':'text-red-600'],
              ['Quality', CONN_QUALITY[qualityRating]?.label||qualityRating||'—', CONN_QUALITY[qualityRating]?.cls||'text-gray-600'],
              ['Msgs hoje', `${usedToday.toLocaleString()} / ${limitDay.toLocaleString()}`, usageCls],
              ['Tier Meta', tierLabel, tierRaw ? 'text-indigo-700 font-bold' : 'text-gray-400 text-xs'],
            ].map(([l,v,cls])=>`<div class="bg-gray-50 rounded-xl p-3"><p class="text-xs text-gray-500 mb-0.5">${l}</p><p class="font-bold text-sm ${cls}">${v}${l==='Tier Meta'&&!tierRaw?`<br><span class="font-normal text-gray-400" style="font-size:10px">${tierNote}</span>`:''}</p></div>`).join('')
          })()}
        </div>
        ${h.metaHealth?.entities?.length ? `
        <div class="mt-3 pt-3 border-t border-gray-100">
          <p class="text-xs font-semibold text-gray-500 mb-2">STATUS META (health_status)</p>
          ${h.metaHealth.entities.map(e => {
            const sendCls = e.can_send_message==='AVAILABLE'?'text-green-600':e.can_send_message==='LIMITED'?'text-yellow-600':'text-red-600'
            const sendLabel = e.can_send_message==='AVAILABLE'?'Disponível':e.can_send_message==='LIMITED'?'Limitado':e.can_send_message==='BLOCKED'?'Bloqueado':(e.can_send_message||'—')
            const errors = e.errors||[]
            return `<div class="bg-gray-50 rounded-lg p-2.5 mb-2">
              <div class="flex justify-between items-center mb-1">
                <span class="text-xs font-medium text-gray-700">${esc(e.entity_type||'')}</span>
                <span class="text-xs font-bold ${sendCls}">${sendLabel}</span>
              </div>
              ${errors.map(er=>`<p class="text-xs text-red-600">⚠ ${esc(er.error_description||er.error_code||'Erro')}</p>`).join('')}
              ${e.additional_info?.length?e.additional_info.map(i=>`<p class="text-xs text-gray-500">${esc(i)}</p>`).join(''):''}
            </div>`
          }).join('')}
        </div>` : (h.metaHealth===null?`<p class="text-xs text-gray-400 mt-2 text-center">Clique em "Verificar conexão" para carregar o status Meta</p>`:'')}`:''}
      </div>`}
      <button onclick="connCloseModal()" class="mt-5 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Fechar</button>`
  }

  return `
    <div class="modal-backdrop" onclick="if(event.target===this)connCloseModal()">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
        <button onclick="connCloseModal()" class="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        ${content}
      </div>
    </div>`
}

// ── Wizard render ─────────────────────────────────────────────────────────────

function renderConnWizard() {
  const steps = ['Identificação','Credenciais','Limites','Webhook']
  const cur = S.wizardStep
  return `
  <div class="cn-wizard">
    <div class="cn-wizard-head">
      <div class="top">
        <button class="back-btn" onclick="S.connView='list';render()" title="Voltar para lista">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <h2>${S.wizardEditId?'Editar conexão':'Nova conexão WhatsApp'}</h2>
          <p class="step-info">Passo <b>${cur}</b> de 4 — ${steps[cur-1]}</p>
        </div>
      </div>
      <div class="cn-stepper">
        ${steps.map((label,i)=>{
          const idx = i+1
          const cls = idx < cur ? 'done' : idx === cur ? 'current' : ''
          return `<div class="cn-stepper-item ${cls}">
            <span class="cn-stepper-num">${idx<cur?'✓':idx}</span>
            <span class="cn-stepper-label">${label}</span>
          </div>`
        }).join('')}
      </div>
    </div>
    ${S.connFormError ? `
      <div class="cn-wizard-error">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span>${esc(S.connFormError)}</span>
      </div>` : ''}
    ${[renderWStep1,renderWStep2,renderWStep3,renderWStep4][cur-1]()}
  </div>`
}

// hint goes inline as `req`/`opt` tag; help renders below the input

function wField(label, hint, inputHtml, help='') {
  let tag = ''
  if (hint && /obrigat/i.test(hint)) tag = `<span class="req">obrigatório</span>`
  else if (hint && /opcional/i.test(hint)) tag = `<span class="opt">opcional</span>`
  else if (hint) tag = `<span class="opt">${esc(hint.replace(/[()]/g,'').trim())}</span>`
  return `<div class="cn-field">
    <label class="cn-field-label">${label}${tag}</label>
    ${inputHtml}
    ${help?`<p class="cn-field-help"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>${help}</span></p>`:''}
  </div>`
}

function wInput(val, fn, ph='', mono=false) {
  return `<input type="text" class="cn-input ${mono?'mono':''}" value="${esc(val||'')}" oninput="${fn}" placeholder="${esc(ph)}"/>`
}


function renderWStep1() {
  return `
  <div class="cn-wizard-card">
    <p class="intro">Informe os dados do número no painel da Meta. Você encontra esses IDs em <b>WhatsApp → API Setup</b>.</p>
    ${wField('Nome',  '(interno)',     wInput(S.connForm.name,          "S.connForm.name=this.value",          'Ex: Vendas Principal'),    'Nome para identificar a conexão no sistema.')}
    ${wField('Phone Number ID','(obrigatório)', wInput(S.connForm.phoneNumberId,"S.connForm.phoneNumberId=this.value",'123456789012345', true), '<b>Meta for Developers → Seu App → WhatsApp → API Setup → Phone Number ID</b>')}
    ${wField('WABA ID','(obrigatório)',          wInput(S.connForm.wabaId,        "S.connForm.wabaId=this.value",         '123456789012345', true), '<b>Meta for Developers → Seu App → WhatsApp → API Setup → WhatsApp Business Account ID</b>')}
    <div class="cn-info-box blue">
      <div class="title">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Como encontrar
      </div>
      <ol>
        <li>Acesse <code>developers.facebook.com</code> → Seu App → <b>WhatsApp → API Setup</b></li>
        <li>Os IDs aparecem em "Send and receive messages"</li>
      </ol>
    </div>
  </div>
  <div class="cn-wizard-foot">
    <span></span>
    <button class="cn-btn-next" onclick="wizardNext()">
      Próximo
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
    </button>
  </div>`
}


function renderWStep2() {
  const isEdit = !!S.wizardEditId
  return `
  <div class="cn-wizard-card">
    <p class="intro">Token permanente para autenticar chamadas à API da Meta. Use <b>System User</b>, nunca o token temporário de teste.</p>
    ${wField('Access Token', isEdit?'(deixe em branco para manter)':'(obrigatório)',
      `<textarea class="cn-textarea mono" rows="3" placeholder="EAAxxxxxxxxxx..." oninput="S.connForm.accessToken=this.value">${esc(S.connForm.accessToken||'')}</textarea>`,
      'Meta Business Suite → Configurações → Usuários do sistema → Gerar token')}
    ${wField('App Secret','(opcional)', wInput(S.connForm.appSecret,"S.connForm.appSecret=this.value",'xxxxxxxxxxxxxxxx',true), 'Valida assinatura dos webhooks. Meta for Developers → Configurações → Básico → App Secret')}
    <div class="cn-info-box amber">
      <div class="title">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Atenção — permissões obrigatórias
      </div>
      <p>No token, habilite: <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code></p>
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:10px"><b>🛡 Proxy residencial</b> (recomendado): cada conexão sai por IP próprio, reduzindo risco de banimento da Meta por correlação com outras WABAs do mesmo IP.</p>
      <label style="display:block;font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px">Selecionar IP do pool</label>
      ${renderProxyDropdown(S.connForm.proxyUrl, "selectProxyForConn(this.value)")}
    </div>
  </div>
  <div class="cn-wizard-foot">
    <button class="cn-btn-back" onclick="wizardBack()">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      Voltar
    </button>
    <button class="cn-btn-next" onclick="wizardNext()">
      Próximo
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
    </button>
  </div>`
}


function renderWStep3() {
  const tiers = [
    { t:'Tier 1', v:'1.000/dia' },
    { t:'Tier 2', v:'10.000/dia' },
    { t:'Tier 3', v:'100.000/dia' },
    { t:'Tier 4', v:'Ilimitado' },
  ]
  return `
  <div class="cn-wizard-card">
    <p class="intro">Configure os limites de acordo com o <b>tier</b> do número na Meta. Use a tabela abaixo como referência.</p>
    <div class="cn-grid-2">
      ${wField('Msgs por minuto','', `<input type="number" min="1" max="1000" class="cn-input mono" value="${S.connForm.rateLimitPerMinute||10}" oninput="S.connForm.rateLimitPerMinute=this.value"/>`,'')}
      ${wField('Msgs por dia','',    `<input type="number" min="1" max="100000" class="cn-input mono" value="${S.connForm.rateLimitPerDay||1000}" oninput="S.connForm.rateLimitPerDay=this.value"/>`,'')}
    </div>
    ${wField('Prioridade','(1–10)', `
      <div class="cn-priority-row">
        <input type="range" min="1" max="10" value="${S.connForm.priority||1}" oninput="S.connForm.priority=this.value;render()"/>
        <span class="cn-priority-num">${S.connForm.priority||1}</span>
      </div>`, 'Maior prioridade = preferido no balanceamento de carga')}
    <div>
      <label class="cn-field-label" style="margin-bottom:10px">Tiers Meta — referência</label>
      <div class="cn-tier-grid">
        ${tiers.map(t => `<div class="cn-tier"><div class="t">${t.t}</div><div class="v">${t.v}</div></div>`).join('')}
      </div>
    </div>
  </div>
  <div class="cn-wizard-foot">
    <button class="cn-btn-back" onclick="wizardBack()">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      Voltar
    </button>
    <button class="cn-btn-save" onclick="wizardSave()">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      Salvar
    </button>
  </div>`
}


function renderWStep4() {
  const conn = S.connections.find(c=>c.id===S.wizardEditId)||{}
  const webhookUrl = `${location.protocol}//${location.host}/webhooks/meta`
  const verifyToken = S.connForm.webhookVerifyToken || conn.webhookVerifyToken || ''
  return `
  <div class="cn-wizard-card" style="border-color:var(--cn-q-good-border);background:linear-gradient(135deg, var(--cn-q-good-bg) 0%, var(--surface) 60%)">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:42px;height:42px;border-radius:12px;background:var(--cn-q-good);color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <div>
        <h3 style="font-family:'Bricolage Grotesque',serif;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:var(--cn-q-good)">Conexão salva!</h3>
        <p style="font-size:12.5px;color:var(--text-secondary);margin-top:2px">Agora configure o webhook na Meta para receber mensagens.</p>
      </div>
    </div>
  </div>

  <div class="cn-wizard-card">
    <h3 style="font-family:'Bricolage Grotesque',serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary)">Configure o Webhook na Meta</h3>
    ${wCopyField('URL do Webhook', webhookUrl)}
    ${wCopyField('Verify Token', verifyToken)}
    <div class="cn-info-box blue">
      <div class="title">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
        Passo a passo
      </div>
      <ol>
        <li><b>Meta for Developers → Seu App → WhatsApp → Configuration</b></li>
        <li>Em Webhook, clique <b>Edit</b></li>
        <li>Cole a URL e o Verify Token acima</li>
        <li>Clique <b>Verify and Save</b></li>
        <li>Em Webhook fields, assine: <code>messages</code></li>
      </ol>
    </div>
  </div>

  <div class="cn-wizard-card">
    <div>
      <h3 style="font-family:'Bricolage Grotesque',serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary)">Verificar token</h3>
      <p style="font-size:12.5px;color:var(--text-muted);margin-top:4px">Testa se o token está válido e com as permissões corretas.</p>
    </div>
    ${S.wizardCheckResult ? `
      <div class="cn-info-box ${S.wizardChecked?'':'amber'}" style="${S.wizardChecked?'background:var(--cn-q-good-bg);border:1px solid var(--cn-q-good-border);color:#065f46':'background:var(--cn-q-bad-bg);border:1px solid var(--cn-q-bad-border);color:var(--cn-q-bad)'}">
        ${S.wizardChecked
          ? `✓ Token válido!${S.wizardCheckResult.displayPhoneNumber?' · '+esc(S.wizardCheckResult.displayPhoneNumber):''}`
          : esc(S.wizardCheckResult.error||'Token inválido')}
      </div>` : ''}
    <button onclick="wizardCheckToken()" ${S.wizardCheckLoading?'disabled':''} style="width:100%;padding:11px;border:1.5px solid var(--cn-q-good);background:transparent;color:var(--cn-q-good);border-radius:11px;font-family:inherit;font-size:13px;font-weight:600;cursor:${S.wizardCheckLoading?'wait':'pointer'};opacity:${S.wizardCheckLoading?'0.6':'1'};transition:all 0.14s">
      ${S.wizardCheckLoading?'Verificando...':'Verificar agora'}
    </button>
  </div>

  <div class="cn-wizard-foot">
    <button class="cn-btn-back" onclick="wizardBack()">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      Editar
    </button>
    <button class="cn-btn-save" onclick="wizardFinish()">
      Concluir
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
    </button>
  </div>`
}


function wCopyField(label, value) {
  return `<div class="cn-field">
    <label class="cn-field-label">${label}</label>
    <div style="display:flex;gap:8px;align-items:center">
      <input readonly class="cn-input mono" style="background:var(--surface-2);flex:1" value="${esc(value)}"/>
      <button onclick="wCopy('${esc(value)}')" style="padding:11px 16px;border:1px solid var(--border);background:var(--surface);border-radius:11px;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--text-secondary);cursor:pointer;flex-shrink:0;transition:all 0.14s" onmouseover="this.style.background='var(--surface-2)';this.style.color='var(--text-primary)'" onmouseout="this.style.background='var(--surface)';this.style.color='var(--text-secondary)'">Copiar</button>
    </div>
  </div>`
}

function wCopy(text) {
  navigator.clipboard.writeText(text).catch(()=>{
    const el=document.createElement('textarea'); el.value=text; el.style.position='fixed'; el.style.opacity='0'
    document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
  })
  showToast('Copiado!')
}

// ─── Configurações ───────────────────────────────────────────────────────────

// ─── Blacklist (Configurações > Blacklist) ───────────────────────────────────

function openDuplicateTemplateModal(templateId) {
  const t = (S.metaTemplates || []).find(x => x.id === templateId)
  if (!t) { showToast('Template não encontrado', 'error'); return }
  S.duplicateTemplate = {
    source: t,
    selectedConnIds: [],
    saving: false,
  }
  renderDuplicateTemplateModal()
}


function closeDuplicateTemplateModal() {
  S.duplicateTemplate = null
  document.getElementById('dup-tpl-modal-root')?.remove()
}


function renderDuplicateTemplateModal() {
  const d = S.duplicateTemplate
  if (!d) return
  const src = d.source
  const allConns = (S.connections || []).filter(c => c.status === 'ACTIVE' && c.id !== src.connectionId)
  const bodyPreview = (src.body || '').slice(0, 140) + ((src.body || '').length > 140 ? '…' : '')
  const html = `
    <div class="utm-modal-bd" onclick="if(event.target===this)closeDuplicateTemplateModal()">
      <div class="utm-modal" style="max-width:520px">
        <div class="utm-modal-head">
          <h3 class="utm-modal-title">📋 Duplicar template</h3>
          <button onclick="closeDuplicateTemplateModal()" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:var(--text-muted)">✕</button>
        </div>
        <div class="utm-modal-body">
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px 14px">
            <div style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:4px">Origem</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px">${esc(src.name)} <span style="color:var(--text-muted);font-weight:400">· ${esc(src.category || '—')} · ${esc(src.language || 'pt_BR')}</span></div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.4">${esc(bodyPreview)}</div>
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">Conexões alvo ${d.selectedConnIds.length > 0 ? `<span style="color:var(--accent);font-weight:700">· ${d.selectedConnIds.length} selecionada${d.selectedConnIds.length>1?'s':''}</span>` : ''}</label>
            ${allConns.length === 0
              ? `<p style="font-size:12.5px;color:var(--text-muted);font-style:italic;padding:8px 0">Nenhuma outra conexão ativa disponível.</p>`
              : allConns.map(c => {
                  const checked = d.selectedConnIds.includes(c.id)
                  return `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid ${checked?'var(--accent)':'var(--border)'};border-radius:8px;background:${checked?'var(--accent-soft)':'#fff'};cursor:pointer;margin-bottom:6px;transition:all .12s">
                    <input type="checkbox" ${checked?'checked':''} onchange="toggleDupTplConn('${c.id}')" style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent);flex-shrink:0"/>
                    <span style="font-size:13px;font-weight:500;color:var(--text-primary);flex:1">${esc(c.name)}</span>
                    <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--text-muted)">${esc((c.phoneNumberId||'').slice(-6))}</span>
                  </label>`
                }).join('')}
          </div>
          <p style="font-size:11.5px;color:var(--text-muted);line-height:1.45;margin:4px 0 0">
            ⚠ Cada conexão envia o template para a Meta independentemente. Aprovação é por WABA — podem ter status diferentes. Templates com nome <code style="font-family:'JetBrains Mono',monospace;font-size:10.5px;background:var(--surface-2);padding:1px 5px;border-radius:4px">${esc(src.name)}</code> já existentes nessas conexões vão falhar.
          </p>
        </div>
        <div class="utm-modal-foot">
          <div></div>
          <div style="display:flex;gap:8px">
            <button onclick="closeDuplicateTemplateModal()" class="bc-btn bc-btn-secondary" ${d.saving?'disabled':''}>Cancelar</button>
            <button onclick="submitDuplicateTemplate()" class="bc-btn bc-btn-primary" ${d.saving||d.selectedConnIds.length===0?'disabled':''}>
              ${d.saving ? 'Duplicando…' : (d.selectedConnIds.length > 0 ? `Duplicar em ${d.selectedConnIds.length}` : 'Selecione conexões')}
            </button>
          </div>
        </div>
      </div>
    </div>`
  let root = document.getElementById('dup-tpl-modal-root')
  if (!root) { root = document.createElement('div'); root.id = 'dup-tpl-modal-root'; document.body.appendChild(root) }
  root.innerHTML = html
}


function openMetaAdsConnectModal() {
  const html = `
    <div class="ma-modal-bd" onclick="if(event.target===this)closeMetaAdsConnectModal()">
      <div class="ma-modal">
        <div class="ma-modal-head">
          <h3 class="ma-modal-title">🔗 Conectar Meta Ads</h3>
          <button onclick="closeMetaAdsConnectModal()" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:var(--text-muted)">✕</button>
        </div>
        <div class="ma-modal-body">
          <div class="ma-help-block">
            <strong>Como obter os dados:</strong>
            <ol>
              <li>Acesse <a href="https://business.facebook.com/settings" target="_blank">business.facebook.com/settings</a></li>
              <li>Em <strong>Usuários do sistema</strong>, crie um novo (ou use existente)</li>
              <li>Atribua o <strong>permissão de Anúncios</strong> à sua conta de anúncios</li>
              <li>Clique <strong>"Gerar novo token"</strong> e selecione <code>ads_read</code></li>
              <li>Copie o token (começa com <code>EAA...</code>)</li>
              <li>Pegue o <strong>Ad Account ID</strong> em Events Manager (formato <code>act_123456789</code>)</li>
            </ol>
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px">Access Token *</label>
            <input id="ma-input-token" type="password" class="form-input" placeholder="EAAB..." style="font-family:monospace;font-size:12.5px"/>
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px">Ad Account ID *</label>
            <input id="ma-input-account" type="text" class="form-input" placeholder="act_123456789" style="font-family:monospace;font-size:12.5px"/>
          </div>
        </div>
        <div class="ma-modal-foot">
          <button onclick="closeMetaAdsConnectModal()" class="bc-btn bc-btn-secondary">Cancelar</button>
          <button onclick="connectMetaAds()" class="bc-btn bc-btn-primary" id="ma-connect-btn">Conectar</button>
        </div>
      </div>
    </div>`
  let root = document.getElementById('ma-modal-root')
  if (!root) { root = document.createElement('div'); root.id = 'ma-modal-root'; document.body.appendChild(root) }
  root.innerHTML = html
  setTimeout(() => document.getElementById('ma-input-token')?.focus(), 50)
}


function closeMetaAdsConnectModal() {
  document.getElementById('ma-modal-root')?.remove()
}
