// ==============================
// TrafficAI — Relatório de vendas (estilo UTMify)
// Cruza pedidos (tracking_orders) com gasto da Meta: campanha vem do banco
// (insights_history, já sincronizado); conjunto/anúncio vêm ao vivo da Meta
// Insights API (não guardamos gasto por conjunto/anúncio localmente).
// Datas sempre no fuso de Brasília — mesmo "dia" que o gestor vê.
// ==============================

import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { parseUtmId } from './utm';

const META_VERSION = 'v21.0';
const TZ = 'America/Sao_Paulo';
const ORDER_DATE = `(COALESCE(o.approved_at, o.order_created_at, o.created_at) AT TIME ZONE '${TZ}')`;

export type ReportGroup =
    | 'campaign' | 'adset' | 'ad'
    | 'utm_source' | 'utm_campaign' | 'utm_medium' | 'utm_content' | 'utm_term'
    | 'day' | 'product';

export interface ReportRow {
    key: string;
    name: string;
    meta_id: string | null;
    status: string | null;
    budget: number | null;
    sales: number;
    revenue: number;
    spend: number;
    cpa: number | null;
    roas: number | null;
    profit: number;
    margin: number | null;
    roi: number | null;
    pending_count: number;
    pending_value: number;
    refunded_count: number;
}

interface SourceCtx {
    id: string;
    user_id: string;
    account_id: string | null;
    meta_account_id: string | null;
}

// Receita = líquido quando a plataforma informa (o que realmente entra no
// caixa, igual ao "Faturamento Líquido" da UTMify); senão bruto.
const REVENUE = `COALESCE(o.net_value, o.gross_value, 0)`;

function ratio(num: number, den: number): number | null {
    return den > 0 ? num / den : null;
}

function buildRow(base: Partial<ReportRow> & { key: string; name: string }): ReportRow {
    const sales = base.sales || 0;
    const revenue = base.revenue || 0;
    const spend = base.spend || 0;
    const profit = revenue - spend;
    return {
        key: base.key,
        name: base.name,
        meta_id: base.meta_id ?? null,
        status: base.status ?? null,
        budget: base.budget ?? null,
        sales, revenue, spend,
        cpa: ratio(spend, sales),
        roas: ratio(revenue, spend),
        profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : null,
        roi: ratio(profit, spend),
        pending_count: base.pending_count || 0,
        pending_value: base.pending_value || 0,
        refunded_count: base.refunded_count || 0,
    };
}

async function getUserAdsToken(userId: string): Promise<string | null> {
    try {
        const { authRepository } = await import('../auth/auth.repository');
        const user = await authRepository.findById(userId);
        return user?.access_token || null;
    } catch {
        return null;
    }
}

/** Gasto por conjunto ou anúncio no período, direto da Meta (paginado). */
async function fetchMetaSpend(
    token: string, metaAccountId: string, level: 'adset' | 'ad', since: string, until: string
): Promise<Map<string, { name: string; spend: number; campaign_name: string | null }>> {
    const act = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
    const idField = level === 'adset' ? 'adset_id' : 'ad_id';
    const nameField = level === 'adset' ? 'adset_name' : 'ad_name';
    const out = new Map<string, { name: string; spend: number; campaign_name: string | null }>();
    let url: string | null = `https://graph.facebook.com/${META_VERSION}/${act}/insights`;
    let params: any = {
        level,
        fields: `${idField},${nameField},campaign_name,spend`,
        time_range: JSON.stringify({ since, until }),
        limit: 500,
        access_token: token,
    };
    try {
        for (let page = 0; url && page < 20; page++) {
            const r: any = await axios.get(url, { params, timeout: 30000 });
            for (const row of r.data?.data || []) {
                out.set(String(row[idField]), {
                    name: row[nameField] || String(row[idField]),
                    spend: Number(row.spend) || 0,
                    campaign_name: row.campaign_name || null,
                });
            }
            url = r.data?.paging?.next || null;
            params = undefined; // a URL de "next" já vem com todos os params
        }
    } catch (err: any) {
        logger.warn('sales-report: falha ao buscar gasto na Meta', { level, error: err.response?.data?.error?.message || err.message });
    }
    return out;
}

