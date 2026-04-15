// ==============================
// TrafficAI — Token Refresh Worker
// ==============================

import cron from 'node-cron';
import { authRepository } from '../auth/auth.repository';
import { authService } from '../auth/auth.service';
import { logger } from '../shared/logger';

/**
 * Background worker that refreshes Meta tokens before they expire.
 * Runs every 12 hours and refreshes tokens expiring within 7 days.
 */
export function startTokenRefreshWorker(): void {
    logger.info('🔑 Starting token refresh worker (every 12 hours)');

    // Run every 12 hours
    cron.schedule('0 */12 * * *', async () => {
        logger.info('Token refresh worker triggered');

        try {
            const users = await authRepository.getUsersWithExpiredTokens();
            logger.info(`Found ${users.length} tokens to refresh`);

            for (const user of users) {
                try {
                    await authService.refreshMetaToken(user.id);
                    logger.info('Token refreshed', { userId: user.id });
                } catch (err: any) {
                    logger.error('Failed to refresh token', {
                        userId: user.id,
                        error: err.message,
                    });
                }
            }

            logger.info('Token refresh cycle completed');
        } catch (err: any) {
            logger.error('Token refresh worker failed', { error: err.message });
        }
    });
}
