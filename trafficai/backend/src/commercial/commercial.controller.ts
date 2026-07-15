// ==============================
// TrafficAI — Commercial Controller
// Endpoints do Dashboard Comercial.
// Padrão: usa authMiddleware, escopa por req.user.userId, retorna { success, data }.
// ==============================

import { Router, Request, Response } from 'express';
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
    calculateTeamPerformance,
    calculateChannelAnalysis,
    calculateTimeSeries,
} from './metrics';
import { calculateHeroKpis, generateInsights } from './hero-insights';
import { calculateGoalForecast } from './goals-forecast';
import type { PeriodPreset, DateRange } from './types';

const router = Router();
router.use(authMiddleware);

// ----- Helpers -----

function parseFilters(req: Request): {
    userId: string;
    clientId: string | null;
    pipelineId: string | undefined;
    salespersonId: string | undefined;
    period: PeriodPreset;
    dateRange: DateRange | undefined;
} {
    const userId = (req as any).user.userId as string;
    const period = (req.query.period as PeriodPreset) || '30d';
    const clientId = (req.query.clientId as string) || null;
    const pipelineId = (req.query.pipelineId as string) || undefined;
    const salespersonId = (req.query.salespersonId as string) || undefined;
    let dateRange: DateRange | undefined;
    if (period === 'custom' && req.query.from && req.query.to) {
        dateRange = {
            from: new Date(req.query.from as string),
            to: new Date(req.query.to as string),
        };
    }
    return { userId, clientId, pipelineId, salespersonId, period, dateRange };
}

function fail(res: Response, message: string, status = 500): void {
    res.status(status).json({ success: false, error: { message } });
}

// ----- GET /commercial/pipelines — lista pipelines do user -----

router.get('/pipelines', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, clientId } = parseFilters(req);
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
            [userId, clientId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('Erro ao listar pipelines', { error: err.message });
        fail(res, 'Erro ao listar pipelines');
    }
});

// ----- GET /commercial/salespeople — lista vendedores -----

router.get('/salespeople', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, clientId } = parseFilters(req);
        const includeInactive = req.query.includeInactive === 'true';
        const rows = await query(
            `SELECT id, name, email, phone, role, monthly_goal_value, avatar_color, active,
                    external_source, external_id, created_at
             FROM comm_salespeople
             WHERE user_id = $1
               AND ($2::uuid IS NULL OR client_id = $2 OR client_id IS NULL)
               AND ($3::boolean OR active = true)
             ORDER BY active DESC, name ASC`,
            [userId, clientId, includeInactive]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('Erro ao listar vendedores', { error: err.message });
        fail(res, 'Erro ao listar vendedores');
    }
});

// ----- GET /commercial/overview — todas as métricas do dashboard -----

