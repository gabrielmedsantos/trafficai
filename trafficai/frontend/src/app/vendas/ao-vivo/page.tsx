'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useVendas, brl, ErrorBox, DEMO_SOURCE_ID } from '@/components/vendas/shared';
import { LiveGlobe, pointCoords } from '@/components/vendas/LiveGlobe';
import styles from './ao-vivo.module.css';

interface Stage { key: string; label: string; today: number; last_hour: number; yday: number }
interface FeedItem { kind: 'visit' | 'checkout' | 'pix' | 'paid' | 'recovery'; name: string | null; city: string | null; state: string | null; country: string | null; value: number | null; at: string }
interface Live {
    generated_at: string;
    active_now: number;
    per_minute: number[];
    last30: { visits: number; yday: number; series: number[] };
    stages: Stage[];
    money: { spend_today: number | null; revenue_gross_today: number; revenue_net_today: number; avg_ticket: number | null; projected_sales: number; projected_revenue: number | null };
    recovery: { sent_today: number; recovered_today: number };
    geo: { now: Array<{ country: string | null; state: string | null; city: string | null; n: number }>; today: Array<{ country: string | null; state: string | null; n: number }> };
    feed: FeedItem[];
}

const REFRESH_MS = 60_000;
const STAGE_COLOR: Record<string, string> = { visits: '#0ea5e9', checkouts: '#ff6b35', pix: '#22d3ee', paid: '#00d27a' };
const FEED: Record<FeedItem['kind'], { label: string; color: string; bg: string }> = {
    visit: { label: 'abriu a página', color: '#7dd3fc', bg: 'rgba(14,165,233,.14)' },
    checkout: { label: 'clicou em comprar', color: '#ff8b3d', bg: 'rgba(255,107,53,.14)' },
    pix: { label: 'gerou o pedido', color: '#22d3ee', bg: 'rgba(34,211,238,.14)' },
    paid: { label: 'pagou', color: '#00d27a', bg: 'rgba(0,210,122,.14)' },
    recovery: { label: 'recebeu recuperação', color: '#facc15', bg: 'rgba(250,204,21,.14)' },
};

const fmt = (n: number) => n.toLocaleString('pt-BR');
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

function ago(iso: string, now: number): string {
    const m = Math.floor((now - new Date(iso).getTime()) / 60000);
    return m <= 0 ? 'agora' : `${m} min`;
}

function Change({ today, yday }: { today: number; yday: number }) {
    if (!yday) return <span className={styles.muted}>ontem 0</span>;
    const p = ((today - yday) / yday) * 100;
    const up = p >= 0;
    return <span>ontem {fmt(yday)} <span className={up ? styles.up : styles.down}>{up ? '▲' : '▼'} {Math.abs(p).toFixed(0)}%</span></span>;
}

function Bars({ values }: { values: number[] }) {
    const max = Math.max(1, ...values);
    return (
        <div className={styles.bars} aria-hidden>
            {values.map((v, i) => <i key={i} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} className={i === values.length - 1 ? styles.barNow : undefined} />)}
        </div>
    );
}

