// ==============================
// TrafficAI — Admin do SaaS
// Só o dono da plataforma (role admin, conta própria, fora de "Entrar como"):
// lista clientes que assinam o sistema, muda plano/teste/cortesia, suspende
// e abre uma sessão de suporte ("Entrar como") com prazo de 1 hora.
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { authMiddleware, actorIdOf } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';
import { invalidateIdentity, loadIdentity } from '../auth/identity';
import { PLAN_LIMITS, getUserSubscription } from '../billing/stripe.service';
import { recordAudit } from '../audit/audit.service';
import { logger } from '../shared/logger';

const router = Router();
router.use(authMiddleware);

/** Dono da plataforma: admin, conta própria, logado como ele mesmo. */
router.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const actor = actorIdOf(req);
        const ident = await loadIdentity(actor);
        if (req.user?.imp || !ident || ident.role !== 'admin' || ident.ownerId) {
            res.status(403).json({ success: false, error: { message: 'Área restrita ao administrador do sistema' } });
            return;
        }
        next();
    } catch (err) { next(err); }
});

async function loadCustomer(id: string) {
    const [row] = await query<any>(
        `SELECT id, name, email, role, owner_id FROM users WHERE id = $1`, [id]
    );
    return row && !row.owner_id && row.role !== 'admin' ? row : null;
}

