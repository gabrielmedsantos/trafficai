// ==============================
// TrafficAI — Relatório de vendas (estilo UTMify)
// Cruza pedidos (tracking_orders) com a Meta: gasto, status e orçamento de
// campanha/conjunto/anúncio vêm ao vivo da Marketing API (cache curto); se a
// Meta falhar, campanha cai pro insights_history local.
// Lucro = faturamento líquido − gastos − imposto − custo de produto − despesas.
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

export type MetaLevel = 'campaign' | 'adset' | 'ad';

export interface SalesNotifySettings {
    approved: boolean;
    pix: boolean;
    boleto: boolean;
    abandoned: boolean;
    refused: boolean;
    push: boolean;
    whatsapp: boolean;
}

export interface SalesSettings {
    tax_rate: number;
    product_costs: Record<string, number>;
    purchase_value: 'gross' | 'net';
    purchase_products: string[];
    notify: SalesNotifySettings;
}

const NOTIFY_DEFAULTS: SalesNotifySettings = { approved: true, pix: true, boleto: false, abandoned: false, refused: false, push: true, whatsapp: false };

export function normalizeSalesSettings(raw: any): SalesSettings {
    const r = raw && typeof raw === 'object' ? raw : {};
    const costs: Record<string, number> = {};
    if (r.product_costs && typeof r.product_costs === 'object') {
        for (const [k, v] of Object.entries(r.product_costs)) {
            const n = Number(v);
            if (k.trim() && Number.isFinite(n) && n >= 0) costs[k.trim()] = n;
        }
    }
    const tax = Number(r.tax_rate);
    return {
        tax_rate: Number.isFinite(tax) && tax >= 0 && tax <= 100 ? tax : 0,
        product_costs: costs,
        purchase_value: r.purchase_value === 'net' ? 'net' : 'gross',
        purchase_products: Array.isArray(r.purchase_products)
            ? r.purchase_products.map((p: any) => String(p).trim()).filter(Boolean)
            : [],
        notify: Object.fromEntries(
            (Object.keys(NOTIFY_DEFAULTS) as (keyof SalesNotifySettings)[]).map(k => [
                k, typeof r.notify?.[k] === 'boolean' ? r.notify[k] : NOTIFY_DEFAULTS[k],
            ])
        ) as unknown as SalesNotifySettings,
    };
}

export interface ReportRow {
    key: string;
    name: string;
    parent_name: string | null;
    meta_id: string | null;
    status: string | null;
    effective_status: string | null;
    budget: number | null;
    budget_type: 'daily' | 'lifetime' | null;
    sales: number;
    revenue: number;
    spend: number;
    costs: number;
    cpa: number | null;
    roas: number | null;
    profit: number;
    margin: number | null;
    roi: number | null;
    pending_count: number;
    pending_value: number;
    refunded_count: number;
    impressions: number | null;
    clicks: number | null;
    ctr: number | null;
    cpc: number | null;
    cpm: number | null;
}

export interface SourceCtx {
    id: string;
    user_id: string;
    account_id: string | null;
    meta_account_id: string | null;
    sales_settings?: any;
}

// Receita = líquido quando a plataforma informa (o que realmente entra no
// caixa, igual ao "Faturamento Líquido" da UTMify); senão bruto.
const REVENUE = `COALESCE(o.net_value, o.gross_value, 0)`;

function ratio(num: number, den: number): number | null {
    return den > 0 ? num / den : null;
}

type RowInput = Partial<ReportRow> & { key: string; name: string; product_cost?: number };

