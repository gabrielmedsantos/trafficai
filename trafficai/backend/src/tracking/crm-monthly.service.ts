// ==============================
// TrafficAI — Visão mês a mês direto do CRM (Kommo)
// Leads contam no mês de CRIAÇÃO e vendas no mês de FECHAMENTO no Kommo —
// independe de quando o evento foi importado ou enviado pra Meta.
// ==============================

import { query } from '../database/connection';
import { getAdapter } from './crm-sync.service';
import { KommoAdapter } from './crm-adapters/kommo.adapter';

const TZ = 'America/Sao_Paulo';
const TZ_OFFSET = '-03:00';
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface CrmMonthlyRow {
    month: string;              // YYYY-MM
    partial: boolean;           // mês corrente (ainda em andamento)
    spend: number;
    conversations_meta: number;
    leads_created: number;
    sales_count: number;
    sales_with_value: number;
    revenue: number;
    lost_count: number;
    cpl: number | null;
    cpa: number | null;
    roas: number | null;
    conversion_rate: number | null;
    avg_ticket: number | null;  // faturamento ÷ vendas com valor preenchido
}

export interface CrmMonthlyReport {
    months: CrmMonthlyRow[];
    totals: CrmMonthlyRow;
    won_statuses: string[];
    has_account_link: boolean;
    timezone: string;
    generated_at: string;
    cached: boolean;
}

const cache = new Map<string, { at: number; data: CrmMonthlyReport }>();

function monthKey(unixSeconds: number): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
        .format(new Date(unixSeconds * 1000)).slice(0, 7);
}

function derive(r: CrmMonthlyRow): CrmMonthlyRow {
    r.cpl = r.leads_created > 0 && r.spend > 0 ? r.spend / r.leads_created : null;
    r.cpa = r.sales_count > 0 && r.spend > 0 ? r.spend / r.sales_count : null;
    r.roas = r.spend > 0 ? r.revenue / r.spend : null;
    r.conversion_rate = r.leads_created > 0 ? (r.sales_count / r.leads_created) * 100 : null;
    r.avg_ticket = r.sales_with_value > 0 ? r.revenue / r.sales_with_value : null;
    return r;
}

function emptyRow(month: string, partial: boolean): CrmMonthlyRow {
    return {
        month, partial, spend: 0, conversations_meta: 0, leads_created: 0, sales_count: 0, sales_with_value: 0,
        revenue: 0, lost_count: 0, cpl: null, cpa: null, roas: null, conversion_rate: null, avg_ticket: null,
    };
}

