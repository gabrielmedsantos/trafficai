// ==============================
// TrafficAI — Commercial Share Links
// CRUD de links públicos do dashboard + endpoint público read-only.
// ==============================

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';
import {
    rangeFromPreset,
    getActivePipelineId,
    calculateFunnelStages,
    calculateConversationKpis,
    calculateLeadsKpis,
    calculateTasksKpis,
    calculateLeadSources,
    calculateChannelAnalysis,
    calculateTimeSeries,
    calculateTeamPerformance,
} from './metrics';
import { calculateHeroKpis, generateInsights } from './hero-insights';
import { calculateGoalForecast } from './goals-forecast';
import type { PeriodPreset, ShareLinkFilters } from './types';

const router = Router();

function fail(res: Response, message: string, status = 400): void {
    res.status(status).json({ success: false, error: { message } });
}

function getUserId(req: Request): string {
    return (req as any).user.userId as string;
}

// ===========================================================================
// AUTHENTICATED — gestão dos links
// ===========================================================================

router.use(authMiddleware);

// GET /commercial/share-links — lista links do user
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const rows = await query(
            `SELECT s.id, s.token, s.name, s.filters, s.client_id,
                    s.expires_at, s.access_count,
                    s.last_accessed_at, s.active, s.created_at,
                    (s.password_hash IS NOT NULL) AS has_password,
                    c.name AS client_name, c.avatar_color AS client_color
             FROM comm_share_links s
             LEFT JOIN clients c ON c.id = s.client_id
             WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('Erro ao listar share-links', { error: err.message });
        fail(res, 'Erro ao listar links', 500);
    }
});

// POST /commercial/share-links — cria novo link
// Body: { name, filters?, password?, expiresAt? }
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const { name, filters, password, expiresAt, clientId } = req.body as {
            name?: string; filters?: ShareLinkFilters; password?: string;
            expiresAt?: string; clientId?: string;
        };

        if (!name || !name.trim()) {
            return fail(res, 'name é obrigatório');
        }

        const passwordHash = password && password.trim()
            ? await bcrypt.hash(password.trim(), 10)
            : null;

        const ins = await query<{ id: string; token: string }>(
            `INSERT INTO comm_share_links
             (user_id, client_id, name, filters, password_hash, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, token`,
            [
                userId, clientId ?? null, name.trim(),
                filters ?? {},
                passwordHash,
                expiresAt ? new Date(expiresAt) : null,
            ]
        );
        res.json({ success: true, data: ins[0] });
    } catch (err: any) {
        logger.error('Erro ao criar share-link', { error: err.message });
        fail(res, 'Erro ao criar link', 500);
    }
});

// PATCH /commercial/share-links/:id — toggle active / atualiza nome
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const { name, active } = req.body as { name?: string; active?: boolean };
        const updates: string[] = [];
        const params: unknown[] = [];
        if (name !== undefined) { params.push(name); updates.push(`name = $${params.length}`); }
        if (active !== undefined) { params.push(active); updates.push(`active = $${params.length}`); }
        if (updates.length === 0) return fail(res, 'Nada pra atualizar');
        params.push(req.params.id, userId);
        const r = await query<{ id: string }>(
            `UPDATE comm_share_links SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING id`,
            params
        );
        if (r.length === 0) return fail(res, 'Link não encontrado', 404);
        res.json({ success: true, data: r[0] });
    } catch (err: any) {
        fail(res, 'Erro ao atualizar', 500);
    }
});

// DELETE /commercial/share-links/:id — revoga
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const r = await query(
            `DELETE FROM comm_share_links WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, userId]
        );
        if (r.length === 0) return fail(res, 'Link não encontrado', 404);
        res.json({ success: true, data: { id: r[0].id } });
    } catch (err: any) {
        fail(res, 'Erro ao revogar', 500);
    }
});

export const shareLinksController = router;

// ===========================================================================
// PUBLIC — sem auth, validado por token na URL
// ===========================================================================

const publicRouter = Router();

interface PublicLinkRow {
    id: string;
    user_id: string;
    name: string;
    filters: ShareLinkFilters;
    password_hash: string | null;
    expires_at: Date | null;
    active: boolean;
    client_id: string | null;
}

