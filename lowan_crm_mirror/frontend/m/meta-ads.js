// meta-ads.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

function _patchMetaBody(value) {
  if (!S.metaTemplateForm) return
  S.metaTemplateForm = { ...S.metaTemplateForm, body: value }

  // Atualiza contador de caracteres
  const counter = document.getElementById('meta-body-count')
  if (counter) counter.textContent = value.length + '/1024 caracteres'

  // Detecta variáveis no corpo
  const vars = [...new Set([...(value.matchAll(/\{\{(\d+)\}\}/g))].map(m => parseInt(m[1])))].sort((a,b)=>a-b)

  // Atualiza preview inline
  const prev = document.getElementById('meta-body-preview')
  if (prev) {
    let p = value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    vars.forEach(i => {
      const ex = S.metaTemplateForm['varEx_'+i] || 'var'+i
      p = p.replace(new RegExp('\\{\\{'+i+'\\}\\}','g'),
        `<span style="background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:0 3px;font-size:11px">[${ex}]</span>`)
    })
    prev.innerHTML = p.replace(/\n/g,'<br>')
  }

  // Atualiza seção de exemplos de variáveis
  const varsEl = document.getElementById('meta-body-vars')
  if (varsEl) {
    if (vars.length === 0) {
      varsEl.style.display = 'none'
    } else {
      varsEl.style.display = ''
      const inp = 'height:36px;padding:0 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);background:var(--surface);outline:none;'
      varsEl.innerHTML = `<p style="font-size:12px;font-weight:700;color:var(--text-primary);margin:0 0 10px">Exemplos de variáveis <span style="font-weight:400;color:var(--text-muted)">(obrigatório para aprovação da Meta)</span></p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
          ${vars.map(i=>`<div>
            <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">{{${i}}}</label>
            <input type="text" value="${(S.metaTemplateForm['varEx_'+i]||'').replace(/"/g,'&quot;')}" placeholder="Exemplo para {{${i}}}"
              style="${inp}width:100%;box-sizing:border-box"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              oninput="S.metaTemplateForm={...S.metaTemplateForm,'varEx_${i}':this.value}"/>
          </div>`).join('')}
        </div>`
    }
  }
}

async function loadMetaAds() {
  try {
    if (!S.metaAdsRange.since) {
      const d = new Date(); d.setDate(d.getDate() - 30)
      S.metaAdsRange.since = ymd(d)
      S.metaAdsRange.until = ymd(new Date())
    }
    const [accs, dash] = await Promise.all([
      apiMetaAds('/accounts'),
      apiMetaAds('/dashboard?since=' + S.metaAdsRange.since + '&until=' + S.metaAdsRange.until).catch(() => null),
    ])
    S.metaAdsAccounts = Array.isArray(accs) ? accs : []
    S.metaAdsDashboard = dash || null
    S.metaAdsLoaded = true
    render()
  } catch(e) {
    showToast(e?.message || 'Erro ao carregar Meta Ads', 'error')
    S.metaAdsLoaded = true
    render()
  }
}