function buildRow(base: RowInput, taxRate: number): ReportRow {
    const sales = base.sales || 0;
    const revenue = base.revenue || 0;
    const spend = base.spend || 0;
    const costs = (base.product_cost || 0) + revenue * (taxRate / 100);
    const profit = revenue - spend - costs;
    const impressions = base.impressions ?? null;
    const clicks = base.clicks ?? null;
    return {
        key: base.key,
        name: base.name,
        parent_name: base.parent_name ?? null,
        meta_id: base.meta_id ?? null,
        status: base.status ?? null,
        effective_status: base.effective_status ?? null,
        budget: base.budget ?? null,
        budget_type: base.budget_type ?? null,
        sales, revenue, spend, costs,
        cpa: ratio(spend, sales),
        roas: ratio(revenue, spend),
        profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : null,
        roi: ratio(profit, spend + costs),
        pending_count: base.pending_count || 0,
        pending_value: base.pending_value || 0,
        refunded_count: base.refunded_count || 0,
        impressions, clicks,
        ctr: impressions && clicks != null ? (clicks / impressions) * 100 : null,
        cpc: clicks ? spend / clicks : null,
        cpm: impressions ? (spend / impressions) * 1000 : null,
    };
}

export async function getUserAdsToken(userId: string): Promise<string | null> {
    try {
        const { authRepository } = await import('../auth/auth.repository');
        const user = await authRepository.findById(userId);
        return user?.access_token || null;
    } catch {
        return null;
    }
}

export function actId(metaAccountId: string): string {
    return metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
}

// ── Meta ao vivo ────────────────────────────────────────────────────────

interface MetaObj {
    id: string;
    name: string;
    parent_name: string | null;
    status: string | null;
    effective_status: string | null;
    daily_budget: number | null;
    lifetime_budget: number | null;
    spend: number;
    impressions: number;
    clicks: number;
}

// Cache curto: trocar de aba/ordenar não pode virar rajada na Marketing API.
const metaCache = new Map<string, { at: number; data: Map<string, MetaObj> }>();
const META_CACHE_MS = 90_000;

export function invalidateMetaCache(metaAccountId: string) {
    const prefix = actId(metaAccountId);
    for (const k of metaCache.keys()) if (k.startsWith(prefix)) metaCache.delete(k);
}

async function metaPaged(url: string, params: any, maxPages: number): Promise<any[]> {
    const out: any[] = [];
    let next: string | null = url;
    let p: any = params;
    for (let page = 0; next && page < maxPages; page++) {
        const r: any = await axios.get(next, { params: p, timeout: 30000 });
        out.push(...(r.data?.data || []));
        next = r.data?.paging?.next || null;
        p = undefined; // a URL de "next" já vem com todos os params
    }
    return out;
}

const minor = (v: any) => (v != null && v !== '' && Number(v) > 0 ? Number(v) / 100 : null);

/**
 * Campanhas/conjuntos/anúncios da conta com gasto no período + status e
 * orçamento atuais. null quando a Meta falha (chamador decide o fallback).
 */
