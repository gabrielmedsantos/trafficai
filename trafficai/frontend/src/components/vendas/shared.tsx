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
    video_3s: number | null; thruplays: number | null; landing_views: number | null; initiate_checkouts: number | null;
    hook_rate: number | null; hold_rate: number | null; retention: number | null; connect_rate: number | null;
    page_conversion: number | null; checkout_conversion: number | null; cost_per_checkout: number | null;
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
    hint?: string;
}

export interface Totals {
    sales: number; revenue: number; spend: number; costs: number; profit: number;
    impressions: number; clicks: number; pending_count: number;
    cpa: number | null; roas: number | null; margin: number | null; roi: number | null;
    ctr: number | null; cpc: number | null; cpm: number | null;
    video_3s: number; thruplays: number; landing_views: number; initiate_checkouts: number;
    hook_rate: number | null; hold_rate: number | null; retention: number | null; connect_rate: number | null;
    page_conversion: number | null; checkout_conversion: number | null; cost_per_checkout: number | null;
}

export function computeTotals(rows: Row[]): Totals {
    const t = rows.reduce((a, r) => ({
        sales: a.sales + r.sales, revenue: a.revenue + r.revenue, spend: a.spend + r.spend, costs: a.costs + r.costs,
        impressions: a.impressions + (r.impressions || 0), clicks: a.clicks + (r.clicks || 0), pending_count: a.pending_count + r.pending_count,
        video_3s: a.video_3s + (r.video_3s || 0), thruplays: a.thruplays + (r.thruplays || 0),
        landing_views: a.landing_views + (r.landing_views || 0), initiate_checkouts: a.initiate_checkouts + (r.initiate_checkouts || 0),
    }), { sales: 0, revenue: 0, spend: 0, costs: 0, impressions: 0, clicks: 0, pending_count: 0, video_3s: 0, thruplays: 0, landing_views: 0, initiate_checkouts: 0 });
    const pc = (n: number, d: number) => (d ? (n / d) * 100 : null);
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
        hook_rate: t.video_3s ? pc(t.video_3s, t.impressions) : null,
        hold_rate: t.thruplays ? pc(t.thruplays, t.impressions) : null,
        retention: t.video_3s ? pc(t.thruplays, t.video_3s) : null,
        connect_rate: t.landing_views ? pc(t.landing_views, t.clicks) : null,
        page_conversion: t.landing_views ? pc(t.initiate_checkouts, t.landing_views) : null,
        checkout_conversion: t.initiate_checkouts ? pc(t.sales, t.initiate_checkouts) : null,
        cost_per_checkout: t.initiate_checkouts ? t.spend / t.initiate_checkouts : null,
    };
}

const roasColor = (v: number | null) => (v == null ? 'var(--text-muted)' : v >= 1 ? 'var(--accent-green)' : 'var(--accent-red)');

/** Todas as colunas disponíveis, por grupo — o seletor "Colunas" escolhe quais aparecem. */
const pctCell = (v: number | null, good?: number) => (
    <span style={{ color: v == null ? 'var(--text-muted)' : good != null && v >= good ? 'var(--accent-green)' : 'var(--text-primary)' }}>{pct(v)}</span>
);