async function loadActiveLink(token: string): Promise<PublicLinkRow | null> {
    // Valida UUID antes de consultar (evita erro 22P02 do Postgres)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
        return null;
    }
    try {
        const row = await queryOne<PublicLinkRow>(
            `SELECT id, user_id, name, filters, password_hash, expires_at, active, client_id
             FROM comm_share_links WHERE token = $1`,
            [token]
        );
        if (!row || !row.active) return null;
        if (row.expires_at && row.expires_at < new Date()) return null;
        return row;
    } catch (err: any) {
        logger.warn('loadActiveLink falhou', { error: err.message });
        return null;
    }
}

async function logAccess(linkId: string, req: Request, success: boolean): Promise<void> {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
        || req.socket.remoteAddress || null;
    await query(
        `INSERT INTO comm_share_link_accesses (share_link_id, ip, user_agent, referer, success)
         VALUES ($1, $2, $3, $4, $5)`,
        [linkId, ip, req.headers['user-agent'] ?? null, req.headers.referer ?? null, success]
    );
    if (success) {
        await query(
            `UPDATE comm_share_links SET access_count = access_count + 1, last_accessed_at = NOW()
             WHERE id = $1`,
            [linkId]
        );
    }
}

// GET /commercial/public/:token — info do link (se requer senha + nome)
publicRouter.get('/:token', async (req: Request, res: Response): Promise<void> => {
    const link = await loadActiveLink(req.params.token);
    if (!link) {
        return fail(res, 'Link não encontrado, expirado ou revogado', 404);
    }
    res.json({
        success: true,
        data: {
            name: link.name,
            requiresPassword: !!link.password_hash,
            expiresAt: link.expires_at,
        },
    });
});

// POST /commercial/public/:token/data — retorna dados do dashboard
// Body: { password? } — se requer senha, valida; se não, chama com {} mesmo
publicRouter.post('/:token/data', async (req: Request, res: Response): Promise<void> => {
    const link = await loadActiveLink(req.params.token);
    if (!link) {
        return fail(res, 'Link não encontrado, expirado ou revogado', 404);
    }
    const { password, period: clientPeriod, dateRange: clientDateRange, pipelineId: clientPipelineId, salespersonId: clientSalespersonId } = req.body as {
        password?: string; period?: string;
        dateRange?: { from: string; to: string };
        pipelineId?: string; salespersonId?: string;
    };

    if (link.password_hash) {
        if (!password) {
            await logAccess(link.id, req, false);
            return fail(res, 'Senha obrigatória', 401);
        }
        const ok = await bcrypt.compare(password, link.password_hash);
        if (!ok) {
            await logAccess(link.id, req, false);
            return fail(res, 'Senha inválida', 401);
        }
    }

    // Resolve filtros: período vem do client (quem acessa) ou fallback do link salvo
    const f = link.filters || {};
    const validPeriods: PeriodPreset[] = ['today', '7d', '30d', '90d', 'this_month', 'custom'];
    const period: PeriodPreset = (validPeriods.includes(clientPeriod as PeriodPreset) ? clientPeriod : (f.period as PeriodPreset) || '30d') as PeriodPreset;
    // dateRange: prioriza o que vem do client (body), senão usa o salvo no link
    let dateRange: { from: Date; to: Date } | undefined;
    if (clientDateRange?.from && clientDateRange?.to) {
        dateRange = { from: new Date(clientDateRange.from), to: new Date(clientDateRange.to) };
    } else if (f.dateRange) {
        dateRange = { from: new Date(f.dateRange.from), to: new Date(f.dateRange.to) };
    }
    if (period === 'custom' && !dateRange) {
        return fail(res, 'Período personalizado exige dateRange { from, to }');
    }
    const range = rangeFromPreset(period, dateRange);
    // pipelineId/salespersonId: prioriza override do client; senão usa link salvo
    const scope = {
        userId: link.user_id,
        clientId: f.clientId ?? link.client_id,
        pipelineId: clientPipelineId || f.pipelineId,
        salespersonId: clientSalespersonId || f.salespersonId,
    };

    const pipelineId = f.pipelineId ?? await getActivePipelineId(link.user_id, scope.clientId);
    if (!pipelineId) {
        await logAccess(link.id, req, true);
        return res.json({
            success: true,
            data: {
                name: link.name,
                period,
                pipelineId: null,
                heroKpis: [],
                insights: [],
                funnel: [],
                conversations: emptyConvKpis(),
                leads: emptyLeadsKpis(),
                tasks: emptyTasksKpis(),
                leadSources: [],
                channels: [],
                forecast: null,
                timeSeries: [],
            },
        }) as unknown as void;
    }

    const [funnel, conversations, leads, tasks, leadSources, heroKpis, team, channels, forecast, timeSeries] = await Promise.all([
        calculateFunnelStages(scope, range, pipelineId),
        calculateConversationKpis(scope, range),
        calculateLeadsKpis(scope, range),
        calculateTasksKpis(scope, range),
        calculateLeadSources(scope, range, 5),
        calculateHeroKpis(scope, range),
        calculateTeamPerformance(scope, range),
        calculateChannelAnalysis(scope, range),
        calculateGoalForecast(scope),
        calculateTimeSeries(scope, range),
    ]);

    const insights = await generateInsights({ scope, range, funnel, team });

    await logAccess(link.id, req, true);
    res.json({
        success: true,
        data: {
            name: link.name,
            period,
            pipelineId,
            heroKpis,
            insights,
            funnel,
            conversations,
            leads,
            tasks,
            leadSources,
            channels,
            forecast,
            timeSeries,
            team,
        },
    });
});

