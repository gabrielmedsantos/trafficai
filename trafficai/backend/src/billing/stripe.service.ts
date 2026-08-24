// ==============================
// Stripe service — assinaturas SaaS TrafficAI
// ==============================

import Stripe from 'stripe';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { AppError } from '../shared/errors';

// Mapa plano → limites (fonte da verdade — Stripe é ID, aqui é config)
export const PLAN_LIMITS: Record<string, { max_clients: number; max_seats: number; monthly_ai_credits: number; price_brl: number; }> = {
    trial:   { max_clients: 3,   max_seats: 1,  monthly_ai_credits: 20,   price_brl: 0    },
    starter: { max_clients: 5,   max_seats: 1,  monthly_ai_credits: 50,   price_brl: 101  },
    pro:     { max_clients: 20,  max_seats: 3,  monthly_ai_credits: 300,  price_brl: 197  },
    agency:  { max_clients: 50,  max_seats: 5,  monthly_ai_credits: 600,  price_brl: 317  },
    elite:   { max_clients: 100, max_seats: 7,  monthly_ai_credits: 1200, price_brl: 437  },
};

// Mapa STRIPE_PRICE_ID_XXX env var → plano
export function planFromPriceId(priceId: string | null | undefined): string | null {
    if (!priceId) return null;
    if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return 'starter';
    if (priceId === process.env.STRIPE_PRICE_ID_PRO) return 'pro';
    if (priceId === process.env.STRIPE_PRICE_ID_AGENCY) return 'agency';
    if (priceId === process.env.STRIPE_PRICE_ID_ELITE) return 'elite';
    return null;
}
export function priceIdFromPlan(plan: string): string | null {
    switch (plan) {
        case 'starter': return process.env.STRIPE_PRICE_ID_STARTER || null;
        case 'pro':     return process.env.STRIPE_PRICE_ID_PRO || null;
        case 'agency':  return process.env.STRIPE_PRICE_ID_AGENCY || null;
        case 'elite':   return process.env.STRIPE_PRICE_ID_ELITE || null;
        default: return null;
    }
}

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
    if (stripeClient) return stripeClient;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new AppError('STRIPE_SECRET_KEY não configurada', 500);
    stripeClient = new Stripe(key, { apiVersion: '2024-04-10' as any });
    return stripeClient;
}

/**
 * Retorna assinatura do user (sempre existe — trial default criado no registro).
 */
export async function getUserSubscription(userId: string) {
    const r = await query<any>(
        `SELECT * FROM user_subscriptions WHERE user_id = $1`,
        [userId]
    );
    if (r.length) return r[0];
    // Cria trial se não existe (defensivo — migration 046 já faz isso)
    const trial = await query<any>(
        `INSERT INTO user_subscriptions (user_id, plan, status, trial_ends_at, max_clients, max_seats, monthly_ai_credits)
         VALUES ($1, 'trial', 'trialing', NOW() + INTERVAL '7 days', 3, 1, 20)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING *`,
        [userId]
    );
    return trial[0] || (await query<any>(`SELECT * FROM user_subscriptions WHERE user_id = $1`, [userId]))[0];
}

/**
 * Cria sessão de checkout Stripe pro plano escolhido.
 */
export async function createCheckoutSession(userId: string, plan: string, successUrl: string, cancelUrl: string): Promise<{ url: string }> {
    const priceId = priceIdFromPlan(plan);
    if (!priceId) throw new AppError(`Plano "${plan}" não configurado (falta STRIPE_PRICE_ID_${plan.toUpperCase()})`, 400);

    const userRows = await query<any>(`SELECT email, name FROM users WHERE id = $1`, [userId]);
    if (!userRows.length) throw new AppError('Usuário não encontrado', 404);
    const user = userRows[0];

    const sub = await getUserSubscription(userId);
    const stripe = getStripe();

    // Reutiliza customer se já existe
    let customerId = sub.stripe_customer_id;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: { user_id: userId },
        });
        customerId = customer.id;
        await query(
            `UPDATE user_subscriptions SET stripe_customer_id = $1, updated_at = NOW() WHERE user_id = $2`,
            [customerId, userId]
        );
    }

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
            metadata: { user_id: userId, plan },
        },
        metadata: { user_id: userId, plan },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        locale: 'pt-BR',
    });

    logger.info('stripe: checkout session criada', { userId, plan, sessionId: session.id });
    return { url: session.url! };
}

