'use client';

import React, { useMemo, useState } from 'react';
import { useSalesReport, ErrorBox, brl, Row } from '@/components/vendas/shared';
import styles from './criativos.module.css';

type SortKey = 'spend' | 'sales' | 'roas' | 'cpa' | 'ctr';
const SORTS: { key: SortKey; label: string }[] = [
    { key: 'spend', label: 'Mais gasto' },
    { key: 'sales', label: 'Mais vendas' },
    { key: 'roas', label: 'Melhor ROAS' },
    { key: 'cpa', label: 'Menor CPA' },
    { key: 'ctr', label: 'Melhor CTR' },
];
const NONE = '(sem atribuição)';
const ACTIVE_LABEL: Record<string, string> = {
    ACTIVE: 'Ativo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado',
    IN_PROCESS: 'Processando', WITH_ISSUES: 'Com problemas', PENDING_REVIEW: 'Em análise',
};

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const pc = (v: number | null) => (v == null ? '—' : `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)}%`);
/** Dinheiro curto pro card: sem centavos a partir de R$ 100. */
const money = (v: number | null) => (v == null ? '—' : v >= 100 ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : brl(v));
const roasTxt = (v: number | null) => (v == null ? '—' : `${v.toFixed(2).replace('.', ',')}x`);

/** Etapas do mini-funil do anúncio; taxa = quanto passou da etapa anterior. */
function steps(r: Row) {
    const list = [
        { label: 'Impressões', n: r.impressions },
        { label: 'Cliques', n: r.clicks },
        { label: 'Página', n: r.landing_views },
        { label: 'Checkout', n: r.initiate_checkouts },
        { label: 'Vendas', n: r.sales },
    ];
    return list.map((s, i) => {
        const prev = i ? list[i - 1].n : null;
        return { ...s, rate: i && s.n != null && prev ? (s.n / prev) * 100 : null };
    });
}

function MiniFunnel({ r }: { r: Row }) {
    const st = steps(r);
    const top = Math.max(1, st[0].n || 0);
    // Pior passagem depois do clique (onde mais gente se perde no meio do caminho).
    const worst = st.slice(2).reduce((w, s, i) => (s.rate != null && (w.rate == null || s.rate < w.rate) ? { i: i + 2, rate: s.rate } : w), { i: -1, rate: null as number | null }).i;
    return (
        <div className={styles.funnel}>
            {st.map((s, i) => {
                // Escala log: impressões e vendas cabem na mesma barra sem a venda sumir.
                const w = s.n ? Math.max(6, (Math.log10(s.n + 1) / Math.log10(top + 1)) * 100) : 0;
                return (
                    <div key={s.label} className={styles.step}>
                        <span className={styles.stepLabel}>{s.label}</span>
                        <span className={styles.track}><i style={{ width: `${w}%` }} className={i === 4 ? styles.barSale : undefined} /></span>
                        <span className={`${styles.stepN} tai-mono`}>{s.n == null ? '—' : fmt(s.n)}</span>
                        <span className={`${styles.stepRate} ${i === worst ? styles.worst : ''}`}>{i ? pc(s.rate) : ''}</span>
                    </div>
                );
            })}
        </div>
    );
}