async function campaignSpendMap(accountId: string, since: string, until: string) {
    const rows = await query<{ meta_campaign_id: string; name: string; status: string | null; daily_budget: string | null; spend: string }>(
        `SELECT c.meta_campaign_id, c.name, c.status, c.daily_budget, COALESCE(SUM(ih.spend), 0) AS spend
         FROM campaigns c
         LEFT JOIN insights_history ih ON ih.campaign_id = c.id AND ih.date BETWEEN $2 AND $3
         WHERE c.account_id = $1
         GROUP BY c.meta_campaign_id, c.name, c.status, c.daily_budget`,
        [accountId, since, until]
    );
    const map = new Map<string, { name: string; status: string | null; budget: number | null; spend: number }>();
    for (const r of rows) {
        map.set(r.meta_campaign_id, {
            name: r.name, status: r.status,
            budget: r.daily_budget != null ? Number(r.daily_budget) : null,
            spend: Number(r.spend) || 0,
        });
    }
    return map;
}

interface OrderAgg {
    k: string | null;
    sales: string;
    revenue: string;
    pending_count: string;
    pending_value: string;
    refunded_count: string;
}

async function aggregateOrders(sourceId: string, since: string, until: string, groupExpr: string): Promise<OrderAgg[]> {
    return query<OrderAgg>(
        `SELECT ${groupExpr} AS k,
                COUNT(*) FILTER (WHERE o.status = 'approved') AS sales,
                COALESCE(SUM(${REVENUE}) FILTER (WHERE o.status = 'approved'), 0) AS revenue,
                COUNT(*) FILTER (WHERE o.status = 'pending') AS pending_count,
                COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'pending'), 0) AS pending_value,
                COUNT(*) FILTER (WHERE o.status IN ('refunded', 'chargeback')) AS refunded_count
         FROM tracking_orders o
         WHERE o.source_id = $1 AND ${ORDER_DATE}::date BETWEEN $2 AND $3
         GROUP BY 1`,
        [sourceId, since, until]
    );
}

function aggToPartial(a: OrderAgg) {
    return {
        sales: Number(a.sales) || 0,
        revenue: Number(a.revenue) || 0,
        pending_count: Number(a.pending_count) || 0,
        pending_value: Number(a.pending_value) || 0,
        refunded_count: Number(a.refunded_count) || 0,
    };
}

export async function buildGroupedRows(source: SourceCtx, group: ReportGroup, since: string, until: string): Promise<ReportRow[]> {
    const NONE = '(sem atribuição)';

    if (group === 'campaign') {
        const agg = await aggregateOrders(source.id, since, until, 'o.meta_campaign_id');
        const spend = source.account_id ? await campaignSpendMap(source.account_id, since, until) : new Map();
        const keys = new Set<string>([...agg.map(a => a.k || NONE), ...[...spend.entries()].filter(([, v]) => v.spend > 0).map(([k]) => k)]);
        return [...keys].map(k => {
            const a = agg.find(x => (x.k || NONE) === k);
            const s = spend.get(k);
            return buildRow({
                key: k, meta_id: k === NONE ? null : k,
                name: s?.name || (k === NONE ? NONE : `Campanha ${k}`),
                status: s?.status || null, budget: s?.budget ?? null, spend: s?.spend || 0,
                ...(a ? aggToPartial(a) : {}),
            });
        }).sort((x, y) => y.spend - x.spend || y.revenue - x.revenue);
    }

    if (group === 'adset' || group === 'ad') {
        const col = group === 'adset' ? 'o.meta_adset_id' : 'o.meta_ad_id';
        const agg = await aggregateOrders(source.id, since, until, col);
        let spend = new Map<string, { name: string; spend: number; campaign_name: string | null }>();
        if (source.meta_account_id) {
            const token = await getUserAdsToken(source.user_id);
            if (token) spend = await fetchMetaSpend(token, source.meta_account_id, group, since, until);
        }
        const keys = new Set<string>([...agg.map(a => a.k || NONE), ...[...spend.entries()].filter(([, v]) => v.spend > 0).map(([k]) => k)]);
        return [...keys].map(k => {
            const a = agg.find(x => (x.k || NONE) === k);
            const s = spend.get(k);
            return buildRow({
                key: k, meta_id: k === NONE ? null : k,
                name: s ? (s.campaign_name ? `${s.name} · ${s.campaign_name}` : s.name) : (k === NONE ? NONE : k),
                spend: s?.spend || 0,
                ...(a ? aggToPartial(a) : {}),
            });
        }).sort((x, y) => y.spend - x.spend || y.revenue - x.revenue);
    }

    if (group === 'day') {
        const agg = await aggregateOrders(source.id, since, until, `to_char(${ORDER_DATE}::date, 'YYYY-MM-DD')`);
        const spendRows = source.account_id ? await query<{ d: string; spend: string }>(
            `SELECT to_char(ih.date, 'YYYY-MM-DD') AS d, COALESCE(SUM(ih.spend), 0) AS spend
             FROM insights_history ih JOIN campaigns c ON c.id = ih.campaign_id
             WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3
             GROUP BY 1`,
            [source.account_id, since, until]
        ) : [];
        const out: ReportRow[] = [];
        const start = new Date(`${since}T12:00:00Z`);
        const end = new Date(`${until}T12:00:00Z`);
        for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
            const key = d.toISOString().slice(0, 10);
            const a = agg.find(x => x.k === key);
            const s = spendRows.find(x => x.d === key);
            out.push(buildRow({ key, name: key, spend: Number(s?.spend) || 0, ...(a ? aggToPartial(a) : {}) }));
        }
        return out;
    }

    if (group === 'product') {
        const agg = await aggregateOrders(source.id, since, until, 'o.product_name');
        return agg.map(a => buildRow({ key: a.k || NONE, name: a.k || '(sem produto)', ...aggToPartial(a) }))
            .sort((x, y) => y.revenue - x.revenue);
    }

    // utm_*: agrupa pelo valor cru; quando o valor segue "nome|id", mostra o
    // nome e soma o gasto do nível correspondente (campanha/conjunto/anúncio).
    const agg = await aggregateOrders(source.id, since, until, `o.${group}`);
    let levelSpend = new Map<string, number>();
    if (group === 'utm_campaign' && source.account_id) {
        const m = await campaignSpendMap(source.account_id, since, until);
        levelSpend = new Map([...m.entries()].map(([k, v]) => [k, v.spend]));
    } else if ((group === 'utm_medium' || group === 'utm_content') && source.meta_account_id) {
        const token = await getUserAdsToken(source.user_id);
        if (token) {
            const m = await fetchMetaSpend(token, source.meta_account_id, group === 'utm_medium' ? 'adset' : 'ad', since, until);
            levelSpend = new Map([...m.entries()].map(([k, v]) => [k, v.spend]));
        }
    }
    return agg.map(a => {
        const parsed = parseUtmId(a.k);
        return buildRow({
            key: a.k || NONE,
            name: parsed.name || a.k || NONE,
            meta_id: parsed.id,
            spend: parsed.id ? (levelSpend.get(parsed.id) || 0) : 0,
            ...aggToPartial(a),
        });
    }).sort((x, y) => y.revenue - x.revenue);
}