export const COLUMN_DEFS: Record<string, Column> = {
    sales: {
        key: 'sales', label: 'Vendas', hint: 'Vendas aprovadas atribuídas',
        render: (r) => <span>{r.sales}{r.pending_count > 0 && <div style={{ fontSize: 10, color: 'var(--accent-yellow)' }}>+{r.pending_count} pend.</div>}</span>,
        total: (_, t) => t.sales,
    },
    cpa: { key: 'cpa', label: 'CPA', hint: 'Gasto ÷ vendas aprovadas', render: (r) => brl(r.cpa), total: (_, t) => brl(t.cpa) },
    spend: { key: 'spend', label: 'Gastos', render: (r) => brl(r.spend), total: (_, t) => brl(t.spend) },
    revenue: { key: 'revenue', label: 'Faturamento', hint: 'Faturamento líquido das vendas aprovadas', render: (r) => brl(r.revenue), total: (_, t) => brl(t.revenue) },
    profit: {
        key: 'profit', label: 'Lucro', hint: 'Faturamento − gastos − imposto − custo de produto',
        render: (r) => <span style={{ color: signColor(r.profit), fontWeight: 600 }}>{brl(r.profit)}</span>,
        total: (_, t) => <span style={{ color: signColor(t.profit) }}>{brl(t.profit)}</span>,
    },
    roas: { key: 'roas', label: 'ROAS', hint: 'Faturamento ÷ gasto', render: (r) => <span style={{ color: roasColor(r.roas) }}>{num2(r.roas)}</span>, total: (_, t) => <span style={{ color: roasColor(t.roas) }}>{num2(t.roas)}</span> },
    margin: { key: 'margin', label: 'Margem', hint: 'Lucro ÷ faturamento', render: (r) => <span style={{ color: signColor(r.margin) }}>{pct(r.margin)}</span>, total: (_, t) => pct(t.margin) },
    roi: { key: 'roi', label: 'ROI', hint: 'Lucro ÷ custos totais', render: (r) => <span style={{ color: signColor(r.roi) }}>{num2(r.roi)}</span>, total: (_, t) => num2(t.roi) },
    impressions: { key: 'impressions', label: 'Impressões', render: (r) => int(r.impressions), total: (_, t) => int(t.impressions) },
    clicks: { key: 'clicks', label: 'Cliques', hint: 'Cliques no link', render: (r) => int(r.clicks), total: (_, t) => int(t.clicks) },
    ctr: { key: 'ctr', label: 'CTR', hint: 'Cliques no link ÷ impressões', render: (r) => pct(r.ctr), total: (_, t) => pct(t.ctr) },
    cpc: { key: 'cpc', label: 'CPC', hint: 'Gasto ÷ cliques no link', render: (r) => brl(r.cpc), total: (_, t) => brl(t.cpc) },
    cpm: { key: 'cpm', label: 'CPM', hint: 'Gasto por mil impressões', render: (r) => brl(r.cpm), total: (_, t) => brl(t.cpm) },
    hook_rate: { key: 'hook_rate', label: 'Hook rate', hint: 'Views de 3 segundos ÷ impressões — quanto o começo do vídeo prende', render: (r) => pctCell(r.hook_rate, 30), total: (_, t) => pct(t.hook_rate) },
    hold_rate: { key: 'hold_rate', label: 'Hold rate', hint: 'ThruPlays (15s ou o vídeo inteiro) ÷ impressões', render: (r) => pctCell(r.hold_rate, 15), total: (_, t) => pct(t.hold_rate) },
    retention: { key: 'retention', label: 'Retenção', hint: 'ThruPlays ÷ views de 3s — de quem parou no vídeo, quantos continuaram assistindo', render: (r) => pctCell(r.retention, 40), total: (_, t) => pct(t.retention) },
    video_3s: { key: 'video_3s', label: 'Views 3s', render: (r) => int(r.video_3s), total: (_, t) => int(t.video_3s) },
    thruplays: { key: 'thruplays', label: 'ThruPlays', render: (r) => int(r.thruplays), total: (_, t) => int(t.thruplays) },
    landing_views: { key: 'landing_views', label: 'Vis. página', hint: 'Visualizações da página de destino (Meta)', render: (r) => int(r.landing_views), total: (_, t) => int(t.landing_views) },
    connect_rate: { key: 'connect_rate', label: 'Connect rate', hint: 'Visualizações da página ÷ cliques no link — quantos cliques viram a página carregar', render: (r) => pctCell(r.connect_rate, 70), total: (_, t) => pct(t.connect_rate) },
    initiate_checkouts: { key: 'initiate_checkouts', label: 'ICs', hint: 'Checkouts iniciados (Meta)', render: (r) => int(r.initiate_checkouts), total: (_, t) => int(t.initiate_checkouts) },
    cost_per_checkout: { key: 'cost_per_checkout', label: 'Custo/IC', hint: 'Gasto ÷ checkouts iniciados', render: (r) => brl(r.cost_per_checkout), total: (_, t) => brl(t.cost_per_checkout) },
    page_conversion: { key: 'page_conversion', label: 'Conv. página', hint: 'Checkouts iniciados ÷ visualizações da página — quanto a página convence', render: (r) => pctCell(r.page_conversion), total: (_, t) => pct(t.page_conversion) },
    checkout_conversion: { key: 'checkout_conversion', label: 'Conv. checkout', hint: 'Vendas aprovadas ÷ checkouts iniciados — quanto o checkout fecha', render: (r) => pctCell(r.checkout_conversion), total: (_, t) => pct(t.checkout_conversion) },
};

