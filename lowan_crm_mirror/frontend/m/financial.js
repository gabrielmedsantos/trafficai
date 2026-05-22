// financial.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

async function loadFinancialTypes() {
  if (S.financialTypesLoaded) return
  try {
    S.financialTypes = await apiFin('/types')
    S.financialCommissions = await apiFin('/commissions')
    S.financialTypesLoaded = true
  } catch(e) { console.error('Financial types load error:', e) }
}

async function loadLeadFinancial(leadId) {
  // Mesmo padrão de UTM/Activity: guard contra disparos concorrentes,
  // timeout defensivo e fallback obrigatorio em erro pra escapar do
  // estado eterno de "Carregando..." quando a request falha/penduras.
  if (S.leadFinancialLoading.has(leadId)) return
  S.leadFinancialLoading.add(leadId)
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Financial request timeout (10s)')), 10000))
  try {
    await loadFinancialTypes()
    const [records, summary] = await Promise.race([
      Promise.all([apiFin(`/lead/${leadId}`), apiFin(`/lead/${leadId}/summary`)]),
      timeout
    ])
    S.financialLeadRecords = { ...S.financialLeadRecords, [leadId]: records }
    S.financialLeadSummary = { ...S.financialLeadSummary, [leadId]: summary }
  } catch(e) {
    console.error('Financial load error:', e?.message || e)
    S.financialLeadRecords = { ...S.financialLeadRecords, [leadId]: S.financialLeadRecords[leadId] || [] }
    S.financialLeadSummary = { ...S.financialLeadSummary, [leadId]: S.financialLeadSummary[leadId] || { totalAmount: 0, count: 0 } }
  } finally {
    S.leadFinancialLoading.delete(leadId)
  }
  render()
}

async function loadLeadActivity(leadId) {
  // Guard contra disparos concorrentes — render do painel chamava
  // loadLeadActivity toda vez que via cache undefined, o que empilhava
  // chamadas em paralelo enquanto a primeira ainda estava em voo.
  if (S.leadActivityLoading.has(leadId)) return
  S.leadActivityLoading.add(leadId)
  // Timeout defensivo: se o backend pendurar, a UI fica presa em
  // "Carregando…" eternamente. 10s de teto força fallback para [].
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Activity request timeout (10s)')), 10000))
  try {
    const events = await Promise.race([api(`/${leadId}/activity?limit=50`), timeout])
    S.leadActivity = { ...S.leadActivity, [leadId]: Array.isArray(events) ? events : [] }
    if (typeof _patchInboxDetailsPanel === 'function') _patchInboxDetailsPanel()
  } catch(e) {
    console.error('Lead activity load error:', e?.message || e)
    // Sem este fallback o cache ficava `undefined` em erro,
    // e o render disparava loadLeadActivity de novo a cada frame —
    // resultado: "Carregando..." eterno na seção Atividade.
    S.leadActivity = { ...S.leadActivity, [leadId]: [] }
    if (typeof _patchInboxDetailsPanel === 'function') _patchInboxDetailsPanel()
  } finally {
    S.leadActivityLoading.delete(leadId)
  }
}

async function addFinancialRecord(leadId) {
  const form = S.financialLeadForm[leadId] || {}
  if (!form.typeId) { showToast('Selecione o tipo', 'error'); return }
  const amt = parseFloat(form.amount)
  if (isNaN(amt) || amt < 0) { showToast('Valor inválido', 'error'); return }
  try {
    const rec = await apiFin(`/lead/${leadId}`, {
      method: 'POST',
      body: JSON.stringify({ financialTypeId: form.typeId, amount: amt, description: form.description || '' })
    })
    S.financialLeadRecords[leadId] = [rec, ...(S.financialLeadRecords[leadId]||[])]
    S.financialLeadForm[leadId] = {}
    S.financialLeadFormOpen[leadId] = false
    await loadLeadFinancial(leadId)
    showToast('Lançamento adicionado', 'success')
  } catch(e) { showToast(e.message, 'error') }
}

