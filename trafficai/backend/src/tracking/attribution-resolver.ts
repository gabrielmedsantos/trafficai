// ==============================
// TrafficAI — Click-to-Lead Attribution Resolver
// Quando um lead chega via /track/webhook/:token SEM um click ID explícito
// (fbc/fbp/gclid/ctwa_clid), tenta reatribuí-lo a um clique já registrado em
// tracking_clicks, por ordem de confiança. É enriquecimento aditivo — nunca
// bloqueia o envio pro Meta. O caminho de WhatsApp (ctwa_clid) não passa por
// aqui, já é determinístico via whatsapp-lead.service.ts.
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { sha256, normEmail, normPhone } from './tracking.service';

export type AttributionConfidence = 'high' | 'medium' | 'low' | 'none';

export interface AttributionLeadInput {
    session_id?: string;
    phone?: string;
    email?: string;
    client_ip?: string;
    eventTimeSec: number; // unix seconds do lead
}

interface ClickRow {
    id: string;
    fbclid: string | null;
    gclid: string | null;
    gbraid: string | null;
    wbraid: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    utm_term: string | null;
    created_at: string;
}

export interface AttributionResult {
    confidence: AttributionConfidence;
    reason: string;
    click: ClickRow | null;
}

const CLICK_COLUMNS = 'id, fbclid, gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at';

/**
 * Tenta resolver o clique de origem de um lead, em ordem decrescente de
 * confiança. Para no primeiro sinal que der match.
 */
export async function resolveClickAttribution(
    sourceId: string,
    lead: AttributionLeadInput
): Promise<AttributionResult> {
    // 1) session_id — mesmo navegador/sessão, sinal técnico forte.
    if (lead.session_id) {
        const rows = await query<ClickRow>(
            `SELECT ${CLICK_COLUMNS} FROM tracking_clicks
             WHERE source_id = $1 AND session_id = $2
             ORDER BY created_at DESC LIMIT 1`,
            [sourceId, lead.session_id]
        );
        if (rows.length) return { confidence: 'high', reason: 'session_id match', click: rows[0] };
    }

    // 2) hash de telefone/email — mesma normalização usada no envio pra Meta,
    // populado oportunisticamente em enrichClickWithContact().
    const phoneHash = lead.phone ? sha256(normPhone(lead.phone)) : null;
    const emailHash = lead.email ? sha256(normEmail(lead.email)) : null;
    if (phoneHash || emailHash) {
        const conditions: string[] = [];
        const params: any[] = [sourceId];
        if (phoneHash) { params.push(phoneHash); conditions.push(`phone_hash = $${params.length}`); }
        if (emailHash) { params.push(emailHash); conditions.push(`email_hash = $${params.length}`); }
        const rows = await query<ClickRow>(
            `SELECT ${CLICK_COLUMNS} FROM tracking_clicks
             WHERE source_id = $1 AND (${conditions.join(' OR ')})
             ORDER BY created_at DESC LIMIT 1`,
            params
        );
        if (rows.length) {
            const reason = phoneHash && emailHash ? 'phone/email hash match' : phoneHash ? 'phone hash match' : 'email hash match';
            return { confidence: 'high', reason, click: rows[0] };
        }
    }

    // 3) IP + janela de tempo — heurística mais fraca, sujeita a falso
    // positivo em IP compartilhado (NAT, wifi público). Nunca promovida a 'high'.
    if (lead.client_ip) {
        const rows = await query<ClickRow & { minutes_before: string }>(
            `SELECT ${CLICK_COLUMNS}, EXTRACT(EPOCH FROM (to_timestamp($3) - created_at)) / 60 AS minutes_before
             FROM tracking_clicks
             WHERE source_id = $1 AND client_ip = $2
               AND created_at BETWEEN to_timestamp($3) - INTERVAL '24 hours' AND to_timestamp($3)
             ORDER BY created_at DESC LIMIT 1`,
            [sourceId, lead.client_ip, lead.eventTimeSec]
        );
        if (rows.length) {
            const minutesBefore = Number(rows[0].minutes_before);
            const confidence: AttributionConfidence = minutesBefore <= 30 ? 'medium' : 'low';
            return {
                confidence,
                reason: `IP+tempo (${Math.round(minutesBefore)}min antes) — sinal fraco, sujeito a IP compartilhado`,
                click: rows[0],
            };
        }
    }

    return { confidence: 'none', reason: 'nenhum clique encontrado', click: null };
}

/**
 * Marca um clique já registrado com hash de contato quando o mesmo
 * session_id aparece depois associado a um email/telefone (ex: identify()
 * do pixel ou submit de formulário). Transforma uma sessão anônima em
 * hash-matchável sem nunca guardar PII em texto puro em tracking_clicks.
 * Idempotente — nunca sobrescreve um hash já setado.
 */
export async function enrichClickWithContact(
    sourceId: string,
    sessionId: string | undefined,
    contact: { email?: string; phone?: string }
): Promise<void> {
    if (!sessionId || (!contact.email && !contact.phone)) return;
    const emailHash = contact.email ? sha256(normEmail(contact.email)) : null;
    const phoneHash = contact.phone ? sha256(normPhone(contact.phone)) : null;
    if (!emailHash && !phoneHash) return;
    try {
        await query(
            `UPDATE tracking_clicks
             SET email_hash = COALESCE(email_hash, $3), phone_hash = COALESCE(phone_hash, $4)
             WHERE source_id = $1 AND session_id = $2 AND (email_hash IS NULL OR phone_hash IS NULL)`,
            [sourceId, sessionId, emailHash, phoneHash]
        );
    } catch (err: any) {
        logger.warn('attribution: falha ao enriquecer clique com contato', { error: err.message });
    }
}
