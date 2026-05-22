// integrations.js — Extraído de index.html (Fase 1 modularização)
//
// Funções movidas pra cá pra reduzir tamanho do index.html.
// Continua usando escopo global (classic script, NÃO module).
// Todas as funções abaixo permanecem disponíveis como `window.X`.
//
// Gerado por: tools/extract_module.js
// Não editar manualmente — re-gerar via script se precisar.

async function loadIntegrations() {
  try {
    const [keys, webhooks, events] = await Promise.all([
      apiInt('/keys').catch(() => []),
      apiInt('/webhooks').catch(() => []),
      apiInt('/events').catch(() => [])
    ])
    S.apiKeys          = keys || []
    S.outboundWebhooks = webhooks || []
    S.allowedEvents    = events || []
    S.integrationsLoaded = true
    render()
  } catch (e) { showToast(e.message, 'error') }
}

async function createApiKey() {
  const name = (S.newKeyName || '').trim()
  if (!name) { showToast('Informe um nome', 'error'); return }
  try {
    const created = await apiInt('/keys', { method: 'POST', body: JSON.stringify({ name }) })
    S.newKeyRevealed = created  // keeps the raw key for display
    S.newKeyName = ''
    S.apiKeys = [created, ...S.apiKeys]
    render()
    showToast('Key criada — copie agora, ela não será mostrada de novo', 'success')
  } catch (e) { showToast(e.message, 'error') }
}

async function revokeApiKey(id) {
  if (!confirm('Revogar esta API key? Integrações usando-a pararão imediatamente.')) return
  try {
    await apiInt(`/keys/${id}/revoke`, { method: 'POST' })
    S.apiKeys = S.apiKeys.map(k => k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k)
    showToast('Key revogada', 'success')
    render()
  } catch (e) { showToast(e.message, 'error') }
}

async function deleteApiKey(id) {
  if (!confirm('Apagar permanentemente esta key? Esta ação não pode ser desfeita.')) return
  try {
    await apiInt(`/keys/${id}`, { method: 'DELETE' })
    S.apiKeys = S.apiKeys.filter(k => k.id !== id)
    showToast('Key apagada', 'success')
    render()
  } catch (e) { showToast(e.message, 'error') }
}

function openWebhookForm(existing) {
  S.newWebhookForm = existing ? { ...existing, events: existing.events || [] } : {
    name: '', url: '', events: [], secret: '', enabled: true
  }
  render()
}

async function submitWebhookForm() {
  const f = S.newWebhookForm
  if (!f?.name?.trim() || !f?.url?.trim() || !f.events?.length) {
    showToast('Preencha nome, URL e pelo menos 1 evento', 'error'); return
  }
  try { new URL(f.url) } catch { showToast('URL inválida', 'error'); return }
  try {
    if (f.id) {
      const updated = await apiInt(`/webhooks/${f.id}`, { method: 'PATCH', body: JSON.stringify(f) })
      S.outboundWebhooks = S.outboundWebhooks.map(w => w.id === f.id ? { ...w, ...updated } : w)
      showToast('Webhook atualizado', 'success')
    } else {
      const created = await apiInt('/webhooks', { method: 'POST', body: JSON.stringify(f) })
      S.outboundWebhooks = [created, ...S.outboundWebhooks]
      showToast('Webhook criado', 'success')
    }
    S.newWebhookForm = null
    render()
  } catch (e) { showToast(e.message, 'error') }
}

async function testWebhook(id) {
  try {
    await apiInt(`/webhooks/${id}/test`, { method: 'POST' })
    showToast('Test ping disparado — verifique a aba "Entregas"', 'success')
  } catch (e) { showToast(e.message, 'error') }
}

