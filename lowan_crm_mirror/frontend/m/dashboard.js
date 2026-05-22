// dashboard.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

function openCustomRange() {
  const today = new Date().toISOString().slice(0,10)
  const defaultFrom = S.dashboardCustomFrom || (() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10) })()
  const fromStr = prompt('Data inicial (AAAA-MM-DD):', defaultFrom)
  if (!fromStr) return
  const toStr = prompt('Data final (AAAA-MM-DD):', S.dashboardCustomTo || today)
  if (!toStr) return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    showToast('Datas inválidas. Use AAAA-MM-DD.', 'error'); return
  }
  if (fromStr > toStr) { showToast('Data inicial maior que a final.', 'error'); return }
  S.dashboardCustomFrom = fromStr
  S.dashboardCustomTo = toStr
  S.dashboardPeriod = 'custom'
  fetchDashboard().then(() => scheduleRender())
}

function dashboardPeriodRange() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const back = (days) => { const d = new Date(todayStart); d.setDate(d.getDate() - days + 1); return d }
  switch (S.dashboardPeriod) {
    case 'yesterday': {
      const yd = new Date(todayStart); yd.setDate(yd.getDate() - 1)
      const ydEnd = new Date(todayStart); ydEnd.setMilliseconds(-1)
      return { from: yd.toISOString(), to: ydEnd.toISOString() }
    }
    case '7d':   return { from: back(7).toISOString(),   to: now.toISOString() }
    case '30d':  return { from: back(30).toISOString(),  to: now.toISOString() }
    case '60d':  return { from: back(60).toISOString(),  to: now.toISOString() }
    case '90d':  return { from: back(90).toISOString(),  to: now.toISOString() }
    case '6m':   return { from: back(180).toISOString(), to: now.toISOString() }
    case '1y':   return { from: back(365).toISOString(), to: now.toISOString() }
    case 'all':  return { from: '2020-01-01T00:00:00.000Z', to: now.toISOString() }
    case 'custom': {
      const fromStr = S.dashboardCustomFrom || todayStart.toISOString().slice(0,10)
      const toStr   = S.dashboardCustomTo   || todayStart.toISOString().slice(0,10)
      const from = new Date(fromStr + 'T00:00:00')
      const to = new Date(toStr + 'T23:59:59')
      return { from: from.toISOString(), to: to.toISOString() }
    }
    default: // 'today'
      return { from: todayStart.toISOString(), to: now.toISOString() }
  }
}

