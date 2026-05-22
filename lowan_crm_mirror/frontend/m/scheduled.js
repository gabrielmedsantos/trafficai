// scheduled.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

async function loadScheduledForLead(leadId) {
  if (!leadId) return
  try {
    const rows = await apiSched(`/lead/${leadId}`)
    S.scheduledByLead = S.scheduledByLead || {}
    S.scheduledByLead[leadId] = rows || []
    // Patch cirúrgico da reply box para mostrar/atualizar o banner
    try { _patchInboxReplyBox && _patchInboxReplyBox() } catch(e) {}
    try { _patchConvReplyBox && _patchConvReplyBox() } catch(e) {}
  } catch (e) { console.warn('loadScheduledForLead', e.message) }
}

function _ensureScheduleModalRoot() {
  let el = document.getElementById('sched-modal-root')
  if (!el) { el = document.createElement('div'); el.id = 'sched-modal-root'; document.body.appendChild(el) }
  return el
}

function _paintScheduleModal() {
  _ensureScheduleModalRoot().innerHTML = renderScheduleModal()
}

function openScheduleModal() {
  // Tenta obter leadId de múltiplas fontes (fallback para inbox/chat)
  let leadId = S.conversationLeadId
  if (!leadId && S.openConvId) leadId = S.openConvId
  if (!leadId) { showToast('Abra uma conversa para agendar', 'error'); return }
  // Pega o texto do textarea (mais confiável que S.replyText)
  const ta = document.getElementById('reply-input')
  const text = ((ta && ta.value) || S.replyText || '').trim()
  if (!text) { showToast('Digite a mensagem antes de agendar', 'error'); return }
  S.scheduleModal = { leadId, text }
  const d = new Date(Date.now() + 60*60*1000)
  d.setSeconds(0,0)
  d.setMinutes(Math.round(d.getMinutes()/5)*5)
  S.scheduleModalDatetime = toLocalInputValue(d)
  _paintScheduleModal()
  setTimeout(()=>{ document.getElementById('schedule-datetime')?.focus() }, 30)
}

function closeScheduleModal() {
  S.scheduleModal = null
  S.scheduleModalDatetime = ''
  const el = document.getElementById('sched-modal-root')
  if (el) el.innerHTML = ''
}

async function confirmScheduleMessage() {
  const m = S.scheduleModal
  if (!m) return
  const dtStr = document.getElementById('schedule-datetime')?.value || S.scheduleModalDatetime
  if (!dtStr) { showToast('Escolha data e hora','error'); return }
  const localDate = new Date(dtStr)
  if (isNaN(localDate.getTime())) { showToast('Data/hora inválida','error'); return }
  if (localDate.getTime() - Date.now() < 30000) {
    showToast('O horário precisa ser pelo menos 30s no futuro','error'); return
  }
  try {
    const body = { content: m.text, scheduledAt: localDate.toISOString() }
    if (S.convConnId) body.connectionId = S.convConnId
    await apiSched(`/lead/${m.leadId}`, { method:'POST', body: JSON.stringify(body) })
    showToast(`Mensagem agendada para ${formatSchedWhen(localDate.toISOString())}`, 'success')
    S.replyText = ''
    const ta = document.getElementById('reply-input'); if (ta) ta.value = ''
    closeScheduleModal()
    loadScheduledForLead(m.leadId)
  } catch (e) {
    showToast(e.message || 'Falha ao agendar','error')
  }
}

async function cancelScheduledMessage(id, leadId) {
  if (!confirm('Cancelar este agendamento?')) return
  try {
    await apiSched(`/${id}`, { method:'DELETE' })
    showToast('Agendamento cancelado','success')
    loadScheduledForLead(leadId)
  } catch (e) { showToast(e.message,'error') }
}