function emptyConvKpis() {
    return { messagesReceived: { total: 0, byChannel: [] }, activeConversations: 0, activeConversationsDelta: 0,
        unansweredChats: 0, unansweredChatsDelta: 0, avgResponseTimeMinutes: 0, longestWaitDays: 0 };
}
function emptyLeadsKpis() { return { wonLeads: 0, wonValue: 0, wonDelta: 0, activeLeads: 0, activeValue: 0, activeDelta: 0 }; }
function emptyTasksKpis() { return { pendingTasks: 0, overdueTasks: 0, tasksDelta: 0 }; }

// ===========================================================================
// PUBLIC TABS — endpoints adicionais reusam queries do commercial.controller
// Todos exigem token válido + senha (se houver). clientId vem travado do link.
// ===========================================================================

interface PublicScope {
    userId: string;
    clientId: string | null;
}

/**
 * Resolve um range a partir de period (string) + dateRange (opcional do client).
 * Retorna null se period for inválido/ausente — caller pode optar por não filtrar.
 */
function resolvePeriodRange(
    clientPeriod: string | undefined,
    clientDateRange: { from?: string; to?: string } | undefined
): { from: Date; to: Date } | null {
    const validPeriods: PeriodPreset[] = ['today', '7d', '30d', '90d', 'this_month', 'custom'];
    if (!clientPeriod || !validPeriods.includes(clientPeriod as PeriodPreset)) return null;
    const period = clientPeriod as PeriodPreset;
    let custom: { from: Date; to: Date } | undefined;
    if (clientDateRange?.from && clientDateRange?.to) {
        custom = { from: new Date(clientDateRange.from), to: new Date(clientDateRange.to) };
    }
    if (period === 'custom' && !custom) return null;
    return rangeFromPreset(period, custom);
}

async function authPublicLink(req: Request): Promise<{ link: PublicLinkRow; scope: PublicScope } | null> {
    const link = await loadActiveLink(req.params.token);
    if (!link) return null;
    if (link.password_hash) {
        const password = (req.body && req.body.password) as string | undefined;
        if (!password) return null;
        const ok = await bcrypt.compare(password, link.password_hash);
        if (!ok) return null;
    }
    const f = link.filters || {};
    return {
        link,
        scope: {
            userId: link.user_id,
            clientId: f.clientId ?? link.client_id ?? null,
        },
    };
}

// ----- POST /commercial/public/:token/pipelines -----
publicRouter.post('/:token/pipelines', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const rows = await query(
            `SELECT p.id, p.name, p.is_main, p.position, p.client_id,
                    COALESCE(json_agg(json_build_object(
                        'id', s.id, 'name', s.name, 'position', s.position,
                        'color', s.color, 'stageType', s.stage_type,
                        'winProbability', s.win_probability
                    ) ORDER BY s.position) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS stages
             FROM comm_pipelines p
             LEFT JOIN comm_pipeline_stages s ON s.pipeline_id = p.id
             WHERE p.user_id = $1 AND p.archived = false
               AND ($2::uuid IS NULL OR p.client_id = $2 OR p.client_id IS NULL)
             GROUP BY p.id ORDER BY p.is_main DESC NULLS LAST, p.position`,
            [auth.scope.userId, auth.scope.clientId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        fail(res, 'Erro ao listar pipelines', 500);
    }
});

