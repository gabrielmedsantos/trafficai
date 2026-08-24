// ==============================
// Billing controller — endpoints Stripe SaaS
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { ValidationError } from '../shared/errors';
import { logger } from '../shared/logger';
import {
    createCheckoutSession, createPortalSession, getUserSubscription,
    handleWebhookEvent, getAiUsage, PLAN_LIMITS,
} from './stripe.service';

// ─── PÚBLICO — webhook Stripe (raw body!) ────────────────────
const publicRouter = Router();

publicRouter.post(
    '/webhook',
    // IMPORTANTE: raw body pra validar assinatura Stripe
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
        const signature = req.headers['stripe-signature'] as string;
        if (!signature) return res.status(400).send('Missing stripe-signature');
        try {
            await handleWebhookEvent(req.body, signature);
            res.json({ received: true });
        } catch (err: any) {
            logger.warn('billing webhook: falhou', { error: err.message });
            res.status(err.statusCode || 500).send(err.message);
        }
    }
);

// ─── AUTENTICADO ─────────────────────────────────────────────
const authed = Router();
authed.use(authMiddleware);

/** GET /billing/subscription — retorna estado atual + limites + uso */
authed.get('/subscription', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sub = await getUserSubscription(req.user!.userId);
        const usage = await getAiUsage(req.user!.userId);
        const { query: dbQuery } = await import('../database/connection');

        // Conta clients atuais
        const clientsRow = await dbQuery<{ n: number }>(
            `SELECT COUNT(*)::int AS n FROM ad_accounts WHERE user_id = $1 AND is_client_active = TRUE`,
            [req.user!.userId]
        );
        const clientsCount = clientsRow[0]?.n || 0;

        // Admin flag — bypassa cobrança
        const roleRow = await dbQuery<{ role: string }>(
            `SELECT role FROM users WHERE id = $1`,
            [req.user!.userId]
        );
        const isAdmin = roleRow[0]?.role === 'admin';

        res.json({
            success: true,
            data: {
                plan: sub.plan,
                status: sub.status,
                trial_ends_at: sub.trial_ends_at,
                current_period_start: sub.current_period_start,
                current_period_end: sub.current_period_end,
                cancel_at_period_end: sub.cancel_at_period_end,
                limits: {
                    max_clients: isAdmin ? 999999 : sub.max_clients,
                    max_seats: isAdmin ? 999999 : sub.max_seats,
                    monthly_ai_credits: isAdmin ? 999999 : sub.monthly_ai_credits,
                },
                usage: {
                    clients: clientsCount,
                    ai_credits_used: usage.used,
                },
                has_stripe_customer: !!sub.stripe_customer_id,
                is_admin: isAdmin,
            },
        });
    } catch (err) { next(err); }
});

/** POST /billing/checkout { plan } — retorna URL do Stripe Checkout */
authed.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const plan = String(req.body?.plan || '').toLowerCase();
        if (!['starter', 'pro', 'agency', 'elite'].includes(plan)) {
            throw new ValidationError('plan deve ser starter/pro/agency/elite');
        }
        const frontUrl = process.env.FRONTEND_URL || 'https://app.alfamaxdigital.com.br';
        const result = await createCheckoutSession(
            req.user!.userId,
            plan,
            `${frontUrl}/billing?checkout=success`,
            `${frontUrl}/billing?checkout=cancel`
        );
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

/** POST /billing/portal — retorna URL do Stripe Customer Portal */
authed.post('/portal', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const frontUrl = process.env.FRONTEND_URL || 'https://app.alfamaxdigital.com.br';
        const result = await createPortalSession(req.user!.userId, `${frontUrl}/billing`);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

/** GET /billing/plans — lista de planos disponíveis (pra frontend) */
authed.get('/plans', (_req: Request, res: Response) => {
    const plans = Object.entries(PLAN_LIMITS)
        .filter(([p]) => p !== 'trial')
        .map(([id, cfg]) => ({ id, ...cfg }));
    res.json({ success: true, data: plans });
});

export const billingPublicController = publicRouter;
export const billingController = authed;