function Area({ values }: { values: number[] }) {
    const max = Math.max(1, ...values);
    const W = 320, H = 80;
    const pts = values.map((v, i) => [(i * W) / Math.max(1, values.length - 1), H - 6 - (v / max) * (H - 14)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
            <defs><linearGradient id="av-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(34,211,238,.42)" /><stop offset="1" stopColor="rgba(34,211,238,0)" /></linearGradient></defs>
            <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#av-area)" />
            <path d={line} fill="none" stroke="#22d3ee" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

export default function AoVivoPage() {
    const { sourceId, source, isDemo: demo, setSourceId, leaveDemo } = useVendas();
    const [data, setData] = useState<Live | null>(null);
    const [error, setError] = useState('');
    const [now, setNow] = useState(Date.now());
    const toggleDemo = () => (demo ? leaveDemo() : setSourceId(DEMO_SOURCE_ID));

    const load = useCallback(async () => {
        if (!sourceId && !demo) return;
        try {
            setData(await api.request<Live>('GET', demo ? '/tracking/live-demo' : `/tracking/sources/${sourceId}/live`));
            setError('');
        } catch (e: any) {
            setError(e.message || 'Não consegui carregar os dados ao vivo.');
        }
        setNow(Date.now());
    }, [sourceId, demo]);

    useEffect(() => {
        setData(null);
        load();
        const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
        return () => clearInterval(t);
    }, [load]);

    if (error && !data) return <ErrorBox>{error}</ErrorBox>;
    if (!data) return <div className={styles.loading}>Carregando dados ao vivo…</div>;

    const visits = data.stages.find((s) => s.key === 'visits');
    const geoNow = data.geo.now.filter((g) => pointCoords(g));
    const showingNow = geoNow.length > 0;
    const chips = (showingNow ? geoNow : data.geo.today)
        .map((g) => ({ label: pointCoords(g)?.label, n: g.n }))
        .filter((c) => c.label)
        .reduce((acc: Array<{ label: string; n: number }>, c) => {
            const hit = acc.find((a) => a.label === c.label);
            if (hit) hit.n += c.n; else acc.push({ label: c.label as string, n: c.n });
            return acc;
        }, [])
        .sort((a, b) => b.n - a.n)
        .slice(0, 8);

    return (
        <div className={styles.page}>
            <div className={styles.status}>
                <span className={styles.who2}>
                    {demo ? <><b>Loja Demo</b> <span className={styles.demoTag}>dados fictícios</span></> : source?.name}
                </span>
                <span className={styles.statusRight}>
                    <button type="button" className={`${styles.demoBtn} ${demo ? styles.demoOn : ''}`} onClick={toggleDemo} aria-pressed={demo}>
                        {demo ? 'Sair da conta de teste' : 'Conta de teste'}
                    </button>
                    <span className={styles.pill}>● dados de {hhmm(data.generated_at)} · atualiza a cada minuto</span>
                </span>
            </div>
            {error && <ErrorBox>{error} Mostrando a última leitura.</ErrorBox>}

            <div className={styles.grid}>
                {/* Contadores */}
                <section className={styles.card} aria-label="Ritmo agora">
                    <div className={styles.block}>
                        <div className={styles.lbl}>No funil agora</div>
                        <div className={styles.row}>
                            <span className={`${styles.big} tai-mono`} style={{ color: '#ff6b35' }}>{fmt(data.active_now)}</span>
                            <small>{data.active_now === 1 ? 'pessoa ativa' : 'pessoas ativas'}<br />nos últimos 5 min</small>
                        </div>
                        <Bars values={data.per_minute} />
                        <div className={styles.axis}><span>-60 min</span><span>-30</span><span>agora</span></div>
                    </div>
                    <div className={styles.block}>
                        <div className={styles.lbl}>Últimos 30 min</div>
                        <div className={styles.row}>
                            <span className={`${styles.mid} tai-mono`} style={{ color: '#ff6b35' }}>{fmt(data.last30.visits)}</span>
                            <small>visitas · <Change today={data.last30.visits} yday={data.last30.yday} /><br />no mesmo horário</small>
                        </div>
                        <Area values={data.last30.series} />
                        <div className={styles.axis}><span>-30 min</span><span>-15</span><span>agora</span></div>
                    </div>
                    {visits && (
                        <div className={styles.block}>
                            <div className={styles.lbl}>Visitas hoje</div>
                            <div className={styles.row}>
                                <span className={`${styles.mid} tai-mono`} style={{ color: '#22d3ee' }}>{fmt(visits.today)}</span>
                                <small>até agora · <Change today={visits.today} yday={visits.yday} /></small>
                            </div>
                            <div className={styles.cmp} title="Hoje"><b style={{ width: `${(visits.today / Math.max(1, visits.today, visits.yday)) * 100}%`, background: 'linear-gradient(90deg,#ff6b35,#b794f4)' }} /></div>
                            <div className={styles.cmp} title="Ontem até este horário"><b style={{ width: `${(visits.yday / Math.max(1, visits.today, visits.yday)) * 100}%`, background: '#3a3f48' }} /></div>
                        </div>
                    )}
                    <div className={styles.money}>
                        <div><small>GASTO META HOJE</small><div className="tai-mono">{data.money.spend_today != null ? brl(data.money.spend_today) : '—'}</div></div>
                        <div><small>RECEITA PROJETADA</small><div className="tai-mono" style={{ color: 'var(--accent-green)' }}>{data.money.projected_revenue != null ? brl(data.money.projected_revenue) : '—'}</div>
                            {data.money.avg_ticket != null && <small>{data.money.projected_sales} × {brl(data.money.avg_ticket)}</small>}</div>
                    </div>
                </section>

                {/* Globo */}
                <section className={`${styles.card} ${styles.globe}`} aria-label="Mapa de atividade">
                    <LiveGlobe points={showingNow ? geoNow : data.geo.today} dim={!showingNow} />
                    {chips.length > 0 && <div className={styles.chips}>{chips.map((c) => <span key={c.label}>{c.label} {c.n}</span>)}</div>}
                    <div className={styles.cap}>{showingNow ? 'atividade nos últimos 5 min · ponto aproximado do estado' : chips.length ? 'ninguém ativo agora · mostrando as visitas de hoje' : 'sem visitas hoje ainda'}</div>
                </section>

                {/* Etapas + feed */}
                <section className={styles.card} aria-label="Hoje e acontecendo agora">
                    <div className={styles.head}><div className={styles.lbl}>Hoje, desde 0h</div><span>última hora · ontem até agora</span></div>
                    <div>
                        {data.stages.map((s) => (
                            <div key={s.key} className={styles.stage}>
                                <span className={styles.dot} style={{ background: STAGE_COLOR[s.key] }} />
                                <div>
                                    <div className={styles.st}>{s.label}</div>
                                    <div className={styles.ss}>+{fmt(s.last_hour)} na última hora · <Change today={s.today} yday={s.yday} /></div>
                                </div>
                                <span className={`${styles.sv} tai-mono`}>{fmt(s.today)}</span>
                            </div>
                        ))}
                        <div className={styles.stage}>
                            <span className={styles.dot} style={{ background: '#facc15' }} />
                            <div>
                                <div className={styles.st}>Mensagens de recuperação</div>
                                <div className={styles.ss}>{fmt(data.recovery.sent_today)} enviadas · {fmt(data.recovery.recovered_today)} {data.recovery.recovered_today === 1 ? 'recuperado' : 'recuperados'}</div>
                            </div>
                            <span className={`${styles.sv} tai-mono`}>{fmt(data.recovery.sent_today)}</span>
                        </div>
                    </div>
                    <div className={styles.proj}>
                        <div><div className={styles.pt}>Vendas projetadas hoje</div><div className={styles.ss}>pagas + ritmo das últimas 3 h até 0h</div></div>
                        <span className="tai-mono">≈ {fmt(data.money.projected_sales)}</span>
                    </div>
                    <div className={styles.feed}>
                        <div className={styles.head}><div className={styles.lbl} style={{ color: '#ff6b35' }}>● Acontecendo agora</div><span>últimos 30 min</span></div>
                        {data.feed.length === 0 && <div className={styles.empty}>Nenhuma atividade nos últimos 30 minutos.</div>}
                        <ul>
                            {data.feed.map((f, i) => {
                                const k = FEED[f.kind];
                                const where = [f.city, f.state && f.country === 'BR' ? pointCoords({ ...f, n: 1 })?.label : f.state].filter(Boolean).join(', ');
                                return (
                                    <li key={`${f.at}-${i}`}>
                                        <span className={styles.who}><b>{f.name || 'Visitante'}</b> {where && <span>{where}</span>}</span>
                                        <span className={styles.tag} style={{ color: k.color, background: k.bg }}>{k.label}{f.kind === 'paid' && f.value != null ? ` ${brl(f.value)}` : ''}</span>
                                        <span className={styles.ago}>{ago(f.at, now)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    );
}