// ----- POST /commercial/public/:token/salespeople -----
publicRouter.post('/:token/salespeople', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const includeInactive = req.body?.includeInactive === true;
        const rows = await query(
            `SELECT id, name, role, monthly_goal_value, avatar_color, active, external_source
             FROM comm_salespeople
             WHERE user_id = $1
               AND ($2::uuid IS NULL OR client_id = $2 OR client_id IS NULL)
               AND ($3::boolean OR active = true)
             ORDER BY active DESC, name ASC`,
            [auth.scope.userId, auth.scope.clientId, includeInactive]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        fail(res, 'Erro ao listar vendedores', 500);
    }
});

// ----- PATCH /commercial/public/:token/salespeople/:id —
//       atualiza monthly_goal_value e active. Só esses campos por segurança.
publicRouter.patch('/:token/salespeople/:id', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const { monthly_goal_value, active } = req.body as {
            monthly_goal_value?: number; active?: boolean;
        };
        const updates: string[] = [];
        const params: unknown[] = [];
        if (monthly_goal_value !== undefined) {
            params.push(monthly_goal_value);
            updates.push(`monthly_goal_value = $${params.length}`);
        }
        if (active !== undefined) {
            params.push(active);
            updates.push(`active = $${params.length}`);
        }
        if (updates.length === 0) return fail(res, 'Nada pra atualizar');

        params.push(req.params.id, auth.scope.userId);
        const idIdx = params.length - 1;
        const userIdx = params.length;

        let extraWhere = '';
        if (auth.scope.clientId) {
            params.push(auth.scope.clientId);
            extraWhere = ` AND (client_id = $${params.length} OR client_id IS NULL)`;
        }

        const r = await query<{ id: string; monthly_goal_value: string }>(
            `UPDATE comm_salespeople SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${idIdx} AND user_id = $${userIdx}${extraWhere}
             RETURNING id, monthly_goal_value`,
            params
        );
        if (r.length === 0) return fail(res, 'Vendedor não encontrado', 404);
        res.json({ success: true, data: r[0] });
    } catch (err: any) {
        logger.error('Erro ao atualizar vendedor (público)', { error: err.message });
        fail(res, 'Erro ao atualizar', 500);
    }
});

// ----- POST /commercial/public/:token/lead-sources -----
publicRouter.post('/:token/lead-sources', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const rows = await query(
            `SELECT id, name, type, identifier, color, active FROM comm_lead_sources
             WHERE user_id = $1 AND ($2::uuid IS NULL OR client_id = $2 OR client_id IS NULL)
             ORDER BY active DESC, name ASC`,
            [auth.scope.userId, auth.scope.clientId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        fail(res, 'Erro ao listar origens', 500);
    }
});

