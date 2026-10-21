'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DollarSign } from 'lucide-react';
import {
    useSalesReport, useVendas, useLiveOrders, Card, Kpi, SectionTitle, ShareList, ErrorBox, CountBRL,
    brl, num2, pct, signColor, brtToday, PAYMENT_LABEL, PAYMENT_COLOR, Row,
} from '@/components/vendas/shared';
import { BrazilMap, StateData } from '@/components/BrazilMap';
import { api } from '@/lib/api';

const PERIOD_WORD: Record<string, string> = {
    today: 'de hoje', yesterday: 'de ontem', '7d': 'em 7 dias', '14d': 'em 14 dias', '30d': 'em 30 dias',
    month: 'do mês', last_month: 'do mês passado', custom: 'no período',
};

/** Linha de tendência do lucro diário (desenha ao carregar). */
function Sparkline({ values }: { values: number[] }) {
    if (values.length < 2) return null;
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * 600, 62 - ((v - min) / span) * 52]);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return (
        <svg viewBox="0 0 600 70" preserveAspectRatio="none" aria-hidden="true"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: 64, opacity: 0.9, pointerEvents: 'none' }}>
            <path d={`${d} L600 70 L0 70 Z`} fill="rgba(0,210,122,0.08)" />
            <path className="tai-draw" d={d} fill="none" stroke="var(--accent-green)" strokeWidth={2} />
        </svg>
    );
}

type ResumoFilters = { products: string[]; accounts: string[] };

