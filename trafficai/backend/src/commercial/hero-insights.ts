// ==============================
// TrafficAI — Hero KPIs + Insights Automáticos
// Faixas 1 e 2 do dashboard comercial redesigned.
// ==============================

import { query, queryOne } from '../database/connection';
import type {
    DateRange, HeroKpiCard, InsightCard, FunnelStageView, SalespersonPerformanceView,
} from './types';

interface ScopeFilters {
    userId: string;
    clientId?: string | null;
}

// ----- HELPERS -----

function previousRange(range: DateRange): DateRange {
    const ms = range.to.getTime() - range.from.getTime();
    return {
        from: new Date(range.from.getTime() - ms),
        to: new Date(range.from.getTime()),
    };
}

const fmtBRL = (v: number) =>
    v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
        : v >= 1_000 ? `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`
            : `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

const fmtPct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`;

const fmtNum = (v: number) => v.toLocaleString('pt-BR');

function pctDelta(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// ----- SPARKLINE: 14 pontos diários da métrica -----

async function dailySparkline(
    userId: string,
    metric: 'deals_won_value' | 'deals_won' | 'messages_received' | 'deals_created',
    days = 14
): Promise<number[]> {
    const rows = await query<{ d: Date; v: string }>(
        `WITH days AS (
            SELECT generate_series(
                CURRENT_DATE - INTERVAL '${days - 1} days',
                CURRENT_DATE,
                INTERVAL '1 day'
            )::DATE AS d
        )
        SELECT d.d, COALESCE(SUM(m.${metric}), 0)::TEXT AS v
        FROM days d
        LEFT JOIN comm_daily_metrics m ON m.date = d.d
            AND m.user_id = $1
            AND m.client_id IS NULL AND m.salesperson_id IS NULL AND m.pipeline_id IS NULL
        GROUP BY d.d ORDER BY d.d ASC`,
        [userId]
    );
    return rows.map(r => Number(r.v));
}

// ----- HERO KPIs -----

export async function calculateHeroKpis(scope: ScopeFilters, range: DateRange): Promise<HeroKpiCard[]> {
    const prev = previousRange(range);

    // 1) RECEITA (deals_won_value)
    const won = await queryOne<{ n: string; valor: string }>(
        `SELECT COUNT(*)::TEXT AS n, COALESCE(SUM(value), 0)::TEXT AS valor
         FROM comm_deals WHERE user_id = $1 AND status = 'won'
           AND closed_at >= $2 AND closed_at < $3`,
        [scope.userId, range.from, range.to]
    );
    const wonPrev = await queryOne<{ n: string; valor: string }>(
        `SELECT COUNT(*)::TEXT AS n, COALESCE(SUM(value), 0)::TEXT AS valor
         FROM comm_deals WHERE user_id = $1 AND status = 'won'
           AND closed_at >= $2 AND closed_at < $3`,
        [scope.userId, prev.from, prev.to]
    );

    // 2) Pipeline aberto COM ATIVIDADE NO PERÍODO
    const openP = await queryOne<{ n: string; valor: string }>(
        `SELECT COUNT(*)::TEXT AS n, COALESCE(SUM(value), 0)::TEXT AS valor
         FROM comm_deals
         WHERE user_id = $1 AND status = 'open'
           AND last_activity_at >= $2 AND last_activity_at < $3`,
        [scope.userId, range.from, range.to]
    );
    const openPPrev = await queryOne<{ n: string; valor: string }>(
        `SELECT COUNT(*)::TEXT AS n, COALESCE(SUM(value), 0)::TEXT AS valor
         FROM comm_deals
         WHERE user_id = $1 AND status = 'open'
           AND last_activity_at >= $2 AND last_activity_at < $3`,
        [scope.userId, prev.from, prev.to]
    );

    // 3) Taxa de conversão geral (ganhos / leads gerados no período)
    const created = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_deals
         WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
        [scope.userId, range.from, range.to]
    );
    const createdPrev = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_deals
         WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
        [scope.userId, prev.from, prev.to]
    );

    // 4) Tempo médio até ganho (dias entre created_at e closed_at de deals ganhos no período)
    const cycle = await queryOne<{ avg_days: string | null }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400.0)::TEXT AS avg_days
         FROM comm_deals
         WHERE user_id = $1 AND status = 'won'
           AND closed_at >= $2 AND closed_at < $3
           AND created_at IS NOT NULL AND closed_at IS NOT NULL`,
        [scope.userId, range.from, range.to]
    );
    const cyclePrev = await queryOne<{ avg_days: string | null }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400.0)::TEXT AS avg_days
         FROM comm_deals
         WHERE user_id = $1 AND status = 'won'
           AND closed_at >= $2 AND closed_at < $3
           AND created_at IS NOT NULL AND closed_at IS NOT NULL`,
        [scope.userId, prev.from, prev.to]
    );
    const avgDays = cycle?.avg_days ? Number(cycle.avg_days) : 0;
    const avgDaysPrev = cyclePrev?.avg_days ? Number(cyclePrev.avg_days) : 0;

    const totalCreated = Number(created?.n ?? 0);
    const totalCreatedPrev = Number(createdPrev?.n ?? 0);
    const wonN = Number(won?.n ?? 0);
    const wonNPrev = Number(wonPrev?.n ?? 0);
    const wonValue = Number(won?.valor ?? 0);
    const wonValuePrev = Number(wonPrev?.valor ?? 0);

    const convRate = totalCreated > 0 ? (wonN / totalCreated) * 100 : 0;
    const convRatePrev = totalCreatedPrev > 0 ? (wonNPrev / totalCreatedPrev) * 100 : 0;

    const ticketAvg = wonN > 0 ? wonValue / wonN : 0;
    const ticketAvgPrev = wonNPrev > 0 ? wonValuePrev / wonNPrev : 0;

    // Sparklines
    const [sparkRevenue, sparkWon, sparkLeads] = await Promise.all([
        dailySparkline(scope.userId, 'deals_won_value', 14),
        dailySparkline(scope.userId, 'deals_won', 14),
        dailySparkline(scope.userId, 'deals_created', 14),
    ]);

    return [
        {
            label: 'Receita do período',
            value: wonValue,
            valueFormatted: fmtBRL(wonValue),
            delta: wonValue - wonValuePrev,
            deltaPercent: pctDelta(wonValue, wonValuePrev),
            sparkline: sparkRevenue,
            isPositiveTrend: true,
            icon: '💰',
            color: 'green',
            href: '/comercial/leads?status=won',
        },
        {
            label: 'Leads ganhos',
            value: wonN,
            valueFormatted: fmtNum(wonN),
            delta: wonN - wonNPrev,
            deltaPercent: pctDelta(wonN, wonNPrev),
            sparkline: sparkWon,
            isPositiveTrend: true,
            icon: '🏆',
            color: 'green',
            href: '/comercial/leads?status=won',
        },
        {
            label: 'Taxa de conversão',
            value: convRate,
            valueFormatted: fmtPct(convRate),
            delta: convRate - convRatePrev,
            deltaPercent: pctDelta(convRate, convRatePrev),
            sparkline: sparkWon.map((w, i) => sparkLeads[i] ? (w / sparkLeads[i]!) * 100 : 0),
            isPositiveTrend: true,
            icon: '🎯',
            color: 'purple',
        },
        {
            label: 'Pipeline aberto',
            value: Number(openP?.valor ?? 0),
            valueFormatted: fmtBRL(Number(openP?.valor ?? 0)),
            delta: Number(openP?.valor ?? 0) - Number(openPPrev?.valor ?? 0),
            deltaPercent: pctDelta(Number(openP?.valor ?? 0), Number(openPPrev?.valor ?? 0)),
            sparkline: sparkLeads,
            isPositiveTrend: true,
            icon: '📊',
            color: 'blue',
            href: '/comercial/leads?status=open',
        },
        {
            label: 'Ticket médio',
            value: ticketAvg,
            valueFormatted: fmtBRL(ticketAvg),
            delta: ticketAvg - ticketAvgPrev,
            deltaPercent: pctDelta(ticketAvg, ticketAvgPrev),
            sparkline: sparkRevenue.map((r, i) => sparkWon[i] ? r / sparkWon[i]! : 0),
            isPositiveTrend: true,
            icon: '💎',
            color: 'yellow',
        },
        {
            label: 'Tempo médio até ganho',
            value: avgDays,
            valueFormatted: avgDays > 0 ? `${avgDays.toFixed(1).replace('.', ',')} dias` : '—',
            delta: avgDays - avgDaysPrev,
            deltaPercent: pctDelta(avgDays, avgDaysPrev),
            sparkline: sparkWon,
            // Menos dias é melhor: quando tendência cai, é positiva
            isPositiveTrend: false,
            icon: '⏱️',
            color: 'purple',
        },
    ];
}

