// ==============================
// TrafficAI — CRM Sync Service
// Responsável por enriquecer eventos e criar Purchase a partir de CRMs
// integrados à tracking_source. Adaptadores extensíveis (Kommo por default).
// ==============================

import axios from 'axios';
import crypto from 'crypto';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { KommoAdapter, ExtractedUserData } from './crm-adapters/kommo.adapter';

const META_VERSION = 'v19.0';

// ─── Normalização SHA-256 ────────────────────────────────────────────────────

function sha256(v: string): string {
    return crypto.createHash('sha256').update(v).digest('hex');
}
function normEmail(s: string): string { return s.trim().toLowerCase(); }
function normPhone(s: string): string {
    let d = s.replace(/\D/g, '');
    if (d.length >= 10 && d.length <= 11) d = '55' + d;
    return d;
}
function normName(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Constrói user_data hashada para Meta CAPI a partir do extraído do CRM. */
export function buildHashedUserData(u: ExtractedUserData): Record<string, any> {
    const d: Record<string, any> = {
        external_id: [sha256(u.external_id)],
    };
    if (u.email) d.em = [sha256(normEmail(u.email))];
    if (u.phone) d.ph = [sha256(normPhone(u.phone))];
    if (u.first_name) d.fn = [sha256(normName(u.first_name))];
    if (u.last_name) d.ln = [sha256(normName(u.last_name))];
    return d;
}

/** Calcula EMQ local — igual ao tracking.service.computeEmqScore. */
export function computeEmq(u: ExtractedUserData, hasEventId: boolean): number {
    let score = 0;
    if (u.email) score += 2;
    if (u.phone) score += 2;
    score += 1.5; // external_id sempre presente
    if (u.first_name) score += 0.5;
    if (u.last_name) score += 0.5;
    if (hasEventId) score += 0.5;
    return Math.min(10, Math.round(score));
}

// ─── Factory de adaptadores ──────────────────────────────────────────────────

export function getAdapter(source: any) {
    const type = source.crm_type;
    if (!type) throw new Error('Fonte sem CRM configurado');
    if (type === 'kommo') {
        if (!source.crm_subdomain || !source.crm_access_token) {
            throw new Error('Kommo: subdomain e access_token são obrigatórios');
        }
        return new KommoAdapter(source.crm_subdomain, source.crm_access_token);
    }
    throw new Error(`CRM não suportado: ${type}`);
}

// ─── Envio direto para Meta CAPI ─────────────────────────────────────────────

async function sendToMeta(source: any, payload: any): Promise<{
    status: 'sent' | 'failed';
    error?: string;
    fbtrace_id?: string;
    response?: any;
}> {
    try {
        const body: any = { data: [payload] };
        if (source.test_event_code) body.test_event_code = source.test_event_code;
        const r = await axios.post(
            `https://graph.facebook.com/${META_VERSION}/${source.pixel_id}/events`,
            body,
            { params: { access_token: source.access_token }, timeout: 15000 }
        );
        return { status: 'sent', response: r.data, fbtrace_id: r.data?.fbtrace_id };
    } catch (e: any) {
        const data = e.response?.data;
        return {
            status: 'failed',
            error: data?.error?.error_user_msg || data?.error?.message || e.message,
            fbtrace_id: data?.fbtrace_id,
            response: data,
        };
    }
}

// ─── Clamp de event_time (Meta rejeita > 7 dias) ─────────────────────────────

export function clampEventTime(eventTime: number, strategy: 'original' | 'now' | 'clamp_7d' = 'clamp_7d'): number {
    const now = Math.floor(Date.now() / 1000);
    if (strategy === 'now') return now;
    if (strategy === 'original') return eventTime;
    // clamp_7d: se muito antigo, usa agora (Meta aceita só últimos 7 dias)
    const sixDaysAgo = now - 6 * 86400;
    return eventTime < sixDaysAgo ? now : eventTime;
}

// ─── Backfill: enriquece eventos antigos com dados do CRM ────────────────────

export interface BackfillResult {
    enriched: number;
    purchases_created: number;
    skipped: number;
    failed: number;
    total_purchase_value: number;
    error?: string;
}

export async function backfillSource(
    sourceId: string,
    opts: {
        enrich_existing?: boolean;
        sync_won_purchases?: boolean;
        time_strategy?: 'original' | 'now' | 'clamp_7d';
    }
): Promise<BackfillResult> {
    const srcRows = await query<any>(`SELECT * FROM tracking_sources WHERE id = $1`, [sourceId]);
    if (!srcRows.length) throw new Error('Fonte não encontrada');
    const source = srcRows[0];
    const adapter = getAdapter(source);
    const timeStrat = opts.time_strategy || 'clamp_7d';

    const result: BackfillResult = {
        enriched: 0, purchases_created: 0, skipped: 0, failed: 0, total_purchase_value: 0,
    };

    // Valida credenciais primeiro
    try {
        await (adapter as KommoAdapter).validate();
    } catch (e: any) {
        throw new Error(`Credenciais CRM inválidas: ${e.message}`);
    }

    // ── 1. Enriquecer eventos existentes ──────────────────────────────────
    if (opts.enrich_existing) {
        const events = await query<any>(
            `SELECT id, event_id, event_name, event_time, value, currency, custom_data
             FROM tracking_events
             WHERE source_id = $1
               AND (custom_data->>'source') = 'kommo'
               AND (user_data_hashed->'em') IS NULL
               AND (user_data_hashed->'ph') IS NULL
             ORDER BY created_at ASC`,
            [sourceId]
        );
        logger.info(`crm-backfill: ${events.length} eventos para enriquecer`, { sourceId });

        for (const ev of events) {
            const leadId = ev.custom_data?.kommo_lead_id;
            if (!leadId) { result.skipped++; continue; }
            try {
                const { lead, contact } = await (adapter as KommoAdapter).fetchLeadWithContact(leadId);
                const userData = (adapter as KommoAdapter).extractUserData(lead, contact);
                if (!userData.email && !userData.phone) { result.skipped++; continue; }

                const hashed = buildHashedUserData(userData);
                const clampedTime = clampEventTime(ev.event_time, timeStrat);

                const payload = {
                    event_name: ev.event_name,
                    event_time: clampedTime,
                    event_id: ev.event_id,
                    action_source: 'system_generated',
                    user_data: hashed,
                    custom_data: {
                        ...(ev.value !== null ? { value: Number(ev.value) } : {}),
                        ...(ev.currency ? { currency: ev.currency } : {}),
                        source: 'kommo_backfill',
                        kommo_lead_id: String(leadId),
                    },
                };

                const metaRes = await sendToMeta(source, payload);
                if (metaRes.status === 'sent') {
                    const emq = computeEmq(userData, true);
                    await query(
                        `UPDATE tracking_events SET
                            user_data_hashed = $1, emq_score = $2,
                            meta_status = 'sent', meta_response = $3,
                            meta_fbtrace_id = $4, meta_error = NULL
                         WHERE id = $5`,
                        [
                            JSON.stringify(hashed), emq,
                            JSON.stringify(metaRes.response),
                            metaRes.fbtrace_id || null, ev.id,
                        ]
                    );
                    result.enriched++;
                } else {
                    result.failed++;
                    logger.warn('crm-backfill: Meta rejeitou', { leadId, error: metaRes.error });
                }
                await sleep(180);
            } catch (e: any) {
                result.failed++;
                logger.warn('crm-backfill enrich falhou', { leadId, error: e.message });
            }
        }
    }

    // ── 2. Sincronizar Purchase de leads ganhos ──────────────────────────
    if (opts.sync_won_purchases) {
        const wonStatuses = await (adapter as KommoAdapter).findWonStatuses();
        logger.info(`crm-backfill: ${wonStatuses.length} status de 'ganho' detectado(s)`, { sourceId });

        const allLeads: any[] = [];
        for (const ws of wonStatuses) {
            try {
                const leads = await (adapter as KommoAdapter).listLeadsByStatus(ws.pipeline_id, ws.status_id);
                allLeads.push(...leads);
            } catch (e: any) {
                logger.warn('crm-backfill list leads falhou', { pipeline: ws.pipeline_id, error: e.message });
            }
        }

        // Filtra leads com valor > 0 e deduplicador por id
        const seen = new Set<number>();
        const withValue = allLeads.filter(l => {
            const id = Number(l.id);
            if (seen.has(id)) return false;
            seen.add(id);
            return Number(l.price || 0) > 0;
        });
        logger.info(`crm-backfill: ${withValue.length} leads com valor > 0 encontrados`, { sourceId });

        const contactCache = new Map<number, any>();

        for (const lead of withValue) {
            const leadId = lead.id;
            const price = Number(lead.price);
            const contactLink = lead._embedded?.contacts?.[0];

            try {
                let contact: any = null;
                if (contactLink) {
                    contact = contactCache.get(contactLink.id);
                    if (!contact) {
                        contact = await (adapter as KommoAdapter).fetchContact(contactLink.id);
                        if (contact) contactCache.set(contactLink.id, contact);
                    }
                }

                const userData = (adapter as KommoAdapter).extractUserData(lead, contact);
                if (!userData.email && !userData.phone) { result.skipped++; continue; }

                const hashed = buildHashedUserData(userData);
                const eventId = `kommo-${leadId}-Purchase`;
                const eventTime = clampEventTime(lead.closed_at || lead.updated_at || Math.floor(Date.now() / 1000), timeStrat);

                const payload = {
                    event_name: 'Purchase',
                    event_time: eventTime,
                    event_id: eventId,
                    action_source: 'system_generated',
                    user_data: hashed,
                    custom_data: {
                        value: price,
                        currency: 'BRL',
                        source: 'kommo_backfill',
                        kommo_lead_id: String(leadId),
                    },
                };

                const metaRes = await sendToMeta(source, payload);
                if (metaRes.status === 'sent') {
                    const emq = computeEmq(userData, true);
                    // Upsert com ON CONFLICT DO NOTHING via event_id único
                    await query(
                        `INSERT INTO tracking_events
                            (source_id, event_name, event_id, event_time, action_source,
                             external_id, value, currency, custom_data, user_data_hashed,
                             emq_score, meta_status, meta_response, meta_fbtrace_id)
                         VALUES ($1,'Purchase',$2,$3,'system_generated',$4,$5,'BRL',$6,$7,$8,'sent',$9,$10)
                         ON CONFLICT DO NOTHING`,
                        [
                            sourceId, eventId, eventTime, `kommo-${leadId}`, price,
                            JSON.stringify(payload.custom_data),
                            JSON.stringify(hashed), emq,
                            JSON.stringify(metaRes.response), metaRes.fbtrace_id || null,
                        ]
                    );
                    result.purchases_created++;
                    result.total_purchase_value += price;
                } else {
                    result.failed++;
                    logger.warn('crm-backfill Purchase falhou', { leadId, error: metaRes.error });
                }
                await sleep(180);
            } catch (e: any) {
                result.failed++;
                logger.warn('crm-backfill Purchase exceção', { leadId, error: e.message });
            }
        }
    }

    // Atualiza last_backfill_at
    await query(
        `UPDATE tracking_sources SET last_backfill_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [sourceId]
    );

    logger.info('crm-backfill concluído', { sourceId, ...result });
    return result;
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}