// ----- POST /commercial/public/:token/conversations -----
publicRouter.post('/:token/conversations', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const { salespersonId, status, filter, period: cp, dateRange: cdr, page = 1, limit = 25 } = req.body as any;
        const range = resolvePeriodRange(cp, cdr);
        const where: string[] = ['c.user_id = $1'];
        const params: unknown[] = [auth.scope.userId];
        if (auth.scope.clientId) { params.push(auth.scope.clientId); where.push(`(c.client_id = $${params.length} OR c.client_id IS NULL)`); }
        if (salespersonId) { params.push(salespersonId); where.push(`c.salesperson_id = $${params.length}`); }
        if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
        if (filter === 'unanswered') where.push('c.unanswered_since IS NOT NULL');
        if (range) {
            params.push(range.from); where.push(`c.last_message_at >= $${params.length}`);
            params.push(range.to);   where.push(`c.last_message_at < $${params.length}`);
        }

        const lim = Math.min(100, Math.max(1, Number(limit) || 25));
        const off = (Math.max(1, Number(page) || 1) - 1) * lim;
        const rows = await query(
            `SELECT c.id, c.contact_name, c.contact_phone, c.channel, c.status,
                    c.last_message_at, c.last_message_direction, c.unanswered_since,
                    c.message_count, c.first_response_seconds,
                    sp.id AS salesperson_id, sp.name AS salesperson_name, sp.avatar_color AS salesperson_color,
                    src.name AS source_name, src.color AS source_color
             FROM comm_conversations c
             LEFT JOIN comm_salespeople sp ON sp.id = c.salesperson_id
             LEFT JOIN comm_lead_sources src ON src.id = c.source_id
             WHERE ${where.join(' AND ')}
             ORDER BY c.last_message_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, lim, off]
        );
        const totalRow = await queryOne<{ n: string }>(
            `SELECT COUNT(*)::TEXT AS n FROM comm_conversations c WHERE ${where.join(' AND ')}`, params
        );
        res.json({ success: true, data: { rows, total: Number(totalRow?.n ?? 0), page: Number(page), limit: lim } });
    } catch (err: any) {
        fail(res, 'Erro ao listar conversas', 500);
    }
});

// ----- POST /commercial/public/:token/conversations/:id/messages -----
publicRouter.post('/:token/conversations/:id/messages', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const conv = await queryOne<{ user_id: string; client_id: string | null }>(
            `SELECT user_id, client_id FROM comm_conversations WHERE id = $1`, [req.params.id]
        );
        if (!conv || conv.user_id !== auth.scope.userId) return fail(res, 'Conversa não encontrada', 404);
        if (auth.scope.clientId && conv.client_id !== null && conv.client_id !== auth.scope.clientId) return fail(res, 'Conversa não encontrada', 404);
        const rows = await query(
            `SELECT id, direction, content, type, sent_at, sender_salesperson_id, media_url
             FROM comm_messages WHERE conversation_id = $1 ORDER BY sent_at ASC LIMIT 500`,
            [req.params.id]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        fail(res, 'Erro ao buscar mensagens', 500);
    }
});

// ----- POST /commercial/public/:token/leads -----
publicRouter.post('/:token/leads', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const { pipelineId, stageId, status, salespersonId, sourceId, minValue, maxValue,
            period: cp, dateRange: cdr,
            sort = 'last_activity_at', dir = 'desc', page = 1, limit = 50 } = req.body as any;
        const range = resolvePeriodRange(cp, cdr);
        const allowedSorts = ['last_activity_at', 'created_at', 'value', 'last_stage_change_at', 'contact_name'];
        const sortCol = allowedSorts.includes(sort) ? sort : 'last_activity_at';
        const direction = dir === 'asc' ? 'ASC' : 'DESC';
        const lim = Math.min(200, Math.max(1, Number(limit) || 50));
        const off = (Math.max(1, Number(page) || 1) - 1) * lim;

        const where: string[] = ['d.user_id = $1'];
        const params: unknown[] = [auth.scope.userId];
        if (auth.scope.clientId) { params.push(auth.scope.clientId); where.push(`(d.client_id = $${params.length} OR d.client_id IS NULL)`); }
        if (pipelineId) { params.push(pipelineId); where.push(`d.pipeline_id = $${params.length}`); }
        if (stageId) { params.push(stageId); where.push(`d.stage_id = $${params.length}`); }
        if (status) { params.push(status); where.push(`d.status = $${params.length}`); }
        if (salespersonId) { params.push(salespersonId); where.push(`d.salesperson_id = $${params.length}`); }
        if (sourceId) { params.push(sourceId); where.push(`d.source_id = $${params.length}`); }
        if (minValue != null) { params.push(Number(minValue)); where.push(`d.value >= $${params.length}`); }
        if (maxValue != null) { params.push(Number(maxValue)); where.push(`d.value <= $${params.length}`); }
        if (range) {
            params.push(range.from); where.push(`d.created_at >= $${params.length}`);
            params.push(range.to);   where.push(`d.created_at < $${params.length}`);
        }

        const rows = await query(
            `SELECT d.id, d.contact_name, d.contact_phone, d.title, d.value, d.currency,
                    d.status, d.created_at, d.last_stage_change_at, d.last_activity_at, d.closed_at,
                    d.loss_reason,
                    EXTRACT(DAY FROM (NOW() - d.last_stage_change_at))::INT AS days_in_stage,
                    CASE WHEN d.status = 'won' AND d.closed_at IS NOT NULL AND d.created_at IS NOT NULL
                         THEN ROUND(EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400.0, 1)
                         ELSE NULL
                    END AS days_to_conversion,
                    s.id AS stage_id, s.name AS stage_name, s.color AS stage_color, s.stuck_threshold_days,
                    sp.id AS salesperson_id, sp.name AS salesperson_name, sp.avatar_color AS salesperson_color,
                    src.name AS source_name, src.color AS source_color
             FROM comm_deals d
             JOIN comm_pipeline_stages s ON s.id = d.stage_id
             LEFT JOIN comm_salespeople sp ON sp.id = d.salesperson_id
             LEFT JOIN comm_lead_sources src ON src.id = d.source_id
             WHERE ${where.join(' AND ')}
             ORDER BY d.${sortCol} ${direction} NULLS LAST
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, lim, off]
        );
        const totalRow = await queryOne<{ n: string }>(
            `SELECT COUNT(*)::TEXT AS n FROM comm_deals d WHERE ${where.join(' AND ')}`, params
        );
        res.json({ success: true, data: { rows, total: Number(totalRow?.n ?? 0), page: Number(page), limit: lim } });
    } catch (err: any) {
        fail(res, 'Erro ao listar leads', 500);
    }
});

