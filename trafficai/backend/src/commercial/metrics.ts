// ==============================
// TrafficAI — Commercial: Camada de Métricas
// Calcula KPIs para o dashboard a partir do schema comm_*.
// ==============================

import { query, queryOne } from '../database/connection';
import type {
    DateRange,
    PeriodPreset,
    FunnelStageView,
    ConversationKpis,
    LeadsKpis,
    TasksKpis,
    LeadSourceView,
    SalespersonPerformanceView,
} from './types';

// ----- Helpers -----

export function rangeFromPreset(preset: PeriodPreset, custom?: DateRange): DateRange {
    const to = new Date();
    const from = new Date();
    switch (preset) {
        case 'today':
            from.setHours(0, 0, 0, 0);
            return { from, to };
        case '7d':
            from.setDate(from.getDate() - 7);
            return { from, to };
        case '30d':
            from.setDate(from.getDate() - 30);
            return { from, to };
        case '90d':
            from.setDate(from.getDate() - 90);
            return { from, to };
        case 'this_month':
            from.setDate(1);
            from.setHours(0, 0, 0, 0);
            return { from, to };
        case 'custom':
            if (!custom) throw new Error('custom period requires dateRange');
            return custom;
    }
}

/** Retorna true se o período é grande o suficiente pra ler de comm_daily_metrics. */
function shouldUseAggregations(range: DateRange): boolean {
    const days = (range.to.getTime() - range.from.getTime()) / 86400 / 1000;
    return days >= 14;   // 14 dias é o threshold
}

function previousRange(range: DateRange): DateRange {
    const ms = range.to.getTime() - range.from.getTime();
    return {
        from: new Date(range.from.getTime() - ms),
        to: new Date(range.from.getTime()),
    };
}

interface ScopeFilters {
    userId: string;
    clientId?: string | null;
    pipelineId?: string;
    salespersonId?: string;
}

// ----- 1) Active pipeline picker -----

export async function getActivePipelineId(userId: string, clientId?: string | null): Promise<string | null> {
    const row = await queryOne<{ id: string }>(
        `SELECT id FROM comm_pipelines
         WHERE user_id = $1 AND archived = false
           AND ($2::uuid IS NULL OR client_id = $2 OR client_id IS NULL)
         ORDER BY is_main DESC NULLS LAST, position ASC LIMIT 1`,
        [userId, clientId ?? null]
    );
    return row?.id ?? null;
}

// ----- 2) Funnel stages com entradas/saídas no período -----

