// ==============================
// TrafficAI — Alerts Worker
// Monitora contas ativas e gera alertas automáticos
// ==============================

import cron from 'node-cron';
import { smartAlertsService } from '../analytics/smart-alerts.service';
import { logger } from '../shared/logger';

/**
 * Worker que executa análise de alertas a cada 30 minutos
 */
export function startAlertsWorker() {
    // Executa 1x por dia às 9h
    cron.schedule('0 9 * * *', async () => {
        try {
            logger.info('🔔 Alerts worker triggered');
            await smartAlertsService.analyzeActiveAccounts();
        } catch (error: any) {
            logger.error('Alerts worker failed', { error: error.message });
        }
    });

    logger.info('🔔 Alerts worker started (daily at 9h)');
}
