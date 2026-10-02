'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const META_UTM_TEMPLATE =
    'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}';

export type Group = 'campaign' | 'adset' | 'ad' | 'utm_source' | 'utm_campaign' | 'utm_medium' | 'utm_content' | 'utm_term' | 'day' | 'product';

export interface Row {
    key: string; name: string; parent_name: string | null; meta_id: string | null;
    status: string | null; effective_status: string | null;
    budget: number | null; budget_type: 'daily' | 'lifetime' | null;
    sales: number; revenue: number; spend: number; costs: number;
    cpa: number | null; roas: number | null; profit: number; margin: number | null; roi: number | null;
    pending_count: number; pending_value: number; refunded_count: number;
    impressions: number | null; clicks: number | null; ctr: number | null; cpc: number | null; cpm: number | null;
}

// ── Formatação ──────────────────────────────────────────────────────────
export const brl = (v: number | null | undefined) =>
    v == null ? 'N/A' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num2 = (v: number | null | undefined) => (v == null ? 'N/A' : v.toFixed(2).replace('.', ','));
export const pct = (v: number | null | undefined) => (v == null ? 'N/A' : `${v.toFixed(1).replace('.', ',')}%`);
export const int = (v: number | null | undefined) => (v == null ? 'N/A' : v.toLocaleString('pt-BR'));
export const signColor = (v: number | null | undefined) =>
    v == null ? 'var(--text-muted)' : v > 0 ? 'var(--accent-green)' : v < 0 ? 'var(--accent-red)' : 'var(--text-primary)';

export const PAYMENT_LABEL: Record<string, string> = { pix: 'Pix', credit_card: 'Cartão', boleto: 'Boleto', other: 'Outros' };
export const PAYMENT_COLOR: Record<string, string> = { pix: 'var(--accent-blue)', credit_card: '#22d3ee', boleto: 'var(--accent-yellow)', other: 'var(--text-muted)' };
export const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    approved: { label: 'Aprovada', color: 'var(--accent-green)' },
    pending: { label: 'Pendente', color: 'var(--accent-yellow)' },
    refused: { label: 'Recusada', color: 'var(--text-muted)' },
    refunded: { label: 'Reembolsada', color: 'var(--accent-red)' },
    chargeback: { label: 'Chargeback', color: 'var(--accent-red)' },
    canceled: { label: 'Cancelada', color: 'var(--text-muted)' },
    abandoned: { label: 'Carrinho abandonado', color: 'var(--accent-yellow)' },
};