// GET /admin/saas/customers — clientes do SaaS (sem a equipe e sem admins)
router.get('/customers', async (_req: Request, res: Response) => {
    try {
        const rows = await query<any>(
            `SELECT u.id, u.name, u.email, u.created_at, u.last_seen_at, u.suspended_at,
                    s.plan, s.status, s.trial_ends_at, s.current_period_end, s.cancel_at_period_end,
                    s.courtesy, s.courtesy_until, s.stripe_customer_id IS NOT NULL AS has_stripe, s.allow_uazapi,
                    (SELECT COUNT(*)::int FROM ad_accounts a WHERE a.user_id = u.id AND a.is_client_active = TRUE) AS active_accounts,
                    (SELECT COUNT(*)::int FROM users t WHERE t.owner_id = u.id) AS team_size
             FROM users u
             LEFT JOIN user_subscriptions s ON s.user_id = u.id
             WHERE u.owner_id IS NULL AND u.role <> 'admin'
             ORDER BY u.created_at DESC`
        );
        const data = rows.map((r: any) => {
            const limits = PLAN_LIMITS[r.plan || 'trial'] || PLAN_LIMITS.trial;
            return { ...r, price_brl: limits.price_brl, max_clients: limits.max_clients, max_seats: limits.max_seats };
        });
        res.json({ success: true, data, plans: PLAN_LIMITS });
    } catch (err: any) {
        logger.error('admin saas: listar clientes falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /admin/saas/customers/:id/history — últimas ações do admin sobre o cliente
router.get('/customers/:id/history', async (req: Request, res: Response) => {
    try {
        const rows = await query<any>(
            `SELECT action, details, created_at, user_name FROM audit_log
             WHERE entity_type = 'saas_customer' AND entity_id = $1
             ORDER BY created_at DESC LIMIT 20`,
            [req.params.id]
        ).catch(() => []);
        res.json({ success: true, data: rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PATCH /admin/saas/customers/:id/subscription  { plan?, extend_days?, courtesy?, courtesy_until? }
router.patch('/customers/:id/subscription', async (req: Request, res: Response) => {
    try {
        const customer = await loadCustomer(req.params.id);
        if (!customer) return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });
        const { plan, extend_days, courtesy, courtesy_until, allow_uazapi } = req.body || {};
        if (allow_uazapi !== undefined && allow_uazapi !== null && typeof allow_uazapi !== 'boolean') {
            return res.status(400).json({ success: false, error: { message: 'allow_uazapi deve ser true, false ou null' } });
        }
        if (plan !== undefined && !PLAN_LIMITS[plan]) {
            return res.status(400).json({ success: false, error: { message: 'Plano inválido' } });
        }
        const days = extend_days !== undefined ? Number(extend_days) : 0;
        if (!Number.isFinite(days) || days < 0 || days > 365) {
            return res.status(400).json({ success: false, error: { message: 'Dias de teste inválidos (0 a 365)' } });
        }

        const sub = await getUserSubscription(customer.id);
        const nextPlan = plan || sub.plan;
        const limits = PLAN_LIMITS[nextPlan];
        const sets: string[] = ['plan = $2', 'max_clients = $3', 'max_seats = $4', 'monthly_ai_credits = $5', 'updated_at = NOW()'];
        const params: any[] = [customer.id, nextPlan, limits.max_clients, limits.max_seats, limits.monthly_ai_credits];
        let i = params.length;

        if (days > 0) {
            // Estende a partir de hoje (se já venceu) ou do fim atual.
            sets.push(`trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + ($${++i} || ' days')::interval`);
            params.push(String(days));
            if (!courtesy && sub.status !== 'active') sets.push(`status = 'trialing'`);
        }
        if (courtesy !== undefined) {
            sets.push(`courtesy = $${++i}`);
            params.push(!!courtesy);
            sets.push(`courtesy_until = $${++i}`);
            params.push(courtesy && courtesy_until ? courtesy_until : null);
        }

        if (allow_uazapi !== undefined) {
            sets.push(`allow_uazapi = $${++i}`);
            params.push(allow_uazapi);
        }

        const [updated] = await query<any>(
            `UPDATE user_subscriptions SET ${sets.join(', ')} WHERE user_id = $1 RETURNING plan, status, trial_ends_at, courtesy, courtesy_until`,
            params
        );
        recordAudit({
            userId: actorIdOf(req),
            action: 'saas.subscription_changed',
            entityType: 'saas_customer',
            entityId: customer.id,
            entityLabel: customer.name || customer.email,
            details: { from_plan: sub.plan, plan: nextPlan, extend_days: days || undefined, courtesy, allow_uazapi },
        });
        res.json({ success: true, data: updated });
    } catch (err: any) {
        logger.error('admin saas: alterar assinatura falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /admin/saas/customers/:id/suspend  { suspended: boolean }
router.post('/customers/:id/suspend', async (req: Request, res: Response) => {
    try {
        const customer = await loadCustomer(req.params.id);
        if (!customer) return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });
        const suspended = req.body?.suspended !== false;
        await query(`UPDATE users SET suspended_at = ${suspended ? 'NOW()' : 'NULL'} WHERE id = $1 OR owner_id = $1`, [customer.id]);
        invalidateIdentity(customer.id);
        const team = await query<{ id: string }>(`SELECT id FROM users WHERE owner_id = $1`, [customer.id]);
        team.forEach((t) => invalidateIdentity(t.id));
        recordAudit({
            userId: actorIdOf(req),
            action: suspended ? 'saas.customer_suspended' : 'saas.customer_reactivated',
            entityType: 'saas_customer',
            entityId: customer.id,
            entityLabel: customer.name || customer.email,
        });
        res.json({ success: true, data: { suspended } });
    } catch (err: any) {
        logger.error('admin saas: suspender falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /admin/saas/customers/:id/impersonate — token de 1h pra ver como o cliente
router.post('/customers/:id/impersonate', async (req: Request, res: Response) => {
    try {
        const customer = await loadCustomer(req.params.id);
        if (!customer) return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });
        const adminId = actorIdOf(req);
        const token = authService.impersonationToken({ id: customer.id, email: customer.email }, adminId);
        recordAudit({
            userId: adminId,
            action: 'saas.impersonation_started',
            entityType: 'saas_customer',
            entityId: customer.id,
            entityLabel: customer.name || customer.email,
            details: { expires_in: '1h' },
        });
        logger.info('admin saas: entrar como', { admin: adminId, customer: customer.id });
        res.json({ success: true, data: { token, name: customer.name || customer.email, expires_in: 3600 } });
    } catch (err: any) {
        logger.error('admin saas: entrar como falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const saasAdminController = router;
