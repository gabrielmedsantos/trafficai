'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import {
    useSalesReport, useVendas, Card, Tabs, ReportTable, NameCell, ErrorBox, financialColumns,
    brl, Row, selectStyle,
} from '@/components/vendas/shared';

type Level = 'campaign' | 'adset' | 'ad';
const LEVELS: { key: Level; label: string; singular: string }[] = [
    { key: 'campaign', label: 'Campanhas', singular: 'Campanha' },
    { key: 'adset', label: 'Conjuntos', singular: 'Conjunto' },
    { key: 'ad', label: 'Anúncios', singular: 'Anúncio' },
];

const EFFECTIVE_LABEL: Record<string, string> = {
    ACTIVE: 'Ativo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado',
    IN_PROCESS: 'Em processamento', WITH_ISSUES: 'Com problemas', PENDING_REVIEW: 'Em análise', ARCHIVED: 'Arquivado', DELETED: 'Excluído',
};

function StatusSwitch({ row, onChange, busy }: { row: Row; onChange: (next: 'ACTIVE' | 'PAUSED') => void; busy: boolean }) {
    if (!row.meta_id || !row.status || !['ACTIVE', 'PAUSED'].includes(row.status)) {
        return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.effective_status ? EFFECTIVE_LABEL[row.effective_status] || row.effective_status : '—'}</span>;
    }
    const on = row.status === 'ACTIVE';
    const inherited = on && row.effective_status && row.effective_status !== 'ACTIVE';
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={busy}
            onClick={() => onChange(on ? 'PAUSED' : 'ACTIVE')}
            title={inherited ? EFFECTIVE_LABEL[row.effective_status!] || row.effective_status! : on ? 'Ativo — clique pra pausar' : 'Pausado — clique pra ativar'}
            style={{
                width: 34, height: 19, borderRadius: 999, border: 'none', padding: 2, cursor: busy ? 'wait' : 'pointer',
                background: on ? (inherited ? 'var(--accent-yellow)' : 'var(--accent-green)') : 'var(--border)',
                display: 'inline-flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .15s', opacity: busy ? 0.6 : 1,
            }}
        >
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />
        </button>
    );
}

function BudgetCell({ row, level, onSave, busy }: { row: Row; level: Level; onSave: (v: number) => void; busy: boolean }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState('');
    if (row.budget == null) {
        return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{level === 'adset' ? 'CBO' : level === 'campaign' ? 'ABO' : '—'}</span>;
    }
    const editable = row.budget_type === 'daily' && !!row.meta_id;
    if (editing) {
        const commit = () => {
            const n = Number(val.replace(/\./g, '').replace(',', '.'));
            setEditing(false);
            if (Number.isFinite(n) && n >= 1 && Math.abs(n - (row.budget || 0)) >= 0.01) onSave(n);
        };
        return (
            <input
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
                style={{ ...selectStyle, width: 90, padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                aria-label="Novo orçamento diário"
            />
        );
    }
    return (
        <button
            type="button"
            disabled={!editable || busy}
            onClick={() => { setVal(String(row.budget).replace('.', ',')); setEditing(true); }}
            title={editable ? 'Editar orçamento diário' : 'Orçamento vitalício — edite no Gerenciador'}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: editable ? 'pointer' : 'default', padding: 0, font: 'inherit', textAlign: 'right' }}
        >
            <span className="num">{brl(row.budget)}</span>
            {editable && <Pencil size={10} style={{ marginLeft: 4, color: 'var(--text-muted)' }} />}
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{row.budget_type === 'daily' ? 'diário' : 'vitalício'}</div>
        </button>
    );
}