/**
 * Cria sessão do portal Stripe pro cliente gerenciar assinatura (cancelar/upgrade/nota).
 */
export async function createPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
    const sub = await getUserSubscription(userId);
    if (!sub.stripe_customer_id) throw new AppError('Cliente Stripe não encontrado — assine um plano primeiro', 400);
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: returnUrl,
    });
    return { url: session.url };
}

/**
 * Handler central de webhook — processa evento e atualiza DB.
 * IMPORTANTE: idempotente via stripe_webhook_events.
 */
export async function handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new AppError('STRIPE_WEBHOOK_SECRET não configurada', 500);

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: any) {
        logger.warn('stripe webhook: assinatura inválida', { error: err.message });
        throw new AppError('Assinatura webhook inválida', 400);
    }

    // Idempotência
    const dup = await query(
        `INSERT INTO stripe_webhook_events (id, type, payload) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [event.id, event.type, JSON.stringify(event.data.object)]
    );
    if (!dup.length) {
        logger.info('stripe webhook: evento duplicado ignorado', { id: event.id, type: event.type });
        return;
    }

    logger.info('stripe webhook:', { id: event.id, type: event.type });

    switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.trial_will_end':
            await upsertSubscription(event.data.object as Stripe.Subscription);
            break;

        case 'customer.subscription.deleted':
            await markCanceled(event.data.object as Stripe.Subscription);
            break;

        case 'invoice.payment_failed':
            await markPastDue(event.data.object as Stripe.Invoice);
            break;

        case 'invoice.payment_succeeded':
            await markActive(event.data.object as Stripe.Invoice);
            break;

        default:
            logger.debug('stripe webhook: evento não tratado', { type: event.type });
    }
}

async function upsertSubscription(sub: Stripe.Subscription) {
    const priceId = sub.items.data[0]?.price?.id;
    const plan = planFromPriceId(priceId) || 'trial';
    const limits = PLAN_LIMITS[plan];
    const userId = sub.metadata?.user_id || await getUserIdByCustomer(sub.customer as string);
    if (!userId) {
        logger.warn('stripe: subscription sem user_id', { subId: sub.id, customer: sub.customer });
        return;
    }

    await query(
        `UPDATE user_subscriptions SET
            stripe_subscription_id = $1,
            stripe_price_id = $2,
            plan = $3,
            status = $4,
            trial_ends_at = $5,
            current_period_start = to_timestamp($6),
            current_period_end = to_timestamp($7),
            cancel_at_period_end = $8,
            max_clients = $9,
            max_seats = $10,
            monthly_ai_credits = $11,
            updated_at = NOW()
         WHERE user_id = $12`,
        [
            sub.id,
            priceId,
            plan,
            sub.status,
            sub.trial_end ? new Date(sub.trial_end * 1000) : null,
            (sub as any).current_period_start,
            (sub as any).current_period_end,
            sub.cancel_at_period_end,
            limits.max_clients,
            limits.max_seats,
            limits.monthly_ai_credits,
            userId,
        ]
    );
    logger.info('stripe: subscription atualizada', { userId, plan, status: sub.status });
}

async function markCanceled(sub: Stripe.Subscription) {
    const userId = sub.metadata?.user_id || await getUserIdByCustomer(sub.customer as string);
    if (!userId) return;
    await query(
        `UPDATE user_subscriptions SET status = 'canceled', canceled_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
        [userId]
    );
}

async function markPastDue(inv: Stripe.Invoice) {
    const customer = inv.customer as string;
    const userId = await getUserIdByCustomer(customer);
    if (!userId) return;
    await query(
        `UPDATE user_subscriptions SET status = 'past_due', updated_at = NOW() WHERE user_id = $1`,
        [userId]
    );
}

async function markActive(inv: Stripe.Invoice) {
    const customer = inv.customer as string;
    const userId = await getUserIdByCustomer(customer);
    if (!userId) return;
    await query(
        `UPDATE user_subscriptions SET status = 'active', updated_at = NOW() WHERE user_id = $1 AND status != 'active'`,
        [userId]
    );
}

async function getUserIdByCustomer(customerId: string): Promise<string | null> {
    const r = await query<{ user_id: string }>(
        `SELECT user_id FROM user_subscriptions WHERE stripe_customer_id = $1 LIMIT 1`,
        [customerId]
    );
    return r[0]?.user_id || null;
}