/** Lista suspensa com caixas de seleção (produtos ou contas). */
function CheckDropdown({ label, summary, options, selected, onChange, emptyHint }: {
    label: string; summary: string; options: { value: string; label: string; hint?: string }[];
    selected: string[]; onChange: (next: string[]) => void; emptyHint: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
    }, [open]);
    const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    return (
        <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{label}</span>
            <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minWidth: 220, maxWidth: 360, padding: '8px 12px', fontSize: 13 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span><span aria-hidden="true">▾</span>
            </button>
            {open && (
                <div role="group" aria-label={label} style={{
                    position: 'absolute', zIndex: 40, top: '100%', left: 0, marginTop: 6, width: 'min(340px, calc(100vw - 32px))', maxHeight: 320, overflowY: 'auto',
                    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
                }}>
                    {!options.length && <p style={{ margin: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>{emptyHint}</p>}
                    {options.map((o) => (
                        <label key={o.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} style={{ marginTop: 2 }} />
                            <span style={{ minWidth: 0 }}>{o.label}{o.hint && <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11 }}>{o.hint}</small>}</span>
                        </label>
                    ))}
                    {selected.length > 0 && (
                        <button type="button" className="btn btn-secondary" onClick={() => onChange([])} style={{ width: '100%', marginTop: 6, padding: '6px 10px', fontSize: 12 }}>Limpar seleção</button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ResumoPage() {
    const { source, sourceId, periodKey, until, reload } = useVendas();
    // Filtros do Resumo, lembrados por fonte neste navegador.
    const [filters, setFiltersState] = useState<ResumoFilters>({ products: [], accounts: [] });
    useEffect(() => {
        let saved: ResumoFilters = { products: [], accounts: [] };
        try { const raw = localStorage.getItem(`vendas_resumo_filtros:${sourceId}`); if (raw) saved = { products: [], accounts: [], ...JSON.parse(raw) }; } catch { /* sem armazenamento */ }
        setFiltersState(saved);
    }, [sourceId]);
    const setFilters = (next: ResumoFilters) => {
        setFiltersState(next);
        try { localStorage.setItem(`vendas_resumo_filtros:${sourceId}`, JSON.stringify(next)); } catch { /* sem armazenamento */ }
    };
    const { data, loading, error } = useSalesReport('day', filters);
    const [toast, setToast] = useState<{ value: string; product: string } | null>(null);
    const [flashing, setFlashing] = useState(false);
    const timers = useRef<{ t?: any; f?: any }>({});

    const includesToday = until >= brtToday();
    const onNewSale = useCallback((o: any) => {
        setToast({ value: brl(Number(o.gross_value ?? o.net_value ?? 0)), product: o.product_name || 'Venda' });
        setFlashing(true);
        clearTimeout(timers.current.t); clearTimeout(timers.current.f);
        timers.current.t = setTimeout(() => setToast(null), 4000);
        timers.current.f = setTimeout(() => setFlashing(false), 1800);
        reload();
    }, [reload]);
    const { orders, freshIds } = useLiveOrders(sourceId, includesToday, onNewSale, filters.accounts);

    const s = data?.summary;
    const days: Row[] = data?.rows || [];
    const dailyProfit = useMemo(() => days.map((d) => d.profit), [days]);

    if (error) return <ErrorBox>{error}</ErrorBox>;
    if (!s) {
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }} aria-busy="true">
                {[2, 1, 1, 1, 1, 1, 1].map((span, i) => (
                    <div key={i} style={{ gridColumn: `span ${span}`, height: i === 0 ? 168 : 120, borderRadius: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', opacity: loading ? 0.6 : 0.3 }} />
                ))}
            </div>
        );
    }

    const funnelSteps = [
        { label: 'Cliques', value: s.funnel.clicks, color: 'var(--accent-blue)' },
        { label: 'Vis. página', value: s.funnel.page_views, color: 'var(--accent-blue)' },
        { label: 'Checkouts', value: s.funnel.initiate_checkout, color: 'var(--primary)' },
        { label: 'Vendas inic.', value: s.funnel.orders, color: 'var(--accent-green)' },
        { label: 'Aprovadas', value: s.funnel.approved, color: 'var(--accent-green)' },
    ];
    const funnelMax = Math.max(1, ...funnelSteps.map((f) => f.value));
    const hourMax = Math.max(1, ...s.by_hour.map((h: any) => h.count));
    const peakHour = s.by_hour.reduce((best: any, h: any) => (h.count > best.count ? h : best), { hour: 0, count: 0 });
    const dayMax = Math.max(1, ...days.map((d) => Math.max(d.revenue, d.spend)));
    const parts = [
        { label: 'Lucro', value: Math.max(0, s.profit), color: 'var(--accent-green)' },
        { label: 'Anúncios', value: s.spend, color: 'var(--accent-orange)' },
        { label: 'Imposto', value: s.tax, color: 'var(--accent-purple)' },
        { label: 'Custo de produto', value: s.product_cost, color: 'var(--accent-blue)' },
        { label: 'Despesas', value: s.expenses, color: 'var(--text-muted)' },
        { label: 'Taxas da plataforma', value: s.fees, color: 'var(--text-subtle)' },
    ];
    const partsTotal = parts.reduce((n, p) => n + p.value, 0) || 1;
    const noOrders = s.total_orders === 0;

    return (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {toast && (
                <div className="tai-toast" role="status" aria-live="polite" style={{
                    position: 'fixed', top: 24, right: 32, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px 12px 12px', background: 'var(--bg-surface)', border: '1px solid rgba(0,210,122,0.45)',
                    borderRadius: 14, boxShadow: '0 18px 40px rgba(0,0,0,0.55)', minWidth: 300,
                }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(0,210,122,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-green)' }}>
                        <DollarSign size={18} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>Venda aprovada!</span>
                        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                            Valor: <span className="tai-mono" style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{toast.value}</span> · {toast.product}
                        </span>
                    </div>
                </div>
            )}

            {(() => {
                const productOptions: string[] = s.product_options || [];
                const accountOptions: { id: string; name: string; meta_account_id: string | null }[] = s.account_options || [];
                const defaultName = accountOptions.find((a) => a.id === s.default_account_id)?.name;
                const productSummary = filters.products.length === 0 ? 'Todos os produtos'
                    : filters.products.length === 1 ? filters.products[0] : `${filters.products.length} produtos`;
                const accountSummary = filters.accounts.length === 0 ? (defaultName ? `Conta da fonte · ${defaultName}` : 'Conta da fonte')
                    : filters.accounts.length === 1 ? (accountOptions.find((a) => a.id === filters.accounts[0])?.name || '1 conta') : `${filters.accounts.length} contas somadas`;
                return (
                    <Card flat style={{ padding: '12px 16px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <CheckDropdown label="Produtos" summary={productSummary} selected={filters.products}
                            options={productOptions.map((p) => ({ value: p, label: p }))}
                            onChange={(products) => setFilters({ ...filters, products })} emptyHint="Nenhum produto vendido nos últimos 90 dias." />
                        <CheckDropdown label="Contas de anúncio (vendas e gastos)" summary={accountSummary} selected={filters.accounts}
                            options={accountOptions.map((a) => ({ value: a.id, label: a.name, hint: a.id === s.default_account_id ? 'Conta vinculada a esta fonte' : a.meta_account_id || undefined }))}
                            onChange={(accounts) => setFilters({ ...filters, accounts })} emptyHint="Nenhuma conta de anúncio ativa." />
                        {loading && <span role="status" style={{ fontSize: 12, color: 'var(--text-muted)', paddingBottom: 9 }}>Atualizando…</span>}
                        {(filters.products.length > 0 || filters.accounts.length > 0) && (
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexBasis: '100%' }}>
                                Vendas e gastos consideram as contas selecionadas e os produtos marcados. Cada pedido entra uma única vez, na conta identificada pela campanha.
                            </span>
                        )}
                    </Card>
                );
            })()}

            {source && !source.account_id && filters.accounts.length === 0 && (
                <Card flat style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--accent-yellow)' }}>
                    Essa fonte não tem conta de anúncio vinculada — gastos, ROAS e CPA ficam zerados. Vincule em Fontes e WhatsApp → Editar credenciais.
                </Card>
            )}
            {noOrders && (
                <Card flat style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    Nenhum pedido nesse período. Se ainda não configurou, conecte a plataforma em{' '}
                    <Link href="/vendas/integracoes" style={{ color: 'var(--accent-blue)' }}>Integrações</Link> e instale o{' '}
                    <Link href="/vendas/pixel" style={{ color: 'var(--accent-blue)' }}>pixel</Link> na página de vendas.
                </Card>
            )}

            {/* Linha 1 — lucro em destaque + faturamento + gastos */}
            <section className="tai-grid-4">
                <Card delay={60} className={`tai-span-2 ${flashing ? 'tai-flash' : ''}`} style={{ position: 'relative', overflow: 'hidden', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 168 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Lucro {PERIOD_WORD[periodKey] || ''}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: signColor(s.margin), background: 'rgba(0,210,122,0.1)', padding: '2px 9px', borderRadius: 999 }}>margem {pct(s.margin)}</span>
                    </div>
                    <CountBRL value={s.profit} style={{ fontSize: 44, fontWeight: 600, color: signColor(s.profit), lineHeight: 1 }} />
                    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-secondary)', position: 'relative', zIndex: 1 }}>
                        <span>ROI <b className="tai-mono" style={{ color: 'var(--text-primary)' }}>{num2(s.roi)}</b></span>
                        <span>Ticket <b className="tai-mono" style={{ color: 'var(--text-primary)' }}>{brl(s.ticket)}</b></span>
                        <span>Custos totais <b className="tai-mono" style={{ color: 'var(--text-primary)' }}>{brl(s.total_costs)}</b></span>
                    </div>
                    <Sparkline values={dailyProfit} />
                </Card>
                <Card delay={120} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Faturamento líquido</span>
                    <CountBRL value={s.revenue_net} style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bruto <span className="tai-mono" style={{ color: 'var(--text-secondary)' }}>{brl(s.revenue_gross)}</span></span>
                    <div style={{ marginTop: 'auto', height: 4, borderRadius: 2, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                        <div className="tai-barx" style={{ width: `${s.revenue_gross ? Math.min(100, (s.revenue_net / s.revenue_gross) * 100) : 0}%`, height: '100%', background: 'var(--primary)', animationDelay: '400ms' }} />
                    </div>
                </Card>
                <Card delay={180} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Gastos com anúncios</span>
                    <CountBRL value={s.spend} style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        ROAS <span className="tai-mono" style={{ color: s.roas != null && s.roas >= 1 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>{num2(s.roas)}</span>
                        {' · '}{s.spend_live ? 'Meta ao vivo' : 'última sincronização'}
                    </span>
                    <div style={{ marginTop: 'auto', height: 4, borderRadius: 2, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                        <div className="tai-barx" style={{ width: `${s.revenue_net ? Math.min(100, (s.spend / s.revenue_net) * 100) : 0}%`, height: '100%', background: 'var(--accent-orange)', animationDelay: '460ms' }} />
                    </div>
                </Card>
            </section>

            {/* Linha 2 — volume e qualidade */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
                <Kpi delay={240} label="Vendas aprovadas" value={String(s.approved_count)} hint="pedidos pagos no período" color="var(--accent-green)" />
                <Kpi delay={265} label="Ticket médio" value={s.approved_count > 0 ? brl(s.revenue_gross / s.approved_count) : '—'} hint={s.approved_count > 0 ? `líquido ${brl(s.ticket)}` : 'sem vendas no período'} />
                <Kpi delay={290} label="CPA" value={brl(s.cpa)} hint="custo por venda" />
                <Kpi delay={340} label="Pendentes" value={brl(s.pending_value)} hint={`${s.pending_count} Pix/boleto(s)`} color="var(--accent-yellow)" />
                <Kpi delay={390} label="ROI" value={num2(s.roi)} hint="lucro ÷ custos" color="var(--accent-blue)" />
                <Kpi delay={440} label="Reembolsos" value={brl(s.refunded_value)} hint={`${s.refunded_count} pedido(s) · chargeback ${pct(s.chargeback_rate)}`} color={s.refunded_count || s.chargeback_count ? 'var(--accent-red)' : undefined} />
            </section>

            {/* Para onde foi o dinheiro */}
            <Card delay={480} style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SectionTitle right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Faturamento bruto <span className="tai-mono" style={{ color: 'var(--text-primary)' }}>{brl(s.revenue_gross)}</span></span>}>
                    Para onde foi cada real faturado
                </SectionTitle>
                <div role="img" aria-label={parts.map((p) => `${p.label} ${brl(p.value)}`).join(', ')} style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
                    {parts.filter((p) => p.value > 0).map((p, i) => (
                        <div key={p.label} className="tai-barx" style={{ width: `${(p.value / partsTotal) * 100}%`, background: p.color, animationDelay: `${520 + i * 80}ms` }} />
                    ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                    {parts.map((p) => (
                        <div key={p.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />{p.label}
                            </span>
                            <span className="tai-mono" style={{ fontSize: 15, fontWeight: 600 }}>{brl(p.value)}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct((p.value / partsTotal) * 100)}</span>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Gráfico diário + vendas ao vivo */}
            <section className="tai-grid-3">
                <Card reveal className="tai-span-2" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <SectionTitle right={
                        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-green)' }} />Faturamento</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-orange)' }} />Gastos</span>
                        </div>
                    }>Faturamento × gastos por dia</SectionTitle>
                    {days.length > 1 ? (
                        <>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: days.length > 20 ? 2 : 8, height: 210, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>
                                {days.map((d, i) => (
                                    <div key={d.key} title={`${new Date(`${d.key}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} · Faturamento ${brl(d.revenue)} · Gastos ${brl(d.spend)} · Lucro ${brl(d.profit)}`}
                                        style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                                        <div className="tai-bar" style={{ flex: 1, height: `${(d.revenue / dayMax) * 100}%`, background: 'var(--accent-green)', borderRadius: '4px 4px 0 0', animationDelay: `${i * 40}ms` }} />
                                        <div className="tai-bar" style={{ flex: 1, height: `${(d.spend / dayMax) * 100}%`, background: 'var(--accent-orange)', opacity: 0.85, borderRadius: '4px 4px 0 0', animationDelay: `${i * 40}ms` }} />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: days.length > 20 ? 2 : 8, fontSize: 10.5, color: 'var(--text-subtle)' }}>
                                {days.map((d, i) => (
                                    <span key={d.key} style={{ flex: 1, textAlign: 'center' }}>{days.length <= 16 || i % 3 === 0 ? d.key.slice(8, 10) : ''}</span>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Escolha um período de 2 dias ou mais pra ver a evolução.</div>
                    )}
                </Card>
                <Card reveal style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <SectionTitle right={includesToday ? <span className="tai-live" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--accent-green)' }} /> : undefined}>
                        {includesToday ? 'Vendas ao vivo' : 'Últimos pedidos de hoje'}
                    </SectionTitle>
                    {!includesToday ? (
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>O ao vivo aparece quando o período inclui hoje.</div>
                    ) : orders.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>Nenhum pedido hoje ainda. Quando chegar, aparece aqui na hora.</div>
                    ) : (
                        <div role="log" aria-live="polite" style={{ display: 'flex', flexDirection: 'column' }}>
                            {orders.slice(0, 6).map((o) => {
                                const kind = o.status === 'approved' ? ['var(--accent-green)', 'rgba(0,210,122,0.14)', 'R$']
                                    : o.status === 'pending' ? ['var(--accent-blue)', 'rgba(56,189,248,0.14)', o.payment_method === 'boleto' ? 'BOL' : 'PIX']
                                        : ['var(--accent-red)', 'rgba(239,68,68,0.14)', '!'];
                                const label = o.status === 'approved' ? 'Venda aprovada' : o.status === 'pending' ? 'Aguardando pagamento' : o.status === 'refused' ? 'Recusada' : o.status === 'refunded' ? 'Reembolsada' : o.status;
                                return (
                                    <div key={o.id} className={freshIds.has(o.id) ? 'tai-feed-new' : ''} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                                        <div style={{ width: 30, height: 30, borderRadius: 8, background: kind[1], color: kind[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{kind[2]}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 }}>
                                            <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.product_name || label}{o.customer_name ? ` — ${o.customer_name.split(' ')[0]}` : ''}</span>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {label} · {PAYMENT_LABEL[o.payment_method] || '—'} · {new Date(o.order_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <span className="tai-mono" style={{ fontSize: 12.5, fontWeight: 600, color: kind[0] }}>{brl(Number(o.gross_value ?? o.net_value ?? 0))}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </section>

            {/* Funil + horário */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14 }}>
                <Card reveal style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <SectionTitle>Funil de conversão</SectionTitle>
                    {funnelSteps.map((f, i) => {
                        const prev = i > 0 ? funnelSteps[i - 1].value : null;
                        return (
                            <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) 64px', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{f.label}</span>
                                <div style={{ height: 26, background: 'var(--bg-surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                                    <div className="tai-barx" style={{
                                        width: `${Math.max(f.value ? 8 : 0, Math.sqrt(f.value / funnelMax) * 100)}%`, height: '100%', background: f.color, borderRadius: 6,
                                        display: 'flex', alignItems: 'center', paddingLeft: 10, boxSizing: 'border-box', animationDelay: `${i * 90}ms`,
                                    }}>
                                        <span className="tai-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--bg-base)' }}>{f.value.toLocaleString('pt-BR')}</span>
                                    </div>
                                </div>
                                <span className="tai-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'right' }}>{prev ? pct((f.value / prev) * 100) : ''}</span>
                            </div>
                        );
                    })}
                </Card>
                <Card reveal style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <SectionTitle right={peakHour.count > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>pico às <b style={{ color: 'var(--text-primary)' }}>{String(peakHour.hour).padStart(2, '0')}h</b></span>}>
                        Vendas por horário
                    </SectionTitle>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 170 }}>
                        {s.by_hour.map((h: any, i: number) => (
                            <div key={h.hour} className="tai-bar" title={`${String(h.hour).padStart(2, '0')}h — ${h.count} venda(s)`} style={{
                                flex: 1, height: `${h.count ? Math.max(4, (h.count / hourMax) * 100) : 2}%`,
                                background: h.count && h.hour === peakHour.hour ? 'var(--accent-green)' : h.count ? 'var(--primary)' : 'var(--border)',
                                borderRadius: '3px 3px 0 0', animationDelay: `${i * 25}ms`,
                            }} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-subtle)' }}><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span></div>
                </Card>
            </section>

            {/* Distribuições */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                <Card reveal>
                    <PaymentApproval items={s.by_payment} />
                </Card>
                <Card reveal>
                    <SectionTitle>Vendas por produto</SectionTitle>
                    <ShareList empty="Sem vendas aprovadas no período." items={s.by_product.map((p: any) => ({ label: p.product, count: p.count, pct: p.pct, color: 'var(--accent-green)', extra: brl(p.value) }))} />
                </Card>
                <Card reveal>
                    <SectionTitle>Vendas por fonte</SectionTitle>
                    <ShareList empty="Sem vendas aprovadas no período." items={s.by_source.map((p: any) => ({ label: p.source, count: p.count, pct: p.pct, color: 'var(--accent-blue)' }))} />
                </Card>
            </section>

            {/* Mapa de regiões */}
            <RegionMap sourceId={sourceId} />
        </div>
    );
}

// ─── Aprovação por forma de pagamento: pedidos pagos sobre pedidos gerados ───
function PaymentApproval({ items }: { items: any[] }) {
    const main = ['credit_card', 'pix', 'boleto'];
    const rows = [...main, ...items.map((p) => p.method).filter((m) => !main.includes(m))].map((method) => {
        const p = items.find((x) => x.method === method);
        const rate: number | null = p?.approval_rate ?? null;
        const paid: number = p?.approved_count ?? 0;
        // A API devolve pagos e taxa; os pedidos gerados saem da divisão.
        const orders = rate ? Math.round(paid / (rate / 100)) : null;
        return { method, rate, paid, orders, share: p?.share ?? 0 };
    }).filter((r) => main.includes(r.method) || r.rate != null);
    const paid = rows.reduce((n, r) => n + (r.orders ? r.paid : 0), 0);
    const orders = rows.reduce((n, r) => n + (r.orders ?? 0), 0);
    const R = 17, C = 2 * Math.PI * R;
    return (
        <>
            <SectionTitle right={orders > 0 && <span className="tai-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>geral {pct((paid / orders) * 100)}</span>}>Taxa de aprovação</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {rows.map((r) => (
                    <div key={r.method} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={r.rate != null ? `${PAYMENT_LABEL[r.method] || r.method}: ${pct(r.rate)} de aprovação` : `${PAYMENT_LABEL[r.method] || r.method}: sem pedidos`} style={{ flexShrink: 0 }}>
                            <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                            {r.rate != null && r.rate > 0 && (
                                <circle cx="22" cy="22" r={R} fill="none" stroke={PAYMENT_COLOR[r.method] || 'var(--accent-blue)'} strokeWidth="5" strokeLinecap="round"
                                    strokeDasharray={`${(Math.min(r.rate, 100) / 100) * C} ${C}`} transform="rotate(-90 22 22)" />
                            )}
                        </svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexGrow: 1 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{PAYMENT_LABEL[r.method] || r.method}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                {r.rate == null ? 'Sem pedidos no período'
                                    : r.orders ? `${r.paid} ${r.paid === 1 ? 'pago' : 'pagos'} de ${r.orders} · ${pct(r.share)} das vendas`
                                    : 'Nenhum pedido pago'}
                            </span>
                        </div>
                        <span className="tai-mono" style={{ fontSize: 18, fontWeight: 600, color: r.rate == null ? 'var(--text-muted)' : 'var(--text-primary)' }}>{r.rate == null ? 'N/A' : pct(r.rate)}</span>
                    </div>
                ))}
            </div>
        </>
    );
}

// ─── Region Map — fetches stats and renders BrazilMap ────────────────────────
function RegionMap({ sourceId }: { sourceId: string | null }) {
    const [byState, setByState] = useState<StateData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!sourceId) return;
        setLoading(true);
        api.getTrackingStats(sourceId, 7)
            .then((stats: any) => {
                setByState(stats?.by_state || []);
            })
            .catch(() => setByState([]))
            .finally(() => setLoading(false));
    }, [sourceId]);

    if (loading || byState.length === 0) return null;

    return (
        <Card reveal style={{ marginTop: 14 }}>
            <SectionTitle>Regiões (últimos 7 dias)</SectionTitle>
            <BrazilMap byState={byState} />
        </Card>
    );
}
