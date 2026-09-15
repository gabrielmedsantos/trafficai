// ==============================
// TrafficAI — Detecção de Purchase por mensagem padrão do WhatsApp
// Pra clientes sem CRM integrado: o atendente confirma a venda escrevendo a
// própria mensagem de confirmação pro cliente (mensagem que ele já manda de
// qualquer forma). Quando o texto bate com o template ("Pedido:" + "Valor:"),
// dispara Purchase pra Meta CAPI e amarra no lead do WhatsApp original, se
// existir. Só roda em mensagens ENVIADAS pelo próprio número (fromMe/out) —
// ver chamada em evolution/webhook.ts.
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { trackEvent, TrackingEventInput } from './tracking.service';
import { recordPurchaseForWhatsAppLead } from './whatsapp-lead.service';

// Template padrão que o atendente copia/cola e preenche:
//   ✅ Compra confirmada!
//   Pedido: #12345
//   Valor: R$ 149,90
// Exige as duas labels — reduz drasticamente falso-positivo de conversa comum.
const PEDIDO_RE = /pedido\s*:?\s*#?\s*([a-z0-9\-]{1,40})/i;
const VALOR_RE = /valor\s*:?\s*r?\$?\s*([\d.,]+)/i;

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

function phoneCandidates(phone: string): string[] {
    const digitsOnly = phone.replace(/\D/g, '');
    const candidates = [digitsOnly];
    if (digitsOnly.startsWith('55') && digitsOnly.length >= 12) candidates.push(digitsOnly.slice(2));
    if (!digitsOnly.startsWith('55') && (digitsOnly.length === 10 || digitsOnly.length === 11)) {
        candidates.push('55' + digitsOnly);
    }
    return candidates;
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
 * Sem template reconhecido → matched:false, sem nenhum efeito colateral.
 */
export async function tryDetectPurchaseMessage(
    source: any, phone: string, messageText: string | null
): Promise<PurchaseMessageResult> {
    if (!messageText) return { matched: false };

    const pedidoMatch = messageText.match(PEDIDO_RE);
    const valorMatch = messageText.match(VALOR_RE);
    if (!pedidoMatch || !valorMatch) return { matched: false };

    const orderId = pedidoMatch[1]!;
    const value = parseBRLValue(valorMatch[1]!);
    if (!value) return { matched: false, reason: 'valor não numérico' };

    const digitsOnly = phone.replace(/\D/g, '');
    const candidates = phoneCandidates(phone);

    // event_id inclui telefone + pedido: sobrevive a reenvio do mesmo pedido
    // (dedupe real) sem deixar um "Pedido: 001" repetido em clientes diferentes
    // se engolir mutuamente.
    const eventId = `whatsapp-msg-${digitsOnly}-${orderId}`;

    const leadRows = await query<any>(
        `SELECT ctwa_clid, pixel_id, page_id, name, meta_campaign_id, meta_campaign_name,
                meta_adset_id, meta_adset_name, ad_source_id, ad_name, purchase_event_id
         FROM tracking_whatsapp_leads
         WHERE source_id = $1 AND phone = ANY($2)
         ORDER BY created_at DESC LIMIT 1`,
        [source.id, candidates]
    );
    const lead = leadRows[0] || null;

    // Essa venda já foi registrada por outro caminho (CRM integrado, ex:
    // Kommo marcou o negócio como "Ganho") — não manda de novo, senão conta
    // a mesma venda 2x na Meta.
    if (lead?.purchase_event_id) {
        return { matched: true, sent: false, order_id: orderId, value, reason: 'venda já registrada (CRM ou outro canal)' };
    }

    // Sem lead de anúncio prévio, ainda mandamos (decisão do produto: mesmo
    // sem clique atribuível, o valor ajuda a Meta a otimizar por perfil de
    // quem compra) — só não tem campanha/ctwa_clid pra amarrar.
    const effectivePixel = lead?.pixel_id || source.pixel_id;
    if (!effectivePixel) {
        return { matched: true, sent: false, order_id: orderId, value, reason: 'sem pixel disponível' };
    }

    const event: TrackingEventInput = {
        event_name: 'Purchase',
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'business_messaging',
        messaging_channel: 'whatsapp',
        value,
        currency: 'BRL',
        user_data: {
            phone: digitsOnly,
            first_name: lead?.name?.split(' ')[0] || undefined,
            last_name: lead?.name?.split(' ').slice(1).join(' ') || undefined,
            external_id: lead?.ctwa_clid ? `ctwa-${String(lead.ctwa_clid).slice(0, 20)}` : undefined,
            ctwa_clid: lead?.ctwa_clid || undefined,
            page_id: lead?.page_id || undefined,
        },
        custom_data: {
            source: 'whatsapp_message_match',
            order_id: orderId,
            message_preview: messageText.slice(0, 200),
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
            await recordPurchaseForWhatsAppLead(source.id, digitsOnly, value, null, r.event_id);
        }
        logger.info(`whatsapp purchase detectada por mensagem: ${digitsOnly}`, {
            source: source.id, order: orderId, value, meta_status: r.meta_status, had_lead: !!lead,
        });
        return { matched: true, sent: r.meta_status === 'sent', order_id: orderId, value };
    } catch (err: any) {
        logger.warn('whatsapp purchase-by-message: falha ao enviar pra Meta', {
            source: source.id, order: orderId, error: err.message,
        });
        return { matched: true, sent: false, order_id: orderId, value, reason: err.message };
    }
}
