'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Lock, RefreshCw, User, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/app/UserContext';

interface AuditEntry {
    id: string;
    user_id: string | null;
    user_name: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    entity_label: string | null;
    details: Record<string, any> | null;
    created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
    'campaign.status_changed': 'Alterou status de campanha',
    'agent.suggestion_applied': 'Aplicou sugestão do Agente IA',
    'team.member_created': 'Adicionou membro ao time',
    'team.member_updated': 'Atualizou membro do time',
    'team.member_removed': 'Removeu membro do time',
};

const ENTITY_LABEL: Record<string, string> = {
    meta_campaign: 'Campanha Meta',
    google_campaign: 'Campanha Google',
    user: 'Membro',
};

function fmtDetails(entry: AuditEntry): string {
    const d = entry.details;
    if (!d) return '';
    if (entry.action === 'campaign.status_changed') {
        return d.previous_status ? `${d.previous_status} → ${d.status}` : String(d.status || '');
    }
    if (entry.action === 'agent.suggestion_applied') {
        const action = d.action === 'pause' ? 'Pausar' : d.action === 'activate' ? 'Ativar' : 'Ajustar orçamento';
        return d.value != null ? `${action} · R$ ${Number(d.value).toLocaleString('pt-BR')}` : action;
    }
    if (entry.action === 'team.member_updated' && Array.isArray(d.fields_changed)) {
        return d.fields_changed.join(', ');
    }
    if (entry.action === 'team.member_created') {
        return `${d.email || ''} · ${d.role === 'admin' ? 'Admin' : 'Membro'}`;
    }
    return '';
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AuditLogPage() {
    const { user, loading: userLoading } = useCurrentUser();
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [actions, setActions] = useState<string[]>([]);
    const [actionFilter, setActionFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [data, actionList] = await Promise.all([
                api.getAuditLog({ limit: 100, action: actionFilter || undefined }),
                api.getAuditLogActions().catch(() => []),
            ]);
            setEntries(data);
            setActions(actionList);
        } catch (e: any) {
            setError(e.message || 'Erro ao carregar log de auditoria');
        } finally {
            setLoading(false);
        }
    }, [actionFilter]);

    useEffect(() => { load(); }, [load]);

    if (!userLoading && user && user.role !== 'admin') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--text-muted)' }}>
                <Lock size={32} />
                <p style={{ fontSize: 14 }}>Apenas administradores podem ver o log de auditoria.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ClipboardList size={24} /> Log de auditoria
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                        Quem mudou o quê, quando — campanhas, sugestões do Agente IA e gestão de time.
                    </p>
                </div>
                <button
                    onClick={load}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                >
                    <RefreshCw size={14} /> Atualizar
                </button>
            </div>

            {actions.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                    <Filter size={14} color="var(--text-muted)" />
                    <select
                        value={actionFilter}
                        onChange={e => setActionFilter(e.target.value)}
                        style={{ padding: '7px 12px', fontSize: 12.5, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', outline: 'none' }}
                    >
                        <option value="">Todas as ações</option>
                        {actions.map(a => (
                            <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>
                        ))}
                    </select>
                </div>
            )}

            {error && (
                <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)', borderRadius: 10, color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
                    {error}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Carregando…</div>
            ) : entries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, color: 'var(--text-muted)' }}>
                    <ClipboardList size={36} style={{ opacity: .3, marginBottom: 10 }} />
                    <p style={{ margin: 0, fontSize: 14.5 }}>Nenhum registro ainda</p>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5 }}>Ações como pausar campanha ou aplicar sugestão do Agente aparecem aqui.</p>
                </div>
            ) : (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{
                        display: 'grid', gridTemplateColumns: '140px 1fr 200px 140px',
                        gap: 16, padding: '12px 20px',
                        background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)',
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)',
                    }}>
                        <div>Quando</div>
                        <div>Ação</div>
                        <div>Detalhes</div>
                        <div>Quem</div>
                    </div>
                    {entries.map((e, i) => (
                        <div key={e.id} style={{
                            display: 'grid', gridTemplateColumns: '140px 1fr 200px 140px',
                            gap: 16, padding: '13px 20px', alignItems: 'center',
                            borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : 'none',
                            fontSize: 13,
                        }}>
                            <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(e.created_at)}</div>
                            <div>
                                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{ACTION_LABEL[e.action] || e.action}</div>
                                {e.entity_label && (
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                                        {ENTITY_LABEL[e.entity_type] || e.entity_type}: {e.entity_label}
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDetails(e)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                                <User size={12} color="var(--text-muted)" />
                                {e.user_name || '—'}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