export async function calculateFunnelStages(
    scope: ScopeFilters,
    range: DateRange,
    pipelineId: string
): Promise<FunnelStageView[]> {
    // Stages ordenados pra calcular "advanced" (saiu pra um stage com posição > origem)
    const stages = await query<{
        id: string; name: string; color: string; position: number; stage_type: string;
    }>(
        `SELECT id, name, color, position, stage_type
         FROM comm_pipeline_stages WHERE pipeline_id = $1 ORDER BY position ASC`,
        [pipelineId]
    );

    // Deals em cada stage COM ATIVIDADE NO PERÍODO (status open + atividade no range)
    const current = await query<{ stage_id: string; total: string; valor: string }>(
        `SELECT stage_id, COUNT(*)::TEXT AS total, COALESCE(SUM(value), 0)::TEXT AS valor
         FROM comm_deals
         WHERE user_id = $1 AND pipeline_id = $2 AND status = 'open'
           AND last_activity_at >= $3 AND last_activity_at < $4
         GROUP BY stage_id`,
        [scope.userId, pipelineId, range.from, range.to]
    );
    const currentByStage = Object.fromEntries(current.map(r => [r.stage_id, { total: Number(r.total), valor: Number(r.valor) }]));

    // Movimentos no período (entrada em cada stage)
    const entered = await query<{ stage_id: string; n: string; valor: string }>(
        `SELECT to_stage_id AS stage_id, COUNT(*)::TEXT AS n, COALESCE(SUM(deal_value_snapshot), 0)::TEXT AS valor
         FROM comm_deal_stage_history
         WHERE user_id = $1 AND moved_at >= $2 AND moved_at < $3
           AND to_stage_id IN (SELECT id FROM comm_pipeline_stages WHERE pipeline_id = $4)
         GROUP BY to_stage_id`,
        [scope.userId, range.from, range.to, pipelineId]
    );
    const enteredByStage = Object.fromEntries(entered.map(r => [r.stage_id, { n: Number(r.n), valor: Number(r.valor) }]));

    // Saídas POR DESTINO no período (pra calcular "advanced" vs "lost")
    const exits = await query<{ from_stage_id: string; to_stage_id: string; to_stage_type: string; to_position: number; n: string; valor: string }>(
        `SELECT h.from_stage_id, h.to_stage_id, s2.stage_type AS to_stage_type, s2.position AS to_position,
                COUNT(*)::TEXT AS n, COALESCE(SUM(h.deal_value_snapshot), 0)::TEXT AS valor
         FROM comm_deal_stage_history h
         JOIN comm_pipeline_stages s2 ON s2.id = h.to_stage_id
         WHERE h.user_id = $1 AND h.moved_at >= $2 AND h.moved_at < $3
           AND h.from_stage_id IN (SELECT id FROM comm_pipeline_stages WHERE pipeline_id = $4)
         GROUP BY h.from_stage_id, h.to_stage_id, s2.stage_type, s2.position`,
        [scope.userId, range.from, range.to, pipelineId]
    );

    const stagePosition = Object.fromEntries(stages.map(s => [s.id, s.position]));

    // Tempo médio em cada stage (deals que SAÍRAM no período)
    const avgTimeInStage = await query<{ stage_id: string; avg_seconds: string }>(
        `SELECT from_stage_id AS stage_id,
                AVG(duration_in_from_seconds)::TEXT AS avg_seconds
         FROM comm_deal_stage_history
         WHERE user_id = $1 AND moved_at >= $2 AND moved_at < $3
           AND from_stage_id IN (SELECT id FROM comm_pipeline_stages WHERE pipeline_id = $4)
           AND duration_in_from_seconds IS NOT NULL
         GROUP BY from_stage_id`,
        [scope.userId, range.from, range.to, pipelineId]
    );
    const avgByStage = Object.fromEntries(
        avgTimeInStage.map(r => [r.stage_id, Number(r.avg_seconds || 0) / 86400])
    );

    return stages.map(s => {
        const cur = currentByStage[s.id] ?? { total: 0, valor: 0 };
        const ent = enteredByStage[s.id] ?? { n: 0, valor: 0 };
        // saídas DESTE stage agrupadas em "advanced" (foi pra posição maior, não lost) vs "lost"
        let advancedN = 0, advancedV = 0, lostN = 0, lostV = 0;
        for (const ex of exits) {
            if (ex.from_stage_id !== s.id) continue;
            if (ex.to_stage_type === 'lost') {
                lostN += Number(ex.n); lostV += Number(ex.valor);
            } else if (ex.to_position > s.position) {
                advancedN += Number(ex.n); advancedV += Number(ex.valor);
            }
            // se foi pra position menor (raro), não conta como nem um nem outro
        }
        // Taxa de conversão pra próxima etapa = advanced / entered (se entered > 0)
        const conversionToNext = ent.n > 0
            ? Math.round((advancedN / ent.n) * 1000) / 10
            : null;
        const avgDaysInStage = Math.round((avgByStage[s.id] ?? 0) * 10) / 10;

        return {
            stageId: s.id,
            name: s.name,
            color: s.color,
            position: s.position,
            stageType: s.stage_type as FunnelStageView['stageType'],
            totalLeads: cur.total,
            totalValue: cur.valor,
            enteredInPeriod: ent.n,
            enteredValueInPeriod: ent.valor,
            advancedInPeriod: advancedN,
            advancedValueInPeriod: advancedV,
            lostInPeriod: lostN,
            lostValueInPeriod: lostV,
            conversionToNext,
            avgDaysInStage,
        };
    });
}