export async function buildSummary(source: SourceCtx, since: string, until: string) {
    const [tot] = await query<any>(
        `SELECT
            COUNT(*) FILTER (WHERE o.status = 'approved') AS approved_count,
            COALESCE(SUM(${REVENUE}) FILTER (WHERE o.status = 'approved'), 0) AS revenue_net,
            COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'approved'), 0) AS revenue_gross,
            COUNT(*) FILTER (WHERE o.status = 'pending') AS pending_count,
            COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'pending'), 0) AS pending_value,
            COUNT(*) FILTER (WHERE o.status = 'refunded') AS refunded_count,
            COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'refunded'), 0) AS refunded_value,
            COUNT(*) FILTER (WHERE o.status = 'chargeback') AS chargeback_count,
            COUNT(*) AS total_orders
         FROM tracking_orders o
         WHERE o.source_id = $1 AND ${ORDER_DATE}::date BETWEEN $2 AND $3`,
        [source.id, since, until]
    );

    let spend = 0;
    if (source.account_id) {
        const [s] = await query<{ spend: string }>(
            `SELECT COALESCE(SUM(ih.spend), 0) AS spend
             FROM insights_history ih JOIN campaigns c ON c.id = ih.campaign_id
             WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3`,
            [source.account_id, since, until]
        );
        spend = Number(s?.spend) || 0;
    }

    const byPayment = await query<any>(
        `SELECT COALESCE(o.payment_method, 'other') AS method,
                COUNT(*) FILTER (WHERE o.status = 'approved') AS approved_count,
                COALESCE(SUM(${REVENUE}) FILTER (WHERE o.status = 'approved'), 0) AS approved_value,
                COUNT(*) FILTER (WHERE o.status IN ('approved', 'refused', 'pending', 'refunded', 'chargeback')) AS total_count
         FROM tracking_orders o
         WHERE o.source_id = $1 AND ${ORDER_DATE}::date BETWEEN $2 AND $3
         GROUP BY 1`,
        [source.id, since, until]
    );

    const byProduct = await query<any>(
        `SELECT COALESCE(o.product_name, '(sem produto)') AS product, COUNT(*) AS count, COALESCE(SUM(${REVENUE}), 0) AS value
         FROM tracking_orders o
         WHERE o.source_id = $1 AND o.status = 'approved' AND ${ORDER_DATE}::date BETWEEN $2 AND $3
         GROUP BY 1 ORDER BY count DESC LIMIT 20`,
        [source.id, since, until]
    );

    const bySource = await query<any>(
        `SELECT COALESCE(NULLIF(o.utm_source, ''), 'N/A') AS source, COUNT(*) AS count
         FROM tracking_orders o
         WHERE o.source_id = $1 AND o.status = 'approved' AND ${ORDER_DATE}::date BETWEEN $2 AND $3
         GROUP BY 1 ORDER BY count DESC LIMIT 20`,
        [source.id, since, until]
    );

    const byHour = await query<any>(
        `SELECT EXTRACT(HOUR FROM ${ORDER_DATE})::int AS hour, COUNT(*) AS count
         FROM tracking_orders o
         WHERE o.source_id = $1 AND o.status = 'approved' AND ${ORDER_DATE}::date BETWEEN $2 AND $3
         GROUP BY 1`,
        [source.id, since, until]
    );

    // Funil: cliques (tracking_clicks) → PageView → InitiateCheckout (pixel) →
    // pedidos iniciados → aprovados. Mesmas etapas do funil da UTMify.
    const [funnelEv] = await query<any>(
        `SELECT
            COUNT(*) FILTER (WHERE event_name = 'PageView') AS page_views,
            COUNT(*) FILTER (WHERE event_name = 'InitiateCheckout') AS initiate_checkout
         FROM tracking_events
         WHERE source_id = $1 AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN $2 AND $3`,
        [source.id, since, until]
    );
    const [clicks] = await query<any>(
        `SELECT COUNT(*) AS clicks FROM tracking_clicks
         WHERE source_id = $1 AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN $2 AND $3`,
        [source.id, since, until]
    );

    const approved = Number(tot.approved_count) || 0;
    const revenueNet = Number(tot.revenue_net) || 0;
    const profit = revenueNet - spend;
    const totalOrders = Number(tot.total_orders) || 0;
    const approvedTotal = byPayment.reduce((n: number, p: any) => n + (Number(p.approved_count) || 0), 0);
    const hours = Array.from({ length: 24 }, (_, h) => {
        const c = Number(byHour.find((x: any) => x.hour === h)?.count) || 0;
        return { hour: h, count: c, pct: approved > 0 ? (c / approved) * 100 : 0 };
    });

    return {
        revenue_net: revenueNet,
        revenue_gross: Number(tot.revenue_gross) || 0,
        spend,
        profit,
        roas: ratio(revenueNet, spend),
        roi: ratio(profit, spend),
        margin: revenueNet > 0 ? (profit / revenueNet) * 100 : null,
        cpa: ratio(spend, approved),
        ticket: ratio(revenueNet, approved),
        approved_count: approved,
        pending_count: Number(tot.pending_count) || 0,
        pending_value: Number(tot.pending_value) || 0,
        refunded_count: Number(tot.refunded_count) || 0,
        refunded_value: Number(tot.refunded_value) || 0,
        chargeback_count: Number(tot.chargeback_count) || 0,
        chargeback_rate: approved > 0 ? (Number(tot.chargeback_count) / approved) * 100 : 0,
        total_orders: totalOrders,
        by_payment: byPayment.map((p: any) => ({
            method: p.method,
            approved_count: Number(p.approved_count) || 0,
            approved_value: Number(p.approved_value) || 0,
            share: approvedTotal > 0 ? ((Number(p.approved_count) || 0) / approvedTotal) * 100 : 0,
            approval_rate: Number(p.total_count) > 0 ? ((Number(p.approved_count) || 0) / Number(p.total_count)) * 100 : null,
        })),
        by_product: byProduct.map((p: any) => ({
            product: p.product, count: Number(p.count) || 0, value: Number(p.value) || 0,
            pct: approved > 0 ? (Number(p.count) / approved) * 100 : 0,
        })),
        by_source: bySource.map((s: any) => ({
            source: s.source, count: Number(s.count) || 0,
            pct: approved > 0 ? (Number(s.count) / approved) * 100 : 0,
        })),
        by_hour: hours,
        funnel: {
            clicks: Number(clicks?.clicks) || 0,
            page_views: Number(funnelEv?.page_views) || 0,
            initiate_checkout: Number(funnelEv?.initiate_checkout) || 0,
            orders: totalOrders,
            approved,
        },
    };
}
