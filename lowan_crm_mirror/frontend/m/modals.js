// modals.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

function _placeMenu(trigger, menu, width) {
  const r = trigger.getBoundingClientRect()
  const menuH = menu.offsetHeight || 200
  const MIN_MENU_H = 180
  const spaceBelow = window.innerHeight - r.bottom - 8
  const spaceAbove = r.top - 8
  const openUp = spaceBelow < menuH && spaceAbove > spaceBelow
  menu.style.position = 'fixed'
  menu.style.left = r.left + 'px'
  menu.style.width = width + 'px'
  menu.style.right = 'auto'
  menu.style.zIndex = '99999'
  // CRÍTICO: anular o `top: calc(100% + 6px)` do CSS class .lds-menu quando portal'd
  // pro body. Sem isso, top+bottom ficam ambos setados e o menu estica/colapsa.
  if (openUp) {
    menu.style.top = 'auto'
    menu.style.bottom = (window.innerHeight - r.top + 4) + 'px'
    menu.style.maxHeight = Math.max(MIN_MENU_H, Math.min(spaceAbove, 280)) + 'px'
  } else {
    menu.style.bottom = 'auto'
    menu.style.top = (r.bottom + 4) + 'px'
    menu.style.maxHeight = Math.max(MIN_MENU_H, Math.min(spaceBelow, 280)) + 'px'
  }
}

// Atualiza o avatar do modal de lead (cor + iniciais) ao vivo conforme o
// usuário digita o nome. Evita render completo (que perde foco no input).

function closeModal() { S.modal=null; S.editId=null; S.formError=''; S.formLoading=false; S.deleteTarget=null; S.deleteConversation=false; S.deleteConvTarget=null; S.deleteConvContact=false; S.deleteConvBlacklist=false; if(typeof _teardownLeadDdClickOutside==='function')_teardownLeadDdClickOutside(); render() }


function openImageModal(blobUrl) {
  const existing = document.getElementById('_img_modal')
  if (existing) existing.remove()
  const el = document.createElement('div')
  el.id = '_img_modal'
  el.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4'
  el.onclick = e => { if (e.target === el) el.remove() }
  el.innerHTML = `
    <div class="relative max-w-full max-h-full flex flex-col items-center gap-3">
      <button onclick="document.getElementById('_img_modal').remove()"
        class="absolute -top-10 right-0 text-white/70 hover:text-white text-2xl leading-none">&times;</button>
      <img src="${blobUrl}" alt="Imagem" class="max-w-[90vw] max-h-[80vh] rounded-xl shadow-2xl object-contain"/>
    </div>`
  document.body.appendChild(el)
}

// ── FASE2-A: IntersectionObserver compartilhado para lazy loading de mídia ───
// rootMargin '300px 0px': começa a carregar quando o elemento está a 300px do viewport
var _lazyObserver = null

function _patchRootModal() {
  const el = document.getElementById('root-modal')
  if (el) el.innerHTML = renderModal()
  const wsEl = document.getElementById('ws-switcher-portal')
  if (wsEl) wsEl.innerHTML = renderWsSwitcherModal()
}