/** `months` meses completos + o mês corrente (parcial). */
export async function getKommoMonthlyReport(source: any, months: number, refresh = false): Promise<CrmMonthlyReport> {
    const cacheKey = `${source.id}:${months}`;
    const hit = cache.get(cacheKey);
    if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.data, cached: true };

    const adapter = getAdapter(source) as KommoAdapter;
    const now = Math.floor(Date.now() / 1000);
    const nowKey = monthKey(now);
    const [y, m] = nowKey.split('-').map(Number);
    const keys: string[] = [];
    for (let i = months; i >= 0; i--) {
        const d = new Date(Date.UTC(y, m - 1 - i, 1));
        keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    const from = Math.floor(new Date(`${keys[0]}-01T00:00:00${TZ_OFFSET}`).getTime() / 1000);

    const pipelines = await adapter.listPipelines();
    const pipelineName = new Map<number, string>(pipelines.map((p): [number, string] => [p.id, p.name]));
    const wonStatuses = await adapter.findWonStatuses();
    const wonSet = new Set(wonStatuses.map(w => `${w.pipeline_id}:${w.status_id}`));

    const created = await adapter.listLeadsByDate('created_at', from, now);
    const closed = await adapter.listLeadsByDate('closed_at', from, now);

    const byMonth = new Map<string, CrmMonthlyRow>(keys.map((k): [string, CrmMonthlyRow] => [k, emptyRow(k, k === nowKey)]));
    for (const l of created) {
        const row = byMonth.get(monthKey(l.created_at));
        if (row) row.leads_created++;
    }
    for (const l of closed) {
        if (!l.closed_at) continue;
        const row = byMonth.get(monthKey(l.closed_at));
        if (!row) continue;
        if (wonSet.has(`${l.pipeline_id}:${l.status_id}`)) {
            row.sales_count++;
            if (l.price > 0) row.sales_with_value++;
            row.revenue += l.price;
        } else if (l.status_id === 143) {
            row.lost_count++;
        }
    }

    if (source.account_id) {
        const meta = await query<any>(
            `SELECT to_char(ih.date, 'YYYY-MM') AS month,
                    COALESCE(SUM(ih.spend), 0)::float AS spend,
                    COALESCE(SUM((SELECT SUM((e->>'value')::numeric)
                                  FROM jsonb_array_elements(COALESCE(ih.actions, '[]'::jsonb)) e
                                  WHERE e->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d')), 0)::float AS conversations_meta
             FROM insights_history ih
             JOIN campaigns c ON ih.campaign_id = c.id
             WHERE c.account_id = $1 AND ih.date >= $2
             GROUP BY 1`,
            [source.account_id, `${keys[0]}-01`]
        );
        for (const r of meta) {
            const row = byMonth.get(r.month);
            if (!row) continue;
            row.spend = Number(r.spend) || 0;
            row.conversations_meta = Number(r.conversations_meta) || 0;
        }
    }

    const rows = keys.map(k => derive(byMonth.get(k)!));
    const totals = emptyRow('total', false);
    for (const r of rows) {
        totals.spend += r.spend;
        totals.conversations_meta += r.conversations_meta;
        totals.leads_created += r.leads_created;
        totals.sales_count += r.sales_count;
        totals.sales_with_value += r.sales_with_value;
        totals.revenue += r.revenue;
        totals.lost_count += r.lost_count;
    }

    const data: CrmMonthlyReport = {
        months: rows,
        totals: derive(totals),
        won_statuses: wonStatuses.map(w => `${pipelineName.get(w.pipeline_id) || w.pipeline_id} / ${w.status_name}`),
        has_account_link: !!source.account_id,
        timezone: TZ,
        generated_at: new Date().toISOString(),
        cached: false,
    };
    cache.set(cacheKey, { at: Date.now(), data });
    return data;
}

export interface CrmPeriodSummary {
    since: string;
    until: string;
    leads_created: number;
    sales_count: number;
    sales_with_value: number;
    revenue: number;
    conversion_rate: number | null;   // vendas ganhas ÷ leads criados no período
    generated_at: string;
    cached: boolean;
}

const PERIOD_CACHE_TTL_MS = 15 * 60 * 1000;
const periodCache = new Map<string, { at: number; data: CrmPeriodSummary }>();

/** Leads criados e vendas fechadas no Kommo entre since e until (YYYY-MM-DD, inclusive). */
export async function getKommoPeriodSummary(source: any, since: string, until: string): Promise<CrmPeriodSummary> {
    const cacheKey = `${source.id}:${since}:${until}`;
    const hit = periodCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PERIOD_CACHE_TTL_MS) return { ...hit.data, cached: true };

    const adapter = getAdapter(source) as KommoAdapter;
    const now = Math.floor(Date.now() / 1000);
    const from = Math.floor(new Date(`${since}T00:00:00${TZ_OFFSET}`).getTime() / 1000);
    const to = Math.min(now, Math.floor(new Date(`${until}T23:59:59${TZ_OFFSET}`).getTime() / 1000));

    const wonStatuses = await adapter.findWonStatuses();
    const wonSet = new Set(wonStatuses.map(w => `${w.pipeline_id}:${w.status_id}`));
    const created = await adapter.listLeadsByDate('created_at', from, to);
    const closed = await adapter.listLeadsByDate('closed_at', from, to);
    const won = closed.filter(l => wonSet.has(`${l.pipeline_id}:${l.status_id}`));

    const data: CrmPeriodSummary = {
        since, until,
        leads_created: created.length,
        sales_count: won.length,
        sales_with_value: won.filter(l => l.price > 0).length,
        revenue: won.reduce((sum, l) => sum + l.price, 0),
        conversion_rate: created.length > 0 ? (won.length / created.length) * 100 : null,
        generated_at: new Date().toISOString(),
        cached: false,
    };
    periodCache.set(cacheKey, { at: Date.now(), data });
    return data;
}
