'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Clock, CircleAlert, Activity, ChevronDown, X, Copy, Check } from 'lucide-react';
import { useVendas, Card } from '@/components/vendas/shared';
import { BrazilMap, StateData } from '@/components/BrazilMap';
import { api } from '@/lib/api';

export default function AuditoriaPage() {
    const { sourceId } = useVendas();
    const [stats, setStats] = useState<any>(null);
    const [leads, setLeads] = useState<any[]>([]);
    const [leadsTotal, setLeadsTotal] = useState(0);
    const [leadsOffset, setLeadsOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [userProfileLoading, setUserProfileLoading] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!sourceId) return;
        setLoading(true);
        Promise.all([
            api.getTrackingStats(sourceId),
            api.getTrackingLeads(sourceId, { limit: 50, offset: 0, search: search || undefined }),
        ]).then(([s, l]) => {
            setStats(s);
            setLeads(l.data || []);
            setLeadsTotal(l.total || 0);
            setLeadsOffset(l.offset || 0);
        }).catch(() => {
            setStats(null);
            setLeads([]);
        }).finally(() => setLoading(false));
    }, [sourceId, search]);

    async function openUserProfile(identifier: string) {
        if (!sourceId) return;
        setUserProfileLoading(true);
        try {
            const data = await api.getTrackingUserProfile(sourceId, identifier);
            setUserProfile(data);
        } catch (err: any) {
            console.error('Failed to load user profile:', err);
        } finally {
            setUserProfileLoading(false);
        }
    }

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando auditoria…</div>;
    }

    return (
        <div>
            {/* Volume de eventos */}
            {stats?.by_event && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Volume de eventos</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        {(() => {
                            const pageViews = stats.by_event.find((r: any) => r.event_name === 'PageView');
                            const checkouts = stats.by_event.find((r: any) => r.event_name === 'InitiateCheckout');
                            return (
                                <>
                                    <Card style={{ padding: '16px 18px' }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>PageViews</div>
                                        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {pageViews ? Number(pageViews.total).toLocaleString('pt-BR') : '0'}
                                        </div>
                                    </Card>
                                    <Card style={{ padding: '16px 18px' }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Checkouts</div>
                                        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {checkouts ? Number(checkouts.total).toLocaleString('pt-BR') : '0'}
                                        </div>
                                    </Card>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Fluxo para a Meta */}
            {stats?.totals && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Fluxo para a Meta</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                        {Number(stats.totals.total).toLocaleString('pt-BR')} eventos no período (últimos 7 dias)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        <Card style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <ShieldCheck size={14} color="var(--accent-green)" />
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Enviados</span>
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-green)' }}>{Number(stats.totals.sent).toLocaleString('pt-BR')}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Recebidos pela Meta</div>
                        </Card>
                        <Card style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Clock size={14} color="var(--accent-yellow)" />
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Na fila</span>
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-yellow)' }}>{Number(stats.totals.retry_pending).toLocaleString('pt-BR')}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Aguardando nova tentativa</div>
                        </Card>
                        <Card style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <CircleAlert size={14} color={Number(stats.totals.retry_exhausted) > 0 ? 'var(--accent-red)' : 'var(--text-muted)'} />
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Falhas esgotadas</span>
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: Number(stats.totals.retry_exhausted) > 0 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{Number(stats.totals.retry_exhausted).toLocaleString('pt-BR')}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Precisam de correção manual</div>
                        </Card>
                        <Card style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Activity size={14} />
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>EMQ médio</span>
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{Number(stats.totals.avg_emq).toFixed(1)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Qualidade de correspondência</div>
                        </Card>
                    </div>
                </div>
            )}

            {/* Mapa de regiões */}
            {stats?.by_state && stats.by_state.length > 0 && (
                <Card style={{ padding: '20px 24px', marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Regiões (últimos 7 dias)</div>
                    <BrazilMap byState={stats.by_state} />
                </Card>
            )}

            {/* Busca de leads */}
            <div style={{ marginBottom: 16 }}>
                <input
                    type="text"
                    placeholder="Buscar por IP, cookie (_fbp), session_id ou external_id..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: 13,
                        background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        color: 'var(--text-primary)',
                    }}
                />
            </div>

            {/* Tabela de leads (apenas PageViews) */}
            <Card style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Leads (PageViews únicos)</div>
                {leads.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum lead encontrado.</div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>Quando</th>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>Lead ID</th>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>Localização</th>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>Campanha</th>
                                        <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>Eventos</th>
                                        <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>Perfil</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.map(lead => (
                                        <tr key={lead.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                                {new Date(lead.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                                                {lead.group_key ? lead.group_key.slice(0, 20) + '...' : lead.id.slice(0, 8)}
                                            </td>
                                            <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                                {[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || '—'}
                                            </td>
                                            <td style={{ padding: '10px 12px', maxWidth: 220, color: 'var(--text-secondary)' }}>
                                                {lead.meta_campaign_name ? (
                                                    <span title={lead.attribution_reason || ''} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 200, verticalAlign: 'bottom' }}>
                                                        {lead.meta_campaign_name}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                                                    background: lead.total_events > 1 ? 'rgba(59,130,246,.18)' : 'rgba(148,163,184,.15)',
                                                    color: lead.total_events > 1 ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                                }}>
                                                    {lead.total_events}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => openUserProfile(lead.group_key || lead.external_id || lead.id)}
                                                    disabled={userProfileLoading}
                                                    style={{
                                                        padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                                        background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                                                        borderRadius: 6, cursor: userProfileLoading ? 'wait' : 'pointer',
                                                        color: 'var(--text-secondary)',
                                                    }}
                                                >
                                                    Ver perfil
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                            {leadsOffset + 1}–{Math.min(leadsOffset + leads.length, leadsTotal)} de {leadsTotal.toLocaleString('pt-BR')} leads
                        </div>
                    </>
                )}
            </Card>

            {/* User Profile Modal */}
            {userProfile && (
                <UserProfileModal data={userProfile} onClose={() => setUserProfile(null)} />
            )}
        </div>
    );
}

// ─── User Profile Modal ──────────────────────────────────────────────────────
function UserProfileModal({ data, onClose }: { data: any; onClose: () => void }) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    if (!data) return null;
    const { profile, history } = data;

    function toggle(id: string) {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="modal-box" style={{ maxWidth: 680, maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ minWidth: 0 }}>
                        <div className="modal-title">Perfil do usuário</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>
                            {data.external_id}
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose} type="button"><X size={16} /></button>
                </div>

                {/* Dados do usuário */}
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Dados</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <Field label="Local" value={profile.location} />
                        <Field label="Origem" value={profile.origin} />
                        <Field label="Última página" value={profile.last_page || '—'} mono />
                        <Field label="Primeiro acesso" value={new Date(profile.first_seen).toLocaleString('pt-BR')} />
                        <Field label="fbp" value={profile.fbp || '—'} mono />
                        <Field label="fbc" value={profile.fbc || '—'} mono />
                        <Field label="session_id" value={profile.session_id || '—'} mono />
                        <Field label="IP" value={profile.ip || '—'} mono />
                        <Field label="Navegador" value={profile.user_agent ? profile.user_agent.slice(0, 80) + '…' : '—'} mono />
                    </div>
                </div>

                {/* Histórico de eventos */}
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        Histórico de eventos ({history.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {history.map((ev: any) => {
                            const isOpen = expanded.has(ev.id);
                            return (
                                <div key={ev.id} style={{
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-surface-2)',
                                    overflow: 'hidden',
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => toggle(ev.id)}
                                        style={{
                                            width: '100%', padding: '10px 14px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            fontSize: 12.5, color: 'var(--text-primary)',
                                        }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                                                background: ev.event_name === 'Purchase' ? 'rgba(34,197,94,.18)' : ev.event_name === 'InitiateCheckout' ? 'rgba(234,179,8,.18)' : 'rgba(148,163,184,.15)',
                                                color: ev.event_name === 'Purchase' ? 'var(--accent-green)' : ev.event_name === 'InitiateCheckout' ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                                            }}>{ev.event_name}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                {new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {ev.value != null && (
                                                <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                                                    +{ev.currency || 'R$'} {Number(ev.value).toFixed(2)}
                                                </span>
                                            )}
                                            {ev.utm && (
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.utm}</span>
                                            )}
                                        </span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <span className={`badge ${ev.meta_status === 'sent' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                                                {ev.meta_status}
                                            </span>
                                            <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                                        </span>
                                    </button>
                                    {isOpen && (
                                        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, margin: '12px 0 8px' }}>
                                                Meta — enviado
                                            </div>
                                            <PayloadJson value={ev.meta_request} />
                                            {ev.meta_response && (
                                                <>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, margin: '12px 0 8px' }}>
                                                        Meta — resposta
                                                    </div>
                                                    <PayloadJson value={ev.meta_response} />
                                                </>
                                            )}
                                            {ev.meta_error && (
                                                <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.28)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--accent-red)' }}>
                                                    <strong>Erro:</strong> {ev.meta_error}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div style={{ display: 'flex', gap: 12, fontSize: 12.5 }}>
            <span style={{ minWidth: 100, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
            <span style={{ flex: 1, color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono, monospace)' : undefined, wordBreak: 'break-all' }}>{value}</span>
        </div>
    );
}

function PayloadJson({ value }: { value: any }) {
    const [copied, setCopied] = useState(false);
    const json = JSON.stringify(value, null, 2);
    async function copy() {
        try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
    }
    return (
        <div style={{ position: 'relative' }}>
            <pre className="mono" style={{
                margin: 0, padding: 12, paddingRight: 40,
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)',
                overflow: 'auto', whiteSpace: 'pre',
                maxHeight: 300,
            }}>{json}</pre>
            <button
                type="button"
                onClick={copy}
                className="btn btn-ghost btn-sm btn-icon"
                style={{ position: 'absolute', top: 6, right: 6 }}
                title={copied ? 'Copiado' : 'Copiar JSON'}
            >
                {copied ? <Check size={13} color="var(--accent-blue)" /> : <Copy size={13} />}
            </button>
        </div>
    );
}