// ==============================
// TrafficAI — Sync Worker (Background Job)
// ==============================

import cron from 'node-cron';
import { authRepository } from '../auth/auth.repository';
import { metaService } from '../meta/meta.service';
import { smartAlertsService } from '../analytics/smart-alerts.service';
import { logger } from '../shared/logger';

/**
 * Background sync worker that runs every 5 minutes.
 * - Fetches latest metrics from Meta Ads API
 * - Saves historical data to database
 * - Checks for anomalies and generates alerts
 */
export function startSyncWorker(): void {
    logger.info('📡 Starting sync worker (every hour, 8h–20h)');

    // Run every hour between 8am and 8pm
    cron.schedule('0 8-20 * * *', async () => {
        logger.info('Sync worker triggered');

        try {
            const users = await authRepository.getAllConnectedUsers();
            logger.info(`Found ${users.length} connected users to sync`);

            for (const user of users) {
                try {
                    // Sync Meta data
                    await metaService.syncUserData(user.id, user.access_token!);

                    // Check for anomalies (only active client accounts)
                    await smartAlertsService.analyzeActiveAccountsByUser(user.id);

                    logger.info('User sync completed', { userId: user.id });
                } catch (err: any) {
                    logger.error('Failed to sync user', {
                        userId: user.id,
                        error: err.message,
                    });
                }
            }

            logger.info('Sync cycle completed');
        } catch (err: any) {
            logger.error('Sync worker cycle failed', { error: err.message });
        }
    });
}
