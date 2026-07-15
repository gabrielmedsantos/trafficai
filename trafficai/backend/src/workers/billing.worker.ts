// ==============================
// TrafficAI — Billing Worker
// Gera contract_billing do mês corrente automaticamente pra todos
// os contratos ativos (fixed/mixed) e marca pendências vencidas como overdue.
// Idempotente: ON CONFLICT (contract_id, reference_month) DO NOTHING.
// ==============================

import cron from 'node-cron';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

interface BillingResult {
    users_processed: number;
    billings_created: number;
    overdue_marked: number;
}

/**
 * Gera billing do mês corrente pra todos os contratos ativos de todos os users.
 * Roda em uma transação por user pra não vazar erro entre usuários.
 */
export async function generateMonthlyBillingForAllUsers(): Promise<BillingResult> {
    const now = new Date();
    const targetMonth = now.getMonth() + 1;
    const targetYear = now.getFullYear();
    const refMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();

    // 1) Busca todos os contratos ativos que precisam de billing no mês corrente
    const contracts = await query<{
        id: string;
        user_id: string;
        client_id: string;
        fixed_amount: string | number;
        billing_day: number | null;
    }>(
        `SELECT c.id, c.user_id, c.client_id, c.fixed_amount, c.billing_day
         FROM contracts c
         WHERE c.status = 'active'
           AND c.type IN ('fixed', 'mixed')
           AND (c.start_date IS NULL OR c.start_date <= $1)
           AND (c.end_date IS NULL OR c.end_date >= $1)`,
        [refMonth]
    );

    let billingsCreated = 0;
    const usersTouched = new Set<string>();

    for (const c of contracts) {
        try {
            const fixedAmt = Number(c.fixed_amount) || 0;
            const billingDay = Math.min(
                Math.max(1, Number(c.billing_day) || 1),
                lastDayOfMonth
            );
            const dueDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(billingDay).padStart(2, '0')}`;

            const inserted = await query<{ id: string }>(
                `INSERT INTO contract_billing
                   (user_id, contract_id, client_id, reference_month, due_date,
                    fixed_amount, percentage_amount, total_amount, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'pending')
                 ON CONFLICT (contract_id, reference_month) DO NOTHING
                 RETURNING id`,
                [c.user_id, c.id, c.client_id, refMonth, dueDate, fixedAmt]
            );

            if (inserted.length > 0) billingsCreated++;
            usersTouched.add(c.user_id);
        } catch (err: any) {
            logger.warn('billing-worker: falha em contrato', { contract_id: c.id, error: err.message });
        }
    }

    // 2) Marca todas as pendências vencidas (due_date < hoje) como overdue
    const overdueResult = await query<{ id: string }>(
        `UPDATE contract_billing
           SET status = 'overdue', updated_at = NOW()
         WHERE status = 'pending'
           AND due_date IS NOT NULL
           AND due_date < CURRENT_DATE
         RETURNING id`
    );

    return {
        users_processed: usersTouched.size,
        billings_created: billingsCreated,
        overdue_marked: overdueResult.length,
    };
}

/**
 * Worker que roda todo dia às 04:00 UTC (01:00 BRT) — após meia-noite local
 * mas antes do horário comercial. Roda diariamente porque:
 *  - cobre contratos cadastrados meio do mês (geram billing imediatamente no próximo dia)
 *  - atualiza overdue automaticamente
 *  - é idempotente, então rodar todo dia não duplica
 */
export function startBillingWorker() {
    // Todo dia às 04:00 UTC
    cron.schedule('0 4 * * *', async () => {
        try {
            const r = await generateMonthlyBillingForAllUsers();
            logger.info(
                `📅 Billing diário: ${r.billings_created} novo(s), ${r.overdue_marked} marcado(s) overdue, ${r.users_processed} user(s)`
            );
        } catch (err: any) {
            logger.error('Billing worker falhou', { error: err.message });
        }
    });

    // Roda 30s após o boot pra fechar gap caso o serviço tenha ficado fora no horário do cron
    setTimeout(async () => {
        try {
            const r = await generateMonthlyBillingForAllUsers();
            logger.info(
                `📅 Billing inicial: ${r.billings_created} novo(s), ${r.overdue_marked} marcado(s) overdue, ${r.users_processed} user(s)`
            );
        } catch (err: any) {
            logger.error('Billing inicial falhou', { error: err.message });
        }
    }, 30 * 1000);

    logger.info('📅 Billing worker started (diário às 04:00 UTC + boot)');
}
