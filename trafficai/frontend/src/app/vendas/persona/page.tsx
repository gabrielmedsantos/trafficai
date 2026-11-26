'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useVendas, ErrorBox, brl } from '@/components/vendas/shared';
import styles from './persona.module.css';

interface Cell { age: string; gender: 'female' | 'male' | 'unknown'; spend: number; impressions: number; clicks: number; checkouts: number; purchases: number }
interface Option { value: string; people: number; completed: number; paid: number }
interface Question { key: string; label: string; total: number; paid: number; options: Option[] }
interface Persona {
    since: string; until: string;
    meta: { live: boolean; cells: Cell[] };
    quiz: { sessions: number; paid: number; questions: Question[] };
}

type Metric = 'purchases' | 'spend' | 'clicks' | 'cpa';
const METRICS: { key: Metric; label: string }[] = [
    { key: 'purchases', label: 'Compras' },
    { key: 'spend', label: 'Gasto' },
    { key: 'clicks', label: 'Cliques' },
    { key: 'cpa', label: 'Custo/compra' },
];
const AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const G_LABEL = { female: 'Mulheres', male: 'Homens' } as const;
const G_COLOR = { female: '#f472b6', male: '#38bdf8' } as const;

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const pc = (v: number | null) => (v == null ? '—' : `${v.toFixed(v < 10 ? 1 : 0).replace('.', ',')}%`);
const money = (v: number | null) => (v == null ? '—' : v >= 100 ? `R$ ${fmt(v)}` : brl(v));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Agg = { spend: number; clicks: number; purchases: number; impressions: number };
const zero = (): Agg => ({ spend: 0, clicks: 0, purchases: 0, impressions: 0 });
const metricOf = (a: Agg | undefined, m: Metric): number | null => {
    if (!a) return null;
    if (m === 'cpa') return a.purchases ? a.spend / a.purchases : null;
    return a[m];
};
const showMetric = (v: number | null, m: Metric) => (v == null ? '—' : m === 'spend' || m === 'cpa' ? money(v) : fmt(v));

function Pyramid({ grid, metric }: { grid: Map<string, Agg>; metric: Metric }) {
    const ages = AGES.filter((a) => grid.has(`${a}|female`) || grid.has(`${a}|male`));
    const vals = ages.flatMap((a) => (['female', 'male'] as const).map((g) => metricOf(grid.get(`${a}|${g}`), metric) || 0));
    const max = Math.max(1, ...vals);
    // No custo por compra, barra maior = mais barato (melhor).
    const minCpa = metric === 'cpa' ? Math.min(...vals.filter((v) => v > 0)) : 0;
    const width = (v: number | null) => {
        if (!v) return 0;
        return metric === 'cpa' ? Math.max(8, (minCpa / v) * 100) : Math.max(3, (v / max) * 100);
    };
    return (
        <div className={styles.pyr}>
            <div className={styles.pyrHead}><span style={{ color: G_COLOR.female }}>{G_LABEL.female}</span><span /><span style={{ color: G_COLOR.male }}>{G_LABEL.male}</span></div>
            {ages.map((a) => {
                const f = metricOf(grid.get(`${a}|female`), metric), m = metricOf(grid.get(`${a}|male`), metric);
                return (
                    <div key={a} className={styles.pyrRow}>
                        <div className={styles.side}>
                            <span className="tai-mono">{showMetric(f, metric)}</span>
                            <i style={{ width: `${width(f)}%`, background: G_COLOR.female }} />
                        </div>
                        <b className={styles.age}>{a}</b>
                        <div className={`${styles.side} ${styles.right}`}>
                            <i style={{ width: `${width(m)}%`, background: G_COLOR.male }} />
                            <span className="tai-mono">{showMetric(m, metric)}</span>
                        </div>
                    </div>
                );
            })}
            {metric === 'cpa' && <div className={styles.hint}>barra maior = compra mais barata</div>}
        </div>
    );
}

