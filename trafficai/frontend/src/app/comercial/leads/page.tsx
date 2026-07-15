'use client';

import { useEffect, useState, useCallback } from 'react';
import { Target, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import ClientPicker from '../_components/ClientPicker';
import styles from './leads.module.css';

interface Lead {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    title: string | null;
    value: string;
    currency: string;
    status: 'open' | 'won' | 'lost';
    created_at: string;
    last_stage_change_at: string;
    last_activity_at: string;
    closed_at: string | null;
    days_in_stage: number;
    days_to_conversion: string | null;
    loss_reason: string | null;
    stage_id: string;
    stage_name: string;
    stage_color: string;
    stuck_threshold_days: number;
    salesperson_id: string | null;
    salesperson_name: string | null;
    salesperson_color: string | null;
    source_name: string | null;
    source_color: string | null;
}

const fmtBRL = (v: number | string) => {
    const n = typeof v === 'string' ? Number(v) : v;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

type SortField = 'last_activity_at' | 'created_at' | 'value' | 'last_stage_change_at' | 'contact_name';

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [stages, setStages] = useState<{ id: string; name: string; color: string }[]>([]);
    const [salespeople, setSalespeople] = useState<{ id: string; name: string }[]>([]);
    const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
    const [stageId, setStageId] = useState('');
    const [status, setStatus] = useState('open');
    const [salespersonId, setSalespersonId] = useState('');
    const [sourceId, setSourceId] = useState('');
    const [clientId, setClientId] = useState('');
    const [sort, setSort] = useState<SortField>('last_activity_at');
    const [dir, setDir] = useState<'asc' | 'desc'>('desc');
    const [loading, setLoading] = useState(true);

    // Suporta drill-down via query params: ?status=won|open|lost
    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        const s = sp.get('status');
        if (s === 'won' || s === 'open' || s === 'lost' || s === '') setStatus(s);
        const stage = sp.get('stageId');
        if (stage) setStageId(stage);
    }, []);

    useEffect(() => {
        Promise.all([
            api.getCommercialPipelines(clientId || undefined),
            api.getCommercialSalespeople(clientId || undefined),
            api.getCommercialLeadSources(),
        ]).then(([pipes, sps, src]) => {
            const main = pipes[0];
            setStages(main?.stages || []);
            setSalespeople(sps);
            setSources(src);
            if (stageId && !main?.stages?.find((s: any) => s.id === stageId)) setStageId('');
            if (salespersonId && !sps.find((s: any) => s.id === salespersonId)) setSalespersonId('');
        });
    }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

    const load = useCallback(() => {
        setLoading(true);
        api.getCommercialLeads({
            ...(stageId && { stageId }),
            ...(status && { status }),
            ...(salespersonId && { salespersonId }),
            ...(sourceId && { sourceId }),
            ...(clientId && { clientId }),
            noPeriod: true,
            sort, dir, page, limit: 50,
        })
            .then(d => { setLeads(d.rows); setTotal(d.total); })
            .finally(() => setLoading(false));
    }, [stageId, status, salespersonId, sourceId, clientId, sort, dir, page]);

    useEffect(() => { load(); }, [load]);

    const toggleSort = (f: SortField) => {
        if (sort === f) setDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSort(f); setDir('desc'); }
    };

    const SortHeader = ({ field, label, align = 'left' }: { field: SortField; label: string; align?: 'left' | 'right' }) => (
        <th onClick={() => toggleSort(field)} className={styles.sortable} style={{ textAlign: align }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {label}
                {sort === field && (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
            </span>
        </th>
    );

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <div className={styles.title}>
                        <Target size={22} className={styles.titleIcon} strokeWidth={2} />
                        <h1 className={styles.titleText}>Leads</h1>
                    </div>
                    <p className={styles.subtitle}>{total} leads encontrados</p>
                </div>
                <div className={styles.filters}>
                    <ClientPicker value={clientId} onChange={v => { setClientId(v); setPage(1); }} />
                    <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={styles.select}>
                        <option value="open">Abertos</option>
                        <option value="won">Ganhos</option>
                        <option value="lost">Perdidos</option>
                        <option value="">Todos</option>
                    </select>
                    <select value={stageId} onChange={e => { setStageId(e.target.value); setPage(1); }} className={styles.select}>
                        <option value="">Todas as etapas</option>
                        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={salespersonId} onChange={e => { setSalespersonId(e.target.value); setPage(1); }} className={styles.select}>
                        <option value="">Todos os vendedores</option>
                        {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={sourceId} onChange={e => { setSourceId(e.target.value); setPage(1); }} className={styles.select}>
                        <option value="">Todas as origens</option>
                        {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            </header>

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <SortHeader field="contact_name" label="Contato" />
                            <th>Etapa</th>
                            <th>Vendedor</th>
                            <SortHeader field="value" label="Valor" align="right" />
                            <SortHeader field="last_stage_change_at" label="Dias na etapa" align="right" />
                            <th style={{ textAlign: 'right' }}>Tempo p/ ganho</th>
                            <SortHeader field="created_at" label="Entrada" align="right" />
                            <th style={{ textAlign: 'right' }}>Fechamento</th>
                            <SortHeader field="last_activity_at" label="Última atividade" align="right" />
                            <th>Origem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && leads.length === 0 && (
                            <tr><td colSpan={10} className={styles.empty}>Carregando…</td></tr>
                        )}
                        {!loading && leads.length === 0 && (
                            <tr><td colSpan={10} className={styles.empty}>Nenhum lead com esses filtros</td></tr>
                        )}
                        {leads.map(l => {
                            const stuck = l.status === 'open' && l.days_in_stage >= l.stuck_threshold_days;
                            return (
                                <tr key={l.id} className={stuck ? styles.stuck : ''}>
                                    <td>
                                        <div className={styles.contactName}>{l.contact_name || '—'}</div>
                                        <div className={styles.contactSub}>{l.title || l.contact_phone}</div>
                                    </td>
                                    <td>
                                        <span className={styles.stageBadge} style={{ borderLeftColor: l.stage_color }}>
                                            {l.stage_name}
                                        </span>
                                    </td>
                                    <td>
                                        {l.salesperson_name ? (
                                            <span className={styles.spChip}>
                                                <span className={styles.spDot} style={{ background: l.salesperson_color || '#6b7388' }} />
                                                {l.salesperson_name}
                                            </span>
                                        ) : <span className={styles.unassigned}>—</span>}
                                    </td>
                                    <td className={styles.right}><strong>{fmtBRL(l.value)}</strong></td>
                                    <td className={styles.right}>
                                        <span className={stuck ? styles.daysStuck : styles.days}>
                                            {stuck && <AlertTriangle size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />}
                                            {l.days_in_stage} dias
                                        </span>
                                    </td>
                                    <td className={styles.right}>
                                        {l.days_to_conversion != null ? (
                                            <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                                                {Number(l.days_to_conversion).toFixed(1).replace('.', ',')} dias
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>
                                    <td className={styles.right}>{fmtDate(l.created_at)}</td>
                                    <td className={styles.right}>
                                        {l.closed_at ? (
                                            <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>
                                                {fmtDate(l.closed_at)}
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>
                                    <td className={styles.right}>{fmtDate(l.last_activity_at)}</td>
                                    <td>
                                        {l.source_name && (
                                            <span className={styles.sourceChip}>
                                                <span className={styles.sourceDot} style={{ background: l.source_color || '#6b7388' }} />
                                                {l.source_name}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {total > 50 && (
                <div className={styles.pagination}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={styles.pageBtn}>← Anterior</button>
                    <span className={styles.pageInfo}>Página {page} de {Math.ceil(total / 50)}</span>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total} className={styles.pageBtn}>Próxima →</button>
                </div>
            )}
        </div>
    );
}
