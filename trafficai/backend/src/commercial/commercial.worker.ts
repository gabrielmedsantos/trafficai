// ==============================
// TrafficAI — Commercial Worker
// Cron jobs:
//  - Sync de integrações Kommo a cada 30min
//  - Agregação diária em comm_daily_metrics às 02:30 UTC
// ==============================

import cron from 'node-cron';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { syncKommoIntegration } from './integrations/kommo/sync';
import { aggregateYesterdayForAllUsers, backfillDays } from './aggregations';
import { runCommercialAlerts } from './alerts';

interface IntegrationRow {
    id: string;
    type: string;
    user_id: string;
    last_event_at: Date | null;
}

async function syncAllConnected(): Promise<void> {
    try {
        const rows = await query<IntegrationRow>(
            `SELECT id, type, user_id, last_event_at FROM comm_integrations
             WHERE status IN ('connected', 'error') AND type = 'kommo'`
        );

        if (rows.length === 0) {
            logger.debug('commercial-worker: 0 integrações ativas, skipping');
            return;
        }

        logger.info(`commercial-worker: sincronizando ${rows.length} integração(ões) Kommo`);

        for (const intg of rows) {
            try {
                const r = await syncKommoIntegration(intg.id, { incremental: true });
                logger.info('commercial-worker: sync ok', {
                    integrationId: intg.id,
                    leads: r.leads,
                    durationMs: r.durationMs,
                });
            } catch (err: any) {
                logger.warn('commercial-worker: sync falhou', {
                    integrationId: intg.id,
                    error: err.message,
                });
            }
        }
    } catch (err: any) {
        logger.error('commercial-worker: erro geral', { error: err.message });
    }
}

async function runDailyAggregation(): Promise<void> {
    try {
        const r = await aggregateYesterdayForAllUsers();
        logger.info('commercial-worker: daily aggregation ok', r);
    } catch (err: any) {
        logger.error('commercial-worker: daily aggregation falhou', { error: err.message });
    }
}

async function bootstrapBackfillIfNeeded(): Promise<void> {
    // Se a tabela está vazia, faz backfill de 30 dias.
    try {
        const c = await query<{ n: string }>(`SELECT COUNT(*)::TEXT AS n FROM comm_daily_metrics`);
        if (Number(c[0]?.n ?? 0) === 0) {
            logger.info('commercial-worker: tabela daily_metrics vazia — fazendo backfill de 30 dias');
            const r = await backfillDays(30);
            logger.info('commercial-worker: backfill ok', r);
        } else {
            logger.debug('commercial-worker: daily_metrics já populada, skip backfill');
        }
    } catch (err: any) {
        logger.warn('commercial-worker: bootstrap backfill falhou', { error: err.message });
    }
}

export function startCommercialWorker(): void {
    // Sync Kommo a cada 30 min
    cron.schedule('0,30 * * * *', () => {
        void syncAllConnected();
    });
    logger.info('commercial-worker: sync agendado (a cada 30min)');

    // Agregação diária às 02:30 UTC (longe de horário de pico)
    cron.schedule('30 2 * * *', () => {
        void runDailyAggregation();
    });
    logger.info('commercial-worker: agregação diária agendada (02:30 UTC)');

    // Alertas comerciais às 09:00 UTC (06:00 BRT, antes do dia comercial começar)
    cron.schedule('0 9 * * *', () => {
        void runCommercialAlerts().catch(e => logger.error('Alert run falhou', { error: e.message }));
    });
    logger.info('commercial-worker: alertas comerciais agendados (09:00 UTC)');

    // Primeiro sync 1 min após o boot
    setTimeout(() => { void syncAllConnected(); }, 60_000);
    // Backfill 2 min após o boot (só se necessário)
    setTimeout(() => { void bootstrapBackfillIfNeeded(); }, 120_000);
}