function QuestionCard({ q }: { q: Question }) {
    const maxPeople = Math.max(1, ...q.options.map((o) => o.people));
    // Melhor opção: maior taxa de compra entre as que têm ao menos 1 compra e 3+ pessoas.
    const best = [...q.options].filter((o) => o.paid > 0 && o.people >= 3).sort((a, b) => b.paid / b.people - a.paid / a.people)[0];
    return (
        <section className={styles.q}>
            <div className={styles.qHead}>
                <b>{q.label}</b>
                <span>{fmt(q.total)} respostas · {fmt(q.paid)} {q.paid === 1 ? 'comprou' : 'compraram'}</span>
            </div>
            {q.options.map((o) => {
                const rate = o.people ? (o.paid / o.people) * 100 : null;
                return (
                    <div key={o.value} className={`${styles.opt} ${o === best ? styles.optBest : ''}`}>
                        <span className={styles.optName} title={o.value}>{cap(o.value)}</span>
                        <span className={styles.optTrack}>
                            <i style={{ width: `${(o.people / maxPeople) * 100}%` }} />
                            {o.paid > 0 && <em style={{ width: `${(o.paid / maxPeople) * 100}%` }} />}
                        </span>
                        <span className={`${styles.optN} tai-mono`}>{fmt(o.people)}</span>
                        <span className={`${styles.optRate} tai-mono`}>{o.paid ? pc(rate) : '—'}</span>
                    </div>
                );
            })}
            {best && <div className={styles.qFoot}>Quem escolhe <b>{cap(best.value)}</b> compra mais: {pc((best.paid / best.people) * 100)}</div>}
        </section>
    );
}

