'use client';

import React from 'react';
import Link from 'next/link';
import { Row, brl, pct, useIsNarrow } from './shared';
import styles from './overview.module.css';

/**
 * Visão geral do Resumo: 3 cards (Tráfego, Funil, Vendas) e o funil afunilado
 * do anúncio ao pagamento. Tráfego vem da Meta (somado dos dias do período);
 * visitas e finalizações caem pro pixel quando a Meta não respondeu.
 */

export interface OverviewTotals {
    spend: number;
    impressions: number | null;
    clicks: number | null;
    visits: number | null;
    checkouts: number | null;
    visitsFromPixel: boolean;
    orders: number;
    paid: number;
    revenueGross: number;
    revenueNet: number;
    recovered: number;
}

const sumOrNull = (rows: Row[], key: keyof Row): number | null => {
    let total = 0, seen = false;
    for (const r of rows) { const v = r[key] as number | null | undefined; if (v != null) { total += v; seen = true; } }
    return seen ? total : null;
};

/** Junta os dias do relatório com o resumo; visitas/finalizações caem pro pixel sem dado da Meta. */
export function overviewTotals(days: Row[], s: any): OverviewTotals {
    const lpv = sumOrNull(days, 'landing_views');
    const ic = sumOrNull(days, 'initiate_checkouts');
    const fromPixel = lpv == null;
    return {
        spend: s.spend || 0,
        impressions: sumOrNull(days, 'impressions'),
        clicks: sumOrNull(days, 'clicks'),
        visits: lpv ?? (s.funnel?.page_views || null),
        checkouts: ic ?? (s.funnel?.initiate_checkout || null),
        visitsFromPixel: fromPixel,
        orders: s.order_people ?? s.total_orders ?? 0,
        paid: s.approved_count || 0,
        revenueGross: s.revenue_gross || 0,
        revenueNet: s.revenue_net || 0,
        recovered: s.recovered_count || 0,
    };
}

const int = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const per = (a: number, b: number | null) => (b ? brl(a / b) : '—');
const rate = (a: number | null, b: number | null) => (a != null && b ? (a / b) * 100 : null);
const compact = (v: number | null) => v == null ? '—' : v >= 10000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : v.toLocaleString('pt-BR');

function Line({ label, sub, value, color }: { label: string; sub?: string; value: string; color?: string }) {
    return (
        <div className={styles.line}>
            <div>{label}{sub && <small>{sub}</small>}</div>
            <span className="tai-mono" style={color ? { color } : undefined}>{value}</span>
        </div>
    );
}

export function OverviewCards({ t, live }: { t: OverviewTotals; live: boolean }) {
    const cpm = t.impressions ? (t.spend / t.impressions) * 1000 : null;
    const ctr = rate(t.clicks, t.impressions);
    const realCost = t.paid ? (t.spend - t.revenueNet) / t.paid : null;
    const visitsWord = t.visitsFromPixel ? 'visitas registradas pelo pixel' : 'visualizações da página';
    return (
        <section className={styles.three} aria-label="Visão geral">
            <div className={`${styles.card} ${styles.traffic}`}>
                <div className={styles.hd}><span className={styles.lbl}><b style={{ background: '#0284c7' }} />Tráfego</span><Link href="/vendas/campanhas">ver campanhas →</Link></div>
                <div className={`${styles.main} tai-mono`}>{brl(t.spend)}</div>
                <div className={styles.ms}>investidos · {compact(t.impressions)} impressões{cpm != null && ` · CPM ${brl(cpm)}`}{!live && ' · última sincronização'}</div>
                <Line label="CPC no link" sub={`${int(t.clicks)} cliques${ctr != null ? ` · CTR ${pct(ctr)}` : ''}`} value={per(t.spend, t.clicks)} />
                <Line label="Custo por visita" sub={`${int(t.visits)} ${visitsWord}`} value={per(t.spend, t.visits)} />
                <Line label="Custo por finalização" sub={`${int(t.checkouts)} finalizações de compra`} value={per(t.spend, t.checkouts)} />
                <Line label="Custo por venda" sub={`investimento ÷ ${int(t.paid)} ${t.paid === 1 ? 'venda' : 'vendas'}`} value={per(t.spend, t.paid)} />
            </div>
            <div className={`${styles.card} ${styles.funnel}`}>
                <div className={styles.hd}><span className={styles.lbl}><b style={{ background: '#7c5cc4' }} />Funil</span><Link href="/vendas/pedidos">ver pedidos →</Link></div>
                <div className={`${styles.main} tai-mono`}>{int(t.orders)}</div>
                <div className={styles.ms}>{t.orders === 1 ? 'pessoa gerou' : 'pessoas geraram'} o pedido{rate(t.orders, t.visits) != null && ` · ${pct(rate(t.orders, t.visits))} das visitas`}</div>
                <Line label="Visitaram a página" sub={rate(t.visits, t.clicks) != null ? `${pct(rate(t.visits, t.clicks))} dos cliques` : visitsWord} value={int(t.visits)} />
                <Line label="Finalizaram a compra" sub={rate(t.checkouts, t.visits) != null ? `${pct(rate(t.checkouts, t.visits))} das visitas` : 'clicaram em comprar'} value={int(t.checkouts)} />
                <Line label="Geraram o pedido" sub={rate(t.orders, t.checkouts) != null ? `${pct(rate(t.orders, t.checkouts))} das finalizações` : 'pessoas distintas'} value={int(t.orders)} />
                <Line label="Pagaram" sub={rate(t.paid, t.orders) != null ? `${pct(rate(t.paid, t.orders))} de quem gerou o pedido` : 'pedidos aprovados'} value={int(t.paid)} />
            </div>
            <div className={`${styles.card} ${styles.sales}`}>
                <div className={styles.hd}><span className={styles.lbl}><b style={{ background: '#00a862' }} />Vendas</span><Link href="/vendas/diario">dia a dia →</Link></div>
                <div className={`${styles.main} tai-mono`} style={{ color: 'var(--accent-green)' }}>{int(t.paid)}</div>
                <div className={styles.ms}>{t.paid === 1 ? 'cliente pagante' : 'clientes pagantes'} no período</div>
                <Line label="Faturamento" sub="bruto no checkout" value={brl(t.revenueGross)} />
                <Line label="Recebido" sub="líquido das plataformas" value={brl(t.revenueNet)} />
                {realCost != null && realCost >= 0
                    ? <Line label="Custo real por cliente" sub="investimento menos o recebido" value={brl(realCost)} color="var(--accent-green)" />
                    : <Line label="Lucro por cliente" sub="recebido menos o investimento" value={realCost != null ? brl(-realCost) : '—'} color="var(--accent-green)" />}
                <Line label="Recuperados" sub="pedidos pendentes que viraram venda" value={int(t.recovered)} />
            </div>
        </section>
    );
}