async function deleteFinancialRecord(recId, leadId) {
  if (!S.financialRecDelConfirm[recId]) {
    S.financialRecDelConfirm = { ...S.financialRecDelConfirm, [recId]: true }
    render()
    setTimeout(() => { if (S.financialRecDelConfirm[recId]) { delete S.financialRecDelConfirm[recId]; render() } }, 3000)
    return
  }
  try {
    await apiFin(`/record/${recId}`, { method: 'DELETE' })
    S.financialLeadRecords[leadId] = (S.financialLeadRecords[leadId]||[]).filter(r => r.id !== recId)
    delete S.financialRecDelConfirm[recId]
    await loadLeadFinancial(leadId)
    showToast('Removido', 'success')
  } catch(e) { showToast(e.message, 'error') }
}

function renderLeadFinancialSection(lead) {
  const lid = lead.id
  const summaryRaw = S.financialLeadSummary[lid]
  const records = S.financialLeadRecords[lid] || []
  const formOpen = S.financialLeadFormOpen[lid]
  const form = S.financialLeadForm[lid] || {}
  const types = (S.financialTypes||[]).filter(t => t.active)
  const histOpen = (S.financialHistOpen||{})[lid]
  const fmtMoney = v => 'R$ ' + parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})

  // Auto-load on first render
  if (!summaryRaw) {
    loadLeadFinancial(lid)
    return `
      <div class="det-label">Financeiro</div>
      <div class="fin-hero">
        <div class="fin-hero-label">Total acumulado</div>
        <div class="fin-hero-value" style="color:var(--text-muted)">
          <span class="fin-hero-currency">R$</span>
          <span class="fin-hero-num" style="font-size:20px">— —</span>
        </div>
        <div class="fin-hero-sub">Carregando…</div>
      </div>`
  }

  const summary = summaryRaw || []
  const totalGeral = summary.reduce((a,s) => a + parseFloat(s.total||0), 0)
  const lastRec = records[0]
  const lastAgo = lastRec ? Math.floor((Date.now() - new Date(lastRec.created_at).getTime()) / 86400000) : null
  const lastAgoLabel = lastAgo === null ? 'sem registros' :
                      lastAgo === 0 ? 'último hoje' :
                      lastAgo === 1 ? 'último ontem' :
                      `último há ${lastAgo} dias`

  // Total formatado em parts (integer + decimal)
  const totalStr = totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const [totalInt, totalDec] = totalStr.split(',')

  // Color dot per type — derivado de uma paleta cíclica
  const TYPE_COLORS = ['var(--bc-success)', 'var(--accent)', 'var(--bc-warning)', 'var(--brand-tg)', '#a855f7', '#ec4899']
  const colorOf = (idx, val) => parseFloat(val||0) > 0 ? TYPE_COLORS[idx % TYPE_COLORS.length] : 'var(--text-muted)'

  return `
    <div class="det-label">
      Financeiro
      ${!formOpen && types.length ? `<button class="det-label-add" title="Adicionar registro" onclick="S.financialLeadFormOpen['${lid}']=true;S.financialLeadForm['${lid}']={};render()">+</button>` : ''}
    </div>

    <!-- Hero do total -->
    <div class="fin-hero">
      <div class="fin-hero-label">Total acumulado</div>
      <div class="fin-hero-value" ${totalGeral === 0 ? 'style="color:var(--text-muted)"' : ''}>
        <span class="fin-hero-currency">R$</span>
        <span class="fin-hero-num">${totalInt}</span><span class="fin-hero-decimal">,${totalDec}</span>
      </div>
      <div class="fin-hero-sub">${records.length} registro${records.length===1?'':'s'} · ${lastAgoLabel}</div>
    </div>

    <!-- Lista de tipos com totais -->
    ${summary.length > 0 ? `
    <div class="fin-types">
      ${summary.map((s, idx) => {
        const muted = parseFloat(s.total||0) === 0
        return `
        <div class="fin-type${muted ? ' muted' : ''}">
          <div class="fin-type-dot" style="background:${colorOf(idx, s.total)}"></div>
          <span class="fin-type-name">${esc(s.type_name)}</span>
          <span class="fin-type-val">${fmtMoney(s.total)}</span>
        </div>`
      }).join('')}
    </div>` : ''}

    <!-- Add chips ou formulário inline -->
    ${!formOpen ? `
    <div class="fin-add-row">
      ${types.slice(0,3).map(t => `
        <button class="fin-chip" onclick="S.financialLeadFormOpen['${lid}']=true;S.financialLeadForm['${lid}']={typeId:'${t.id}'};render()">+ ${esc(t.name)}</button>
      `).join('')}
      ${types.length > 3 ? `
        <button class="fin-chip" style="flex:0 0 32px;padding:5px;display:inline-flex;align-items:center;justify-content:center" title="Mais tipos" onclick="S.financialLeadFormOpen['${lid}']=true;S.financialLeadForm['${lid}']={};render()">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h.01M12 12h.01M19 12h.01"/></svg>
        </button>` : ''}
      ${types.length === 0 ? `<span style="font-size:11px;color:var(--text-muted);font-style:italic;flex:1;text-align:center;padding:6px 0">Nenhum tipo cadastrado</span>` : ''}
    </div>
    ` : `
    <!-- Formulário inline -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:10px;margin-bottom:8px">
      <select onchange="S.financialLeadForm['${lid}']={...S.financialLeadForm['${lid}'],typeId:this.value};render()"
        style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;margin-bottom:7px;background:var(--surface);color:var(--text-primary);outline:none">
        <option value="">Tipo…</option>
        ${types.map(t => `<option value="${t.id}" ${form.typeId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
      </select>
      <input type="number" min="0" step="0.01" placeholder="Valor (R$)" value="${form.amount||''}"
        oninput="S.financialLeadForm['${lid}']={...S.financialLeadForm['${lid}'],amount:this.value}"
        style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;margin-bottom:7px;color:var(--text-primary);outline:none;background:var(--surface)" onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 3px var(--accent-soft)'" onblur="this.style.borderColor='var(--border)';this.style.boxShadow='none'"/>
      <input type="text" placeholder="Descrição (opcional)" value="${esc(form.description||'')}"
        oninput="S.financialLeadForm['${lid}']={...S.financialLeadForm['${lid}'],description:this.value}"
        style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;margin-bottom:8px;color:var(--text-primary);outline:none;background:var(--surface)" onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 3px var(--accent-soft)'" onblur="this.style.borderColor='var(--border)';this.style.boxShadow='none'"/>
      <div style="display:flex;gap:6px">
        <button onclick="addFinancialRecord('${lid}')" style="flex:1;padding:8px;background:var(--accent);color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .14s var(--bc-easing)" onmouseover="this.style.background='var(--accent-hover)'" onmouseout="this.style.background='var(--accent)'">Salvar</button>
        <button onclick="S.financialLeadFormOpen['${lid}']=false;render()" style="padding:7px 12px;border:1px solid var(--border);background:var(--surface);border-radius:7px;font-size:12px;cursor:pointer;font-family:inherit;color:var(--text-secondary)">Cancelar</button>
      </div>
    </div>
    `}

    <!-- Histórico (link discreto + colapsável) -->
    ${records.length > 0 ? `
    <button class="fin-hist-link" onclick="S.financialHistOpen={...(S.financialHistOpen||{}),'${lid}':!${!!histOpen}};render()">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      ${histOpen ? 'Ocultar' : 'Ver'} histórico (${records.length})
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${histOpen ? 'M5 15l7-7 7 7' : 'M9 5l7 7-7 7'}"/></svg>
    </button>
    ${histOpen ? `
    <div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;margin-top:4px;padding:0 2px">
      ${records.map(r => {
        const isDelConf = (S.financialRecDelConfirm||{})[r.id]
        return `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                <span style="font-size:10px;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:5px;padding:2px 7px;letter-spacing:.02em">${esc(r.type_name)}</span>
                <span style="font-size:12.5px;font-weight:700;color:var(--bc-success);font-family:'JetBrains Mono',monospace">${fmtMoney(r.amount)}</span>
              </div>
              ${r.description ? `<p style="font-size:11px;color:var(--text-secondary);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.description)}</p>` : ''}
              <p style="font-size:10px;color:var(--text-muted);margin:3px 0 0">${esc(r.operator_name||'')} · ${new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            ${isAdmin() ? `<button onclick="deleteFinancialRecord('${r.id}','${lid}')"
              style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid ${isDelConf?'var(--bc-danger)':'#fecaca'};background:${isDelConf?'var(--bc-danger)':'#fff1f2'};color:${isDelConf?'#fff':'var(--bc-danger)'};cursor:pointer;flex-shrink:0;font-family:inherit;font-weight:600">
              ${isDelConf?'Confirmar':'×'}
            </button>` : ''}
          </div>
        </div>`
      }).join('')}
    </div>` : ''}
    ` : ''}`
}

async function saveFinancialType(id, data) {
  try {
    const updated = await apiFin(`/types/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    S.financialTypes = S.financialTypes.map(t => t.id === id ? updated : t)
    S.financialTypesLoaded = false  // force reload commission sync
    render()
    showToast('Tipo atualizado', 'success')
  } catch(e) { showToast(e.message, 'error') }
}

async function deleteFinancialType(id) {
  if (!S._finTypeDelConfirm) S._finTypeDelConfirm = {}
  if (!S._finTypeDelConfirm[id]) {
    S._finTypeDelConfirm[id] = true; render()
    setTimeout(() => { if (S._finTypeDelConfirm?.[id]) { delete S._finTypeDelConfirm[id]; render() } }, 3000)
    return
  }
  try {
    await apiFin(`/types/${id}`, { method: 'DELETE' })
    S.financialTypes = S.financialTypes.filter(t => t.id !== id)
    delete S._finTypeDelConfirm[id]
    render()
    showToast('Tipo removido', 'success')
  } catch(e) { showToast(e.message, 'error') }
}

async function saveCommission(typeId, percentage) {
  try {
    const updated = await apiFin(`/commissions/${typeId}`, { method: 'PUT', body: JSON.stringify({ percentage: parseFloat(percentage)||0, active: true }) })
    S.financialCommissions = [...S.financialCommissions.filter(c => c.financial_type_id !== typeId), updated]
    showToast('Comissão salva', 'success')
  } catch(e) { showToast(e.message, 'error') }
}

function renderFinancialSettingsPanel() {
  if (!S.financialTypesLoaded) { loadFinancialTypes().then(()=>scheduleRender()) }
  if (!S._finTypeEditVals) S._finTypeEditVals = {}
  if (!S._finTypeDelConfirm) S._finTypeDelConfirm = {}
  const types = S.financialTypes || []
  const commMap = {}
  for (const c of (S.financialCommissions || [])) commMap[c.financial_type_id] = c

  const TRASH_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L4 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`

  const TYPE_PALETTE = ['#16a34a', '#4f46e5', '#d97706', '#a855f7', '#0ea5e9', '#ec4899', '#14b8a6', '#f43f5e']
  const activeTypes = types.filter(t => t.active)
  const commissionedTypes = types.filter(t => {
    const c = commMap[t.id]
    return c && parseFloat(c.percentage || 0) > 0
  })
  const avgCommission = commissionedTypes.length > 0
    ? (commissionedTypes.reduce((s, t) => s + parseFloat(commMap[t.id].percentage || 0), 0) / commissionedTypes.length).toFixed(1)
    : '0'

  return `
  <div class="cfg-page-head">
    <div class="cfg-page-head-titles">
      <div class="cfg-page-eyebrow"><span class="dot"></span>Workspace · Financeiro</div>
      <h1>Lançamentos</h1>
      <p>Configure tipos de lançamento e percentuais de comissão. Aparecem na seção financeira de cada lead e nas estatísticas.</p>
    </div>
    <div class="cfg-page-head-cta">
      <button class="cfg-btn cfg-btn-secondary" onclick="navigate('estatisticas');render()">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2"/></svg>
        Estatísticas
      </button>
    </div>
  </div>

  <div class="qcards">
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 6px 14px rgba(22,163,74,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${types.length}</div><div class="qcard-label">Tipos cadastrados</div></div>
    </div>
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,var(--accent),#6366f1);box-shadow:0 6px 14px rgba(79,70,229,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${activeTypes.length}</div><div class="qcard-label">Ativos no momento</div></div>
    </div>
    <div class="qcard">
      <div class="qcard-ic" style="background:linear-gradient(135deg,#d97706,#f59e0b);box-shadow:0 6px 14px rgba(217,119,6,0.30)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14"/></svg>
      </div>
      <div class="qcard-info"><div class="qcard-num">${avgCommission}%</div><div class="qcard-label">Comissão média</div></div>
    </div>
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <h2 style="font-family:'Bricolage Grotesque',serif;font-weight:700;font-size:18px;letter-spacing:-0.02em;color:var(--text-primary);margin:0">Tipos de lançamento</h2>
    <span style="font-size:12px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">${types.length} tipo${types.length!==1?'s':''} · ${activeTypes.length} ativo${activeTypes.length!==1?'s':''}</span>
  </div>

  <div class="fin-types-card">
    ${types.length === 0 ? `
      <div style="padding:32px 24px;text-align:center;color:var(--text-muted)">
        <p style="font-size:13px;margin:0">Nenhum tipo cadastrado ainda. Crie o primeiro abaixo.</p>
      </div>
    ` : types.map((t, i) => {
      const nameVal = S._finTypeEditVals[t.id] !== undefined ? S._finTypeEditVals[t.id] : (t.name || '')
      const comm = commMap[t.id]
      const commPct = comm ? parseFloat(comm.percentage || 0) : 0
      const isDelConf = S._finTypeDelConfirm[t.id]
      const dot = TYPE_PALETTE[i % TYPE_PALETTE.length]
      const isActive = !!t.active
      return `
      <div class="fin-type-row${isActive ? '' : ' muted'}">
        <span class="fin-type-dot" style="background:${isActive ? dot : 'var(--text-muted)'}"></span>
        <input class="fin-type-name" type="text" value="${esc(nameVal)}"
          oninput="if(!S._finTypeEditVals)S._finTypeEditVals={};S._finTypeEditVals['${t.id}']=this.value"
          onblur="if(this.value.trim()&&this.value.trim()!==${JSON.stringify(t.name||'').replace(/"/g,'&quot;')})saveFinancialType('${t.id}',{name:this.value.trim()})"/>
        <label class="fin-type-toggle">
          <span class="toggle-switch${isActive ? ' on' : ''}" onclick="saveFinancialType('${t.id}',{active:${!isActive}})"></span>
          ${isActive ? 'Ativo' : 'Inativo'}
        </label>
        <div class="fin-type-comm">
          <input type="number" min="0" max="100" step="0.1" value="${commPct}"
            onblur="saveCommission('${t.id}',this.value)"/>
          <span class="pct">%</span>
        </div>
        <div class="fin-type-total">—</div>
        <button class="cfg-icon-btn ${isDelConf ? '' : 'danger'}" title="${isDelConf ? 'Clique novamente para confirmar' : 'Remover'}" onclick="deleteFinancialType('${t.id}')" style="${isDelConf ? 'background:var(--bc-danger);color:#fff' : ''}">
          ${isDelConf ? '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : TRASH_SVG}
        </button>
      </div>`
    }).join('')}

    <div class="fin-type-add">
      <input id="new-fin-type-input" type="text" placeholder="Nome do novo tipo... (Ex: Reembolso, Investimento)"
        onkeydown="if(event.key==='Enter'){event.preventDefault();createFinancialType()}"/>
      <button class="cfg-btn cfg-btn-primary" onclick="createFinancialType()">
        <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Criar tipo
      </button>
    </div>
  </div>

  <div class="fin-info-card">
    <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    <div><strong>Sobre comissões:</strong> O percentual é aplicado automaticamente sobre o valor de cada lançamento desse tipo. Os totais aparecem em <strong>Estatísticas</strong> agrupados por operador. Editar o nome e o percentual salva ao sair do campo.</div>
  </div>
  `
}

async function createFinancialType() {
  const input = document.getElementById('new-fin-type-input')
  const name = input?.value?.trim()
  if (!name) { showToast('Informe o nome do tipo', 'error'); return }
  try {
    const t = await apiFin('/types', { method: 'POST', body: JSON.stringify({ name }) })
    S.financialTypes = [...S.financialTypes, t]
    if (input) input.value = ''
    render()
    showToast('Tipo criado', 'success')
  } catch(e) { showToast(e.message, 'error') }
}