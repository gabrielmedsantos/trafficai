// ==============================
// TrafficAI — Detecção de Purchase por mensagem padrão do WhatsApp
// Pra clientes sem CRM integrado: o atendente confirma a venda escrevendo a
// própria mensagem de confirmação pro cliente (mensagem que ele já manda de
// qualquer forma). Quando o texto bate com o template ("Pedido:" + "Valor:"),
// dispara Purchase pra Meta CAPI e amarra no lead do WhatsApp original, se
// existir. Só roda em mensagens ENVIADAS pelo próprio número (fromMe/out) —
// ver chamada em evolution/webhook.ts.
//
// Casos limpos disparam na hora. Casos ambíguos (valor/pedido conflitante,
// valor não reconhecido, número de pedido repetido pra outro cliente) ficam
// 'pending' em tracking_purchase_reviews até alguém aprovar ou corrigir pelo
// dashboard — nunca manda um valor incerto pra Meta sem confirmação humana.
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { trackEvent, TrackingEventInput } from './tracking.service';
import { recordPurchaseForWhatsAppLead } from './whatsapp-lead.service';
import { buildPhoneCandidates } from '../shared/phone';

// Template padrão que o atendente copia/cola e preenche:
//   ✅ Compra confirmada!
//   Pedido: #12345
//   Valor: R$ 149,90
// Exige as duas labels — reduz drasticamente falso-positivo de conversa comum.
const PEDIDO_RE = /pedido\s*:?\s*#?\s*([a-z0-9\-]{1,40})/gi;
const VALOR_RE = /valor\s*:?\s*r?\$?\s*([\d.,]+)/gi;

function extractAllMatches(text: string, re: RegExp): string[] {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) out.push(m[1]!);
    return out;
}

function parseBRLValue(raw: string): number | null {
    const cleaned = raw.trim();
    // Vírgula é sempre decimal em pt-BR. Sem vírgula, qualquer ponto é
    // separador de milhar (nunca decimal) — "1.500" é 1500 reais, não 1,5.
    // Sem essa distinção, "R$ 1.500" (pedido de mil e quinhentos) virava 1.5.
    const normalized = cleaned.includes(',')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/\./g, '');
    const n = parseFloat(normalized);
    return Number.isFinite(n) && n > 0 ? n : null;
}

async function findLeadByPhone(sourceId: string, phone: string): Promise<any | null> {
    const rows = await query<any>(
        `SELECT id, ctwa_clid, pixel_id, page_id, name, meta_campaign_id, meta_campaign_name,
                meta_adset_id, meta_adset_name, ad_source_id, ad_name, purchase_event_id
         FROM tracking_whatsapp_leads
         WHERE source_id = $1 AND phone = ANY($2)
         ORDER BY created_at DESC LIMIT 1`,
        [sourceId, buildPhoneCandidates(phone)]
    );
    return rows[0] || null;
}