async function fetchDashboard() {
  const { from, to } = dashboardPeriodRange()
  const _dashCacheKey = `dashboard_${S.dashboardPeriod}_${from}_${to}`
  const _dashCached = crmCache.get(_dashCacheKey, crmCache.TTL.dashboard)
  if (_dashCached) {
    S.dashboard = _dashCached.dashboard
    S.dashboardFinancial = _dashCached.financial ?? null
    S.dashboardMetaAds = _dashCached.metaAds ?? null
    S.dashboardLoading = false
    scheduleRender()
  } else {
    S.dashboardLoading = true
  }
  try {
    const endpoint = isAdmin() ? '/dashboard/admin' : '/dashboard/operator'
    S.dashboard = await api(`${endpoint}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)

    // Metas financeiras do mês corrente (venda, depósito, etc).
    // Goals são sempre mensais, então pedimos o período YYYY-MM atual.
    try {
      const period = new Date().toISOString().slice(0, 7)
      const [types, ranking, goals] = await Promise.all([
        apiFin('/types').catch(() => []),
        apiFin(`/ranking?period=${period}`).catch(() => []),
        apiFin(`/goals?period=${period}`).catch(() => []),
      ])
      S.dashboardFinancial = { types, ranking, goals, period }
    } catch {
      S.dashboardFinancial = null
    }
    // Meta Ads (tráfego pago) — opcional, falha silenciosamente se não houver conta conectada
    try {
      S.dashboardMetaAds = await apiMetaAds(`/dashboard?since=${encodeURIComponent(from)}&until=${encodeURIComponent(to)}`).catch(() => null)
    } catch { S.dashboardMetaAds = null }
    crmCache.set(_dashCacheKey, { dashboard: S.dashboard, financial: S.dashboardFinancial, metaAds: S.dashboardMetaAds })
  } catch { if (!_dashCached) S.dashboard = null }
  finally { S.dashboardLoading = false }
}

function renderDashboardPanel() {
  if (S.dashboardLoading || !S.dashboard) {
    return `<div style="display:flex;align-items:center;justify-content:center;height:200px;gap:10px;color:var(--text-muted);font-size:13px">
      <svg style="width:20px;height:20px;animation:spin 0.7s linear infinite" fill="none" viewBox="0 0 24 24">
        <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Carregando dashboard...
    </div>`
  }
  return isAdmin() ? renderAdminDashboard() : renderOperatorDashboard()
}

function kpi(icon, label, value, sub, iconBg, valueColor) {
  return `<div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:16px;display:flex;align-items:flex-start;gap:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
    <div style="width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;${iconBg}">${icon}</div>
    <div style="min-width:0">
      <p style="font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0">${label}</p>
      <p style="font-size:22px;font-weight:800;margin:3px 0 0;${valueColor?'color:'+valueColor:''}">${value}</p>
      ${sub ? `<p style="font-size:11px;color:var(--text-muted);margin:2px 0 0">${sub}</p>` : ''}
    </div>
  </div>`
}

function bar(value, max, color) {
  const pct = max > 0 ? Math.min(value/max*100,100) : 0
  const isClass = color.startsWith('bg-')
  return isClass
    ? `<div class="w-full bg-gray-100 rounded-full h-1.5"><div class="${color} h-1.5 rounded-full" style="width:${pct}%"></div></div>`
    : `<div style="width:100%;background:#e5e7eb;border-radius:99px;height:5px"><div style="background:${color};width:${pct}%;height:5px;border-radius:99px;transition:width 0.3s"></div></div>`
}

function renderAdminDashboard() {
  const d = S.dashboard
  const ov = d.overview, al = d.alerts, team = d.team, pl = d.pipeline, tl = d.timeline, ot = d.outreach || {}

  const statusCls = { disponivel:'bg-green-100 text-green-700', pego:'bg-blue-100 text-blue-700', em_andamento:'bg-orange-100 text-orange-700', perdido:'bg-red-100 text-red-700' }
  const connCls = s => s==='ACTIVE' ? 'bg-green-500' : 'bg-gray-300'

  const periodLabels = { today: 'Hoje', yesterday: 'Ontem', '7d': '7 dias', '30d': '30 dias', '60d': '60 dias', '90d': '90 dias', '6m': '6 meses', '1y': '1 ano', 'all': 'Tudo', 'custom': 'Personalizado' }
  const periodLabel = periodLabels[S.dashboardPeriod] || 'Hoje'

  return `<div style="display:flex;flex-direction:column;gap:20px">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <h1 style="font-size:20px;font-weight:800;color:var(--text-primary);margin:0">Dashboard</h1>
        <p style="font-size:12px;color:var(--text-muted);margin:3px 0 0">${S.workspaceName ? `<span style="font-weight:700;color:var(--accent)">${esc(S.workspaceName)}</span> · ` : ''}Visão geral · <span style="font-weight:600;color:var(--text-primary)">${esc(S.me?.name)}</span></p>
      </div>
      <div class="dash-period-bar">
        <div class="dash-period-pills">
          ${['today','yesterday','7d','30d','60d','90d','6m','1y','all'].map(p => `<button class="dash-period-btn${S.dashboardPeriod===p?' active':''}" onclick="S.dashboardPeriod='${p}';fetchDashboard().then(()=>scheduleRender())">${periodLabels[p]}</button>`).join('')}
          <button class="dash-period-btn dash-period-custom${S.dashboardPeriod==='custom'?' active':''}" onclick="openCustomRange()" title="Data personalizada">📅 ${S.dashboardPeriod==='custom' ? ((S.dashboardCustomFrom||'') + ' → ' + (S.dashboardCustomTo||'')) : 'Custom'}</button>
        </div>
        <button class="dash-refresh-btn" onclick="fetchDashboard().then(()=>scheduleRender())" title="Atualizar">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          <span class="lbl">Atualizar</span>
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="dash-stats">
      <div class="dash-stat">
        <div class="dash-stat-label">Total de Leads</div>
        <div class="dash-stat-num">${ov.total.toLocaleString('pt-BR')}</div>
        <div class="dash-stat-sub">base total do workspace</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">Leads Novos</div>
        <div class="dash-stat-num colored" style="--c:${(ov.newLeads||0) > 0 ? '#d97706' : 'var(--text-primary)'}">${(ov.newLeads||0).toLocaleString('pt-BR')}</div>
        <div class="dash-stat-sub">chegaram no período (${periodLabel})</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">Contatos Iniciados</div>
        <div class="dash-stat-num colored" style="--c:${ov.initiated > 0 ? '#059669' : 'var(--text-primary)'}">${ov.initiated.toLocaleString('pt-BR')}</div>
        <div class="dash-stat-sub">${ov.stageMoves} mudanças de etapa (${periodLabel})</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">Conversas Ativas</div>
        <div class="dash-stat-num colored" style="--c:${ov.activeConvs > 0 ? '#2563eb' : 'var(--text-primary)'}">${ov.activeConvs.toLocaleString('pt-BR')}</div>
        <div class="dash-stat-sub">mensagens no período (${periodLabel})</div>
      </div>
      ${(() => {
        const ma = S.dashboardMetaAds
        const fmtBRL = v => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})
        const fmtNum = v => v == null ? '—' : Number(v).toLocaleString('pt-BR')
        if (!ma || !ma.totals || (ma.totals.spend === 0 && ma.totals.impressions === 0)) {
          return `
            <div class="dash-stat" style="grid-column:span 3;text-align:center;justify-content:center">
              <div class="dash-stat-label">Tráfego Pago</div>
              <div class="dash-stat-num" style="font-size:18px;color:var(--text-muted)">—</div>
              <div class="dash-stat-sub"><a href="javascript:navigate('meta-ads')">conectar Meta Ads →</a></div>
            </div>`
        }
        const t = ma.totals
        return `
          <div class="dash-stat">
            <div class="dash-stat-label">Investimento</div>
            <div class="dash-stat-num colored smaller" style="--c:#4f46e5">${fmtBRL(t.spend)}</div>
            <div class="dash-stat-sub">Meta Ads (${periodLabel})</div>
          </div>
          <div class="dash-stat">
            <div class="dash-stat-label">Leads Gerados</div>
            <div class="dash-stat-num colored" style="--c:#9333ea">${fmtNum(t.metaLeads)}</div>
            <div class="dash-stat-sub">${fmtNum(t.crmLeads)} no CRM (${t.matchRate ? Math.round(t.matchRate) + '%' : '—'})</div>
          </div>
          <div class="dash-stat">
            <div class="dash-stat-label">CPL</div>
            <div class="dash-stat-num colored smaller" style="--c:#db2777">${fmtBRL(t.cpl)}</div>
            <div class="dash-stat-sub">CRM ${fmtBRL(t.cplCrm)}</div>
          </div>`
      })()}
    </div>

    <!-- Metas financeiras do mês (Venda, Depósito, etc) -->
    ${(() => {
      const fin = S.dashboardFinancial
      if (!fin || !fin.types) return ''
      const fmtMoneyLocal = v => 'R$ ' + parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
      const activeTypes = (fin.types || []).filter(t => t.active)
      if (activeTypes.length === 0) return ''

      // Aggregate realized + goal per type (soma todos operadores)
      const byType = {}
      for (const t of activeTypes) byType[t.name] = { realized: 0, goal: 0 }
      for (const r of fin.ranking || []) {
        if (byType[r.type_name]) byType[r.type_name].realized += parseFloat(r.total || 0)
      }
      for (const g of fin.goals || []) {
        if (byType[g.type_name]) byType[g.type_name].goal += parseFloat(g.goal_amount || 0)
      }
      const visible = Object.entries(byType).filter(([,v]) => v.goal > 0 || v.realized > 0)
      if (visible.length === 0) return ''

      const monthLabel = new Date(fin.period + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      const cols = Math.min(visible.length, 4)
      const typeColors = ['#059669','#4f46e5','#d97706','#dc2626','#7c3aed','#0891b2']
      const typeIcons = {
        'Venda':     '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>',
        'Depósito':  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>',
        'Deposito':  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>',
      }
      const defaultIcon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>'

      return `
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">
        ${visible.map(([name, v], i) => {
          const pct = v.goal > 0 ? Math.min(v.realized / v.goal * 100, 100) : 0
          const cardColor = typeColors[i % typeColors.length]
          const barColor = v.goal > 0
            ? (pct >= 100 ? '#10b981' : pct >= 50 ? cardColor : '#f59e0b')
            : cardColor
          const iconPath = typeIcons[name] || defaultIcon
          return `
            <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
              <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
                <span style="width:38px;height:38px;background:${cardColor}15;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <svg style="width:19px;height:19px;color:${cardColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconPath}</svg>
                </span>
                <div style="flex:1;min-width:0">
                  <p style="font-size:10.5px;color:var(--text-muted);font-weight:700;margin:0;text-transform:uppercase;letter-spacing:0.06em">Meta ${esc(name)}</p>
                  <p style="font-size:10px;color:#9ca3af;margin:2px 0 0;text-transform:capitalize">${monthLabel}</p>
                </div>
                ${v.goal > 0 ? `<span style="font-size:11px;font-weight:800;color:${barColor};background:${barColor}15;border-radius:6px;padding:3px 7px;flex-shrink:0">${pct.toFixed(0)}%</span>` : ''}
              </div>
              <p style="font-size:22px;font-weight:800;color:#111827;margin:0;letter-spacing:-0.03em">${fmtMoneyLocal(v.realized)}</p>
              <p style="font-size:11.5px;color:var(--text-muted);margin:3px 0 10px">${v.goal > 0 ? `de ${fmtMoneyLocal(v.goal)}` : 'sem meta definida'}</p>
              ${v.goal > 0 ? `
                <div style="height:6px;background:#f3f4f6;border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.4s"></div>
                </div>
              ` : ''}
            </div>
          `
        }).join('')}
      </div>
      `
    })()}

    <!-- Alertas -->
    ${al.pendingReplies > 0 || al.unassigned > 0 || al.stale > 0 ? `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${al.pendingReplies > 0 ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px">
        <span style="width:34px;height:34px;background:#fef3c7;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg style="width:15px;height:15px;color:#d97706" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
        </span>
        <div><p style="font-size:12px;color:#92400e;font-weight:700;margin:0">${al.pendingReplies} aguardando resposta</p>
          <p style="font-size:10.5px;color:#b45309;margin:2px 0 0">${al.totalUnread} msgs não lidas</p></div>
      </div>` : ''}
      ${al.unassigned > 0 ? `<div onclick="navigate('leads',{filterUser:'',filterStatus:'todos',filterStage:'todos'})" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px;cursor:pointer" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
        <span style="width:34px;height:34px;background:#dbeafe;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg style="width:15px;height:15px;color:#2563eb" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        </span>
        <div><p style="font-size:12px;color:#1d4ed8;font-weight:700;margin:0">${al.unassigned} sem atribuição</p>
          <p style="font-size:10.5px;color:#3b82f6;margin:2px 0 0">Leads aguardando operador</p></div>
      </div>` : ''}
      ${al.stale > 0 ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px">
        <span style="width:34px;height:34px;background:#ffedd5;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg style="width:15px;height:15px;color:#ea580c" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </span>
        <div><p style="font-size:12px;color:#9a3412;font-weight:700;margin:0">${al.stale} leads parados</p>
          <p style="font-size:10.5px;color:#c2410c;margin:2px 0 0">Sem atividade há +24h</p></div>
      </div>` : ''}
    </div>` : ''}

    <!-- Distribuição de status + Pipeline + Conexões -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
      <!-- Distribuição por Etapas -->
      <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0">Distribuição por Etapas</h2>
          <span style="font-size:10px;color:var(--text-muted);background:#f3f4f6;border-radius:99px;padding:2px 8px;font-weight:500">Estado atual</span>
        </div>
        ${pl.stages.length === 0 ? `<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:24px 0">Nenhuma etapa configurada</p>` : (() => {
          const totalInStages = pl.stages.reduce((acc, s) => acc + (s.count || 0), 0)
          const rows = [...pl.stages]
          if (pl.withoutStage > 0) rows.push({ id: null, name: 'Sem Etapa', color: '#94a3b8', count: pl.withoutStage })
          const grandTotal = totalInStages + (pl.withoutStage || 0)
          return `<div style="display:flex;flex-direction:column;gap:10px">
            ${rows.map(s => `
            <div>
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${esc(s.color||'#94a3b8')}"></span>
                <span style="font-size:12px;color:#374151;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
                <span style="font-weight:700;color:var(--text-primary);font-size:12px">${s.count} <span style="color:var(--text-muted);font-weight:400;font-size:11px">${grandTotal > 0 ? '('+Math.round((s.count||0)/grandTotal*100)+'%)' : ''}</span></span>
              </div>
              ${bar(s.count || 0, grandTotal, s.color || '#94a3b8')}
            </div>`).join('')}
          </div>
          <p style="font-size:10px;color:var(--text-muted);margin:14px 0 0;padding-top:12px;border-top:1px solid var(--border)">${grandTotal} leads no total</p>`
        })()}
      </div>

      <!-- Pipeline movimentações -->
      <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0">Pipeline</h2>
          <span style="font-size:10px;color:var(--accent);background:rgba(99,102,241,0.08);border-radius:99px;padding:2px 8px;font-weight:600">${periodLabel}</span>
        </div>
        ${pl.stages.length === 0 ? `<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:24px 0">Nenhum stage configurado</p>` : (() => {
          const totalInitiated = pl.initiatedTotal ?? pl.stages.reduce((acc, s) => acc + (s.initiatedInPeriod || 0), 0)
          if (totalInitiated === 0) return `<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:24px 0">Nenhum contato iniciado no período</p>`
          return `<div style="display:flex;flex-direction:column;gap:10px">
            ${pl.stages.filter(s => (s.initiatedInPeriod || 0) > 0).map(s=>`
            <div>
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${esc(s.color)}"></span>
                <span style="font-size:12px;color:#374151;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
                <span style="font-size:12px;font-weight:700;color:var(--text-primary)">${s.initiatedInPeriod}</span>
                <span style="font-size:10px;color:var(--text-muted)">${totalInitiated > 0 ? Math.round((s.initiatedInPeriod||0)/totalInitiated*100)+'%' : ''}</span>
              </div>
              ${bar(s.initiatedInPeriod || 0, totalInitiated, s.color||'#6366f1')}
            </div>`).join('')}
          </div>
          <p style="font-size:10px;color:var(--text-muted);margin:14px 0 0;padding-top:12px;border-top:1px solid var(--border)">${totalInitiated} contatos iniciados no período</p>`
        })()}
      </div>

      <!-- Conexões -->
      <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
        <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0 0 16px">Conexões WhatsApp</h2>
        ${d.connections.length === 0 ? `<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:24px 0">Nenhuma conexão</p>` : `
        <div style="display:flex;flex-direction:column;gap:2px">
          ${d.connections.map(c=>`
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${c.status==='ACTIVE'?'#22c55e':'#d1d5db'}"></span>
            <span style="font-size:12.5px;color:var(--text-primary);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500">${esc(c.name)}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:99px;font-weight:600;${c.status==='ACTIVE'?'background:#dcfce7;color:#166534':'background:#f3f4f6;color:#6b7280'}">${c.status==='ACTIVE'?'Online':'Offline'}</span>
          </div>`).join('')}
        </div>`}
      </div>
    </div>

    <!-- Performance de Disparo -->
    ${(() => {
      const sent      = ot.sent      ?? 0
      const delivered = ot.delivered ?? 0
      const read      = ot.read      ?? 0
      const responded = ot.responded ?? 0
      const engaged   = ot.engaged   ?? 0
      const avgMin    = ot.avgResponseMin

      const pct = (n, total) => total > 0 ? Math.round(n / total * 100) : 0
      const fmtTime = m => {
        if (m == null) return '–'
        if (m < 60) return m + 'min'
        const h = Math.floor(m / 60), r = m % 60
        return h + 'h' + (r > 0 ? r + 'm' : '')
      }

      const steps = [
        { label: 'Enviados',    value: sent,      pctOf: null,  color: '#6366f1', bg: '#eef2ff' },
        { label: 'Entregues',   value: delivered, pctOf: sent,  color: '#3b82f6', bg: '#eff6ff' },
        { label: 'Lidos',       value: read,      pctOf: sent,  color: '#06b6d4', bg: '#ecfeff' },
        { label: 'Responderam', value: responded, pctOf: sent,  color: '#10b981', bg: '#ecfdf5' },
        { label: 'Engajaram',   value: engaged,   pctOf: sent,  color: '#f59e0b', bg: '#fffbeb' },
      ]

      if (sent === 0) return `
        <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
          <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0 0 4px">Performance de Disparo</h2>
          <p style="font-size:12px;color:var(--text-muted);margin:0">Nenhuma primeira abordagem registrada no período.</p>
        </div>`

      return `
        <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
            <div>
              <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0">Performance de Disparo</h2>
              <p style="font-size:11px;color:var(--text-muted);margin:2px 0 0">Primeira abordagem por operador · ${esc(periodLabel)}</p>
            </div>
            ${avgMin != null ? `<div style="display:flex;align-items:center;gap:6px;background:#f9fafb;border:1px solid var(--border);border-radius:8px;padding:6px 12px">
              <svg width="14" height="14" fill="none" stroke="#6b7280" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span style="font-size:12px;color:var(--text-muted)">Tempo médio de resposta:</span>
              <span style="font-size:13px;font-weight:700;color:var(--text-primary)">${fmtTime(avgMin)}</span>
            </div>` : ''}
          </div>

          <!-- Funil -->
          <div style="display:flex;align-items:stretch;gap:0;overflow:hidden;border-radius:8px;border:1px solid var(--border);margin-bottom:16px">
            ${steps.map((s, i) => {
              const p = pct(s.value, sent)
              return `<div style="flex:1;display:flex;flex-direction:column;padding:12px 10px;background:${s.bg};${i > 0 ? 'border-left:1px solid var(--border)' : ''};min-width:0">
                <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${s.color};margin-bottom:4px;white-space:nowrap">${s.label}</span>
                <span style="font-size:20px;font-weight:800;color:${s.color};line-height:1">${s.value.toLocaleString('pt-BR')}</span>
                <span style="font-size:11px;color:${s.color};opacity:.75;margin-top:2px">${s.pctOf !== null ? p + '%' : '100%'}</span>
              </div>`
            }).join('')}
          </div>

          <!-- Barra de funil proporcional -->
          <div style="display:flex;height:8px;border-radius:99px;overflow:hidden;gap:2px">
            ${steps.map(s => {
              const p = pct(s.value, sent)
              return p > 0 ? `<div style="flex:${p};background:${s.color};border-radius:99px;transition:flex 0.5s" title="${s.label}: ${p}%"></div>` : ''
            }).filter(Boolean).join('')}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px">
            ${steps.map(s => `<div style="display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
              <span style="font-size:11px;color:var(--text-muted)">${s.label}</span>
            </div>`).join('')}
          </div>
        </div>`
    })()}

    <!-- Equipe -->
    <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
      <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0 0 14px">Desempenho da Equipe</h2>
      ${team.operators.length === 0 ? `<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:24px 0">Nenhum colaborador cadastrado</p>` : `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:6px 12px 8px 0;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Operador</th>
              <th style="text-align:center;padding:6px 12px 8px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em" title="Total atual">Total</th>
              <th style="text-align:center;padding:6px 12px 8px;font-size:10px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.05em">Novos</th>
              <th style="text-align:center;padding:6px 12px 8px;font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.05em">Iniciados</th>
              <th style="text-align:center;padding:6px 12px 8px;font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em">Etapas</th>
              <th style="text-align:center;padding:6px 12px 8px;font-size:10px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:0.05em">Convs</th>
              <th style="text-align:center;padding:6px 12px 8px;font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.05em">Não lidas</th>
              <th style="text-align:center;padding:6px 0 8px 12px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">T. Resp.</th>
            </tr>
          </thead>
          <tbody>
            ${team.operators.map(op=>{
              const opHue = Math.abs(op.name.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
              return `<tr style="border-bottom:1px solid #f3f4f6" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
                <td style="padding:8px 12px 8px 0">
                  <div style="display:flex;align-items:center;gap:7px">
                    <div style="width:24px;height:24px;border-radius:50%;background:hsl(${opHue},55%,88%);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;font-weight:700;color:hsl(${opHue},55%,35%)">${esc(op.name).charAt(0).toUpperCase()}</div>
                    <span style="font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px">${esc(op.name)}</span>
                    ${!op.isActive ? `<span style="font-size:9px;background:#f3f4f6;color:#9ca3af;padding:1px 5px;border-radius:4px">inativo</span>` : ''}
                  </div>
                </td>
                <td style="text-align:center;padding:8px 12px;font-weight:700;color:var(--text-primary)">${op.total}</td>
                <td style="text-align:center;padding:8px 12px;color:#16a34a;font-weight:600">${op.newLeads || '–'}</td>
                <td style="text-align:center;padding:8px 12px;color:#2563eb;font-weight:600">${op.initiated || '–'}</td>
                <td style="text-align:center;padding:8px 12px;color:#7c3aed;font-weight:600">${op.stageMoves || '–'}</td>
                <td style="text-align:center;padding:8px 12px;color:#0d9488;font-weight:600">${op.activeConvs || '–'}</td>
                <td style="text-align:center;padding:8px 12px;${op.unreadTotal > 0 ? 'color:#d97706;font-weight:700' : 'color:#9ca3af'}">${op.unreadTotal > 0 ? op.unreadTotal : '–'}</td>
                <td style="text-align:center;padding:8px 0 8px 12px;color:#6b7280">${fmtMin(op.avgResponseMinutes)}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <!-- Timeline bar chart -->
    <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
      <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0 0 14px">Atividade — ${esc(periodLabel)}</h2>
      <div style="display:flex;align-items:flex-end;gap:3px;height:80px">
        ${(() => {
          const maxVal = Math.max(...tl.last14days.map(x => Math.max(x.created, x.initiated ?? 0)), 1)
          return tl.last14days.map(d => {
            const hPct = Math.min(Math.round(d.created / maxVal * 100), 100)
            const cPct = Math.min(Math.round((d.initiated ?? 0) / maxVal * 100), 100)
            const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;position:relative" title="${dayLabel}: ${d.created} novos, ${d.initiated ?? 0} iniciados">
              <div style="width:100%;display:flex;align-items:flex-end;gap:1px;height:64px">
                <div style="flex:1;background:#c7d2fe;border-radius:3px 3px 0 0;height:${hPct}%;transition:height 0.3s"></div>
                <div style="flex:1;background:#34d399;border-radius:3px 3px 0 0;height:${cPct}%;transition:height 0.3s"></div>
              </div>
            </div>`
          }).join('')
        })()}
      </div>
      <div style="display:flex;align-items:center;gap:16px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:8px;background:#c7d2fe;border-radius:2px;display:inline-block"></span><span style="font-size:11px;color:var(--text-muted)">Novos leads</span></div>
        <div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:8px;background:#34d399;border-radius:2px;display:inline-block"></span><span style="font-size:11px;color:var(--text-muted)">Iniciados</span></div>
      </div>
    </div>

  </div>`
}

function renderOperatorDashboard() {
  const d = S.dashboard
  const ms = d.myStats, pr = d.priority, tl = d.timeline

  const statusLabel = { disponivel:'Novo Lead', pego:'Iniciado', em_andamento:'Em Andamento', perdido:'Perdido' }
  const statusCls   = { disponivel:'bg-green-100 text-green-700', pego:'bg-blue-100 text-blue-700', em_andamento:'bg-orange-100 text-orange-700', perdido:'bg-red-100 text-red-700' }

  const periodLabels = { today: 'Hoje', yesterday: 'Ontem', '7d': '7 dias', '30d': '30 dias', '60d': '60 dias', '90d': '90 dias', '6m': '6 meses', '1y': '1 ano', 'all': 'Tudo', 'custom': 'Personalizado' }
  const periodLabel = periodLabels[S.dashboardPeriod] || 'Hoje'

  return `<div style="display:flex;flex-direction:column;gap:20px">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <h1 style="font-size:20px;font-weight:800;color:var(--text-primary);margin:0">Meu Painel</h1>
        <p style="font-size:12px;color:var(--text-muted);margin:3px 0 0">${S.workspaceName ? `<span style="font-weight:700;color:var(--accent)">${esc(S.workspaceName)}</span> · ` : ''}Olá, <span style="font-weight:600;color:var(--text-primary)">${esc(S.me?.name)}</span> · seus leads e prioridades</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="display:flex;border:1.5px solid var(--border);border-radius:8px;overflow:hidden">
          ${['today','yesterday','7d','30d','60d','90d','6m','1y','all'].map(p => `<button onclick="S.dashboardPeriod='${p}';fetchDashboard().then(()=>scheduleRender())"
            style="padding:7px 10px;font-size:11.5px;font-weight:600;cursor:pointer;border:none;font-family:inherit;background:${S.dashboardPeriod===p?'var(--accent)':'#fff'};color:${S.dashboardPeriod===p?'white':'#6b7280'}">${periodLabels[p]}</button>`).join('') + `<button onclick="openCustomRange()" style="padding:7px 10px;font-size:11.5px;font-weight:600;cursor:pointer;border:none;font-family:inherit;background:${S.dashboardPeriod==='custom'?'var(--accent)':'#fff'};color:${S.dashboardPeriod==='custom'?'white':'#6b7280'}" title="Data personalizada">📅 ${S.dashboardPeriod==='custom' ? ((S.dashboardCustomFrom||'') + ' → ' + (S.dashboardCustomTo||'')) : 'Custom'}</button>`}
        </div>
        <button onclick="fetchDashboard().then(()=>scheduleRender())" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;background:#fff;border:1.5px solid var(--border);padding:7px 12px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:500">
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Atualizar
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
      ${kpi(`<svg style="width:20px;height:20px;color:#6366f1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,
        'Meus Leads', ms.total, `${ms.em_andamento} em andamento · ${periodLabel}`, 'background:#eef2ff', '#111827')}
      ${kpi(`<svg style="width:20px;height:20px;color:#10b981" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
        'Iniciados ' + periodLabel, ms.initiated, `${ms.newLeads} novos · ${ms.stageMoves} mudanças`, 'background:#ecfdf5', ms.initiated > 0 ? '#059669' : '#374151')}
      ${kpi(`<svg style="width:20px;height:20px;color:#f59e0b" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`,
        'Não Lidas', ms.unreadTotal, ms.unreadTotal > 0 ? 'Requer atenção' : 'Tudo lido', 'background:#fffbeb', ms.unreadTotal > 0 ? '#d97706' : '#374151')}
      ${kpi(`<svg style="width:20px;height:20px;color:#60a5fa" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
        'Tempo Médio', fmtMin(ms.avgResponseMinutes), 'para iniciar atendimento', 'background:#eff6ff', '#111827')}
    </div>

    <!-- Minhas metas financeiras do mês (filtrado pelo operador logado) -->
    ${(() => {
      const fin = S.dashboardFinancial
      if (!fin || !fin.types) return ''
      const fmtMoneyLocal = v => 'R$ ' + parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
      const activeTypes = (fin.types || []).filter(t => t.active)
      if (activeTypes.length === 0) return ''

      const meId   = S.me?.id
      const meName = S.me?.name

      // Agrega somente o que é do operador logado
      const byType = {}
      for (const t of activeTypes) byType[t.name] = { realized: 0, goal: 0 }
      for (const r of fin.ranking || []) {
        if (!byType[r.type_name]) continue
        const isMine = (r.operator_id && r.operator_id === meId) || (!r.operator_id && r.operator_name === meName)
        if (isMine) byType[r.type_name].realized += parseFloat(r.total || 0)
      }
      for (const g of fin.goals || []) {
        if (!byType[g.type_name]) continue
        const isMine = (g.operator_id && g.operator_id === meId) || (!g.operator_id && g.operator_name === meName)
        if (isMine) byType[g.type_name].goal += parseFloat(g.goal_amount || 0)
      }
      const visible = Object.entries(byType).filter(([,v]) => v.goal > 0 || v.realized > 0)
      if (visible.length === 0) return ''

      const monthLabel = new Date(fin.period + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      const cols = Math.min(visible.length, 4)
      const typeColors = ['#059669','#4f46e5','#d97706','#dc2626','#7c3aed','#0891b2']
      const typeIcons = {
        'Venda':     '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>',
        'Depósito':  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>',
        'Deposito':  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>',
      }
      const defaultIcon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>'

      return `
      <div style="display:flex;align-items:center;gap:8px;margin:-6px 0 -8px">
        <span style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Minhas metas · ${monthLabel}</span>
        <div style="flex:1;height:1px;background:var(--border)"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">
        ${visible.map(([name, v], i) => {
          const pct = v.goal > 0 ? Math.min(v.realized / v.goal * 100, 100) : 0
          const cardColor = typeColors[i % typeColors.length]
          const barColor = v.goal > 0
            ? (pct >= 100 ? '#10b981' : pct >= 50 ? cardColor : '#f59e0b')
            : cardColor
          const iconPath = typeIcons[name] || defaultIcon
          const remaining = v.goal > v.realized ? v.goal - v.realized : 0
          return `
            <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
              <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
                <span style="width:38px;height:38px;background:${cardColor}15;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <svg style="width:19px;height:19px;color:${cardColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconPath}</svg>
                </span>
                <div style="flex:1;min-width:0">
                  <p style="font-size:10.5px;color:var(--text-muted);font-weight:700;margin:0;text-transform:uppercase;letter-spacing:0.06em">Minha meta ${esc(name)}</p>
                  ${v.goal > 0 ? `<p style="font-size:10px;color:#9ca3af;margin:2px 0 0">faltam ${fmtMoneyLocal(remaining)}</p>` : `<p style="font-size:10px;color:#9ca3af;margin:2px 0 0">sem meta definida</p>`}
                </div>
                ${v.goal > 0 ? `<span style="font-size:11px;font-weight:800;color:${barColor};background:${barColor}15;border-radius:6px;padding:3px 7px;flex-shrink:0">${pct.toFixed(0)}%</span>` : ''}
              </div>
              <p style="font-size:22px;font-weight:800;color:#111827;margin:0;letter-spacing:-0.03em">${fmtMoneyLocal(v.realized)}</p>
              <p style="font-size:11.5px;color:var(--text-muted);margin:3px 0 10px">${v.goal > 0 ? `de ${fmtMoneyLocal(v.goal)}` : 'realizado no mês'}</p>
              ${v.goal > 0 ? `
                <div style="height:6px;background:#f3f4f6;border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.4s"></div>
                </div>
              ` : ''}
            </div>
          `
        }).join('')}
      </div>
      `
    })()}

    <!-- Distribuição por Etapa -->
    ${(() => {
      const myId = S.me?.id
      const myLeads = S.leads.filter(l => l.assignedToId === myId)
      const total = myLeads.length
      const stages = S.kanban?.stages || []
      const stageItems = stages.map(s => ({
        name: s.name,
        color: s.color || '#94a3b8',
        count: myLeads.filter(l => l.stageId === s.id).length,
      }))
      const semEtapa = myLeads.filter(l => !l.stageId).length
      if (semEtapa > 0) stageItems.push({ name: 'Sem Etapa', color: '#94a3b8', count: semEtapa })
      const cols = Math.max(stageItems.length, 1)
      return `<div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
        <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0 0 14px">Meus Leads por Etapa</h2>
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">
          ${stageItems.length === 0 ? `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px 0;grid-column:1/-1">Nenhuma etapa configurada</div>` :
            stageItems.map(s => `
            <div style="text-align:center">
              <p style="font-size:24px;font-weight:800;color:${s.color};margin:0">${s.count}</p>
              <p style="font-size:10.5px;color:var(--text-muted);margin:3px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(s.name)}">${esc(s.name)}</p>
              ${bar(s.count, total, s.color)}
            </div>`).join('')}
        </div>
      </div>`
    })()}

    <!-- Fila de prioridade -->
    <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0">Fila de Prioridade</h2>
        <span style="font-size:10px;color:var(--text-muted);background:#f3f4f6;border-radius:99px;padding:2px 8px">Ordena por não lidas · depois por espera</span>
      </div>
      ${pr.length === 0 ? `
      <div style="text-align:center;padding:32px 0;color:var(--text-muted)">
        <svg style="width:36px;height:36px;margin:0 auto 8px;opacity:0.2;display:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <p style="font-size:13px;margin:0">Nenhuma conversa pendente</p>
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:6px">
        ${pr.map(l => {
          const mins = l.minutesSinceLastMessage
          const waitStr = mins === null ? '' : mins < 60 ? mins+'min atrás' : Math.floor(mins/60)+'h atrás'
          const lHue = Math.abs(l.name.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
          return `<div onclick="navigate('inbox');openConversation('${esc(l.id)}')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);cursor:pointer;transition:all 0.12s" onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(99,102,241,0.04)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='transparent'">
            <div style="width:34px;height:34px;border-radius:50%;background:hsl(${lHue},55%,88%);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:hsl(${lHue},55%,35%)">${esc(l.name).charAt(0).toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:2px">
                <span style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.name)}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:10.5px;color:#6b7280">${fmtPhone(l.phone)}</span>
                ${waitStr ? `<span style="font-size:10.5px;color:#9ca3af">${waitStr}</span>` : ''}
              </div>
            </div>
            ${l.unreadCount > 0 ? `<span style="min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#ef4444;color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${l.unreadCount}</span>` : ''}
          </div>`
        }).join('')}
      </div>`}
    </div>

    <!-- Timeline -->
    <div style="background:#fff;border-radius:12px;border:1px solid var(--border);padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
      <h2 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:0 0 14px">Minhas Conversões — ${esc(periodLabel)}</h2>
      <div style="display:flex;align-items:flex-end;gap:3px;height:64px">
        ${tl.last14days.map(d => {
          const maxVal = Math.max(...tl.last14days.map(x => x.converted), 1)
          const hPct = Math.round(d.converted / maxVal * 100)
          const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;height:100%" title="${dayLabel}: ${d.converted} conversões">
            <div style="width:100%;background:${d.converted > 0 ? '#34d399' : '#e5e7eb'};border-radius:3px 3px 0 0;height:${Math.max(hPct, d.converted > 0 ? 8 : 0)}%;transition:height 0.3s"></div>
          </div>`
        }).join('')}
      </div>
    </div>
  </div>`
}