// ==============================
// TrafficAI — Tracking Public Endpoints
// Endpoints SEM autenticação JWT:
//   GET  /track/pixel/:token.js    — serve o pixel JS customizado
//   POST /track/event/:token       — ingest do pixel
//   POST /track/click/:token       — registra primeiro clique (fbclid/utm)
//   POST /track/webhook/:token     — ingest de CRM (assinado por HMAC)
// ==============================

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import {
    trackEvent, recordClick, extractClientContext,
    TrackingSource, TrackingUserInput, TrackingEventInput, ClickRecordInput,
} from './tracking.service';
import { clampEventTime } from './crm-sync.service';

const router = Router();

async function findSource(token: string): Promise<(TrackingSource & { webhook_secret: string | null; domain: string | null }) | null> {
    const rows = await query<any>(
        `SELECT id, user_id, pixel_id, access_token, test_event_code, is_active,
                webhook_secret, domain
         FROM tracking_sources
         WHERE public_token = $1`,
        [token]
    );
    return rows[0] || null;
}

// ─── GET /track/pixel/:token.js ─────────────────────────────────────────────
// Serve o pixel JS parametrizado. Client embute:
//   <script async src="https://api.alfamaxdigital.com.br/api/v1/track/pixel/TOKEN.js"></script>
router.get('/pixel/:token.js', async (req: Request, res: Response) => {
    const token = req.params.token;
    const source = await findSource(token);

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min

    if (!source || !source.is_active) {
        res.send('/* TrafficAI: source inactive or not found */');
        return;
    }

    const apiBase = `${req.protocol}://${req.get('host')}`;
    const js = buildPixelScript(token, apiBase, source.pixel_id);
    res.send(js);
});

