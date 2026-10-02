// ==============================
// TrafficAI — Pedidos de plataformas de checkout (estilo UTMify)
// Cada plataforma (Kiwify, Hotmart, Eduzz, Monetizze, Cakto) traduz o próprio
// webhook pra NormalizedOrder; daqui pra frente o fluxo é um só: upsert do
// pedido + atribuição por UTM (nome|id) ou sck (session_id do nosso pixel).
// ==============================

import { query, queryOne } from '../database/connection';
import { logger } from '../shared/logger';
import { sha256, normEmail, normPhone } from './tracking.service';
import { metaIdsFromUtms } from './utm';

export { parseUtmId, metaIdsFromUtms } from './utm';

export type OrderStatus = 'approved' | 'pending' | 'refused' | 'refunded' | 'chargeback' | 'canceled' | 'abandoned';
export type PaymentMethod = 'pix' | 'credit_card' | 'boleto' | 'other';

export interface NormalizedOrder {
    platform: string;
    external_order_id: string;
    status: OrderStatus;
    payment_method?: PaymentMethod;
    product_id?: string;
    product_name?: string;
    gross_value?: number;
    net_value?: number;
    currency?: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    sck?: string;
    checkout_url?: string;
    order_created_at?: string;
    approved_at?: string;
    refunded_at?: string;
    raw?: any;
}

export function normalizePaymentMethod(raw: any): PaymentMethod | undefined {
    const v = String(raw || '').toLowerCase();
    if (!v) return undefined;
    if (v.includes('pix')) return 'pix';
    if (v.includes('card') || v.includes('cart') || v.includes('credit') || v.includes('credito') || v.includes('crédito')) return 'credit_card';
    if (v.includes('boleto') || v.includes('billet') || v.includes('bank_slip')) return 'boleto';
    return 'other';
}

/**
 * Grava/atualiza o pedido. Atribuição: UTMs do próprio pedido (a plataforma
 * ecoa as UTMs do link de checkout) têm prioridade; se não vieram ids, tenta o
 * clique da mesma sessão (sck = session_id do pixel) e herda os ids dele.
 * Retorna o id do pedido e se acabou de virar aprovado (pra disparar Purchase
 * uma vez só, mesmo se a plataforma reenviar o webhook).
 */