function renderMetaAdsPanel() {
  if (!isAdmin()) {
    return `<div class="ma-page"><div class="ma-empty"><div class="ma-empty-emoji">🔒</div><div class="ma-empty-title">Acesso restrito</div><div>Apenas administradores podem gerenciar Meta Ads.</div></div></div>`
  }
  if (!S.metaAdsLoaded) {
    return `<div class="ma-page"><div style="padding:60px;text-align:center;color:var(--text-muted)">Carregando…</div></div>`
  }

  const hasAccounts = S.metaAdsAccounts.length > 0

  if (!hasAccounts) {
    return `
    <div class="ma-page">
      <div class="ma-header">
        <div>
          <h1><span style="font-size:36px">📊</span> Tráfego Pago</h1>
          <div class="ma-header-sub">Conecte sua conta Meta Ads para acompanhar investimento, leads captados, CPL e ROI direto no CRM.</div>
        </div>
      </div>
      <div class="ma-empty" style="background:var(--surface);border:1px dashed var(--border);border-radius:12px">
        <div class="ma-empty-emoji">📊</div>
        <div class="ma-empty-title">Nenhuma conta conectada</div>
        <div style="font-size:13px;margin-bottom:18px">Conecte sua conta Meta Ads para começar a ver suas métricas.</div>
        <button onclick="openMetaAdsConnectModal()" class="bc-btn bc-btn-primary">🔗 Conectar Meta Ads</button>
      </div>
    </div>`
  }

  const accountsHtml = S.metaAdsAccounts.map(a => {
    const statusCls = a.lastSyncStatus || 'never'
    const statusLbl = a.lastSyncStatus === 'success' ? '✓ Sincronizada'
      : a.lastSyncStatus === 'failed' ? '✕ Falhou'
      : a.lastSyncStatus === 'running' ? '⏳ Sincronizando'
      : '— Nunca sincronizada'
    const lastSync = a.lastSyncAt ? new Date(a.lastSyncAt).toLocaleString('pt-BR') : '—'
    const isSyncing = S.metaAdsSyncing === a.id || a.lastSyncStatus === 'running'
    return `
      <div class="ma-account-card">
        <div class="ma-account-info">
          <div class="ma-account-name">${esc(a.accountName || '(sem nome)')}</div>
          <div class="ma-account-meta">${esc(a.adAccountId)} · ${esc(a.currency || 'BRL')} · última sync: ${lastSync}</div>
          ${a.lastSyncError ? `<div style="font-size:11px;color:#dc2626;margin-top:4px">⚠ ${esc(a.lastSyncError.slice(0,140))}</div>` : ''}
        </div>
        <span class="ma-account-status ${statusCls}">${statusLbl}</span>
        <button onclick="syncMetaAds('${esc(a.id)}')" class="bc-btn bc-btn-secondary" style="font-size:12px;padding:6px 12px" ${isSyncing?'disabled':''}>
          ${isSyncing?'⏳ Sincronizando…':'🔄 Sincronizar'}
        </button>
        <button onclick="disconnectMetaAds('${esc(a.id)}')" class="bc-btn bc-btn-ghost" style="font-size:12px;padding:6px 10px;color:#dc2626">✕</button>
      </div>`
  }).join('')

  // Dashboard (se há dados)
  const d = S.metaAdsDashboard
  const t = d?.totals || {}
  const noData = !d || (t.spend === 0 && t.impressions === 0 && t.clicks === 0)

  const statsHtml = noData
    ? `<div class="ma-empty" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:24px">
        <div class="ma-empty-emoji">📭</div>
        <div class="ma-empty-title">Nenhum dado ainda</div>
        <div style="font-size:13px">Clique em "Sincronizar" na conta acima pra puxar suas métricas.</div>
       </div>`
    : `
      <div class="ma-stats">
        <div class="ma-stat"><div class="ma-stat-label">Investimento</div><div class="ma-stat-num">${fmtBRL(t.spend)}</div><div class="ma-stat-sub">${d.range.since} → ${d.range.until}</div></div>
        <div class="ma-stat"><div class="ma-stat-label">Leads</div><div class="ma-stat-num">${fmtNum(t.metaLeads)}</div><div class="ma-stat-sub">${fmtNum(t.crmLeads)} no CRM (${t.matchRate?Math.round(t.matchRate)+'%':'—'})</div></div>
        <div class="ma-stat"><div class="ma-stat-label">CPL</div><div class="ma-stat-num">${fmtBRL(t.cpl)}</div><div class="ma-stat-sub">CRM ${fmtBRL(t.cplCrm)}</div></div>
        <div class="ma-stat"><div class="ma-stat-label">Impressões</div><div class="ma-stat-num">${fmtNum(t.impressions)}</div><div class="ma-stat-sub">CTR ${fmtPct(t.ctr)}</div></div>
        <div class="ma-stat"><div class="ma-stat-label">Cliques</div><div class="ma-stat-num">${fmtNum(t.clicks)}</div><div class="ma-stat-sub">CPM ${fmtBRL(t.cpm)}</div></div>
      </div>`

  // Tabela de campanhas
  const campaignsHtml = (d?.campaigns?.length > 0)
    ? `<div class="ma-table">
        <div class="ma-table-head">
          <div>Campanha</div>
          <div style="text-align:right">Investimento</div>
          <div style="text-align:right">Leads</div>
          <div style="text-align:right">CPL</div>
          <div style="text-align:right">Impr.</div>
          <div style="text-align:right">Cliques</div>
        </div>
        ${d.campaigns.map(c => `
          <div class="ma-row" title="${esc(c.metaCampaignId)}">
            <div class="ma-row-name">${esc(c.campaignName)}</div>
            <div class="ma-num" style="text-align:right">${fmtBRL(c.spend)}</div>
            <div style="text-align:right">
              <div class="ma-num">${fmtNum(c.metaLeads)}</div>
              <div style="font-size:10px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">${fmtNum(c.crmLeads)} CRM (${c.matchRate?Math.round(c.matchRate)+'%':'—'})</div>
            </div>
            <div style="text-align:right">
              <div class="ma-num">${fmtBRL(c.cpl)}</div>
              <div style="font-size:10px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">CRM ${fmtBRL(c.cplCrm)}</div>
            </div>
            <div class="ma-num" style="text-align:right">${fmtNum(c.impressions)}</div>
            <div class="ma-num" style="text-align:right">${fmtNum(c.clicks)}</div>
          </div>`).join('')}
       </div>`
    : ''

  return `
    <div class="ma-page">
      <div class="ma-header">
        <div>
          <h1><span style="font-size:36px">📊</span> Tráfego Pago</h1>
          <div class="ma-header-sub">Investimento, leads captados e CPL — reconciliação automática via UTM.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="date" class="form-input" value="${esc(S.metaAdsRange.since||'')}" onchange="S.metaAdsRange.since=this.value;loadMetaAds()" style="font-size:12.5px;padding:6px 10px"/>
          <span style="color:var(--text-muted)">→</span>
          <input type="date" class="form-input" value="${esc(S.metaAdsRange.until||'')}" onchange="S.metaAdsRange.until=this.value;loadMetaAds()" style="font-size:12.5px;padding:6px 10px"/>
          <button onclick="openMetaAdsConnectModal()" class="bc-btn bc-btn-secondary">+ Adicionar conta</button>
        </div>
      </div>

      <div style="margin-bottom:24px">${accountsHtml}</div>

      ${statsHtml}

      ${campaignsHtml}
    </div>`
}

