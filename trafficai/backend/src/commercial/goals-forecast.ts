// ==============================
// TrafficAI — Metas e Forecast
// Calcula progresso da meta do MÊS CORRENTE (não do filtro de período).
// Forecast linear simples: extrapola pace atual até fim do mês.
// ==============================

import { query, queryOne } from '../database/connection';
import type { SalespersonPerformanceView } from './types';

interface ScopeFilters {
    userId: string;
    clientId?: string | null;
}

export interface SalespersonGoalProgress {
    salespersonId: string;
    name: string;
    avatarColor: string;
    monthlyGoal: number;
    achieved: number;
    achievedPct: number;        // 0-100+
    pacePerDay: number;
    projectedEnd: number;
    projectedEndPct: number;
    onTrack: boolean;           // ritmo > linear esperado
    advice: string | null;      // "Precisa fechar R$ X/dia"
}

export interface GoalForecast {
    /** Mês corrente (ISO yyyy-mm-01) */
    monthStart: string;
    monthEnd: string;
    /** Dias do mês total e quantos passaram */
    daysTotal: number;
    daysElapsed: number;
    daysRemaining: number;

    /** Soma das metas individuais */
    workspaceGoal: number;
    /** Total fechado neste mês */
    workspaceAchieved: number;
    /** % da meta total (pode passar de 100) */
    workspaceAchievedPct: number;
    /** Onde DEVERIA estar hoje (linear) */
    expectedAtThisPoint: number;
    expectedPct: number;

    /** Pace diário atual */
    dailyPace: number;
    /** Projeção: pace × daysTotal */
    projectedEnd: number;
    projectedEndPct: number;

    /** Vai bater no ritmo atual? */
    willHit: boolean;
    /** Gap em R$ se não bater */
    gapToGoal: number;
    /** Precisa fechar R$ X/dia restante pra bater */
    requiredDailyPace: number;
    /** % de aceleração sobre o ritmo atual */
    accelerationNeededPct: number;

    /** Texto resumo pro card */
    advice: string;
    /** 'success' = batendo, 'warning' = atrasado mas recuperável, 'critical' = muito longe */
    status: 'success' | 'warning' | 'critical' | 'no_goal';

    /** Por vendedor */
    perSalesperson: SalespersonGoalProgress[];
}