// ----- INSIGHTS AUTOMÁTICOS -----
//
// Cada função é uma regra que pode (ou não) gerar 1 insight card.
// Depois a função orquestra rodando todas e priorizando críticos.

interface InsightInput {
    scope: ScopeFilters;
    range: DateRange;
    funnel: FunnelStageView[];
    team: SalespersonPerformanceView[];
}

async function detectFunnelBottleneck(input: InsightInput): Promise<InsightCard | null> {
    // Encontra a etapa COM MOVIMENTO no período onde mais leads vazam (perda > avanço)
    const candidates = input.funnel.filter(s =>
        s.stageType === 'normal' &&
        (s.advancedInPeriod + s.lostInPeriod) >= 5     // mínimo 5 movimentos
    );
    if (candidates.length === 0) return null;

    let worst: typeof candidates[0] | null = null;
    let worstLossRate = 0;
    for (const s of candidates) {
        const total = s.advancedInPeriod + s.lostInPeriod;
        const lossRate = total > 0 ? (s.lostInPeriod / total) * 100 : 0;
        if (lossRate > worstLossRate) {
            worstLossRate = lossRate;
            worst = s;
        }
    }
    if (!worst || worstLossRate < 50) return null;

    return {
        severity: worstLossRate > 70 ? 'critical' : 'warning',
        icon: '🚨',
        title: `Etapa "${worst.name}" perde ${worstLossRate.toFixed(0)}% dos leads`,
        description: `Maior gargalo do funil: ${worst.lostInPeriod} de ${worst.advancedInPeriod + worst.lostInPeriod} leads desistem aqui. Investigar abordagem ou objeções comuns.`,
        metric: `${worstLossRate.toFixed(0)}%`,
        href: '/comercial/leads?stageId=' + worst.stageId,
    };
}