async function insertReview(params: {
    sourceId: string; whatsappLeadId: string | null; phone: string; messageText: string;
    orderId: string | null; value: number | null; status: string; reasonCode: string;
    eventId?: string | null;
}): Promise<void> {
    await query(
        `INSERT INTO tracking_purchase_reviews
            (source_id, whatsapp_lead_id, phone, message_text, parsed_order_id, parsed_value, status, reason_code, event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [params.sourceId, params.whatsappLeadId, params.phone, params.messageText,
         params.orderId, params.value, params.status, params.reasonCode, params.eventId || null]
    );
}

/** Monta e envia o evento Purchase pra Meta — usado tanto no disparo automático
 *  quanto na aprovação manual de uma revisão pendente. */
async function sendPurchaseEvent(
    source: any, lead: any | null, phone: string, orderId: string, value: number, messageText: string | null
): Promise<{ status: 'sent' | 'failed'; eventId: string; error?: string }> {
    const eventId = `whatsapp-msg-${phone}-${orderId}`;
    const effectivePixel = lead?.pixel_id || source.pixel_id;
    if (!effectivePixel) return { status: 'failed', eventId, error: 'sem pixel disponível' };

    const event: TrackingEventInput = {
        event_name: 'Purchase',
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'business_messaging',
        messaging_channel: 'whatsapp',
        value,
        currency: 'BRL',
        user_data: {
            phone,
            first_name: lead?.name?.split(' ')[0] || undefined,
            last_name: lead?.name?.split(' ').slice(1).join(' ') || undefined,
            external_id: lead?.ctwa_clid ? `ctwa-${String(lead.ctwa_clid).slice(0, 20)}` : undefined,
            ctwa_clid: lead?.ctwa_clid || undefined,
            page_id: lead?.page_id || undefined,
        },
        custom_data: {
            source: 'whatsapp_message_match',
            order_id: orderId,
            message_preview: messageText ? messageText.slice(0, 200) : undefined,
        },
        campaign: lead?.meta_campaign_id ? {
            meta_campaign_id: lead.meta_campaign_id,
            meta_campaign_name: lead.meta_campaign_name || undefined,
            meta_adset_id: lead.meta_adset_id || undefined,
            meta_adset_name: lead.meta_adset_name || undefined,
            meta_ad_id: lead.ad_source_id || undefined,
            meta_ad_name: lead.ad_name || undefined,
        } : undefined,
    };

    const sourceForEvent = { ...source, pixel_id: effectivePixel };
    try {
        const r = await trackEvent(sourceForEvent, event);
        if (r.meta_status === 'sent' && lead) {
            await recordPurchaseForWhatsAppLead(source.id, phone, value, null, r.event_id);
        }
        return { status: r.meta_status === 'sent' ? 'sent' : 'failed', eventId: r.event_id };
    } catch (err: any) {
        return { status: 'failed', eventId, error: err.message };
    }
}

export interface PurchaseMessageResult {
    matched: boolean;
    sent?: boolean;
    order_id?: string;
    value?: number;
    reason?: string;
}

/**
 * Roda em toda mensagem de saída (fromMe) de uma fonte de tracking linkada.
 * Sem as duas labels ("Pedido:"/"Valor:") presentes → matched:false, sem
 * nenhum efeito colateral (mensagem comum, não é confirmação de venda).
 */
export async function tryDetectPurchaseMessage(
    source: any, phone: string, messageText: string | null
): Promise<PurchaseMessageResult> {
    if (!messageText) return { matched: false };

    const orderIds = [...new Set(extractAllMatches(messageText, PEDIDO_RE))];
    const rawValues = extractAllMatches(messageText, VALOR_RE);
    if (orderIds.length === 0 || rawValues.length === 0) return { matched: false };

    const digitsOnly = phone.replace(/\D/g, '');
    const lead = await findLeadByPhone(source.id, phone);
    const whatsappLeadId = lead?.id ?? null;

    // Essa venda já foi registrada por outro caminho (CRM integrado, ex:
    // Kommo marcou o negócio como "Ganho") — só audita, não manda de novo
    // (senão conta a mesma venda 2x na Meta).
    if (lead?.purchase_event_id) {
        await insertReview({
            sourceId: source.id, whatsappLeadId, phone: digitsOnly, messageText,
            orderId: orderIds[0] || null, value: null, status: 'duplicate', reasonCode: 'already_purchased',
        });
        return { matched: true, sent: false, reason: 'venda já registrada (CRM ou outro canal)' };
    }

    // Só mandamos Purchase pra Meta quando dá pra atribuir a um clique de
    // anúncio real (lead com ctwa_clid resolvido). Sem isso o valor não ajuda
    // a otimizar campanha nenhuma e só polui a métrica — decisão de produto,
    // não é ambíguo, então não vai pra revisão humana, só fica registrado.
    // Cobre tanto quem nunca veio de anúncio quanto conversas anteriores à
    // conexão do WhatsApp nativo (sem histórico de clique capturado).
    if (!lead?.ctwa_clid) {
        await insertReview({
            sourceId: source.id, whatsappLeadId, phone: digitsOnly, messageText,
            orderId: orderIds[0] || null, value: null, status: 'skipped', reasonCode: 'no_attribution',
        });
        return { matched: true, sent: false, reason: 'sem atribuição de anúncio — não enviado' };
    }

    // Mais de um "Pedido:" com valores diferentes na mesma mensagem — não dá
    // pra saber qual é o certo sem um humano olhar.
    if (orderIds.length > 1) {
        await insertReview({
            sourceId: source.id, whatsappLeadId, phone: digitsOnly, messageText,
            orderId: orderIds.join(' / '), value: null, status: 'pending', reasonCode: 'order_id_ambiguous',
        });
        return { matched: true, sent: false, reason: 'pedido ambíguo — revisão manual necessária' };
    }

    const orderId = orderIds[0]!;
    const parsedValues = [...new Set(rawValues.map(parseBRLValue).filter((v): v is number => v !== null))];

    if (parsedValues.length === 0) {
        await insertReview({
            sourceId: source.id, whatsappLeadId, phone: digitsOnly, messageText,
            orderId, value: null, status: 'pending', reasonCode: 'value_unparseable',
        });
        return { matched: true, sent: false, order_id: orderId, reason: 'valor não reconhecido — revisão manual necessária' };
    }
    if (parsedValues.length > 1) {
        await insertReview({
            sourceId: source.id, whatsappLeadId, phone: digitsOnly, messageText,
            orderId, value: null, status: 'pending', reasonCode: 'value_ambiguous',
        });
        return { matched: true, sent: false, order_id: orderId, reason: 'valores conflitantes — revisão manual necessária' };
    }

    const value = parsedValues[0]!;

    // Mesmo número de pedido já usado por um telefone DIFERENTE nessa fonte —
    // sinal comum de attendant reaproveitando um placeholder ("Pedido: 001"
    // sempre) em vez do número real. Não bloqueia a venda, só pede confirmação.
    const reused = await query<{ x: number }>(
        `SELECT 1 AS x FROM tracking_purchase_reviews
         WHERE source_id = $1 AND parsed_order_id = $2 AND phone <> $3 AND status IN ('sent', 'pending')
         LIMIT 1`,
        [source.id, orderId, digitsOnly]
    );
    if (reused.length > 0) {
        await insertReview({
            sourceId: source.id, whatsappLeadId, phone: digitsOnly, messageText,
            orderId, value, status: 'pending', reasonCode: 'order_id_reused',
        });
        return { matched: true, sent: false, order_id: orderId, value, reason: 'número de pedido já usado por outro cliente — revisão manual necessária' };
    }

    const result = await sendPurchaseEvent(source, lead, digitsOnly, orderId, value, messageText);
    await insertReview({
        sourceId: source.id, whatsappLeadId, phone: digitsOnly, messageText,
        orderId, value, status: result.status,
        reasonCode: result.status === 'sent' ? 'ok_auto' : (result.error || 'send_failed'),
        eventId: result.eventId,
    });

    logger.info(`whatsapp purchase detectada por mensagem: ${digitsOnly}`, {
        source: source.id, order: orderId, value, status: result.status, had_lead: !!lead,
    });
    return { matched: true, sent: result.status === 'sent', order_id: orderId, value, reason: result.error };
}

// ─── Fila de revisão — usado pelo controller autenticado ───────────────────

export async function listPurchaseReviews(sourceId: string, status?: string): Promise<any[]> {
    const params: any[] = [sourceId];
    let where = `source_id = $1`;
    if (status) {
        params.push(status);
        where += ` AND status = $${params.length}`;
    }
    return query<any>(
        `SELECT * FROM tracking_purchase_reviews WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
        params
    );
}

