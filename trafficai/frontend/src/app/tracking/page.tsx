'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
    Activity, Plus, X, Copy, Check, Trash2, Pencil, RefreshCw,
    Zap, ShieldCheck, CircleAlert, Sparkles, Globe,
    TrendingUp, TrendingDown, Users, UserCheck, Calendar, ShoppingCart, DollarSign, Target,
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

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
    whatsapp_leads_total?: number | string;
    created_at?: string;
    // CRM
    crm_type?: string | null;
    crm_subdomain?: string | null;
    crm_access_token?: string | null;
    last_backfill_at?: string | null;
}

interface FormState {
    name: string;
    account_id: string;
    pixel_id: string;
    access_token: string;
    test_event_code: string;
    domain: string;
    crm_type: string;
    crm_subdomain: string;
    crm_access_token: string;
}

const EMPTY_FORM: FormState = {
    name: '', account_id: '', pixel_id: '', access_token: '',
    test_event_code: '', domain: '',
    crm_type: '', crm_subdomain: '', crm_access_token: '',
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

    // CRM backfill state + handlers
    const [showBackfill, setShowBackfill] = useState(false);
    const [backfillOpts, setBackfillOpts] = useState({
        enrich_existing: true, sync_won_purchases: true,
    });
    const [backfillRunning, setBackfillRunning] = useState(false);
    const [backfillResult, setBackfillResult] = useState<any>(null);
    const [crmTest, setCrmTest] = useState<any>(null);
    const [inspectEventId, setInspectEventId] = useState<string | null>(null);
    const [crmTestErr, setCrmTestErr] = useState('');

    // Dashboard de performance
    const [dashRange, setDashRange] = useState<'7d' | '14d' | '30d' | 'custom'>('30d');
    const [dashSince, setDashSince] = useState('');
    const [dashUntil, setDashUntil] = useState('');
    const [dash, setDash] = useState<any>(null);
    const [dashLoading, setDashLoading] = useState(false);

    const loadDash = useCallback(async () => {
        setDashLoading(true);
        try {
            let since = dashSince, until = dashUntil;
            if (dashRange !== 'custom') {
                const days = dashRange === '7d' ? 7 : dashRange === '14d' ? 14 : 30;
                const end = new Date();
                const start = new Date(end.getTime() - days * 86400000);
                since = start.toISOString().slice(0, 10);
                until = end.toISOString().slice(0, 10);
            }
            const d = await api.getTrackingDashboard(source.id, since, until);
            setDash(d);
        } catch {
            setDash(null);
        } finally {
            setDashLoading(false);
        }
    }, [source.id, dashRange, dashSince, dashUntil]);

    useEffect(() => { loadDash(); }, [loadDash]);

    async function testCrm() {
        setCrmTest(null); setCrmTestErr('');
        try {
            const r = await api.testTrackingCrm(source.id);
            setCrmTest(r);
        } catch (err: any) {
            setCrmTestErr(err.message || 'Falha ao testar');
        }
    }

    async function runBackfill() {
        setBackfillRunning(true); setBackfillResult(null);
        try {
            const r = await api.runTrackingBackfill(source.id, {
                enrich_existing: backfillOpts.enrich_existing,
                sync_won_purchases: backfillOpts.sync_won_purchases,
                time_strategy: 'clamp_7d',
            });
            setBackfillResult(r);
            setTimeout(load, 1000);
        } catch (err: any) {
            setBackfillResult({ error: err.message });
        } finally {
            setBackfillRunning(false);
        }
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

                {/* Performance do cliente */}
                <Section title="Performance do cliente">
                    <div style={{
                        display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
                    }}>
                        {(['7d', '14d', '30d', 'custom'] as const).map(r => (
                            <button
                                key={r}
                                type="button"
                                className={`btn btn-sm ${dashRange === r ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setDashRange(r)}
                            >
                                {r === '7d' ? '7 dias' : r === '14d' ? '14 dias' : r === '30d' ? '30 dias' : 'Personalizado'}
                            </button>
                        ))}
                        {dashRange === 'custom' && (
                            <>
                                <input
                                    type="date"
                                    value={dashSince}
                                    onChange={e => setDashSince(e.target.value)}
                                    style={{
                                        padding: '4px 8px', fontSize: 12,
                                        background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                        borderRadius: 6, color: 'var(--text-primary)',
                                    }}
                                />
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>até</span>
                                <input
                                    type="date"
                                    value={dashUntil}
                                    onChange={e => setDashUntil(e.target.value)}
                                    style={{
                                        padding: '4px 8px', fontSize: 12,
                                        background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                        borderRadius: 6, color: 'var(--text-primary)',
                                    }}
                                />
                                <button type="button" className="btn btn-sm btn-secondary" onClick={loadDash}>
                                    Aplicar
                                </button>
                            </>
                        )}
                        <button type="button" className="btn btn-sm btn-ghost" onClick={loadDash} style={{ marginLeft: 'auto' }}>
                            <RefreshCw size={12} /> Atualizar
                        </button>
                    </div>

                    {dashLoading && !dash && (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                            Carregando performance…
                        </div>
                    )}

                    {dash && (
                        <>
                            {!dash.source?.has_account_link && (
                                <div style={{
                                    padding: '8px 12px', marginBottom: 12, fontSize: 12,
                                    background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.3)',
                                    borderRadius: 6, color: 'var(--accent-yellow)',
                                }}>
                                    <CircleAlert size={12} style={{ display: 'inline', marginRight: 4 }} />
                                    Conta Meta não vinculada — CPL, CPA, ROI e gasto não serão exibidos. Vincule em "Editar credenciais".
                                </div>
                            )}

                            {/* KPIs principais */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10,
                            }}>
                                <BigKpi
                                    icon={<Users size={14} />}
                                    label="Leads"
                                    value={dash.kpis.leads.toLocaleString('pt-BR')}
                                    hint={`${dash.kpis.qualified_rate.toFixed(0)}% qualificados`}
                                />
                                <BigKpi
                                    icon={<UserCheck size={14} />}
                                    label="Qualificados"
                                    value={dash.kpis.qualified.toLocaleString('pt-BR')}
                                    hint={dash.kpis.disqualified > 0 ? `${dash.kpis.disqualified} desqualificados` : undefined}
                                    color="var(--accent-green)"
                                />
                                <BigKpi
                                    icon={<Calendar size={14} />}
                                    label="Agendados"
                                    value={dash.kpis.scheduled.toLocaleString('pt-BR')}
                                    color="var(--accent-blue)"
                                />
                                <BigKpi
                                    icon={<ShoppingCart size={14} />}
                                    label="Vendas"
                                    value={dash.kpis.sales_count.toLocaleString('pt-BR')}
                                    hint={`${dash.kpis.conversion_rate.toFixed(1)}% conversão`}
                                    color="var(--accent-green)"
                                />
                                <BigKpi
                                    icon={<DollarSign size={14} />}
                                    label="Faturamento"
                                    value={`R$ ${Number(dash.kpis.sales_value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                                    hint={dash.kpis.sales_count > 0 ? `ticket médio R$ ${Number(dash.kpis.avg_ticket).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : undefined}
                                    color="var(--accent-green)"
                                />
                                <BigKpi
                                    icon={dash.kpis.roi_pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    label="ROI"
                                    value={dash.source?.has_account_link
                                        ? (dash.kpis.ad_spend > 0 ? `${dash.kpis.roi_pct.toFixed(0)}%` : '—')
                                        : '—'}
                                    hint={dash.source?.has_account_link && dash.kpis.ad_spend > 0
                                        ? `${dash.kpis.roas.toFixed(2)}x ROAS`
                                        : undefined}
                                    color={dash.kpis.roi_pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
                                />
                            </div>

                            {/* Métricas secundárias */}
                            {dash.source?.has_account_link && dash.kpis.ad_spend > 0 && (
                                <div style={{
                                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16,
                                }}>
                                    <SubKpi label="Investido" value={`R$ ${Number(dash.kpis.ad_spend).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} />
                                    <SubKpi label="CPL" value={dash.kpis.cpl > 0 ? `R$ ${Number(dash.kpis.cpl).toFixed(2)}` : '—'} />
                                    <SubKpi label="CPA" value={dash.kpis.cpa > 0 ? `R$ ${Number(dash.kpis.cpa).toFixed(2)}` : '—'} />
                                    <SubKpi
                                        label="Lucro líquido"
                                        value={`R$ ${Number(dash.kpis.revenue_minus_spend).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                                        color={dash.kpis.revenue_minus_spend >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
                                    />
                                </div>
                            )}

                            {/* Chart diário */}
                            {dash.daily && dash.daily.length > 0 && (
                                <div style={{
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    borderRadius: 8, padding: 12, marginBottom: 16,
                                }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                        Leads, vendas e investimento por dia
                                    </div>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <ComposedChart data={dash.daily} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                                            <XAxis
                                                dataKey="date"
                                                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                                                tickFormatter={(v: string) => {
                                                    const d = new Date(v + 'T00:00:00');
                                                    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                                                }}
                                            />
                                            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                                            <Tooltip
                                                contentStyle={{
                                                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                                                    borderRadius: 6, fontSize: 12,
                                                }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                            <Bar yAxisId="left" dataKey="leads" fill="var(--accent-blue)" name="Leads" />
                                            <Bar yAxisId="left" dataKey="sales" fill="var(--accent-green)" name="Vendas" />
                                            {dash.source?.has_account_link && (
                                                <Line yAxisId="right" type="monotone" dataKey="spend" stroke="var(--accent-yellow)" name="Investido (R$)" strokeWidth={2} dot={false} />
                                            )}
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Funil */}
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Funil de conversão</div>
                                <Funnel kpis={dash.kpis} />
                            </div>
                        </>
                    )}
                </Section>

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

                {/* ── WhatsApp Click-to-Message (Evolution API) ─────────── */}
                <Section title="WhatsApp Click-to-Message (ctwa_clid)">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        Conecte o Evolution API / Chatwoot pra capturar leads que vieram de <strong>anúncios WhatsApp</strong>.
                        Quando a primeira mensagem do usuário traz <span className="mono">ctwaClid</span>, nosso sistema
                        captura o telefone, busca o pixel do anúncio automaticamente e dispara <span className="mono">LeadSubmitted</span> com
                        <span className="mono"> action_source=business_messaging</span> + <span className="mono">messaging_channel=whatsapp</span>.
                    </p>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Endpoint Evolution API:</div>
                    <CopyBlock
                        value={detail?.webhook_secret
                            ? `${API_BASE}/track/whatsapp/${source.public_token}?key=${detail.webhook_secret}`
                            : `${API_BASE}/track/whatsapp/${source.public_token}`}
                        small
                    />
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, padding: '8px 10px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <CircleAlert size={13} style={{ marginTop: 1, flexShrink: 0, color: 'var(--text-muted)' }} />
                        <span>
                            No Evolution API: <strong>Instances → Settings → Webhooks</strong> → adiciona a URL acima e marca o evento
                            <span className="mono"> messages.upsert</span>. Leads que não vierem de anúncio (sem ctwa_clid) são ignorados automaticamente.
                        </span>
                    </div>
                </Section>

                <Section title="Webhook para CRM (Kommo, RD Station)">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        Configure no seu CRM para disparar em Lead, Qualificação, Agendamento e Venda.
                        Aceita 3 formas de autenticação (escolhe a que seu CRM suportar).
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

                    {detail?.webhook_secret && (
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>
                                    Opção 1 — Authorization Bearer (recomendado p/ Kommo)
                                </div>
                                <CopyBlock value={`Authorization: Bearer ${detail.webhook_secret}`} small />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>
                                    Opção 2 — URL com key (CRMs limitados)
                                </div>
                                <CopyBlock value={`${webhookUrl}?key=${detail.webhook_secret}`} small />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>
                                    Opção 3 — HMAC SHA-256 (mais seguro, exige middleware)
                                </div>
                                <CopyBlock value={`X-TAI-Signature: sha256(body, ${detail.webhook_secret.slice(0, 8)}…)`} small />
                            </div>
                        </div>
                    )}

                    {/* URLs prontas por estágio — só cola uma em cada bot do Kommo */}
                    {detail?.webhook_secret && (
                        <div style={{ marginTop: 18 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>
                                URLs prontas por estágio do pipeline
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                                Copia uma URL por estágio e cola no Salesbot correspondente do Kommo.
                                As 5 etapas padrão do funil são pré-configuradas abaixo.
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { label: 'Lead entrou', event: 'Lead', color: 'var(--accent-blue)' },
                                    { label: 'Qualificado', event: 'Contact', color: 'var(--primary)' },
                                    { label: 'Agendou reunião', event: 'Schedule', color: 'var(--accent-cyan)' },
                                    { label: 'Venda fechada', event: 'Purchase', color: 'var(--accent-green)' },
                                    { label: 'Perdido / Desqualificado', event: 'Lead_Desqualificado', color: 'var(--accent-red)' },
                                ].map(stage => (
                                    <div key={stage.event} style={{
                                        display: 'grid',
                                        gridTemplateColumns: '160px 1fr',
                                        gap: 10,
                                        alignItems: 'center',
                                    }}>
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            fontSize: 12.5,
                                            color: 'var(--text-primary)',
                                            fontWeight: 500,
                                        }}>
                                            <span style={{
                                                width: 6, height: 6, borderRadius: '50%',
                                                background: stage.color, flexShrink: 0,
                                            }} />
                                            {stage.label}
                                        </div>
                                        <CopyBlock
                                            value={`${webhookUrl}?key=${detail.webhook_secret}&event=${stage.event}`}
                                            small
                                        />
                                    </div>
                                ))}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, padding: '8px 10px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                <CircleAlert size={13} style={{ marginTop: 1, flexShrink: 0, color: 'var(--text-muted)' }} />
                                <span>
                                    No Kommo: <strong>Leads → Funis → ⚡ Automação → Adicionar Salesbot</strong>. Cria 1 bot por etapa,
                                    gatilho "Mudança de status", ação <strong>Enviar um webhook</strong> com a URL correspondente.
                                </span>
                            </div>
                        </div>
                    )}

                    <details style={{ marginTop: 14 }}>
                        <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}>
                            Exemplo de payload p/ Kommo
                        </summary>
                        <pre className="mono" style={{
                            marginTop: 8, padding: 12,
                            background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)',
                            overflow: 'auto', whiteSpace: 'pre',
                        }}>{`{
  "event": "Purchase",
  "external_id": "kommo-lead-{{lead.id}}",
  "value": {{deal.value}},
  "currency": "BRL",
  "user": {
    "email": "{{contact.email}}",
    "phone": "{{contact.phone}}",
    "first_name": "{{contact.first_name}}",
    "last_name": "{{contact.last_name}}"
  },
  "custom_data": {
    "pipeline": "{{pipeline.name}}",
    "stage": "{{status.name}}"
  }
}`}</pre>
                    </details>
                </Section>

                {/* ── Integração CRM + Backfill ──────────────────────────── */}
                <Section title="Integração CRM">
                    {!source.crm_type ? (
                        <div style={{
                            padding: 12, background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                            fontSize: 12.5, color: 'var(--text-muted)',
                        }}>
                            Nenhum CRM conectado. Clique em <strong>Editar credenciais</strong> acima para conectar Kommo e
                            habilitar enriquecimento de eventos + backfill de vendas fechadas como Purchase.
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {source.crm_type === 'kommo' ? 'Kommo' : source.crm_type} conectado
                                </span>
                                {source.crm_subdomain && (
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        · {source.crm_subdomain}.kommo.com
                                    </span>
                                )}
                                {source.last_backfill_at && (
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                        último backfill {fmtRelative(source.last_backfill_at)}
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={testCrm}>
                                    <ShieldCheck size={13} /> Testar conexão
                                </button>
                                <button type="button" className="btn btn-primary btn-sm"
                                    onClick={() => { setShowBackfill(v => !v); setBackfillResult(null); }}>
                                    <RefreshCw size={13} /> Backfill
                                </button>
                            </div>

                            {crmTestErr && (
                                <div style={{
                                    padding: '8px 12px', background: 'rgba(239,68,68,.08)',
                                    border: '1px solid rgba(239,68,68,.22)', borderRadius: 'var(--radius-sm)',
                                    fontSize: 12, color: '#fca5a5', marginBottom: 10,
                                }}>
                                    {crmTestErr}
                                </div>
                            )}
                            {crmTest && (
                                <div style={{
                                    padding: '10px 12px', background: 'rgba(34,197,94,.08)',
                                    border: '1px solid rgba(34,197,94,.22)', borderRadius: 'var(--radius-sm)',
                                    fontSize: 12.5, marginBottom: 10,
                                }}>
                                    <div style={{ color: 'var(--accent-green)', fontWeight: 500 }}>
                                        Conexão OK · {crmTest.account?.name}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                                        {crmTest.won_statuses?.length || 0} status de venda detectado(s).
                                    </div>
                                </div>
                            )}

                            {showBackfill && (
                                <div style={{
                                    padding: 14,
                                    background: 'var(--bg-surface-2)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md)',
                                    marginTop: 4,
                                }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--text-primary)' }}>
                                        Opções de backfill
                                    </div>
                                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 10 }}>
                                        <input
                                            type="checkbox"
                                            checked={backfillOpts.enrich_existing}
                                            onChange={e => setBackfillOpts(o => ({ ...o, enrich_existing: e.target.checked }))}
                                            style={{ marginTop: 3 }}
                                        />
                                        <div>
                                            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                                Enriquecer eventos antigos com dados do CRM
                                            </div>
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                                Busca email/telefone/nome no CRM para eventos que chegaram sem esses dados e reenvia pra Meta com o mesmo event_id (dedup automático).
                                            </div>
                                        </div>
                                    </label>
                                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
                                        <input
                                            type="checkbox"
                                            checked={backfillOpts.sync_won_purchases}
                                            onChange={e => setBackfillOpts(o => ({ ...o, sync_won_purchases: e.target.checked }))}
                                            style={{ marginTop: 3 }}
                                        />
                                        <div>
                                            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                                Sincronizar vendas fechadas como Purchase
                                            </div>
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                                Busca todos os leads em etapas de venda ganha (com valor &gt; 0) e dispara Purchase pra Meta com value, currency e PII hashado.
                                            </div>
                                        </div>
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button type="button" className="btn btn-primary btn-sm"
                                            onClick={runBackfill} disabled={backfillRunning}>
                                            {backfillRunning
                                                ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Executando…</>
                                                : 'Executar backfill'}
                                        </button>
                                        <button type="button" className="btn btn-ghost btn-sm"
                                            onClick={() => setShowBackfill(false)}>Cancelar</button>
                                    </div>
                                    {backfillRunning && (
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
                                            Pode levar 1-3 minutos dependendo do volume. Não feche esta janela.
                                        </div>
                                    )}
                                    {backfillResult && (
                                        <div style={{
                                            marginTop: 12, padding: 10,
                                            background: backfillResult.error ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)',
                                            border: `1px solid ${backfillResult.error ? 'rgba(239,68,68,.22)' : 'rgba(34,197,94,.22)'}`,
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: 12.5,
                                        }}>
                                            {backfillResult.error ? (
                                                <span style={{ color: 'var(--accent-red)' }}>{backfillResult.error}</span>
                                            ) : (
                                                <>
                                                    <div style={{ color: 'var(--accent-green)', fontWeight: 500 }}>
                                                        Backfill concluído
                                                    </div>
                                                    <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                                                        {backfillResult.enriched > 0 && <>{backfillResult.enriched} evento(s) enriquecido(s). </>}
                                                        {backfillResult.purchases_created > 0 && <>{backfillResult.purchases_created} Purchase criado(s) (R$ {Number(backfillResult.total_purchase_value).toLocaleString('pt-BR')}). </>}
                                                        {backfillResult.skipped > 0 && <>{backfillResult.skipped} pulado(s) (sem PII). </>}
                                                        {backfillResult.failed > 0 && <span style={{ color: 'var(--accent-red)' }}>{backfillResult.failed} falha(s).</span>}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
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
                                        <tr key={e.id} onClick={() => setInspectEventId(e.id)} style={{ cursor: 'pointer' }}>
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

            {inspectEventId && (
                <EventDetailModal
                    eventId={inspectEventId}
                    onClose={() => setInspectEventId(null)}
                />
            )}
        </div>
    );
}

// ─── Event Detail Modal — auditoria completa ────────────────────────────────

function EventDetailModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError('');
        api.getTrackingEvent(eventId)
            .then((d) => { if (!cancelled) setData(d); })
            .catch((e: any) => { if (!cancelled) setError(e.message || 'Falha ao carregar'); })
            .finally(() => { if (!cancelled) setLoading(false); });

        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => { cancelled = true; window.removeEventListener('keydown', handler); };
    }, [eventId, onClose]);

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div
                className="modal-box"
                style={{ maxWidth: 820, maxHeight: '92vh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <div style={{ minWidth: 0 }}>
                        <div className="modal-title">Auditoria do evento</div>
                        {data && (
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                <span className="mono">{data.event_name}</span>
                                {' · '}
                                <span className="mono">{data.event_id?.slice(0, 24)}{data.event_id?.length > 24 ? '…' : ''}</span>
                            </div>
                        )}
                    </div>
                    <button className="modal-close" onClick={onClose} type="button"><X size={16} /></button>
                </div>

                {loading && <div className="loading-spinner"><div className="spinner" /></div>}
                {error && (
                    <div style={{
                        padding: '10px 12px',
                        background: 'rgba(239,68,68,.08)',
                        border: '1px solid rgba(239,68,68,.22)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#fca5a5', fontSize: 13,
                    }}>{error}</div>
                )}

                {data && (
                    <>
                        {/* Status bar */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                            <MiniKpi label="Status" value={data.meta_status || '—'}
                                color={data.meta_status === 'sent' ? 'var(--accent-green)' : 'var(--accent-red)'} />
                            <MiniKpi label="EMQ" value={String(data.emq_score || 0)}
                                color={data.emq_score >= 7 ? 'var(--accent-green)' : data.emq_score >= 4 ? 'var(--accent-yellow)' : 'var(--accent-red)'} />
                            <MiniKpi label="Origem" value={data.action_source} />
                            <MiniKpi label="Quando" value={fmtRelative(data.created_at)} />
                        </div>

                        {/* Identificação */}
                        <AuditField label="event_name" value={data.event_name} />
                        <AuditField label="event_id" value={data.event_id} mono />
                        <AuditField label="event_time" value={`${data.event_time} (${data.event_time_iso})`} mono />
                        {data.external_id && <AuditField label="external_id" value={data.external_id} mono />}
                        {data.event_source_url && <AuditField label="event_source_url" value={data.event_source_url} />}
                        {data.value != null && <AuditField label="valor" value={`${data.currency || 'R$'} ${Number(data.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />}

                        {/* PII hashada */}
                        {data.user_data_hashed && Object.keys(data.user_data_hashed).length > 0 && (
                            <AuditSection title="user_data (PII hashada SHA-256)">
                                <PayloadJson value={data.user_data_hashed} />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                    Campos: {Object.keys(data.user_data_hashed).join(', ')}.
                                    {data.user_data_hashed.em && ' ✓ email'}
                                    {data.user_data_hashed.ph && ' ✓ telefone'}
                                    {data.user_data_hashed.fn && ' ✓ nome'}
                                    {data.user_data_hashed.external_id && ' ✓ external_id'}
                                </div>
                            </AuditSection>
                        )}

                        {/* Custom data */}
                        {data.custom_data && Object.keys(data.custom_data).length > 0 && (
                            <AuditSection title="custom_data">
                                <PayloadJson value={data.custom_data} />
                            </AuditSection>
                        )}

                        {/* Contexto técnico */}
                        {(data.client_ip || data.client_user_agent || data.country) && (
                            <AuditSection title="Contexto técnico">
                                {data.client_ip && <AuditField label="IP" value={data.client_ip} mono />}
                                {data.client_user_agent && <AuditField label="User-Agent" value={data.client_user_agent} mono />}
                                {data.country && <AuditField label="país" value={data.country} />}
                                {data.fbp && <AuditField label="fbp" value={data.fbp} mono />}
                                {data.fbc && <AuditField label="fbc" value={data.fbc} mono />}
                            </AuditSection>
                        )}

                        {/* Payload completo enviado */}
                        <AuditSection title="Payload enviado pra Meta CAPI">
                            <div style={{
                                fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)',
                            }}>
                                POST {data.meta_request?.url}
                            </div>
                            <PayloadJson value={data.meta_request?.body} />
                        </AuditSection>

                        {/* Resposta Meta */}
                        <AuditSection title={data.meta_status === 'sent' ? 'Resposta Meta ✓' : 'Resposta Meta — falha'}>
                            {data.meta_fbtrace_id && (
                                <div style={{ fontSize: 12, marginBottom: 6 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>fbtrace_id: </span>
                                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{data.meta_fbtrace_id}</span>
                                </div>
                            )}
                            {data.meta_error && (
                                <div style={{
                                    padding: '8px 12px', background: 'rgba(239,68,68,.08)',
                                    border: '1px solid rgba(239,68,68,.22)', borderRadius: 'var(--radius-sm)',
                                    fontSize: 12.5, color: '#fca5a5', marginBottom: 8,
                                }}>
                                    {data.meta_error}
                                </div>
                            )}
                            {data.meta_response && <PayloadJson value={data.meta_response} />}
                        </AuditSection>

                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">Fechar</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function AuditField({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)', minWidth: 120, fontSize: 12 }}>{label}</span>
            <span className={mono ? 'mono' : ''} style={{
                color: 'var(--text-primary)', wordBreak: 'break-all',
                fontSize: mono ? 12 : 13,
            }}>
                {value}
            </span>
        </div>
    );
}

function AuditSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginTop: 18, marginBottom: 4 }}>
            <div style={{
                fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: 0.6, fontWeight: 600, marginBottom: 8,
            }}>
                {title}
            </div>
            {children}
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
                {copied ? <Check size={13} color="var(--accent-green)" /> : <Copy size={13} />}
            </button>
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

function BigKpi({ icon, label, value, hint, color }: {
    icon: React.ReactNode; label: string; value: string; hint?: string; color?: string;
}) {
    return (
        <div style={{
            padding: '12px 14px',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            minHeight: 78,
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600,
            }}>
                <span style={{ color: color || 'var(--text-muted)' }}>{icon}</span>
                {label}
            </div>
            <div className="num" style={{
                fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)', marginTop: 4, lineHeight: 1.15,
            }}>
                {value}
            </div>
            {hint && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
            )}
        </div>
    );
}

function SubKpi({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{
            padding: '8px 10px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
        }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {label}
            </div>
            <div className="num" style={{ fontSize: 14, fontWeight: 600, color: color || 'var(--text-primary)', marginTop: 1 }}>
                {value}
            </div>
        </div>
    );
}

function Funnel({ kpis }: { kpis: any }) {
    const steps = [
        { label: 'Leads', value: kpis.leads, color: 'var(--accent-blue)' },
        { label: 'Qualificados', value: kpis.qualified, color: 'var(--accent-cyan, #06b6d4)' },
        { label: 'Agendados', value: kpis.scheduled, color: 'var(--accent-purple, #a855f7)' },
        { label: 'Vendas', value: kpis.sales_count, color: 'var(--accent-green)' },
    ];
    const max = Math.max(...steps.map(s => s.value), 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {steps.map((s, i) => {
                const pct = (s.value / max) * 100;
                const convFromPrev = i > 0 && steps[i - 1].value > 0
                    ? ((s.value / steps[i - 1].value) * 100).toFixed(0) + '%'
                    : null;
                return (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 110, fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</div>
                        <div style={{
                            flex: 1, height: 22, background: 'var(--bg-tertiary)',
                            borderRadius: 4, overflow: 'hidden', position: 'relative',
                        }}>
                            <div style={{
                                width: `${Math.max(pct, 1)}%`, height: '100%',
                                background: s.color, transition: 'width 0.3s',
                                display: 'flex', alignItems: 'center', paddingLeft: 8,
                                fontSize: 11, fontWeight: 600, color: '#000', whiteSpace: 'nowrap',
                            }}>
                                {s.value.toLocaleString('pt-BR')}
                            </div>
                        </div>
                        <div style={{ width: 60, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                            {convFromPrev || '—'}
                        </div>
                    </div>
                );
            })}
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
            crm_type: source.crm_type || '',
            crm_subdomain: source.crm_subdomain || '',
            crm_access_token: '', // mesma lógica: só envia se preencher
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
                    crm_type: form.crm_type || null,
                    crm_subdomain: form.crm_subdomain.trim() || null,
                };
                // Só envia tokens se foram preenchidos (preserva atuais se vazio)
                if (form.access_token.trim()) payload.access_token = form.access_token.trim();
                if (form.crm_access_token.trim()) payload.crm_access_token = form.crm_access_token.trim();
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

                {/* ── Integração CRM (opcional) ──────────────────────────── */}
                {mode === 'edit' && (
                    <>
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
                                Integração CRM (opcional)
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                                Conecta um CRM para enriquecer eventos antigos e sincronizar vendas fechadas como Purchase.
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Tipo de CRM</label>
                            <select
                                className="form-select"
                                value={form.crm_type}
                                onChange={e => upd('crm_type', e.target.value)}
                            >
                                <option value="">— Nenhum —</option>
                                <option value="kommo">Kommo</option>
                            </select>
                        </div>

                        {form.crm_type === 'kommo' && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Subdomínio Kommo</label>
                                    <input
                                        type="text" className="form-input"
                                        value={form.crm_subdomain}
                                        onChange={e => upd('crm_subdomain', e.target.value)}
                                        placeholder="ex: alinemeloce"
                                    />
                                    <span className="form-hint">Parte antes de .kommo.com na URL que você acessa.</span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Access Token Kommo</label>
                                    <input
                                        type="password" className="form-input"
                                        value={form.crm_access_token}
                                        onChange={e => upd('crm_access_token', e.target.value)}
                                        placeholder={source?.crm_access_token ? 'Deixe vazio para manter o atual' : 'Configurações → Integrações → Privada → Access Token'}
                                        autoComplete="off"
                                    />
                                </div>
                            </>
                        )}
                    </>
                )}

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
