// ==============================
// TrafficAI — Webhooks de Hotmart, Eduzz, Cakto e Zouti
// Cada plataforma vira o mesmo NormalizedOrder da Kiwify; daqui o fluxo é um
// só (pedido, Purchase na Meta só na aprovação, notificação, recuperação).
//
// Formatos (conferidos em out/2026):
//  - Hotmart 2.0.0: { id, event: 'PURCHASE_*', data: { buyer, product, purchase{ transaction,
//    status, price{value}, payment{type}, order_date, approved_date, origin{sck,src,xcod} },
//    commissions[] } } — datas em epoch ms.
//  - Eduzz (MyEduzz): { event: 'myeduzz.invoice_*', data: { id, status, buyer, items[], price,
//    paid, paymentMethod, utm{source,campaign,medium,content,term}, tracker{code1..3},
//    createdAt, paidAt } }; carrinho: event 'sun.cart_abandonment'.
//  - Cakto: { secret, event, data: { id, refId, customer, product, offer, amount, baseAmount,
//    fees, commissions[], paymentMethod, status, checkoutUrl, createdAt, paidAt } }.
//  - Zouti: { event: 'ORDER_PAID'|'ORDER_REFUNDED'|etc, order_id, customer{name,email,phone},
//    amount, currency, product{name,id}, payment_method, utm{...}, sck, created_at, paid_at }
//    Validação HMAC-SHA256 via header x-zouti-signature (t=timestamp,v1=hash).
// ==============================

import { NormalizedOrder, OrderStatus, normalizePaymentMethod, metaIdsFromUtms } from './sales-orders.service';

export type Platform = 'hotmart' | 'eduzz' | 'cakto' | 'zouti' | 'other';

export type PlatformResult =
    | { kind: 'order'; order: NormalizedOrder }
    | { kind: 'cart'; order: NormalizedOrder }
    | { kind: 'test' }
    | { kind: 'ignore'; reason: string };

const pick = (...vals: any[]): string | undefined =>
    vals.map(v => (v == null ? '' : String(v).trim())).find(Boolean) || undefined;