export default function CampanhasPage() {
    const { sourceId, source } = useVendas();
    const [level, setLevel] = useState<Level>('campaign');
    const { data, loading, error, reload } = useSalesReport(level);
    const [search, setSearch] = useState('');
    const [onlyActive, setOnlyActive] = useState(false);
    const [media, setMedia] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState('');
    const [overrides, setOverrides] = useState<Record<string, Partial<Row>>>({});

    useEffect(() => {
        try {
            setMedia(localStorage.getItem('vendas_media_cols') === '1');
            const l = localStorage.getItem('vendas_level') as Level | null;
            if (l && LEVELS.some(x => x.key === l)) setLevel(l);
        } catch { /* sem storage */ }
    }, []);
    useEffect(() => { setOverrides({}); }, [data]);

    const rows: Row[] = useMemo(() => {
        const q = search.trim().toLowerCase();
        return ((data?.rows || []) as Row[])
            .map(r => ({ ...r, ...(overrides[r.key] || {}) }))
            .filter(r => !onlyActive || r.effective_status === 'ACTIVE' || r.status === 'ACTIVE')
            .filter(r => !q || r.name.toLowerCase().includes(q) || (r.parent_name || '').toLowerCase().includes(q) || (r.meta_id || '').includes(q));
    }, [data, search, onlyActive, overrides]);

    async function change(row: Row, patch: { status?: 'ACTIVE' | 'PAUSED'; daily_budget?: number }) {
        if (!row.meta_id) return;
        setBusyId(row.key); setActionError('');
        const prev = overrides[row.key];
        setOverrides(o => ({
            ...o,
            [row.key]: { ...o[row.key], ...(patch.status && { status: patch.status, effective_status: patch.status }), ...(patch.daily_budget && { budget: patch.daily_budget }) },
        }));
        try {
            await api.updateSalesMetaObject(sourceId, row.meta_id, patch);
        } catch (e: any) {
            setOverrides(o => ({ ...o, [row.key]: prev || {} }));
            setActionError(`${row.name}: ${e.message || 'falha ao alterar na Meta'}`);
        } finally {
            setBusyId(null);
        }
    }

    const current = LEVELS.find(l => l.key === level)!;
    const hasMeta = !!source?.account_id;

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}
            {actionError && <ErrorBox>{actionError}</ErrorBox>}
            {!hasMeta && source && (
                <Card style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--accent-yellow)' }}>
                    Essa fonte não tem conta de anúncio vinculada — só aparecem as vendas, sem gasto/status/orçamento.
                </Card>
            )}
            {data && hasMeta && !data.meta_live && level !== 'campaign' && (
                <Card style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--accent-yellow)' }}>
                    Não consegui ler conjuntos/anúncios da Meta agora (token expirado ou limite de requisições). Reconecte a conta em Contas ou tente em instantes.
                </Card>
            )}
            <Card style={{ padding: 0 }}>
                <Tabs
                    tabs={LEVELS}
                    active={level}
                    onChange={(k) => { setLevel(k); try { localStorage.setItem('vendas_level', k); } catch { /* */ } }}
                    right={
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${current.singular.toLowerCase()}`}
                                    style={{ ...selectStyle, padding: '5px 8px 5px 26px', fontSize: 12, width: 190 }} />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Só ativos
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={media} onChange={(e) => { setMedia(e.target.checked); try { localStorage.setItem('vendas_media_cols', e.target.checked ? '1' : '0'); } catch { /* */ } }} />
                                Métricas de mídia
                            </label>
                        </div>
                    }
                />
                <ReportTable
                    rows={rows}
                    loading={loading}
                    firstLabel={current.singular}
                    leading={hasMeta ? [
                        { label: 'Status', width: 70, render: (r) => <StatusSwitch row={r} busy={busyId === r.key} onChange={(s) => change(r, { status: s })} /> },
                        ...(level !== 'ad' ? [{ label: 'Orçamento', width: 110, render: (r: Row) => <BudgetCell row={r} level={level} busy={busyId === r.key} onSave={(v) => change(r, { daily_budget: v })} /> }] : []),
                    ] : undefined}
                    renderFirst={(r) => <NameCell name={r.name} sub={[r.parent_name, r.meta_id].filter(Boolean).join(' · ')} />}
                    columns={financialColumns({ media })}
                    emptyText={`Nenhum(a) ${current.singular.toLowerCase()} com gasto ou venda no período.`}
                />
            </Card>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                Vendas atribuídas pelos IDs das UTMs (<code>nome|id</code>) ou pelo clique rastreado pelo pixel. Lucro já desconta imposto e custo de produto configurados em Custos.
                Status e orçamento alteram direto na Meta.
            </p>
        </>
    );
}
