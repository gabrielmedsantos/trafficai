'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
    Activity, Plus, X, Copy, Check, Trash2, Pencil, RefreshCw,
    Zap, ShieldCheck, CircleAlert, Sparkles, Globe,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface Source {
    id: string;
    name: string;
    public_token: string;
    pixel_id: string | null;
    test_event_code: string | null;
    domain: string | null;
    is_active: boolean;
    account_id: string | null;
    meta_account_name?: string | null;
    webhook_secret?: string;
    access_token?: string;
    events_24h?: number | string;
    errors_7d?: number | string;
    avg_emq_7d?: number | null;
    created_at?: string;
}

interface FormState {
    name: string;
    account_id: string;
    pixel_id: string;
    access_token: string;
    test_event_code: string;
    domain: string;
}

const EMPTY_FORM: FormState = {
    name: '', account_id: '', pixel_id: '', access_token: '',
    test_event_code: '', domain: '',
};

function fmtRelative(iso?: string) {
    if (!iso) return '—';
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    if (diff < 60_000) return 'agora';
    if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}min`;
    if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)}h`;
    return `há ${Math.floor(diff / 86_400_000)}d`;
}

export default function TrackingPage() {
    const [sources, setSources] = useState<Source[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Source | null>(null);
    const [editing, setEditing] = useState<Source | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [s, a] = await Promise.all([
                api.getTrackingSources().catch(() => []),
                api.getActiveAccounts().catch(() => []),
            ]);
            setSources(s);
            setAccounts(a);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1>Tracking</h1>
                    <p>Pixel proprietário + Meta CAPI com deduplicação e hashing automático</p>
                </div>
                <div className="page-header-actions">
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setShowCreate(true)}
                    >
                        <Plus size={14} /> Nova fonte
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
            ) : sources.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon"><Activity size={22} /></div>
                        <h3>Nenhuma fonte configurada</h3>
                        <p>Crie uma fonte para gerar o pixel e enviar eventos para a Meta CAPI.</p>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ marginTop: 16 }}
                            onClick={() => setShowCreate(true)}
                        >
                            <Plus size={14} /> Criar primeira fonte
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                    {sources.map(s => (
                        <SourceCard
                            key={s.id}
                            source={s}
                            onOpen={() => setSelected(s)}
                            onEdit={() => setEditing(s)}
                        />
                    ))}
                </div>
            )}

            {showCreate && (
                <SourceFormModal
                    mode="create"
                    accounts={accounts}
                    onClose={() => setShowCreate(false)}
                    onSaved={() => { setShowCreate(false); load(); }}
                />
            )}

            {editing && (
                <SourceFormModal
                    mode="edit"
                    source={editing}
                    accounts={accounts}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); if (selected?.id === editing.id) setSelected(null); }}
                />
            )}

            {selected && (
                <SourceDetail
                    source={selected}
                    onClose={() => setSelected(null)}
                    onEdit={() => { setEditing(selected); setSelected(null); }}
                />
            )}
        </div>
    );
}

// ─── Source card ───────────────────────────────────────────────────────────

function SourceCard({ source, onOpen, onEdit }: {
    source: Source; onOpen: () => void; onEdit: () => void;
}) {
    const events = Number(source.events_24h || 0);
    const errors = Number(source.errors_7d || 0);
    const emq = Number(source.avg_emq_7d || 0);
    const emqColor = emq >= 7 ? 'var(--accent-green)' : emq >= 4 ? 'var(--accent-yellow)' : 'var(--accent-red)';
    const hasCredentials = !!source.pixel_id;

    return (
        <div className="card" style={{ cursor: 'pointer', padding: 18 }} onClick={onOpen}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: source.is_active ? 'var(--accent-green)' : 'var(--text-muted)',
                        }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">
                            {source.name}
                        </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {source.domain || 'sem domínio'}
                        {source.meta_account_name && ` · ${source.meta_account_name}`}
                    </div>
                </div>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={e => { e.stopPropagation(); onEdit(); }}
                    title="Editar"
                >
                    <Pencil size={13} />
                </button>
            </div>

            {!hasCredentials && (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11.5, color: 'var(--accent-yellow)',
                    padding: '3px 8px', borderRadius: 999,
                    background: 'rgba(245, 158, 11, 0.10)',
                    border: '1px solid rgba(245, 158, 11, 0.22)',
                    marginBottom: 10,
                }}>
                    <CircleAlert size={12} /> Pixel ID / token não configurados
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 6 }}>
                <Metric label="Eventos 24h" value={events.toLocaleString('pt-BR')} />
                <Metric label="Erros 7d" value={errors.toLocaleString('pt-BR')} color={errors > 0 ? 'var(--accent-red)' : undefined} />
                <Metric label="EMQ médio" value={emq > 0 ? emq.toFixed(1) : '—'} color={emq > 0 ? emqColor : undefined} />
            </div>
        </div>
    );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 600 }}>{label}</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 600, color: color || 'var(--text-primary)', marginTop: 2 }}>
                {value}
            </div>
        </div>
    );
}