async function detectSlaProblem(scope: ScopeFilters, range: DateRange): Promise<InsightCard | null> {
    // Quantas conversas tiveram 1ª resposta > 30 min no período?
    const r = await queryOne<{ atrasadas: string; total: string }>(
        `SELECT
            COUNT(*) FILTER (WHERE first_response_seconds > 1800)::TEXT AS atrasadas,
            COUNT(*)::TEXT AS total
         FROM comm_conversations
         WHERE user_id = $1 AND first_response_seconds IS NOT NULL
           AND first_response_at >= $2 AND first_response_at < $3`,
        [scope.userId, range.from, range.to]
    );
    const atr = Number(r?.atrasadas ?? 0);
    const tot = Number(r?.total ?? 0);
    if (tot === 0 || atr === 0) return null;
    const pct = (atr / tot) * 100;
    if (pct < 20) return null;

    return {
        severity: pct > 50 ? 'critical' : 'warning',
        icon: '⏰',
        title: `${atr} conversas com 1ª resposta acima de 30 min`,
        description: `${pct.toFixed(0)}% das conversas estouraram o SLA. Estudos mostram que responder em <5min aumenta 7x a chance de fechar.`,
        metric: `${pct.toFixed(0)}%`,
        href: '/comercial/conversations',
    };
}

