// ==============================
// TrafficAI — Tracking Cleanup Worker
// Mantém as tabelas de tracking enxutas pra queries permanecerem rápidas
// e o storage sob controle. Roda 1x por dia.
//
// Política padrão (ajustável via env):
//   tracking_events:           manter últimos TAI_EVENTS_RETENTION_DAYS dias (default 180)
//   tracking_clicks:           manter últimos TAI_CLICKS_RETENTION_DAYS dias (default 90)
//   tracking_whatsapp_leads:   manter SEM purchase por TAI_WA_LEAD_RETENTION_DAYS (default 365)
//                              (com purchase, mantém pra sempre — é dado de venda)
// ==============================

import cron from 'node-cron';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

const EVENTS_DAYS = Math.max(1, parseInt(process.env.TAI_EVENTS_RETENTION_DAYS || '180', 10));
const CLICKS_DAYS = Math.max(1, parseInt(process.env.TAI_CLICKS_RETENTION_DAYS || '90', 10));
const WA_LEAD_DAYS = Math.max(1, parseInt(process.env.TAI_WA_LEAD_RETENTION_DAYS || '365', 10));

export interface CleanupResult {
    events_deleted: number;
    clicks_deleted: number;
    whatsapp_leads_deleted: number;
}

export async function runCleanup(): Promise<CleanupResult> {
    // Eventos — preserva failed ainda elegíveis pra retry (criados < 24h).
    // A condição já é dada pelo cutoff: retry tem janela de 24h e cutoff é 180d.
    const eventsDel = await query<{ id: string }>(
        `DELETE FROM tracking_events
         WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
         RETURNING id`,
        [String(EVENTS_DAYS)]
    );

    const clicksDel = await query<{ id: string }>(
        `DELETE FROM tracking_clicks
         WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
         RETURNING id`,
        [String(CLICKS_DAYS)]
    );

    // WhatsApp leads SEM purchase — leads com purchase ficam (dado de receita).
    const waDel = await query<{ id: string }>(
        `DELETE FROM tracking_whatsapp_leads
         WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
           AND purchase_event_id IS NULL
         RETURNING id`,
        [String(WA_LEAD_DAYS)]
    );

    return {
        events_deleted: eventsDel.length,
        clicks_deleted: clicksDel.length,
        whatsapp_leads_deleted: waDel.length,
    };
}

export function startTrackingCleanupWorker() {
    // Todo dia às 05:00 UTC (02:00 BRT) — depois do billing worker (04:00 UTC).
    cron.schedule('0 5 * * *', async () => {
        try {
            const r = await runCleanup();
            const total = r.events_deleted + r.clicks_deleted + r.whatsapp_leads_deleted;
            if (total > 0) {
                logger.info(
                    `🧹 Tracking cleanup: ${r.events_deleted} evento(s), ${r.clicks_deleted} clique(s), ${r.whatsapp_leads_deleted} whatsapp lead(s) removido(s)`
                );
            }
        } catch (err: any) {
            logger.error('Tracking cleanup falhou', { error: err.message });
        }
    });
    logger.info(
        `🧹 Tracking cleanup worker started (diário às 05:00 UTC) — events>${EVENTS_DAYS}d, clicks>${CLICKS_DAYS}d, wa_leads>${WA_LEAD_DAYS}d`
    );
}
