// ==============================
// TrafficAI — Regiões (aba "Regiões" de Vendas)
// Por estado: visitas e cliques em comprar (eventos do pixel), pedidos e
// vendas (pedidos ligados à sessão do pixel pelo sck) e receita.
// ==============================

import { query } from '../database/connection';
import { salesAccountScope } from './sales-account-scope';
import { SourceCtx } from './sales-report.service';

const TZ = 'America/Sao_Paulo';

export interface RegionRow {
    /** Nome do estado (BR) ou "Exterior". */
    state: string;
    country: string;
    visits: number;
    checkouts: number;
    orders: number;
    sales: number;
    revenue: number;
}

export interface RegionsReport {
    rows: RegionRow[];
    totals: { visits: number; checkouts: number; orders: number; sales: number; revenue: number };
    /** Pedidos do período sem sessão do pixel (não dá pra saber o estado). */
    unknown: { orders: number; sales: number; revenue: number };
}

const n = (v: any) => Number(v) || 0;

/** Agrupamento: estados do Brasil pelo nome; fora do Brasil vira "Exterior". */
export function regionKey(country: string | null, state: string | null): { state: string; country: string } | null {
    const c = String(country || '').toUpperCase();
    if (c && c !== 'BR') return { state: 'Exterior', country: c };
    const s = String(state || '').trim();
    return s ? { state: s, country: 'BR' } : null;
}

export async function buildRegions(source: SourceCtx, since: string, until: string): Promise<RegionsReport> {
    const sid = `COALESCE(e.session_id, e.client_ip)`;
    const day = `(e.created_at AT TIME ZONE '${TZ}')::date`;
    const orderDay = `(COALESCE(o.approved_at, o.order_created_at, o.created_at) AT TIME ZONE '${TZ}')::date`;

    const [events, orders] = await Promise.all([
        query<any>(
            `SELECT e.country, e.state,
                    COUNT(DISTINCT ${sid}) FILTER (WHERE e.event_name = 'PageView') AS visits,
                    COUNT(DISTINCT ${sid}) FILTER (WHERE e.event_name = 'InitiateCheckout') AS checkouts
             FROM tracking_events e
             WHERE e.source_id = $1 AND ${day} BETWEEN $2 AND $3
             GROUP BY 1, 2`,
            [source.id, since, until]
        ),
        query<any>(
            `SELECT geo.country, geo.state,
                    COUNT(*) FILTER (WHERE o.status <> 'abandoned') AS orders,
                    COUNT(*) FILTER (WHERE o.status = 'approved') AS sales,
                    COALESCE(SUM(COALESCE(o.net_value, o.gross_value, 0)) FILTER (WHERE o.status = 'approved'), 0) AS revenue
             FROM tracking_orders o
             LEFT JOIN LATERAL (
               SELECT e.country, e.state FROM tracking_events e
               WHERE e.source_id = o.source_id AND o.sck IS NOT NULL AND e.session_id = o.sck AND e.state IS NOT NULL
               ORDER BY e.created_at DESC LIMIT 1
             ) geo ON TRUE
             WHERE ${salesAccountScope('o', '$1')} AND ${orderDay} BETWEEN $2 AND $3
             GROUP BY 1, 2`,
            [source.id, since, until]
        ),
    ]);

    const map = new Map<string, RegionRow>();
    const row = (country: string | null, state: string | null): RegionRow | null => {
        const k = regionKey(country, state);
        if (!k) return null;
        const key = `${k.country === 'BR' ? 'BR' : 'X'}|${k.state.toLowerCase()}`;
        let r = map.get(key);
        if (!r) { r = { ...k, visits: 0, checkouts: 0, orders: 0, sales: 0, revenue: 0 }; map.set(key, r); }
        return r;
    };

    for (const e of events) {
        const r = row(e.country, e.state);
        if (r) { r.visits += n(e.visits); r.checkouts += n(e.checkouts); }
    }
    const unknown = { orders: 0, sales: 0, revenue: 0 };
    for (const o of orders) {
        const r = row(o.country, o.state) || unknown;
        r.orders += n(o.orders); r.sales += n(o.sales); r.revenue += n(o.revenue);
    }

    const rows = [...map.values()]
        .filter((r) => r.visits || r.orders)
        .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue || b.visits - a.visits);
    const totals = rows.reduce((t, r) => ({
        visits: t.visits + r.visits, checkouts: t.checkouts + r.checkouts, orders: t.orders + r.orders, sales: t.sales + r.sales, revenue: t.revenue + r.revenue,
    }), { visits: 0, checkouts: 0, orders: 0, sales: 0, revenue: 0 });
    return { rows, totals, unknown };
}