const fmtBRL = (v: number) =>
    v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
        : v >= 1_000 ? `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`
            : `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

export async function calculateGoalForecast(scope: ScopeFilters): Promise<GoalForecast> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const daysTotal = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400 / 1000);
    const daysElapsed = Math.max(1, Math.min(daysTotal, Math.ceil((now.getTime() - monthStart.getTime()) / 86400 / 1000)));
    const daysRemaining = Math.max(0, daysTotal - daysElapsed);

    // Soma das metas individuais (workspace meta = soma)
    const goalRow = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(monthly_goal_value), 0)::TEXT AS total
         FROM comm_salespeople
         WHERE user_id = $1 AND active = true
           AND ($2::uuid IS NULL OR client_id = $2 OR client_id IS NULL)`,
        [scope.userId, scope.clientId ?? null]
    );
    const workspaceGoal = Number(goalRow?.total ?? 0);

    // Total fechado no mês corrente (sem filtro de salesperson aqui — workspace inteiro)
    const wonRow = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(value), 0)::TEXT AS total FROM comm_deals
         WHERE user_id = $1 AND status = 'won'
           AND closed_at >= $2 AND closed_at < $3
           AND ($4::uuid IS NULL OR client_id = $4 OR client_id IS NULL)`,
        [scope.userId, monthStart, monthEnd, scope.clientId ?? null]
    );
    const workspaceAchieved = Number(wonRow?.total ?? 0);

    const workspaceAchievedPct = workspaceGoal > 0
        ? Math.round((workspaceAchieved / workspaceGoal) * 1000) / 10
        : 0;

    const expectedAtThisPoint = workspaceGoal * (daysElapsed / daysTotal);
    const expectedPct = (daysElapsed / daysTotal) * 100;

    const dailyPace = workspaceAchieved / daysElapsed;
    const projectedEnd = dailyPace * daysTotal;
    const projectedEndPct = workspaceGoal > 0
        ? Math.round((projectedEnd / workspaceGoal) * 1000) / 10
        : 0;

    const willHit = projectedEnd >= workspaceGoal && workspaceGoal > 0;
    const gapToGoal = Math.max(0, workspaceGoal - workspaceAchieved);
    const requiredDailyPace = daysRemaining > 0 ? gapToGoal / daysRemaining : 0;
    const accelerationNeededPct = dailyPace > 0
        ? Math.round(((requiredDailyPace - dailyPace) / dailyPace) * 1000) / 10
        : 0;

    // Status + advice
    let status: GoalForecast['status'];
    let advice: string;

    if (workspaceGoal === 0) {
        status = 'no_goal';
        advice = 'Nenhuma meta configurada. Defina metas individuais por vendedor pra acompanhar o progresso.';
    } else if (willHit) {
        status = 'success';
        advice = `No ritmo pra bater! Projetado: ${fmtBRL(projectedEnd)} (${projectedEndPct.toFixed(0)}% da meta).`;
    } else if (projectedEndPct >= 75) {
        status = 'warning';
        advice = daysRemaining > 0
            ? `Vai fechar em ${projectedEndPct.toFixed(0)}% da meta no ritmo atual. Precisa fechar ${fmtBRL(requiredDailyPace)}/dia (${accelerationNeededPct >= 0 ? '+' : ''}${accelerationNeededPct.toFixed(0)}% sobre o ritmo atual) pra bater.`
            : `Mês quase encerrado. Faltam ${fmtBRL(gapToGoal)} pra bater a meta.`;
    } else {
        status = 'critical';
        advice = daysRemaining > 0
            ? `Distante da meta — projeção ${projectedEndPct.toFixed(0)}%. Precisa fechar ${fmtBRL(requiredDailyPace)}/dia (${accelerationNeededPct.toFixed(0)}% mais que o ritmo atual) ou rever ticket médio.`
            : `Mês encerrando com gap de ${fmtBRL(gapToGoal)}.`;
    }

    // Por vendedor
    const sps = await query<{
        id: string; name: string; avatar_color: string; monthly_goal_value: string;
        achieved: string;
    }>(
        `SELECT
            sp.id, sp.name, sp.avatar_color, sp.monthly_goal_value::TEXT,
            COALESCE((SELECT SUM(value) FROM comm_deals d
                      WHERE d.salesperson_id = sp.id AND d.status = 'won'
                        AND d.closed_at >= $2 AND d.closed_at < $3), 0)::TEXT AS achieved
         FROM comm_salespeople sp
         WHERE sp.user_id = $1 AND sp.active = true
           AND ($4::uuid IS NULL OR sp.client_id = $4 OR sp.client_id IS NULL)
         ORDER BY sp.name`,
        [scope.userId, monthStart, monthEnd, scope.clientId ?? null]
    );

    const perSalesperson: SalespersonGoalProgress[] = sps.map(sp => {
        const goal = Number(sp.monthly_goal_value);
        const achieved = Number(sp.achieved);
        const pct = goal > 0 ? Math.round((achieved / goal) * 1000) / 10 : 0;
        const pace = achieved / daysElapsed;
        const projected = pace * daysTotal;
        const projectedPct = goal > 0 ? Math.round((projected / goal) * 1000) / 10 : 0;
        const onTrack = goal > 0 && projected >= goal;
        const requiredDaily = daysRemaining > 0 ? Math.max(0, (goal - achieved) / daysRemaining) : 0;

        let spAdvice: string | null = null;
        if (goal > 0 && !onTrack && daysRemaining > 0) {
            spAdvice = `Precisa fechar ${fmtBRL(requiredDaily)}/dia`;
        } else if (goal > 0 && onTrack) {
            spAdvice = `No ritmo · proj. ${projectedPct.toFixed(0)}%`;
        }

        return {
            salespersonId: sp.id,
            name: sp.name,
            avatarColor: sp.avatar_color || '#6366f1',
            monthlyGoal: goal,
            achieved,
            achievedPct: pct,
            pacePerDay: Math.round(pace),
            projectedEnd: Math.round(projected),
            projectedEndPct: projectedPct,
            onTrack,
            advice: spAdvice,
        };
    });

    return {
        monthStart: monthStart.toISOString().slice(0, 10),
        monthEnd: monthEnd.toISOString().slice(0, 10),
        daysTotal,
        daysElapsed,
        daysRemaining,
        workspaceGoal,
        workspaceAchieved,
        workspaceAchievedPct,
        expectedAtThisPoint: Math.round(expectedAtThisPoint),
        expectedPct: Math.round(expectedPct * 10) / 10,
        dailyPace: Math.round(dailyPace),
        projectedEnd: Math.round(projectedEnd),
        projectedEndPct,
        willHit,
        gapToGoal: Math.round(gapToGoal),
        requiredDailyPace: Math.round(requiredDailyPace),
        accelerationNeededPct,
        advice,
        status,
        perSalesperson,
    };
}
