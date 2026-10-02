// ==============================
// TrafficAI — Tracking Public Endpoints
// Endpoints SEM autenticação JWT:
//   GET  /track/pixel/:token.js    — serve o pixel JS customizado
//   POST /track/event/:token       — ingest do pixel
//   POST /track/click/:token       — registra primeiro clique (fbclid/utm)
//   POST /track/webhook/:token     — ingest de CRM (assinado por HMAC)
// ==============================

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import {
    trackEvent, recordClick, extractClientContext,
    TrackingSource, TrackingUserInput, TrackingEventInput, ClickRecordInput,
} from './tracking.service';
import { clampEventTime } from './crm-sync.service';
import { processWhatsAppMessage, findWhatsAppLeadByPhone, recordPurchaseForWhatsAppLead } from './whatsapp-lead.service';
import { resolveClickAttribution, enrichClickWithContact } from './attribution-resolver';
import { KommoAdapter } from './crm-adapters/kommo.adapter';
import { DataCrazyAdapter } from './crm-adapters/datacrazy.adapter';
import {
    upsertOrder, linkOrderPurchaseEvent, normalizePaymentMethod, metaIdsFromUtms,
    NormalizedOrder, OrderStatus,
} from './sales-orders.service';
import { normalizeSalesSettings } from './sales-report.service';
import { notifySale } from './sales-notify.service';

const router = Router();

// ─── Rate limit por token ──────────────────────────────────────────────────
// Protege cada fonte individualmente — alguém floodando o token de um cliente
// não consegue inflar contadores nem consumir nossa cota Meta CAPI.
// Limite generoso pra suportar sites de alto tráfego sem afetar uso real.
//
// 600 req/min por token = 10/seg sustentado (com burst).
// Status 429 silencioso (success:true) pra não revelar a estrutura pro atacante.
const eventLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `tai_event:${req.params.token}`,
    handler: (_req, res) => {
        res.status(429).json({ success: false, error: { message: 'Rate limit excedido' } });
    },
});

// Click events são mais raros (1 por sessão geralmente), limite mais apertado.
const clickLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `tai_click:${req.params.token}`,
    handler: (_req, res) => {
        // Click silencioso já pelo design — não vaza erro.
        res.json({ success: true });
    },
});

// WhatsApp webhook (Evolution API) — baixo volume normalmente.
const whatsappLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `tai_wa:${req.params.token}`,
    handler: (_req, res) => {
        res.status(429).json({ success: false, error: { message: 'Rate limit excedido' } });
    },
});

// CRM webhook — Kommo/RDStation podem disparar em rajada quando importam leads.
// Limite mais alto, mas ainda protege.
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `tai_webhook:${req.params.token}`,
    handler: (_req, res) => {
        res.status(429).json({ success: false, error: { message: 'Rate limit excedido' } });
    },
});

