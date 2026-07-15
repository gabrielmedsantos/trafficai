// ==============================
// AI Credits Middleware — controla consumo por chamada
// ==============================

import { Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

export function consumeAiCredit(endpoint: string, cost: number = 1) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const userId = req.user?.userId;
        if (!userId) return next();

        // Reset mensal se passou
        await query(
            `UPDATE users
             SET ai_credits = ai_credits_monthly_limit,
                 ai_credits_reset_at = NOW() + INTERVAL '30 days'
             WHERE id = $1
               AND ai_credits_reset_at IS NOT NULL
               AND ai_credits_reset_at < NOW()`,
            [userId]
        );

        // Checa saldo
        const r = await query<{ ai_credits: number; ai_credits_monthly_limit: number }>(
            `SELECT ai_credits, ai_credits_monthly_limit FROM users WHERE id = $1`,
            [userId]
        );
        if (!r.length) return next();
        const { ai_credits, ai_credits_monthly_limit } = r[0];

        if (ai_credits < cost) {
            return res.status(402).json({
                success: false,
                error: {
                    message: `Créditos IA insuficientes (${ai_credits}/${ai_credits_monthly_limit} disponíveis). Aguarde o reset mensal ou solicite upgrade.`,
                    code: 402,
                    credits: { balance: ai_credits, limit: ai_credits_monthly_limit, cost },
                },
            });
        }

        // Consome + registra
        await query(`UPDATE users SET ai_credits = ai_credits - $1 WHERE id = $2`, [cost, userId]);
        await query(
            `INSERT INTO ai_credit_events (user_id, endpoint, credits_consumed) VALUES ($1, $2, $3)`,
            [userId, endpoint, cost]
        ).catch((e: any) => logger.warn('ai-credit-event insert falhou', { error: e.message }));

        next();
    };
}