router.get('/overview', async (req: Request, res: Response): Promise<void> => {
    try {
        const f = parseFilters(req);
        const range = rangeFromPreset(f.period, f.dateRange);
        const scope = { userId: f.userId, clientId: f.clientId, pipelineId: f.pipelineId, salespersonId: f.salespersonId };

        const pipelineId = f.pipelineId ?? await getActivePipelineId(f.userId, f.clientId);
        if (!pipelineId) {
            res.json({
                success: true,
                data: {
                    pipelineId: null,
                    funnel: [],
                    conversations: emptyConvKpis(),
                    leads: emptyLeadsKpis(),
                    tasks: emptyTasksKpis(),
                    leadSources: [],
                    period: f.period,
                    dateRange: { from: range.from.toISOString(), to: range.to.toISOString() },
                },
            });
            return;
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

        res.json({
            success: true,
            data: {
                pipelineId,
                heroKpis,
                insights,
                funnel,
                conversations,
                leads,
                tasks,
                leadSources,
                team,
                channels,
                forecast,
                timeSeries,
                period: f.period,
                dateRange: { from: range.from.toISOString(), to: range.to.toISOString() },
            },
        });
    } catch (err: any) {
        logger.error('Erro no overview', { error: err.message, stack: err.stack });
        fail(res, 'Erro ao calcular overview: ' + err.message);
    }
});

// ----- GET /commercial/conversations — lista paginada -----

router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, clientId, salespersonId, period, dateRange } = parseFilters(req);
        const range = rangeFromPreset(period, dateRange);
        const status = (req.query.status as string) || null;            // open | pending | closed
        const filter = (req.query.filter as string) || null;            // unanswered
        const noPeriod = req.query.noPeriod === 'true';                  // pular filtro de período se cliente quiser
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
        const offset = (page - 1) * limit;

        const where: string[] = ['c.user_id = $1'];
        const params: unknown[] = [userId];
        if (clientId) { params.push(clientId); where.push(`c.client_id = $${params.length}`); }
        if (salespersonId) { params.push(salespersonId); where.push(`c.salesperson_id = $${params.length}`); }
        if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
        if (filter === 'unanswered') where.push('c.unanswered_since IS NOT NULL');
        if (!noPeriod) {
            params.push(range.from); where.push(`c.last_message_at >= $${params.length}`);
            params.push(range.to);   where.push(`c.last_message_at < $${params.length}`);
        }
        const sql = `
            SELECT c.id, c.contact_name, c.contact_phone, c.channel, c.status,
                   c.last_message_at, c.last_message_direction, c.unanswered_since,
                   c.message_count, c.first_response_seconds,
                   sp.id AS salesperson_id, sp.name AS salesperson_name, sp.avatar_color AS salesperson_color,
                   src.name AS source_name, src.color AS source_color
            FROM comm_conversations c
            LEFT JOIN comm_salespeople sp ON sp.id = c.salesperson_id
            LEFT JOIN comm_lead_sources src ON src.id = c.source_id
            WHERE ${where.join(' AND ')}
            ORDER BY c.last_message_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        const rows = await query(sql, [...params, limit, offset]);
        const totalRow = await queryOne<{ n: string }>(
            `SELECT COUNT(*)::TEXT AS n FROM comm_conversations c WHERE ${where.join(' AND ')}`,
            params
        );
        res.json({ success: true, data: { rows, total: Number(totalRow?.n ?? 0), page, limit } });
    } catch (err: any) {
        logger.error('Erro ao listar conversas', { error: err.message });
        fail(res, 'Erro ao listar conversas');
    }
});

// ----- GET /commercial/conversations/:id/messages -----

router.get('/conversations/:id/messages', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        const conv = await queryOne<{ user_id: string }>(
            `SELECT user_id FROM comm_conversations WHERE id = $1`, [req.params.id]
        );
        if (!conv || conv.user_id !== userId) {
            fail(res, 'Conversa não encontrada', 404); return;
        }
        const rows = await query(
            `SELECT id, direction, content, type, sent_at, sender_salesperson_id, media_url
             FROM comm_messages WHERE conversation_id = $1 ORDER BY sent_at ASC LIMIT 500`,
            [req.params.id]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        fail(res, 'Erro ao buscar mensagens: ' + err.message);
    }
});

// ----- GET /commercial/leads — tabela de deals -----

router.get('/leads', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, clientId, pipelineId, salespersonId, period, dateRange } = parseFilters(req);
        const range = rangeFromPreset(period, dateRange);
        const stageId = (req.query.stageId as string) || null;
        const status = (req.query.status as string) || null;
        const sourceId = (req.query.sourceId as string) || null;
        const minValue = req.query.minValue ? Number(req.query.minValue) : null;
        const maxValue = req.query.maxValue ? Number(req.query.maxValue) : null;
        const noPeriod = req.query.noPeriod === 'true';
        const sort = (req.query.sort as string) || 'last_activity_at';
        const dir = (req.query.dir as string) === 'asc' ? 'ASC' : 'DESC';
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        const allowedSorts = ['last_activity_at', 'created_at', 'value', 'last_stage_change_at', 'contact_name'];
        const sortCol = allowedSorts.includes(sort) ? sort : 'last_activity_at';

        const where: string[] = ['d.user_id = $1'];
        const params: unknown[] = [userId];
        if (clientId) { params.push(clientId); where.push(`d.client_id = $${params.length}`); }
        if (pipelineId) { params.push(pipelineId); where.push(`d.pipeline_id = $${params.length}`); }
        if (stageId) { params.push(stageId); where.push(`d.stage_id = $${params.length}`); }
        if (status) { params.push(status); where.push(`d.status = $${params.length}`); }
        if (salespersonId) { params.push(salespersonId); where.push(`d.salesperson_id = $${params.length}`); }
        if (sourceId) { params.push(sourceId); where.push(`d.source_id = $${params.length}`); }
        if (minValue !== null) { params.push(minValue); where.push(`d.value >= $${params.length}`); }
        if (maxValue !== null) { params.push(maxValue); where.push(`d.value <= $${params.length}`); }
        if (!noPeriod) {
            params.push(range.from); where.push(`d.created_at >= $${params.length}`);
            params.push(range.to);   where.push(`d.created_at < $${params.length}`);
        }

        const sql = `
            SELECT d.id, d.contact_name, d.contact_phone, d.title, d.value, d.currency,
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
            ORDER BY d.${sortCol} ${dir} NULLS LAST
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        const rows = await query(sql, [...params, limit, offset]);
        const totalRow = await queryOne<{ n: string }>(
            `SELECT COUNT(*)::TEXT AS n FROM comm_deals d WHERE ${where.join(' AND ')}`,
            params
        );
        res.json({ success: true, data: { rows, total: Number(totalRow?.n ?? 0), page, limit } });
    } catch (err: any) {
        logger.error('Erro ao listar leads', { error: err.message });
        fail(res, 'Erro ao listar leads');
    }
});