export async function approvePurchaseReview(
    sourceId: string, reviewId: string, userId: string, overrides?: { value?: number; orderId?: string }
): Promise<{ ok: boolean; error?: string }> {
    const rows = await query<any>(
        `SELECT * FROM tracking_purchase_reviews WHERE id = $1 AND source_id = $2`,
        [reviewId, sourceId]
    );
    if (!rows.length) return { ok: false, error: 'Revisão não encontrada' };
    const review = rows[0];
    if (review.status !== 'pending') return { ok: false, error: 'Essa revisão já foi processada' };

    const value = overrides?.value ?? (review.parsed_value != null ? Number(review.parsed_value) : null);
    const orderId = overrides?.orderId ?? review.parsed_order_id;
    if (!value || value <= 0) return { ok: false, error: 'Informe um valor válido' };
    if (!orderId) return { ok: false, error: 'Informe o número do pedido' };

    const sourceRows = await query<any>(`SELECT * FROM tracking_sources WHERE id = $1`, [sourceId]);
    if (!sourceRows.length) return { ok: false, error: 'Fonte não encontrada' };

    let lead: any = null;
    if (review.whatsapp_lead_id) {
        const leadRows = await query<any>(`SELECT * FROM tracking_whatsapp_leads WHERE id = $1`, [review.whatsapp_lead_id]);
        lead = leadRows[0] || null;
    }

    const result = await sendPurchaseEvent(sourceRows[0], lead, review.phone, orderId, value, review.message_text);
    await query(
        `UPDATE tracking_purchase_reviews
         SET status = $1, reason_code = $2, event_id = $3, parsed_value = $4, parsed_order_id = $5,
             reviewed_by = $6, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $7`,
        [
            result.status, result.status === 'sent' ? 'approved_manually' : (result.error || 'send_failed'),
            result.eventId, value, orderId, userId, reviewId,
        ]
    );
    return { ok: result.status === 'sent', error: result.error };
}

export async function rejectPurchaseReview(
    sourceId: string, reviewId: string, userId: string
): Promise<{ ok: boolean }> {
    const rows = await query<{ id: string }>(
        `UPDATE tracking_purchase_reviews
         SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND source_id = $3 AND status = 'pending'
         RETURNING id`,
        [userId, reviewId, sourceId]
    );
    return { ok: rows.length > 0 };
}