export const COLUMN_GROUPS: { label: string; keys: string[] }[] = [
    { label: 'Vendas e lucro', keys: ['sales', 'cpa', 'spend', 'revenue', 'profit', 'roas', 'margin', 'roi'] },
    { label: 'Criativo (vídeo)', keys: ['hook_rate', 'hold_rate', 'retention', 'video_3s', 'thruplays'] },
    { label: 'Funil', keys: ['clicks', 'landing_views', 'connect_rate', 'initiate_checkouts', 'cost_per_checkout', 'page_conversion', 'checkout_conversion'] },
    { label: 'Mídia', keys: ['impressions', 'ctr', 'cpc', 'cpm'] },
];

export const COLUMN_PRESETS: { key: string; label: string; keys: string[] }[] = [
    { key: 'vendas', label: 'Vendas', keys: ['sales', 'cpa', 'spend', 'revenue', 'profit', 'roas', 'margin', 'roi'] },
    { key: 'criativos', label: 'Criativos', keys: ['sales', 'cpa', 'spend', 'roas', 'hook_rate', 'hold_rate', 'retention', 'checkout_conversion', 'ctr', 'cpm'] },
    { key: 'funil', label: 'Funil', keys: ['sales', 'cpa', 'spend', 'clicks', 'landing_views', 'connect_rate', 'initiate_checkouts', 'cost_per_checkout', 'page_conversion', 'checkout_conversion', 'ctr'] },
];

/** Move a coluna `from` pra posição onde está `to`. */
export function moveKey(keys: string[], from: string, to: string): string[] {
    if (from === to) return keys;
    const list = keys.filter((k) => k !== from);
    const idx = list.indexOf(to);
    const fromIdx = keys.indexOf(from), toIdx = keys.indexOf(to);
    list.splice(fromIdx < toIdx ? idx + 1 : idx, 0, from);
    return list;
}

const miniBtn = (disabled: boolean): React.CSSProperties => ({
    width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    border: '1px solid var(--border-strong)', borderRadius: 6, background: 'transparent', font: '600 12px var(--font-sans)',
    color: disabled ? 'var(--text-subtle)' : 'var(--text-secondary)', cursor: disabled ? 'default' : 'pointer',
});

export function columnsFor(keys: string[]): Column[] {
    return keys.map((k) => COLUMN_DEFS[k]).filter(Boolean);
}

/** Colunas financeiras padrão (mesma ordem da UTMify). */
export function financialColumns(opts: { media?: boolean } = {}): Column[] {
    return columnsFor([...COLUMN_PRESETS[0].keys, ...(opts.media ? ['impressions', 'clicks', 'ctr', 'cpc', 'cpm'] : [])]);
}

/** Escolha de colunas (com atalhos), lembrada no navegador. */
export function useColumnChoice(storageKey: string, fallback: string[] = COLUMN_PRESETS[0].keys) {
    const [keys, setKeys] = useState<string[]>(fallback);
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (Array.isArray(saved)) {
                const valid = saved.filter((k: unknown) => typeof k === 'string' && COLUMN_DEFS[k as string]) as string[];
                if (valid.length) setKeys(valid);
            }
        } catch { /* sem storage */ }
    }, [storageKey]);
    const update = (next: string[]) => {
        setKeys(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* sem storage */ }
    };
    return [keys, update] as const;
}