// ----- GET /commercial/team — performance por vendedor no período -----

router.get('/team', async (req: Request, res: Response): Promise<void> => {
    try {
        const f = parseFilters(req);
        const range = rangeFromPreset(f.period, f.dateRange);
        const scope = { userId: f.userId, clientId: f.clientId };
        const data = await calculateTeamPerformance(scope, range);
        res.json({ success: true, data });
    } catch (err: any) {
        logger.error('Erro no team', { error: err.message });
        fail(res, 'Erro ao calcular performance do time');
    }
});

// ----- GET /commercial/tasks — agrupado por vencimento -----

router.get('/tasks', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, clientId, salespersonId, period, dateRange } = parseFilters(req);
        const range = rangeFromPreset(period, dateRange);
        const noPeriod = req.query.noPeriod === 'true';
        const where: string[] = ['t.user_id = $1'];
        const params: unknown[] = [userId];
        if (clientId) { params.push(clientId); where.push(`t.client_id = $${params.length}`); }
        if (salespersonId) { params.push(salespersonId); where.push(`t.salesperson_id = $${params.length}`); }
        if (!noPeriod) {
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
        logger.error('Erro ao listar tarefas', { error: err.message });
        fail(res, 'Erro ao listar tarefas');
    }
});

// ----- POST /commercial/tasks/:id/complete -----