// ── Datas no fuso de Brasília ───────────────────────────────────────────
export function brtToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
export function shiftDate(iso: string, days: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
export const PERIODS: { key: string; label: string; range: () => [string, string] }[] = [
    { key: 'today', label: 'Hoje', range: () => [brtToday(), brtToday()] },
    { key: 'yesterday', label: 'Ontem', range: () => { const y = shiftDate(brtToday(), -1); return [y, y]; } },
    { key: '7d', label: 'Últimos 7 dias', range: () => [shiftDate(brtToday(), -6), brtToday()] },
    { key: '14d', label: 'Últimos 14 dias', range: () => [shiftDate(brtToday(), -13), brtToday()] },
    { key: '30d', label: 'Últimos 30 dias', range: () => [shiftDate(brtToday(), -29), brtToday()] },
    { key: 'month', label: 'Este mês', range: () => { const t = brtToday(); return [`${t.slice(0, 8)}01`, t]; } },
    {
        key: 'last_month', label: 'Mês passado', range: () => {
            const lastPrev = shiftDate(`${brtToday().slice(0, 8)}01`, -1);
            return [`${lastPrev.slice(0, 8)}01`, lastPrev];
        },
    },
    { key: 'custom', label: 'Personalizado', range: () => [brtToday(), brtToday()] },
];

// ── Contexto: fonte + período compartilhados entre as páginas ───────────
interface VendasCtx {
    sources: any[];
    sourcesLoaded: boolean;
    sourceId: string;
    source: any | null;
    setSourceId: (id: string) => void;
    periodKey: string;
    setPeriodKey: (k: string) => void;
    since: string;
    until: string;
    setCustomRange: (since: string, until: string) => void;
    reloadToken: number;
    reload: () => void;
    reloadSources: (selectId?: string) => Promise<void>;
}

const Ctx = createContext<VendasCtx | null>(null);

function readLS(key: string): string {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function writeLS(key: string, v: string) {
    try { localStorage.setItem(key, v); } catch { /* sem storage */ }
}

export function VendasProvider({ children }: { children: React.ReactNode }) {
    const [sources, setSources] = useState<any[]>([]);
    const [sourcesLoaded, setSourcesLoaded] = useState(false);
    const [sourceId, setSourceIdState] = useState('');
    const [periodKey, setPeriodKeyState] = useState('today');
    const [custom, setCustom] = useState<[string, string]>([brtToday(), brtToday()]);
    const [reloadToken, setReloadToken] = useState(0);

    const loadSources = useCallback(async (selectId?: string) => {
        try {
            const list = (await api.getTrackingSources()) || [];
            setSources(list);
            const want = selectId || readLS('vendas_source');
            const pick = list.find((s: any) => s.id === want) || list[0];
            if (pick) { setSourceIdState(pick.id); if (selectId) writeLS('vendas_source', pick.id); }
        } catch { /* página mostra estado vazio */ }
        setSourcesLoaded(true);
    }, []);

    useEffect(() => {
        const savedPeriod = readLS('vendas_period');
        if (PERIODS.some(p => p.key === savedPeriod) && savedPeriod !== 'custom') setPeriodKeyState(savedPeriod);
        loadSources();
    }, [loadSources]);

    const setSourceId = useCallback((id: string) => { setSourceIdState(id); writeLS('vendas_source', id); }, []);
    const setPeriodKey = useCallback((k: string) => { setPeriodKeyState(k); writeLS('vendas_period', k); }, []);
    const setCustomRange = useCallback((a: string, b: string) => {
        setCustom(a <= b ? [a, b] : [b, a]);
        setPeriodKeyState('custom');
    }, []);

    const [since, until] = useMemo(() => {
        if (periodKey === 'custom') return custom;
        return (PERIODS.find(p => p.key === periodKey) || PERIODS[0]).range();
    }, [periodKey, custom]);

    const value: VendasCtx = {
        sources, sourcesLoaded, sourceId, source: sources.find(s => s.id === sourceId) || null, setSourceId,
        periodKey, setPeriodKey, since, until, setCustomRange,
        reloadToken, reload: () => setReloadToken(t => t + 1),
        reloadSources: loadSources,
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVendas(): VendasCtx {
    const c = useContext(Ctx);
    if (!c) throw new Error('useVendas fora do VendasProvider');
    return c;
}

/** Relatório do período/fonte atuais pra um agrupamento. */
export function useSalesReport(group: Group) {
    const { sourceId, since, until, reloadToken } = useVendas();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!sourceId) return;
        setLoading(true); setError('');
        try {
            setData(await api.getSalesReport(sourceId, { since, until, group }));
        } catch (e: any) {
            setError(e.message || 'Erro ao carregar relatório');
        } finally {
            setLoading(false);
        }
    }, [sourceId, since, until, group]);

    useEffect(() => { load(); }, [load, reloadToken]);
    return { data, loading, error, reload: load };
}

// ── UI base ─────────────────────────────────────────────────────────────
export function Card({ children, style, delay, className, reveal, flat }: {
    children: React.ReactNode; style?: React.CSSProperties; delay?: number; className?: string; reveal?: boolean; flat?: boolean;
}) {
    // Cartão do redesign: superfície com borda, sobe ao passar o mouse e entra
    // em sequência (delay em ms) — ou ao aparecer na rolagem (reveal).
    return (
        <div className={`${flat ? '' : 'tai-card'} ${reveal ? 'tai-reveal' : 'tai-rise'} ${className || ''}`} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '18px 20px', animationDelay: delay ? `${delay}ms` : undefined, ...style,
        }}>{children}</div>
    );
}

export function Kpi({ icon, label, value, hint, color, delay }: { icon?: React.ReactNode; label: string; value: string; hint?: React.ReactNode; color?: string; delay?: number }) {
    return (
        <Card delay={delay} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                {icon && <span style={{ color: color || 'var(--text-muted)', display: 'flex' }}>{icon}</span>}{label}
            </div>
            <div className="tai-mono" style={{ fontSize: 22, fontWeight: 600, color: color || 'var(--text-primary)', lineHeight: 1.15 }}>{value}</div>
            {hint && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{hint}</div>}
        </Card>
    );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{children}</h2>
            {right}
        </div>
    );
}

