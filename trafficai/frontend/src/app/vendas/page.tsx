'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    DollarSign, TrendingUp, TrendingDown, ShoppingCart, Clock, RotateCcw, AlertTriangle,
    Percent, Target, RefreshCw, Copy, Check, ChevronDown, ChevronUp, Settings2, Receipt,
} from 'lucide-react';
import { api } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const META_UTM_TEMPLATE =
    'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}';

type Group = 'campaign' | 'adset' | 'ad' | 'utm_source' | 'utm_campaign' | 'utm_medium' | 'utm_content' | 'utm_term' | 'day' | 'product';

interface Row {
    key: string; name: string; meta_id: string | null; status: string | null; budget: number | null;
    sales: number; revenue: number; spend: number; cpa: number | null; roas: number | null;
    profit: number; margin: number | null; roi: number | null;
    pending_count: number; pending_value: number; refunded_count: number;
}

// ── Datas no fuso de Brasília ───────────────────────────────────────────
function brtToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function shiftDate(iso: string, days: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
const PERIODS: { key: string; label: string; range: () => [string, string] }[] = [
    { key: 'today', label: 'Hoje', range: () => [brtToday(), brtToday()] },
    { key: 'yesterday', label: 'Ontem', range: () => { const y = shiftDate(brtToday(), -1); return [y, y]; } },
    { key: '7d', label: 'Últimos 7 dias', range: () => [shiftDate(brtToday(), -6), brtToday()] },
    { key: '30d', label: 'Últimos 30 dias', range: () => [shiftDate(brtToday(), -29), brtToday()] },
    { key: 'month', label: 'Este mês', range: () => { const t = brtToday(); return [`${t.slice(0, 8)}01`, t]; } },
    {
        key: 'last_month', label: 'Mês passado', range: () => {
            const first = `${brtToday().slice(0, 8)}01`;
            const lastPrev = shiftDate(first, -1);
            return [`${lastPrev.slice(0, 8)}01`, lastPrev];
        },
    },
];

const GROUP_TABS: { key: Group; label: string }[] = [
    { key: 'campaign', label: 'Campanhas' },
    { key: 'adset', label: 'Conjuntos' },
    { key: 'ad', label: 'Anúncios' },
    { key: 'utm_campaign', label: 'UTMs' },
    { key: 'day', label: 'Diário' },
    { key: 'product', label: 'Produtos' },
];
const UTM_FIELDS: { key: Group; label: string }[] = [
    { key: 'utm_source', label: 'utm_source' },
    { key: 'utm_campaign', label: 'utm_campaign' },
    { key: 'utm_medium', label: 'utm_medium' },
    { key: 'utm_content', label: 'utm_content' },
    { key: 'utm_term', label: 'utm_term' },
];

const PAYMENT_LABEL: Record<string, string> = { pix: 'Pix', credit_card: 'Cartão', boleto: 'Boleto', other: 'Outros' };
const PAYMENT_COLOR: Record<string, string> = { pix: 'var(--accent-blue)', credit_card: 'var(--accent-cyan, #22d3ee)', boleto: 'var(--accent-yellow)', other: 'var(--text-muted)' };
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    approved: { label: 'Aprovada', color: 'var(--accent-green)' },
    pending: { label: 'Pendente', color: 'var(--accent-yellow)' },
    refused: { label: 'Recusada', color: 'var(--text-muted)' },
    refunded: { label: 'Reembolsada', color: 'var(--accent-red)' },
    chargeback: { label: 'Chargeback', color: 'var(--accent-red)' },
    canceled: { label: 'Cancelada', color: 'var(--text-muted)' },
};

const brl = (v: number | null | undefined) =>
    v == null ? 'N/A' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num2 = (v: number | null | undefined) => (v == null ? 'N/A' : v.toFixed(2).replace('.', ','));
const pct = (v: number | null | undefined) => (v == null ? 'N/A' : `${v.toFixed(1).replace('.', ',')}%`);
const signColor = (v: number | null | undefined) =>
    v == null ? 'var(--text-muted)' : v > 0 ? 'var(--accent-green)' : v < 0 ? 'var(--accent-red)' : 'var(--text-primary)';

