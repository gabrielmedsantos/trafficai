// ==============================
// TrafficAI — Métricas ao vivo (aba "Ao vivo" de Vendas)
// Tudo relativo ao "agora": pessoas ativas, ritmo por minuto, etapas de hoje
// comparadas com ontem no mesmo horário, gasto do dia e projeção de vendas.
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { salesAccountScope } from './sales-account-scope';
import { SourceCtx, getUserAdsToken, fetchAccountSpend } from './sales-report.service';

const TZ = 'America/Sao_Paulo';
/** Janela de "ativo agora": quem gerou qualquer evento nos últimos 5 min. */
const ACTIVE_MIN = 5;

export interface LiveStage {
    key: 'visits' | 'checkouts' | 'pix' | 'paid';
    label: string;
    today: number;
    last_hour: number;
    /** Ontem, da meia-noite até o mesmo horário de agora. */
    yday: number;
}

export interface LiveFeedItem {
    kind: 'visit' | 'checkout' | 'pix' | 'paid' | 'recovery';
    name: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    value: number | null;
    at: string;
}

export interface LiveMetrics {
    generated_at: string;
    active_now: number;
    /** Sessões distintas por minuto, da mais antiga (-59 min) até agora. */
    per_minute: number[];
    last30: { visits: number; yday: number; series: number[] };
    stages: LiveStage[];
    money: {
        spend_today: number | null;
        revenue_gross_today: number;
        revenue_net_today: number;
        avg_ticket: number | null;
        projected_sales: number;
        projected_revenue: number | null;
    };
    recovery: { sent_today: number; recovered_today: number };
    geo: {
        now: Array<{ country: string | null; state: string | null; city: string | null; n: number }>;
        today: Array<{ country: string | null; state: string | null; n: number }>;
    };
    feed: LiveFeedItem[];
}

/** Variação percentual de hoje sobre ontem; null quando ontem foi zero. */
export function pctChange(today: number, yday: number): number | null {
    return yday > 0 ? ((today - yday) / yday) * 100 : null;
}

/**
 * Vendas projetadas para o dia: o que já foi pago + o ritmo das últimas 3 h
 * aplicado às horas que faltam até a meia-noite (horário de Brasília).
 */
export function projectSales(paidToday: number, paidLast3h: number, now: Date = new Date()): number {
    const brt = new Date(now.getTime() - 3 * 3600_000);
    const hoursLeft = Math.max(0, 24 - (brt.getUTCHours() + brt.getUTCMinutes() / 60));
    return Math.round(paidToday + (paidLast3h / 3) * hoursLeft);
}

/** "Marcos Silva Souza" → "Marcos S."; vazio vira null. */
export function shortName(full: string | null | undefined): string | null {
    const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
}

/** Converte linhas {m, n} (minutos atrás) numa série fixa, do mais antigo pro mais novo. */
export function minuteSeries(rows: Array<{ m: number | string; n: number | string }>, size: number): number[] {
    const out = new Array(size).fill(0);
    for (const r of rows) {
        const m = Number(r.m);
        if (m >= 0 && m < size) out[size - 1 - m] = Number(r.n) || 0;
    }
    return out;
}

// O gasto vem da Meta ao vivo; a aba atualiza a cada minuto, então guarda 60 s.
const spendCache = new Map<string, { at: number; value: number | null }>();

async function spendToday(source: SourceCtx, today: string): Promise<number | null> {
    if (!source.meta_account_id) return null;
    const hit = spendCache.get(source.meta_account_id);
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
    const token = await getUserAdsToken(source.user_id);
    const value = token ? await fetchAccountSpend(token, source.meta_account_id, today, today) : null;
    spendCache.set(source.meta_account_id, { at: Date.now(), value });
    return value;
}