async function syncMetaAds(accountId) {
  S.metaAdsSyncing = accountId
  render()
  try {
    const r = await apiMetaAds('/accounts/' + accountId + '/sync', { method: 'POST' })
    showToast(`Sincronizado: ${r.campaigns} campanhas, ${r.insights} dias de métricas`, 'success')
    await loadMetaAds()
  } catch(e) {
    showToast(e?.message || 'Falha na sincronização', 'error')
  } finally {
    S.metaAdsSyncing = null
  }
}

async function disconnectMetaAds(accountId) {
  if (!confirm('Desconectar esta conta Meta Ads? Os dados sincronizados serão removidos.')) return
  try {
    await apiMetaAds('/accounts/' + accountId, { method: 'DELETE' })
    showToast('Conta desconectada', 'success')
    await loadMetaAds()
  } catch(e) {
    showToast(e?.message || 'Erro ao desconectar', 'error')
  }
}

async function connectMetaAds() {
  const token = (document.getElementById('ma-input-token')?.value || '').trim()
  const accountId = (document.getElementById('ma-input-account')?.value || '').trim()
  if (!token) { showToast('Access token obrigatório', 'error'); return }
  if (!accountId) { showToast('Ad Account ID obrigatório', 'error'); return }

  const btn = document.getElementById('ma-connect-btn')
  if (btn) { btn.disabled = true; btn.textContent = 'Validando…' }

  try {
    const acc = await apiMetaAds('/accounts', { method: 'POST', body: { accessToken: token, adAccountId: accountId } })
    showToast(`Conta conectada: ${acc.accountName}`, 'success')
    closeMetaAdsConnectModal()
    await loadMetaAds()
    // Sync automático na primeira conexão
    await syncMetaAds(acc.id)
  } catch(e) {
    showToast(e?.message || 'Falha ao conectar', 'error')
    if (btn) { btn.disabled = false; btn.textContent = 'Conectar' }
  }
}