async function detectStuckHotDeals(scope: ScopeFilters): Promise<InsightCard | null> {
    // Deals com alto valor (top 20%) parados há +7 dias
    const r = await query<{ n: string; valor: string }>(
        `SELECT COUNT(*)::TEXT AS n, COALESCE(SUM(d.value), 0)::TEXT AS valor
         FROM comm_deals d
         JOIN comm_pipeline_stages s ON s.id = d.stage_id
         WHERE d.user_id = $1 AND d.status = 'open'
           AND s.stage_type = 'normal'
           AND d.last_activity_at < NOW() - INTERVAL '7 days'
           AND d.value >= (
             SELECT percentile_cont(0.8) WITHIN GROUP (ORDER BY value)
             FROM comm_deals WHERE user_id = $1 AND status = 'open' AND value > 0
           )`,
        [scope.userId]
    );
    const n = Number(r[0]?.n ?? 0);
    const valor = Number(r[0]?.valor ?? 0);
    if (n === 0) return null;

    return {
        severity: 'warning',
        icon: '🎯',
        title: `${n} deals quentes parados há +7 dias`,
        description: `Valor agregado: ${fmtBRL(valor)}. São deals de alto valor sem atividade recente — risco alto de esfriamento.`,
        metric: fmtBRL(valor),
        href: '/comercial/leads?status=open',
    };
}

async function detectImprovingTrend(scope: ScopeFilters, range: DateRange): Promise<InsightCard | null> {
    // Receita do período vs período anterior — se subiu mais de 15%
    const prev = previousRange(range);
    const won = await queryOne<{ valor: string }>(
        `SELECT COALESCE(SUM(value), 0)::TEXT AS valor FROM comm_deals
         WHERE user_id = $1 AND status = 'won' AND closed_at >= $2 AND closed_at < $3`,
        [scope.userId, range.from, range.to]
    );
    const wonPrev = await queryOne<{ valor: string }>(
        `SELECT COALESCE(SUM(value), 0)::TEXT AS valor FROM comm_deals
         WHERE user_id = $1 AND status = 'won' AND closed_at >= $2 AND closed_at < $3`,
        [scope.userId, prev.from, prev.to]
    );
    const v = Number(won?.valor ?? 0);
    const vp = Number(wonPrev?.valor ?? 0);
    if (vp === 0 || v <= vp) return null;
    const pct = ((v - vp) / vp) * 100;
    if (pct < 15) return null;

    return {
        severity: 'success',
        icon: '📈',
        title: `Receita subiu ${pct.toFixed(0)}% vs período anterior`,
        description: `${fmtBRL(v)} vs ${fmtBRL(vp)} no período anterior. Mantenha o ritmo.`,
        metric: `+${pct.toFixed(0)}%`,
    };
}

async function detectTopPerformer(team: SalespersonPerformanceView[]): Promise<InsightCard | null> {
    if (team.length === 0) return null;
    const top = team[0]!;
    if (top.dealsWon === 0) return null;
    if (top.goalProgressPct < 50) return null;

    return {
        severity: 'success',
        icon: '🏆',
        title: `${top.name} é o destaque com ${fmtBRL(top.dealsWonValue)} fechado`,
        description: `${top.dealsWon} ganhos · ${top.goalProgressPct.toFixed(0)}% da meta. ${top.goalProgressPct >= 100 ? 'BATEU A META! 🎉' : 'Próximo de bater a meta.'}`,
        metric: `${top.goalProgressPct.toFixed(0)}%`,
    };
}

async function detectUnderperformer(team: SalespersonPerformanceView[]): Promise<InsightCard | null> {
    // Vendedor com volume baixo de mensagens E baixa conversão
    if (team.length < 2) return null;
    const struggling = team.find(sp =>
        sp.messagesSent < 50 && sp.dealsWon === 0 && sp.monthlyGoalValue > 0
    );
    if (!struggling) return null;

    return {
        severity: 'warning',
        icon: '⚠️',
        title: `${struggling.name} sem fechamentos no período`,
        description: `Apenas ${struggling.messagesSent} mensagens enviadas. Talvez precise de coaching ou redistribuição de leads.`,
        href: '/comercial/team',
    };
}

export async function generateInsights(input: InsightInput): Promise<InsightCard[]> {
    const detectors = await Promise.all([
        detectFunnelBottleneck(input),
        detectSlaProblem(input.scope, input.range),
        detectStuckHotDeals(input.scope),
        detectImprovingTrend(input.scope, input.range),
        detectTopPerformer(input.team),
        detectUnderperformer(input.team),
    ]);

    // Ordena por severidade: critical > warning > info > success
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
    const insights = detectors.filter((x): x is InsightCard => x !== null);
    insights.sort((a, b) => order[a.severity]! - order[b.severity]!);

    // Retorna top 4 (cabe na UI)
    return insights.slice(0, 4);
}