/** Conta do valor anterior até o novo (ease-out ~1s). Respeita reduced-motion. */
export function useCountUp(target: number, duration = 1000): number {
    const [shown, setShown] = useState(0);
    const fromRef = React.useRef(0);
    const shownRef = React.useRef(0);
    useEffect(() => {
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce || !Number.isFinite(target)) { shownRef.current = target; setShown(target); return; }
        fromRef.current = shownRef.current;
        const start = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const e = 1 - Math.pow(1 - t, 3);
            const v = fromRef.current + (target - fromRef.current) * e;
            shownRef.current = v;
            setShown(v);
            if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);
    return shown;
}

/** Número em reais que conta ao carregar e ao mudar. */
export function CountBRL({ value, style }: { value: number | null | undefined; style?: React.CSSProperties }) {
    const v = useCountUp(value ?? 0);
    return <span className="tai-mono" style={style}>{value == null ? 'N/A' : brl(v)}</span>;
}

/**
 * Pedidos de hoje com polling (30s): devolve os mais recentes e avisa quando
 * chega uma venda aprovada nova (pra toast + brilho no card de lucro).
 */
export function useLiveOrders(sourceId: string, enabled: boolean, onNewSale: (o: any) => void) {
    const [orders, setOrders] = useState<any[]>([]);
    const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
    const seen = React.useRef<Set<string> | null>(null);
    const cb = React.useRef(onNewSale);
    cb.current = onNewSale;
    useEffect(() => {
        seen.current = null;
        setOrders([]);
        if (!sourceId || !enabled) return;
        let alive = true;
        const load = async () => {
            try {
                const today = brtToday();
                const list = (await api.getSalesOrders(sourceId, { since: today, until: today, limit: '50' })) || [];
                if (!alive) return;
                const ids = new Set<string>(list.map((o: any) => `${o.id}:${o.status}`));
                if (seen.current) {
                    const fresh = list.filter((o: any) => !seen.current!.has(`${o.id}:${o.status}`));
                    setFreshIds(new Set(fresh.map((o: any) => o.id)));
                    fresh.filter((o: any) => o.status === 'approved').forEach((o: any) => cb.current(o));
                }
                seen.current = ids;
                setOrders(list);
            } catch { /* mantém o que já tinha */ }
        };
        load();
        const t = setInterval(load, 30000);
        return () => { alive = false; clearInterval(t); };
    }, [sourceId, enabled]);
    return { orders, freshIds };
}

export function ShareList({ items, empty }: { items: { label: string; count: number; pct: number; color?: string; extra?: string }[]; empty: string }) {
    if (!items.length) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>{empty}</div>;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {items.map((it) => (
                <div key={it.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                        <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</span>
                        <span className="num" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{it.count} · {it.pct.toFixed(1).replace('.', ',')}%{it.extra ? ` · ${it.extra}` : ''}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 2, marginTop: 4 }}>
                        <div style={{ width: `${Math.min(100, it.pct)}%`, height: '100%', borderRadius: 2, background: it.color || 'var(--accent-blue)' }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function CopyField({ label, value, masked, hint }: { label: string; value: string; masked?: boolean; hint?: React.ReactNode }) {
    const [copied, setCopied] = useState(false);
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</div>
            <div style={{ display: 'flex', gap: 6 }}>
                <code style={{
                    flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 12, background: 'var(--bg-input)',
                    border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)',
                    overflowX: 'auto', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)',
                }}>{masked ? value.replace(/key=[^&]+/, 'key=••••••••') : value}</code>
                <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                >
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
                </button>
            </div>
            {hint && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.55 }}>{hint}</div>}
        </div>
    );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ padding: '10px 14px', marginBottom: 14, fontSize: 13, borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--accent-red)' }}>
            {children}
        </div>
    );
}

export function EmptyBox({ children }: { children: React.ReactNode }) {
    return <Card style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>{children}</Card>;
}