async function fetchMetaLevel(
    token: string, metaAccountId: string, level: MetaLevel, since: string, until: string
): Promise<Map<string, MetaObj> | null> {
    const act = actId(metaAccountId);
    const cacheKey = `${act}:${level}:${since}:${until}`;
    const hit = metaCache.get(cacheKey);
    if (hit && Date.now() - hit.at < META_CACHE_MS) return hit.data;

    const base = `https://graph.facebook.com/${META_VERSION}`;
    const idField = `${level}_id`;
    const nameField = `${level}_name`;
    const parentField = level === 'campaign' ? null : level === 'adset' ? 'campaign_name' : 'adset_name';
    const edge = level === 'campaign' ? 'campaigns' : level === 'adset' ? 'adsets' : 'ads';
    const objFields = ['id', 'name', 'status', 'effective_status'];
    if (level !== 'ad') objFields.push('daily_budget', 'lifetime_budget');
    if (level === 'adset') objFields.push('campaign{name}');
    if (level === 'ad') objFields.push('adset{name}');

    try {
        const [insights, objects] = await Promise.all([
            metaPaged(`${base}/${act}/insights`, {
                level,
                fields: [idField, nameField, parentField, 'spend', 'impressions', 'inline_link_clicks'].filter(Boolean).join(','),
                time_range: JSON.stringify({ since, until }),
                limit: 500,
                access_token: token,
            }, 20),
            metaPaged(`${base}/${act}/${edge}`, {
                fields: objFields.join(','),
                filtering: JSON.stringify([{
                    field: 'effective_status', operator: 'IN',
                    value: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW'],
                }]),
                limit: 500,
                access_token: token,
            }, 10),
        ]);

        const map = new Map<string, MetaObj>();
        for (const o of objects) {
            map.set(String(o.id), {
                id: String(o.id),
                name: o.name || String(o.id),
                parent_name: o.campaign?.name || o.adset?.name || null,
                status: o.status || null,
                effective_status: o.effective_status || null,
                daily_budget: minor(o.daily_budget),
                lifetime_budget: minor(o.lifetime_budget),
                spend: 0, impressions: 0, clicks: 0,
            });
        }
        for (const row of insights) {
            const id = String(row[idField]);
            const cur = map.get(id) || {
                id, name: row[nameField] || id, parent_name: parentField ? row[parentField] || null : null,
                status: null, effective_status: null, daily_budget: null, lifetime_budget: null,
                spend: 0, impressions: 0, clicks: 0,
            };
            cur.spend = Number(row.spend) || 0;
            cur.impressions = Number(row.impressions) || 0;
            cur.clicks = Number(row.inline_link_clicks) || 0;
            if (!cur.parent_name && parentField) cur.parent_name = row[parentField] || null;
            map.set(id, cur);
        }
        metaCache.set(cacheKey, { at: Date.now(), data: map });
        return map;
    } catch (err: any) {
        logger.warn('sales-report: falha ao buscar dados na Meta', { level, error: err.response?.data?.error?.message || err.message });
        return null;
    }
}

async function fetchAccountSpend(token: string, metaAccountId: string, since: string, until: string): Promise<number | null> {
    try {
        const r: any = await axios.get(`https://graph.facebook.com/${META_VERSION}/${actId(metaAccountId)}/insights`, {
            params: { level: 'account', fields: 'spend', time_range: JSON.stringify({ since, until }), access_token: token },
            timeout: 30000,
        });
        const row = r.data?.data?.[0];
        return row ? Number(row.spend) || 0 : 0;
    } catch (err: any) {
        logger.warn('sales-report: gasto da conta na Meta falhou', { error: err.response?.data?.error?.message || err.message });
        return null;
    }
}

async function campaignSpendFromDb(accountId: string, since: string, until: string): Promise<Map<string, MetaObj>> {
    const rows = await query<any>(
        `SELECT c.meta_campaign_id, c.name, c.status, c.daily_budget, COALESCE(SUM(ih.spend), 0) AS spend,
                COALESCE(SUM(ih.impressions), 0) AS impressions, COALESCE(SUM(ih.clicks), 0) AS clicks
         FROM campaigns c
         LEFT JOIN insights_history ih ON ih.campaign_id = c.id AND ih.date BETWEEN $2 AND $3
         WHERE c.account_id = $1
         GROUP BY c.meta_campaign_id, c.name, c.status, c.daily_budget`,
        [accountId, since, until]
    );
    const map = new Map<string, MetaObj>();
    for (const r of rows) {
        map.set(r.meta_campaign_id, {
            id: r.meta_campaign_id, name: r.name, parent_name: null,
            status: r.status, effective_status: r.status,
            daily_budget: r.daily_budget != null ? Number(r.daily_budget) : null, lifetime_budget: null,
            spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0,
        });
    }
    return map;
}