// ----- 3) Conversation KPIs -----

export async function calculateConversationKpis(
    scope: ScopeFilters,
    range: DateRange
): Promise<ConversationKpis> {
    const prev = previousRange(range);
    const useAgg = shouldUseAggregations(range);

    // Mensagens recebidas no período
    let totalReceived: number;
    let byChannel: Array<{ channel: string; count: number }> = [];

    if (useAgg) {
        // Lê de daily_metrics — muito mais rápido em períodos longos
        const aggRow = await queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(messages_received), 0)::TEXT AS total
             FROM comm_daily_metrics
             WHERE user_id = $1 AND date >= $2::DATE AND date < $3::DATE
               AND client_id IS NULL AND salesperson_id IS NULL AND pipeline_id IS NULL`,
            [scope.userId, range.from, range.to]
        );
        totalReceived = Number(aggRow?.total ?? 0);

        // Soma jsonb messages_by_channel (cada linha é {channel: count})
        const channelSum = await query<{ channel: string; count: string }>(
            `SELECT key AS channel, SUM(value::int)::TEXT AS count
             FROM comm_daily_metrics, jsonb_each_text(messages_by_channel)
             WHERE user_id = $1 AND date >= $2::DATE AND date < $3::DATE
               AND client_id IS NULL AND salesperson_id IS NULL AND pipeline_id IS NULL
             GROUP BY key ORDER BY count DESC`,
            [scope.userId, range.from, range.to]
        );
        byChannel = channelSum.map(r => ({ channel: r.channel, count: Number(r.count) }));
    } else {
        const recv = await queryOne<{ total: string }>(
            `SELECT COUNT(*)::TEXT AS total FROM comm_messages
             WHERE user_id = $1 AND direction = 'in' AND sent_at >= $2 AND sent_at < $3`,
            [scope.userId, range.from, range.to]
        );
        totalReceived = Number(recv?.total ?? 0);

        const byChannelRows = await query<{ channel: string; count: string }>(
            `SELECT c.channel, COUNT(m.id)::TEXT AS count
             FROM comm_messages m
             JOIN comm_conversations c ON c.id = m.conversation_id
             WHERE m.user_id = $1 AND m.direction = 'in'
               AND m.sent_at >= $2 AND m.sent_at < $3
             GROUP BY c.channel ORDER BY count DESC`,
            [scope.userId, range.from, range.to]
        );
        byChannel = byChannelRows.map(r => ({ channel: r.channel, count: Number(r.count) }));
    }

    // Conversas ativas COM ATIVIDADE NO PERÍODO (status open/pending E última msg dentro do período)
    const active = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_conversations
         WHERE user_id = $1 AND status IN ('open', 'pending')
           AND last_message_at >= $2 AND last_message_at < $3`,
        [scope.userId, range.from, range.to]
    );
    const activePrev = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_conversations
         WHERE user_id = $1 AND status IN ('open', 'pending')
           AND last_message_at >= $2 AND last_message_at < $3`,
        [scope.userId, prev.from, prev.to]
    );

    // Sem resposta no período (unanswered_since dentro do período)
    const unanswered = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_conversations
         WHERE user_id = $1 AND unanswered_since IS NOT NULL
           AND unanswered_since >= $2 AND unanswered_since < $3`,
        [scope.userId, range.from, range.to]
    );
    const unansweredPrev = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_conversations
         WHERE user_id = $1 AND unanswered_since IS NOT NULL
           AND unanswered_since >= $2 AND unanswered_since < $3`,
        [scope.userId, prev.from, prev.to]
    );

    // Tempo de resposta médio (em minutos) das conversas com primeira resposta no período
    const avgResp = await queryOne<{ avg: string | null }>(
        `SELECT AVG(first_response_seconds)::TEXT AS avg FROM comm_conversations
         WHERE user_id = $1 AND first_response_at >= $2 AND first_response_at < $3
           AND first_response_seconds IS NOT NULL`,
        [scope.userId, range.from, range.to]
    );
    const avgRespMin = avgResp?.avg ? Number(avgResp.avg) / 60 : 0;

    // Maior espera no período (conversa com unanswered_since mais antigo dentro do período)
    const longest = await queryOne<{ days: string | null }>(
        `SELECT EXTRACT(EPOCH FROM (NOW() - MIN(unanswered_since))) / 86400 AS days
         FROM comm_conversations
         WHERE user_id = $1 AND unanswered_since IS NOT NULL
           AND unanswered_since >= $2 AND unanswered_since < $3`,
        [scope.userId, range.from, range.to]
    );

    return {
        messagesReceived: { total: totalReceived, byChannel },
        activeConversations: Number(active?.n ?? 0),
        activeConversationsDelta: Number(active?.n ?? 0) - Number(activePrev?.n ?? 0),
        unansweredChats: Number(unanswered?.n ?? 0),
        unansweredChatsDelta: Number(unanswered?.n ?? 0) - Number(unansweredPrev?.n ?? 0),
        avgResponseTimeMinutes: Math.round(avgRespMin * 10) / 10,
        longestWaitDays: Math.floor(Number(longest?.days ?? 0)),
    };
}

// ----- 4) Leads KPIs (ganhos / ativos) -----

export async function calculateLeadsKpis(
    scope: ScopeFilters,
    range: DateRange
): Promise<LeadsKpis> {
    const prev = previousRange(range);
    const useAgg = shouldUseAggregations(range);

    // Ganhos no período
    let wonN = 0, wonV = 0;
    if (useAgg) {
        const aggWon = await queryOne<{ n: string; valor: string }>(
            `SELECT COALESCE(SUM(deals_won), 0)::TEXT AS n,
                    COALESCE(SUM(deals_won_value), 0)::TEXT AS valor
             FROM comm_daily_metrics
             WHERE user_id = $1 AND date >= $2::DATE AND date < $3::DATE
               AND client_id IS NULL AND salesperson_id IS NULL AND pipeline_id IS NULL`,
            [scope.userId, range.from, range.to]
        );
        wonN = Number(aggWon?.n ?? 0);
        wonV = Number(aggWon?.valor ?? 0);
    } else {
        const won = await queryOne<{ n: string; valor: string }>(
            `SELECT COUNT(*)::TEXT AS n, COALESCE(SUM(value), 0)::TEXT AS valor
             FROM comm_deals WHERE user_id = $1 AND status = 'won'
               AND closed_at >= $2 AND closed_at < $3`,
            [scope.userId, range.from, range.to]
        );
        wonN = Number(won?.n ?? 0);
        wonV = Number(won?.valor ?? 0);
    }
    const wonPrev = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_deals
         WHERE user_id = $1 AND status = 'won' AND closed_at >= $2 AND closed_at < $3`,
        [scope.userId, prev.from, prev.to]
    );

    // Leads ativos COM ATIVIDADE NO PERÍODO (open + atividade dentro do range)
    const active = await queryOne<{ n: string; valor: string }>(
        `SELECT COUNT(*)::TEXT AS n, COALESCE(SUM(value), 0)::TEXT AS valor
         FROM comm_deals
         WHERE user_id = $1 AND status = 'open'
           AND last_activity_at >= $2 AND last_activity_at < $3`,
        [scope.userId, range.from, range.to]
    );
    const activePrev = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_deals
         WHERE user_id = $1 AND status = 'open'
           AND last_activity_at >= $2 AND last_activity_at < $3`,
        [scope.userId, prev.from, prev.to]
    );

    return {
        wonLeads: wonN,
        wonValue: wonV,
        wonDelta: wonN - Number(wonPrev?.n ?? 0),
        activeLeads: Number(active?.n ?? 0),
        activeValue: Number(active?.valor ?? 0),
        activeDelta: Number(active?.n ?? 0) - Number(activePrev?.n ?? 0),
    };
}

// ----- 5) Tasks KPIs -----

export async function calculateTasksKpis(
    scope: ScopeFilters,
    range: DateRange
): Promise<TasksKpis> {
    // Tarefas pendentes COM DUE DATE no período (ou criadas no período)
    const pending = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_tasks
         WHERE user_id = $1 AND status = 'pending'
           AND ((due_at >= $2 AND due_at < $3) OR (due_at IS NULL AND created_at >= $2 AND created_at < $3))`,
        [scope.userId, range.from, range.to]
    );
    // Atrasadas: vencidas dentro do período
    const overdue = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_tasks
         WHERE user_id = $1 AND status = 'pending'
           AND due_at IS NOT NULL AND due_at < NOW()
           AND due_at >= $2 AND due_at < $3`,
        [scope.userId, range.from, range.to]
    );
    const created = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_tasks
         WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
        [scope.userId, range.from, range.to]
    );

    return {
        pendingTasks: Number(pending?.n ?? 0),
        overdueTasks: Number(overdue?.n ?? 0),
        tasksDelta: Number(created?.n ?? 0),
    };
}

// ----- 6) Lead sources -----

export async function calculateLeadSources(
    scope: ScopeFilters,
    range: DateRange,
    limit = 5
): Promise<LeadSourceView[]> {
    const rows = await query<{ source_id: string | null; name: string; color: string; n: string }>(
        `SELECT s.id AS source_id, COALESCE(s.name, 'Sem origem') AS name,
                COALESCE(s.color, '#6b7388') AS color, COUNT(d.id)::TEXT AS n
         FROM comm_deals d
         LEFT JOIN comm_lead_sources s ON s.id = d.source_id
         WHERE d.user_id = $1 AND d.created_at >= $2 AND d.created_at < $3
         GROUP BY s.id, s.name, s.color
         ORDER BY n DESC`,
        [scope.userId, range.from, range.to]
    );

    const total = rows.reduce((sum, r) => sum + Number(r.n), 0) || 1;
    const top = rows.slice(0, limit);
    const rest = rows.slice(limit);
    const result: LeadSourceView[] = top.map(r => ({
        sourceId: r.source_id,
        name: r.name,
        color: r.color,
        count: Number(r.n),
        percentage: Math.round((Number(r.n) / total) * 1000) / 10,
    }));
    if (rest.length > 0) {
        const restTotal = rest.reduce((s, r) => s + Number(r.n), 0);
        result.push({
            sourceId: null,
            name: 'Outros',
            color: '#4b5162',
            count: restTotal,
            percentage: Math.round((restTotal / total) * 1000) / 10,
        });
    }
    return result;
}

// ----- 7) Time Series (gráfico de linha temporal) -----

export interface TimeSeriesPoint {
    date: string;           // ISO yyyy-mm-dd
    leadsCreated: number;
    dealsWon: number;
    dealsWonValue: number;
    messagesReceived: number;
}

export async function calculateTimeSeries(
    scope: ScopeFilters,
    range: DateRange
): Promise<TimeSeriesPoint[]> {
    // Gera todos os dias do período (incluindo zerados)
    const days = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86400 / 1000));

    // Para períodos >= 7d e SEM filtro de cliente, usa daily_metrics (workspace-level rows = client_id IS NULL).
    // Quando cliente é filtrado, vai pra query ao vivo (agregado workspace ≠ agregado por cliente).
    if (days >= 7 && !scope.clientId) {
        const rows = await query<{
            d: Date;
            leads: string; won: string; won_v: string; msgs: string;
        }>(
            `WITH days AS (
                SELECT generate_series($2::DATE, ($3::DATE - INTERVAL '1 day')::DATE, INTERVAL '1 day')::DATE AS d
            )
            SELECT
                d.d,
                COALESCE(SUM(m.deals_created), 0)::TEXT AS leads,
                COALESCE(SUM(m.deals_won), 0)::TEXT AS won,
                COALESCE(SUM(m.deals_won_value), 0)::TEXT AS won_v,
                COALESCE(SUM(m.messages_received), 0)::TEXT AS msgs
            FROM days d
            LEFT JOIN comm_daily_metrics m ON m.date = d.d
                AND m.user_id = $1
                AND m.client_id IS NULL
                AND m.salesperson_id IS NULL AND m.pipeline_id IS NULL
            GROUP BY d.d ORDER BY d.d ASC`,
            [scope.userId, range.from, range.to]
        );
        return rows.map(r => ({
            date: r.d.toISOString().slice(0, 10),
            leadsCreated: Number(r.leads),
            dealsWon: Number(r.won),
            dealsWonValue: Number(r.won_v),
            messagesReceived: Number(r.msgs),
        }));
    }

    // Query ao vivo: usada para períodos curtos OU quando há filtro de cliente.
    // Inclui linhas com client_id IS NULL (dados não tagueados — ex.: importados do Kommo sem cliente).
    const rows = await query<{ d: Date; leads: string; won: string; won_v: string; msgs: string }>(
        `WITH days AS (
            SELECT generate_series($2::DATE, ($3::DATE - INTERVAL '1 day')::DATE, INTERVAL '1 day')::DATE AS d
        )
        SELECT
            d.d,
            COALESCE((SELECT COUNT(*) FROM comm_deals
                      WHERE user_id = $1 AND ($4::uuid IS NULL OR client_id = $4 OR client_id IS NULL)
                        AND created_at >= d.d AND created_at < d.d + INTERVAL '1 day'), 0)::TEXT AS leads,
            COALESCE((SELECT COUNT(*) FROM comm_deals
                      WHERE user_id = $1 AND ($4::uuid IS NULL OR client_id = $4 OR client_id IS NULL)
                        AND status = 'won' AND closed_at >= d.d AND closed_at < d.d + INTERVAL '1 day'), 0)::TEXT AS won,
            COALESCE((SELECT SUM(value) FROM comm_deals
                      WHERE user_id = $1 AND ($4::uuid IS NULL OR client_id = $4 OR client_id IS NULL)
                        AND status = 'won' AND closed_at >= d.d AND closed_at < d.d + INTERVAL '1 day'), 0)::TEXT AS won_v,
            COALESCE((SELECT COUNT(*) FROM comm_messages
                      WHERE user_id = $1 AND direction = 'in'
                        AND sent_at >= d.d AND sent_at < d.d + INTERVAL '1 day'), 0)::TEXT AS msgs
        FROM days d ORDER BY d.d ASC`,
        [scope.userId, range.from, range.to, scope.clientId ?? null]
    );
    return rows.map(r => ({
        date: r.d.toISOString().slice(0, 10),
        leadsCreated: Number(r.leads),
        dealsWon: Number(r.won),
        dealsWonValue: Number(r.won_v),
        messagesReceived: Number(r.msgs),
    }));
}

// ----- 8) Channel Analysis (volume + qualidade) -----

export interface ChannelAnalysisView {
    sourceId: string | null;
    name: string;
    color: string;
    leads: number;
    won: number;
    lost: number;
    open: number;
    convRate: number;          // 0-100
    wonValue: number;
    avgTicket: number;
    quality: 'high' | 'medium' | 'low';   // baseado em convRate
}

export async function calculateChannelAnalysis(
    scope: ScopeFilters,
    range: DateRange
): Promise<ChannelAnalysisView[]> {
    const rows = await query<{
        source_id: string | null;
        name: string;
        color: string;
        leads: string;
        won: string;
        lost: string;
        open: string;
        won_value: string;
    }>(
        `SELECT
            d.source_id,
            COALESCE(s.name, 'Sem origem') AS name,
            COALESCE(s.color, '#6b7388') AS color,
            COUNT(*)::TEXT AS leads,
            COUNT(*) FILTER (WHERE d.status = 'won')::TEXT AS won,
            COUNT(*) FILTER (WHERE d.status = 'lost')::TEXT AS lost,
            COUNT(*) FILTER (WHERE d.status = 'open')::TEXT AS open,
            COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0)::TEXT AS won_value
         FROM comm_deals d
         LEFT JOIN comm_lead_sources s ON s.id = d.source_id
         WHERE d.user_id = $1 AND d.created_at >= $2 AND d.created_at < $3
         GROUP BY d.source_id, s.name, s.color
         ORDER BY COUNT(*) DESC`,
        [scope.userId, range.from, range.to]
    );

    return rows.map(r => {
        const leads = Number(r.leads);
        const won = Number(r.won);
        const wonValue = Number(r.won_value);
        const convRate = leads > 0 ? (won / leads) * 100 : 0;
        const avgTicket = won > 0 ? wonValue / won : 0;
        const quality: 'high' | 'medium' | 'low' =
            convRate >= 10 ? 'high' :
                convRate >= 3 ? 'medium' : 'low';
        return {
            sourceId: r.source_id,
            name: r.name,
            color: r.color,
            leads,
            won,
            lost: Number(r.lost),
            open: Number(r.open),
            convRate: Math.round(convRate * 10) / 10,
            wonValue,
            avgTicket: Math.round(avgTicket),
            quality,
        };
    });
}

// ----- 8) Team performance -----

export async function calculateTeamPerformance(
    scope: ScopeFilters,
    range: DateRange
): Promise<SalespersonPerformanceView[]> {
    const rows = await query<{
        id: string; name: string; avatar_color: string; monthly_goal_value: string;
        msgs_sent: string;
        avg_first_resp: string | null;
        deals_won: string; deals_won_value: string;
        proposals: string;
    }>(
        `SELECT
            sp.id, sp.name, sp.avatar_color, sp.monthly_goal_value,
            COALESCE((SELECT COUNT(*)::TEXT FROM comm_messages m
                      WHERE m.sender_salesperson_id = sp.id
                        AND m.sent_at >= $2 AND m.sent_at < $3), '0') AS msgs_sent,
            (SELECT AVG(first_response_seconds)::TEXT FROM comm_conversations c
             WHERE c.salesperson_id = sp.id AND c.first_response_at >= $2 AND c.first_response_at < $3) AS avg_first_resp,
            COALESCE((SELECT COUNT(*)::TEXT FROM comm_deals d
                      WHERE d.salesperson_id = sp.id AND d.status = 'won'
                        AND d.closed_at >= $2 AND d.closed_at < $3), '0') AS deals_won,
            COALESCE((SELECT SUM(value)::TEXT FROM comm_deals d
                      WHERE d.salesperson_id = sp.id AND d.status = 'won'
                        AND d.closed_at >= $2 AND d.closed_at < $3), '0') AS deals_won_value,
            COALESCE((SELECT COUNT(*)::TEXT FROM comm_deal_stage_history h
                      JOIN comm_pipeline_stages s ON s.id = h.to_stage_id
                      WHERE h.moved_by_salesperson_id = sp.id
                        AND s.name ILIKE '%proposta%'
                        AND h.moved_at >= $2 AND h.moved_at < $3), '0') AS proposals
         FROM comm_salespeople sp
         WHERE sp.user_id = $1 AND sp.active = true
         ORDER BY deals_won_value DESC NULLS LAST, sp.name ASC`,
        [scope.userId, range.from, range.to]
    );

    return rows.map(r => {
        const goal = Number(r.monthly_goal_value);
        const wonV = Number(r.deals_won_value);
        return {
            salespersonId: r.id,
            name: r.name,
            avatarColor: r.avatar_color,
            messagesSent: Number(r.msgs_sent),
            avgFirstResponseSeconds: r.avg_first_resp ? Math.round(Number(r.avg_first_resp)) : 0,
            meetingsHeld: 0,                      // TODO: vincular com tarefas type=meeting completadas
            proposalsSent: Number(r.proposals),
            dealsWon: Number(r.deals_won),
            dealsWonValue: wonV,
            monthlyGoalValue: goal,
            goalProgressPct: goal > 0 ? Math.round((wonV / goal) * 1000) / 10 : 0,
        };
    });
}