async function findSource(token: string): Promise<(TrackingSource & {
    webhook_secret: string | null;
    domain: string | null;
    crm_type: string | null;
    crm_subdomain: string | null;
    crm_access_token: string | null;
}) | null> {
    const rows = await query<any>(
        `SELECT id, user_id, pixel_id, access_token, test_event_code, is_active,
                webhook_secret, domain,
                crm_type, crm_subdomain, crm_access_token,
                google_ads_account_id, account_id
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
router.post('/event/:token', eventLimiter, async (req: Request, res: Response) => {
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
            // Geo: prioriza payload do client (form/identify) e cai pra headers Cloudflare
            city: body.city || ctx.city || undefined,
            state: body.state || ctx.state || undefined,
            zip: body.zip || ctx.zip || undefined,
            country: body.country || ctx.country || undefined,
            external_id: body.external_id,
            fbp: body.fbp,
            fbc: body.fbc,
            gclid: body.gclid,
            gbraid: body.gbraid,
            wbraid: body.wbraid,
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
            session_id: body.session_id,
        };

        if (!event.event_name) {
            return res.status(400).json({ success: false, error: { message: 'event_name obrigatório' } });
        }

        // Se esse evento identificou o visitante (email/phone), marca o clique
        // da mesma sessão com o hash de contato — permite resolver leads futuros
        // que cheguem sem click ID explícito (ver attribution-resolver.ts).
        if (event.session_id && (userData.email || userData.phone)) {
            enrichClickWithContact(source.id, event.session_id, { email: userData.email, phone: userData.phone })
                .catch(() => { /* não bloqueia — já loga internamente */ });
        }

        const r = await trackEvent(source, event);
        res.json({ success: true, data: r });
    } catch (err: any) {
        logger.error('tracking public: event falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /track/click/:token ───────────────────────────────────────────────
router.post('/click/:token', clickLimiter, async (req: Request, res: Response) => {
    try {
        const source = await findSource(req.params.token);
        if (!source || !source.is_active) return res.json({ success: true });

        const ctx = extractClientContext(req);
        const c: ClickRecordInput = {
            fbclid: req.body?.fbclid,
            gclid: req.body?.gclid,
            gbraid: req.body?.gbraid,
            wbraid: req.body?.wbraid,
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
            city: ctx.city || undefined,
            session_id: req.body?.session_id,
        };
        await recordClick(source.id, c);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /track/whatsapp/:token ────────────────────────────────────────────
// Recebe webhook do Evolution API (messages.upsert). Se a mensagem veio de
// anúncio WhatsApp (tem ctwaClid), captura lead + dispara Lead
// com action_source=business_messaging.
//
// Configure no Evolution API:
//   URL: https://api.alfamaxdigital.com.br/api/v1/track/whatsapp/{SEU_TOKEN}?key={SECRET}
//   Eventos: messages.upsert
router.post('/whatsapp/:token', whatsappLimiter, async (req: Request, res: Response) => {
    try {
        const source = await findSource(req.params.token);
        if (!source || !source.is_active) {
            return res.status(404).json({ success: false, error: { message: 'Fonte não encontrada' } });
        }

        // Auth opcional via ?key= (Evolution não suporta header customizado na maioria dos plans)
        if (source.webhook_secret && req.query.key && req.query.key !== source.webhook_secret) {
            return res.status(401).json({ success: false, error: { message: 'Key inválida' } });
        }

        const result = await processWhatsAppMessage(source, req.body);
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking whatsapp falhou', { error: err.message });
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
//       session_id?: string,   // opcional — se o seu site/form repassar o
//                               // session_id do pixel, a atribuição ao clique
//                               // de origem fica muito mais confiável (ver
//                               // attribution-resolver.ts). Sem isso, cai pra
//                               // hash de telefone/email ou IP+tempo.
//     }
router.post('/webhook/:token', webhookLimiter, async (req: Request, res: Response) => {
    try {
        const source = await findSource(req.params.token);
        if (!source || !source.is_active) return res.status(404).json({ success: false });

        // Verificação de credenciais
        if (source.webhook_secret) {
            const secret = source.webhook_secret;
            let authenticated = false;

            // Comparação resistente a timing attack: ambos os buffers DEVEM ter
            // o mesmo tamanho — encapsula numa helper que retorna false se diferentes.
            const safeEq = (a: string, b: string): boolean => {
                if (typeof a !== 'string' || typeof b !== 'string') return false;
                const ba = Buffer.from(a);
                const bb = Buffer.from(b);
                if (ba.length !== bb.length) return false;
                return crypto.timingSafeEqual(ba, bb);
            };

            // (1) HMAC assinado
            const signature = (req.headers['x-tai-signature'] as string) || '';
            if (signature) {
                const raw = JSON.stringify(req.body || {});
                const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
                if (safeEq(signature, expected)) authenticated = true;
            }

            // (2) Authorization: Bearer <secret>
            if (!authenticated) {
                const auth = (req.headers['authorization'] as string) || '';
                const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
                if (bearer && safeEq(bearer, secret)) authenticated = true;
            }

            // (3) ?key=<secret>
            if (!authenticated && typeof req.query.key === 'string' && safeEq(req.query.key, secret)) {
                authenticated = true;
            }

            // (4) body.key=<secret> — alguns builders de automação (DataCrazy, etc.)
            // não deixam configurar header/query de forma confiável, mas sempre
            // deixam editar o corpo JSON livremente. Aceita a senha ali também.
            if (!authenticated && req.body && typeof req.body.key === 'string' && safeEq(req.body.key, secret)) {
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
        let orderRecordId: string | null = null;

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

            const normalized = await normalizeKommoPayload(b, String(req.query.event || ''), source);
            if (normalized) b = normalized;

            // Fallback: se webhook Kommo chegou sem phone (Salesbot pode omitir
            // contato), busca via API do Kommo usando kommo_lead_id.
            const missingPhone = !b.user?.phone && !b.phone;
            const hasPhoneAndEmail = b.user?.email;
            const kommoLeadId = b.custom_data?.kommo_lead_id;
            if (missingPhone && kommoLeadId && source.crm_type === 'kommo' && source.crm_subdomain && source.crm_access_token) {
                try {
                    const adapter = new KommoAdapter(source.crm_subdomain, source.crm_access_token);
                    const { lead, contact } = await adapter.fetchLeadWithContact(kommoLeadId);
                    const extracted = adapter.extractUserData(lead, contact);
                    if (extracted.phone || extracted.email || extracted.first_name) {
                        b.user = {
                            ...(b.user || {}),
                            phone: b.user?.phone || extracted.phone,
                            email: b.user?.email || extracted.email,
                            first_name: b.user?.first_name || extracted.first_name,
                            last_name: b.user?.last_name || extracted.last_name,
                        };
                        logger.info('Kommo fallback API: phone enriquecido', {
                            source: source.id, leadId: kommoLeadId,
                            has_phone: !!extracted.phone, has_email: !!extracted.email,
                        });
                    }
                } catch (e: any) {
                    logger.warn('Kommo fallback API falhou', { leadId: kommoLeadId, error: e.message });
                }
            }
        }

        // ── Kiwify ─────────────────────────────────────────────────────────
        // Documentação pública da Kiwify pra webhook de venda está incompleta
        // (o payload do webhook NÃO é igual ao da API REST — confirmado pela
        // própria Kiwify). Detecção e extração propositalmente tolerantes a
        // variação de nome/caixa de campo — loga o corpo bruto pra ajuste fino
        // assim que o primeiro evento de teste real chegar.
        // ── Kiwify: carrinho abandonado ────────────────────────────────────
        // Formato diferente do pedido (sem order_id; traz nome/e-mail/telefone
        // e o link do checkout). Só alimenta a tela de Recuperação — nunca
        // vira evento na Meta.
        if (!b.event && isKiwifyAbandonedPayload(b)) {
            logger.info('webhook Kiwify carrinho abandonado — corpo bruto pra conferência', { source: source.id, raw: JSON.stringify(b).slice(0, 3000) });
            if (isKiwifyTestPayload(b)) {
                return res.json({ success: true, data: { test: true, message: 'Teste recebido. Conexão funcionando.' } });
            }
            const cart = normalizeKiwifyAbandoned(b);
            if (!cart) return res.json({ success: true, data: { ignored: true, reason: 'carrinho sem identificador' } });
            const saved = await upsertOrder(source.id, cart);
            if (saved.previous_status !== 'abandoned') void notifySale(source.id, { ...cart, order_id: saved.id, utm_campaign: saved.utm_campaign });
            return res.json({ success: true, data: { order_id: saved.id, status: 'abandoned' } });
        }

        if (!b.event && (b.order_id || b.order_status || b.Customer || b.customer_id || b.Product)) {
            logger.info('webhook Kiwify recebido — corpo bruto pra conferência', { source: source.id, raw: JSON.stringify(b).slice(0, 4000) });
            const k = normalizeKiwifyPayload(b);
            if (!k) return res.json({ success: true, data: { ignored: true, reason: 'status não mapeado pra pedido' } });
            // Botão "Testar" da Kiwify manda um pedido fictício aprovado (John Doe,
            // johndoe@example.com, "Example product"). Confirma que a conexão
            // funciona, mas não pode virar venda no relatório nem Purchase no pixel.
            if (isKiwifyTestPayload(b)) {
                logger.info('webhook Kiwify: pedido de TESTE recebido — conexão ok, nada gravado/enviado', { source: source.id, order: k.order.external_order_id });
                return res.json({ success: true, data: { test: true, message: 'Teste recebido. Conexão funcionando — pedidos de teste não entram no relatório nem vão pra Meta.' } });
            }
            const saved = await upsertOrder(source.id, k.order);
            // Aviso de venda/Pix/recusa no celular — só na mudança de situação
            // (a Kiwify às vezes reenvia o mesmo webhook).
            if (saved.previous_status !== k.order.status) void notifySale(source.id, { ...k.order, order_id: saved.id, utm_campaign: saved.utm_campaign });
            // Pendente/recusado/reembolso só atualizam o pedido (dashboard);
            // Purchase na Meta só na transição pra aprovado — reenvio do mesmo
            // webhook aprovado não duplica.
            if (!saved.became_approved) {
                return res.json({ success: true, data: { order_id: saved.id, status: k.order.status, purchase_sent: false } });
            }
            // Regras do Purchase configuradas em Tracking → Pixel (valor e produtos).
            let settings = normalizeSalesSettings(null);
            try {
                const [row] = await query<any>(`SELECT sales_settings FROM tracking_sources WHERE id = $1`, [source.id]);
                settings = normalizeSalesSettings(row?.sales_settings);
            } catch { /* coluna ainda não migrada → padrão */ }
            if (settings.purchase_products.length && !settings.purchase_products.includes(String(k.order.product_name || '').trim())) {
                logger.info('webhook Kiwify: produto fora do filtro do Purchase, só registrando pedido', { order: saved.id, product: k.order.product_name });
                return res.json({ success: true, data: { order_id: saved.id, status: k.order.status, purchase_sent: false, reason: 'produto fora do filtro' } });
            }
            if (settings.purchase_value === 'net' && k.order.net_value != null) k.purchase.value = k.order.net_value;
            b = k.purchase;
            orderRecordId = saved.id;
        }

        // ── DataCrazy: automação manda só IDs (leadId/businessId/stageId) ──
        // A DataCrazy não deixa customizar o JSON com dados do lead direto na
        // automação (só IDs) — buscamos telefone/nome via lead e o valor da
        // venda via business (endpoint separado, `total`) usando a API key já
        // salva na fonte.
        if (source.crm_type === 'datacrazy' && source.crm_access_token && (b.leadId || b.businessId)) {
            try {
                const adapter = new DataCrazyAdapter(source.crm_access_token);
                let businessTotal: number | undefined;
                let leadId = b.leadId;

                if (b.businessId) {
                    const business = await adapter.fetchBusiness(b.businessId);
                    businessTotal = business?.total ? Number(business.total) : undefined;
                    leadId = leadId || business?.leadId;
                }

                if (leadId) {
                    const lead = await adapter.fetchLead(leadId);
                    const extracted = adapter.extractUserData(lead);
                    b.user = {
                        ...(b.user || {}),
                        phone: b.user?.phone || b.phone || extracted.phone,
                        email: b.user?.email || b.email || extracted.email,
                        first_name: b.user?.first_name || b.first_name || extracted.first_name,
                        last_name: b.user?.last_name || b.last_name || extracted.last_name,
                    };
                    b.external_id = b.external_id || extracted.external_id;
                }
                if (businessTotal != null && !b.value) b.value = businessTotal;

                logger.info('DataCrazy: lead/negócio enriquecido via API', {
                    source: source.id, leadId, businessId: b.businessId,
                    has_phone: !!b.user?.phone, has_value: !!b.value,
                });
            } catch (e: any) {
                logger.warn('DataCrazy fallback API falhou', { leadId: b.leadId, businessId: b.businessId, error: e.message });
            }
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

        // event_id determinístico se o webhook não passar (evita dedupe falho):
        // se tivermos external_id (ex: kommo_lead_id), montamos um id estável
        // pra que dispares repetidos do Salesbot batam na proteção de dedupe.
        const derivedEventId = b.event_id
            || (b.external_id && b.event ? `${b.external_id}-${b.event}` : null);

        const event: TrackingEventInput = {
            event_name: b.event || b.event_name,
            event_id: derivedEventId,
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
                // Atribuição (Meta não hasha)
                ctwa_clid: b.user?.ctwa_clid,
                fbc: b.user?.fbc,
                fbp: b.user?.fbp,
                gclid: b.user?.gclid,
                page_id: b.user?.page_id,
            },
            session_id: b.session_id,
        };

        if (!event.event_name) {
            return res.status(400).json({ success: false, error: { message: 'event obrigatório' } });
        }

        // Pedido de checkout (Kiwify etc.) já traz campanha/conjunto/anúncio
        // pelos ids das UTMs — vira "Origem da venda" do evento.
        if (b.campaign) event.campaign = b.campaign;

        // Enriquecimento: se o phone já está em tracking_whatsapp_leads,
        // é um lead que veio de anúncio WhatsApp → anexa ctwa_clid + page_id
        // e converte action_source pra business_messaging. Isso faz a Meta
        // atribuir a conversão (ex: Purchase) ao clique específico do anúncio.
        if (event.user_data?.phone) {
            try {
                const wa = await findWhatsAppLeadByPhone(source.id, event.user_data.phone);
                if (wa?.ctwa_clid) {
                    event.user_data.ctwa_clid = wa.ctwa_clid;
                    if (wa.page_id) event.user_data.page_id = wa.page_id;
                    event.action_source = 'business_messaging';
                    event.messaging_channel = 'whatsapp';
                }
                // "Origem da venda": se o lead original veio de um anúncio com
                // campanha/conjunto resolvidos, propaga pra esse evento também
                // (ex: a venda herda a mesma campanha do lead que a originou).
                if (wa?.meta_campaign_id) {
                    event.campaign = {
                        meta_campaign_id: wa.meta_campaign_id,
                        meta_campaign_name: wa.meta_campaign_name || undefined,
                        meta_adset_id: wa.meta_adset_id || undefined,
                        meta_adset_name: wa.meta_adset_name || undefined,
                        meta_ad_id: wa.ad_source_id || undefined,
                        meta_ad_name: wa.ad_name || undefined,
                    };
                }
            } catch (e: any) {
                logger.warn('enrich whatsapp falhou', { error: e.message });
            }
        }

        // Resolução de atribuição: só roda se o CRM NÃO ecoou um click ID
        // explícito (fbc/fbp/gclid/ctwa_clid) — tenta achar o clique de origem
        // via session_id, hash de contato ou IP+tempo (ver attribution-resolver.ts).
        // Nunca bloqueia o envio pra Meta, só enriquece quando encontra algo.
        let attribution: { confidence: string; reason: string; clickId: string | null } | null = null;
        const hasExplicitClickId = !!(event.user_data?.fbc || event.user_data?.fbp || event.user_data?.gclid || event.user_data?.ctwa_clid);
        if (!hasExplicitClickId) {
            try {
                const result = await resolveClickAttribution(source.id, {
                    session_id: event.session_id,
                    phone: event.user_data?.phone,
                    email: event.user_data?.email,
                    client_ip: event.user_data?.client_ip,
                    eventTimeSec: event.event_time || Math.floor(Date.now() / 1000),
                });
                attribution = { confidence: result.confidence, reason: result.reason, clickId: result.click?.id || null };
                if (result.click) {
                    // Formato oficial de reconstrução do fbc a partir de um fbclid
                    // armazenado (documentado pela Meta): fb.1.<creation_time_ms>.<fbclid>.
                    // Usa o horário REAL do clique (created_at), nunca "agora".
                    if (result.click.fbclid) {
                        const clickMs = new Date(result.click.created_at).getTime();
                        event.user_data!.fbc = `fb.1.${clickMs}.${result.click.fbclid}`;
                    }
                    if (result.click.gclid) event.user_data!.gclid = result.click.gclid;
                    if (result.click.gbraid) event.user_data!.gbraid = result.click.gbraid;
                    if (result.click.wbraid) event.user_data!.wbraid = result.click.wbraid;
                    event.custom_data = {
                        ...(event.custom_data || {}),
                        ...(result.click.utm_source ? { utm_source: result.click.utm_source } : {}),
                        ...(result.click.utm_campaign ? { utm_campaign: result.click.utm_campaign } : {}),
                    };
                }
            } catch (e: any) {
                logger.warn('attribution resolver falhou', { error: e.message });
            }
        }

        const r = await trackEvent(source, event);
        if (orderRecordId && r.event_id) await linkOrderPurchaseEvent(orderRecordId, r.event_id);

        // Stampa o resultado da atribuição no evento já persistido — feito à
        // parte pra não mexer no INSERT principal de trackEvent(). Nunca falha
        // o request se der erro aqui, é só metadado de auditoria.
        if (attribution) {
            try {
                await query(
                    `UPDATE tracking_events
                     SET attribution_confidence = $1, attribution_reason = $2, attribution_click_id = $3
                     WHERE source_id = $4 AND event_id = $5`,
                    [attribution.confidence, attribution.reason, attribution.clickId, source.id, r.event_id]
                );
            } catch (e: any) {
                logger.warn('attribution: falha ao stampar evento', { error: e.message });
            }
        }

        // Se for Purchase pra lead WhatsApp, registra no whatsapp_lead
        if (event.event_name === 'Purchase' && event.user_data?.phone && event.value) {
            try {
                await recordPurchaseForWhatsAppLead(
                    source.id, event.user_data.phone, Number(event.value),
                    event.user_data.external_id || null, r.event_id
                );
            } catch { /* não bloqueia */ }
        }

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
async function normalizeKommoPayload(body: any, eventHintFromQuery: string, source: any): Promise<any | null> {
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
        //   custom_fields: { '0': { name: 'E-mail', code: 'EMAIL', values: { '0': { value: 'x@y.com' } } } }
        // Busca PRIMEIRO por field_code (PHONE, EMAIL — códigos padrão ignoram idioma),
        // depois por field_name (busca case-insensitive).
        const extractField = (obj: any, needles: string[], codes: string[] = []): string | undefined => {
            const raw = obj?.custom_fields || obj?.custom_fields_values || obj?.customFields;
            if (!raw) return undefined;
            const fieldArr = Array.isArray(raw) ? raw : Object.values(raw);

            const tryValue = (f: any): string | undefined => {
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
                return undefined;
            };

            // 1ª passada: por field_code (PHONE, EMAIL — padrão do Kommo)
            if (codes.length > 0) {
                for (const f of fieldArr) {
                    if (!f || typeof f !== 'object') continue;
                    const code = String((f as any).code || (f as any).field_code || '').toUpperCase();
                    if (!codes.includes(code)) continue;
                    const v = tryValue(f);
                    if (v) return v;
                }
            }

            // 2ª passada: por field_name (substring)
            for (const f of fieldArr) {
                if (!f || typeof f !== 'object') continue;
                const fname = String((f as any).name || (f as any).field_name || '').toLowerCase();
                if (!needles.some(n => fname.includes(n))) continue;
                const v = tryValue(f);
                if (v) return v;
            }
            return undefined;
        };

        const email = extractField(contact, ['email', 'e-mail'], ['EMAIL']) || extractField(lead, ['email'], ['EMAIL']);
        const phone =
            extractField(contact, ['telefone', 'phone', 'celular', 'whatsapp', 'móvel', 'movel'], ['PHONE', 'MOB', 'WORK_PHONE'])
            || extractField(lead, ['phone', 'telefone'], ['PHONE']);
        const firstName = String(contact.first_name || contact.name || '').split(' ')[0] || undefined;
        const lastName = String(contact.last_name || contact.name || '').split(' ').slice(1).join(' ') || undefined;

        // Procura parâmetros de atribuição se o Kommo tiver custom_fields com esses nomes.
        // Ajuda quando a agência automatiza o preenchimento via n8n/bot pra não depender
        // só do fluxo do Evolution API.
        const ctwaClid =
            extractField(lead, ['ctwa_clid', 'ctwaclid', 'ctwa']) ||
            extractField(contact, ['ctwa_clid', 'ctwaclid', 'ctwa']);
        const fbclid =
            extractField(lead, ['fbclid', 'fb_click']) ||
            extractField(contact, ['fbclid', 'fb_click']);
        const fbc =
            extractField(lead, ['fbc', '_fbc']) ||
            extractField(contact, ['fbc', '_fbc']);
        const fbp =
            extractField(lead, ['fbp', '_fbp']) ||
            extractField(contact, ['fbp', '_fbp']);
        const utmSource = extractField(lead, ['utm_source', 'utm source']);
        const utmCampaign = extractField(lead, ['utm_campaign', 'utm campaign', 'campanha']);
        const utmMedium = extractField(lead, ['utm_medium', 'utm medium']);
        const utmContent = extractField(lead, ['utm_content', 'utm content']);
        const utmTerm = extractField(lead, ['utm_term', 'utm term']);
        const adSourceId =
            extractField(lead, ['ad_id', 'adid', 'source_id', 'ad source id']) ||
            extractField(contact, ['ad_id', 'adid', 'source_id']);

        // Evento: vem da query (?event=Purchase) OU classificado pelo nome real
        // do estágio no Kommo (mesma regra que o cron diário já usa —
        // KommoAdapter.classifyStatus — pra não ter dois critérios diferentes
        // dizendo coisas diferentes sobre o mesmo estágio). Só cai no heurístico
        // antigo (add→Lead, price>0→Purchase, senão Contact) quando a
        // classificação por estágio não reconhece nada.
        let eventName = eventHintFromQuery.trim();
        if (!eventName && lead.pipeline_id && lead.status_id
            && source.crm_type === 'kommo' && source.crm_subdomain && source.crm_access_token) {
            try {
                const adapter = new KommoAdapter(source.crm_subdomain, source.crm_access_token);
                const classified = await adapter.classifyStatus(Number(lead.pipeline_id), Number(lead.status_id));
                if (classified) eventName = classified;
            } catch (e: any) {
                logger.warn('Kommo: falha ao classificar estágio via API', { source: source.id, error: e.message });
            }
        }
        if (!eventName) {
            const price = Number(lead.price || 0);
            if (leads.add && leadBlocks.length > 0) eventName = 'Lead';
            else if (price > 0) eventName = 'Purchase';
            else eventName = 'Contact';
        }

        return {
            event: eventName,
            external_id: `kommo-${lead.id}`,
            // Estável (sem timestamp) — deixa o dedupe de trackEvent() barrar
            // disparos repetidos do mesmo lead+evento (Kommo às vezes manda o
            // mesmo webhook mais de uma vez pra uma única mudança de estágio).
            event_id: `kommo-${lead.id}-${eventName}`,
            value: Number(lead.price || 0) || undefined,
            currency: lead.price ? 'BRL' : undefined,
            user: {
                email, phone, first_name: firstName, last_name: lastName,
                // Atribuição — propagam para user_data do Meta (não hashados)
                ctwa_clid: ctwaClid,
                fbc: fbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined),
                fbp,
            },
            custom_data: {
                kommo_lead_id: lead.id,
                kommo_status_id: lead.status_id,
                kommo_pipeline_id: lead.pipeline_id,
                kommo_responsible_user_id: lead.responsible_user_id,
                source: 'kommo',
                ...(utmSource   && { utm_source: utmSource }),
                ...(utmCampaign && { utm_campaign: utmCampaign }),
                ...(utmMedium   && { utm_medium: utmMedium }),
                ...(utmContent  && { utm_content: utmContent }),
                ...(utmTerm     && { utm_term: utmTerm }),
                ...(adSourceId  && { ad_source_id: adSourceId }),
            },
        };
    } catch (err: any) {
        logger.warn('tracking webhook: normalização Kommo falhou', { error: err.message });
        return null;
    }
}

// ── Normalizador Kiwify ─────────────────────────────────────────────────
// Todo webhook vira/atualiza um pedido (status mapeado abaixo); o Purchase
// pra Meta só sai quando o pedido vira aprovado (ver chamador). Carrinho
// abandonado não é pedido — ignora. Status desconhecido: não assume nada.
function mapKiwifyStatus(raw: string): OrderStatus | 'skip' | null {
    const s = raw.toLowerCase();
    if (!s) return null;
    if (s.includes('carrinho_abandonado') || s.includes('abandoned')) return 'skip'; // tratado antes, em normalizeKiwifyAbandoned
    if (s.includes('late') || s.includes('atrasad') || s.includes('overdue')) return 'pending';
    if (s.includes('chargeback') || s.includes('chargedback')) return 'chargeback';
    if (s.includes('reembols') || s.includes('refund')) return 'refunded';
    if (s.includes('recusad') || s.includes('refused')) return 'refused';
    if (s.includes('cancel')) return 'canceled';
    if (s.includes('aprovad') || s === 'paid' || s === 'approved' || s === 'completed' || s.includes('renewed')) return 'approved';
    if (s.includes('waiting') || s.includes('pending') || s.includes('pix_gerado') || s.includes('boleto_gerado') || s.includes('processing')) return 'pending';
    return null;
}

// Kiwify trabalha em centavos em toda a API (charge_amount, net_amount,
// product_base_price, my_commission) — inteiro ou string de inteiro.
function kiwifyCents(v: any): number | undefined {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n / 100 : undefined;
}

/** Carrinho abandonado da Kiwify: sem order_id, com link do checkout ou status de abandono. */
function isKiwifyAbandonedPayload(body: any): boolean {
    const marker = String(body.webhook_event_type || body.status || body.order_status || body.event_type || '').toLowerCase();
    if (/abandon/.test(marker)) return true;
    return !body.order_id && !!(body.checkout_link || body.checkout_url);
}

function normalizeKiwifyAbandoned(body: any): NormalizedOrder | null {
    const customer = body.Customer || body.customer || {};
    const product = body.Product || body.product || {};
    const pick = (...vals: any[]) => vals.map(v => (v == null ? '' : String(v).trim())).find(Boolean) || undefined;
    const email = pick(body.email, customer.email, customer.Email);
    const phone = pick(body.phone, body.mobile, customer.mobile, customer.phone, customer.Phone);
    const name = pick(body.name, body.full_name, customer.full_name, customer.name);
    const checkoutUrl = pick(body.checkout_link, body.checkout_url);
    // Sem id próprio: usa o id do carrinho; senão e-mail/telefone + produto
    // (o mesmo cliente abandonando o mesmo produto de novo atualiza a linha).
    const productId = pick(body.product_id, product.product_id, product.id);
    const cartId = pick(body.id, body.cart_id, body.checkout_id)
        || (email || phone ? `${email || phone}:${productId || pick(body.product_name, product.product_name) || ''}` : undefined);
    if (!cartId) return null;
    const tracking = body.TrackingParameters || body.tracking || {};
    return {
        platform: 'kiwify',
        external_order_id: `cart-${cartId}`,
        status: 'abandoned',
        product_id: productId,
        product_name: pick(body.product_name, product.product_name, product.name, body.offer_name),
        gross_value: kiwifyCents(body.charge_amount) ?? kiwifyCents(body.price) ?? kiwifyCents(body.amount),
        currency: 'BRL',
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        checkout_url: checkoutUrl,
        utm_source: tracking.utm_source || undefined,
        utm_medium: tracking.utm_medium || undefined,
        utm_campaign: tracking.utm_campaign || undefined,
        utm_content: tracking.utm_content || undefined,
        utm_term: tracking.utm_term || undefined,
        sck: tracking.sck || body.sck || undefined,
        order_created_at: pick(body.created_at, body.abandoned_at),
        raw: body,
    };
}

/** Payload fictício do botão "Testar" do webhook da Kiwify. */
function isKiwifyTestPayload(body: any): boolean {
    const customer = body.Customer || body.customer || {};
    const product = body.Product || body.product || {};
    const email = String(customer.email || '').toLowerCase();
    return email.endsWith('@example.com') || String(product.product_name || '').trim() === 'Example product';
}

function normalizeKiwifyPayload(body: any): { order: NormalizedOrder; purchase: any } | null {
    const rawStatus = String(body.order_status || body.webhook_event_type || body.status || body.Status || '').trim();
    const status = mapKiwifyStatus(rawStatus);
    if (status === 'skip') return null;
    if (!status) {
        logger.warn('webhook Kiwify: status não reconhecido, ignorando', { status: rawStatus });
        return null;
    }

    const orderId = String(body.order_id || body.id || body.order?.id || body.order_ref || '').trim();
    if (!orderId) {
        logger.warn('webhook Kiwify: sem order_id, ignorando');
        return null;
    }

    const customer = body.Customer || body.customer || {};
    const tracking = body.TrackingParameters || body.tracking || body.Tracking || {};
    const product = body.Product || body.product || {};
    const commissions = body.Commissions || body.commissions || {};

    const email = customer.email || customer.Email || undefined;
    const phone = customer.mobile || customer.Mobile || customer.phone || customer.Phone || undefined;
    const fullName = String(customer.full_name || customer.fullName || customer.name || customer.Name || '').trim();
    const [firstName, ...lastParts] = fullName.split(/\s+/);

    const gross = kiwifyCents(commissions.charge_amount) ?? kiwifyCents(body.payment?.charge_amount)
        ?? kiwifyCents(body.charge_amount) ?? kiwifyCents(commissions.product_base_price);
    const net = kiwifyCents(commissions.my_commission) ?? kiwifyCents(body.net_amount) ?? kiwifyCents(body.payment?.net_amount);
    logger.info('webhook Kiwify: valores resolvidos', { order: orderId, status, gross, net });

    const utm = {
        utm_source: tracking.utm_source || undefined,
        utm_medium: tracking.utm_medium || undefined,
        utm_campaign: tracking.utm_campaign || undefined,
        utm_content: tracking.utm_content || undefined,
        utm_term: tracking.utm_term || undefined,
    };
    const ids = metaIdsFromUtms(utm);
    const sck = tracking.sck || undefined;

    const order: NormalizedOrder = {
        platform: 'kiwify',
        external_order_id: orderId,
        status,
        payment_method: normalizePaymentMethod(body.payment_method || body.PaymentMethod),
        product_id: product.product_id || product.id || undefined,
        product_name: product.product_name || product.name || body.product_name || undefined,
        gross_value: gross,
        net_value: net,
        currency: body.currency || 'BRL',
        customer_name: fullName || undefined,
        customer_email: email,
        customer_phone: phone,
        ...utm,
        sck,
        order_created_at: body.created_at || undefined,
        approved_at: status === 'approved' ? (body.approved_date || undefined) : undefined,
        refunded_at: status === 'refunded' || status === 'chargeback' ? (body.refunded_at || undefined) : undefined,
        raw: body,
    };

    const purchase = {
        event: 'Purchase',
        external_id: `kiwify-${orderId}`,
        event_id: `kiwify-${orderId}-Purchase`,
        value: gross ?? net,
        currency: order.currency,
        user: {
            email, phone,
            first_name: firstName || undefined,
            last_name: lastParts.length ? lastParts.join(' ') : undefined,
        },
        custom_data: {
            source: 'kiwify',
            order_id: orderId,
            content_name: order.product_name,
            ...(utm.utm_source && { utm_source: utm.utm_source }),
            ...(utm.utm_campaign && { utm_campaign: utm.utm_campaign }),
            ...(utm.utm_medium && { utm_medium: utm.utm_medium }),
            ...(utm.utm_content && { utm_content: utm.utm_content }),
            ...(utm.utm_term && { utm_term: utm.utm_term }),
        },
        campaign: ids.meta_campaign_id ? {
            meta_campaign_id: ids.meta_campaign_id,
            meta_adset_id: ids.meta_adset_id || undefined,
            meta_ad_id: ids.meta_ad_id || undefined,
        } : undefined,
        // sck = session_id do nosso pixel (injetado no link do checkout) →
        // atribuição de alta confiança via attribution-resolver.
        session_id: sck,
    };

    return { order, purchase };
}

function buildPixelScript(token: string, apiBase: string, pixelId: string | null): string {
    return `/* TrafficAI Pixel · token=${token} · v2 */
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
  // Detecta domínio "raiz" do site pra cookie compartilhado entre subdomínios.
  // Suporta TLDs compostos comuns (com.br, co.uk, com.au, etc).
  function rootDomain(){
    var host = window.location.hostname || '';
    if (!host || host === 'localhost' || /^[\\d.]+$/.test(host)) return host;
    var parts = host.split('.');
    if (parts.length <= 2) return host;
    // TLDs de 2 níveis conhecidos
    var multi = ['com.br','com.au','co.uk','co.jp','co.za','com.mx','com.ar','com.co','net.br','org.br','gov.br','com.pt','com.es'];
    var last2 = parts.slice(-2).join('.');
    if (multi.indexOf(last2) !== -1) return parts.slice(-3).join('.');
    return last2;
  }
  function setCookie(name, value, days){
    var exp = new Date(Date.now() + days*86400000).toUTCString();
    var root = rootDomain();
    var attrs = '; expires=' + exp + '; path=/; SameSite=Lax';
    if (root && root.indexOf('.') !== -1) attrs += '; domain=.' + root;
    document.cookie = name + '=' + encodeURIComponent(value) + attrs;
  }
  // UUID robusto — usa crypto se disponível, senão fallback de alta entropia.
  function uuid(){
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
    var rnd;
    if (crypto && crypto.getRandomValues) {
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var hex = Array.prototype.map.call(b, function(x){ return ('0' + x.toString(16)).slice(-2); }).join('');
      return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    }
    rnd = function(){ return Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0'); };
    return rnd()+rnd()+'-'+rnd()+'-4'+rnd().slice(0,3)+'-'+rnd()+'-'+rnd()+rnd()+rnd();
  }

  // ── Session ID — único por sessão de browsing, sobrevive a navegação SPA ──
  var SESSION_KEY = '__tai_session__';
  function getSession(){
    try {
      var sid = sessionStorage.getItem(SESSION_KEY);
      if (!sid) { sid = uuid(); sessionStorage.setItem(SESSION_KEY, sid); }
      return sid;
    } catch(e) {
      // Sem sessionStorage (privacidade extrema): gera por load.
      if (!window.__taiSid) window.__taiSid = uuid();
      return window.__taiSid;
    }
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
  // Google Ads — persistido em cookie próprio (_tai_gclid) por 90 dias.
  function captureGclid(){
    var params = new URLSearchParams(window.location.search);
    var gc = params.get('gclid');
    if (gc) {
      setCookie('_tai_gclid', gc, 90);
      return gc;
    }
    return getCookie('_tai_gclid');
  }
  // gbraid (app→web, iOS 14.5+) e wbraid (web→app) — mesmo padrão do gclid.
  function captureGbraid(){
    var params = new URLSearchParams(window.location.search);
    var gb = params.get('gbraid');
    if (gb) { setCookie('_tai_gbraid', gb, 90); return gb; }
    return getCookie('_tai_gbraid');
  }
  function captureWbraid(){
    var params = new URLSearchParams(window.location.search);
    var wb = params.get('wbraid');
    if (wb) { setCookie('_tai_wbraid', wb, 90); return wb; }
    return getCookie('_tai_wbraid');
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
      gbraid: sp.get('gbraid') || undefined,
      wbraid: sp.get('wbraid') || undefined,
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
      gclid: captureGclid(),
      gbraid: captureGbraid(),
      wbraid: captureWbraid(),
      session_id: getSession(),
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
  var initParams = parseParams();
  var hasTraffic = initParams.fbclid || initParams.gclid || initParams.gbraid || initParams.wbraid || initParams.utm_source || initParams.utm_campaign;
  if (hasTraffic) {
    send(EP_CLICK, Object.assign({}, initParams, {
      landing_page: window.location.href,
      referrer: document.referrer || null,
      session_id: getSession(),
    }));
  }

  // ── UTMs persistidas + decoração de links de checkout ──────────────────
  // Plataformas de checkout (Kiwify, Hotmart, Eduzz...) devolvem no webhook
  // de venda as UTMs e o sck que estavam NO LINK DO CHECKOUT. O botão
  // "Comprar" da página normalmente não carrega as UTMs do anúncio — então
  // guardamos as UTMs da chegada (30 dias, último toque) e anexamos UTMs +
  // sck=<session_id> em todo link que aponte pra um checkout. É o que liga a
  // venda ao clique/campanha de origem.
  var UTM_KEY = '__tai_utms__';
  var UTM_FIELDS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  function saveUtms(p){
    var has = false, data = {};
    UTM_FIELDS.forEach(function(f){ if (p[f]) { data[f] = p[f]; has = true; } });
    if (!has) return;
    data._ts = Date.now();
    try { localStorage.setItem(UTM_KEY, JSON.stringify(data)); } catch(e){}
  }
  function getUtms(){
    try {
      var d = JSON.parse(localStorage.getItem(UTM_KEY) || 'null');
      if (d && Date.now() - d._ts < 30*86400000) return d;
    } catch(e){}
    return null;
  }
  saveUtms(initParams);

  var CHECKOUT_HOSTS = /kiwify|hotmart|eduzz|monetizze|cakto|hub\\.la|perfectpay|braip|ticto|greenn|payt/i;
  function isCheckoutLink(el){
    if (!el || !el.href) return false;
    if (el.hasAttribute && el.hasAttribute('data-tai-checkout')) return true;
    try {
      var h = new URL(el.href, window.location.href).hostname;
      return h !== window.location.hostname && CHECKOUT_HOSTS.test(h);
    } catch(e){ return false; }
  }
  function decorate(url){
    try {
      var u = new URL(url, window.location.href);
      var utms = getUtms() || {};
      UTM_FIELDS.forEach(function(f){ if (utms[f] && !u.searchParams.get(f)) u.searchParams.set(f, utms[f]); });
      if (!u.searchParams.get('sck')) u.searchParams.set('sck', getSession());
      return u.toString();
    } catch(e){ return url; }
  }
  function decorateAll(){
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (isCheckoutLink(links[i])) links[i].href = decorate(links[i].href);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateAll);
  else decorateAll();
  // Páginas que montam o botão depois (builders, SPA) — redecora em mudanças
  try {
    var decorTimer = null;
    new MutationObserver(function(){
      if (decorTimer) return;
      decorTimer = setTimeout(function(){ decorTimer = null; decorateAll(); }, 400);
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch(e){}

  var checkoutTracked = false;
  document.addEventListener('click', function(e){
    var el = e.target;
    while (el && el !== document) {
      if (el.tagName === 'A' && isCheckoutLink(el)) {
        el.href = decorate(el.href);
        if (!checkoutTracked) { checkoutTracked = true; track('InitiateCheckout', { custom_data: { checkout_url: el.href.split('?')[0] } }); }
        return;
      }
      el = el.parentNode;
    }
  }, true);

  // ── Auto-scroll tracking (50% e 90%) — reseta a cada PageView SPA ─────
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

  // ── SPA navigation tracking ──────────────────────────────────────────
  // Detecta mudança de rota client-side (pushState / replaceState / popstate)
  // e dispara PageView novo — Next.js, React Router, Vue Router, etc.
  var lastUrl = window.location.href;
  function onRouteChange(){
    var cur = window.location.href;
    if (cur === lastUrl) return;
    lastUrl = cur;
    // Reset scroll marks pra nova "página"
    scrollMarks = { 50:false, 90:false };
    track('PageView');
  }
  try {
    var _push = history.pushState;
    history.pushState = function(){
      var r = _push.apply(this, arguments);
      setTimeout(onRouteChange, 0);
      return r;
    };
    var _replace = history.replaceState;
    history.replaceState = function(){
      var r = _replace.apply(this, arguments);
      setTimeout(onRouteChange, 0);
      return r;
    };
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
  } catch(e){ /* monkey-patch falhou — sem SPA tracking */ }

  // ── API pública ───────────────────────────────────────────────────────
  window.TrafficAI = {
    _loaded: true,
    _version: 2,
    track: track,
    identify: setIdent,
    sessionId: getSession,
    // Pra checkout em domínio próprio/não detectado: TrafficAI.checkoutUrl(url)
    checkoutUrl: decorate,
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
