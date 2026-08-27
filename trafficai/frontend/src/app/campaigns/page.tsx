'use client';

import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { Brain, Loader, ChevronRight, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import Link from 'next/link';
import { useAccount } from '@/app/AccountContext';

interface Campaign {
    id: string;
    account_id: string;
    account_name?: string;
    name: string;
    objective?: string;
    status: string;
    daily_budget?: number;
    spend: number;
    impressions: number;
    clicks: number;
    roas: number;
    results: number;
    result_label: string;
    cost_per_result: number;
}

const STATUS_LABEL: Record<string, string> = {
    ACTIVE: 'Ativo',
    PAUSED: 'Pausado',
    DELETED: 'Deletado',
    ARCHIVED: 'Arquivado',
};

type SortKey = 'name' | 'spend' | 'results' | 'cost_per_result' | 'roas' | 'daily_budget';

const PERIODS = [
    { key: 'today', label: 'Hoje' },
    { key: 'yesterday', label: 'Ontem' },
    { key: '7d', label: 'Últimos 7 dias' },
    { key: '14d', label: 'Últimos 14 dias' },
    { key: '30d', label: 'Últimos 30 dias' },
    { key: 'month', label: 'Este mês' },
    { key: 'last_month', label: 'Mês anterior' },
] as const;

function periodRange(key: string): { since: string; until: string } {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    switch (key) {
        case 'today': return { since: iso(today), until: iso(today) };
        case 'yesterday': {
            const y = new Date(today); y.setUTCDate(y.getUTCDate() - 1);
            return { since: iso(y), until: iso(y) };
        }
        case '14d': {
            const s = new Date(today); s.setUTCDate(s.getUTCDate() - 13);
            return { since: iso(s), until: iso(today) };
        }
        case '30d': {
            const s = new Date(today); s.setUTCDate(s.getUTCDate() - 29);
            return { since: iso(s), until: iso(today) };
        }
        case 'month': {
            const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
            return { since: iso(s), until: iso(today) };
        }
        case 'last_month': {
            const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            const e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            return { since: iso(s), until: iso(e) };
        }
        case '7d':
        default: {
            const s = new Date(today); s.setUTCDate(s.getUTCDate() - 6);
            return { since: iso(s), until: iso(today) };
        }
    }
}

const fmtBRL = (v: number) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (v: number) => Number(v || 0).toLocaleString('pt-BR');

const PAGE_SIZE = 25;

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [period, setPeriod] = useState<string>('7d');
    const [sortKey, setSortKey] = useState<SortKey>('spend');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();

    useEffect(() => {
        setLoading(true);
        const { since, until } = periodRange(period);
        api.getCampaigns(selectedAccountId || undefined, since, until)
            .then(data => setCampaigns(data as Campaign[]))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [selectedAccountId, period]);

    useEffect(() => { setPage(1); }, [search, statusFilter, selectedAccountId, period]);

    async function handleAnalyze(campaignId: string) {
        setAnalyzing(campaignId);
        try {
            await api.analyzeCampaign(campaignId);
            alert('Análise concluída! Veja os resultados na página de Insights.');
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally {
            setAnalyzing(null);
        }
    }

    async function handleToggleStatus(c: Campaign) {
        const next = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        setTogglingId(c.id);
        const prev = campaigns;
        setCampaigns(list => list.map(x => x.id === c.id ? { ...x, status: next } : x));
        try {
            await api.setCampaignStatus(c.id, next);
        } catch (err: any) {
            setCampaigns(prev);
            alert('Erro ao atualizar status: ' + err.message);
        } finally {
            setTogglingId(null);
        }
    }

    async function handleBulkStatus(status: 'ACTIVE' | 'PAUSED') {
        const ids = Array.from(selected);
        if (!ids.length) return;
        setBulkBusy(true);
        const prev = campaigns;
        setCampaigns(list => list.map(x => ids.includes(x.id) ? { ...x, status } : x));
        const results = await Promise.allSettled(ids.map(id => api.setCampaignStatus(id, status)));
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
            setCampaigns(prev);
            alert(`${failed} de ${ids.length} campanha(s) não puderam ser atualizadas. Nada foi alterado — tente novamente.`);
        } else {
            setSelected(new Set());
        }
        setBulkBusy(false);
    }

    function toggleSelectAll() {
        if (paged.every(c => selected.has(c.id))) {
            setSelected(prev => {
                const next = new Set(prev);
                paged.forEach(c => next.delete(c.id));
                return next;
            });
        } else {
            setSelected(prev => {
                const next = new Set(prev);
                paged.forEach(c => next.add(c.id));
                return next;
            });
        }
    }

    function toggleSort(key: SortKey) {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    }

    const filtered = useMemo(() => {
        const list = campaigns.filter(c => {
            const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
                (c.account_name || '').toLowerCase().includes(search.toLowerCase());
            const matchStatus = !statusFilter || c.status === statusFilter;
            return matchSearch && matchStatus;
        });
        const sorted = [...list].sort((a, b) => {
            let av: any = a[sortKey]; let bv: any = b[sortKey];
            if (sortKey === 'name') { av = av || ''; bv = bv || ''; }
            else { av = Number(av) || 0; bv = Number(bv) || 0; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [campaigns, search, statusFilter, sortKey, sortDir]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const activeCount = campaigns.filter(c => c.status === 'ACTIVE').length;

    const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
        <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => toggleSort(k)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {label}
                {sortKey === k
                    ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                    : <ArrowUpDown size={12} style={{ opacity: 0.35 }} />}
            </span>
        </th>
    );

    return (
        <div className="fade-in">
            <div className="page-header" style={{ marginBottom: '24px' }}>
                <div>
                    <h1>Campanhas</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
                        {campaigns.length} campanhas
                        {activeCount > 0 && <span style={{ color: 'var(--accent-green)', marginLeft: '8px' }}>• {activeCount} ativas</span>}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {/* Account filter */}
                <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '320px' }}>
                    <Filter size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <select
                        value={selectedAccountId || ''}
                        onChange={e => setSelectedAccountId(e.target.value || null)}
                        style={{
                            width: '100%', padding: '9px 12px 9px 34px',
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: '8px', color: 'var(--text)', fontSize: '14px', cursor: 'pointer',
                            appearance: 'none',
                        }}
                    >
                        <option value="">Todas as contas</option>
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.account_name}</option>
                        ))}
                    </select>
                </div>

                {/* Period filter */}
                <div style={{ position: 'relative' }}>
                    <select
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        style={{
                            padding: '9px 12px', background: 'var(--bg-card)',
                            border: '1px solid var(--border)', borderRadius: '8px',
                            color: 'var(--text)', fontSize: '14px', cursor: 'pointer',
                        }}
                    >
                        {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                </div>

                {/* Status filter */}
                <div style={{ position: 'relative' }}>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        style={{
                            padding: '9px 12px', background: 'var(--bg-card)',
                            border: '1px solid var(--border)', borderRadius: '8px',
                            color: 'var(--text)', fontSize: '14px', cursor: 'pointer',
                        }}
                    >
                        <option value="">Todos os status</option>
                        <option value="ACTIVE">Ativas</option>
                        <option value="PAUSED">Pausadas</option>
                        <option value="ARCHIVED">Arquivadas</option>
                    </select>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Buscar campanha..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '9px 12px 9px 34px',
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: '8px', color: 'var(--text)', fontSize: '14px',
                        }}
                    />
                </div>
            </div>

            {selected.size > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                    padding: '10px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{selected.size} selecionada{selected.size > 1 ? 's' : ''}</span>
                    <button className="btn btn-sm btn-secondary" disabled={bulkBusy} onClick={() => handleBulkStatus('ACTIVE')}>Ativar</button>
                    <button className="btn btn-sm btn-secondary" disabled={bulkBusy} onClick={() => handleBulkStatus('PAUSED')}>Pausar</button>
                    <button className="btn btn-sm" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} disabled={bulkBusy} onClick={() => setSelected(new Set())}>Limpar seleção</button>
                </div>
            )}

            {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
                <div className="card empty-state">
                    <h3>{campaigns.length === 0 ? 'Nenhuma campanha encontrada' : 'Nenhum resultado'}</h3>
                    <p>{campaigns.length === 0 ? 'Conecte sua conta Meta Ads para sincronizar campanhas' : 'Tente ajustar os filtros'}</p>
                </div>
            ) : (
                <>
                <div className="table-container" style={{ overflowX: 'auto' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>
                                    <input
                                        type="checkbox"
                                        checked={paged.length > 0 && paged.every(c => selected.has(c.id))}
                                        onChange={toggleSelectAll}
                                        aria-label="Selecionar todas nesta página"
                                    />
                                </th>
                                <th></th>
                                <SortHeader label="Campanha" k="name" />
                                {!selectedAccountId && <th>Conta</th>}
                                <th>Objetivo</th>
                                <th>Status</th>
                                <SortHeader label="Investimento" k="spend" />
                                <SortHeader label="Resultados" k="results" />
                                <SortHeader label="Custo/Resultado" k="cost_per_result" />
                                <SortHeader label="ROAS" k="roas" />
                                <SortHeader label="Orçamento Diário" k="daily_budget" />
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.map(c => (
                                <tr key={c.id}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selected.has(c.id)}
                                            onChange={() => setSelected(prev => {
                                                const next = new Set(prev);
                                                if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                                return next;
                                            })}
                                            aria-label={`Selecionar ${c.name}`}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            role="switch"
                                            aria-checked={c.status === 'ACTIVE'}
                                            title={c.status === 'ACTIVE' ? 'Pausar campanha' : 'Ativar campanha'}
                                            onClick={() => handleToggleStatus(c)}
                                            disabled={togglingId === c.id || !['ACTIVE', 'PAUSED'].includes(c.status)}
                                            style={{
                                                width: 36, height: 20, borderRadius: 999, border: 'none', position: 'relative',
                                                background: c.status === 'ACTIVE' ? 'var(--accent-green, #22c55e)' : 'var(--border)',
                                                cursor: togglingId === c.id ? 'wait' : 'pointer',
                                                opacity: !['ACTIVE', 'PAUSED'].includes(c.status) ? 0.4 : 1,
                                                flexShrink: 0,
                                            }}
                                        >
                                            <span style={{
                                                position: 'absolute', top: 2, left: c.status === 'ACTIVE' ? 18 : 2,
                                                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                                transition: 'left .15s',
                                            }} />
                                        </button>
                                    </td>
                                    <td style={{ fontWeight: 500, maxWidth: '280px' }}>
                                        {c.name}
                                    </td>
                                    {!selectedAccountId && (
                                        <td style={{ color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                            {c.account_name || '—'}
                                        </td>
                                    )}
                                    <td>
                                        <span className="badge badge-blue">{c.objective || 'N/A'}</span>
                                    </td>
                                    <td>
                                        <span className={`badge ${c.status === 'ACTIVE' ? 'badge-green' : c.status === 'PAUSED' ? 'badge-yellow' : 'badge-red'}`}>
                                            {STATUS_LABEL[c.status] || c.status}
                                        </span>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtBRL(c.spend)}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        {fmtNum(c.results)}
                                        {c.result_label && <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>{c.result_label}</span>}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{c.results > 0 ? fmtBRL(c.cost_per_result) : '—'}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{c.roas > 0 ? `${c.roas.toFixed(2)}×` : '—'}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        {c.daily_budget
                                            ? fmtBRL(Number(c.daily_budget))
                                            : '—'}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => handleAnalyze(c.id)}
                                                disabled={analyzing === c.id}
                                            >
                                                {analyzing === c.id ? <Loader size={14} className="spinning" /> : <Brain size={14} />}
                                                Analisar
                                            </button>
                                            <Link href={`/predictions?campaign=${c.id}`} className="btn btn-sm btn-secondary">
                                                Previsão <ChevronRight size={14} />
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Anterior</button>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Página {page} de {totalPages}</span>
                        <button className="btn btn-sm btn-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima →</button>
                    </div>
                )}
                </>
            )}

            <style jsx>{`
                .spinning { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
