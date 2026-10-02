'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { api } from '@/lib/api';
import {
    useSalesReport, useVendas, Card, Tabs, ReportTable, NameCell, ErrorBox, ColumnPicker, columnsFor, useColumnChoice, moveKey,
    brl, Row, selectStyle, signColor,
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
            className="tai-switch"
            style={{
                width: 36, height: 20, borderRadius: 999, border: 'none', padding: 2, cursor: busy ? 'wait' : 'pointer', display: 'flex',
                background: on ? (inherited ? 'var(--accent-yellow)' : 'var(--accent-green)') : '#2a2e35', opacity: busy ? 0.6 : 1,
            }}
        >
            <span className="tai-knob" style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.4)', transform: `translateX(${on ? 16 : 0}px)` }} />
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
            className={editable ? 'tai-budget' : undefined}
            style={{
                padding: '5px 9px', background: 'transparent', border: editable ? '1px dashed rgba(255,255,255,0.14)' : '1px solid transparent', borderRadius: 6,
                color: 'var(--text-primary)', cursor: editable ? 'pointer' : 'default', font: 'inherit', textAlign: 'right', whiteSpace: 'nowrap',
            }}
        >
            <span className="tai-mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{brl(row.budget)}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.budget_type === 'daily' ? '/dia' : ' total'}</span>
        </button>
    );
}

export default function CampanhasPage() {
    const { sourceId, source } = useVendas();
    const [level, setLevel] = useState<Level>('campaign');
    const { data, loading, error, reload } = useSalesReport(level);
    const [search, setSearch] = useState('');
    const [onlyActive, setOnlyActive] = useState(false);
    const [colKeys, setColKeys] = useColumnChoice('vendas_campanhas_cols');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState('');
    const [toast, setToast] = useState('');
    const toastTimer = React.useRef<any>(null);
    const flashToast = (t: string) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2600); };
    const [overrides, setOverrides] = useState<Record<string, Partial<Row>>>({});

    useEffect(() => {
        try {
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
            flashToast(patch.status ? `${patch.status === 'ACTIVE' ? 'Ativado' : 'Pausado'} na Meta: ${row.name}` : `Orçamento atualizado: ${brl(patch.daily_budget!)}/dia`);
        } catch (e: any) {
            setOverrides(o => ({ ...o, [row.key]: prev || {} }));
            setActionError(`${row.name}: ${e.message || 'falha ao alterar na Meta'}`);
        } finally {
            setBusyId(null);
        }
    }

    const current = LEVELS.find(l => l.key === level)!;
    const maxProfit = Math.max(1, ...rows.map(r => Math.abs(r.profit)));
    const totals = rows.reduce((a, r) => ({ profit: a.profit + r.profit, revenue: a.revenue + r.revenue, spend: a.spend + r.spend }), { profit: 0, revenue: 0, spend: 0 });
    const hasMeta = !!source?.account_id;

    return (
        <>
            {toast && (
                <div className="tai-toast" role="status" aria-live="polite" style={{ position: 'fixed', top: 24, right: 32, zIndex: 50, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'var(--bg-surface)', border: '1px solid rgba(14,165,233,0.45)', borderRadius: 12, boxShadow: '0 18px 40px rgba(0,0,0,0.55)', fontSize: 13 }}>
                    <Check size={16} color="var(--accent-blue)" /> {toast}
                </div>
            )}
            <div className="tai-rise" style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                {[
                    { label: 'Lucro no período', value: brl(totals.profit), color: signColor(totals.profit) },
                    { label: 'ROAS geral', value: totals.spend ? (totals.revenue / totals.spend).toFixed(2).replace('.', ',') : 'N/A', color: 'var(--text-primary)' },
                    { label: 'Gastos', value: brl(totals.spend), color: 'var(--text-primary)' },
                ].map((p) => (
                    <div key={p.label} style={{ display: 'flex', flexDirection: 'column', padding: '8px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{p.label}</span>
                        <span className="tai-mono" style={{ fontSize: 16, fontWeight: 600, color: p.color }}>{p.value}</span>
                    </div>
                ))}
            </div>
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
            <Card flat style={{ padding: 0 }}>
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
                            <ColumnPicker value={colKeys} onChange={setColKeys} />
                        </div>
                    }
                />
                <ReportTable
                    rows={rows}
                    loading={loading}
                    firstLabel={current.singular}
                    leading={hasMeta ? [
                        { label: 'Status', width: 70, render: (r) => <StatusSwitch row={r} busy={busyId === r.key} onChange={(s) => change(r, { status: s })} /> },
                        ...(level !== 'ad' ? [{ label: 'Orçamento', width: 140, render: (r: Row) => <BudgetCell row={r} level={level} busy={busyId === r.key} onSave={(v) => change(r, { daily_budget: v })} /> }] : []),
                    ] : undefined}
                    renderFirst={(r) => (
                        <div style={{ opacity: r.status === 'PAUSED' ? 0.6 : 1 }}>
                            <NameCell name={r.name} sub={null} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <div style={{ width: 90, height: 4, borderRadius: 2, background: 'var(--bg-surface-2)', overflow: 'hidden', flexShrink: 0 }}>
                                    <div className="tai-barx" style={{ width: `${(Math.abs(r.profit) / maxProfit) * 100}%`, height: '100%', background: r.profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }} />
                                </div>
                                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[r.parent_name, r.meta_id].filter(Boolean).join(' · ')}</span>
                            </div>
                        </div>
                    )}
                    columns={columnsFor(colKeys)}
                    onReorder={(from, to) => setColKeys(moveKey(colKeys, from, to))}
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