// ─── CRÉDITOS IA ─────────────────────────────────────────────

/**
 * Consome N créditos IA — retorna false se estourou o limite.
 * Chamado ANTES de cada endpoint IA. Se retornar false, bloqueia.
 */
export async function consumeAiCredits(userId: string, amount: number = 1): Promise<{ ok: boolean; used: number; limit: number }> {
    const sub = await getUserSubscription(userId);
    const limit = sub.monthly_ai_credits || 0;
    const periodStart = sub.current_period_start
        ? new Date(sub.current_period_start).toISOString().slice(0, 10)
        : firstOfMonth();

    const usageRow = await query<{ credits_used: number }>(
        `INSERT INTO ai_credit_usage (user_id, period_start, credits_used)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (user_id, period_start) DO UPDATE
           SET credits_used = ai_credit_usage.credits_used + EXCLUDED.credits_used, updated_at = NOW()
         RETURNING credits_used`,
        [userId, periodStart, amount]
    );
    const used = usageRow[0]?.credits_used || amount;

    if (used > limit) {
        // Rollback
        await query(
            `UPDATE ai_credit_usage SET credits_used = credits_used - $1, updated_at = NOW()
             WHERE user_id = $2 AND period_start = $3::date`,
            [amount, userId, periodStart]
        );
        return { ok: false, used: used - amount, limit };
    }
    return { ok: true, used, limit };
}

export async function getAiUsage(userId: string): Promise<{ used: number; limit: number; period_start: string }> {
    const sub = await getUserSubscription(userId);
    const limit = sub.monthly_ai_credits || 0;
    const periodStart = sub.current_period_start
        ? new Date(sub.current_period_start).toISOString().slice(0, 10)
        : firstOfMonth();
    const r = await query<{ credits_used: number }>(
        `SELECT credits_used FROM ai_credit_usage WHERE user_id = $1 AND period_start = $2::date`,
        [userId, periodStart]
    );
    return { used: r[0]?.credits_used || 0, limit, period_start: periodStart };
}

function firstOfMonth(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// ─── VERIFICAÇÃO DE ACESSO ─────────────────────────────────

export type SubscriptionCheck = { ok: boolean; reason?: string; upgrade_plan?: string };

/** Assinatura precisa estar ativa OU em trial válido pra usar app. */
export function isSubscriptionActive(sub: any): boolean {
    if (!sub) return false;
    if (sub.status === 'active') return true;
    if (sub.status === 'trialing') {
        if (!sub.trial_ends_at) return false;
        return new Date(sub.trial_ends_at) > new Date();
    }
    return false;
}

export async function canAddClient(userId: string): Promise<SubscriptionCheck> {
    const sub = await getUserSubscription(userId);
    if (!isSubscriptionActive(sub)) return { ok: false, reason: 'Assinatura expirada. Faça upgrade pra continuar.', upgrade_plan: 'starter' };
    const r = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM ad_accounts WHERE user_id = $1 AND is_client_active = TRUE`,
        [userId]
    );
    const current = r[0]?.n || 0;
    if (current >= sub.max_clients) {
        return { ok: false, reason: `Limite de ${sub.max_clients} clientes atingido no plano ${sub.plan}.`, upgrade_plan: nextPlan(sub.plan) };
    }
    return { ok: true };
}

export async function canAddSeat(userId: string): Promise<SubscriptionCheck> {
    const sub = await getUserSubscription(userId);
    if (!isSubscriptionActive(sub)) return { ok: false, reason: 'Assinatura expirada.', upgrade_plan: 'starter' };
    // Assume team members table — se não existir, retorna ok (defensivo)
    try {
        const r = await query<{ n: number }>(
            `SELECT COUNT(*)::int AS n FROM team_members WHERE owner_user_id = $1`,
            [userId]
        );
        const current = (r[0]?.n || 0) + 1; // +1 = dono
        if (current >= sub.max_seats) {
            return { ok: false, reason: `Limite de ${sub.max_seats} usuários atingido.`, upgrade_plan: nextPlan(sub.plan) };
        }
    } catch { /* team_members não existe ainda */ }
    return { ok: true };
}

function nextPlan(current: string): string {
    switch (current) {
        case 'trial': return 'starter';
        case 'starter': return 'pro';
        case 'pro': return 'agency';
        case 'agency': return 'elite';
        default: return 'elite';
    }
}