const num = (v: any): number | undefined => {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** epoch (ms ou s) ou string → ISO */
const iso = (v: any): string | undefined => {
    if (v == null || v === '') return undefined;
    if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) {
        const n = Number(v);
        return new Date(n < 1e12 ? n * 1000 : n).toISOString();
    }
    const d = new Date(String(v).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** Pedido de teste das plataformas (dados de exemplo). */
function looksLikeTest(email?: string, product?: string): boolean {
    const e = String(email || '').toLowerCase();
    return e.endsWith('@example.com') || /test(e)?\s*(de\s*)?postback|webhook example/i.test(String(product || ''));
}

function utmFrom(src: any) {
    const s = src || {};
    return {
        utm_source: pick(s.utm_source, s.source, s.utmSource),
        utm_medium: pick(s.utm_medium, s.medium, s.utmMedium),
        utm_campaign: pick(s.utm_campaign, s.campaign, s.utmCampaign),
        utm_content: pick(s.utm_content, s.content, s.utmContent),
        utm_term: pick(s.utm_term, s.term, s.utmTerm),
    };
}

// ─── Detecção ───────────────────────────────────────────────────────────
const CAKTO_EVENTS = new Set([
    'initiate_checkout', 'checkout_abandonment', 'purchase_approved', 'purchase_refused', 'pix_gerado', 'boleto_gerado',
    'picpay_gerado', 'openfinance_nubank_gerado', 'chargeback', 'refund', 'refund_requested',
    'subscription_created', 'subscription_canceled', 'subscription_renewed', 'subscription_renewal_refused',
    'subscription_paused', 'subscription_resumed', 'subscription_late', 'subscription_late_recovered',
]);

// Zouti: eventos em UPPER_SNAKE_CASE com order_id no corpo.
// Documentação pública indisponível — formato inferido do exemplo do usuário
// ({ event: 'ORDER_PAID', order_id: 'ord_abc' }) + padrão de gateways BR.
// O parser é tolerante e loga o payload bruto pra ajuste fino no 1º evento real.
const ZOUTI_EVENTS = new Set([
    'ORDER_PAID', 'ORDER_REFUNDED', 'ORDER_CANCELED', 'ORDER_CANCELLED',
    'ORDER_CHARGEBACK', 'ORDER_PENDING', 'ORDER_EXPIRED', 'ORDER_CREATED',
    'ORDER_APPROVED', 'ORDER_REJECTED', 'ORDER_DECLINED',
]);

export function detectPlatform(b: any): Platform | null {
    if (!b || typeof b !== 'object') return null;
    const ev = String(b.event || '');
    if (/^PURCHASE_|^SUBSCRIPTION_CANCELLATION$|^SWITCH_PLAN$/.test(ev) && b.data && typeof b.data === 'object') return 'hotmart';
    if (/^myeduzz\.invoice_|^sun\.cart_abandonment$/.test(ev)) return 'eduzz';
    if (CAKTO_EVENTS.has(ev) && b.data && typeof b.data === 'object') return 'cakto';
    if (ZOUTI_EVENTS.has(ev) && (b.order_id || b.id)) return 'zouti';
    // Formato próprio do TrafficAI pra qualquer outro checkout/automação (n8n, Make…)
    if (ev === 'order' && (b.order_id || b.id)) return 'other';
    return null;
}

export function parsePlatformWebhook(platform: Platform, b: any): PlatformResult {
    switch (platform) {
        case 'hotmart': return parseHotmart(b);
        case 'eduzz': return parseEduzz(b);
        case 'cakto': return parseCakto(b);
        case 'zouti': return parseZouti(b);
        case 'other': return parseGeneric(b);
    }
}

// ─── Hotmart ────────────────────────────────────────────────────────────
function hotmartStatus(ev: string, status: string, payType: string): OrderStatus | 'cart' | null {
    const e = ev.toUpperCase(), s = status.toUpperCase();
    if (e === 'PURCHASE_OUT_OF_SHOPPING_CART') return 'cart';
    if (e === 'PURCHASE_CHARGEBACK' || s === 'CHARGEBACK') return 'chargeback';
    if (e === 'PURCHASE_REFUNDED' || s === 'REFUNDED') return 'refunded';
    if (e === 'PURCHASE_APPROVED' || e === 'PURCHASE_COMPLETE' || s === 'APPROVED' || s === 'COMPLETE') return 'approved';
    if (e === 'PURCHASE_CANCELED' || s === 'CANCELED' || s === 'CANCELLED') return /CARD/i.test(payType) ? 'refused' : 'canceled';
    if (e === 'PURCHASE_EXPIRED' || s === 'EXPIRED') return 'canceled';
    if (e === 'PURCHASE_BILLET_PRINTED' || e === 'PURCHASE_DELAYED' || /WAITING|PRINTED|DELAYED|STARTED/.test(s)) return 'pending';
    return null; // PURCHASE_PROTEST (pedido de reembolso), troca de plano etc.: só registra no log
}

function parseHotmart(b: any): PlatformResult {
    const d = b.data || {};
    const buyer = d.buyer || d.subscriber || {};
    const product = d.product || {};
    const purchase = d.purchase || {};
    const payType = String(purchase.payment?.type || '');
    if (looksLikeTest(buyer.email, product.name)) return { kind: 'test' };
    const st = hotmartStatus(String(b.event || ''), String(purchase.status || ''), payType);
    if (!st) return { kind: 'ignore', reason: `evento ${b.event} sem mudança de pedido` };

    const phone = pick(buyer.checkout_phone, typeof buyer.phone === 'string' ? buyer.phone : undefined,
        buyer.phone?.dddCell && buyer.phone?.cell ? `${buyer.phone.dddCell}${buyer.phone.cell}` : undefined);
    const origin = purchase.origin || {};
    const producerCut = Array.isArray(d.commissions) ? d.commissions.find((c: any) => /PRODUCER/i.test(String(c.source || ''))) : null;

    if (st === 'cart') {
        const key = pick(buyer.email, phone);
        if (!key) return { kind: 'ignore', reason: 'carrinho sem contato' };
        return {
            kind: 'cart',
            order: {
                platform: 'hotmart', external_order_id: `cart-${key}:${pick(product.id) || ''}`, status: 'abandoned',
                product_id: pick(product.id), product_name: pick(product.name),
                customer_name: pick(buyer.name), customer_email: pick(buyer.email), customer_phone: phone,
                sck: pick(origin.sck, d.origin?.sck), order_created_at: iso(b.creation_date), raw: b,
            },
        };
    }

    const transaction = pick(purchase.transaction, d.transaction);
    if (!transaction) return { kind: 'ignore', reason: 'sem transação' };
    return {
        kind: 'order',
        order: {
            platform: 'hotmart', external_order_id: transaction, status: st,
            payment_method: normalizePaymentMethod(payType),
            product_id: pick(product.id), product_name: pick(product.name),
            gross_value: num(purchase.price?.value) ?? num(purchase.full_price?.value),
            net_value: num(producerCut?.value),
            currency: pick(purchase.price?.currency_value, purchase.price?.currency_code) || 'BRL',
            customer_name: pick(buyer.name), customer_email: pick(buyer.email), customer_phone: phone,
            // Hotmart não repassa utm_*: a campanha vem do clique do nosso pixel pelo sck.
            sck: pick(origin.sck, origin.xcod),
            order_created_at: iso(purchase.order_date), approved_at: st === 'approved' ? iso(purchase.approved_date) : undefined,
            raw: b,
        },
    };
}

// ─── Eduzz ──────────────────────────────────────────────────────────────
function eduzzStatus(ev: string, status: string): OrderStatus | null {
    const k = `${ev} ${status}`.toLowerCase();
    if (/chargeback/.test(k)) return 'chargeback';
    if (/refund/.test(k)) return 'refunded';
    if (/invoice_paid|\bpaid\b/.test(k)) return 'approved';
    if (/canceled|cancelled|expired/.test(k)) return 'canceled';
    if (/waiting_payment|opened|\bopen\b|scheduled|recovering|negotiated/.test(k)) return 'pending';
    return null;
}

function parseEduzz(b: any): PlatformResult {
    const d = b.data || {};
    if (b.event === 'sun.cart_abandonment') {
        const c = d.customer || {};
        if (looksLikeTest(c.email)) return { kind: 'test' };
        const key = pick(d.transactionId, c.email, c.phone);
        if (!key) return { kind: 'ignore', reason: 'carrinho sem identificador' };
        const t = d.tracker || {};
        return {
            kind: 'cart',
            order: {
                platform: 'eduzz', external_order_id: `cart-${key}`, status: 'abandoned',
                product_id: Array.isArray(d.productId) ? pick(d.productId[0]) : pick(d.productId),
                customer_name: pick(c.name), customer_email: pick(c.email), customer_phone: pick(c.phone),
                checkout_url: pick(d.href),
                utm_source: pick(t.utmSource), utm_medium: pick(t.utmMedium), utm_campaign: pick(t.utmCampaign), utm_content: pick(t.utmContent),
                order_created_at: iso(d.updatedAt), raw: b,
            },
        };
    }

    const buyer = d.buyer || {};
    const item = Array.isArray(d.items) ? d.items[0] || {} : {};
    if (looksLikeTest(buyer.email, item.name)) return { kind: 'test' };
    const st = eduzzStatus(String(b.event || ''), String(d.status || ''));
    if (!st) return { kind: 'ignore', reason: `evento ${b.event} sem mudança de pedido` };
    const id = pick(d.id);
    if (!id) return { kind: 'ignore', reason: 'fatura sem id' };
    const pm = String(d.paymentMethod || '').toLowerCase();
    return {
        kind: 'order',
        order: {
            platform: 'eduzz', external_order_id: id, status: st,
            payment_method: /bankslip|boleto|billet/.test(pm) ? 'boleto' : normalizePaymentMethod(pm),
            product_id: pick(item.productId), product_name: pick(item.name, d.offer?.name),
            gross_value: num(d.paid?.value) ?? num(d.price?.value),
            currency: pick(d.paid?.currency, d.price?.currency) || 'BRL',
            customer_name: pick(buyer.name), customer_email: pick(buyer.email), customer_phone: pick(buyer.cellphone, buyer.phone, buyer.phone2),
            ...utmFrom(d.utm),
            // trk do link de checkout (nosso pixel põe a sessão nele) volta em tracker.code1
            sck: pick(d.tracker?.code1),
            order_created_at: iso(d.createdAt), approved_at: st === 'approved' ? iso(d.paidAt) : undefined,
            raw: b,
        },
    };
}

// ─── Cakto ──────────────────────────────────────────────────────────────
function caktoStatus(ev: string): OrderStatus | 'cart' | null {
    switch (ev) {
        case 'purchase_approved': case 'subscription_renewed': case 'subscription_late_recovered': return 'approved';
        case 'pix_gerado': case 'boleto_gerado': case 'picpay_gerado': case 'openfinance_nubank_gerado': case 'subscription_late': return 'pending';
        case 'purchase_refused': case 'subscription_renewal_refused': return 'refused';
        case 'refund': return 'refunded';
        case 'chargeback': return 'chargeback';
        case 'checkout_abandonment': return 'cart';
        default: return null; // initiate_checkout, refund_requested, assinatura criada/pausada…
    }
}

function parseCakto(b: any): PlatformResult {
    const d = b.data || {};
    const c = d.customer || {};
    const product = d.product || {};
    if (looksLikeTest(c.email, product.name)) return { kind: 'test' };
    const st = caktoStatus(String(b.event || ''));
    if (!st) return { kind: 'ignore', reason: `evento ${b.event} sem mudança de pedido` };
    const tracking = { ...(d.tracking || {}), ...(d.utm || {}), ...d };
    const utm = utmFrom(tracking);
    const producerCut = Array.isArray(d.commissions) ? d.commissions.find((x: any) => /producer/i.test(String(x.type || ''))) : null;

    if (st === 'cart') {
        const key = pick(d.id, d.refId, c.email, c.phone);
        if (!key) return { kind: 'ignore', reason: 'carrinho sem identificador' };
        return {
            kind: 'cart',
            order: {
                platform: 'cakto', external_order_id: `cart-${key}`, status: 'abandoned',
                product_id: pick(product.id), product_name: pick(product.name, d.offer?.name),
                gross_value: num(d.amount) ?? num(d.offer?.price),
                customer_name: pick(c.name), customer_email: pick(c.email), customer_phone: pick(c.phone),
                checkout_url: pick(d.checkoutUrl), ...utm, sck: pick(tracking.sck),
                order_created_at: iso(d.createdAt), raw: b,
            },
        };
    }

    const id = pick(d.refId, d.id);
    if (!id) return { kind: 'ignore', reason: 'pedido sem id' };
    return {
        kind: 'order',
        order: {
            platform: 'cakto', external_order_id: id, status: st,
            payment_method: normalizePaymentMethod(d.paymentMethod),
            product_id: pick(product.id), product_name: pick(product.name, d.offer?.name),
            gross_value: num(d.amount) ?? num(d.baseAmount),
            net_value: num(producerCut?.totalAmount),
            currency: 'BRL',
            customer_name: pick(c.name), customer_email: pick(c.email), customer_phone: pick(c.phone),
            checkout_url: pick(d.checkoutUrl),
            ...utm, sck: pick(tracking.sck),
            order_created_at: iso(d.createdAt), approved_at: st === 'approved' ? iso(d.paidAt) : undefined,
            raw: b,
        },
    };
}

// ─── Outras plataformas (formato do TrafficAI) ──────────────────────────
// { "event": "order", "platform": "nome", "order_id": "123",
//   "status": "approved|pending|refused|refunded|chargeback|canceled|abandoned",
//   "value": 197, "net_value": 170, "product": "Curso", "payment_method": "pix|credit_card|boleto",
//   "customer": { "name", "email", "phone" }, "checkout_url": "...",
//   "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "sck" }
const GENERIC_STATUS = new Set(['approved', 'pending', 'refused', 'refunded', 'chargeback', 'canceled', 'abandoned']);

function parseGeneric(b: any): PlatformResult {
    const status = String(b.status || '').toLowerCase();
    if (!GENERIC_STATUS.has(status)) return { kind: 'ignore', reason: 'status inválido (use approved, pending, refused, refunded, chargeback, canceled ou abandoned)' };
    const c = b.customer || {};
    if (looksLikeTest(c.email, b.product)) return { kind: 'test' };
    const name = String(b.platform || 'outra').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'outra';
    const order: NormalizedOrder = {
        platform: name,
        external_order_id: (status === 'abandoned' ? 'cart-' : '') + String(b.order_id || b.id),
        status: status as OrderStatus,
        payment_method: normalizePaymentMethod(b.payment_method),
        product_id: pick(b.product_id), product_name: pick(b.product, b.product_name),
        gross_value: num(b.value), net_value: num(b.net_value), currency: pick(b.currency) || 'BRL',
        customer_name: pick(c.name), customer_email: pick(c.email), customer_phone: pick(c.phone),
        checkout_url: pick(b.checkout_url),
        ...utmFrom(b), sck: pick(b.sck, b.session_id),
        order_created_at: iso(b.created_at), approved_at: status === 'approved' ? iso(b.approved_at) : undefined,
        raw: b,
    };
    return status === 'abandoned' ? { kind: 'cart', order } : { kind: 'order', order };
}

// ─── Zouti ──────────────────────────────────────────────────────────────
// Plataforma de pagamento BR. Webhook com header x-zouti-signature
// (t=timestamp,v1=hmac_sha256). Eventos em UPPER_SNAKE_CASE.
// Formato inferido do exemplo do usuário + padrão de gateways BR — parser
// tolerante que loga o payload bruto pra ajuste fino no 1º evento real.
function zoutiStatus(ev: string): OrderStatus | null {
    const e = ev.toUpperCase();
    if (e === 'ORDER_PAID' || e === 'ORDER_APPROVED') return 'approved';
    if (e === 'ORDER_REFUNDED') return 'refunded';
    if (e === 'ORDER_CHARGEBACK') return 'chargeback';
    if (e === 'ORDER_CANCELED' || e === 'ORDER_CANCELLED' || e === 'ORDER_EXPIRED') return 'canceled';
    if (e === 'ORDER_REJECTED' || e === 'ORDER_DECLINED') return 'refused';
    if (e === 'ORDER_PENDING' || e === 'ORDER_CREATED') return 'pending';
    return null;
}
function parseZouti(b: any): PlatformResult {
    const ev = String(b.event || '');
    const st = zoutiStatus(ev);
    if (!st) return { kind: 'ignore', reason: `evento Zouti ${ev} sem mapeamento de status` };
    const c = b.customer || b.buyer || {};
    const p = b.product || b.item || {};
    if (looksLikeTest(c.email, p.name || b.product_name)) return { kind: 'test' };
    const orderId = String(b.order_id || b.id || '');
    if (!orderId) return { kind: 'ignore', reason: 'webhook Zouti sem order_id' };
    // Valor: tenta amount, total, price, value — em centavos ou reais.
    const rawVal = num(b.amount) ?? num(b.total) ?? num(b.price) ?? num(b.value);
    // Zouti pode mandar em centavos (inteiro grande) — heuristic: se > 10000 e inteiro, divide por 100.
    const grossValue = rawVal != null && rawVal > 10000 && Number.isInteger(rawVal) ? rawVal / 100 : rawVal;
    const order: NormalizedOrder = {
        platform: 'zouti',
        external_order_id: orderId,
        status: st,
        payment_method: normalizePaymentMethod(b.payment_method || b.paymentMethod || b.payment_type),
        product_id: pick(p.id, b.product_id),
        product_name: pick(p.name, b.product_name, b.description),
        gross_value: grossValue,
        net_value: num(b.net_amount) ?? num(b.netAmount),
        currency: pick(b.currency) || 'BRL',
        customer_name: pick(c.name, c.full_name, b.customer_name),
        customer_email: pick(c.email, b.customer_email),
        customer_phone: pick(c.phone, c.cellphone, b.customer_phone),
        checkout_url: pick(b.checkout_url, b.checkoutUrl),
        ...utmFrom(b.utm || b),
        sck: pick(b.sck, b.session_id, b.tracking_code),
        order_created_at: iso(b.created_at || b.createdAt),
        approved_at: st === 'approved' ? iso(b.paid_at || b.paidAt || b.approved_at) : undefined,
        refunded_at: st === 'refunded' ? iso(b.refunded_at || b.refundedAt) : undefined,
        raw: b,
    };
    return { kind: 'order', order };
}

/** Evento Purchase pra Meta a partir do pedido aprovado (mesmo formato da Kiwify). */
export function buildPurchaseFromOrder(o: NormalizedOrder): any {
    const [firstName, ...rest] = String(o.customer_name || '').trim().split(/\s+/);
    const ids = metaIdsFromUtms(o);
    return {
        event: 'Purchase',
        external_id: `${o.platform}-${o.external_order_id}`,
        event_id: `${o.platform}-${o.external_order_id}-Purchase`,
        value: o.gross_value ?? o.net_value,
        currency: o.currency || 'BRL',
        user: {
            email: o.customer_email, phone: o.customer_phone,
            first_name: firstName || undefined, last_name: rest.length ? rest.join(' ') : undefined,
        },
        custom_data: {
            source: o.platform,
            order_id: o.external_order_id,
            content_name: o.product_name,
            ...(o.utm_source && { utm_source: o.utm_source }),
            ...(o.utm_campaign && { utm_campaign: o.utm_campaign }),
            ...(o.utm_medium && { utm_medium: o.utm_medium }),
            ...(o.utm_content && { utm_content: o.utm_content }),
            ...(o.utm_term && { utm_term: o.utm_term }),
        },
        campaign: ids.meta_campaign_id ? {
            meta_campaign_id: ids.meta_campaign_id,
            meta_adset_id: ids.meta_adset_id || undefined,
            meta_ad_id: ids.meta_ad_id || undefined,
        } : undefined,
        session_id: o.sck,
    };
}
