// ==============================
// TrafficAI — Plan Guard Middleware
// Bloqueia acesso quando o user NÃO tem assinatura ativa ou trial vigente.
// Responde 402 Payment Required com metadata pro frontend redirecionar.
//
// Aplica GLOBAL antes das rotas protegidas em routes.ts.
// Rotas isentas (auth, billing, webhooks, endpoints públicos) são reconhecidas
// pelo prefixo do path.
// ==============================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUserSubscription } from './stripe.service';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Prefixos que NÃO exigem plano ativo (auth, billing, webhooks públicos,
// endpoints públicos de relatório/tracking, callbacks OAuth, onboarding).
// Match por startsWith.
const EXEMPT_PATH_PREFIXES = [
    '/health',
    '/auth/',
    '/billing/',              // /billing/subscription (ver status), /billing/checkout (assinar), /billing/portal, /billing/plans, /billing/webhook
    '/meta-signup/',          // fluxo de onboarding Meta antes de ter plano
    '/google/oauth/callback', // callback OAuth Google
    '/track/',                // pixel público, webhooks CRM (cliente-final)
    '/r/',                    // aprovação pública de relatório
    '/reports/public/',       // relatório visual público
    '/commercial/webhooks/',
    '/commercial/public/',
];

function isExemptPath(path: string): boolean {
    // O routes.ts monta em '/api/v1', mas Express expõe req.path como '/auth/login' etc.
    // (o prefixo é stripado ao chegar no router). Confere aqui.
    return EXEMPT_PATH_PREFIXES.some(p => path.startsWith(p));
}

/**
 * Middleware que gate por plano ativo. Deve rodar ANTES dos controllers protegidos.
 * - Pula rotas isentas
 * - Extrai userId do JWT (se ausente/invalid, deixa passar — o authMiddleware
 *   do controller vai responder 401 depois)
 * - Se JWT válido: checa subscription. Bloqueia com 402 se inválido.
 */
export async function planGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (isExemptPath(req.path)) {
        next();
        return;
    }

    // Sem token: deixa o authMiddleware do controller responder 401
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
    }

    let userId: string;
    try {
        const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
        userId = payload.userId;
    } catch {
        // Token inválido — deixa authMiddleware falhar
        next();
        return;
    }

    try {
        // Admins (owners/staff internos) sempre passam — não pagam pra usar o próprio produto
        try {
            const roleRows = await query<{ role: string }>(
                `SELECT role FROM users WHERE id = $1`,
                [userId]
            );
            if (roleRows[0]?.role === 'admin') {
                next();
                return;
            }
        } catch { /* se falhar consulta de role, segue pro check de subscription */ }

        const sub = await getUserSubscription(userId);

        // Sub não pôde ser criada / não encontrada (não deveria acontecer)
        if (!sub) {
            res.status(402).json({
                success: false,
                error: {
                    code: 'NO_SUBSCRIPTION',
                    message: 'Nenhuma assinatura encontrada. Escolha um plano pra continuar.',
                    action: 'upgrade',
                },
            });
            return;
        }

        const now = new Date();

        // Trial válido
        if (sub.status === 'trialing') {
            if (sub.trial_ends_at && new Date(sub.trial_ends_at) > now) {
                next();
                return;
            }
            // Trial expirou
            res.status(402).json({
                success: false,
                error: {
                    code: 'TRIAL_EXPIRED',
                    message: 'Seu período de teste (7 dias) expirou. Escolha um plano pra continuar usando.',
                    action: 'upgrade',
                    plan: sub.plan,
                    plan_status: sub.status,
                    trial_ends_at: sub.trial_ends_at,
                },
            });
            return;
        }

        // Assinatura ativa: OK
        if (sub.status === 'active') {
            next();
            return;
        }

        // past_due — cobrança falhou mas ainda deixa usar (grace period)
        // Alternativamente pode bloquear. Aqui deixamos passar mas marcamos header.
        if (sub.status === 'past_due') {
            res.setHeader('X-Plan-Warning', 'past_due');
            next();
            return;
        }

        // Demais: canceled, incomplete, incomplete_expired, unpaid, paused → bloqueia
        res.status(402).json({
            success: false,
            error: {
                code: 'PLAN_INACTIVE',
                message: 'Sua assinatura não está ativa. Reative ou escolha um novo plano.',
                action: 'upgrade',
                plan: sub.plan,
                plan_status: sub.status,
            },
        });
        return;
    } catch (err: any) {
        logger.warn('planGuard falhou (deixando passar defensivamente)', { error: err.message });
        // Falha ao consultar DB — não bloqueia (defensivo)
        next();
        return;
    }
}