async function toggleWebhookEnabled(w) {
  try {
    const updated = await apiInt(`/webhooks/${w.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !w.enabled }) })
    S.outboundWebhooks = S.outboundWebhooks.map(x => x.id === w.id ? { ...x, ...updated } : x)
    render()
  } catch (e) { showToast(e.message, 'error') }
}

async function deleteWebhook(id) {
  if (!confirm('Remover este webhook?')) return
  try {
    await apiInt(`/webhooks/${id}`, { method: 'DELETE' })
    S.outboundWebhooks = S.outboundWebhooks.filter(w => w.id !== id)
    showToast('Webhook removido', 'success')
    render()
  } catch (e) { showToast(e.message, 'error') }
}

async function showDeliveries(webhookId) {
  try {
    const list = await apiInt(`/webhooks/${webhookId}/deliveries?limit=30`)
    S.webhookDeliveries = { ...(S.webhookDeliveries || {}), [webhookId]: list }
    render()
  } catch (e) { showToast(e.message, 'error') }
}

function renderIntegrationsPanel() {
  if (!S.integrationsLoaded) { loadIntegrations(); return `<div style="padding:24px;color:var(--text-muted);font-size:13px">Carregando...</div>` }
  if (!S.avatarSessionLoaded && !S.avatarSessionLoading) loadAvatarSession()

  const keys = S.apiKeys || []
  const webhooks = S.outboundWebhooks || []
  const activeKeys = keys.filter(k => !k.revoked_at).length
  const activeWebhooks = webhooks.filter(w => w.enabled !== false).length
  const allowedEvents = (S.allowedEvents && S.allowedEvents.length) ? S.allowedEvents : [
    '*','lead.created','lead.updated','lead.deleted','lead.stage_changed','lead.assigned',
    'message.received','message.sent','financial.recorded','financial.deleted','test.ping'
  ]
  const esc2 = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
  const fmtDate = s => s ? new Date(s).toLocaleString('pt-BR') : '—'
  const TRASH_SVG = `<svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L4 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`

  return `
  <div class="cfg-page-head">
    <div class="cfg-page-head-titles">
      <div class="cfg-page-eyebrow"><span class="dot"></span>Workspace · Conectividade</div>
      <h1>API & Integrações</h1>
      <p>Gerencie API Keys e webhooks de saída pra integrar com n8n, Zapier, Make, Slack ou qualquer sistema. Conecte também a sessão de busca de fotos de perfil dos leads.</p>
    </div>
    <div class="cfg-page-head-cta">
      <a href="/api-docs" target="_blank" class="cfg-btn cfg-btn-secondary" style="text-decoration:none">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Documentação
      </a>
    </div>
  </div>

    <!-- API KEYS ─────────────────────────────────────────────────────────── -->
    <section class="cfg-card">
      <div class="cfg-card-head">
        <div class="cfg-card-title-block">
          <h3 class="cfg-card-title">API Keys</h3>
          <p class="cfg-card-sub">${keys.length} cadastrada${keys.length===1?'':'s'} · use no header <code class="hdr-code">X-API-Key</code> das suas chamadas</p>
        </div>
        <span class="cfg-card-badge${activeKeys > 0 ? ' connected' : ''}">${activeKeys > 0 ? `<span class="dot"></span>` : ''}${activeKeys} ativa${activeKeys===1?'':'s'}</span>
      </div>

      <div class="cfg-card-body">
        ${S.newKeyRevealed ? `
          <div class="int-key-revealed">
            <div class="int-key-revealed-head">
              <span>🔑 Key criada — copie agora, ela não será mostrada de novo</span>
              <button class="int-key-revealed-ok" onclick="S.newKeyRevealed=null;render()">Ok, guardei</button>
            </div>
            <div class="int-key-revealed-row">
              <code>${esc2(S.newKeyRevealed.key)}</code>
              <button class="int-key-revealed-copy" onclick="copyToClipboard('${esc2(S.newKeyRevealed.key)}')">Copiar</button>
            </div>
          </div>
        ` : ''}

        <div class="cfg-add-row">
          <input class="cfg-input" value="${esc2(S.newKeyName||'')}" oninput="S.newKeyName=this.value" placeholder="Nome da key (ex: n8n produção)" onkeydown="if(event.key==='Enter')createApiKey()">
          <button class="cfg-btn cfg-btn-primary" onclick="createApiKey()">
            <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Gerar key
          </button>
        </div>

        ${keys.length === 0 ? `
          <div class="cfg-empty" style="padding:28px 24px">
            <div class="cfg-empty-title">Nenhuma key criada ainda</div>
            <div class="cfg-empty-text">Gere a primeira API key acima pra autenticar suas integrações externas.</div>
          </div>
        ` : `
          <div class="cfg-list">
            ${keys.map(k => `
              <div class="cfg-row${k.revoked_at ? ' revoked' : ''}">
                <div class="cfg-row-main">
                  <div class="cfg-row-name">
                    ${esc2(k.name)}
                    ${k.revoked_at ? '<span class="badge-revoked">REVOGADA</span>' : ''}
                  </div>
                  <div class="cfg-row-meta">
                    <span class="ip" style="font-family:'JetBrains Mono',monospace">${esc2(k.key_prefix)}…</span>
                    <span class="dot-sep"></span>
                    <span>Criada ${fmtDate(k.created_at)}</span>
                    ${k.last_used_at ? `<span class="dot-sep"></span><span>Último uso ${fmtDate(k.last_used_at)}${k.last_used_ip ? ` · ${esc2(k.last_used_ip)}` : ''}</span>` : `<span class="dot-sep"></span><span style="opacity:0.7">Nunca usada</span>`}
                  </div>
                </div>
                <div class="cfg-row-actions">
                  ${!k.revoked_at ? `<button class="btn-row-act revoke" onclick="revokeApiKey('${k.id}')">Revogar</button>` : ''}
                  <button class="btn-row-act danger" onclick="deleteApiKey('${k.id}')">Apagar</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </section>

    <!-- WEBHOOKS DE SAÍDA ──────────────────────────────────────────────── -->
    <section class="cfg-card">
      <div class="cfg-card-head">
        <div class="cfg-card-title-block">
          <h3 class="cfg-card-title">Webhooks de Saída</h3>
          <p class="cfg-card-sub">Notifica sua URL quando eventos acontecem no CRM · suporte a HMAC</p>
        </div>
        <button class="cfg-btn cfg-btn-primary cfg-head-cta" onclick="openWebhookForm()">
          <svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Novo webhook
        </button>
      </div>

      ${S.newWebhookForm ? `
        <div class="cfg-card-body" style="background:var(--surface-2);border-bottom:1px solid var(--border)">
          <h4 style="font-family:'Bricolage Grotesque',serif;font-size:14px;font-weight:700;margin:0 0 12px;color:var(--text-primary)">${S.newWebhookForm.id?'Editar':'Novo'} webhook</h4>
          <div style="display:grid;gap:12px;max-width:580px">
            <label style="display:block">
              <span style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:5px">Nome</span>
              <input class="cfg-input" value="${esc2(S.newWebhookForm.name||'')}" oninput="S.newWebhookForm.name=this.value" placeholder="ex: n8n — leads novos" style="width:100%">
            </label>
            <label style="display:block">
              <span style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:5px">URL de destino (POST)</span>
              <input class="cfg-input" value="${esc2(S.newWebhookForm.url||'')}" oninput="S.newWebhookForm.url=this.value" placeholder="https://n8n.seudominio.com/webhook/abc123" style="width:100%">
            </label>
            <label style="display:block">
              <span style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:5px">Secret HMAC (opcional · envia X-Signature)</span>
              <input class="cfg-input" type="password" value="${esc2(S.newWebhookForm.secret||'')}" oninput="S.newWebhookForm.secret=this.value" placeholder="whsec_..." style="width:100%">
            </label>
            <div>
              <p style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">Eventos que disparam este webhook</p>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${allowedEvents.map(ev => {
                  const checked = S.newWebhookForm.events.includes(ev)
                  return `<label style="display:inline-flex;align-items:center;gap:5px;padding:5px 11px;background:${checked?'var(--accent)':'var(--surface)'};color:${checked?'#fff':'var(--text-primary)'};border:1.5px solid ${checked?'var(--accent)':'var(--border)'};border-radius:7px;font-size:11.5px;cursor:pointer;font-family:'JetBrains Mono',monospace;font-weight:${checked?'700':'500'};transition:all .12s">
                    <input type="checkbox" ${checked?'checked':''} onchange="if(this.checked){S.newWebhookForm.events.push('${ev}')}else{S.newWebhookForm.events=S.newWebhookForm.events.filter(e=>e!=='${ev}')};render()" style="display:none">
                    ${ev}
                  </label>`
                }).join('')}
              </div>
              <p style="font-size:11px;color:var(--text-muted);margin:8px 0 0">Dica: selecione <code style="background:var(--accent-soft);color:var(--accent);padding:1px 5px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-weight:700">*</code> pra receber todos os eventos</p>
            </div>
            <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--text-primary);font-weight:500">
              <input type="checkbox" ${S.newWebhookForm.enabled!==false?'checked':''} onchange="S.newWebhookForm.enabled=this.checked;render()" style="width:15px;height:15px;accent-color:var(--accent)">
              Ativo
            </label>
            <div style="display:flex;gap:8px;margin-top:4px">
              <button class="cfg-btn cfg-btn-primary" onclick="submitWebhookForm()">Salvar</button>
              <button class="cfg-btn cfg-btn-secondary" onclick="S.newWebhookForm=null;render()">Cancelar</button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="cfg-card-body">
        ${webhooks.length === 0 && !S.newWebhookForm ? `
          <div class="cfg-empty" style="padding:28px 24px">
            <div class="cfg-empty-title">Nenhum webhook configurado</div>
            <div class="cfg-empty-text">Adicione um webhook para enviar eventos do CRM (leads, mensagens, financeiro) para sistemas externos.</div>
          </div>
        ` : `
          <div class="cfg-list">
            ${webhooks.map(w => `
              <div class="cfg-row wh${w.enabled === false ? ' paused' : ''}">
                <div class="cfg-row-main">
                  <div class="cfg-row-name">
                    <span class="wh-status-dot ${w.enabled === false ? 'off' : 'on'}"></span>
                    ${esc2(w.name)}
                    ${w.has_secret ? '<span class="wh-badge hmac">HMAC</span>' : ''}
                    ${w.failure_count > 0 ? `<span class="wh-badge fail">${w.failure_count} falhas</span>` : ''}
                  </div>
                  <div class="cfg-row-url">${esc2(w.url)}</div>
                  <div class="cfg-row-events">
                    ${(w.events || []).map(e => `<span class="int-event-badge">${esc2(e)}</span>`).join('')}
                    ${w.last_fired_at ? `<span class="cfg-row-meta-inline">· último disparo ${fmtDate(w.last_fired_at)}</span>` : ''}
                  </div>
                </div>
                <div class="cfg-row-actions" style="flex-direction:column;align-items:flex-end;min-width:90px">
                  <button class="btn-row-act test" onclick="testWebhook('${w.id}')">Testar</button>
                  <button class="btn-row-act" onclick="openWebhookForm(${esc2(JSON.stringify(w)).replace(/\\"/g,'&quot;').replace(/'/g,'&#39;')})">Editar</button>
                  <button class="btn-row-act${w.enabled ? '' : ' success'}" onclick="toggleWebhookEnabled(${esc2(JSON.stringify({id:w.id,enabled:w.enabled}))})">${w.enabled ? 'Pausar' : 'Ativar'}</button>
                  <button class="btn-row-act" onclick="showDeliveries('${w.id}')">Entregas</button>
                  <button class="btn-row-act danger" onclick="deleteWebhook('${w.id}')">Apagar</button>
                </div>
              </div>
              ${S.webhookDeliveries?.[w.id] ? `
                <div style="margin-top:8px;margin-bottom:8px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px">
                  <p style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">Últimas entregas</p>
                  ${S.webhookDeliveries[w.id].length === 0 ? `<p style="font-size:12px;color:var(--text-muted);margin:0">Nenhuma entrega ainda</p>` : `
                  <table style="width:100%;font-size:11.5px;border-collapse:collapse">
                    <thead><tr style="color:var(--text-muted);font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em">
                      <th style="text-align:left;padding:4px 8px;font-weight:700">Evento</th>
                      <th style="text-align:left;padding:4px 8px;font-weight:700">Status</th>
                      <th style="text-align:left;padding:4px 8px;font-weight:700">Tentativas</th>
                      <th style="text-align:left;padding:4px 8px;font-weight:700">Quando</th>
                    </tr></thead>
                    <tbody>
                    ${S.webhookDeliveries[w.id].map(d => `
                      <tr style="border-top:1px solid var(--surface-3)">
                        <td style="padding:5px 8px"><code style="font-family:'JetBrains Mono',monospace;font-size:11px">${esc2(d.event)}</code></td>
                        <td style="padding:5px 8px;color:${d.succeeded_at?'var(--bc-success)':d.failed_at?'var(--bc-danger)':'var(--text-muted)'};font-weight:600">${d.status_code || (d.failed_at?'erro':'pending')}</td>
                        <td style="padding:5px 8px;font-family:'JetBrains Mono',monospace">${d.attempts}</td>
                        <td style="padding:5px 8px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;font-size:11px">${fmtDate(d.created_at)}</td>
                      </tr>
                    `).join('')}
                    </tbody>
                  </table>`}
                </div>
              ` : ''}
            `).join('')}
          </div>
        `}
      </div>
    </section>

    <!-- FOTO DE PERFIL WHATSAPP ────────────────────────────────────────── -->
    ${(() => {
      if (S.avatarSessionLoading && !S.avatarSession) {
        return `<section class="cfg-card"><div class="cfg-card-body"><p style="font-size:13px;color:var(--text-muted);margin:0">Carregando sessão de avatar...</p></div></section>`
      }
      const sess = S.avatarSession
      const status = sess?.sessionStatus ?? 'disconnected'
      const isConnected = status === 'connected'
      const isConnecting = status === 'connecting' || status === 'qr'
      const badgeClass = isConnected ? 'cfg-card-badge connected' : 'cfg-card-badge'
      const badgeContent = isConnected
        ? `<span class="dot"></span>Conectado`
        : isConnecting ? `Aguardando QR` : `Desconectado`

      return `<section class="cfg-card">
        <div class="cfg-card-head">
          <div class="cfg-card-title-block">
            <h3 class="cfg-card-title">Foto de Perfil WhatsApp</h3>
            <p class="cfg-card-sub">Conecte um número pra que o CRM busque automaticamente fotos de perfil dos leads. Este número <strong>não envia nem recebe</strong> mensagens.</p>
          </div>
          <span class="${badgeClass}">${badgeContent}</span>
        </div>
        <div class="cfg-card-body">
          <div class="avatar-session-row" style="flex-wrap:wrap;gap:18px">
            <div class="avatar-session-info">
              <div class="avatar-session-icon">
                <svg fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
              </div>
              <div>
                <div class="avatar-session-num">${isConnected && sess?.phone_number ? esc2(sess.phone_number) : isConnecting ? 'Aguardando aparelho...' : 'Nenhum número conectado'}</div>
                <div class="avatar-session-meta">${isConnected ? 'Buscando fotos automaticamente' : isConnecting ? 'Escaneie o QR Code ao lado' : 'Clique em Conectar pra escanear o QR'}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
              ${sess?.qrDataUrl ? `
                <div style="flex-shrink:0;text-align:center">
                  <img src="${esc(sess.qrDataUrl)}" style="width:180px;height:180px;border-radius:8px;border:1px solid var(--border);display:block" alt="QR Code"/>
                  <p style="font-size:10.5px;color:var(--text-muted);margin:6px 0 0">WhatsApp → Aparelhos conectados</p>
                </div>
              ` : ''}
              ${!isConnected
                ? `<button class="cfg-btn cfg-btn-primary" onclick="connectAvatarSession()" ${S.avatarSessionLoading?'disabled':''}>${isConnecting ? 'Aguardando...' : 'Conectar'}</button>`
                : `<button class="btn-row-act revoke" onclick="disconnectAvatarSession()">Desconectar</button>`}
            </div>
          </div>
        </div>
      </section>`
    })()}

    <!-- QUICK EXAMPLE / CURL ───────────────────────────────────────────── -->
    <section class="curl-banner">
      <div class="curl-banner-head">
        <div class="curl-banner-title">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          Exemplo rápido — listar leads
        </div>
        <button class="curl-banner-copy" onclick="copyToClipboard(\`curl -H 'X-API-Key: lwn_sua_key_aqui' https://lowan.site/api/v1/public/leads?limit=10\`)">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          Copiar
        </button>
      </div>
      <pre class="curl-code"><span class="ck-cmd">curl</span> -H <span class="ck-str">'X-API-Key: lwn_sua_key_aqui'</span> \\
     <span class="ck-url">https://lowan.site/api/v1/public/leads?limit=10</span></pre>
      <p class="curl-banner-foot">
        Documentação completa dos endpoints em <a href="/api-docs" target="_blank">/api-docs <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg></a>.
      </p>
    </section>
  `
}

async function openIntakeTokenModal() {
  if (!isAdmin()) { showToast('Acesso restrito a administradores', 'error'); return }
  try {
    const r = await apiIntake('/token')
    S.intakeToken = r.token
  } catch(e) {
    showToast(e?.message || 'Erro ao buscar token', 'error')
    return
  }
  renderIntakeTokenModal()
}

function closeIntakeTokenModal() {
  document.getElementById('intake-modal-root')?.remove()
}

function renderIntakeTokenModal() {
  const tok = S.intakeToken || ''
  const baseUrl = location.origin + '/api/v1/intake/leads'
  const html = `
    <div class="utm-modal-bd" onclick="if(event.target===this)closeIntakeTokenModal()">
      <div class="utm-modal" style="max-width:680px">
        <div class="utm-modal-head">
          <h3 class="utm-modal-title">🔗 Token de Integração (API Intake)</h3>
          <button onclick="closeIntakeTokenModal()" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:var(--text-muted)">✕</button>
        </div>
        <div class="utm-modal-body">
          <div>
            <label>Token do workspace</label>
            <div class="intake-token-box">${esc(tok)}</div>
            <div style="display:flex;gap:6px;margin-top:-6px">
              <button onclick="copyIntakeToken()" class="bc-btn bc-btn-secondary" style="font-size:11.5px;padding:6px 12px">📋 Copiar</button>
              <button onclick="regenerateIntakeToken()" class="bc-btn bc-btn-ghost" style="font-size:11.5px;padding:6px 12px;color:#dc2626">🔄 Regenerar</button>
            </div>
          </div>

          <div class="intake-doc-block">
            <strong>Como usar:</strong> envie um <code>POST</code> com o telefone (obrigatório) e dados UTM. Lead é criado/atualizado automaticamente. Se já existir, UTM só é atribuído se o lead ainda não tiver origem registrada (preserva atribuição original).
            <pre>POST ${esc(baseUrl)}
Content-Type: application/json
X-Intake-Token: ${esc(tok)}

{
  "phone": "5511999998888",
  "name": "Maria Silva",
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "black_friday_2026",
  "utm_content": "video_a",
  "fbclid": "AbCd123",
  "landing_url": "https://lowan.site/lp/promo",
  "referrer": "https://google.com"
}</pre>
            <strong>Campos suportados:</strong> <code>phone</code>* <code>name</code> <code>utm_source</code> <code>utm_medium</code> <code>utm_campaign</code> <code>utm_content</code> <code>utm_term</code> <code>fbclid</code> <code>gclid</code> <code>landing_url</code> <code>referrer</code> <code>marketing_meta</code>
          </div>

          <div class="intake-doc-block" style="background:#fef3c7;border-color:#fde68a">
            ⚠️ <strong>Cuidado com o token</strong> — qualquer pessoa com ele pode criar leads no seu workspace. Nunca exponha em código frontend público. Use server-side ou Zapier/Make.
          </div>
        </div>
        <div class="utm-modal-foot">
          <div></div>
          <button onclick="closeIntakeTokenModal()" class="bc-btn bc-btn-primary">Fechar</button>
        </div>
      </div>
    </div>`
  let root = document.getElementById('intake-modal-root')
  if (!root) { root = document.createElement('div'); root.id = 'intake-modal-root'; document.body.appendChild(root) }
  root.innerHTML = html
}

function copyIntakeToken() {
  const tok = S.intakeToken || ''
  if (!tok) return
  navigator.clipboard.writeText(tok).then(() => showToast('Token copiado', 'success')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = tok; document.body.appendChild(ta)
    ta.select(); document.execCommand('copy'); ta.remove()
    showToast('Token copiado', 'success')
  })
}

async function regenerateIntakeToken() {
  if (!confirm('Regenerar token? Integrações antigas vão parar de funcionar até atualizar o token.')) return
  try {
    const r = await apiIntake('/token/regenerate', { method: 'POST' })
    S.intakeToken = r.token
    renderIntakeTokenModal()
    showToast('Novo token gerado', 'success')
  } catch(e) {
    showToast(e?.message || 'Erro', 'error')
  }
}