export default function PersonaPage() {
    const { sourceId, since, until, reloadToken } = useVendas();
    const [data, setData] = useState<Persona | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [metric, setMetric] = useState<Metric>('purchases');

    useEffect(() => {
        if (!sourceId) return;
        let alive = true;
        setLoading(true); setError('');
        api.request<Persona>('GET', `/tracking/sources/${sourceId}/persona?since=${since}&until=${until}`)
            .then((d) => { if (alive) setData(d); })
            .catch((e) => { if (alive) setError(e.message || 'Não consegui carregar a persona.'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [sourceId, since, until, reloadToken]);

    const view = useMemo(() => {
        if (!data) return null;
        const grid = new Map<string, Agg>();
        const byGender = { female: zero(), male: zero() };
        const total = zero();
        for (const c of data.meta.cells) {
            for (const k of ['spend', 'clicks', 'purchases', 'impressions'] as const) total[k] += c[k];
            if (c.gender === 'unknown') continue;
            const key = `${c.age}|${c.gender}`;
            const a = grid.get(key) || zero();
            for (const k of ['spend', 'clicks', 'purchases', 'impressions'] as const) { a[k] += c[k]; byGender[c.gender][k] += c[k]; }
            grid.set(key, a);
        }
        const cells = [...grid.entries()].map(([k, a]) => { const [age, gender] = k.split('|') as [string, 'female' | 'male']; return { age, gender, ...a }; });
        const topBuyer = [...cells].sort((a, b) => b.purchases - a.purchases || a.spend - b.spend)[0];
        const cheapest = [...cells].filter((c) => c.purchases >= 2).sort((a, b) => a.spend / a.purchases - b.spend / b.purchases)[0];
        const avgCpa = total.purchases ? total.spend / total.purchases : null;
        // Gasta muito e quase não compra: gasto acima de 8% do total e CPA > 1,6× a média (ou zero compras).
        const drain = [...cells]
            .filter((c) => total.spend && c.spend / total.spend >= 0.08 && (!c.purchases || (avgCpa != null && c.spend / c.purchases > avgCpa * 1.6)))
            .sort((a, b) => b.spend - a.spend)[0];
        return { grid, byGender, total, topBuyer, cheapest, drain, avgCpa };
    }, [data]);

    if (error && !data) return <ErrorBox>{error}</ErrorBox>;
    if (!data || !view) return <div className={styles.loading}>{loading ? 'Montando a persona…' : ''}</div>;

    const { total, byGender } = view;
    const who = (c?: { age: string; gender: 'female' | 'male' }) => (c ? `${G_LABEL[c.gender]} ${c.age}` : '—');
    const share = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
    const hasMeta = data.meta.cells.length > 0;

    return (
        <div className={styles.page}>
            {hasMeta ? (
                <>
                    <div className={styles.insights}>
                        <div className={styles.ins}>
                            <small>Quem mais compra</small>
                            <b>{view.topBuyer && view.topBuyer.purchases ? who(view.topBuyer) : '—'}</b>
                            <span>{view.topBuyer && view.topBuyer.purchases ? `${fmt(view.topBuyer.purchases)} compras · ${pc(share(view.topBuyer.purchases, total.purchases))} do total` : 'nenhuma compra registrada pela Meta'}</span>
                        </div>
                        <div className={`${styles.ins} ${styles.insGood}`}>
                            <small>Compra mais barata</small>
                            <b>{view.cheapest ? who(view.cheapest) : '—'}</b>
                            <span>{view.cheapest ? `${money(view.cheapest.spend / view.cheapest.purchases)} por compra · média ${money(view.avgCpa)}` : 'precisa de 2+ compras num grupo'}</span>
                        </div>
                        <div className={`${styles.ins} ${styles.insWarn}`}>
                            <small>Gasta e não volta</small>
                            <b>{view.drain ? who(view.drain) : '—'}</b>
                            <span>{view.drain ? `${money(view.drain.spend)} gastos · ${view.drain.purchases ? `${money(view.drain.spend / view.drain.purchases)} por compra` : 'nenhuma compra'}` : 'nenhum grupo muito acima da média'}</span>
                        </div>
                    </div>

                    <div className={styles.grid}>
                        <section className={styles.card} aria-label="Idade e gênero">
                            <div className={styles.hd}>
                                <div className={styles.lbl}>Idade e gênero</div>
                                <div className={styles.metrics} role="group" aria-label="Métrica">
                                    {METRICS.map((m) => <button key={m.key} type="button" className={metric === m.key ? styles.mOn : undefined} onClick={() => setMetric(m.key)} aria-pressed={metric === m.key}>{m.label}</button>)}
                                </div>
                            </div>
                            <Pyramid grid={view.grid} metric={metric} />
                        </section>

                        <section className={styles.card} aria-label="Homens e mulheres">
                            <div className={styles.lbl}>Para quem vai o dinheiro</div>
                            {(['spend', 'purchases', 'clicks'] as const).map((k) => {
                                const f = share(byGender.female[k], byGender.female[k] + byGender.male[k]);
                                return (
                                    <div key={k} className={styles.split}>
                                        <div className={styles.splitHd}><span>{k === 'spend' ? 'Gasto' : k === 'purchases' ? 'Compras' : 'Cliques'}</span><span className="tai-mono">{k === 'spend' ? money(total.spend) : fmt(total[k])}</span></div>
                                        <div className={styles.splitBar}>
                                            <i style={{ width: `${f}%`, background: G_COLOR.female }} />
                                            <i style={{ width: `${100 - f}%`, background: G_COLOR.male }} />
                                        </div>
                                        <div className={styles.splitLeg}><span style={{ color: G_COLOR.female }}>{pc(f)} mulheres</span><span style={{ color: G_COLOR.male }}>{pc(100 - f)} homens</span></div>
                                    </div>
                                );
                            })}
                            <div className={styles.note}>Dados da Meta para a conta inteira no período (inclui campanhas de mensagem). Compras = as que o pixel informou à Meta.</div>
                        </section>
                    </div>
                </>
            ) : (
                <div className={styles.empty}>{data.meta.live ? 'A Meta não tem entrega com idade e gênero neste período.' : 'Sem dados de idade e gênero: a fonte não tem conta de anúncio ligada ou a Meta não respondeu.'}</div>
            )}

            <div className={styles.secHead}>
                <div className={styles.lbl}>Respostas do quiz que mais convertem</div>
                {data.quiz.sessions > 0 && <span>{fmt(data.quiz.sessions)} pessoas no quiz · {fmt(data.quiz.paid)} compraram · barra verde = compraram</span>}
            </div>
            {data.quiz.questions.length ? (
                <div className={styles.qGrid}>{data.quiz.questions.map((q) => <QuestionCard key={q.key} q={q} />)}</div>
            ) : (
                <div className={styles.empty}>{data.quiz.sessions ? 'Ainda não há respostas suficientes para comparar.' : 'Esta fonte não tem quiz com respostas neste período.'}</div>
            )}
        </div>
    );
}