async function levelData(source: SourceCtx, level: MetaLevel, since: string, until: string): Promise<{ map: Map<string, MetaObj>; live: boolean }> {
    if (source.meta_account_id) {
        const token = await getUserAdsToken(source.user_id);
        if (token) {
            const m = await fetchMetaLevel(token, source.meta_account_id, level, since, until);
            if (m) return { map: m, live: true };
        }
    }
    if (level === 'campaign' && source.account_id) {
        return { map: await campaignSpendFromDb(source.account_id, since, until), live: false };
    }
    return { map: new Map(), live: false };
}

// ── Pedidos ─────────────────────────────────────────────────────────────

interface OrderAgg {
    k: string | null;
    sales: string;
    revenue: string;
    product_cost: string;
    pending_count: string;
    pending_value: string;
    refunded_count: string;
}

async function aggregateOrders(sourceId: string, since: string, until: string, groupExpr: string, settings: SalesSettings): Promise<OrderAgg[]> {
    return query<OrderAgg>(
        `SELECT ${groupExpr} AS k,
                COUNT(*) FILTER (WHERE o.status = 'approved') AS sales,
                COALESCE(SUM(${REVENUE}) FILTER (WHERE o.status = 'approved'), 0) AS revenue,
                COALESCE(SUM(COALESCE(($4::jsonb ->> o.product_name)::numeric, 0)) FILTER (WHERE o.status = 'approved'), 0) AS product_cost,
                COUNT(*) FILTER (WHERE o.status = 'pending') AS pending_count,
                COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'pending'), 0) AS pending_value,
                COUNT(*) FILTER (WHERE o.status IN ('refunded', 'chargeback')) AS refunded_count
         FROM tracking_orders o
         WHERE o.source_id = $1 AND ${ORDER_DATE}::date BETWEEN $2 AND $3
         GROUP BY 1`,
        [sourceId, since, until, JSON.stringify(settings.product_costs)]
    );
}

function aggToPartial(a: OrderAgg) {
    return {
        sales: Number(a.sales) || 0,
        revenue: Number(a.revenue) || 0,
        product_cost: Number(a.product_cost) || 0,
        pending_count: Number(a.pending_count) || 0,
        pending_value: Number(a.pending_value) || 0,
        refunded_count: Number(a.refunded_count) || 0,
    };
}

function metaPartial(s: MetaObj | undefined) {
    if (!s) return {};
    return {
        name: s.name,
        parent_name: s.parent_name,
        status: s.status,
        effective_status: s.effective_status,
        budget: s.daily_budget ?? s.lifetime_budget,
        budget_type: s.daily_budget ? 'daily' as const : s.lifetime_budget ? 'lifetime' as const : null,
        spend: s.spend,
        impressions: s.impressions,
        clicks: s.clicks,
    };
}