// ----- POST /commercial/public/:token/tasks -----
publicRouter.post('/:token/tasks', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const { salespersonId, period: cp, dateRange: cdr } = req.body as any;
        const range = resolvePeriodRange(cp, cdr);
        const where: string[] = ['t.user_id = $1'];
        const params: unknown[] = [auth.scope.userId];
        if (auth.scope.clientId) { params.push(auth.scope.clientId); where.push(`(t.client_id = $${params.length} OR t.client_id IS NULL)`); }
        if (salespersonId) { params.push(salespersonId); where.push(`t.salesperson_id = $${params.length}`); }
        if (range) {
            params.push(range.from); where.push(`t.created_at >= $${params.length}`);
            params.push(range.to);   where.push(`t.created_at < $${params.length}`);
        }

        const rows = await query(
            `SELECT t.id, t.title, t.description, t.type, t.due_at, t.completed_at, t.status,
                    t.created_at, t.deal_id,
                    sp.name AS salesperson_name, sp.avatar_color AS salesperson_color,
                    d.contact_name, d.value AS deal_value,
                    CASE
                        WHEN t.status = 'completed' THEN 'completed'
                        WHEN t.due_at IS NULL THEN 'no_date'
                        WHEN t.due_at < NOW() THEN 'overdue'
                        WHEN t.due_at::DATE = CURRENT_DATE THEN 'today'
                        WHEN t.due_at::DATE = CURRENT_DATE + INTERVAL '1 day' THEN 'tomorrow'
                        WHEN t.due_at::DATE <= CURRENT_DATE + INTERVAL '7 days' THEN 'this_week'
                        ELSE 'later'
                    END AS bucket
             FROM comm_tasks t
             LEFT JOIN comm_salespeople sp ON sp.id = t.salesperson_id
             LEFT JOIN comm_deals d ON d.id = t.deal_id
             WHERE ${where.join(' AND ')}
             ORDER BY t.completed_at DESC NULLS FIRST, t.due_at ASC NULLS LAST
             LIMIT 500`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        fail(res, 'Erro ao listar tarefas', 500);
    }
});

// ----- POST /commercial/public/:token/team -----
publicRouter.post('/:token/team', async (req: Request, res: Response): Promise<void> => {
    const auth = await authPublicLink(req);
    if (!auth) return fail(res, 'Acesso negado', 401);
    try {
        const { period: clientPeriod, dateRange: clientDateRange } = req.body as {
            period?: string; dateRange?: { from: string; to: string };
        };
        const validPeriods: PeriodPreset[] = ['today', '7d', '30d', '90d', 'this_month', 'custom'];
        const period: PeriodPreset = (validPeriods.includes(clientPeriod as PeriodPreset) ? clientPeriod : '30d') as PeriodPreset;
        const dateRange = clientDateRange?.from && clientDateRange?.to
            ? { from: new Date(clientDateRange.from), to: new Date(clientDateRange.to) }
            : undefined;
        if (period === 'custom' && !dateRange) {
            return fail(res, 'Período personalizado exige dateRange { from, to }');
        }
        const range = rangeFromPreset(period, dateRange);
        const data = await calculateTeamPerformance(auth.scope, range);
        res.json({ success: true, data });
    } catch (err: any) {
        fail(res, 'Erro ao calcular performance do time', 500);
    }
});

export const shareLinksPublicController = publicRouter;