function renderScheduleModal() {
  if (!S.scheduleModal) return ''
  const m = S.scheduleModal
  const preview = (m.text.length > 180 ? m.text.slice(0,180)+'…' : m.text)
  const minVal = toLocalInputValue(new Date(Date.now() + 60000))
  return `
  <div class="modal-backdrop" onclick="if(event.target===this)closeScheduleModal()">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" style="padding:22px 22px 18px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:10px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0">Agendar mensagem</h3>
        </div>
        <button onclick="closeScheduleModal()" class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:14px">
        <p style="font-size:11px;color:#64748b;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.04em;font-weight:700">Mensagem</p>
        <p style="font-size:13px;color:#0f172a;margin:0;white-space:pre-wrap;line-height:1.45">${esc(preview)}</p>
      </div>

      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Data e hora do envio</label>
      <input id="schedule-datetime" type="datetime-local" min="${minVal}" value="${S.scheduleModalDatetime||minVal}"
        style="width:100%;height:42px;padding:0 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;color:#0f172a;outline:none;font-family:inherit"
        onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='#e2e8f0'"/>

      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        ${[[15,'15 min'],[60,'1h'],[180,'3h'],[1440,'Amanhã nesta hora']].map(([min,lbl])=>{
          const d = new Date(Date.now() + min*60000); d.setSeconds(0,0)
          return `<button onclick="document.getElementById('schedule-datetime').value='${toLocalInputValue(d)}'"
            style="padding:6px 12px;border:1px solid #e2e8f0;background:#fff;border-radius:20px;font-size:12px;color:#475569;cursor:pointer"
            onmouseover="this.style.background='#eef2ff';this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
            onmouseout="this.style.background='#fff';this.style.borderColor='#e2e8f0';this.style.color='#475569'">${lbl}</button>`
        }).join('')}
      </div>

      <p style="font-size:11px;color:#94a3b8;margin:14px 0 0">⏱️ A mensagem será enviada automaticamente no horário escolhido (precisão ~20s). Você pode cancelar a qualquer momento antes do envio.</p>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9">
        <button onclick="closeScheduleModal()" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancelar</button>
        <button onclick="confirmScheduleMessage()" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          Agendar envio
        </button>
      </div>
    </div>
  </div>`
}

function renderScheduledBanner(leadId) {
  const list = (S.scheduledByLead && S.scheduledByLead[leadId]) || []
  const pending = list.filter(r => r.status === 'pending' || r.status === 'failed')
  if (!pending.length) return ''
  return `
  <div style="margin:0 12px 8px;background:linear-gradient(to right,#fefce8,#fef9c3);border:1px solid #fde68a;border-radius:12px;padding:8px 12px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <svg width="14" height="14" fill="none" stroke="#a16207" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span style="font-size:11.5px;font-weight:700;color:#854d0e;text-transform:uppercase;letter-spacing:0.04em">${pending.length} mensagem${pending.length!==1?'ns':''} agendada${pending.length!==1?'s':''}</span>
    </div>
    ${pending.slice(0,3).map(r => {
      const failed = r.status === 'failed'
      return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
        <span style="font-size:11px;color:${failed?'#991b1b':'#854d0e'};min-width:110px">${failed?'⚠ ':''} ${formatSchedWhen(r.scheduledAt)}</span>
        <span style="flex:1;font-size:12px;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.content)}</span>
        <button onclick="cancelScheduledMessage('${r.id}','${leadId}')" title="Cancelar"
          style="flex-shrink:0;width:22px;height:22px;border-radius:6px;background:transparent;border:none;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center"
          onmouseover="this.style.background='#fee2e2';this.style.color='#991b1b'"
          onmouseout="this.style.background='transparent';this.style.color='#94a3b8'">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>`
    }).join('')}
    ${pending.length > 3 ? `<p style="font-size:11px;color:#854d0e;margin:4px 0 0">+${pending.length-3} outros agendamentos</p>` : ''}
  </div>`
}

function _syncScheduledForActiveLead() {
  const lid = S.conversationLeadId
  if (lid && lid !== _lastSchedLoadedLeadId) {
    _lastSchedLoadedLeadId = lid
    loadScheduledForLead(lid)
  }
}