// ─── POST /track/event/:token ───────────────────────────────────────────────
router.post('/event/:token', async (req: Request, res: Response) => {
    try {
        const source = await findSource(req.params.token);
        if (!source || !source.is_active) {
            return res.status(404).json({ success: false, error: { message: 'Source not found' } });
        }

        const body = req.body || {};
        const ctx = extractClientContext(req);

        const userData: TrackingUserInput = {
            email: body.email,
            phone: body.phone,
            first_name: body.first_name,
            last_name: body.last_name,
            city: body.city,
            state: body.state,
            zip: body.zip,
            country: body.country || ctx.country || undefined,
            external_id: body.external_id,
            fbp: body.fbp,
            fbc: body.fbc,
            client_ip: ctx.ip || undefined,
            client_user_agent: ctx.user_agent || undefined,
        };

        const event: TrackingEventInput = {
            event_name: body.event_name,
            event_id: body.event_id,
            event_time: body.event_time,
            action_source: body.action_source || 'website',
            event_source_url: body.event_source_url,
            value: body.value,
            currency: body.currency,
            custom_data: body.custom_data,
            user_data: userData,
        };

        if (!event.event_name) {
            return res.status(400).json({ success: false, error: { message: 'event_name obrigatório' } });
        }

        const r = await trackEvent(source, event);
        res.json({ success: true, data: r });
    } catch (err: any) {
        logger.error('tracking public: event falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /track/click/:token ───────────────────────────────────────────────
router.post('/click/:token', async (req: Request, res: Response) => {
    try {
        const source = await findSource(req.params.token);
        if (!source || !source.is_active) return res.json({ success: true });

        const ctx = extractClientContext(req);
        const c: ClickRecordInput = {
            fbclid: req.body?.fbclid,
            gclid: req.body?.gclid,
            utm_source: req.body?.utm_source,
            utm_medium: req.body?.utm_medium,
            utm_campaign: req.body?.utm_campaign,
            utm_content: req.body?.utm_content,
            utm_term: req.body?.utm_term,
            landing_page: req.body?.landing_page,
            referrer: req.body?.referrer,
            client_ip: ctx.ip || undefined,
            client_user_agent: ctx.user_agent || undefined,
            country: ctx.country || undefined,
        };
        await recordClick(source.id, c);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /track/webhook/:token ─────────────────────────────────────────────
// Webhook para CRM (Kommo, RD Station, n8n, etc).
// Aceita três formas de autenticação (da mais segura pra mais simples):
//   1. Header X-TAI-Signature: hex sha256 HMAC do body com webhook_secret
//   2. Header Authorization: Bearer <webhook_secret>   ← recomendado p/ Kommo
//   3. Query param ?key=<webhook_secret>               ← fallback p/ CRMs limitados
//
// Body JSON:
//     {
//       event: 'Lead' | 'Contact' | 'Schedule' | 'Purchase' | 'Lead_Desqualificado',
//       event_id?: string,
//       external_id?: string,   // id do lead no CRM
//       value?: number, currency?: string,
//       user: { email, phone, first_name, last_name, city, state, zip, country },
//       custom_data?: {...},
//       action_source?: 'system_generated' (default)
//     }
router.post('/webhook/:token', async (req: Request, res: Response) => {
    try {
        const source = await findSource(req.params.token);
        if (!source || !source.is_active) return res.status(404).json({ success: false });

        // Verificação de credenciais
        if (source.webhook_secret) {
            const secret = source.webhook_secret;
            let authenticated = false;

            // (1) HMAC assinado
            const signature = (req.headers['x-tai-signature'] as string) || '';
            if (signature) {
                const raw = JSON.stringify(req.body || {});
                const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
                if (signature === expected) authenticated = true;
            }

            // (2) Authorization: Bearer <secret>
            if (!authenticated) {
                const auth = (req.headers['authorization'] as string) || '';
                const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
                if (bearer && bearer === secret) authenticated = true;
            }

            // (3) ?key=<secret>
            if (!authenticated && req.query.key === secret) {
                authenticated = true;
            }

            // Dev bypass
            if (!authenticated && process.env.NODE_ENV !== 'production' && req.query.dev === '1') {
                authenticated = true;
            }

            if (!authenticated) {
                logger.warn('tracking webhook: não autenticado', { source: source.id });
                return res.status(401).json({
                    success: false,
                    error: { message: 'Webhook não autenticado. Envie X-TAI-Signature, Authorization: Bearer ou ?key=.' },
                });
            }
        }

        let b: any = req.body || {};

        // ── Formato nativo Kommo ──────────────────────────────────────────
        // Kommo envia form-encoded com chaves tipo:
        //   leads[status][0][id], leads[status][0][status_id], leads[status][0][price]
        //   contacts[update][0][custom_fields][0][values][0][value]  (email/phone)
        // Quando detectamos esse formato, normalizamos para o JSON esperado.
        if (b.leads && !b.event) {
            // Log estrutural (keys) pra debug — útil pra entender payloads novos.
            try {
                const summary = {
                    leads_sections: Object.keys(b.leads || {}),
                    leads_count: Object.values(b.leads || {}).reduce((n: number, s: any) => n + Object.keys(s || {}).length, 0),
                    contacts_sections: Object.keys(b.contacts || {}),
                    has_custom_fields: !!(b.contacts && JSON.stringify(b.contacts).includes('custom_fields')),
                };
                logger.info('webhook Kommo recebido', { source: source.id, event_query: req.query.event, ...summary });
            } catch { /* ignore */ }

            const normalized = normalizeKommoPayload(b, String(req.query.event || ''));
            if (normalized) b = normalized;
        }

        // ── Validação: Purchase exige value > 0 e currency ───────────────
        // Se o webhook de Purchase for disparado sem valor (lead sem price no Kommo),
        // a Meta retorna "Invalid parameter". Rejeitamos antes pra dar erro claro.
        const eventName = (b.event || b.event_name || '').toString();
        if (eventName === 'Purchase' && (!b.value || Number(b.value) <= 0)) {
            logger.warn('webhook Purchase rejeitado sem value', {
                source: source.id, external_id: b.external_id,
            });
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Purchase exige value > 0. Preencha o valor do lead no Kommo antes de arrastar para "Venda fechada".',
                },
            });
        }

        const event: TrackingEventInput = {
            event_name: b.event || b.event_name,
            event_id: b.event_id,
            // Meta rejeita eventos > 7 dias. Se vier antigo (ex: CRM mandando
            // lead fechado ontem > 7 dias no passado), usa agora().
            event_time: b.event_time ? clampEventTime(Number(b.event_time), 'clamp_7d') : undefined,
            action_source: b.action_source || 'system_generated',
            value: b.value,
            currency: b.currency || (b.value ? 'BRL' : undefined),
            custom_data: b.custom_data,
            user_data: {
                email: b.user?.email || b.email,
                phone: b.user?.phone || b.phone,
                first_name: b.user?.first_name || b.first_name,
                last_name: b.user?.last_name || b.last_name,
                city: b.user?.city,
                state: b.user?.state,
                zip: b.user?.zip,
                country: b.user?.country,
                external_id: b.external_id,
                client_ip: extractClientContext(req).ip || undefined,
            },
        };

        if (!event.event_name) {
            return res.status(400).json({ success: false, error: { message: 'event obrigatório' } });
        }

        const r = await trackEvent(source, event);
        res.json({ success: true, data: r });
    } catch (err: any) {
        logger.error('tracking webhook falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── Pixel JS builder ───────────────────────────────────────────────────────

// ─── Normalizador Kommo ──────────────────────────────────────────────────
// Kommo envia webhook em form-encoded ou JSON aninhado com chaves
// leads[status][0][id], leads[add][0][price], contacts[update][0][custom_fields]
// etc. Essa função pega o primeiro lead+contato do payload e normaliza
// para o formato esperado por trackEvent.
//
// O nome do evento vem via query string (?event=Lead|Contact|Schedule|Purchase)
// ou é inferido pelo tipo de operação (add=Lead, status=Contact por default).
function normalizeKommoPayload(body: any, eventHintFromQuery: string): any | null {
    try {
        // Diagnóstico leve — loga o primeiro contact pra ver estrutura
        try {
            const c0 = body?.contacts?.update?.[0] || body?.contacts?.add?.[0];
            if (c0) {
                const cfKeys = c0.custom_fields
                    ? (Array.isArray(c0.custom_fields) ? c0.custom_fields : Object.values(c0.custom_fields))
                    : [];
                logger.debug('Kommo contact debug', {
                    first_name: c0.first_name,
                    last_name: c0.last_name,
                    cf_names: cfKeys.map((f: any) => f?.name || f?.code).slice(0, 10),
                });
            }
        } catch { /* ignore */ }

        const leads = body.leads || {};
        // Kommo envia tanto leads[status][0] (mudança de status) quanto
        // leads[add][0] (lead criado) etc.
        const leadBlocks = [
            ...(leads.status ? Object.values(leads.status) : []),
            ...(leads.add ? Object.values(leads.add) : []),
            ...(leads.update ? Object.values(leads.update) : []),
        ];
        if (leadBlocks.length === 0) return null;
        const lead: any = leadBlocks[0];

        const contacts = body.contacts || {};
        const contactBlocks = [
            ...(contacts.update ? Object.values(contacts.update) : []),
            ...(contacts.add ? Object.values(contacts.add) : []),
        ];
        const contact: any = contactBlocks[0] || {};

        // Extrai email e telefone dos custom_fields. No Kommo os custom_fields
        // chegam como objeto aninhado (form-encoded parseado) tipo:
        //   custom_fields: { '0': { name: 'E-mail', values: { '0': { value: 'x@y.com' } } } }
        // Normalizamos tudo pra array e pegamos values[0].value.
        const extractField = (obj: any, needles: string[]): string | undefined => {
            const raw = obj?.custom_fields || obj?.custom_fields_values || obj?.customFields;
            if (!raw) return undefined;
            const fieldArr = Array.isArray(raw) ? raw : Object.values(raw);
            for (const f of fieldArr) {
                if (!f || typeof f !== 'object') continue;
                const fname = String((f as any).name || (f as any).field_name || (f as any).code || '').toLowerCase();
                if (!needles.some(n => fname.includes(n))) continue;

                let vals: any = (f as any).values ?? (f as any).value;
                if (vals && !Array.isArray(vals) && typeof vals === 'object') {
                    vals = Object.values(vals);
                }
                if (Array.isArray(vals) && vals.length > 0) {
                    const first = vals[0];
                    if (first && typeof first === 'object') {
                        const v = (first as any).value ?? (first as any).enum ?? '';
                        return String(v).trim() || undefined;
                    }
                    return String(first).trim() || undefined;
                }
                if (typeof vals === 'string') return vals.trim() || undefined;
            }
            return undefined;
        };

        const email = extractField(contact, ['email', 'e-mail']) || extractField(lead, ['email']);
        const phone = extractField(contact, ['telefone', 'phone', 'celular', 'whatsapp']) || extractField(lead, ['phone', 'telefone']);
        const firstName = String(contact.first_name || contact.name || '').split(' ')[0] || undefined;
        const lastName = String(contact.last_name || contact.name || '').split(' ').slice(1).join(' ') || undefined;

        // Evento: vem da query (?event=Purchase) OU inferido
        // - Se tem price > 0 e status mudou → Purchase
        // - Se veio de leads[add] → Lead
        // - Caso contrário → Contact (qualificação)
        let eventName = eventHintFromQuery.trim();
        if (!eventName) {
            const price = Number(lead.price || 0);
            if (leads.add && leadBlocks.length > 0) eventName = 'Lead';
            else if (price > 0) eventName = 'Purchase';
            else eventName = 'Contact';
        }

        return {
            event: eventName,
            external_id: `kommo-${lead.id}`,
            event_id: `kommo-${lead.id}-${eventName}-${Date.now()}`,
            value: Number(lead.price || 0) || undefined,
            currency: lead.price ? 'BRL' : undefined,
            user: {
                email, phone, first_name: firstName, last_name: lastName,
            },
            custom_data: {
                kommo_lead_id: lead.id,
                kommo_status_id: lead.status_id,
                kommo_pipeline_id: lead.pipeline_id,
                kommo_responsible_user_id: lead.responsible_user_id,
                source: 'kommo',
            },
        };
    } catch (err: any) {
        logger.warn('tracking webhook: normalização Kommo falhou', { error: err.message });
        return null;
    }
}

function buildPixelScript(token: string, apiBase: string, pixelId: string | null): string {
    return `/* TrafficAI Pixel · token=${token} */
(function(){
  if (window.TrafficAI && window.TrafficAI._loaded) return;
  var API = ${JSON.stringify(apiBase)};
  var TOKEN = ${JSON.stringify(token)};
  var PIXEL_ID = ${JSON.stringify(pixelId || '')};
  var EP_EVENT = API + '/api/v1/track/event/' + TOKEN;
  var EP_CLICK = API + '/api/v1/track/click/' + TOKEN;

  // ── Cookies e storage ─────────────────────────────────────────────────
  function getCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, days){
    var exp = new Date(Date.now() + days*86400000).toUTCString();
    var domain = window.location.hostname.split('.').slice(-2).join('.');
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + exp +
      '; path=/; SameSite=Lax; domain=.' + domain;
  }
  function uuid(){
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  // ── fbp / fbc (padrão Meta) ───────────────────────────────────────────
  function ensureFbp(){
    var fbp = getCookie('_fbp');
    if (!fbp) {
      fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random()*1e10);
      setCookie('_fbp', fbp, 90);
    }
    return fbp;
  }
  function captureFbc(){
    var params = new URLSearchParams(window.location.search);
    var fbclid = params.get('fbclid');
    if (fbclid) {
      var fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      setCookie('_fbc', fbc, 90);
      return fbc;
    }
    return getCookie('_fbc');
  }

  // ── Perfil do usuário (identify) persistido na sessão ─────────────────
  var IDENT_KEY = '__tai_ident__';
  function getIdent(){
    try { return JSON.parse(sessionStorage.getItem(IDENT_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setIdent(data){
    var cur = getIdent();
    var next = Object.assign(cur, data || {});
    try { sessionStorage.setItem(IDENT_KEY, JSON.stringify(next)); } catch(e){}
  }

  // ── Params iniciais (UTMs, fbclid, gclid) ─────────────────────────────
  function parseParams(){
    var sp = new URLSearchParams(window.location.search);
    return {
      fbclid: sp.get('fbclid') || undefined,
      gclid: sp.get('gclid') || undefined,
      utm_source: sp.get('utm_source') || undefined,
      utm_medium: sp.get('utm_medium') || undefined,
      utm_campaign: sp.get('utm_campaign') || undefined,
      utm_content: sp.get('utm_content') || undefined,
      utm_term: sp.get('utm_term') || undefined,
    };
  }

  // ── Event dispatch ────────────────────────────────────────────────────
  function send(url, body){
    try {
      var blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, { method:'POST', body: JSON.stringify(body), headers:{'Content-Type':'application/json'}, keepalive:true });
      }
    } catch(e) {
      try { fetch(url, { method:'POST', body: JSON.stringify(body), headers:{'Content-Type':'application/json'} }); } catch(e2){}
    }
  }

  function track(eventName, params){
    params = params || {};
    var id = params.event_id || uuid();
    var ident = getIdent();
    var payload = {
      event_name: eventName,
      event_id: id,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: window.location.href,
      action_source: 'website',
      value: params.value,
      currency: params.currency,
      email: params.email || ident.email,
      phone: params.phone || ident.phone,
      first_name: params.first_name || ident.first_name,
      last_name: params.last_name || ident.last_name,
      city: params.city || ident.city,
      state: params.state || ident.state,
      zip: params.zip || ident.zip,
      country: params.country || ident.country,
      external_id: params.external_id || ident.external_id,
      fbp: ensureFbp(),
      fbc: captureFbc(),
      custom_data: params.custom_data,
    };
    send(EP_EVENT, payload);

    // Espelha no Pixel browser-side (mesmo event_id → Meta deduplica)
    if (PIXEL_ID && window.fbq && window.fbq.loaded !== false) {
      try { window.fbq('track', eventName, params.custom_data || {}, { eventID: id }); } catch(e){}
    }
    return id;
  }

  // ── Auto: registra clique e PageView ──────────────────────────────────
  var params = parseParams();
  var hasTraffic = params.fbclid || params.gclid || params.utm_source || params.utm_campaign;
  if (hasTraffic) {
    send(EP_CLICK, Object.assign(params, {
      landing_page: window.location.href,
      referrer: document.referrer || null,
    }));
  }

  // ── Auto-scroll tracking (50% e 90%) ──────────────────────────────────
  var scrollMarks = { 50:false, 90:false };
  function onScroll(){
    var h = document.documentElement;
    var scrolled = (h.scrollTop || document.body.scrollTop);
    var total = (h.scrollHeight || document.body.scrollHeight) - window.innerHeight;
    if (total <= 0) return;
    var pct = (scrolled / total) * 100;
    if (pct >= 50 && !scrollMarks[50]) { scrollMarks[50] = true; track('Scroll50'); }
    if (pct >= 90 && !scrollMarks[90]) { scrollMarks[90] = true; track('Scroll90'); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── Auto-WhatsApp click tracking ──────────────────────────────────────
  document.addEventListener('click', function(e){
    var el = e.target;
    while (el && el !== document) {
      if (el.tagName === 'A') {
        var href = el.href || '';
        if (/wa\\.me|api\\.whatsapp\\.com|whatsapp:\\/\\//i.test(href)) {
          track('Contact', { custom_data: { channel: 'whatsapp', href: href } });
          return;
        }
      }
      // Botão marcado com data-tai-event="InitiateCheckout"
      if (el.dataset && el.dataset.taiEvent) {
        var name = el.dataset.taiEvent;
        var data = {};
        if (el.dataset.taiValue) data.value = parseFloat(el.dataset.taiValue);
        if (el.dataset.taiCurrency) data.currency = el.dataset.taiCurrency;
        track(name, data);
        return;
      }
      el = el.parentNode;
    }
  }, true);

  // ── Auto-form InitiateCheckout em submit ──────────────────────────────
  document.addEventListener('submit', function(e){
    var form = e.target;
    if (!form || form.dataset.taiIgnore) return;
    var ident = {};
    var email = form.querySelector('input[type=email]');
    var phone = form.querySelector('input[type=tel]');
    var name = form.querySelector('input[name*=nome i], input[name*=name i]');
    if (email && email.value) ident.email = email.value;
    if (phone && phone.value) ident.phone = phone.value;
    if (name && name.value) {
      var parts = name.value.trim().split(/\\s+/);
      ident.first_name = parts[0];
      if (parts.length > 1) ident.last_name = parts.slice(1).join(' ');
    }
    if (Object.keys(ident).length) setIdent(ident);
    if (!form.dataset.taiEvent) track('InitiateCheckout');
  }, true);

  // ── API pública ───────────────────────────────────────────────────────
  window.TrafficAI = {
    _loaded: true,
    track: track,
    identify: setIdent,
    pageView: function(params){ return track('PageView', params); },
    viewContent: function(params){ return track('ViewContent', params); },
    lead: function(params){ return track('Lead', params); },
    purchase: function(params){ return track('Purchase', params); },
    contact: function(params){ return track('Contact', params); },
    schedule: function(params){ return track('Schedule', params); },
  };

  // ── Fire PageView imediatamente ───────────────────────────────────────
  track('PageView');
})();
`;
}

export const trackingPublicController = router;