export async function buildGroupedRows(source: SourceCtx, group: ReportGroup, since: string, until: string): Promise<{ rows: ReportRow[]; live: boolean }> {
    const NONE = '(sem atribuição)';
    const settings = normalizeSalesSettings(source.sales_settings);
    const tax = settings.tax_rate;

    if (group === 'campaign' || group === 'adset' || group === 'ad') {
        const col = group === 'campaign' ? 'o.meta_campaign_id' : group === 'adset' ? 'o.meta_adset_id' : 'o.meta_ad_id';
        const [agg, { map, live }] = await Promise.all([
            aggregateOrders(source.id, since, until, col, settings),
            levelData(source, group, since, until),
        ]);
        // Mesmo critério da UTMify: tudo que está ativo agora + o que gastou
        // ou vendeu no período (mesmo pausado/arquivado).
        const keys = new Set<string>([
            ...agg.map(a => a.k || NONE),
            ...[...map.values()].filter(v => v.spend > 0 || v.effective_status === 'ACTIVE').map(v => v.id),
        ]);
        const rows = [...keys].map(k => {
            const a = agg.find(x => (x.k || NONE) === k);
            const s = map.get(k);
            const label = group === 'campaign' ? 'Campanha' : group === 'adset' ? 'Conjunto' : 'Anúncio';
            return buildRow({
                key: k, meta_id: k === NONE ? null : k,
                name: k === NONE ? NONE : `${label} ${k}`,
                ...metaPartial(s),
                ...(a ? aggToPartial(a) : {}),
            }, tax);
        }).sort((x, y) => y.spend - x.spend || y.revenue - x.revenue);
        return { rows, live };
    }

    if (group === 'day') {
        const agg = await aggregateOrders(source.id, since, until, `to_char(${ORDER_DATE}::date, 'YYYY-MM-DD')`, settings);
        let spendByDay = new Map<string, { spend: number; impressions: number; clicks: number }>();
        let live = false;
        const token = source.meta_account_id ? await getUserAdsToken(source.user_id) : null;
        if (token && source.meta_account_id) {
            try {
                const rows = await metaPaged(`https://graph.facebook.com/${META_VERSION}/${actId(source.meta_account_id)}/insights`, {
                    level: 'account', fields: 'spend,impressions,inline_link_clicks', time_increment: 1,
                    time_range: JSON.stringify({ since, until }), limit: 500, access_token: token,
                }, 5);
                spendByDay = new Map(rows.map((r: any) => [r.date_start, {
                    spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.inline_link_clicks) || 0,
                }]));
                live = true;
            } catch (err: any) {
                logger.warn('sales-report: gasto diário na Meta falhou', { error: err.response?.data?.error?.message || err.message });
            }
        }
        if (!live && source.account_id) {
            const rows = await query<any>(
                `SELECT to_char(ih.date, 'YYYY-MM-DD') AS d, COALESCE(SUM(ih.spend), 0) AS spend,
                        COALESCE(SUM(ih.impressions), 0) AS impressions, COALESCE(SUM(ih.clicks), 0) AS clicks
                 FROM insights_history ih JOIN campaigns c ON c.id = ih.campaign_id
                 WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3
                 GROUP BY 1`,
                [source.account_id, since, until]
            );
            spendByDay = new Map(rows.map((r: any) => [r.d, { spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0 }]));
        }
        const expenses = await query<any>(
            `SELECT to_char(expense_date, 'YYYY-MM-DD') AS d, SUM(amount) AS total
             FROM tracking_expenses WHERE source_id = $1 AND expense_date BETWEEN $2 AND $3 GROUP BY 1`,
            [source.id, since, until]
        );
        const out: ReportRow[] = [];
        const start = new Date(`${since}T12:00:00Z`);
        const end = new Date(`${until}T12:00:00Z`);
        for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
            const key = d.toISOString().slice(0, 10);
            const a = agg.find(x => x.k === key);
            const s = spendByDay.get(key);
            const exp = Number(expenses.find((x: any) => x.d === key)?.total) || 0;
            const p = a ? aggToPartial(a) : { product_cost: 0 };
            out.push(buildRow({
                key, name: key, spend: s?.spend || 0, impressions: s?.impressions ?? null, clicks: s?.clicks ?? null,
                ...p, product_cost: (p.product_cost || 0) + exp,
            }, tax));
        }
        return { rows: out, live };
    }

    if (group === 'product') {
        const agg = await aggregateOrders(source.id, since, until, 'o.product_name', settings);
        return {
            rows: agg.map(a => buildRow({ key: a.k || NONE, name: a.k || '(sem produto)', ...aggToPartial(a) }, tax))
                .sort((x, y) => y.revenue - x.revenue),
            live: false,
        };
    }

    // utm_*: agrupa pelo valor cru; quando o valor segue "nome|id", mostra o
    // nome e soma o gasto do nível correspondente (campanha/conjunto/anúncio).
    const agg = await aggregateOrders(source.id, since, until, `o.${group}`, settings);
    const level: MetaLevel | null = group === 'utm_campaign' ? 'campaign' : group === 'utm_medium' ? 'adset' : group === 'utm_content' ? 'ad' : null;
    const { map, live } = level ? await levelData(source, level, since, until) : { map: new Map<string, MetaObj>(), live: false };
    return {
        rows: agg.map(a => {
            const parsed = parseUtmId(a.k);
            const s = parsed.id ? map.get(parsed.id) : undefined;
            return buildRow({
                key: a.k || NONE,
                name: parsed.name || a.k || NONE,
                meta_id: parsed.id,
                spend: s?.spend || 0,
                impressions: s?.impressions ?? null,
                clicks: s?.clicks ?? null,
                status: s?.status ?? null,
                effective_status: s?.effective_status ?? null,
                ...aggToPartial(a),
            }, tax);
        }).sort((x, y) => y.revenue - x.revenue),
        live,
    };
}