export function ColumnPicker({ value, onChange }: { value: string[]; onChange: (keys: string[]) => void }) {
    const [open, setOpen] = useState(false);
    const [dragKey, setDragKey] = useState<string | null>(null);
    const [overKey, setOverKey] = useState<string | null>(null);
    const ref = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
    }, [open]);
    const toggle = (k: string) => {
        if (value.includes(k)) onChange(value.filter((x) => x !== k));
        else onChange([...value, k]);
    };
    const preset = COLUMN_PRESETS.find((p) => p.keys.length === value.length && p.keys.every((k, i) => value[i] === k));
    const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 };
    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--border-strong)', background: open ? 'var(--bg-surface-2)' : 'transparent',
                color: 'var(--text-secondary)', font: '600 12.5px var(--font-sans)',
            }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
                Colunas{preset ? `: ${preset.label}` : ` (${value.length})`}
            </button>
            {open && (
                <div className="tai-rise" style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 40, width: 340, maxHeight: 460, overflowY: 'auto',
                    background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 12,
                    boxShadow: '0 18px 40px rgba(0,0,0,.5)', padding: 14, animationDuration: '.2s',
                }}>
                    <div style={sectionLabel}>Atalhos</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                        {COLUMN_PRESETS.map((p) => (
                            <button key={p.key} type="button" onClick={() => onChange(p.keys)} style={{
                                padding: '5px 11px', borderRadius: 999, cursor: 'pointer', font: '600 12px var(--font-sans)',
                                border: `1px solid ${preset?.key === p.key ? 'var(--primary)' : 'var(--border-strong)'}`,
                                background: preset?.key === p.key ? 'var(--primary-soft)' : 'transparent', color: 'var(--text-primary)',
                            }}>{p.label}</button>
                        ))}
                    </div>
                    <div style={sectionLabel}>Ordem das colunas <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· arraste pra reordenar</span></div>
                    <ol style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {value.map((k, i) => (
                            <li key={k}
                                draggable
                                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); setDragKey(k); }}
                                onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                                onDragOver={(e) => { e.preventDefault(); if (overKey !== k) setOverKey(k); }}
                                onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer.getData('text/plain') || dragKey; if (from) onChange(moveKey(value, from, k)); setDragKey(null); setOverKey(null); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, cursor: 'grab', fontSize: 12.5,
                                    background: overKey === k && dragKey !== k ? 'var(--primary-soft)' : 'var(--bg-surface-2)',
                                    border: `1px solid ${overKey === k && dragKey !== k ? 'var(--primary)' : 'transparent'}`,
                                    opacity: dragKey === k ? 0.45 : 1, transition: 'background .12s, border-color .12s',
                                }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
                                <span style={{ flexGrow: 1 }}>{COLUMN_DEFS[k].label}</span>
                                <button type="button" aria-label={`Subir ${COLUMN_DEFS[k].label}`} disabled={i === 0} onClick={() => onChange(moveKey(value, k, value[i - 1]))} style={miniBtn(i === 0)}>↑</button>
                                <button type="button" aria-label={`Descer ${COLUMN_DEFS[k].label}`} disabled={i === value.length - 1} onClick={() => onChange(moveKey(value, k, value[i + 1]))} style={miniBtn(i === value.length - 1)}>↓</button>
                                <button type="button" aria-label={`Remover ${COLUMN_DEFS[k].label}`} onClick={() => onChange(value.filter((x) => x !== k))} style={miniBtn(false)}>×</button>
                            </li>
                        ))}
                    </ol>
                    <div style={sectionLabel}>Adicionar ou tirar</div>
                    {COLUMN_GROUPS.map((g) => (
                        <div key={g.label} style={{ marginBottom: 12 }}>
                            <div style={sectionLabel}>{g.label}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                                {g.keys.map((k) => (
                                    <label key={k} title={COLUMN_DEFS[k].hint} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer', padding: '3px 0' }}>
                                        <input type="checkbox" checked={value.includes(k)} onChange={() => toggle(k)} /> {COLUMN_DEFS[k].label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Criativo e funil vêm da Meta (vídeo, visualização da página, checkout). Passe o mouse no título da coluna pra ver a conta.
                    </div>
                </div>
            )}
        </div>
    );
}

export function ReportTable({ rows, loading, firstLabel, renderFirst, leading, columns, defaultSort = 'spend', emptyText, onReorder }: {
    rows: Row[];
    loading: boolean;
    firstLabel: string;
    renderFirst: (r: Row) => React.ReactNode;
    leading?: { label: string; width?: number; render: (r: Row) => React.ReactNode }[];
    columns: Column[];
    defaultSort?: keyof Row;
    emptyText?: string;
    /** Quando passado, os títulos das colunas podem ser arrastados pra mudar a ordem. */
    onReorder?: (from: string, to: string) => void;
}) {
    const [dragCol, setDragCol] = useState<string | null>(null);
    const [overCol, setOverCol] = useState<string | null>(null);
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

    // Colunas da esquerda (status, orçamento, nome) ficam presas ao rolar pro lado.
    // Largura da coluna do nome: arrastável pela borda do título, lembrada no navegador.
    const NAME_DEFAULT = 300;
    const [NAME_W, setNameW] = useState(NAME_DEFAULT);
    useEffect(() => {
        try { const v = Number(localStorage.getItem('tai_name_col_w')); if (v >= 140 && v <= 640) setNameW(v); } catch { /* sem storage */ }
    }, []);
    const resize = React.useRef<{ x: number; w: number } | null>(null);
    const onResizeStart = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        resize.current = { x: e.clientX, w: NAME_W };
        const move = (ev: MouseEvent) => {
            if (!resize.current) return;
            setNameW(Math.min(640, Math.max(140, resize.current.w + ev.clientX - resize.current.x)));
        };
        const up = () => {
            resize.current = null;
            window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
            setNameW((w) => { try { localStorage.setItem('tai_name_col_w', String(w)); } catch { /* */ } return w; });
            document.body.style.cursor = '';
        };
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    };
    const resetWidth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setNameW(NAME_DEFAULT);
        try { localStorage.removeItem('tai_name_col_w'); } catch { /* */ }
    };
    const lefts: number[] = [];
    let acc = 0;
    for (const l of leading || []) { lefts.push(acc); acc += l.width || 90; }
    const nameLeft = acc;
    const stickyBase = (left: number, extra?: React.CSSProperties): React.CSSProperties => ({ position: 'sticky', left, zIndex: 1, ...extra });

    // Arrastar com o mouse pra rolar (além da barra e do shift+roda).
    const wrapRef = React.useRef<HTMLDivElement>(null);
    const drag = React.useRef<{ x: number; left: number; moved: boolean } | null>(null);
    const [scrolled, setScrolled] = useState(false);
    const onMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select, label, textarea, [draggable="true"]')) return;
        drag.current = { x: e.clientX, left: wrapRef.current?.scrollLeft || 0, moved: false };
    };
    useEffect(() => {
        const move = (e: MouseEvent) => {
            const d = drag.current;
            if (!d || !wrapRef.current) return;
            const dx = e.clientX - d.x;
            if (Math.abs(dx) > 4) d.moved = true;
            if (d.moved) { wrapRef.current.scrollLeft = d.left - dx; e.preventDefault(); }
        };
        const up = () => { drag.current = null; };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, []);
    const edgeShadow = scrolled ? '6px 0 10px -6px rgba(0,0,0,0.6)' : 'none';

    return (
        <div ref={wrapRef} className="tai-scroll" onMouseDown={onMouseDown} onScroll={(e) => setScrolled((e.target as HTMLDivElement).scrollLeft > 4)}
            style={{ overflowX: 'auto', maxWidth: '100%', cursor: 'grab' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5 }}>
                <thead>
                    <tr>
                        {leading?.map((l, i) => (
                            <th key={l.label} className="tai-sticky tai-head" style={{ ...thStyle('center', false), ...stickyBase(lefts[i], { minWidth: l.width, width: l.width, zIndex: 2 }) }}>{l.label}</th>
                        ))}
                        <th onClick={() => toggle('name')} className="tai-sticky tai-head" style={{ ...thStyle('left'), ...stickyBase(nameLeft, { minWidth: NAME_W, maxWidth: NAME_W, width: NAME_W, zIndex: 2, boxShadow: edgeShadow }) }}>
                            {firstLabel} <SortIcon active={sort.col === 'name'} dir={sort.dir} />
                            <span role="separator" aria-orientation="vertical" aria-label="Ajustar largura da coluna" title="Arraste pra ajustar a largura · duplo clique volta ao padrão"
                                className="tai-resize" onMouseDown={onResizeStart} onDoubleClick={resetWidth} onClick={(e) => e.stopPropagation()}
                                style={{ position: 'absolute', top: 0, right: -4, bottom: 0, width: 9, cursor: 'col-resize', zIndex: 3 }} />
                        </th>
                        {columns.map((c) => (
                            <th key={String(c.key)} onClick={() => toggle(c.key)} title={onReorder ? `${c.hint ? c.hint + ' · ' : ''}Arraste pra mudar a posição` : c.hint} className="tai-head"
                                draggable={!!onReorder}
                                onDragStart={onReorder ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(c.key)); setDragCol(String(c.key)); } : undefined}
                                onDragEnd={onReorder ? () => { setDragCol(null); setOverCol(null); } : undefined}
                                onDragOver={onReorder ? (e) => { e.preventDefault(); if (overCol !== String(c.key)) setOverCol(String(c.key)); } : undefined}
                                onDrop={onReorder ? (e) => { e.preventDefault(); const from = e.dataTransfer.getData('text/plain') || dragCol; if (from && from !== String(c.key)) onReorder(from, String(c.key)); setDragCol(null); setOverCol(null); } : undefined}
                                style={{
                                    ...thStyle('right'), cursor: onReorder ? 'grab' : 'pointer',
                                    opacity: dragCol === String(c.key) ? 0.4 : 1,
                                    boxShadow: overCol === String(c.key) && dragCol !== String(c.key) ? 'inset 2px 0 0 var(--primary)' : undefined,
                                }}>
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
                        <tr key={r.key} className="tai-row" style={{ opacity: loading ? 0.6 : 1 }}>
                            {leading?.map((l, i) => (
                                <td key={l.label} className="tai-sticky" style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderTop: '1px solid rgba(255,255,255,0.05)', ...stickyBase(lefts[i], { minWidth: l.width, width: l.width }) }}>{l.render(r)}</td>
                            ))}
                            <td className="tai-sticky" style={{ padding: '9px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', ...stickyBase(nameLeft, { minWidth: NAME_W, maxWidth: NAME_W, boxShadow: edgeShadow }) }}>{renderFirst(r)}</td>
                            {columns.map((c) => (
                                <td key={String(c.key)} className="num" style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid rgba(255,255,255,0.05)' }}>{c.render(r)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                {sorted.length > 0 && (
                    <tfoot>
                        <tr style={{ fontWeight: 700 }}>
                            {leading?.map((l, i) => <td key={l.label} className="tai-sticky tai-foot" style={{ borderTop: '2px solid var(--border)', ...stickyBase(lefts[i], { minWidth: l.width }) }} />)}
                            <td className="tai-sticky tai-foot" style={{ padding: '9px 12px', borderTop: '2px solid var(--border)', ...stickyBase(nameLeft, { minWidth: NAME_W, boxShadow: edgeShadow }) }}>{rows.length} {rows.length === 1 ? 'linha' : 'linhas'}</td>
                            {columns.map((c) => (
                                <td key={String(c.key)} className="num tai-foot" style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '2px solid var(--border)' }}>{c.total ? c.total(rows, totals) : ''}</td>
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
