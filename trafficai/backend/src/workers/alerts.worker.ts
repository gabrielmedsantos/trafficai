// ==============================
// TrafficAI — Alerts Worker
// Monitora contas ativas e gera alertas automáticos
// ==============================

import cron from 'node-cron';
import { smartAlertsService } from '../analytics/smart-alerts.service';
import { syncAllBalances } from './balance-sync.worker';
import { logger } from '../shared/logger';

/**
 * Worker que executa análise de alertas 1x por dia.
 * Antes de analisar, sincroniza saldos pra garantir dados frescos.
 */
export function startAlertsWorker() {
    cron.schedule('0 9 * * *', async () => {
        try {
            logger.info('🔔 Alerts worker triggered — sincronizando saldos primeiro');
            try {
                const synced = await syncAllBalances();
                logger.info(`💰 Pre-alert balance sync: ${synced} conta(s) atualizadas`);
            } catch (e: any) {
                logger.warn('Pre-alert balance sync falhou (segue mesmo assim)', { error: e.message });
            }
            await smartAlertsService.analyzeActiveAccounts();
        } catch (error: any) {
            logger.error('Alerts worker failed', { error: error.message });
        }
    });

    logger.info('🔔 Alerts worker started (daily at 9h)');
}