export async function buildSummary(source: SourceCtx, since: string, until: string) {
    const settings = normalizeSalesSettings(source.sales_settings);
    const [tot] = await query<any>(
        `SELECT
            COUNT(*) FILTER (WHERE o.status = 'approved') AS approved_count,
            COALESCE(SUM(${REVENUE}) FILTER (WHERE o.status = 'approved'), 0) AS revenue_net,
            COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'approved'), 0) AS revenue_gross,
            COALESCE(SUM(COALESCE(($4::jsonb ->> o.product_name)::numeric, 0)) FILTER (WHERE o.status = 'approved'), 0) AS product_cost,
            COUNT(*) FILTER (WHERE o.status = 'pending') AS pending_count,
            COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'pending'), 0) AS pending_value,
            COUNT(*) FILTER (WHERE o.status = 'refused') AS refused_count,
            COUNT(*) FILTER (WHERE o.status = 'refunded') AS refunded_count,
            COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'refunded'), 0) AS refunded_value,
            COUNT(*) FILTER (WHERE o.status = 'chargeback') AS chargeback_count,
            COALESCE(SUM(COALESCE(o.gross_value, o.net_value, 0)) FILTER (WHERE o.status = 'chargeback'), 0) AS chargeback_value,
            COUNT(*) FILTER (WHERE o.status <> 'abandoned') AS total_orders,
            COUNT(*) FILTER (WHERE o.status = 'abandoned') AS abandoned_count,
            COUNT(*) FILTER (WHERE o.status IN ('abandoned', 'pending', 'refused') AND o.recovered_order_id IS NOT NULL) AS recovered_count,
            COUNT(*) FILTER (WHERE o.status IN ('abandoned', 'pending', 'refused')) AS recoverable_count
         FROM tracking_orders o
         WHERE o.source_id = $1 AND ${ORDER_DATE}::date BETWEEN $2 AND $3`,
        [source.id, since, until, JSON.stringify(settings.product_costs)]
    );

    let spend: number | null = null;
    let spendLive = false;
    if (source.meta_account_id) {
        const token = await getUserAdsToken(source.user_id);
        if (token) {
            spend = await fetchAccountSpend(token, source.meta_account_id, since, until);
            spendLive = spend != null;
        }
    }
    if (spend == null && source.account_id) {
        const [s] = await query<{ spend: string }>(
            `SELECT COALESCE(SUM(ih.spend), 0) AS spend
             FROM insights_history ih JOIN campaigns c ON c.id = ih.campaign_id
             WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3`,
            [source.account_id, since, until]
        );
        spend = Number(s?.spend) || 0;
    }
    spend = spend || 0;

    const [exp] = await query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM tracking_expenses WHERE source_id = $1 AND expense_date BETWEEN $2 AND $3`,
        [source.id, since, until]
    );

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
    const revenueGross = Number(tot.revenue_gross) || 0;
    const productCost = Number(tot.product_cost) || 0;
    const expenses = Number(exp?.total) || 0;
    const taxValue = revenueNet * (settings.tax_rate / 100);
    const fees = Math.max(0, revenueGross - revenueNet);
    const totalCosts = spend + taxValue + productCost + expenses;
    const profit = revenueNet - totalCosts;
    const totalOrders = Number(tot.total_orders) || 0;
    const refused = Number(tot.refused_count) || 0;
    const approvedTotal = byPayment.reduce((n: number, p: any) => n + (Number(p.approved_count) || 0), 0);
    const hours = Array.from({ length: 24 }, (_, h) => {
        const c = Number(byHour.find((x: any) => x.hour === h)?.count) || 0;
        return { hour: h, count: c, pct: approved > 0 ? (c / approved) * 100 : 0 };
    });

    return {
        revenue_net: revenueNet,
        revenue_gross: revenueGross,
        spend,
        spend_live: spendLive,
        fees,
        tax: taxValue,
        tax_rate: settings.tax_rate,
        product_cost: productCost,
        expenses,
        total_costs: totalCosts,
        profit,
        roas: ratio(revenueNet, spend),
        roi: ratio(profit, totalCosts),
        margin: revenueNet > 0 ? (profit / revenueNet) * 100 : null,
        cpa: ratio(spend, approved),
        ticket: ratio(revenueNet, approved),
        approved_count: approved,
        pending_count: Number(tot.pending_count) || 0,
        pending_value: Number(tot.pending_value) || 0,
        refused_count: refused,
        refunded_count: Number(tot.refunded_count) || 0,
        refunded_value: Number(tot.refunded_value) || 0,
        chargeback_count: Number(tot.chargeback_count) || 0,
        chargeback_value: Number(tot.chargeback_value) || 0,
        chargeback_rate: approved > 0 ? (Number(tot.chargeback_count) / approved) * 100 : 0,
        approval_rate: approved + refused > 0 ? (approved / (approved + refused)) * 100 : null,
        total_orders: totalOrders,
        abandoned_count: Number(tot.abandoned_count) || 0,
        recovered_count: Number(tot.recovered_count) || 0,
        recovery_rate: Number(tot.recoverable_count) > 0 ? (Number(tot.recovered_count) / Number(tot.recoverable_count)) * 100 : null,
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

/** Pausa/ativa ou muda orçamento de campanha/conjunto/anúncio da conta da fonte. */
export async function updateMetaObject(
    source: SourceCtx, metaId: string, change: { status?: 'ACTIVE' | 'PAUSED'; daily_budget?: number }
): Promise<void> {
    if (!source.meta_account_id) throw new Error('Fonte sem conta de anúncio vinculada');
    if (!/^\d{6,}$/.test(metaId)) throw new Error('ID inválido');
    const token = await getUserAdsToken(source.user_id);
    if (!token) throw new Error('Conta Meta desconectada — reconecte em Contas');

    const base = `https://graph.facebook.com/${META_VERSION}`;
    // Só mexe em objeto que pertence à conta vinculada à fonte.
    const obj: any = (await axios.get(`${base}/${metaId}`, { params: { fields: 'account_id', access_token: token }, timeout: 20000 })).data;
    if (String(obj?.account_id || '').replace(/^act_/, '') !== source.meta_account_id.replace(/^act_/, '')) {
        throw new Error('Esse objeto não pertence à conta de anúncio desta fonte');
    }

    const params: any = { access_token: token };
    if (change.status) params.status = change.status;
    if (change.daily_budget != null) params.daily_budget = Math.round(change.daily_budget * 100); // Meta usa centavos
    await axios.post(`${base}/${metaId}`, null, { params, timeout: 20000 });

    // Mantém a tabela local de campanhas coerente (dashboard/alertas usam ela).
    if (change.status) await query(`UPDATE campaigns SET status = $1, updated_at = NOW() WHERE meta_campaign_id = $2`, [change.status, metaId]);
    if (change.daily_budget != null) await query(`UPDATE campaigns SET daily_budget = $1, updated_at = NOW() WHERE meta_campaign_id = $2`, [change.daily_budget, metaId]);
    invalidateMetaCache(source.meta_account_id);
}