export function Tabs<T extends string>({ tabs, active, onChange, right }: {
    tabs: { key: T; label: string }[]; active: T; onChange: (k: T) => void; right?: React.ReactNode;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 14px 0', borderBottom: '1px solid var(--border)' }}>
            <div role="tablist" style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
                {tabs.map((t) => (
                    <button key={t.key} role="tab" aria-selected={active === t.key} type="button" onClick={() => onChange(t.key)} style={{
                        padding: '14px 12px 12px', fontSize: 13.5, fontWeight: 600, background: 'transparent', border: 'none',
                        borderBottom: active === t.key ? '2px solid var(--primary)' : '2px solid transparent',
                        color: active === t.key ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
                        transition: 'color .15s, border-color .2s',
                    }}>{t.label}</button>
                ))}
            </div>
            {right && <div style={{ paddingBottom: 8 }}>{right}</div>}
        </div>
    );
}

export const selectStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 13, background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'inherit',
};

export function thStyle(align: 'left' | 'right' | 'center', sortable = true): React.CSSProperties {
    return {
        padding: '9px 12px', textAlign: align, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', cursor: sortable ? 'pointer' : 'default', userSelect: 'none',
    };
}

export function SortIcon({ active, dir }: { active: boolean; dir: 1 | -1 }) {
    if (!active) return null;
    return dir === -1 ? <ChevronDown size={11} style={{ verticalAlign: 'middle' }} /> : <ChevronUp size={11} style={{ verticalAlign: 'middle' }} />;
}

// ── Tabela de relatório (campanhas, UTMs, diário, produtos) ─────────────
export interface Column {
    key: keyof Row;
    label: string;
    render: (r: Row) => React.ReactNode;
    total?: (rows: Row[], t: Totals) => React.ReactNode;
}

export interface Totals {
    sales: number; revenue: number; spend: number; costs: number; profit: number;
    impressions: number; clicks: number; pending_count: number;
    cpa: number | null; roas: number | null; margin: number | null; roi: number | null;
    ctr: number | null; cpc: number | null; cpm: number | null;
}

export function computeTotals(rows: Row[]): Totals {
    const t = rows.reduce((a, r) => ({
        sales: a.sales + r.sales, revenue: a.revenue + r.revenue, spend: a.spend + r.spend, costs: a.costs + r.costs,
        impressions: a.impressions + (r.impressions || 0), clicks: a.clicks + (r.clicks || 0), pending_count: a.pending_count + r.pending_count,
    }), { sales: 0, revenue: 0, spend: 0, costs: 0, impressions: 0, clicks: 0, pending_count: 0 });
    const profit = t.revenue - t.spend - t.costs;
    return {
        ...t, profit,
        cpa: t.sales ? t.spend / t.sales : null,
        roas: t.spend ? t.revenue / t.spend : null,
        margin: t.revenue ? (profit / t.revenue) * 100 : null,
        roi: t.spend + t.costs ? profit / (t.spend + t.costs) : null,
        ctr: t.impressions ? (t.clicks / t.impressions) * 100 : null,
        cpc: t.clicks ? t.spend / t.clicks : null,
        cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null,
    };
}

const roasColor = (v: number | null) => (v == null ? 'var(--text-muted)' : v >= 1 ? 'var(--accent-green)' : 'var(--accent-red)');

/** Colunas financeiras padrão (mesma ordem da UTMify). */
export function financialColumns(opts: { media?: boolean } = {}): Column[] {
    const cols: Column[] = [
        {
            key: 'sales', label: 'Vendas',
            render: (r) => <span>{r.sales}{r.pending_count > 0 && <div style={{ fontSize: 10, color: 'var(--accent-yellow)' }}>+{r.pending_count} pend.</div>}</span>,
            total: (_, t) => t.sales,
        },
        { key: 'cpa', label: 'CPA', render: (r) => brl(r.cpa), total: (_, t) => brl(t.cpa) },
        { key: 'spend', label: 'Gastos', render: (r) => brl(r.spend), total: (_, t) => brl(t.spend) },
        { key: 'revenue', label: 'Faturamento', render: (r) => brl(r.revenue), total: (_, t) => brl(t.revenue) },
        {
            key: 'profit', label: 'Lucro',
            render: (r) => <span style={{ color: signColor(r.profit), fontWeight: 600 }}>{brl(r.profit)}</span>,
            total: (_, t) => <span style={{ color: signColor(t.profit) }}>{brl(t.profit)}</span>,
        },
        { key: 'roas', label: 'ROAS', render: (r) => <span style={{ color: roasColor(r.roas) }}>{num2(r.roas)}</span>, total: (_, t) => <span style={{ color: roasColor(t.roas) }}>{num2(t.roas)}</span> },
        { key: 'margin', label: 'Margem', render: (r) => <span style={{ color: signColor(r.margin) }}>{pct(r.margin)}</span>, total: (_, t) => pct(t.margin) },
        { key: 'roi', label: 'ROI', render: (r) => <span style={{ color: signColor(r.roi) }}>{num2(r.roi)}</span>, total: (_, t) => num2(t.roi) },
    ];
    if (opts.media) {
        cols.push(
            { key: 'impressions', label: 'Impressões', render: (r) => int(r.impressions), total: (_, t) => int(t.impressions) },
            { key: 'clicks', label: 'Cliques', render: (r) => int(r.clicks), total: (_, t) => int(t.clicks) },
            { key: 'ctr', label: 'CTR', render: (r) => pct(r.ctr), total: (_, t) => pct(t.ctr) },
            { key: 'cpc', label: 'CPC', render: (r) => brl(r.cpc), total: (_, t) => brl(t.cpc) },
            { key: 'cpm', label: 'CPM', render: (r) => brl(r.cpm), total: (_, t) => brl(t.cpm) },
        );
    }
    return cols;
}

