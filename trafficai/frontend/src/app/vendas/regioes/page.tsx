'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useVendas, ErrorBox, brl } from '@/components/vendas/shared';
import styles from './regioes.module.css';

interface Region { state: string; country: string; visits: number; checkouts: number; orders: number; sales: number; revenue: number }
interface Report {
    since: string; until: string;
    rows: Region[];
    totals: { visits: number; checkouts: number; orders: number; sales: number; revenue: number };
    unknown: { orders: number; sales: number; revenue: number };
}

type Metric = 'sales' | 'revenue' | 'visits' | 'conv';
const METRICS: { key: Metric; label: string }[] = [
    { key: 'sales', label: 'Vendas' },
    { key: 'revenue', label: 'Receita' },
    { key: 'visits', label: 'Visitas' },
    { key: 'conv', label: 'Conversão' },
];
/** Mínimo de visitas pra conversão de um estado valer a comparação. */
const MIN_VISITS = 30;

// Mapa em blocos: [coluna, linha] aproximando a posição de cada estado.
const TILES: Record<string, [number, number, string]> = {
    RR: [2, 0, 'Roraima'], AP: [4, 0, 'Amapá'],
    AM: [1, 1, 'Amazonas'], PA: [3, 1, 'Pará'], MA: [4, 1, 'Maranhão'], CE: [5, 1, 'Ceará'], RN: [6, 1, 'Rio Grande do Norte'],
    AC: [0, 2, 'Acre'], RO: [1, 2, 'Rondônia'], MT: [2, 2, 'Mato Grosso'], TO: [3, 2, 'Tocantins'], PI: [4, 2, 'Piauí'], PE: [5, 2, 'Pernambuco'], PB: [6, 2, 'Paraíba'],
    MS: [2, 3, 'Mato Grosso do Sul'], GO: [3, 3, 'Goiás'], DF: [4, 3, 'Distrito Federal'], BA: [5, 3, 'Bahia'], AL: [6, 3, 'Alagoas'],
    PR: [2, 4, 'Paraná'], SP: [3, 4, 'São Paulo'], MG: [4, 4, 'Minas Gerais'], ES: [5, 4, 'Espírito Santo'], SE: [6, 4, 'Sergipe'],
    SC: [2, 5, 'Santa Catarina'], RJ: [4, 5, 'Rio de Janeiro'],
    RS: [2, 6, 'Rio Grande do Sul'],
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const UF_BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(TILES).map(([uf, t]) => [norm(t[2]), uf]));
const ufOf = (r: Region) => (r.country === 'BR' ? UF_BY_NAME[norm(r.state)] || (TILES[r.state.toUpperCase()] ? r.state.toUpperCase() : null) : null);

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const conv = (r: { visits: number; sales: number }) => (r.visits ? (r.sales / r.visits) * 100 : null);
const pc = (v: number | null) => (v == null ? '—' : `${v.toFixed(v < 10 ? 1 : 0).replace('.', ',')}%`);

function value(r: Region | undefined, m: Metric): number {
    if (!r) return 0;
    if (m === 'conv') return r.visits >= MIN_VISITS ? conv(r) || 0 : 0;
    return r[m];
}
function show(v: number, m: Metric): string {
    if (m === 'revenue') return v >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')} mil` : brl(v);
    if (m === 'conv') return pc(v);
    return fmt(v);
}