// ── UI base ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 14px', ...style,
        }}>{children}</div>
    );
}

function Kpi({ icon, label, value, hint, color }: { icon: React.ReactNode; label: string; value: string; hint?: string; color?: string }) {
    return (
        <Card style={{ minHeight: 78 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>
                <span style={{ color: color || 'var(--text-muted)' }}>{icon}</span>{label}
            </div>
            <div className="num" style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)', marginTop: 4, lineHeight: 1.15 }}>{value}</div>
            {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
        </Card>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>{children}</div>;
}

function ShareList({ items, empty }: { items: { label: string; count: number; pct: number; color?: string; extra?: string }[]; empty: string }) {
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

function CopyField({ label, value, masked }: { label: string; value: string; masked?: boolean }) {
    const [copied, setCopied] = useState(false);
    return (
        <div style={{ marginBottom: 12 }}>
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
        </div>
    );
}

// ── Página ──────────────────────────────────────────────────────────────
export default function VendasPage() {
    const [sources, setSources] = useState<any[]>([]);
    const [sourceId, setSourceId] = useState<string>('');
    const [periodKey, setPeriodKey] = useState('today');
    const [group, setGroup] = useState<Group>('campaign');
    const [report, setReport] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sort, setSort] = useState<{ col: keyof Row; dir: 1 | -1 }>({ col: 'spend', dir: -1 });
    const [showSetup, setShowSetup] = useState(false);
    const [detail, setDetail] = useState<any>(null);

    useEffect(() => {
        api.getTrackingSources().then((list) => {
            setSources(list || []);
            let saved = '';
            try { saved = localStorage.getItem('vendas_source') || ''; } catch { /* sem storage */ }
            const pick = (list || []).find((s: any) => s.id === saved) || (list || [])[0];
            if (pick) setSourceId(pick.id);
        }).catch(() => setError('Não foi possível carregar as fontes de tracking.'));
    }, []);

    const range = useMemo(() => (PERIODS.find((p) => p.key === periodKey) || PERIODS[0]).range(), [periodKey]);

    const load = useCallback(async () => {
        if (!sourceId) return;
        setLoading(true);
        setError('');
        try {
            const [rep, ords] = await Promise.all([
                api.getSalesReport(sourceId, { since: range[0], until: range[1], group }),
                api.getSalesOrders(sourceId, { since: range[0], until: range[1] }),
            ]);
            setReport(rep);
            setOrders(ords || []);
        } catch (e: any) {
            setError(e.message || 'Erro ao carregar relatório');
        } finally {
            setLoading(false);
        }
    }, [sourceId, range, group]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!sourceId) return;
        try { localStorage.setItem('vendas_source', sourceId); } catch { /* sem storage */ }
        setDetail(null);
    }, [sourceId]);

    useEffect(() => {
        if (showSetup && sourceId && !detail) api.getTrackingSource(sourceId).then(setDetail).catch(() => { /* sem detalhe */ });
    }, [showSetup, sourceId, detail]);

    const s = report?.summary;
    const source = sources.find((x) => x.id === sourceId);
    const isUtmGroup = group.startsWith('utm_');
    const activeTab = isUtmGroup ? 'utm_campaign' : group;

    const rows: Row[] = useMemo(() => {
        const list: Row[] = [...(report?.rows || [])];
        list.sort((a, b) => {
            const av = a[sort.col] as any; const bv = b[sort.col] as any;
            if (sort.col === 'name' || sort.col === 'key') return String(av).localeCompare(String(bv)) * sort.dir;
            return ((av ?? -Infinity) - (bv ?? -Infinity)) * sort.dir;
        });
        return list;
    }, [report, sort]);

    const totals = useMemo(() => {
        const t = rows.reduce((acc, r) => ({ sales: acc.sales + r.sales, revenue: acc.revenue + r.revenue, spend: acc.spend + r.spend }), { sales: 0, revenue: 0, spend: 0 });
        const profit = t.revenue - t.spend;
        return { ...t, profit, cpa: t.sales ? t.spend / t.sales : null, roas: t.spend ? t.revenue / t.spend : null, margin: t.revenue ? (profit / t.revenue) * 100 : null, roi: t.spend ? profit / t.spend : null };
    }, [rows]);

    const toggleSort = (col: keyof Row) => setSort((cur) => cur.col === col ? { col, dir: (cur.dir * -1) as 1 | -1 } : { col, dir: -1 });

    const columns: { key: keyof Row; label: string; render: (r: Row) => React.ReactNode; align?: 'right' }[] = [
        ...(group === 'campaign' ? [{
            key: 'budget' as keyof Row, label: 'Orçamento', align: 'right' as const,
            render: (r: Row) => r.budget ? <span>{brl(r.budget)}<div style={{ fontSize: 10, color: 'var(--text-muted)' }}>diário</div></span> : <span style={{ color: 'var(--text-muted)' }}>—</span>,
        }] : []),
        { key: 'sales', label: 'Vendas', align: 'right', render: (r) => <span>{r.sales}{r.pending_count > 0 && <div style={{ fontSize: 10, color: 'var(--accent-yellow)' }}>+{r.pending_count} pend.</div>}</span> },
        { key: 'cpa', label: 'CPA', align: 'right', render: (r) => brl(r.cpa) },
        { key: 'spend', label: 'Gastos', align: 'right', render: (r) => brl(r.spend) },
        { key: 'revenue', label: 'Faturamento', align: 'right', render: (r) => brl(r.revenue) },
        { key: 'profit', label: 'Lucro', align: 'right', render: (r) => <span style={{ color: signColor(r.profit), fontWeight: 600 }}>{brl(r.profit)}</span> },
        { key: 'roas', label: 'ROAS', align: 'right', render: (r) => <span style={{ color: r.roas == null ? 'var(--text-muted)' : r.roas >= 1 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{num2(r.roas)}</span> },
        { key: 'margin', label: 'Margem', align: 'right', render: (r) => <span style={{ color: signColor(r.margin) }}>{pct(r.margin)}</span> },
        { key: 'roi', label: 'ROI', align: 'right', render: (r) => <span style={{ color: signColor(r.roi) }}>{num2(r.roi)}</span> },
    ];

    const funnelSteps = s ? [
        { label: 'Cliques', value: s.funnel.clicks },
        { label: 'Vis. página', value: s.funnel.page_views },
        { label: 'Checkouts', value: s.funnel.initiate_checkout },
        { label: 'Vendas inic.', value: s.funnel.orders },
        { label: 'Vendas apr.', value: s.funnel.approved },
    ] : [];
    const funnelMax = Math.max(1, ...funnelSteps.map((f) => f.value));
    const hourMax = Math.max(1, ...(s?.by_hour || []).map((h: any) => h.count));

    const webhookUrl = source && detail?.webhook_secret ? `${API_BASE}/track/webhook/${source.public_token}?key=${detail.webhook_secret}` : '';
    const pixelSnippet = source ? `<script async src="${API_BASE}/track/pixel/${source.public_token}.js"></script>` : '';

    const selectStyle: React.CSSProperties = {
        padding: '8px 10px', fontSize: 13, background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'inherit', minWidth: 170,
    };

    return (
        <div style={{ padding: '24px 28px', maxWidth: 1480, margin: '0 auto' }}>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Vendas</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                        Pedidos das plataformas de checkout cruzados com o gasto da Meta — por campanha, conjunto, anúncio e UTM.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        Fonte de tracking
                        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={selectStyle}>
                            {sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        Período
                        <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} style={selectStyle}>
                            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                    </label>
                    <button className="btn btn-secondary" onClick={() => setShowSetup((v) => !v)} style={{ padding: '8px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Settings2 size={14} /> Configurar
                    </button>
                    <button className="btn btn-primary" onClick={load} disabled={loading} style={{ padding: '8px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Atualizar
                    </button>
                </div>
            </div>

            {/* Configuração */}
            {showSetup && source && (
                <Card style={{ marginBottom: 14, padding: '16px 18px' }}>
                    <SectionTitle>Como rastrear as vendas de {source.name}</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 18 }}>
                        <div>
                            <CopyField label="1. Script na página de vendas (antes do </head>)" value={pixelSnippet} />
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-4px 0 12px', lineHeight: 1.5 }}>
                                Captura clique, UTMs, fbclid/fbp/fbc e acrescenta automaticamente as UTMs + <code>sck</code> nos links de checkout
                                (Kiwify, Hotmart, Eduzz, Monetizze, Cakto, Hub.la…). Checkout em domínio próprio: adicione <code>data-tai-checkout</code> no botão.
                            </p>
                            <CopyField label="2. Parâmetros de URL nos anúncios (Meta → Anúncio → Parâmetros de URL)" value={META_UTM_TEMPLATE} />
                        </div>
                        <div>
                            {webhookUrl
                                ? <CopyField label="3. Webhook da Kiwify (Configurações → Webhooks)" value={webhookUrl} masked />
                                : <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Carregando URL do webhook…</div>}
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-4px 0 0', lineHeight: 1.6 }}>
                                Marque os eventos <b>Compra aprovada</b>, <b>Pix gerado</b>, <b>Boleto gerado</b>, <b>Compra recusada</b>,{' '}
                                <b>Compra reembolsada</b> e <b>Chargeback</b>. Só a compra aprovada é enviada pra Meta como Purchase;
                                os demais alimentam pendentes, reembolsos e taxa de aprovação.
                                <br />Hotmart, Eduzz, Monetizze e Cakto: em seguida.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {error && (
                <div style={{ padding: '10px 14px', marginBottom: 14, fontSize: 13, borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--accent-red)' }}>
                    {error}
                </div>
            )}

            {!sources.length && !error && (
                <Card style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                    Nenhuma fonte de tracking ainda — crie uma na página Tracking.
                </Card>
            )}

            {s && (
                <>
                    {/* KPIs principais */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
                        <Kpi icon={<DollarSign size={14} />} label="Faturamento líquido" value={brl(s.revenue_net)} hint={`Bruto ${brl(s.revenue_gross)}`} color="var(--text-primary)" />
                        <Kpi icon={<Target size={14} />} label="Gastos com anúncios" value={brl(s.spend)} hint={source?.meta_account_name || 'Conta Meta não vinculada'} />
                        <Kpi icon={s.roas != null && s.roas >= 1 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} label="ROAS" value={num2(s.roas)} hint={`ROI ${num2(s.roi)}`} color={s.roas == null ? undefined : s.roas >= 1 ? 'var(--accent-green)' : 'var(--accent-red)'} />
                        <Kpi icon={<DollarSign size={14} />} label="Lucro" value={brl(s.profit)} hint={`Margem ${pct(s.margin)}`} color={signColor(s.profit)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
                        <Kpi icon={<ShoppingCart size={14} />} label="Vendas aprovadas" value={String(s.approved_count)} hint={`Ticket ${brl(s.ticket)}`} color="var(--accent-green)" />
                        <Kpi icon={<Receipt size={14} />} label="CPA" value={brl(s.cpa)} />
                        <Kpi icon={<Clock size={14} />} label="Vendas pendentes" value={brl(s.pending_value)} hint={`${s.pending_count} pedido(s)`} color="var(--accent-yellow)" />
                        <Kpi icon={<RotateCcw size={14} />} label="Reembolsadas" value={brl(s.refunded_value)} hint={`${s.refunded_count} pedido(s)`} color={s.refunded_count ? 'var(--accent-red)' : undefined} />
                        <Kpi icon={<AlertTriangle size={14} />} label="Chargeback" value={pct(s.chargeback_rate)} hint={`${s.chargeback_count} pedido(s)`} color={s.chargeback_count ? 'var(--accent-red)' : undefined} />
                    </div>

                    {/* Distribuições */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 14 }}>
                        <Card>
                            <SectionTitle>Vendas por pagamento</SectionTitle>
                            <ShareList
                                empty="Sem vendas aprovadas no período."
                                items={s.by_payment.filter((p: any) => p.approved_count > 0).map((p: any) => ({
                                    label: PAYMENT_LABEL[p.method] || p.method, count: p.approved_count, pct: p.share,
                                    color: PAYMENT_COLOR[p.method], extra: brl(p.approved_value),
                                }))}
                            />
                        </Card>
                        <Card>
                            <SectionTitle>Taxa de aprovação</SectionTitle>
                            <ShareList
                                empty="Sem pedidos no período."
                                items={s.by_payment.filter((p: any) => p.approval_rate != null).map((p: any) => ({
                                    label: PAYMENT_LABEL[p.method] || p.method, count: p.approved_count, pct: p.approval_rate,
                                    color: PAYMENT_COLOR[p.method],
                                }))}
                            />
                        </Card>
                        <Card>
                            <SectionTitle>Vendas por produto</SectionTitle>
                            <ShareList empty="Sem vendas aprovadas no período." items={s.by_product.map((p: any) => ({ label: p.product, count: p.count, pct: p.pct, color: 'var(--accent-green)', extra: brl(p.value) }))} />
                        </Card>
                        <Card>
                            <SectionTitle>Vendas por fonte</SectionTitle>
                            <ShareList empty="Sem vendas aprovadas no período." items={s.by_source.map((p: any) => ({ label: p.source, count: p.count, pct: p.pct, color: 'var(--accent-blue)' }))} />
                        </Card>
                    </div>

                    {/* Funil + horário */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 10, marginBottom: 14 }}>
                        <Card>
                            <SectionTitle>Funil de conversão</SectionTitle>
                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${funnelSteps.length}, 1fr)`, gap: 8, alignItems: 'end' }}>
                                {funnelSteps.map((f, i) => {
                                    const prev = i > 0 ? funnelSteps[i - 1].value : null;
                                    const step = prev ? (f.value / prev) * 100 : null;
                                    return (
                                        <div key={f.label} style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', minHeight: 14 }}>{step != null ? pct(step) : ''}</div>
                                            <div style={{ height: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                                <div style={{ width: '70%', height: `${Math.max(3, (f.value / funnelMax) * 100)}%`, background: 'var(--accent-blue)', opacity: 0.35 + (0.65 * (i + 1)) / funnelSteps.length, borderRadius: '4px 4px 0 0' }} />
                                            </div>
                                            <div className="num" style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{f.value.toLocaleString('pt-BR')}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.label}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                        <Card>
                            <SectionTitle>Vendas por horário</SectionTitle>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130 }}>
                                {s.by_hour.map((h: any) => (
                                    <div key={h.hour} title={`${String(h.hour).padStart(2, '0')}h — ${h.count} venda(s) · ${h.pct.toFixed(1)}%`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                                        <div style={{ height: `${h.count ? Math.max(4, (h.count / hourMax) * 100) : 1}%`, background: h.count ? 'var(--accent-blue)' : 'var(--border)', borderRadius: '3px 3px 0 0' }} />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
                            </div>
                        </Card>
                    </div>

                    {/* Tabela agrupada */}
                    <Card style={{ padding: 0, marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 14px 0', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: 2 }}>
                                {GROUP_TABS.map((t) => (
                                    <button key={t.key} onClick={() => setGroup(t.key)} style={{
                                        padding: '8px 12px 10px', fontSize: 13, fontWeight: 600, background: 'transparent', border: 'none',
                                        borderBottom: activeTab === t.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
                                        color: activeTab === t.key ? 'var(--accent-blue)' : 'var(--text-muted)', cursor: 'pointer', marginBottom: -1,
                                    }}>{t.label}</button>
                                ))}
                            </div>
                            {isUtmGroup && (
                                <select value={group} onChange={(e) => setGroup(e.target.value as Group)} style={{ ...selectStyle, minWidth: 150, marginBottom: 8, padding: '5px 8px', fontSize: 12 }}>
                                    {UTM_FIELDS.map((u) => <option key={u.key} value={u.key}>Agrupar por {u.label}</option>)}
                                </select>
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-input)' }}>
                                        <th onClick={() => toggleSort('name')} style={thStyle('left')}>
                                            {group === 'day' ? 'Data' : GROUP_TABS.find((t) => t.key === activeTab)?.label.replace(/s$/, '') || 'Nome'} <SortIcon active={sort.col === 'name'} dir={sort.dir} />
                                        </th>
                                        {columns.map((c) => (
                                            <th key={String(c.key)} onClick={() => toggleSort(c.key)} style={thStyle(c.align || 'left')}>
                                                {c.label} <SortIcon active={sort.col === c.key} dir={sort.dir} />
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 && (
                                        <tr><td colSpan={columns.length + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                            {loading ? 'Carregando…' : 'Sem dados no período.'}
                                        </td></tr>
                                    )}
                                    {rows.map((r) => (
                                        <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
                                            <td style={{ padding: '9px 12px', maxWidth: 380 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                    {group === 'campaign' && r.status && (
                                                        <span title={r.status} style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: r.status === 'ACTIVE' ? 'var(--accent-green)' : 'var(--text-muted)' }} />
                                                    )}
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }} title={r.name}>
                                                        {group === 'day' ? new Date(`${r.key}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : r.name}
                                                    </span>
                                                </div>
                                                {r.meta_id && group !== 'day' && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{r.meta_id}</div>}
                                            </td>
                                            {columns.map((c) => (
                                                <td key={String(c.key)} className="num" style={{ padding: '9px 12px', textAlign: c.align || 'left', whiteSpace: 'nowrap' }}>{c.render(r)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                {rows.length > 0 && (
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                                            <td style={{ padding: '9px 12px' }}>{rows.length} {rows.length === 1 ? 'linha' : 'linhas'}</td>
                                            {columns.map((c) => {
                                                const v: Record<string, React.ReactNode> = {
                                                    budget: '', sales: totals.sales, cpa: brl(totals.cpa), spend: brl(totals.spend), revenue: brl(totals.revenue),
                                                    profit: <span style={{ color: signColor(totals.profit) }}>{brl(totals.profit)}</span>,
                                                    roas: num2(totals.roas), margin: pct(totals.margin), roi: num2(totals.roi),
                                                };
                                                return <td key={String(c.key)} className="num" style={{ padding: '9px 12px', textAlign: c.align || 'left', whiteSpace: 'nowrap' }}>{v[c.key as string]}</td>;
                                            })}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </Card>

                    {/* Pedidos */}
                    <Card style={{ padding: 0 }}>
                        <div style={{ padding: '12px 14px 0' }}><SectionTitle>Pedidos do período</SectionTitle></div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-input)' }}>
                                        {['Data', 'Produto', 'Cliente', 'Pagamento', 'Valor', 'Status', 'Campanha', 'Meta'].map((h) => (
                                            <th key={h} style={thStyle(h === 'Valor' ? 'right' : 'left')}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.length === 0 && (
                                        <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Nenhum pedido recebido no período. Configure o webhook da plataforma em "Configurar".
                                        </td></tr>
                                    )}
                                    {orders.map((o) => {
                                        const st = STATUS_LABEL[o.status] || { label: o.status, color: 'var(--text-muted)' };
                                        const campaignName = o.utm_campaign ? o.utm_campaign.split('|')[0] : null;
                                        return (
                                            <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(o.order_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                                <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.product_name || ''}>{o.product_name || '—'}</td>
                                                <td style={{ padding: '8px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name || '—'}</td>
                                                <td style={{ padding: '8px 12px' }}>{PAYMENT_LABEL[o.payment_method] || '—'}</td>
                                                <td className="num" style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{brl(Number(o.net_value ?? o.gross_value ?? 0))}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: st.color, border: `1px solid ${st.color}`, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>{st.label}</span>
                                                </td>
                                                <td style={{ padding: '8px 12px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: campaignName ? 'var(--text-primary)' : 'var(--text-muted)' }} title={o.utm_campaign || ''}>
                                                    {campaignName || 'sem UTM'}
                                                </td>
                                                <td style={{ padding: '8px 12px', fontSize: 11, color: o.purchase_event_id ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                                    {o.status === 'approved' ? (o.purchase_event_id ? 'Enviado' : 'Não enviado') : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}

function thStyle(align: 'left' | 'right'): React.CSSProperties {
    return {
        padding: '9px 12px', textAlign: align, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    };
}

function SortIcon({ active, dir }: { active: boolean; dir: 1 | -1 }) {
    if (!active) return null;
    return dir === -1 ? <ChevronDown size={11} style={{ verticalAlign: 'middle' }} /> : <ChevronUp size={11} style={{ verticalAlign: 'middle' }} />;
}