function renderModal() {
  if (!S.modal) return ''
  let content=''

  if (S.modal==='lead') {
    const isEdit=!!S.editId
    const _initials = (S.form.name||'').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()
    const _hue = (S.form.name||'').trim() ? Math.abs((S.form.name||'').split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360 : null
    content=`
      <style>
        @keyframes lmSpin { to { transform: rotate(360deg) } }
        @keyframes lmShimmer { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
        @keyframes lmAvatarPop { from { transform: scale(0.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes lmFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-2px) } }
        @keyframes lmAccentPulse {
          0%, 100% { transform: scaleY(1); opacity: 0.8 }
          50% { transform: scaleY(1.1); opacity: 1 }
        }

        .lm-shell {
          font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
          position: relative;
        }
        .lm-shell::before {
          content: ''; position: absolute;
          left: -20px; top: 0; bottom: 60px;
          width: 3px;
          background: linear-gradient(180deg, #6366f1 0%, #4f46e5 50%, transparent 100%);
          border-radius: 0 3px 3px 0;
          animation: lmAccentPulse 3s ease-in-out infinite;
          transform-origin: top;
          pointer-events: none;
        }

        .lm-head {
          display: flex; align-items: center; gap: 14px;
          padding-bottom: 14px; margin-bottom: 16px;
          border-bottom: 1px solid #f0f1f3;
        }
        .lm-head-av {
          width: 40px; height: 40px; border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 15px;
          letter-spacing: -0.04em; flex-shrink: 0;
          position: relative;
          ${_hue !== null ? `
            background: hsl(${_hue},55%,92%); color: hsl(${_hue},55%,28%);
            box-shadow: 0 0 0 1px hsl(${_hue},55%,85%);
          ` : `
            background: linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);
            color: #fff;
            box-shadow: 0 4px 12px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
            animation: lmFloat 3s ease-in-out infinite;
          `}
          ${_hue === null ? 'animation: lmFloat 3s ease-in-out infinite;' : ''}
        }
        .lm-head-text { flex: 1; min-width: 0; }
        .lm-head-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9.5px; font-weight: 600;
          letter-spacing: 0.12em; color: #9ca3af;
          text-transform: uppercase;
          margin-bottom: 1px;
        }
        .lm-head-text h2 {
          font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
          font-size: 21px; letter-spacing: -0.04em; color: #0a0b0f; margin: 0; line-height: 1.05;
        }

        .lm-error {
          background: linear-gradient(135deg, rgba(220,38,38,0.05), rgba(220,38,38,0.08));
          border: 1px solid rgba(220,38,38,0.18);
          color: #b91c1c; font-size: 12px; font-weight: 500;
          padding: 9px 12px; border-radius: 9px; margin-bottom: 12px;
          display: flex; align-items: flex-start; gap: 8px; line-height: 1.4;
        }
        .lm-grid { display: grid; gap: 11px; }
        .lm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .lm-field { display: flex; flex-direction: column; gap: 5px; }
        .lm-label {
          display: flex; align-items: center; gap: 7px;
          font-size: 10px; font-weight: 700; color: #6b7280;
          letter-spacing: 0.07em; text-transform: uppercase;
        }
        .lm-label-num {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; font-weight: 600;
          color: #d1d3d8; letter-spacing: 0.04em;
        }
        .lm-label .req {
          color: #4f46e5; margin-left: -2px;
          font-size: 12px; font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
        }

        .lm-input, .lm-textarea, .lm-select {
          width: 100%; padding: 9px 13px;
          border: 1.5px solid #e9eaec; border-radius: 10px;
          font-size: 13px; font-family: inherit; background: #fff; color: #0a0b0f;
          outline: none; box-sizing: border-box;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .lm-input::placeholder, .lm-textarea::placeholder { color: #c4c7cc; }
        .lm-input:hover:not(:focus) { border-color: #d1d3d8; }
        .lm-input:focus, .lm-textarea:focus, .lm-select:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 4px rgba(79,70,229,0.1);
          background: #fefefe;
        }
        .lm-textarea { resize: vertical; min-height: 56px; line-height: 1.45; }
        .lm-input.tel { font-family: 'JetBrains Mono', monospace; font-weight: 500; }
        .lm-select {
          appearance: none; -webkit-appearance: none; -moz-appearance: none;
          padding-right: 32px; cursor: pointer;
          background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
        }

        /* Custom dropdown estilizado (mesmo visual do dropdown de operador da lista) */
        .lm-dd { position: relative; }
        .lm-dd-trigger {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          width: 100%; padding: 8px 12px;
          border: 1.5px solid #e9eaec; border-radius: 9px;
          font-size: 13px; font-family: inherit; background: #fff; color: #0a0b0f;
          cursor: pointer; text-align: left; font-weight: 400;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .lm-dd-trigger:hover { border-color: #b8bcc4; }
        .lm-dd.is-open .lm-dd-trigger {
          border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
        }
        .lm-dd-trigger-rich { padding: 6px 10px 6px 8px; }
        .lm-dd-val { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .lm-dd-val.muted { color: #9095a0; font-style: italic; }
        .lm-dd-chev { color: #9ca3af; flex-shrink: 0; transition: transform 0.2s ease; }
        .lm-dd.is-open .lm-dd-chev { transform: rotate(180deg); }
        /* Menu reusa estilos do .lds-menu existente — sem duplicação */

        .lm-actions { display: flex; gap: 8px; margin-top: 14px; }
        .lm-btn {
          flex: 1; padding: 9px 16px; border-radius: 9px;
          font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer;
          border: 1px solid transparent;
          transition: transform 0.18s cubic-bezier(0.4,0,0.2,1),
                      box-shadow 0.18s cubic-bezier(0.4,0,0.2,1),
                      background 0.15s, border-color 0.15s;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          letter-spacing: -0.005em;
        }
        .lm-btn:active { transform: translateY(1px) }
        .lm-btn-cancel {
          background: #f7f8fa; color: #2a2d35; border-color: #eef0f3;
        }
        .lm-btn-cancel:hover { background: #eef0f3; border-color: #d4d6db; }
        .lm-btn-save {
          color: #fff; font-weight: 700;
          background: linear-gradient(135deg,#6366f1 0%,#4f46e5 50%,#6366f1 100%);
          background-size: 200% 100%; background-position: 0% 50%;
          box-shadow: 0 2px 8px rgba(79,70,229,0.32);
          transition: transform 0.18s cubic-bezier(0.4,0,0.2,1),
                      box-shadow 0.18s cubic-bezier(0.4,0,0.2,1),
                      background-position 0.4s ease;
        }
        .lm-btn-save:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.012);
          box-shadow: 0 6px 16px rgba(79,70,229,0.45), 0 0 0 4px rgba(79,70,229,0.08);
          background-position: 100% 50%;
        }
        .lm-btn-save:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
          transition-duration: 0.05s;
        }
        .lm-btn-save:disabled {
          cursor: not-allowed; opacity: 0.88;
          background: linear-gradient(135deg,#818cf8,#6366f1);
          background-size: 200% 100%;
          animation: lmShimmer 1.6s ease-in-out infinite;
        }
        .lm-btn-save .spin {
          width: 13px; height: 13px;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          border-radius: 50%; animation: lmSpin 0.7s linear infinite;
        }
        .lm-tel-wrap {
          display: flex; align-items: stretch;
          border: 1.5px solid #e9eaec; border-radius: 9px;
          background: #fff; transition: border-color 0.15s, box-shadow 0.15s;
          position: relative;
        }
        .lm-tel-wrap:focus-within {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
        }
        .lm-tel-wrap.is-country-open {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
        }
        .lm-tel-prefix-btn {
          padding: 0 6px 0 9px; display: flex; align-items: center;
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: #4b5563; background: #f7f8fa;
          border: none; border-right: 1px solid #eef0f3; flex-shrink: 0; gap: 4px;
          cursor: pointer;
          border-radius: 7px 0 0 7px;
          transition: background 0.15s;
        }
        .lm-tel-prefix-btn:hover { background: #eef0f3; }
        .lm-tel-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.05em; color: #9ca3af;
        }
        .lm-tel-dial {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px; font-weight: 600;
          letter-spacing: -0.01em; color: #2a2d35;
        }
        .lm-tel-chev {
          color: #9ca3af;
          transition: transform 0.2s ease;
          margin-left: 1px;
        }
        .lm-tel-wrap.is-country-open .lm-tel-chev { transform: rotate(180deg); }
        .lm-tel-wrap .lm-input {
          border: none; box-shadow: none;
          border-radius: 0 7px 7px 0;
          padding: 8px 12px;
          background: transparent;
          flex: 1; min-width: 0;
        }
        .lm-tel-wrap .lm-input:focus { box-shadow: none; }
        /* Menu de país compacto e refinado — width ajustado dinamicamente via JS */
        .lm-country-menu {
          left: 0; min-width: 110px;
          padding: 3px !important;
        }
        .lm-country-menu .lds-menu-search {
          padding: 4px 7px !important;
          margin-bottom: 2px !important;
          background: #f7f8fa !important;
          border-radius: 5px !important;
        }
        .lm-country-menu .lds-menu-search svg { width: 10px !important; height: 10px !important; }
        .lm-country-menu .lds-menu-search input {
          font-size: 11px !important;
        }
        .lm-country-item {
          gap: 6px !important;
          padding: 5px 7px !important;
          border-radius: 4px !important;
          font-size: 11.5px !important;
        }
        .lm-country-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          font-weight: 800;
          color: #4b5563;
          letter-spacing: 0.06em;
          min-width: 22px;
          text-align: left;
          flex-shrink: 0;
        }
        .lds-menu-item.selected .lm-country-code {
          color: #4f46e5;
        }
        .lm-country-dial {
          flex: 1;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: #9ca3af;
          font-weight: 500;
          text-align: right;
          letter-spacing: -0.01em;
        }
        .lds-menu-item.selected .lm-country-dial { color: #4f46e5; font-weight: 600; }
        .lm-country-menu .lds-menu-item .check {
          width: 11px !important; height: 11px !important;
          margin-left: 4px !important;
        }
      </style>
      <div class="lm-shell">
        <div class="lm-head">
          <div class="lm-head-av">${_initials || `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>`}</div>
          <div class="lm-head-text">
            <div class="lm-head-eyebrow">${isEdit?'Editar contato':'Novo contato'}</div>
            <h2>${isEdit?(esc(S.form.name||'').slice(0,28) || 'Editar lead'):'Cadastrar lead'}</h2>
          </div>
        </div>

        ${S.formError?`<div class="lm-error">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>${esc(S.formError)}</span>
        </div>`:''}

        <div class="lm-grid">
          <div class="lm-field">
            <label class="lm-label"><span class="lm-label-num">/01</span>Nome <span class="req">*</span></label>
            <input type="text" class="lm-input" value="${esc(S.form.name||'')}" oninput="S.form.name=this.value;_patchLeadModalAvatar()" placeholder="Nome completo do lead"/>
          </div>

          <div class="lm-field">
            <label class="lm-label"><span class="lm-label-num">/02</span>Telefone <span class="req">*</span></label>
            ${(() => {
                const ctry = getCountry(S.form.phoneCountry || 'BR')
                const isOpen = !!S.leadModalCountryOpen
                const chk = `<svg class="check" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`
                return `
                <div class="lm-tel-wrap${isOpen?' is-country-open':''}">
                  <button type="button" class="lm-tel-prefix lm-tel-prefix-btn" onclick="event.stopPropagation();S.leadModalCountryOpen=${!isOpen};S.leadModalDdOpen=false;render();_setupLeadDdClickOutside()" title="${esc(ctry.name)}">
                    <span class="lm-tel-code">${ctry.code}</span>
                    <span class="lm-tel-dial">+${ctry.dial}</span>
                    <svg class="lm-tel-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <input type="tel" inputmode="tel" maxlength="16" class="lm-input tel" value="${ctry.code === 'BR' ? esc(fmtPhoneLive(S.form.phone)||'') : esc(S.form.phone||'')}" oninput="${ctry.code === 'BR' ? 'this.value=fmtPhoneLive(this.value);' : ''}S.form.phone=this.value" placeholder="${ctry.code === 'BR' ? '(11) 99999-9999' : 'Digite o número'}"/>
                  ${isOpen ? `
                  <div class="lm-dd-menu lds-menu lm-country-menu">
                    <div class="lds-menu-search">
                      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                      <input type="text" placeholder="Buscar país..." oninput="ldsFilterMenu(this)" autocomplete="off"/>
                    </div>
                    ${COUNTRIES.map(c => {
                      const active = c.code === ctry.code
                      const dataName = `${c.name} ${c.dial} ${c.code}`.toLowerCase()
                      return `<button type="button" class="lds-menu-item lm-country-item ${active?'selected':''}" data-name="${esc(dataName)}" onclick="S.form.phoneCountry='${c.code}';S.leadModalCountryOpen=false;render()" title="${esc(c.name)}">
                        <span class="lm-country-code">${c.code}</span>
                        <span class="lm-country-dial">+${c.dial}</span>
                        ${active?chk:''}
                      </button>`
                    }).join('')}
                  </div>` : ''}
                </div>`
              })()}
          </div>

          <div class="lm-field">
            <label class="lm-label"><span class="lm-label-num">/03</span>E-mail</label>
            <input type="email" class="lm-input" value="${esc(S.form.email||'')}" oninput="S.form.email=this.value" onkeydown="if(event.key==='Enter')submitLead()" placeholder="email@exemplo.com (opcional)"/>
          </div>

          <div class="lm-grid-2">
            <div class="lm-field">
              <label class="lm-label"><span class="lm-label-num">/04</span>Origem</label>
              <input type="text" class="lm-input" value="${esc(S.form.origin||'')}" oninput="S.form.origin=this.value" placeholder="anúncio, indicação..."/>
            </div>
            <div class="lm-field">
              <label class="lm-label"><span class="lm-label-num">/05</span>Atribuir a</label>
              ${(() => {
                const value = S.form.assignedToId || ''
                const usersList = S.users || []
                const selUser = value ? usersList.find(u => u.id === value) : null
                const isOpen = !!S.leadModalDdOpen
                const chk = `<svg class="check" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`
                let triggerInner = ''
                if (selUser) {
                  const hue = Math.abs(selUser.name.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
                  const initial = selUser.name.charAt(0).toUpperCase()
                  triggerInner = `
                    <span class="lds-op-av" style="background:hsl(${hue},55%,88%);color:hsl(${hue},55%,35%);width:20px;height:20px;font-size:9px">${esc(initial)}</span>
                    <span class="lm-dd-val">${esc(selUser.name)}</span>`
                } else {
                  triggerInner = `
                    <span class="lds-op-av empty" style="width:20px;height:20px;font-size:9px">?</span>
                    <span class="lm-dd-val muted">— Sem atribuição</span>`
                }
                return `
                <div class="lm-dd${isOpen?' is-open':''}">
                  <button type="button" class="lm-dd-trigger lm-dd-trigger-rich" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();S.leadModalDdOpen=${!isOpen};render();_setupLeadDdClickOutside()">
                    ${triggerInner}
                    <svg class="lm-dd-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  ${isOpen ? `
                  <div class="lm-dd-menu lds-menu" style="z-index:99999;min-height:200px;max-height:60vh">
                    <div class="lds-menu-search">
                      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                      <input type="text" placeholder="Buscar operador..." oninput="ldsFilterMenu(this)" autocomplete="off"/>
                    </div>
                    <button type="button" class="lds-menu-item ${!value?'selected':''}" data-name="sem operador" onclick="S.form.assignedToId='';S.leadModalDdOpen=false;_positionLeadDdMenu();render()">
                      <span class="lds-op-av empty" style="width:20px;height:20px;font-size:9px">?</span>
                      <span style="color:var(--text-muted);font-style:italic">— Sem atribuição</span>
                      ${!value?chk:''}
                    </button>
                    <div class="lds-menu-divider"></div>
                    ${usersList.filter(u => u.isActive !== false).map(u => {
                      const active = u.id === value
                      const hue = Math.abs(u.name.split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
                      const initial = u.name.charAt(0).toUpperCase()
                      const dataName = (u.name || '').toLowerCase().replace(/"/g,'&quot;')
                      return `<button type="button" class="lds-menu-item ${active?'selected':''}" data-name="${dataName}" onclick="S.form.assignedToId='${u.id}';S.leadModalDdOpen=false;_positionLeadDdMenu();render()">
                        <span class="lds-op-av" style="background:hsl(${hue},55%,88%);color:hsl(${hue},55%,35%);width:20px;height:20px;font-size:9px">${esc(initial)}</span>
                        <span>${esc(u.name)}</span>
                        ${active?chk:''}
                      </button>`
                    }).join('')}
                  </div>` : ''}
                </div>`
              })()}
            </div>
          </div>

          <div class="lm-field">
            <label class="lm-label"><span class="lm-label-num">/06</span>Observação</label>
            <textarea class="lm-textarea" oninput="S.form.notes=this.value" rows="2" placeholder="Algo importante sobre esse lead">${esc(S.form.notes||'')}</textarea>
          </div>
        </div>

        <div class="lm-actions">
          <button onclick="closeModal()" class="lm-btn lm-btn-cancel" ${S.formLoading?'disabled':''}>Cancelar</button>
          <button onclick="submitLead()" class="lm-btn lm-btn-save" ${S.formLoading?'disabled':''}>
            ${S.formLoading
              ? `<span class="spin"></span><span>${isEdit?'Salvando…':'Cadastrando…'}</span>`
              : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${isEdit?'M5 13l4 4L19 7':'M12 4v16m8-8H4'}"/></svg><span>${isEdit?'Salvar':'Cadastrar'}</span>`}
          </button>
        </div>
      </div>`
  }

  if (S.modal==='import_pick') {
    content=`
      <h2 class="text-lg font-bold text-gray-900 mb-2">Importar CSV</h2>
      <p class="text-sm text-gray-500 mb-4"><strong>${S.importItems?.length||0} lead(s)</strong> encontrados. Selecione para qual colaborador serão atribuídos.</p>
      ${S.formError?`<p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">${esc(S.formError)}</p>`:''}
      <div><label class="block text-xs font-semibold text-gray-600 mb-1">Atribuir a</label>
        ${renderCDD({id:'cdd-import-assign',value:S.form.assignedToId||'',options:[{value:'',label:'— Sem atribuição (só admin vê)'},...S.users.map(u=>({value:u.id,label:u.name}))],onchange:"S.form.assignedToId=this.value",style:'width:100%'})}</div>
      <div class="flex gap-2 mt-5">
        <button onclick="closeModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button onclick="doImport()" ${S.importLoading?'disabled':''} class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium">
          ${S.importLoading?'Importando...':'Importar'}
        </button>
      </div>`
  }

  if (S.modal==='user') {
    const isEdit=!!S.editId
    const initials = (S.form.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
    const hue = Math.abs((S.form.name||'').split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)) % 360
    content=`
      <style>
        .perm-toggle { position:relative; display:inline-flex; width:36px; height:20px; flex-shrink:0; cursor:pointer }
        .perm-toggle input { opacity:0; width:0; height:0; position:absolute }
        .perm-track { position:absolute; inset:0; border-radius:999px; background:#e5e7eb; transition:background 0.2s }
        .perm-thumb { position:absolute; left:3px; top:3px; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.2); transition:transform 0.2s }
        .perm-toggle input:checked ~ .perm-track { background:#6366f1 }
        .perm-toggle input:checked ~ .perm-track .perm-thumb { transform:translateX(16px) }
        .perm-toggle-danger input:checked ~ .perm-track { background:#ef4444 }
        .perm-row { display:flex; align-items:center; gap:12px; padding:11px 14px; cursor:pointer; transition:background 0.12s; border-radius:8px }
        .perm-row:hover { background:rgba(99,102,241,0.04) }
        .perm-row-danger:hover { background:rgba(239,68,68,0.05) }
        .perm-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0 }
      
    </style>

      <!-- Header do modal -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div style="width:40px;height:40px;border-radius:10px;background:hsl(${hue},55%,88%);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:hsl(${hue},55%,35%);flex-shrink:0">${initials}</div>
        <div>
          <h2 style="font-size:15px;font-weight:800;color:#111827;margin:0;line-height:1.2">${isEdit?'Editar colaborador':'Novo colaborador'}</h2>
          <p style="font-size:11.5px;color:#9ca3af;margin:2px 0 0">${isEdit?'Altere os dados ou permissões do acesso':'Preencha os dados e defina as permissões'}</p>
        </div>
      </div>

      ${S.formError?`<p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">${esc(S.formError)}</p>`:''}

      <!-- Dados do colaborador -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="display:block;font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px">Nome *</label>
            <input type="text" value="${esc(S.form.name||'')}" oninput="S.form.name=this.value" placeholder="Nome completo"
              style="width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:13px;background:#fff;outline:none;box-sizing:border-box;font-family:inherit;color:#111827" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e5e7eb'"/>
          </div>
          <div>
            <label style="display:block;font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px">E-mail *</label>
            <input type="email" value="${esc(S.form.email||'')}" oninput="S.form.email=this.value" placeholder="email@exemplo.com"
              style="width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:13px;background:#fff;outline:none;box-sizing:border-box;font-family:inherit;color:#111827" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e5e7eb'"/>
          </div>
        </div>
        <div>
          <label style="display:block;font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px">${isEdit?'Nova senha (opcional)':'Senha *'}</label>
          <input type="password" value="" oninput="S.form.password=this.value" placeholder="${isEdit?'Deixe em branco para não alterar':'Mínimo 6 caracteres'}"
            style="width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:13px;background:#fff;outline:none;box-sizing:border-box;font-family:inherit;color:#111827" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e5e7eb'"/>
        </div>
        ${isEdit?`
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0">
          <input type="checkbox" id="cb-active" ${S.form.isActive?'checked':''} onchange="S.form.isActive=this.checked" style="width:15px;height:15px;accent-color:#6366f1;cursor:pointer"/>
          <span style="font-size:13px;color:#374151;font-weight:500">Conta ativa</span>
          <span style="font-size:11px;color:#9ca3af;margin-left:2px">${S.form.isActive?'O colaborador pode fazer login':'Acesso bloqueado'}</span>
        </label>`:''}
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0 2px">
          <span style="font-size:13px;color:#374151;font-weight:500;flex:1">Nível de acesso</span>
          <div style="display:flex;border:1.5px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#f9fafb">
            <button type="button" onclick="S.form.role='COLLABORATOR';render()" style="padding:5px 12px;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:inherit;transition:all 0.15s;${S.form.role!=='ADMIN'?'background:#6366f1;color:#fff;':'background:transparent;color:#6b7280;'}">Colaborador</button>
            <button type="button" onclick="S.form.role='ADMIN';render()" style="padding:5px 12px;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:inherit;transition:all 0.15s;${S.form.role==='ADMIN'?'background:#6366f1;color:#fff;':'background:transparent;color:#6b7280;'}">Admin</button>
          </div>
        </div>
      </div>

      <!-- Permissões -->
      <div>
        ${S.form.role === 'ADMIN' ? `
          <!-- Admin: banner explicando acesso total (toggles não fazem sentido) -->
          <div style="position:relative;border-radius:14px;padding:20px;margin-bottom:10px;background:linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%);border:1px solid #c7d2fe;overflow:hidden">
            <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,0.18) 0%,transparent 70%);pointer-events:none"></div>
            <div style="position:relative;z-index:1;display:flex;align-items:flex-start;gap:14px">
              <div style="width:44px;height:44px;border-radius:11px;background:linear-gradient(135deg,#6366f1,#4f46e5);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 10px rgba(99,102,241,0.3)">
                <svg width="22" height="22" fill="none" stroke="#fff" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </div>
              <div style="flex:1;min-width:0">
                <p style="font-family:'Bricolage Grotesque',inherit;font-size:15px;font-weight:700;letter-spacing:-0.02em;color:#312e81;margin:0 0 4px 0;line-height:1.2">Acesso total ao sistema</p>
                <p style="font-size:12.5px;color:#4338ca;line-height:1.55;margin:0">
                  Como administrador, ${esc(S.form.name||'este colaborador')} tem permissão completa em <strong>todos os módulos</strong>: visualização e gestão de todos os leads, exportação, configurações de conexões, equipe, agentes IA, relatórios e demais áreas.
                </p>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">
                  ${['Todos os leads','Gerenciar','Exportar','Conexões','Equipe','Agentes IA','Configurações'].map(t => `
                    <span style="font-size:10.5px;font-weight:600;color:#4338ca;background:rgba(99,102,241,0.1);padding:3px 9px;border-radius:999px;display:inline-flex;align-items:center;gap:4px">
                      <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                      ${t}
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        ` : `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Permissões de acesso</span>
          <div style="flex:1;height:1px;background:#e5e7eb"></div>
        </div>

        <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:10px">

          <!-- Ver todos os leads -->
          <label class="perm-row" style="border-bottom:1px solid #f3f4f6" onclick="">
            <div class="perm-icon" style="background:#eff6ff">
              <svg width="15" height="15" fill="none" stroke="#3b82f6" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </div>
            <div style="flex:1;min-width:0">
              <p style="font-size:13px;font-weight:600;color:#111827;margin:0;line-height:1.3">Ver todos os leads</p>
              <p style="font-size:11.5px;color:#9ca3af;margin:2px 0 0">Visualiza e responde leads atribuídos a outros colaboradores</p>
            </div>
            <label class="perm-toggle">
              <input type="checkbox" ${S.form.viewAllLeads?'checked':''} onchange="S.form.viewAllLeads=this.checked"/>
              <span class="perm-track"><span class="perm-thumb"></span></span>
            </label>
          </label>

          <!-- Gerenciar leads -->
          <label class="perm-row" style="border-bottom:1px solid #f3f4f6" onclick="">
            <div class="perm-icon" style="background:#f5f3ff">
              <svg width="15" height="15" fill="none" stroke="#6366f1" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </div>
            <div style="flex:1;min-width:0">
              <p style="font-size:13px;font-weight:600;color:#111827;margin:0;line-height:1.3">Gerenciar leads</p>
              <p style="font-size:11.5px;color:#9ca3af;margin:2px 0 0">Cria, edita e move leads entre etapas do kanban</p>
            </div>
            <label class="perm-toggle">
              <input type="checkbox" ${S.form.manageLeads?'checked':''} onchange="S.form.manageLeads=this.checked"/>
              <span class="perm-track"><span class="perm-thumb"></span></span>
            </label>
          </label>

          <!-- Exportar relatórios -->
          <label class="perm-row" style="border-bottom:1px solid #f3f4f6" onclick="">
            <div class="perm-icon" style="background:#f0fdf4">
              <svg width="15" height="15" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div style="flex:1;min-width:0">
              <p style="font-size:13px;font-weight:600;color:#111827;margin:0;line-height:1.3">Exportar relatórios</p>
              <p style="font-size:11.5px;color:#9ca3af;margin:2px 0 0">Exporta a lista de leads e relatórios em CSV</p>
            </div>
            <label class="perm-toggle">
              <input type="checkbox" ${S.form.exportLeads?'checked':''} onchange="S.form.exportLeads=this.checked"/>
              <span class="perm-track"><span class="perm-thumb"></span></span>
            </label>
          </label>

          <!-- Gerenciar conexões -->
          <label class="perm-row" onclick="">
            <div class="perm-icon" style="background:#fef3c7">
              <svg width="15" height="15" fill="none" stroke="#d97706" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            </div>
            <div style="flex:1;min-width:0">
              <p style="font-size:13px;font-weight:600;color:#111827;margin:0;line-height:1.3">Gerenciar conexões</p>
              <p style="font-size:11.5px;color:#9ca3af;margin:2px 0 0">Cria, edita, pausa e sincroniza templates de WhatsApp (não deleta)</p>
            </div>
            <label class="perm-toggle">
              <input type="checkbox" ${S.form.manageConnections?'checked':''} onchange="S.form.manageConnections=this.checked"/>
              <span class="perm-track"><span class="perm-thumb"></span></span>
            </label>
          </label>

        </div>

        <!-- Conexões permitidas -->
        <div style="margin-top:14px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="font-size:10.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Conexões WhatsApp</span>
            <div style="flex:1;height:1px;background:#e5e7eb"></div>
          </div>
          <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:10px">
            <label class="perm-row" style="border-bottom:${S.form.restrictConnections?'1px solid #f3f4f6':'none'}" onclick="">
              <div class="perm-icon" style="background:#f0fdf4">
                <svg width="15" height="15" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              </div>
              <div style="flex:1;min-width:0">
                <p style="font-size:13px;font-weight:600;color:#111827;margin:0;line-height:1.3">Restringir conexões</p>
                <p style="font-size:11.5px;color:#9ca3af;margin:2px 0 0">${S.form.restrictConnections?'Apenas as conexões marcadas abaixo':'Acesso a todas as conexões ativas'}</p>
              </div>
              <label class="perm-toggle">
                <input type="checkbox" ${S.form.restrictConnections?'checked':''} onchange="S.form.restrictConnections=this.checked;if(!this.checked)S.form.allowedConnections=null;else S.form.allowedConnections=S.form.allowedConnections||[];render()"/>
                <span class="perm-track"><span class="perm-thumb"></span></span>
              </label>
            </label>
            ${S.form.restrictConnections ? (() => {
              const allConns = [...(S.connections||[]).filter(c=>c.status==='ACTIVE').map(c=>({id:c.id,name:c.name,tag:'Oficial'})), ...(S.unofficialSessions||[]).filter(s=>s.sessionStatus==='connected' && !String(s.id||'').startsWith('avatar-fetcher')).map(s=>({id:s.id,name:s.name||(s.phone_number?`+${s.phone_number}`:s.id),tag:'WhatsApp Web'}))];
              if (!allConns.length) return '<p style="font-size:12px;color:#9ca3af;text-align:center;padding:12px">Nenhuma conexão ativa</p>';
              return allConns.map((c,i) => {
                const checked = (S.form.allowedConnections||[]).includes(c.id);
                const border = i < allConns.length-1 ? 'border-bottom:1px solid #f3f4f6;' : '';
                return `<label class="perm-row" style="${border}" onclick="">
                  <div style="width:8px;height:8px;border-radius:50%;background:#10b981;flex-shrink:0;margin-left:4px"></div>
                  <div style="flex:1;min-width:0;margin-left:8px">
                    <p style="font-size:13px;font-weight:500;color:#111827;margin:0">${esc(c.name||c.id)} <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:999px;background:${c.tag==='WhatsApp Web'?'#dcfce7':'#eff6ff'};color:${c.tag==='WhatsApp Web'?'#15803d':'#1d4ed8'}">${c.tag}</span></p>
                  </div>
                  <input type="checkbox" ${checked?'checked':''} onchange="
                    const arr=S.form.allowedConnections||[];
                    if(this.checked){if(!arr.includes('${c.id}'))arr.push('${c.id}');}else{const idx=arr.indexOf('${c.id}');if(idx>-1)arr.splice(idx,1);}
                    S.form.allowedConnections=[...arr];render()"
                    style="width:15px;height:15px;accent-color:#6366f1;cursor:pointer;flex-shrink:0"/>
                </label>`;
              }).join('');
            })() : ''}
          </div>
        </div>
        `}

        <!-- Zona de risco (visível pra admin e colaborador — apagar é destrutivo) -->
        <div style="border:1.5px solid #fecaca;border-radius:10px;overflow:hidden;background:#fffafa">
          <div style="padding:8px 14px;background:#fff1f2;border-bottom:1px solid #fecaca;display:flex;align-items:center;gap:6px">
            <svg width="12" height="12" fill="none" stroke="#dc2626" stroke-width="2.5" viewBox="0 0 24 24" style="flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            <span style="font-size:10.5px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.06em">Zona de risco</span>
            <span style="font-size:10.5px;color:#f87171;margin-left:2px">— ações irreversíveis</span>
          </div>
          <label class="perm-row perm-row-danger" onclick="">
            <div class="perm-icon" style="background:#fee2e2">
              <svg width="15" height="15" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <div style="flex:1;min-width:0">
              <p style="font-size:13px;font-weight:600;color:#b91c1c;margin:0;line-height:1.3">Apagar leads e conversas</p>
              <p style="font-size:11.5px;color:#f87171;margin:2px 0 0">Exclui leads permanentemente e apaga histórico de conversas</p>
            </div>
            <label class="perm-toggle perm-toggle-danger">
              <input type="checkbox" ${S.form.canDelete!==false?'checked':''} onchange="S.form.canDelete=this.checked"/>
              <span class="perm-track"><span class="perm-thumb"></span></span>
            </label>
          </label>
        </div>

      </div>

      <!-- Ações -->
      <style>
        @keyframes userBtnSpin { to { transform: rotate(360deg) } }
        @keyframes userBtnShimmer {
          0%, 100% { background-position: 0% 50% }
          50% { background-position: 100% 50% }
        }
        .user-modal-save-btn {
          flex:1; padding:11px 16px; border:none; border-radius:9px;
          font-size:13px; font-weight:700; color:#fff; cursor:pointer;
          font-family:inherit;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #6366f1 100%);
          background-size: 200% 100%;
          background-position: 0% 50%;
          box-shadow: 0 2px 8px rgba(99,102,241,0.3), 0 0 0 0 rgba(99,102,241,0);
          transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1),
                      box-shadow 0.18s cubic-bezier(0.4, 0, 0.2, 1),
                      background-position 0.4s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .user-modal-save-btn:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.015);
          box-shadow: 0 4px 14px rgba(99,102,241,0.45), 0 0 0 4px rgba(99,102,241,0.08);
          background-position: 100% 50%;
        }
        .user-modal-save-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
          box-shadow: 0 1px 4px rgba(99,102,241,0.4);
          transition-duration: 0.05s;
        }
        .user-modal-save-btn:disabled {
          cursor: not-allowed;
          background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
          opacity: 0.85;
          animation: userBtnShimmer 1.6s ease-in-out infinite;
          background-size: 200% 100%;
        }
        .user-modal-save-btn .spin {
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: userBtnSpin 0.7s linear infinite;
          flex-shrink: 0;
        }
        .user-modal-save-btn .check {
          width: 15px; height: 15px;
          flex-shrink: 0;
          opacity: 0;
          transform: scale(0.6);
          transition: opacity 0.18s, transform 0.18s;
        }
        .user-modal-save-btn:hover:not(:disabled) .check { opacity: 1; transform: scale(1); }
        .user-modal-cancel-btn {
          flex:1; padding:11px 16px; border:1.5px solid #e5e7eb; border-radius:9px;
          font-size:13px; font-weight:600; color:#6b7280; background:#fff;
          cursor:pointer; font-family:inherit;
          transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s;
        }
        .user-modal-cancel-btn:hover { background:#f9fafb; border-color:#d1d5db; color:#374151; }
        .user-modal-cancel-btn:active { transform: scale(0.98); }
      </style>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button onclick="closeModal()" class="user-modal-cancel-btn" ${S.userFormSaving?'disabled':''}>Cancelar</button>
        <button onclick="submitUser()" class="user-modal-save-btn" ${S.userFormSaving?'disabled':''}>
          ${S.userFormSaving
            ? `<span class="spin"></span><span>Salvando…</span>`
            : `<svg class="check" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg><span>${isEdit?'Salvar alterações':'Criar colaborador'}</span>`}
        </button>
      </div>`
  }

  if (S.modal==='bulk_assign') {
    content=`
      <h2 class="text-lg font-bold text-gray-900 mb-1">Atribuir leads selecionados</h2>
      <p class="text-sm text-gray-500 mb-4"><strong>${S.selected.size}</strong> lead(s) serão atribuídos ao colaborador selecionado.</p>
      ${S.formError?`<p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">${esc(S.formError)}</p>`:''}
      <div><label class="block text-xs font-semibold text-gray-600 mb-1">Atribuir a</label>
        <select onchange="S.form.assignedToId=this.value" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="" ${!S.form.assignedToId?'selected':''}>— Remover atribuição</option>
          ${S.users.filter(u=>u.isActive).map(u=>`<option value="${u.id}" ${S.form.assignedToId===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}
        </select></div>
      <div class="flex gap-2 mt-5">
        <button onclick="closeModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button onclick="submitBulkAssign()" class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">Atribuir</button>
      </div>`
  }

  if (S.modal==='redistribute') {
    const filtered = filteredLeads()
    const filteredCount = filtered.length
    const unassigned = S.leads.filter(l=>!l.assignedToId).length
    const total = S.leads.length
    const cnt = S.form.scope==='unassigned' ? unassigned : (S.form.scope==='filtered' ? filteredCount : total)
    const nUsers = S.form.userIds?.length || 0
    const activeUsers = S.users.filter(u=>u.isActive)

    const scopeCard = (value, icon, label, count) => {
      const active = S.form.scope === value
      return `<button onclick="S.form.scope='${value}';render()" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border-radius:12px;border:2px solid ${active?'#6366f1':'#e5e7eb'};background:${active?'#eef2ff':'#fafafa'};cursor:pointer;font-family:inherit;transition:all 0.15s;min-width:0" onmouseover="if(this.style.borderColor!=='rgb(99, 102, 241)')this.style.background='#f3f4f6'" onmouseout="if(this.style.borderColor!=='rgb(99, 102, 241)')this.style.background='#fafafa'">
        <span style="font-size:18px">${icon}</span>
        <span style="font-size:11px;font-weight:700;color:${active?'#4338ca':'#374151'};text-align:center;line-height:1.3">${label}</span>
        <span style="font-size:13px;font-weight:800;color:${active?'#6366f1':'#6b7280'}">${count.toLocaleString('pt-BR')}</span>
      </button>`
    }

    const userInitials = name => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
    const userColors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']

    if (S.form.redistributeResult) {
      const res = S.form.redistributeResult
      const maxCnt = Math.max(...Object.values(res.perUserRaw || {}), 1)
      const bars = Object.entries(res.perUserRaw || {}).map(([uid, cnt], i) => {
        const u = S.users.find(x=>x.id===uid)
        const name = u?.name || uid
        const pct = Math.round(cnt / maxCnt * 100)
        const color = userColors[i % userColors.length]
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0">${userInitials(name)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:12px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${esc(name)}</span>
              <span style="font-size:12px;font-weight:700;color:${color};flex-shrink:0;margin-left:8px">${cnt.toLocaleString('pt-BR')}</span>
            </div>
            <div style="height:5px;background:#e5e7eb;border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width 0.6s cubic-bezier(0.34,1.56,0.64,1)"></div>
            </div>
          </div>
        </div>`
      }).join('')

      content = `
        <div style="text-align:center;padding:8px 0 20px">
          <div style="width:56px;height:56px;background:linear-gradient(135deg,#d1fae5,#a7f3d0);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
            <svg style="width:26px;height:26px;color:#059669" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <p style="font-size:22px;font-weight:800;color:#111827;margin:0 0 4px">${res.distributed.toLocaleString('pt-BR')}</p>
          <p style="font-size:13px;color:#6b7280;margin:0">leads distribuídos com sucesso</p>
        </div>
        <div style="background:#f9fafb;border-radius:12px;padding:14px 16px;margin-bottom:20px">
          ${bars}
        </div>
        <button onclick="closeModal()" style="width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(99,102,241,0.35);transition:opacity 0.15s" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">Concluído</button>
      `
    } else {
      content = `
        <div style="margin:-20px -20px 20px;padding:20px;background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:16px 16px 0 0">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <div style="width:34px;height:34px;background:rgba(255,255,255,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg style="width:18px;height:18px;color:white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
            </div>
            <div>
              <h2 style="font-size:16px;font-weight:800;color:white;margin:0;letter-spacing:-0.3px">Distribuir leads</h2>
              <p style="font-size:11.5px;color:rgba(255,255,255,0.6);margin:0">Round-robin entre colaboradores</p>
            </div>
          </div>
        </div>

        ${S.formError ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12.5px;color:#dc2626">${esc(S.formError)}</div>` : ''}

        <div style="margin-bottom:18px">
          <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px">Quais leads distribuir?</p>
          <div style="display:flex;gap:8px">
            ${scopeCard('filtered','🔍','Filtrados',filteredCount)}
            ${scopeCard('unassigned','⬜','Sem atribuição',unassigned)}
            ${scopeCard('all','📋','Todos',total)}
          </div>
        </div>

        <div style="margin-bottom:18px">
          <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px">Distribuir para</p>
          <div style="display:flex;flex-wrap:wrap;gap:7px">
            ${activeUsers.map((u,i) => {
              const on = S.form.userIds?.includes(u.id)
              const color = userColors[i % userColors.length]
              return `<button onclick="toggleRedistUser('${u.id}')" style="display:flex;align-items:center;gap:7px;padding:6px 12px 6px 6px;border-radius:99px;border:2px solid ${on?color:'#e5e7eb'};background:${on?color+'18':'#fafafa'};cursor:pointer;font-family:inherit;transition:all 0.15s">
                <div style="width:24px;height:24px;border-radius:50%;background:${on?color:'#d1d5db'};display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;color:white;flex-shrink:0">${userInitials(u.name)}</div>
                <span style="font-size:12.5px;font-weight:${on?'700':'500'};color:${on?color:'#6b7280'};white-space:nowrap">${esc(u.name)}</span>
                ${on ? `<svg style="width:12px;height:12px;color:${color};flex-shrink:0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>` : ''}
              </button>`
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom:16px">
          <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">Limite máximo <span style="font-weight:400;text-transform:none;letter-spacing:0">(opcional)</span></p>
          <div style="position:relative">
            <input type="number" min="1" value="${S.form.limit || ''}" oninput="S.form.limit=this.value;_patchRedistPreview()"
              placeholder="Sem limite — distribui todos"
              style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:13.5px;font-family:inherit;color:#111827;outline:none;box-sizing:border-box;transition:border-color 0.15s;background:#fafafa"
              onfocus="this.style.borderColor='#6366f1';this.style.background='#fff'" onfocusout="this.style.borderColor='#e5e7eb';this.style.background='#fafafa'"/>
          </div>
        </div>

        <div id="redist-preview">${_redistPreviewHtml(cnt, nUsers)}</div>

        <div style="display:flex;gap:8px;margin-top:18px">
          <button onclick="closeModal()" ${S.form.redistributing?'disabled':''} style="padding:11px 20px;border:2px solid #e5e7eb;border-radius:10px;font-size:13.5px;font-weight:600;color:#6b7280;background:#fff;cursor:pointer;font-family:inherit;transition:all 0.15s" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">Cancelar</button>
          <button onclick="submitRedistribute()" ${S.form.redistributing||nUsers===0?'disabled':''} style="flex:1;padding:11px 20px;border:none;border-radius:10px;font-size:13.5px;font-weight:700;color:white;background:${nUsers===0?'#e5e7eb':'linear-gradient(135deg,#6366f1,#4f46e5)'};cursor:${nUsers===0?'not-allowed':'pointer'};font-family:inherit;box-shadow:${nUsers>0?'0 4px 12px rgba(99,102,241,0.35)':'none'};transition:all 0.15s;display:flex;align-items:center;justify-content:center;gap:8px" onmouseover="if(!this.disabled)this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            ${S.form.redistributing
              ? `<svg style="width:15px;height:15px;animation:spin 0.7s linear infinite" fill="none" viewBox="0 0 24 24"><circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Distribuindo...`
              : `<svg style="width:15px;height:15px" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg> Distribuir`}
          </button>
        </div>
      `
    }
  }

  if (S.modal==='delete_conversation') {
    const lead = S.leads.find(l=>l.id===S.deleteConvTarget)
    content=`
      <div class="text-center">
        <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </div>
        <h2 class="text-lg font-bold text-gray-900 mb-1">Apagar conversa?</h2>
        <p class="text-sm text-gray-500 mb-4">Todo o histórico de mensagens de <strong>${esc(lead?.name||'')}</strong> será apagado permanentemente.</p>
        <label class="flex items-center gap-2.5 text-sm text-gray-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mb-2 cursor-pointer select-none">
          <input type="checkbox" ${S.deleteConvContact?'checked':''} onchange="S.deleteConvContact=this.checked;render()" class="w-4 h-4 rounded accent-red-600"/>
          <span>Apagar o lead também</span>
        </label>
        <label class="flex items-center gap-2.5 text-sm text-gray-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mb-4 cursor-pointer select-none">
          <input type="checkbox" ${S.deleteConvBlacklist?'checked':''} onchange="S.deleteConvBlacklist=this.checked;render()" class="w-4 h-4 rounded accent-red-600"/>
          <span>Adicionar à blacklist</span>
        </label>
        <div class="flex gap-2">
          <button onclick="closeModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button onclick="deleteConversation()" class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Apagar</button>
        </div>
      </div>`
  }

  if (S.modal==='delete_lead'||S.modal==='delete_user') {
    const isLead=S.modal==='delete_lead'
    const target=isLead?S.leads.find(l=>l.id===S.deleteTarget):S.users.find(u=>u.id===S.deleteTarget)
    content=`
      <div class="text-center">
        <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        </div>
        <h2 class="text-lg font-bold text-gray-900 mb-1">Excluir ${isLead?'lead':'colaborador'}?</h2>
        <p class="text-sm text-gray-500 mb-4">Tem certeza que deseja excluir <strong>${esc(target?.name||'')}</strong>?${!isLead?' Os leads atribuídos a ele serão desatribuídos.':''}</p>
        ${isLead ? `
        <label class="flex items-center gap-2.5 text-sm text-gray-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mb-2 cursor-pointer select-none">
          <input type="checkbox" ${S.deleteConversation?'checked':''} onchange="S.deleteConversation=this.checked;render()" class="w-4 h-4 rounded accent-red-600"/>
          <span>Apagar também o histórico de conversa</span>
        </label>
        <label class="flex items-center gap-2.5 text-sm text-gray-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mb-4 cursor-pointer select-none">
          <input type="checkbox" ${S.deleteLeadBlacklist?'checked':''} onchange="S.deleteLeadBlacklist=this.checked;render()" class="w-4 h-4 rounded accent-red-600"/>
          <span>Adicionar à blacklist</span>
        </label>` : ''}
        <div class="flex gap-2">
          <button onclick="closeModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button onclick="${isLead?'deleteLead()':'deleteUser()'}" class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Excluir</button>
        </div>
      </div>`
  }

  return `
    <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
      <div class="card" style="width:100%;max-width:440px;padding:20px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.18);max-height:88vh;overflow-y:auto">
        <button type="button" onclick="event.stopPropagation();closeModal()" style="position:absolute;top:14px;right:14px;z-index:10;padding:6px;color:#9ca3af;background:transparent;border:none;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='transparent'">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="pointer-events:none"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        ${content}
      </div>
    </div>`
}
