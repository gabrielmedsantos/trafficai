// ==============================
// AI Credits Middleware — bloqueia se estourar limite mensal do plano
// ==============================

import { Request, Response, NextFunction } from 'express';
import { consumeAiCredits } from '../billing/stripe.service';
import { logger } from '../shared/logger';

/**
 * Middleware: consome N créditos IA. Bloqueia (402) se estourar limite mensal.
 * Limite vem da assinatura do user (user_subscriptions.monthly_ai_credits).
 */
export function consumeAiCredit(endpoint: string, cost: number = 1) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const userId = req.user?.userId;
        if (!userId) return next();

        try {
            const result = await consumeAiCredits(userId, cost);
            if (!result.ok) {
                return res.status(402).json({
                    success: false,
                    error: {
                        message: `Créditos IA insuficientes (${result.used}/${result.limit} usados este ciclo). Faça upgrade do plano.`,
                        code: 402,
                        credits: { used: result.used, limit: result.limit, cost },
                    },
                });
            }
            // Registra evento (best-effort, não bloqueia)
            const { query } = await import('../database/connection');
            await query(
                `INSERT INTO ai_credit_events (user_id, endpoint, credits_consumed) VALUES ($1, $2, $3)`,
                [userId, endpoint, cost]
            ).catch((e: any) => logger.warn('ai-credit-event insert falhou', { error: e.message }));

            next();
        } catch (err: any) {
            logger.warn('consumeAiCredit falhou', { error: err.message });
            // Fail-open pra não travar endpoint em caso de erro no billing
            next();
        }
    };
}