const STEP_COLORS = ['#075985', '#0369a1', '#0284c7', '#0ea5e9', '#ff6b35', '#00d27a'];

/** Funil afunilado: largura em escala logarítmica pra etapas pequenas continuarem visíveis. */
export function TaperFunnel({ t }: { t: OverviewTotals }) {
    // No celular o SVG encolhe com a tela: base mais estreita mantém o texto legível.
    const narrow = useIsNarrow(760);
    const steps = [
        { label: 'Impressões', value: t.impressions, hint: 'CTR no link' },
        { label: 'Cliques no link', value: t.clicks, hint: 'carregou a página' },
        { label: t.visitsFromPixel ? 'Visitas (pixel)' : 'Visitaram a página', value: t.visits, hint: 'clicou em comprar' },
        { label: 'Finalizaram a compra', value: t.checkouts, hint: 'gerou o pedido' },
        { label: 'Geraram o pedido', value: t.orders, hint: 'pagou' },
        { label: 'Pagaram', value: t.paid, hint: '' },
    ].map((s, i) => ({ ...s, color: STEP_COLORS[i] })).filter((s) => s.value != null && s.value > 0) as Array<{ label: string; value: number; hint: string; color: string }>;

    if (steps.length < 2) {
        return <div className={styles.funnelEmpty}>Sem volume suficiente no período para montar o funil.</div>;
    }

    const W = narrow ? 400 : 860, rowH = narrow ? 44 : 50, gap = 5, max = narrow ? 390 : 760, min = narrow ? 150 : 170;
    const H = steps.length * (rowH + gap);
    const lg = (v: number) => Math.log10(Math.max(1, v));
    const L0 = lg(steps[steps.length - 1].value), L1 = lg(steps[0].value);
    const width = (v: number) => (L1 === L0 ? max : min + ((max - min) * (lg(v) - L0)) / (L1 - L0));

    const passages = steps.slice(1).map((s, i) => ({ from: steps[i].label, to: s.label, rate: (s.value / steps[i].value) * 100, hint: steps[i].hint }));
    // Gargalo: menor passagem a partir da página (CTR é naturalmente baixo e não entra).
    const candidates = passages.filter((p) => p.from !== 'Impressões');
    const worst = candidates.length ? candidates.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;

    return (
        <section className={styles.fun} aria-label="Funil do anúncio ao pagamento">
            <div className={styles.card}>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={steps.map((s) => `${s.label} ${s.value}`).join(', ')}>
                    {steps.map((s, i) => {
                        const w = width(s.value);
                        const next = i < steps.length - 1 ? width(steps[i + 1].value) : w * 0.92;
                        const y = i * (rowH + gap), x0 = (W - w) / 2, x1 = (W - next) / 2;
                        return (
                            <g key={s.label}>
                                <path d={`M${x0} ${y} L${x0 + w} ${y} L${x1 + next} ${y + rowH} L${x1} ${y + rowH} Z`} fill={s.color} opacity={0.94} />
                                <text x={W / 2} y={y + (narrow ? 27 : 31)} textAnchor="middle" fill="#fff" fontFamily="var(--font-sans)" fontSize={narrow ? 13 : 15} fontWeight={600}>
                                    {s.label}{'  '}<tspan fontFamily="var(--font-mono)" fontWeight={700} fontSize={narrow ? 15 : 18}>{s.value.toLocaleString('pt-BR')}</tspan>
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            <div className={`${styles.card} ${styles.side}`}>
                <div className={styles.lbl} style={{ marginBottom: 6 }}>Passagem entre etapas</div>
                {passages.map((p) => {
                    const bad = worst && p === worst;
                    return (
                        <div key={p.to} className={styles.pass}>
                            <div>{p.from} → {p.to}<small>{bad ? 'maior gargalo do funil' : p.hint}</small></div>
                            <span className="tai-mono" style={bad ? { color: 'var(--primary-orange)' } : undefined}>{pct(p.rate)}</span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
