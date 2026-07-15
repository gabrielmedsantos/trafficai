// ==============================
// Automation Worker — avalia regras SE/ENTÃO a cada hora
// ==============================

import cron from 'node-cron';
import { evaluateAllActiveRules } from '../automation/automation.service';
import { logger } from '../shared/logger';

export function startAutomationWorker() {
    // A cada hora no minuto 15
    cron.schedule('15 * * * *', async () => {
        try {
            const r = await evaluateAllActiveRules();
            if (r.total_triggered > 0) {
                logger.info(`🤖 Automation: ${r.rules} regra(s) avaliada(s), ${r.total_triggered} ação(ões) executada(s)`);
            }
        } catch (err: any) {
            logger.error('Automation worker falhou', { error: err.message });
        }
    });
    logger.info('🤖 Automation worker started (hourly at :15)');
}
