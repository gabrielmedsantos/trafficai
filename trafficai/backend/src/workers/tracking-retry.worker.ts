// ==============================
// TrafficAI — Tracking Retry Worker
// A cada 10 min, retenta eventos com meta_status='failed' das últimas 24h
// que ainda têm tentativas disponíveis (retry_count < 3).
// Backoff via min-since-last-retry (5min entre tentativas pro mesmo evento).
// ==============================

import cron from 'node-cron';
import { retryFailedBatch } from '../tracking/tracking.service';
import { logger } from '../shared/logger';

export function startTrackingRetryWorker() {
    // A cada 10 min — */10 * * * *
    cron.schedule('*/10 * * * *', async () => {
        try {
            const r = await retryFailedBatch({
                maxAgeHours: 24,
                maxRetries: 3,
                minSinceLastRetryMs: 5 * 60 * 1000,
                limit: 100,
            });
            if (r.attempted > 0) {
                logger.info(
                    `📡 Tracking retry: ${r.succeeded}/${r.attempted} recuperado(s), ${r.still_failed} ainda falhando`
                );
            }
        } catch (err: any) {
            logger.error('Tracking retry worker falhou', { error: err.message });
        }
    });

    // Roda 90s após boot pra fechar gap caso o serviço tenha ficado off
    setTimeout(async () => {
        try {
            const r = await retryFailedBatch({
                maxAgeHours: 24,
                maxRetries: 3,
                minSinceLastRetryMs: 5 * 60 * 1000,
                limit: 100,
            });
            if (r.attempted > 0) {
                logger.info(
                    `📡 Tracking retry inicial: ${r.succeeded}/${r.attempted} recuperado(s), ${r.still_failed} ainda falhando`
                );
            }
        } catch (err: any) {
            logger.error('Tracking retry inicial falhou', { error: err.message });
        }
    }, 90 * 1000);

    logger.info('📡 Tracking retry worker started (a cada 10min + boot)');
}