function TileMap({ byUf, metric, hover, setHover }: { byUf: Map<string, Region>; metric: Metric; hover: string | null; setHover: (uf: string | null) => void }) {
    const max = Math.max(0, ...[...byUf.values()].map((r) => value(r, metric)));
    return (
        <div className={styles.tiles} role="img" aria-label="Mapa do Brasil por estado">
            {Object.entries(TILES).map(([uf, [c, r, name]]) => {
                const row = byUf.get(uf);
                const v = value(row, metric);
                const t = max ? v / max : 0;
                const bg = v ? `rgba(14,165,233,${(0.16 + t * 0.74).toFixed(2)})` : 'rgba(255,255,255,.035)';
                return (
                    <div
                        key={uf}
                        className={`${styles.tile} ${hover === uf ? styles.tileOn : ''}`}
                        style={{ gridColumn: c + 1, gridRow: r + 1, background: bg, color: t > 0.45 ? '#fff' : undefined }}
                        title={`${name}: ${v ? show(v, metric) : 'sem dados'}`}
                        onMouseEnter={() => setHover(uf)}
                        onMouseLeave={() => setHover(null)}
                    >
                        <b>{uf}</b>
                        <span className="tai-mono">{v ? show(v, metric) : ''}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default function RegioesPage() {
    const { sourceId, since, until, reloadToken } = useVendas();
    const [data, setData] = useState<Report | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [metric, setMetric] = useState<Metric>('sales');
    const [hover, setHover] = useState<string | null>(null);

    useEffect(() => {
        if (!sourceId) return;
        let alive = true;
        setLoading(true); setError('');
        api.request<Report>('GET', `/tracking/sources/${sourceId}/regions?since=${since}&until=${until}`)
            .then((d) => { if (alive) setData(d); })
            .catch((e) => { if (alive) setError(e.message || 'Não consegui carregar as regiões.'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [sourceId, since, until, reloadToken]);

    const view = useMemo(() => {
        if (!data) return null;
        const byUf = new Map<string, Region>();
        for (const r of data.rows) { const uf = ufOf(r); if (uf) byUf.set(uf, r); }
        const avgConv = conv(data.totals);
        const eligible = data.rows.filter((r) => r.visits >= MIN_VISITS);
        const top = data.rows.find((r) => r.sales > 0) || null;
        const best = [...eligible].filter((r) => r.sales > 0).sort((a, b) => (conv(b) || 0) - (conv(a) || 0))[0] || null;
        // Muita visita e conversão abaixo da média: onde o anúncio gasta e não volta.
        const leak = avgConv != null
            ? [...eligible].filter((r) => (conv(r) || 0) < avgConv * 0.6 && r !== best).sort((a, b) => b.visits - a.visits)[0] || null
            : null;
        const rows = [...data.rows].sort((a, b) => value(b, metric) - value(a, metric) || b.visits - a.visits);
        return { byUf, avgConv, top, best, leak, rows };
    }, [data, metric]);

    if (error && !data) return <ErrorBox>{error}</ErrorBox>;
    if (!data || !view) return <div className={styles.loading}>{loading ? 'Carregando regiões…' : ''}</div>;
    if (!data.rows.length) return <div className={styles.empty}>Sem visitas nem pedidos com estado neste período.</div>;

    const { totals } = data;
    const maxShare = Math.max(1, ...view.rows.map((r) => value(r, metric)));

    return (
        <div className={styles.page}>
            <div className={styles.insights}>
                <div className={styles.ins}>
                    <small>Estado que mais vende</small>
                    <b>{view.top ? view.top.state : '—'}</b>
                    <span>{view.top ? `${fmt(view.top.sales)} vendas · ${pc(totals.sales ? (view.top.sales / totals.sales) * 100 : null)} do total` : 'nenhuma venda no período'}</span>
                </div>
                <div className={`${styles.ins} ${styles.insGood}`}>
                    <small>Melhor conversão</small>
                    <b>{view.best ? view.best.state : '—'}</b>
                    <span>{view.best ? `${pc(conv(view.best))} das visitas compram · média ${pc(view.avgConv)}` : `precisa de ${MIN_VISITS}+ visitas e 1 venda`}</span>
                </div>
                <div className={`${styles.ins} ${styles.insWarn}`}>
                    <small>Muita visita, pouca venda</small>
                    <b>{view.leak ? view.leak.state : '—'}</b>
                    <span>{view.leak ? `${fmt(view.leak.visits)} visitas · ${pc(conv(view.leak))} compram` : 'nenhum estado muito abaixo da média'}</span>
                </div>
            </div>

            <div className={styles.grid}>
                <section className={styles.card} aria-label="Mapa">
                    <div className={styles.hd}>
                        <div className={styles.lbl}>Mapa por estado</div>
                        <div className={styles.metrics} role="group" aria-label="Métrica do mapa">
                            {METRICS.map((m) => (
                                <button key={m.key} type="button" className={metric === m.key ? styles.mOn : undefined} onClick={() => setMetric(m.key)} aria-pressed={metric === m.key}>{m.label}</button>
                            ))}
                        </div>
                    </div>
                    <TileMap byUf={view.byUf} metric={metric} hover={hover} setHover={setHover} />
                    <div className={styles.legend}>
                        <span>menos</span><i /><span>mais</span>
                        {metric === 'conv' && <em>só estados com {MIN_VISITS}+ visitas</em>}
                    </div>
                </section>

                <section className={styles.card} aria-label="Estados">
                    <div className={styles.hd}>
                        <div className={styles.lbl}>Funil por estado</div>
                        <span className={styles.sub}>{fmt(totals.visits)} visitas · {fmt(totals.sales)} vendas · {brl(totals.revenue)}</span>
                    </div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>Estado</th><th>Visitas</th><th>Checkout</th><th>Pedidos</th><th>Vendas</th><th>Conversão</th><th>Receita</th></tr>
                            </thead>
                            <tbody>
                                {view.rows.map((r) => {
                                    const uf = ufOf(r);
                                    const c = conv(r);
                                    const good = c != null && view.avgConv != null && r.visits >= MIN_VISITS && c >= view.avgConv * 1.3;
                                    const bad = c != null && view.avgConv != null && r.visits >= MIN_VISITS && c < view.avgConv * 0.6;
                                    return (
                                        <tr key={`${r.country}-${r.state}`} className={uf && uf === hover ? styles.rowOn : undefined} onMouseEnter={() => setHover(uf)} onMouseLeave={() => setHover(null)}>
                                            <td>
                                                <div className={styles.st}>{uf && <b>{uf}</b>}{r.state}</div>
                                                <span className={styles.share}><i style={{ width: `${(value(r, metric) / maxShare) * 100}%` }} /></span>
                                            </td>
                                            <td className="tai-mono">{fmt(r.visits)}</td>
                                            <td className="tai-mono">{fmt(r.checkouts)}</td>
                                            <td className="tai-mono">{fmt(r.orders)}</td>
                                            <td className="tai-mono"><b>{fmt(r.sales)}</b></td>
                                            <td className={`tai-mono ${good ? styles.good : bad ? styles.bad : ''}`}>{r.visits ? pc(c) : '—'}</td>
                                            <td className="tai-mono">{brl(r.revenue)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {data.unknown.orders > 0 && (
                        <div className={styles.foot}>
                            + {fmt(data.unknown.orders)} {data.unknown.orders === 1 ? 'pedido' : 'pedidos'} ({fmt(data.unknown.sales)} {data.unknown.sales === 1 ? 'venda' : 'vendas'}, {brl(data.unknown.revenue)}) sem estado: a compra não passou pelo pixel.
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
