'use client';

import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { Brain, Loader, ChevronRight, Search, Filter } from 'lucide-react';
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
}

const STATUS_LABEL: Record<string, string> = {
    ACTIVE: 'Ativo',
    PAUSED: 'Pausado',
    DELETED: 'Deletado',
    ARCHIVED: 'Arquivado',
};
const STATUS_CLASS: Record<string, string> = {
    ACTIVE: 'badge-green',
    PAUSED: 'badge-yellow',
};

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();

    useEffect(() => {
        setLoading(true);
        api.getCampaigns(selectedAccountId || undefined)
            .then(data => setCampaigns(data as Campaign[]))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [selectedAccountId]);

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

    const filtered = useMemo(() => {
        return campaigns.filter(c => {
            const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
                (c.account_name || '').toLowerCase().includes(search.toLowerCase());
            const matchStatus = !statusFilter || c.status === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [campaigns, search, statusFilter]);

    const activeCount = campaigns.filter(c => c.status === 'ACTIVE').length;

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

            {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
                <div className="card empty-state">
                    <h3>{campaigns.length === 0 ? 'Nenhuma campanha encontrada' : 'Nenhum resultado'}</h3>
                    <p>{campaigns.length === 0 ? 'Conecte sua conta Meta Ads para sincronizar campanhas' : 'Tente ajustar os filtros'}</p>
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Campanha</th>
                                {!selectedAccountId && <th>Conta</th>}
                                <th>Objetivo</th>
                                <th>Status</th>
                                <th>Orçamento Diário</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(c => (
                                <tr key={c.id}>
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
                                        <span className={`badge ${STATUS_CLASS[c.status] || 'badge-red'}`}>
                                            {STATUS_LABEL[c.status] || c.status}
                                        </span>
                                    </td>
                                    <td>
                                        {c.daily_budget
                                            ? `R$ ${Number(c.daily_budget).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
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
            )}

            <style jsx>{`
                .spinning { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