// ─── Source Detail ──────────────────────────────────────────────────────────

function SourceDetail({ source, onClose, onEdit }: {
    source: Source; onClose: () => void; onEdit: () => void;
}) {
    const [detail, setDetail] = useState<Source | null>(null);
    const [stats, setStats] = useState<any>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string>('');
    const [rotating, setRotating] = useState(false);

    const load = useCallback(async () => {
        try {
            const [d, s, e] = await Promise.all([
                api.getTrackingSource(source.id),
                api.getTrackingStats(source.id, 7).catch(() => null),
                api.getTrackingEvents(source.id, { limit: 30 }).catch(() => []),
            ]);
            setDetail(d);
            setStats(s);
            setEvents(e);
        } catch {
            /* ignore */
        }
    }, [source.id]);

    useEffect(() => {
        load();
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [load, onClose]);

    async function runTest() {
        setTesting(true); setTestResult('');
        try {
            const r = await api.testTrackingSource(source.id);
            setTestResult(r?.meta_status === 'sent' ? 'OK · enviado para a Meta' : 'Falhou · verifique credenciais');
            setTimeout(load, 1000);
        } catch (err: any) {
            setTestResult('Erro: ' + (err.message || 'desconhecido'));
        } finally { setTesting(false); }
    }

    async function rotate() {
        if (!confirm('Gerar novo webhook secret? O anterior será invalidado imediatamente.')) return;
        setRotating(true);
        try {
            await api.rotateTrackingWebhook(source.id);
            await load();
        } finally { setRotating(false); }
    }

    const pixelUrl = `${API_BASE}/track/pixel/${source.public_token}.js`;
    const webhookUrl = `${API_BASE}/track/webhook/${source.public_token}`;
    const embed = `<script async src="${pixelUrl}"></script>`;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-box"
                style={{ maxWidth: 860, maxHeight: '90vh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <div style={{ minWidth: 0 }}>
                        <div className="modal-title">{source.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {source.domain || 'sem domínio'} · token: <span className="mono">{source.public_token.slice(0, 12)}…</span>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose} type="button"><X size={16} /></button>
                </div>

                {/* Stats */}
                {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                        <MiniKpi label="Total 7d" value={Number(stats.totals.total || 0).toLocaleString('pt-BR')} />
                        <MiniKpi label="Enviados" value={Number(stats.totals.sent || 0).toLocaleString('pt-BR')} color="var(--accent-green)" />
                        <MiniKpi label="Falhas" value={Number(stats.totals.failed || 0).toLocaleString('pt-BR')}
                            color={Number(stats.totals.failed || 0) > 0 ? 'var(--accent-red)' : undefined} />
                        <MiniKpi label="EMQ médio"
                            value={stats.totals.avg_emq ? Number(stats.totals.avg_emq).toFixed(1) : '—'}
                            color={
                                stats.totals.avg_emq >= 7 ? 'var(--accent-green)' :
                                stats.totals.avg_emq >= 4 ? 'var(--accent-yellow)' :
                                'var(--accent-red)'
                            } />
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={runTest} disabled={testing}>
                        <Sparkles size={13} /> {testing ? 'Testando…' : 'Disparar evento de teste'}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                        <Pencil size={13} /> Editar credenciais
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
                        <RefreshCw size={13} /> Atualizar
                    </button>
                    {testResult && (
                        <span style={{
                            fontSize: 12, color: testResult.startsWith('OK') ? 'var(--accent-green)' : 'var(--accent-red)',
                            alignSelf: 'center',
                        }}>
                            {testResult}
                        </span>
                    )}
                </div>

                {/* Integration */}
                <Section title="Instalação no site">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        Cole o script abaixo antes do fechamento de <span className="mono">&lt;/head&gt;</span> no site do cliente.
                        Ele dispara PageView automaticamente e expõe <span className="mono">window.TrafficAI.track(...)</span>.
                    </p>
                    <CopyBlock value={embed} />
                    <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>URL do pixel:</div>
                        <CopyBlock value={pixelUrl} small />
                    </div>
                </Section>

                <Section title="Webhook para CRM">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        Configure no Kommo/RD Station para disparar em Lead, Qualificação, Agendamento e Venda.
                        Envie o header <span className="mono">X-TAI-Signature</span> com HMAC-SHA256 do body
                        usando o secret abaixo.
                    </p>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Endpoint:</div>
                    <CopyBlock value={webhookUrl} small />
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Secret:</div>
                            <CopyBlock value={detail?.webhook_secret || '••••••••••••'} small masked={!detail?.webhook_secret} />
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={rotate} disabled={rotating}
                            style={{ alignSelf: 'flex-end' }}>
                            {rotating ? 'Rotacionando…' : 'Rotacionar'}
                        </button>
                    </div>
                </Section>

                {/* Breakdown */}
                {stats?.by_event && stats.by_event.length > 0 && (
                    <Section title="Por evento (últimos 7 dias)">
                        <div className="table-container" style={{ border: '1px solid var(--border)' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Evento</th>
                                        <th className="num">Total</th>
                                        <th className="num">Enviados</th>
                                        <th className="num">Falhas</th>
                                        <th className="num">EMQ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.by_event.map((r: any) => (
                                        <tr key={r.event_name}>
                                            <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.event_name}</td>
                                            <td className="num">{Number(r.total).toLocaleString('pt-BR')}</td>
                                            <td className="num" style={{ color: 'var(--accent-green)' }}>{Number(r.sent).toLocaleString('pt-BR')}</td>
                                            <td className="num" style={{ color: Number(r.failed) > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                                                {Number(r.failed).toLocaleString('pt-BR')}
                                            </td>
                                            <td className="num">{Number(r.avg_emq).toFixed(1)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>
                )}

                {/* Recent events */}
                <Section title="Eventos recentes">
                    {events.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                            Nenhum evento ainda
                        </div>
                    ) : (
                        <div className="table-container" style={{ border: '1px solid var(--border)' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Evento</th>
                                        <th>Status</th>
                                        <th className="num">EMQ</th>
                                        <th>Origem</th>
                                        <th className="num">Quando</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.slice(0, 15).map(e => (
                                        <tr key={e.id}>
                                            <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {e.event_name}
                                                {e.value != null && (
                                                    <span className="num" style={{ fontSize: 11, color: 'var(--accent-green)', marginLeft: 6 }}>
                                                        +{e.currency || 'R$'} {Number(e.value).toFixed(2)}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`badge ${e.meta_status === 'sent' ? 'badge-green' : 'badge-red'}`}>
                                                    {e.meta_status || '—'}
                                                </span>
                                            </td>
                                            <td className="num">{e.emq_score || 0}</td>
                                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {e.action_source}
                                            </td>
                                            <td className="num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {fmtRelative(e.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>

                {/* Recent errors */}
                {stats?.recent_errors && stats.recent_errors.length > 0 && (
                    <Section title="Últimos erros">
                        {stats.recent_errors.map((e: any, i: number) => (
                            <div key={i} style={{
                                padding: 10, marginBottom: 6,
                                background: 'rgba(239,68,68,0.06)',
                                border: '1px solid rgba(239,68,68,0.18)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: 12, color: 'var(--text-primary)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <span style={{ fontWeight: 500 }}>{e.event_name}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{fmtRelative(e.created_at)}</span>
                                </div>
                                <div style={{ color: 'var(--accent-red)', fontSize: 12 }}>{e.meta_error}</div>
                            </div>
                        ))}
                    </Section>
                )}

                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">Fechar</button>
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 22 }}>
            <div style={{
                fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: 0.6, fontWeight: 600, marginBottom: 10,
            }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function MiniKpi({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{
            padding: '10px 12px',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
        }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>
                {label}
            </div>
            <div className="num" style={{ fontSize: 17, fontWeight: 600, color: color || 'var(--text-primary)', marginTop: 2 }}>
                {value}
            </div>
        </div>
    );
}

function CopyBlock({ value, small, masked }: { value: string; small?: boolean; masked?: boolean }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        if (masked) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {}
    }
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: small ? '6px 10px' : '10px 12px',
        }}>
            <code className="mono" style={{
                flex: 1, fontSize: small ? 11.5 : 12, color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                {value}
            </code>
            <button
                type="button"
                onClick={copy}
                disabled={masked}
                className="btn btn-ghost btn-sm btn-icon"
                title={copied ? 'Copiado!' : 'Copiar'}
            >
                {copied ? <Check size={13} color="var(--accent-green)" /> : <Copy size={13} />}
            </button>
        </div>
    );
}

// ─── Form modal ─────────────────────────────────────────────────────────────

function SourceFormModal({ mode, source, accounts, onClose, onSaved }: {
    mode: 'create' | 'edit';
    source?: Source;
    accounts: any[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState<FormState>(() => {
        if (source) return {
            name: source.name,
            account_id: source.account_id || '',
            pixel_id: source.pixel_id || '',
            access_token: '', // não trazemos o token por segurança; só setamos se mudar
            test_event_code: source.test_event_code || '',
            domain: source.domain || '',
        };
        return EMPTY_FORM;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const upd = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }));

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
        setSaving(true);
        try {
            if (mode === 'create') {
                await api.createTrackingSource({
                    name: form.name.trim(),
                    account_id: form.account_id || undefined,
                    pixel_id: form.pixel_id.trim() || undefined,
                    access_token: form.access_token.trim() || undefined,
                    test_event_code: form.test_event_code.trim() || undefined,
                    domain: form.domain.trim() || undefined,
                });
            } else if (source) {
                const payload: any = {
                    name: form.name.trim(),
                    account_id: form.account_id || null,
                    pixel_id: form.pixel_id.trim(),
                    test_event_code: form.test_event_code.trim(),
                    domain: form.domain.trim(),
                };
                // Só envia access_token se for preenchido (preserva o atual se vazio)
                if (form.access_token.trim()) payload.access_token = form.access_token.trim();
                await api.updateTrackingSource(source.id, payload);
            }
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!source) return;
        if (!confirm(`Remover "${source.name}"? Todos os eventos armazenados serão apagados.`)) return;
        setSaving(true);
        try {
            await api.deleteTrackingSource(source.id);
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Erro ao remover');
            setSaving(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <form className="modal-box" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()} onSubmit={submit}>
                <div className="modal-header">
                    <div className="modal-title">
                        {mode === 'create' ? 'Nova fonte de tracking' : 'Editar fonte'}
                    </div>
                    <button className="modal-close" type="button" onClick={onClose}><X size={16} /></button>
                </div>

                {error && (
                    <div style={{
                        padding: '10px 12px',
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.22)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#fca5a5',
                        fontSize: 12.5,
                        marginBottom: 12,
                    }}>
                        {error}
                    </div>
                )}

                <div className="form-group">
                    <label className="form-label">Nome da fonte</label>
                    <input
                        type="text" className="form-input" autoFocus
                        value={form.name}
                        onChange={e => upd('name', e.target.value)}
                        placeholder="Ex: Loja do Cliente X"
                        required
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Conta Meta (opcional)</label>
                    <select
                        className="form-select"
                        value={form.account_id}
                        onChange={e => upd('account_id', e.target.value)}
                    >
                        <option value="">— vincular depois —</option>
                        {accounts.map((a: any) => (
                            <option key={a.id} value={a.id}>{a.account_name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Domínio do site</label>
                    <input
                        type="text" className="form-input"
                        value={form.domain}
                        onChange={e => upd('domain', e.target.value)}
                        placeholder="exemplo.com.br"
                    />
                </div>

                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 14px' }} />

                <div className="form-group">
                    <label className="form-label">Pixel ID da Meta</label>
                    <input
                        type="text" className="form-input"
                        value={form.pixel_id}
                        onChange={e => upd('pixel_id', e.target.value)}
                        placeholder="ex: 123456789012345"
                    />
                    <span className="form-hint">Encontre em Gerenciador de Anúncios &rsaquo; Gerenciador de Eventos &rsaquo; Pixel.</span>
                </div>

                <div className="form-group">
                    <label className="form-label">Conversions API Access Token</label>
                    <input
                        type="password" className="form-input"
                        value={form.access_token}
                        onChange={e => upd('access_token', e.target.value)}
                        placeholder={mode === 'edit' ? 'Deixe vazio para manter' : 'Gerado em Events Manager → Settings → CAPI'}
                        autoComplete="off"
                    />
                </div>

                <div className="form-group" style={{ marginBottom: 24 }}>
                    <label className="form-label">Test Event Code (opcional)</label>
                    <input
                        type="text" className="form-input"
                        value={form.test_event_code}
                        onChange={e => upd('test_event_code', e.target.value)}
                        placeholder="TESTxxxxx"
                    />
                    <span className="form-hint">Use durante o setup para ver eventos na aba Test Events da Meta.</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    {mode === 'edit' ? (
                        <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={handleDelete}
                            disabled={saving}
                        >
                            <Trash2 size={13} /> Remover
                        </button>
                    ) : <span />}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                            {saving ? 'Salvando…' : mode === 'create' ? 'Criar fonte' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