export function ReportTable({ rows, loading, firstLabel, renderFirst, leading, columns, defaultSort = 'spend', emptyText }: {
    rows: Row[];
    loading: boolean;
    firstLabel: string;
    renderFirst: (r: Row) => React.ReactNode;
    leading?: { label: string; width?: number; render: (r: Row) => React.ReactNode }[];
    columns: Column[];
    defaultSort?: keyof Row;
    emptyText?: string;
}) {
    const [sort, setSort] = useState<{ col: keyof Row; dir: 1 | -1 }>({ col: defaultSort, dir: -1 });
    const sorted = useMemo(() => {
        const list = [...rows];
        list.sort((a, b) => {
            const av = a[sort.col] as any; const bv = b[sort.col] as any;
            if (sort.col === 'name' || sort.col === 'key') return String(av).localeCompare(String(bv)) * sort.dir;
            return ((av ?? -Infinity) - (bv ?? -Infinity)) * sort.dir;
        });
        return list;
    }, [rows, sort]);
    const totals = useMemo(() => computeTotals(rows), [rows]);
    const toggle = (col: keyof Row) => setSort((cur) => cur.col === col ? { col, dir: (cur.dir * -1) as 1 | -1 } : { col, dir: -1 });
    const span = columns.length + 1 + (leading?.length || 0);

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                    <tr style={{ background: 'var(--bg-input)' }}>
                        {leading?.map((l) => <th key={l.label} style={{ ...thStyle('center', false), width: l.width }}>{l.label}</th>)}
                        <th onClick={() => toggle('name')} style={thStyle('left')}>{firstLabel} <SortIcon active={sort.col === 'name'} dir={sort.dir} /></th>
                        {columns.map((c) => (
                            <th key={String(c.key)} onClick={() => toggle(c.key)} style={thStyle('right')}>
                                {c.label} <SortIcon active={sort.col === c.key} dir={sort.dir} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sorted.length === 0 && (
                        <tr><td colSpan={span} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                            {loading ? 'Carregando…' : emptyText || 'Sem dados no período.'}
                        </td></tr>
                    )}
                    {sorted.map((r) => (
                        <tr key={r.key} className="tai-row" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', opacity: loading ? 0.6 : 1 }}>
                            {leading?.map((l) => <td key={l.label} style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>{l.render(r)}</td>)}
                            <td style={{ padding: '9px 12px', maxWidth: 380 }}>{renderFirst(r)}</td>
                            {columns.map((c) => (
                                <td key={String(c.key)} className="num" style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{c.render(r)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                {sorted.length > 0 && (
                    <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                            {leading?.map((l) => <td key={l.label} />)}
                            <td style={{ padding: '9px 12px' }}>{rows.length} {rows.length === 1 ? 'linha' : 'linhas'}</td>
                            {columns.map((c) => (
                                <td key={String(c.key)} className="num" style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{c.total ? c.total(rows, totals) : ''}</td>
                            ))}
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

export function NameCell({ name, sub, title }: { name: string; sub?: string | null; title?: string }) {
    return (
        <>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }} title={title || name}>{name}</div>
            {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
        </>
    );
}
