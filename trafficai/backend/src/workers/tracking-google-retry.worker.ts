// ==============================
// TrafficAI — Tracking Google Ads Retry Worker
// Mesmo padrão do tracking-retry.worker.ts (Meta), mas pra eventos com
// google_status='failed' — a cada 10 min, retenta os das últimas 24h com
// tentativas disponíveis (google_retry_count < 3).
// ==============================

import cron from 'node-cron';
import { retryFailedGoogleBatch } from '../tracking/google-ads-adapter';
import { logger } from '../shared/logger';

export function startTrackingGoogleRetryWorker() {
    cron.schedule('*/10 * * * *', async () => {
        try {
            const r = await retryFailedGoogleBatch({
                maxAgeHours: 24,
                maxRetries: 3,
                minSinceLastRetryMs: 5 * 60 * 1000,
                limit: 100,
            });
            if (r.attempted > 0) {
                logger.info(
                    `📡 Tracking Google retry: ${r.succeeded}/${r.attempted} recuperado(s), ${r.still_failed} ainda falhando`
                );
            }
        } catch (err: any) {
            logger.error('Tracking Google retry worker falhou', { error: err.message });
        }
    });

    logger.info('📡 Tracking Google Ads retry worker started (a cada 10min)');
}
