// ==============================
// Google Ads Sync Worker — sync diário de contas ativas
// ==============================

import cron from 'node-cron';
import { query } from '../database/connection';
import { syncAccount } from '../googleAds/google-ads.service';
import { logger } from '../shared/logger';

export function startGoogleAdsSyncWorker() {
    // Diário 05:00 UTC (02:00 BRT) — depois do billing e CRM sync
    cron.schedule('0 5 * * *', async () => {
        try {
            const accounts = await query<any>(
                `SELECT a.id, a.user_id, a.account_name
                 FROM google_ads_accounts a
                 JOIN google_ads_credentials c ON c.user_id = a.user_id
                 WHERE a.is_client_active = true AND c.refresh_token IS NOT NULL`
            );
            let total = 0;
            for (const a of accounts) {
                try {
                    const r = await syncAccount(a.user_id, a.id, 7);
                    total += r.insights;
                } catch (err: any) {
                    logger.warn(`google-ads sync diário falhou: ${a.account_name}`, { error: err.message });
                }
            }
            logger.info(`📊 Google Ads sync diário: ${accounts.length} conta(s), ${total} insight(s)`);
        } catch (err: any) {
            logger.error('Google Ads sync worker falhou', { error: err.message });
        }
    });
    logger.info('📊 Google Ads sync worker started (diário 05:00 UTC)');
}
