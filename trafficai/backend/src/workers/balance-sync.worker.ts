// ==============================
// TrafficAI — Balance Sync Worker
// Sincroniza cached_balance de TODAS as contas ativas a cada hora,
// pra alertas de saldo terem dado fresco sem precisar do botão manual.
// ==============================

import cron from 'node-cron';
import { query } from '../database/connection';
import { metaService } from '../meta/meta.service';
import { logger } from '../shared/logger';
import { sendWhatsAppMessage } from '../notifications/whatsapp.helper';

interface UserAccounts {
    user_id: string;
    access_token: string | null;
    token_expiration: Date | null;
    accounts: Array<{ id: string; meta_account_id: string }>;
}

/**
 * Roda o sync de saldos pra todos os users com contas ativas + token válido.
 * Retorna quantas contas foram sincronizadas no total.
 */
export async function syncAllBalances(): Promise<number> {
    // Junta users + contas ativas em uma query só
    const rows = await query<{
        user_id: string;
        access_token: string | null;
        token_expiration: Date | null;
        account_id: string;
        meta_account_id: string;
    }>(`
        SELECT u.id AS user_id, u.access_token, u.token_expiration,
               a.id AS account_id, a.meta_account_id
        FROM users u
        JOIN ad_accounts a ON a.user_id = u.id
        WHERE a.is_client_active = true
          AND u.access_token IS NOT NULL
          AND (u.token_expiration IS NULL OR u.token_expiration > NOW())
    `);

    if (rows.length === 0) return 0;

    // Agrupa por user
    const byUser = new Map<string, UserAccounts>();
    for (const r of rows) {
        if (!byUser.has(r.user_id)) {
            byUser.set(r.user_id, {
                user_id: r.user_id,
                access_token: r.access_token,
                token_expiration: r.token_expiration,
                accounts: [],
            });
        }
        byUser.get(r.user_id)!.accounts.push({ id: r.account_id, meta_account_id: r.meta_account_id });
    }

    let total = 0;
    for (const u of byUser.values()) {
        try {
            await metaService.syncAccountBalances(u.user_id, u.access_token!, u.accounts);
            total += u.accounts.length;
        } catch (err: any) {
            logger.warn('balance-sync: falha pro user', { user_id: u.user_id, error: err.message });
        }
    }
    return total;
}

/**
 * Checa contas com balance_alert_enabled e dispara WhatsApp se cached_balance
 * caiu abaixo do threshold. Dedup: envia no máximo 1 alerta por dia por conta.
 */
export async function checkBalanceAlerts(): Promise<number> {
    const rows = await query<any>(`
        SELECT a.id, a.account_name, a.cached_balance, a.balance_alert_threshold,
               a.balance_alert_phone, a.balance_alert_last_sent_at, a.user_id
        FROM ad_accounts a
        WHERE a.balance_alert_enabled = TRUE
          AND a.balance_alert_threshold IS NOT NULL
          AND a.balance_alert_phone IS NOT NULL
          AND a.cached_balance IS NOT NULL
          AND a.cached_balance <= a.balance_alert_threshold
          AND (a.balance_alert_last_sent_at IS NULL
               OR a.balance_alert_last_sent_at < NOW() - INTERVAL '20 hours')
    `);

    let sent = 0;
    for (const r of rows) {
        const balBRL = Number(r.cached_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const thBRL = Number(r.balance_alert_threshold).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const msg = `⚠️ *Saldo baixo — ${r.account_name}*\n\n💰 Saldo atual: R$ ${balBRL}\n🎯 Limite alertado: R$ ${thBRL}\n\nRecarregue a conta pra não pausar as campanhas.`;

        try {
            await sendWhatsAppMessage(r.user_id, r.balance_alert_phone, msg);
            await query(`UPDATE ad_accounts SET balance_alert_last_sent_at = NOW() WHERE id = $1`, [r.id]);
            sent++;
            logger.info(`🚨 Alerta saldo enviado: ${r.account_name} → ${r.balance_alert_phone}`);
        } catch (e: any) {
            logger.warn(`Alerta saldo falhou: ${r.account_name}`, { error: e.message });
        }
    }
    return sent;
}

/**
 * Worker que sincroniza saldos a cada hora e antes do worker de alertas.
 */
export function startBalanceSyncWorker() {
    // A cada hora no minuto 0
    cron.schedule('0 * * * *', async () => {
        try {
            const synced = await syncAllBalances();
            logger.info(`💰 Balance sync horário: ${synced} conta(s) atualizadas`);
            const alerts = await checkBalanceAlerts();
            if (alerts > 0) logger.info(`🚨 ${alerts} alerta(s) de saldo enviado(s)`);
        } catch (err: any) {
            logger.error('Balance sync falhou', { error: err.message });
        }
    });

    // Roda uma vez 5min após o boot pra garantir dados frescos
    setTimeout(async () => {
        try {
            const synced = await syncAllBalances();
            logger.info(`💰 Balance sync inicial: ${synced} conta(s) atualizadas`);
        } catch (err: any) {
            logger.error('Balance sync inicial falhou', { error: err.message });
        }
    }, 5 * 60 * 1000);

    logger.info('💰 Balance sync worker started (a cada hora)');
}