function Thumb({ r, rank }: { r: Row; rank: number | null }) {
    const [broken, setBroken] = useState(false);
    const st = r.effective_status;
    const initials = r.name.replace(/[^A-Za-zÀ-ú0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return (
        <div className={styles.thumb}>
            {r.thumbnail_url && !broken
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
                : <span className={styles.ph}>{initials || 'AD'}</span>}
            {st && <span className={`${styles.badge} ${st === 'ACTIVE' ? styles.on : styles.off}`}>{ACTIVE_LABEL[st] || st}</span>}
            {rank != null && <span className={styles.rank}>#{rank + 1} em vendas</span>}
        </div>
    );
}

function AdCard({ r, rank }: { r: Row; rank: number | null }) {
    return (
        <article className={styles.card}>
            <Thumb r={r} rank={rank} />
            <div className={styles.body}>
                <div className={styles.name} title={r.name}>{r.name}</div>
                {r.parent_name && <div className={styles.parent} title={r.parent_name}>{r.parent_name}</div>}
                <div className={styles.kpis}>
                    <div><small>Gasto</small><b className="tai-mono">{money(r.spend)}</b></div>
                    <div><small>Vendas</small><b className="tai-mono">{fmt(r.sales)}</b></div>
                    <div><small>CPA</small><b className="tai-mono">{money(r.cpa)}</b></div>
                    <div><small>ROAS</small><b className="tai-mono" style={{ color: r.roas == null ? undefined : r.roas >= 1 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{roasTxt(r.roas)}</b></div>
                </div>
                <MiniFunnel r={r} />
                <div className={styles.foot}>
                    <span>CTR {pc(r.ctr)} · CPC {r.cpc != null ? brl(r.cpc) : '—'}</span>
                    <span>Receita <b className="tai-mono">{brl(r.revenue)}</b></span>
                </div>
            </div>
        </article>
    );
}

export default function CriativosPage() {
    const { data, loading, error } = useSalesReport('ad');
    const [sort, setSort] = useState<SortKey>('spend');
    const [onlyActive, setOnlyActive] = useState(false);

    const { ads, unattributed, salesRank } = useMemo(() => {
        const rows: Row[] = data?.rows || [];
        const ads = rows.filter((r) => r.key !== NONE);
        const rank = new Map([...ads].filter((r) => r.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 3).map((r, i) => [r.key, i]));
        return { ads, unattributed: rows.find((r) => r.key === NONE) || null, salesRank: rank };
    }, [data]);

    const list = useMemo(() => {
        const val = (r: Row): number => {
            if (sort === 'cpa') return r.cpa == null ? Infinity : r.cpa;
            if (sort === 'roas') return -(r.roas ?? -1);
            if (sort === 'ctr') return -(r.ctr ?? -1);
            return -(r[sort] || 0);
        };
        return ads.filter((r) => !onlyActive || r.effective_status === 'ACTIVE').sort((a, b) => val(a) - val(b) || b.spend - a.spend);
    }, [ads, sort, onlyActive]);

    if (error) return <ErrorBox>{error}</ErrorBox>;
    if (!data) return <div className={styles.loading}>{loading ? 'Carregando criativos…' : ''}</div>;

    return (
        <div className={styles.page}>
            <div className={styles.toolbar}>
                <div className={styles.sorts} role="group" aria-label="Ordenar">
                    {SORTS.map((s) => (
                        <button key={s.key} type="button" className={sort === s.key ? styles.sortOn : undefined} onClick={() => setSort(s.key)} aria-pressed={sort === s.key}>{s.label}</button>
                    ))}
                </div>
                <label className={styles.toggle}>
                    <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Só ativos
                </label>
                <span className={styles.count}>{list.length} {list.length === 1 ? 'anúncio' : 'anúncios'}{loading ? ' · atualizando…' : ''}</span>
            </div>
            {!data.meta_live && <div className={styles.note}>A Meta não respondeu agora: miniaturas, impressões e cliques podem faltar.</div>}
            {list.length === 0
                ? <div className={styles.empty}>Nenhum anúncio com gasto ou venda neste período.</div>
                : <div className={styles.grid}>{list.map((r) => <AdCard key={r.key} r={r} rank={salesRank.has(r.key) ? salesRank.get(r.key)! : null} />)}</div>}
            {unattributed && unattributed.sales > 0 && (
                <div className={styles.note}>
                    + {fmt(unattributed.sales)} {unattributed.sales === 1 ? 'venda' : 'vendas'} ({brl(unattributed.revenue)}) sem anúncio identificado — venda direta, orgânica ou link sem UTM.
                </div>
            )}
        </div>
    );
}