router.post('/tasks/:id/complete', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        const result = await query(
            `UPDATE comm_tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, userId]
        );
        if (result.length === 0) { fail(res, 'Tarefa não encontrada', 404); return; }
        res.json({ success: true, data: { id: result[0].id } });
    } catch (err: any) {
        fail(res, 'Erro ao completar tarefa');
    }
});

// ----- META — atualizar individual de cada vendedor -----
router.patch('/salespeople/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        const { monthly_goal_value, name, role, active } = req.body as {
            monthly_goal_value?: number; name?: string; role?: string; active?: boolean;
        };
        const updates: string[] = [];
        const params: unknown[] = [];
        if (monthly_goal_value !== undefined) { params.push(monthly_goal_value); updates.push(`monthly_goal_value = $${params.length}`); }
        if (name !== undefined) { params.push(name); updates.push(`name = $${params.length}`); }
        if (role !== undefined) { params.push(role); updates.push(`role = $${params.length}`); }
        if (active !== undefined) { params.push(active); updates.push(`active = $${params.length}`); }
        if (updates.length === 0) {
            return fail(res, 'Nada pra atualizar', 400);
        }
        params.push(req.params.id, userId);
        const r = await query<{ id: string; monthly_goal_value: string }>(
            `UPDATE comm_salespeople SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${params.length - 1} AND user_id = $${params.length}
             RETURNING id, monthly_goal_value`,
            params
        );
        if (r.length === 0) return fail(res, 'Vendedor não encontrado', 404);
        res.json({ success: true, data: r[0] });
    } catch (err: any) {
        logger.error('Erro ao atualizar vendedor', { error: err.message });
        fail(res, 'Erro ao atualizar', 500);
    }
});

// ----- META — definir meta workspace (distribuir entre vendedores) -----
// Body: { totalGoal: number, distribution: 'equal' | 'weighted' | 'manual', overrides?: {[salespersonId]: number} }
router.post('/goals/distribute', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        const { totalGoal, distribution = 'equal', overrides = {}, clientId } = req.body as {
            totalGoal: number; distribution?: 'equal' | 'manual'; overrides?: Record<string, number>; clientId?: string;
        };
        if (typeof totalGoal !== 'number' || totalGoal < 0) {
            return fail(res, 'totalGoal deve ser número positivo', 400);
        }

        // Pega vendedores ativos
        const sps = await query<{ id: string }>(
            `SELECT id FROM comm_salespeople
             WHERE user_id = $1 AND active = true
               AND ($2::uuid IS NULL OR client_id = $2 OR client_id IS NULL)
             ORDER BY name`,
            [userId, clientId ?? null]
        );
        if (sps.length === 0) {
            return fail(res, 'Nenhum vendedor ativo cadastrado', 400);
        }

        // Calcula valor por vendedor: equal default, depois aplica overrides
        const overrideTotal = Object.values(overrides).reduce((a, b) => a + (b || 0), 0);
        const remainingTotal = Math.max(0, totalGoal - overrideTotal);
        const nonOverrideCount = sps.filter(s => !(s.id in overrides)).length;
        const eachShare = nonOverrideCount > 0 ? remainingTotal / nonOverrideCount : 0;

        for (const sp of sps) {
            const value = sp.id in overrides ? overrides[sp.id]! : eachShare;
            await query(
                `UPDATE comm_salespeople SET monthly_goal_value = $1, updated_at = NOW() WHERE id = $2`,
                [value, sp.id]
            );
        }

        res.json({
            success: true,
            data: {
                totalGoal,
                distributed: sps.length,
                eachShare: Math.round(eachShare),
                overrideCount: Object.keys(overrides).length,
            },
        });
    } catch (err: any) {
        logger.error('Erro ao distribuir meta', { error: err.message });
        fail(res, 'Erro ao distribuir meta', 500);
    }
});

// ----- META — forecast standalone (caso queira buscar isolado) -----
router.get('/goals/forecast', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        const clientId = (req.query.clientId as string) || null;
        const data = await calculateGoalForecast({ userId, clientId });
        res.json({ success: true, data });
    } catch (err: any) {
        fail(res, err.message, 500);
    }
});

// ----- GET /commercial/lead-sources -----

router.get('/lead-sources', async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, clientId } = parseFilters(req);
        const rows = await query(
            `SELECT id, name, type, identifier, color, active FROM comm_lead_sources
             WHERE user_id = $1 AND ($2::uuid IS NULL OR client_id = $2 OR client_id IS NULL)
             ORDER BY active DESC, name ASC`,
            [userId, clientId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        fail(res, 'Erro ao listar origens');
    }
});

// ----- Helpers de empty state -----

function emptyConvKpis() {
    return { messagesReceived: { total: 0, byChannel: [] }, activeConversations: 0, activeConversationsDelta: 0,
        unansweredChats: 0, unansweredChatsDelta: 0, avgResponseTimeMinutes: 0, longestWaitDays: 0 };
}
function emptyLeadsKpis() { return { wonLeads: 0, wonValue: 0, wonDelta: 0, activeLeads: 0, activeValue: 0, activeDelta: 0 }; }
function emptyTasksKpis() { return { pendingTasks: 0, overdueTasks: 0, tasksDelta: 0 }; }

export const commercialController = router;