export async function buildLiveMetrics(source: SourceCtx): Promise<LiveMetrics> {
    const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    // t0 = meia-noite de hoje em Brasília; y0 = meia-noite de ontem.
    const bounds = `WITH b AS (SELECT (date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}') AS t0)`;
    const sid = `COALESCE(e.session_id, e.client_ip)`;

    const [ev] = await query<any>(
        `${bounds}
         SELECT
           COUNT(DISTINCT ${sid}) FILTER (WHERE e.created_at >= now() - interval '${ACTIVE_MIN} minutes') AS active_now,
           COUNT(*) FILTER (WHERE e.event_name = 'PageView' AND e.created_at >= now() - interval '30 minutes') AS pv30,
           COUNT(*) FILTER (WHERE e.event_name = 'PageView' AND e.created_at >= now() - interval '1 day 30 minutes' AND e.created_at < now() - interval '1 day') AS pv30_yday,
           COUNT(DISTINCT ${sid}) FILTER (WHERE e.event_name = 'PageView' AND e.created_at >= b.t0) AS visits_today,
           COUNT(DISTINCT ${sid}) FILTER (WHERE e.event_name = 'PageView' AND e.created_at >= now() - interval '1 hour') AS visits_hour,
           COUNT(DISTINCT ${sid}) FILTER (WHERE e.event_name = 'PageView' AND e.created_at >= b.t0 - interval '1 day' AND e.created_at < now() - interval '1 day') AS visits_yday,
           COUNT(DISTINCT ${sid}) FILTER (WHERE e.event_name = 'InitiateCheckout' AND e.created_at >= b.t0) AS checkouts_today,
           COUNT(DISTINCT ${sid}) FILTER (WHERE e.event_name = 'InitiateCheckout' AND e.created_at >= now() - interval '1 hour') AS checkouts_hour,
           COUNT(DISTINCT ${sid}) FILTER (WHERE e.event_name = 'InitiateCheckout' AND e.created_at >= b.t0 - interval '1 day' AND e.created_at < now() - interval '1 day') AS checkouts_yday
         FROM b, tracking_events e
         WHERE e.source_id = $1 AND e.created_at >= b.t0 - interval '1 day'`,
        [source.id]
    );

    const [perMinute, pvMinute] = await Promise.all([
        query<any>(
            `SELECT FLOOR(EXTRACT(EPOCH FROM now() - e.created_at) / 60)::int AS m, COUNT(DISTINCT ${sid}) AS n
             FROM tracking_events e WHERE e.source_id = $1 AND e.created_at >= now() - interval '60 minutes' GROUP BY 1`,
            [source.id]
        ),
        query<any>(
            `SELECT FLOOR(EXTRACT(EPOCH FROM now() - e.created_at) / 60)::int AS m, COUNT(*) AS n
             FROM tracking_events e WHERE e.source_id = $1 AND e.event_name = 'PageView' AND e.created_at >= now() - interval '30 minutes' GROUP BY 1`,
            [source.id]
        ),
    ]);

    // Pedidos seguem o mesmo escopo do Resumo (conta de anúncio da fonte).
    const created = `COALESCE(o.order_created_at, o.created_at)`;
    const [ord] = await query<any>(
        `${bounds}
         SELECT
           COUNT(*) FILTER (WHERE o.status <> 'abandoned' AND ${created} >= b.t0) AS pix_today,
           COUNT(*) FILTER (WHERE o.status <> 'abandoned' AND ${created} >= now() - interval '1 hour') AS pix_hour,
           COUNT(*) FILTER (WHERE o.status <> 'abandoned' AND ${created} >= b.t0 - interval '1 day' AND ${created} < now() - interval '1 day') AS pix_yday,
           COUNT(*) FILTER (WHERE o.status = 'approved' AND o.approved_at >= b.t0) AS paid_today,
           COUNT(*) FILTER (WHERE o.status = 'approved' AND o.approved_at >= now() - interval '1 hour') AS paid_hour,
           COUNT(*) FILTER (WHERE o.status = 'approved' AND o.approved_at >= now() - interval '3 hours') AS paid_3h,
           COUNT(*) FILTER (WHERE o.status = 'approved' AND o.approved_at >= b.t0 - interval '1 day' AND o.approved_at < now() - interval '1 day') AS paid_yday,
           COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'approved' AND o.approved_at >= b.t0), 0) AS gross_today,
           COALESCE(SUM(COALESCE(o.net_value, o.gross_value, 0)) FILTER (WHERE o.status = 'approved' AND o.approved_at >= b.t0), 0) AS net_today,
           AVG(COALESCE(o.gross_value, o.net_value)) FILTER (WHERE o.status = 'approved' AND o.approved_at >= now() - interval '30 days') AS avg_ticket
         FROM b, tracking_orders o
         WHERE ${salesAccountScope('o', '$1')}
           AND (${created} >= now() - interval '30 days' OR o.approved_at >= now() - interval '30 days')`,
        [source.id]
    );

    const [rec] = await query<any>(
        `${bounds}
         SELECT
           (SELECT COUNT(*) FROM aw_messages m JOIN aw_runs r ON r.id = m.run_id JOIN aw_flows f ON f.id = r.flow_id
             WHERE f.source_id = $1 AND r.recovery AND m.created_at >= b.t0 AND m.status IN ('sent', 'delivered', 'read')) AS sent_today,
           (SELECT COUNT(DISTINCT o.recovered_order_id) FROM tracking_orders o JOIN tracking_orders p ON p.id = o.recovered_order_id
             WHERE ${salesAccountScope('o', '$1')} AND p.status = 'approved' AND p.approved_at >= b.t0) AS recovered_today
         FROM b`,
        [source.id]
    ).catch((err) => {
        logger.warn('live-metrics: recuperação indisponível', { error: err.message });
        return [{ sent_today: 0, recovered_today: 0 }];
    });

    const [geoNow, geoToday] = await Promise.all([
        query<any>(
            `SELECT country, state, city, COUNT(DISTINCT ${sid}) AS n FROM tracking_events e
             WHERE e.source_id = $1 AND e.created_at >= now() - interval '${ACTIVE_MIN} minutes'
             GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 40`,
            [source.id]
        ),
        query<any>(
            `${bounds}
             SELECT country, state, COUNT(DISTINCT ${sid}) AS n FROM b, tracking_events e
             WHERE e.source_id = $1 AND e.created_at >= b.t0 AND e.event_name = 'PageView'
             GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30`,
            [source.id]
        ),
    ]);

    // Feed: última ação de cada visitante + pedidos e mensagens recentes.
    const [feedEvents, feedOrders, feedRecovery] = await Promise.all([
        query<any>(
            `SELECT * FROM (
               SELECT DISTINCT ON (${sid}) e.event_name, e.city, e.state, e.country, e.created_at
               FROM tracking_events e
               WHERE e.source_id = $1 AND e.created_at >= now() - interval '30 minutes' AND e.event_name IN ('PageView', 'InitiateCheckout')
               ORDER BY ${sid}, e.created_at DESC
             ) x ORDER BY created_at DESC LIMIT 15`,
            [source.id]
        ),
        query<any>(
            `SELECT o.status, o.customer_name, COALESCE(o.gross_value, o.net_value) AS value,
                    CASE WHEN o.status = 'approved' THEN o.approved_at ELSE ${created} END AS at,
                    geo.city, geo.state, geo.country
             FROM tracking_orders o
             LEFT JOIN LATERAL (
               SELECT e.city, e.state, e.country FROM tracking_events e
               WHERE e.source_id = o.source_id AND o.sck IS NOT NULL AND e.session_id = o.sck AND e.city IS NOT NULL
               ORDER BY e.created_at DESC LIMIT 1
             ) geo ON TRUE
             WHERE ${salesAccountScope('o', '$1')} AND o.status IN ('approved', 'pending')
               AND (o.approved_at >= now() - interval '30 minutes' OR ${created} >= now() - interval '30 minutes')
             ORDER BY at DESC LIMIT 15`,
            [source.id]
        ),
        query<any>(
            `SELECT o.customer_name, m.created_at AS at FROM aw_messages m
             JOIN aw_runs r ON r.id = m.run_id JOIN aw_flows f ON f.id = r.flow_id
             LEFT JOIN tracking_orders o ON o.id = COALESCE(m.order_id, r.order_id)
             WHERE f.source_id = $1 AND r.recovery AND m.status IN ('sent', 'delivered', 'read') AND m.created_at >= now() - interval '30 minutes'
             ORDER BY m.created_at DESC LIMIT 10`,
            [source.id]
        ).catch(() => [] as any[]),
    ]);

    const feed: LiveFeedItem[] = [
        ...feedEvents.map((e: any): LiveFeedItem => ({
            kind: e.event_name === 'InitiateCheckout' ? 'checkout' : 'visit',
            name: null, city: e.city, state: e.state, country: e.country, value: null, at: new Date(e.created_at).toISOString(),
        })),
        ...feedOrders.map((o: any): LiveFeedItem => ({
            kind: o.status === 'approved' ? 'paid' : 'pix',
            name: shortName(o.customer_name), city: o.city, state: o.state, country: o.country,
            value: o.value != null ? Number(o.value) : null, at: new Date(o.at).toISOString(),
        })),
        ...feedRecovery.map((m: any): LiveFeedItem => ({
            kind: 'recovery', name: shortName(m.customer_name), city: null, state: null, country: null, value: null, at: new Date(m.at).toISOString(),
        })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);

    const n = (v: any) => Number(v) || 0;
    const paidToday = n(ord?.paid_today);
    const avgTicket = ord?.avg_ticket != null ? Number(ord.avg_ticket) : null;
    const projected = projectSales(paidToday, n(ord?.paid_3h));
    const spend = await spendToday(source, today);

    return {
        generated_at: new Date().toISOString(),
        active_now: n(ev?.active_now),
        per_minute: minuteSeries(perMinute, 60),
        last30: { visits: n(ev?.pv30), yday: n(ev?.pv30_yday), series: minuteSeries(pvMinute, 30) },
        stages: [
            { key: 'visits', label: 'Abriram a página', today: n(ev?.visits_today), last_hour: n(ev?.visits_hour), yday: n(ev?.visits_yday) },
            { key: 'checkouts', label: 'Clicaram em comprar', today: n(ev?.checkouts_today), last_hour: n(ev?.checkouts_hour), yday: n(ev?.checkouts_yday) },
            { key: 'pix', label: 'Geraram o pedido', today: n(ord?.pix_today), last_hour: n(ord?.pix_hour), yday: n(ord?.pix_yday) },
            { key: 'paid', label: 'Pagaram', today: paidToday, last_hour: n(ord?.paid_hour), yday: n(ord?.paid_yday) },
        ],
        money: {
            spend_today: spend,
            revenue_gross_today: n(ord?.gross_today),
            revenue_net_today: n(ord?.net_today),
            avg_ticket: avgTicket,
            projected_sales: projected,
            projected_revenue: avgTicket != null ? projected * avgTicket : null,
        },
        recovery: { sent_today: n(rec?.sent_today), recovered_today: n(rec?.recovered_today) },
        geo: {
            now: geoNow.map((g: any) => ({ country: g.country, state: g.state, city: g.city, n: n(g.n) })),
            today: geoToday.map((g: any) => ({ country: g.country, state: g.state, n: n(g.n) })),
        },
        feed,
    };
}