export async function upsertOrder(sourceId: string, o: NormalizedOrder): Promise<{ id: string; became_approved: boolean; click_id: string | null; previous_status: string | null; utm_campaign: string | null }> {
    let ids = metaIdsFromUtms(o);
    let clickId: string | null = null;

    if (o.sck) {
        const click = await queryOne<{ id: string; meta_campaign_id: string | null; meta_adset_id: string | null; meta_ad_id: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null }>(
            `SELECT id, meta_campaign_id, meta_adset_id, meta_ad_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term
             FROM tracking_clicks WHERE source_id = $1 AND session_id = $2
             ORDER BY created_at DESC LIMIT 1`,
            [sourceId, o.sck]
        );
        if (click) {
            clickId = click.id;
            if (!ids.meta_campaign_id && click.meta_campaign_id) {
                ids = { meta_campaign_id: click.meta_campaign_id, meta_adset_id: click.meta_adset_id, meta_ad_id: click.meta_ad_id };
            }
            // Checkout sem UTM (link direto) mas com sck: herda as UTMs do clique
            if (!o.utm_campaign && click.utm_campaign) {
                o = { ...o, utm_source: click.utm_source || undefined, utm_medium: click.utm_medium || undefined, utm_campaign: click.utm_campaign || undefined, utm_content: click.utm_content || undefined, utm_term: click.utm_term || undefined };
            }
        }
    }

    const previous = await queryOne<{ status: string }>(
        `SELECT status FROM tracking_orders WHERE source_id = $1 AND platform = $2 AND external_order_id = $3`,
        [sourceId, o.platform, o.external_order_id]
    );

    const approvedAt = o.status === 'approved' ? (o.approved_at || new Date().toISOString()) : o.approved_at || null;
    const refundedAt = (o.status === 'refunded' || o.status === 'chargeback') ? (o.refunded_at || new Date().toISOString()) : null;

    const row = await queryOne<{ id: string }>(
        `INSERT INTO tracking_orders (
            source_id, platform, external_order_id, status, payment_method,
            product_id, product_name, gross_value, net_value, currency,
            customer_name, customer_email_hash, customer_phone_hash, customer_email, customer_phone, checkout_url,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term, sck,
            meta_campaign_id, meta_adset_id, meta_ad_id, click_id,
            order_created_at, approved_at, refunded_at, raw
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$28,$29,$30,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
         ON CONFLICT (source_id, platform, external_order_id) DO UPDATE SET
            status = EXCLUDED.status,
            payment_method = COALESCE(EXCLUDED.payment_method, tracking_orders.payment_method),
            product_id = COALESCE(EXCLUDED.product_id, tracking_orders.product_id),
            product_name = COALESCE(EXCLUDED.product_name, tracking_orders.product_name),
            gross_value = COALESCE(EXCLUDED.gross_value, tracking_orders.gross_value),
            net_value = COALESCE(EXCLUDED.net_value, tracking_orders.net_value),
            customer_name = COALESCE(EXCLUDED.customer_name, tracking_orders.customer_name),
            customer_email_hash = COALESCE(EXCLUDED.customer_email_hash, tracking_orders.customer_email_hash),
            customer_phone_hash = COALESCE(EXCLUDED.customer_phone_hash, tracking_orders.customer_phone_hash),
            customer_email = COALESCE(EXCLUDED.customer_email, tracking_orders.customer_email),
            customer_phone = COALESCE(EXCLUDED.customer_phone, tracking_orders.customer_phone),
            checkout_url = COALESCE(EXCLUDED.checkout_url, tracking_orders.checkout_url),
            utm_source = COALESCE(EXCLUDED.utm_source, tracking_orders.utm_source),
            utm_medium = COALESCE(EXCLUDED.utm_medium, tracking_orders.utm_medium),
            utm_campaign = COALESCE(EXCLUDED.utm_campaign, tracking_orders.utm_campaign),
            utm_content = COALESCE(EXCLUDED.utm_content, tracking_orders.utm_content),
            utm_term = COALESCE(EXCLUDED.utm_term, tracking_orders.utm_term),
            sck = COALESCE(EXCLUDED.sck, tracking_orders.sck),
            meta_campaign_id = COALESCE(EXCLUDED.meta_campaign_id, tracking_orders.meta_campaign_id),
            meta_adset_id = COALESCE(EXCLUDED.meta_adset_id, tracking_orders.meta_adset_id),
            meta_ad_id = COALESCE(EXCLUDED.meta_ad_id, tracking_orders.meta_ad_id),
            click_id = COALESCE(EXCLUDED.click_id, tracking_orders.click_id),
            order_created_at = COALESCE(tracking_orders.order_created_at, EXCLUDED.order_created_at),
            approved_at = COALESCE(tracking_orders.approved_at, EXCLUDED.approved_at),
            refunded_at = COALESCE(EXCLUDED.refunded_at, tracking_orders.refunded_at),
            raw = EXCLUDED.raw,
            updated_at = NOW()
         RETURNING id`,
        [
            sourceId, o.platform, o.external_order_id, o.status, o.payment_method || null,
            o.product_id || null, o.product_name || null,
            o.gross_value ?? null, o.net_value ?? null, o.currency || 'BRL',
            o.customer_name || null,
            o.customer_email ? sha256(normEmail(o.customer_email)) : null,
            o.customer_phone ? sha256(normPhone(o.customer_phone)) : null,
            o.utm_source || null, o.utm_medium || null, o.utm_campaign || null, o.utm_content || null, o.utm_term || null,
            o.sck || null,
            ids.meta_campaign_id, ids.meta_adset_id, ids.meta_ad_id, clickId,
            o.order_created_at || null, approvedAt, refundedAt,
            o.raw ? JSON.stringify(o.raw) : null,
            o.customer_email ? normEmail(o.customer_email) : null,
            o.customer_phone ? String(o.customer_phone).trim() : null,
            o.checkout_url || null,
        ]
    );

    const becameApproved = o.status === 'approved' && previous?.status !== 'approved';

    // Recuperação: compra aprovada do mesmo cliente (e-mail ou telefone) fecha
    // os carrinhos abandonados, Pix/boletos vencidos e recusas dele dos últimos 30 dias.
    if (becameApproved && (o.customer_email || o.customer_phone)) {
        const emailHash = o.customer_email ? sha256(normEmail(o.customer_email)) : null;
        const phoneHash = o.customer_phone ? sha256(normPhone(o.customer_phone)) : null;
        await query(
            `UPDATE tracking_orders SET recovered_order_id = $2, updated_at = NOW()
             WHERE source_id = $1 AND id <> $2 AND recovered_order_id IS NULL
               AND status IN ('abandoned', 'pending', 'refused')
               AND created_at >= NOW() - INTERVAL '30 days'
               AND (($3::text IS NOT NULL AND customer_email_hash = $3) OR ($4::text IS NOT NULL AND customer_phone_hash = $4))`,
            [sourceId, row!.id, emailHash, phoneHash]
        ).catch((err: any) => logger.warn('pedido: falha ao marcar recuperação', { error: err.message }));
    }
    logger.info('pedido gravado', { source: sourceId, platform: o.platform, order: o.external_order_id, status: o.status, from: previous?.status || null, campaign: ids.meta_campaign_id });
    return { id: row!.id, became_approved: becameApproved, click_id: clickId, previous_status: previous?.status || null, utm_campaign: o.utm_campaign || null };
}

export async function linkOrderPurchaseEvent(orderId: string, eventId: string): Promise<void> {
    await query(`UPDATE tracking_orders SET purchase_event_id = $2, updated_at = NOW() WHERE id = $1`, [orderId, eventId])
        .catch((err: any) => logger.warn('pedido: falha ao vincular evento Purchase', { error: err.message }));
}
