'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
    Activity, Plus, X, Copy, Check, Trash2, Pencil, RefreshCw, Clock,
    Zap, ShieldCheck, CircleAlert, Sparkles, Globe, ChevronDown,
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
    // Health signals
    last_event_at?: string | null;
    last_pixel_event_at?: string | null;
    pending_retries?: number | string;
    status?: {
        state: 'healthy' | 'active' | 'idle' | 'dead' | 'pixel_missing' | 'error_rate' | 'inactive' | 'test_mode';
        detail: string;
        severity: 'ok' | 'info' | 'warn' | 'error';
    };
}

const STATUS_VISUAL: Record<string, { label: string; color: string; bg: string }> = {
    healthy:        { label: 'Saudável',        color: '#10b981', bg: 'rgba(16,185,129,.12)' },
    active:         { label: 'Ativo',           color: '#10b981', bg: 'rgba(16,185,129,.10)' },
    idle:           { label: 'Ocioso',          color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },
    dead:           { label: 'Sem atividade',   color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
    pixel_missing:  { label: 'Pixel ausente',   color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
    error_rate:     { label: 'Erros altos',     color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
    inactive:       { label: 'Desativada',      color: '#94a3b8', bg: 'rgba(148,163,184,.10)' },
    test_mode:      { label: 'Modo teste',      color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
};

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
    const status = source.status;
    const visual = status ? STATUS_VISUAL[status.state] : null;
    const dotColor = visual?.color || (source.is_active ? 'var(--accent-green)' : 'var(--text-muted)');

    return (
        <div className="card" style={{ cursor: 'pointer', padding: 18 }} onClick={onOpen}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span title={status?.detail || ''} style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: dotColor,
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

            {/* Status pill — só aparece quando há algo a destacar */}
            {visual && (status?.severity === 'warn' || status?.severity === 'error' || status?.state === 'inactive') && (
                <div title={status.detail} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11.5, color: visual.color,
                    padding: '3px 8px', borderRadius: 999,
                    background: visual.bg,
                    border: `1px solid ${visual.color}33`,
                    marginBottom: 10,
                }}>
                    <CircleAlert size={12} /> {visual.label} — {status.detail}
                </div>
            )}
            {visual && status?.severity === 'ok' && events > 0 && (
                <div title={status.detail} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, color: visual.color,
                    padding: '2px 7px', borderRadius: 999,
                    background: visual.bg,
                    marginBottom: 10,
                }}>
                    {visual.label}
                </div>
            )}

            {/* Aviso de EMQ baixo persistente — geralmente sinal de webhook Kommo sem token API */}
            {emq > 0 && emq < 4 && events > 10 && !source.crm_type && (
                <div title="EMQ médio < 4 indica que a Meta está recebendo eventos sem email/telefone do contato. Configure a Integração CRM (Kommo) em Editar credenciais pra enriquecer automaticamente."
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 11, color: 'var(--accent-yellow)',
                        padding: '3px 8px', borderRadius: 999,
                        background: 'rgba(245,158,11,.10)',
                        border: '1px solid rgba(245,158,11,.25)',
                        marginBottom: 10,
                    }}>
                    <CircleAlert size={11} /> PII fraca — configure CRM pra enriquecer
                </div>
            )}

            {/* Auto-sync chip — fonte com CRM configurado sincroniza automaticamente 1x/dia */}
            {source.crm_type && (
                <div title={source.last_backfill_at
                    ? `Auto-sync diário às 01:30 BRT — varre leads ganhos no Kommo e dispara Purchase pra Meta. Última execução: ${fmtRelative(source.last_backfill_at)}. Pra real-time, configure Salesbot no Kommo.`
                    : `Auto-sync ativa — leads ganhos viram Purchase automaticamente 1x/dia. Pra real-time, configure Salesbot no Kommo.`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 11, color: 'var(--accent-green)',
                        padding: '3px 8px', borderRadius: 999,
                        background: 'rgba(16,185,129,.10)',
                        border: '1px solid rgba(16,185,129,.25)',
                        marginBottom: 10,
                    }}>
                    <Zap size={11} />
                    Auto-sync diário · {source.last_backfill_at ? fmtRelative(source.last_backfill_at) : 'aguardando 1º ciclo'}
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
    const [eventsTotal, setEventsTotal] = useState(0);
    const [eventsOffset, setEventsOffset] = useState(0);
    const [eventSearch, setEventSearch] = useState('');
    const [eventStatusFilter, setEventStatusFilter] = useState<'' | 'sent' | 'failed'>('');
    const [eventFrom, setEventFrom] = useState('');
    const [eventTo, setEventTo] = useState('');
    const [eventsLoading, setEventsLoading] = useState(false);
    const [health, setHealth] = useState<any>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string>('');
    const [rotating, setRotating] = useState(false);

    // Modal tab navigation
    type TabKey = 'setup' | 'overview' | 'events' | 'install' | 'crm';
    const [activeTab, setActiveTab] = useState<TabKey>('setup');

    // Auth method segmented control (na aba CRM)
    type AuthMethod = 'bearer' | 'key' | 'hmac';
    const [authMethod, setAuthMethod] = useState<AuthMethod>('bearer');

    const EVENTS_PER_PAGE = 25;

    const loadEvents = useCallback(async (offset = 0) => {
        setEventsLoading(true);
        try {
            const r = await api.getTrackingEvents(source.id, {
                limit: EVENTS_PER_PAGE,
                offset,
                status: eventStatusFilter || undefined,
                from: eventFrom ? new Date(eventFrom + 'T00:00:00').toISOString() : undefined,
                to: eventTo ? new Date(eventTo + 'T23:59:59').toISOString() : undefined,
                search: eventSearch.trim() || undefined,
            });
            setEvents(r.data);
            setEventsTotal(r.total);
            setEventsOffset(r.offset);
        } catch {
            setEvents([]);
            setEventsTotal(0);
        } finally {
            setEventsLoading(false);
        }
    }, [source.id, eventStatusFilter, eventFrom, eventTo, eventSearch]);

    const load = useCallback(async () => {
        try {
            const [d, s, h] = await Promise.all([
                api.getTrackingSource(source.id),
                api.getTrackingStats(source.id, 7).catch(() => null),
                api.getTrackingHealth(source.id).catch(() => null),
            ]);
            setDetail(d);
            setStats(s);
            setHealth(h);
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

    // Lazy load: só carrega eventos quando entrar na aba "events" pela primeira vez
    const [eventsLoaded, setEventsLoaded] = useState(false);
    useEffect(() => {
        if (activeTab === 'events' && !eventsLoaded) {
            loadEvents(0);
            setEventsLoaded(true);
        }
    }, [activeTab, eventsLoaded, loadEvents]);

    const [testDetail, setTestDetail] = useState<any>(null);
    async function runTest() {
        setTesting(true); setTestResult('');
        try {
            const r = await api.testTrackingSource(source.id);
            setTestDetail(r);
            setTestResult(r?.meta_status === 'sent' ? 'OK · enviado para a Meta' : 'Falhou · verifique credenciais');
            setTimeout(load, 1000);
        } catch (err: any) {
            setTestDetail({ error: err.message || 'desconhecido' });
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

    const [retrying, setRetrying] = useState(false);
    const [retryResult, setRetryResult] = useState<string>('');
    async function retryFailed() {
        setRetrying(true); setRetryResult('');
        try {
            const r = await api.retryTrackingFailed(source.id);
            if (r.attempted === 0) {
                setRetryResult('Nenhum evento falho elegível');
            } else {
                setRetryResult(`${r.succeeded}/${r.attempted} recuperado${r.succeeded !== 1 ? 's' : ''}`);
            }
            setTimeout(load, 800);
        } catch (err: any) {
            setRetryResult('Erro: ' + (err.message || 'falha'));
        } finally { setRetrying(false); }
    }

    // CRM backfill state + handlers
    const [showBackfill, setShowBackfill] = useState(false);
    const [backfillOpts, setBackfillOpts] = useState({
        enrich_existing: true,
        sync_won_purchases: true,
        sync_leads: false,
        lead_stage_ids: [] as number[],
    });
    const [pipelines, setPipelines] = useState<{
        id: number;
        name: string;
        statuses: { id: number; name: string; type?: number }[];
    }[]>([]);
    const [loadingPipelines, setLoadingPipelines] = useState(false);
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
                sync_leads: backfillOpts.sync_leads,
                lead_stage_ids: backfillOpts.lead_stage_ids.length > 0 ? backfillOpts.lead_stage_ids : undefined,
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
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="modal-title">{source.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {source.domain || 'sem domínio'} · token: <span className="mono">{source.public_token.slice(0, 12)}…</span>
                        </div>
                        {/* Status strip compacto — live view do estado da fonte */}
                        <StatusStrip source={detail || source} stats={stats} />
                    </div>
                    <button className="modal-close" onClick={onClose} type="button"><X size={16} /></button>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={runTest} disabled={testing}>
                        <Sparkles size={13} /> {testing ? 'Testando…' : 'Disparar evento de teste'}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                        <Pencil size={13} /> Editar credenciais
                    </button>
                    {Number(stats?.totals?.failed || 0) > 0 && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={retryFailed} disabled={retrying}
                            title="Reenvia todos os eventos que falharam nas últimas 24h">
                            <RefreshCw size={13} style={retrying ? { animation: 'spin 1s linear infinite' } : undefined} />
                            {retrying ? 'Reenviando…' : `Reenviar ${stats?.totals?.failed || ''} falho${Number(stats?.totals?.failed || 0) !== 1 ? 's' : ''}`}
                        </button>
                    )}
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
                    {retryResult && (
                        <span style={{
                            fontSize: 12,
                            color: retryResult.startsWith('Erro') || retryResult.startsWith('Nenhum')
                                ? 'var(--text-muted)' : 'var(--accent-green)',
                            alignSelf: 'center',
                        }}>
                            {retryResult}
                        </span>
                    )}
                </div>

                {/* Tab navigation */}
                <ModalTabs
                    active={activeTab}
                    onChange={setActiveTab}
                    badges={{
                        setup: (() => {
                            const s = detail || source;
                            const events24h = Number(stats?.totals?.total || 0);
                            const pendingCount = [
                                !s.pixel_id,
                                !(s as any).access_token && !detail?.access_token,
                                events24h === 0,
                                !s.crm_type,
                            ].filter(Boolean).length;
                            return pendingCount > 0 ? pendingCount : undefined;
                        })(),
                        events: stats?.totals?.failed > 0 ? Number(stats.totals.failed) : undefined,
                        crm: source.crm_type ? 'on' : undefined,
                    }}
                />

                {/* ───────── TAB: SETUP ───────── */}
                {activeTab === 'setup' && (
                <div className="tab-fade-in">
                    <SetupChecklist
                        source={detail || source}
                        stats={stats}
                        onGoTo={setActiveTab}
                        onOpenEdit={onEdit}
                        onRunTest={runTest}
                        testing={testing}
                        testResult={testResult}
                    />
                </div>
                )}

                {/* ───────── TAB: VISÃO GERAL ───────── */}
                {activeTab === 'overview' && (
                <div className="tab-fade-in">

                {/* Health banner */}
                {health && (
                    <HealthBanner health={health} />
                )}

                {/* Stats */}
                {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
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

                </div>
                )}
                {/* ───────── TAB: INSTALAÇÃO ───────── */}
                {activeTab === 'install' && (
                <div className="tab-fade-in">

                {/* Integration */}
                <Section title="Pixel do site">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        Cole antes do fechamento de <span className="mono">&lt;/head&gt;</span>. Dispara PageView automaticamente e
                        expõe <span className="mono">window.TrafficAI.track(...)</span>.
                    </p>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Script de instalação</div>
                    <CopyBlock value={embed} />
                    <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>URL do pixel</div>
                        <CopyBlock value={pixelUrl} small />
                    </div>
                </Section>

                {/* ── WhatsApp Click-to-Message (Evolution API) ─────────── */}
                <Section title="WhatsApp Click-to-Message">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        Captura leads vindos de anúncios WhatsApp usando o <span className="mono">ctwa_clid</span> da primeira mensagem.
                        Dispara Lead com <span className="mono">action_source=business_messaging</span>.
                    </p>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Endpoint Evolution API</div>
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

                </div>
                )}
                {/* ───────── TAB: CRM ───────── */}
                {activeTab === 'crm' && (
                <div className="tab-fade-in">

                <Section title="Webhook do CRM">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        Endpoint pra disparar eventos do funil (Lead, Qualificado, Agendado, Venda) direto pra Meta CAPI.
                    </p>

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Endpoint</div>
                    <CopyBlock value={webhookUrl} small />

                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Secret</div>
                            <CopyBlock value={detail?.webhook_secret || '••••••••••••'} small masked={!detail?.webhook_secret} />
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={rotate} disabled={rotating}>
                            {rotating ? 'Rotacionando…' : 'Rotacionar'}
                        </button>
                    </div>

                    {detail?.webhook_secret && (() => {
                        const AUTH_OPTIONS: { key: AuthMethod; label: string; tag?: string; value: string; hint: string }[] = [
                            {
                                key: 'bearer',
                                label: 'Bearer',
                                tag: 'recomendado',
                                value: `Authorization: Bearer ${detail.webhook_secret}`,
                                hint: 'Adicione esse header no webhook do CRM. Funciona com Kommo.',
                            },
                            {
                                key: 'key',
                                label: 'URL key',
                                value: `${webhookUrl}?key=${detail.webhook_secret}`,
                                hint: 'Use quando o CRM não permite header customizado.',
                            },
                            {
                                key: 'hmac',
                                label: 'HMAC SHA-256',
                                value: `X-TAI-Signature: sha256(body, ${detail.webhook_secret.slice(0, 8)}…)`,
                                hint: 'Mais seguro — exige middleware que assine o body.',
                            },
                        ];
                        const selected = AUTH_OPTIONS.find(o => o.key === authMethod) || AUTH_OPTIONS[0];

                        return (
                            <div style={{ marginTop: 18 }}>
                                <Accordion
                                    title="Método de autenticação"
                                    subtitle="Bearer é o recomendado — os outros são pra casos específicos"
                                    defaultOpen={false}
                                >
                                    {/* Segmented control */}
                                    <div role="tablist" style={{
                                        display: 'inline-flex',
                                        padding: 3,
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                        marginBottom: 12,
                                        marginTop: 8,
                                    }}>
                                        {AUTH_OPTIONS.map(opt => {
                                            const isActive = authMethod === opt.key;
                                            return (
                                                <button
                                                    key={opt.key}
                                                    role="tab"
                                                    type="button"
                                                    aria-selected={isActive}
                                                    onClick={() => setAuthMethod(opt.key)}
                                                    style={{
                                                        padding: '6px 14px',
                                                        fontSize: 12.5,
                                                        fontWeight: 600,
                                                        color: isActive ? '#fff' : 'var(--text-muted)',
                                                        background: isActive ? 'var(--primary)' : 'transparent',
                                                        border: 'none',
                                                        borderRadius: 6,
                                                        cursor: 'pointer',
                                                        transition: 'background 150ms ease, color 150ms ease',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                    }}
                                                >
                                                    {opt.label}
                                                    {opt.tag && (
                                                        <span style={{
                                                            fontSize: 9.5,
                                                            fontWeight: 700,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: 0.4,
                                                            padding: '2px 5px',
                                                            borderRadius: 4,
                                                            background: isActive ? 'rgba(255,255,255,.22)' : 'rgba(16,185,129,.16)',
                                                            color: isActive ? '#fff' : 'var(--accent-green)',
                                                        }}>
                                                            {opt.tag}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <CopyBlock value={selected.value} small />
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                                        {selected.hint}
                                    </div>
                                </Accordion>
                            </div>
                        );
                    })()}

                    {/* URLs prontas por estágio — layout mais denso, 2 colunas no desktop */}
                    {detail?.webhook_secret && (
                        <div style={{ marginTop: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
                                    URLs por estágio do pipeline
                                </div>
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    1 URL por Salesbot do Kommo
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                                {[
                                    { label: 'Lead entrou',              event: 'Lead',                color: 'var(--accent-blue)' },
                                    { label: 'Qualificado',              event: 'Contact',             color: 'var(--primary)' },
                                    { label: 'Agendou reunião',          event: 'Schedule',            color: 'var(--accent-cyan)' },
                                    { label: 'Venda fechada',            event: 'Purchase',            color: 'var(--accent-green)' },
                                    { label: 'Perdido/Desqualificado',   event: 'Lead_Desqualificado', color: 'var(--accent-red)' },
                                ].map(stage => (
                                    <div key={stage.event} style={{
                                        display: 'grid',
                                        gridTemplateColumns: '170px 1fr',
                                        gap: 10,
                                        alignItems: 'center',
                                        padding: '4px 0',
                                    }}>
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            fontSize: 12.5,
                                            color: 'var(--text-primary)',
                                        }}>
                                            <span style={{
                                                width: 7, height: 7, borderRadius: '50%',
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
                                    No Kommo: <strong>Leads → Funis → Automação → Adicionar Salesbot</strong> · gatilho "Mudança de status" ·
                                    ação <strong>Enviar um webhook</strong> com a URL correspondente.
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

                                    {/* NOVO: Sincronizar Lead retroativo */}
                                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 8 }}>
                                        <input
                                            type="checkbox"
                                            checked={backfillOpts.sync_leads}
                                            onChange={async e => {
                                                const on = e.target.checked;
                                                setBackfillOpts(o => ({ ...o, sync_leads: on }));
                                                if (on && pipelines.length === 0) {
                                                    setLoadingPipelines(true);
                                                    try {
                                                        const r = await api.getTrackingCrmPipelines(source.id);
                                                        setPipelines(r.pipelines || []);
                                                    } catch { /* fica em auto-detect se falhar */ }
                                                    finally { setLoadingPipelines(false); }
                                                }
                                            }}
                                            style={{ marginTop: 3 }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                                Sincronizar leads como Lead (retroativo)
                                            </div>
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                                Dispara Lead pra Meta pra leads existentes nos estágios que você escolher. Sem seleção: detecta automaticamente estágios com nome "qualif/lead/novo/prospec".
                                            </div>
                                        </div>
                                    </label>

                                    {/* Seletor de estágios (só aparece se sync_leads ativo) */}
                                    {backfillOpts.sync_leads && (
                                        <div style={{
                                            marginLeft: 24, marginBottom: 14,
                                            padding: 10,
                                            background: 'var(--bg-surface-2)',
                                            border: '1px solid var(--border)',
                                            borderRadius: 8,
                                        }}>
                                            {loadingPipelines ? (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando pipelines…</div>
                                            ) : pipelines.length === 0 ? (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    Sem pipelines carregados — usará auto-detecção por nome do estágio.
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
                                                        Estágios a considerar como Lead ({backfillOpts.lead_stage_ids.length} selecionado{backfillOpts.lead_stage_ids.length !== 1 ? 's' : ''})
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                                                        {pipelines.map(p => (
                                                            <div key={p.id}>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                                                    {p.name}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                                    {p.statuses.filter(s => s.id !== 142 && s.id !== 143).map(s => {
                                                                        const selected = backfillOpts.lead_stage_ids.includes(s.id);
                                                                        return (
                                                                            <button key={s.id} type="button"
                                                                                onClick={() => setBackfillOpts(o => ({
                                                                                    ...o,
                                                                                    lead_stage_ids: selected
                                                                                        ? o.lead_stage_ids.filter(x => x !== s.id)
                                                                                        : [...o.lead_stage_ids, s.id],
                                                                                }))}
                                                                                style={{
                                                                                    padding: '4px 10px',
                                                                                    fontSize: 11.5,
                                                                                    fontWeight: selected ? 600 : 500,
                                                                                    borderRadius: 999,
                                                                                    border: selected
                                                                                        ? '1px solid var(--primary)'
                                                                                        : '1px solid var(--border)',
                                                                                    background: selected
                                                                                        ? 'var(--primary-soft)'
                                                                                        : 'var(--bg-card)',
                                                                                    color: selected ? 'var(--primary)' : 'var(--text-secondary)',
                                                                                    cursor: 'pointer',
                                                                                }}>
                                                                                {s.name}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8 }}>
                                                        Deixe todos desmarcados pra auto-detecção. Estágios de "ganho/perdido" são sempre excluídos.
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

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
                                                        {backfillResult.leads_created > 0 && <>{backfillResult.leads_created} Lead criado(s). </>}
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

                </div>
                )}
                {/* ───────── TAB: EVENTOS ───────── */}
                {activeTab === 'events' && (
                <div className="tab-fade-in">

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

                {/* Events explorer with filters */}
                <Section title={`Eventos${eventsTotal > 0 ? ` (${eventsTotal.toLocaleString('pt-BR')})` : ''}`}>
                    {/* Filtros */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="search"
                            placeholder="Buscar por event_id, external_id, fbtrace_id…"
                            value={eventSearch}
                            onChange={e => setEventSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') loadEvents(0); }}
                            style={{
                                flex: '1 1 220px', minWidth: 200, padding: '6px 10px', fontSize: 12.5,
                                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                borderRadius: 8, color: 'var(--text-primary)',
                            }}
                        />
                        <select
                            value={eventStatusFilter}
                            onChange={e => { setEventStatusFilter(e.target.value as any); }}
                            style={{
                                padding: '6px 8px', fontSize: 12.5,
                                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                borderRadius: 8, color: 'var(--text-primary)',
                            }}
                        >
                            <option value="">Todos status</option>
                            <option value="sent">Enviados</option>
                            <option value="failed">Falhos</option>
                        </select>
                        <input
                            type="date"
                            value={eventFrom}
                            onChange={e => setEventFrom(e.target.value)}
                            title="De"
                            style={{
                                padding: '6px 8px', fontSize: 12.5,
                                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                borderRadius: 8, color: 'var(--text-primary)',
                            }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>até</span>
                        <input
                            type="date"
                            value={eventTo}
                            onChange={e => setEventTo(e.target.value)}
                            title="Até"
                            style={{
                                padding: '6px 8px', fontSize: 12.5,
                                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                borderRadius: 8, color: 'var(--text-primary)',
                            }}
                        />
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => loadEvents(0)}
                            disabled={eventsLoading}
                        >
                            {eventsLoading ? 'Filtrando…' : 'Aplicar'}
                        </button>
                        {(eventSearch || eventStatusFilter || eventFrom || eventTo) && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                    setEventSearch(''); setEventStatusFilter(''); setEventFrom(''); setEventTo('');
                                    setTimeout(() => loadEvents(0), 0);
                                }}
                            >
                                Limpar
                            </button>
                        )}
                    </div>

                    {events.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                            {eventsTotal === 0 && !(eventSearch || eventStatusFilter || eventFrom || eventTo)
                                ? 'Nenhum evento ainda'
                                : 'Nenhum evento corresponde aos filtros'}
                        </div>
                    ) : (
                        <>
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
                                        {events.map(e => (
                                            <tr key={e.id} onClick={() => setInspectEventId(e.id)} style={{ cursor: 'pointer' }}>
                                                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                                    {e.event_name}
                                                    {e.value != null && (
                                                        <span className="num" style={{ fontSize: 11, color: 'var(--accent-green)', marginLeft: 6 }}>
                                                            +{e.currency || 'R$'} {Number(e.value).toFixed(2)}
                                                        </span>
                                                    )}
                                                    {Number(e.retry_count) > 0 && (
                                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                                                            (r{e.retry_count})
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

                            {/* Paginação */}
                            {eventsTotal > EVENTS_PER_PAGE && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        {eventsOffset + 1}–{Math.min(eventsOffset + events.length, eventsTotal)} de {eventsTotal.toLocaleString('pt-BR')}
                                    </span>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => loadEvents(Math.max(0, eventsOffset - EVENTS_PER_PAGE))}
                                            disabled={eventsLoading || eventsOffset === 0}
                                        >
                                            ‹ Anterior
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => loadEvents(eventsOffset + EVENTS_PER_PAGE)}
                                            disabled={eventsLoading || eventsOffset + EVENTS_PER_PAGE >= eventsTotal}
                                        >
                                            Próxima ›
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
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

                </div>
                )}
                {/* ───────── end tab content ───────── */}

                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">Fechar</button>
                </div>
            </div>

            {testDetail && (
                <TestResultModal
                    detail={testDetail}
                    pixelId={source.pixel_id}
                    onClose={() => setTestDetail(null)}
                />
            )}

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
    const [retrying, setRetrying] = useState(false);
    const [retryMsg, setRetryMsg] = useState('');

    const reload = useCallback(() => {
        setLoading(true); setError('');
        api.getTrackingEvent(eventId)
            .then((d) => setData(d))
            .catch((e: any) => setError(e.message || 'Falha ao carregar'))
            .finally(() => setLoading(false));
    }, [eventId]);

    useEffect(() => {
        reload();
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => { window.removeEventListener('keydown', handler); };
    }, [reload, onClose]);

    async function retry() {
        setRetrying(true); setRetryMsg('');
        try {
            const r = await api.retryTrackingEvent(eventId);
            setRetryMsg(r.ok ? `Reenviado · tentativa ${r.retry_count}` : `Falhou novamente: ${r.error || 'erro Meta'}`);
            setTimeout(reload, 800);
        } catch (e: any) {
            setRetryMsg('Erro: ' + (e.message || 'falha'));
        } finally { setRetrying(false); }
    }

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
                        {/* Veredicto Meta — parsa o response e diz na cara o que aconteceu */}
                        <MetaVerdict data={data} />

                        {/* Status bar */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                            <MiniKpi label="Status" value={data.meta_status || '—'}
                                color={
                                    data.meta_status === 'sent' ? 'var(--accent-green)' :
                                    data.meta_status === 'test_only' ? 'var(--accent-yellow)' :
                                    'var(--accent-red)'
                                } />
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

                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {data.meta_status === 'failed' && (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={retry}
                                        disabled={retrying || (Number(data.retry_count) >= 3)}
                                        title={Number(data.retry_count) >= 3 ? 'Limite de 3 tentativas atingido' : 'Reenviar pra Meta'}
                                    >
                                        <RefreshCw size={13} style={retrying ? { animation: 'spin 1s linear infinite' } : undefined} />
                                        {retrying ? 'Reenviando…' : 'Retentar envio'}
                                    </button>
                                )}
                                {retryMsg && (
                                    <span style={{
                                        fontSize: 12,
                                        color: retryMsg.startsWith('Reenviado') ? 'var(--accent-green)' : 'var(--accent-red)',
                                    }}>
                                        {retryMsg}
                                    </span>
                                )}
                                {Number(data.retry_count) > 0 && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {data.retry_count} tentativa{Number(data.retry_count) !== 1 ? 's' : ''} prévia{Number(data.retry_count) !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">Fechar</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Meta Verdict — destrincha o response do Meta CAPI ─────────────────────
// Lê meta_response.events_received, messages, e meta_request.body.test_event_code
// pra dar um veredicto claro: chegou? ficou só em teste? rejeitado?
function MetaVerdict({ data }: { data: any }) {
    const response = data?.meta_response;
    const request = data?.meta_request;

    // Parse response (pode vir como objeto JSONB ou string)
    let parsedResponse: any = response;
    if (typeof response === 'string') {
        try { parsedResponse = JSON.parse(response); } catch { parsedResponse = null; }
    }

    const eventsReceived = parsedResponse?.events_received;
    const messages: string[] = Array.isArray(parsedResponse?.messages)
        ? parsedResponse.messages.map(String)
        : [];
    const testEventCode = request?.body?.test_event_code;
    const pixelIdFromUrl = (() => {
        const url: string = request?.url || '';
        const m = url.match(/\/(\d{8,20})\/events/);
        return m ? m[1] : null;
    })();

    // Decide o veredicto
    type Severity = 'success' | 'warn' | 'error' | 'unknown';
    let severity: Severity;
    let title: string;
    let detail: React.ReactNode;
    let action: React.ReactNode = null;

    // Detecta erros do nosso PRE-CHECK (antes do HTTP) — credencial faltando, fonte off, etc.
    // Nesses casos a Meta nunca foi chamada, e o "Payload enviado" embaixo é uma
    // RECONSTRUÇÃO baseada na config atual, não o que efetivamente saiu.
    const isPreCheckError = !!data.meta_error && !parsedResponse && (
        /Access Token|Pixel ID|Fonte desativada|Credenciais Meta/i.test(data.meta_error)
    );

    if (isPreCheckError) {
        severity = 'error';
        title = 'A Meta NÃO foi chamada — credencial faltando';
        detail = (
            <>
                <strong>Motivo:</strong> <span className="mono">{data.meta_error}</span>
                <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
                    O bloco "Payload enviado pra Meta CAPI" abaixo é uma <em>simulação</em> usando a config atual —
                    a chamada HTTP nunca aconteceu.
                </div>
            </>
        );
    } else if (data.meta_error && eventsReceived === undefined) {
        // Falhou no HTTP
        severity = 'error';
        title = 'Não foi entregue à Meta';
        detail = (
            <>
                <strong>Erro:</strong> <span className="mono">{data.meta_error}</span>
                {data.meta_fbtrace_id && (
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                        fbtrace_id: <span className="mono">{data.meta_fbtrace_id}</span>
                    </div>
                )}
            </>
        );
    } else if (testEventCode) {
        // Test event — não conta em produção
        severity = 'warn';
        title = 'Evento de teste — não conta em produção';
        detail = (
            <>
                A request tem <span className="mono">test_event_code="{testEventCode}"</span>.
                A Meta arquivou esse evento na aba <strong>"Eventos de Teste"</strong> do Events Manager —
                ele <strong>NÃO</strong> aparece em "Visão geral", não otimiza campanha, não atribui conversão.
            </>
        );
        action = (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                ↳ Remova o <span className="mono">test_event_code</span> em <strong>Editar credenciais</strong> pra parar.
            </span>
        );
    } else if (eventsReceived === 0) {
        // Meta aceitou JSON mas rejeitou evento
        severity = 'error';
        title = 'Meta recebeu o request mas REJEITOU o evento';
        detail = (
            <>
                <span className="mono">events_received: 0</span> — o JSON foi válido mas a Meta não creditou.
                Causas típicas: action_source não permitido, PII insuficiente, pixel inativo/excluído,
                ou access_token sem permissão neste pixel.
            </>
        );
    } else if (eventsReceived >= 1) {
        // Sucesso!
        severity = 'success';
        title = `Meta confirmou recebimento (events_received: ${eventsReceived})`;
        detail = (
            <>
                Evento creditado no pixel <span className="mono">{pixelIdFromUrl || '—'}</span>.
                Deve aparecer no Events Manager na aba <strong>Visão geral</strong> em até alguns minutos.
                {data.emq_score < 5 && (
                    <div style={{ marginTop: 6, color: 'var(--accent-yellow)' }}>
                        ⚠ EMQ baixo ({data.emq_score}) — atribuição pode ficar limitada. Envie email + telefone + nome
                        no <span className="mono">user_data</span> pra melhorar.
                    </div>
                )}
            </>
        );
    } else if (data.meta_status === 'sent' && eventsReceived === undefined) {
        // Status sent mas sem response parseável — código antigo
        severity = 'unknown';
        title = 'Resposta da Meta não capturada';
        detail = (
            <>
                Esse evento foi marcado <strong>sent</strong> pelo código antigo que não checava
                <span className="mono"> events_received</span>. Não dá pra saber retroativamente se chegou. Clique em
                <strong> Retentar envio</strong> abaixo pra reenviar com o code novo e ver a resposta real.
            </>
        );
    } else {
        severity = 'unknown';
        title = 'Sem dados suficientes pra diagnosticar';
        detail = 'O response da Meta não foi armazenado.';
    }

    const colors: Record<Severity, { bg: string; border: string; text: string; icon: string }> = {
        success: { bg: 'rgba(16,185,129,.08)',  border: 'rgba(16,185,129,.3)',  text: 'var(--accent-green)',  icon: '✓' },
        warn:    { bg: 'rgba(245,158,11,.08)',  border: 'rgba(245,158,11,.3)',  text: 'var(--accent-yellow)', icon: '⚠' },
        error:   { bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.3)',   text: 'var(--accent-red)',    icon: '✕' },
        unknown: { bg: 'rgba(148,163,184,.08)', border: 'rgba(148,163,184,.3)', text: 'var(--text-muted)',    icon: '?' },
    };
    const c = colors[severity];

    return (
        <div style={{
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            marginBottom: 18,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: '50%',
                    background: c.text, color: '#fff', fontSize: 13, fontWeight: 700,
                    flexShrink: 0,
                }}>
                    {c.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: c.text, marginBottom: 4 }}>
                        {title}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {detail}
                    </div>
                    {messages.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
                                Mensagens da Meta
                            </div>
                            {messages.map((m, i) => (
                                <div key={i} className="mono" style={{
                                    fontSize: 11.5, padding: '6px 8px', marginBottom: 4,
                                    background: 'var(--bg-surface-2)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-secondary)',
                                }}>
                                    {m}
                                </div>
                            ))}
                        </div>
                    )}
                    {action && <div style={{ marginTop: 8 }}>{action}</div>}
                </div>
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

// ─── Test Result Modal — mostra o que a Meta respondeu ─────────────────

function TestResultModal({ detail, pixelId, onClose }: {
    detail: any;
    pixelId: string | null;
    onClose: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    const isError = detail?.error;
    const sent = detail?.meta_status === 'sent';
    const status = detail?.meta_status || (isError ? 'failed' : '—');
    const eventsReceived = detail?.meta_response?.events_received;
    const fbtrace = detail?.meta_response?.fbtrace_id || detail?.meta_fbtrace_id;
    const emq = Number(detail?.emq_score || 0);

    const verdict = isError
        ? { icon: '✕', color: 'var(--accent-red)', bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.28)', title: 'Erro de rede/backend', detail: detail.error }
        : sent && eventsReceived >= 1
            ? { icon: '✓', color: 'var(--accent-green)', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.28)', title: `Meta confirmou (events_received: ${eventsReceived})`, detail: 'Evento chegou. Aparece no Events Manager em alguns minutos.' }
        : sent
            ? { icon: '⚠', color: 'var(--accent-yellow)', bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.28)', title: 'Enviado, mas sem confirmação clara', detail: 'HTTP 200 mas events_received não veio. Pode ser test_event_code ativo.' }
        : { icon: '✕', color: 'var(--accent-red)', bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.28)', title: 'Meta rejeitou', detail: detail?.meta_error || 'Sem detalhe da rejeição.' };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="modal-box" style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ minWidth: 0 }}>
                        <div className="modal-title">Resultado do teste</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {detail?.event_id ? <>event_id: <span className="mono">{detail.event_id.slice(0, 20)}…</span></> : 'Sem event_id'}
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose} type="button"><X size={16} /></button>
                </div>

                {/* Verdict */}
                <div style={{
                    padding: '14px 16px', marginBottom: 16,
                    background: verdict.bg, border: `1px solid ${verdict.border}`, borderRadius: 12,
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: verdict.color, color: '#fff',
                        display: 'grid', placeItems: 'center',
                        fontWeight: 700, fontSize: 13, flexShrink: 0,
                    }}>{verdict.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: verdict.color, marginBottom: 3 }}>
                            {verdict.title}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                            {verdict.detail}
                        </div>
                    </div>
                </div>

                {/* Facts grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                    <TestFact label="Status" value={status} color={sent ? 'var(--accent-green)' : 'var(--accent-red)'} />
                    <TestFact label="EMQ" value={emq > 0 ? String(emq) : '—'}
                        color={emq >= 7 ? 'var(--accent-green)' : emq >= 4 ? 'var(--accent-yellow)' : 'var(--accent-red)'} />
                    <TestFact label="events_received" value={eventsReceived !== undefined ? String(eventsReceived) : '—'} />
                </div>

                {/* fbtrace_id */}
                {fbtrace && (
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
                            fbtrace_id
                        </div>
                        <div className="mono" style={{
                            padding: '6px 10px', background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border)', borderRadius: 6,
                            fontSize: 11.5, color: 'var(--text-secondary)', wordBreak: 'break-all',
                        }}>{fbtrace}</div>
                    </div>
                )}

                {/* Link Events Manager */}
                {pixelId && (
                    <a
                        href={`https://business.facebook.com/events_manager2/list/pixel/${pixelId}/overview`}
                        target="_blank" rel="noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8,
                            background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                            color: 'var(--text)', fontSize: 13, fontWeight: 500,
                            textDecoration: 'none',
                        }}>
                        <Globe size={13} /> Abrir Events Manager
                    </a>
                )}

                {/* Raw response accordion */}
                {(detail?.meta_response || detail?.error) && (
                    <div style={{ marginTop: 16 }}>
                        <details style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <summary style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}>
                                Ver resposta bruta da Meta
                            </summary>
                            <pre className="mono" style={{
                                margin: 0, padding: 12,
                                fontSize: 11, color: 'var(--text-secondary)',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                borderTop: '1px solid var(--border)',
                            }}>{JSON.stringify(detail?.meta_response || { error: detail.error }, null, 2)}</pre>
                        </details>
                    </div>
                )}
            </div>
        </div>
    );
}

function TestFact({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{
            padding: '10px 12px',
            background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: color || 'var(--text)', marginTop: 3 }}>{value}</div>
        </div>
    );
}

// ─── Accordion — collapsível reutilizável ───────────────────────────────

function Accordion({ title, subtitle, defaultOpen = false, children, tone = 'default' }: {
    title: string;
    subtitle?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    tone?: 'default' | 'primary';
}) {
    const [open, setOpen] = useState(defaultOpen);
    const borderColor = tone === 'primary' ? 'rgba(211,241,0,.25)' : 'var(--border)';
    return (
        <div style={{
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            background: 'var(--bg-surface-2)',
            overflow: 'hidden',
            marginBottom: 12,
        }}>
            <button type="button" onClick={() => setOpen(v => !v)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textAlign: 'left', color: 'inherit',
                }}>
                <ChevronDown size={14} color="var(--text-muted)" style={{
                    transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                    transition: 'transform .18s ease',
                    flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
                    {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>}
                </div>
            </button>
            {open && (
                <div style={{ padding: '4px 14px 14px', borderTop: '1px solid var(--border)' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Status Strip — pills compactas no header do drawer ─────────────────

function StatusStrip({ source, stats }: { source: any; stats: any }) {
    const events24h = Number(stats?.totals?.total || 0);
    const failed24h = Number(stats?.totals?.failed || 0);
    const emq = Number(stats?.totals?.avg_emq || 0);
    const testMode = !!source?.test_event_code;

    // Estado de credenciais Meta: derivado do fato de ter events sent
    const metaOk = Number(stats?.totals?.sent || 0) > 0 && !!source?.pixel_id;

    // Estado CRM
    const crmOn = !!source?.crm_type;

    return (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {/* Meta CAPI */}
            <StatusPill
                icon={<Zap size={10} />}
                label="Meta CAPI"
                state={metaOk ? 'ok' : source?.pixel_id ? 'warn' : 'off'}
                detail={
                    metaOk ? 'enviando'
                    : source?.pixel_id ? 'sem confirmação'
                    : 'sem pixel ID'
                }
            />
            {/* Test mode alerta amarelo */}
            {testMode && (
                <StatusPill
                    icon={<CircleAlert size={10} />}
                    label="Test mode"
                    state="warn"
                    detail="eventos só em Test Events"
                />
            )}
            {/* CRM */}
            <StatusPill
                icon={<ShieldCheck size={10} />}
                label={crmOn ? `CRM ${source.crm_type}` : 'Sem CRM'}
                state={crmOn ? 'ok' : 'off'}
                detail={crmOn ? source.crm_subdomain : ''}
            />
            {/* Volume 24h */}
            <StatusPill
                icon={<Activity size={10} />}
                label={`${events24h.toLocaleString('pt-BR')} evento${events24h === 1 ? '' : 's'} 24h`}
                state={events24h > 0 ? 'ok' : 'off'}
            />
            {/* Failed */}
            {failed24h > 0 && (
                <StatusPill
                    icon={<X size={10} />}
                    label={`${failed24h} falha${failed24h === 1 ? '' : 's'}`}
                    state="error"
                />
            )}
            {/* EMQ */}
            {events24h > 0 && emq > 0 && (
                <StatusPill
                    icon={<Sparkles size={10} />}
                    label={`EMQ ${emq.toFixed(1)}`}
                    state={emq >= 7 ? 'ok' : emq >= 4 ? 'warn' : 'error'}
                />
            )}
        </div>
    );
}

function StatusPill({ icon, label, state, detail }: {
    icon: React.ReactNode;
    label: string;
    state: 'ok' | 'warn' | 'error' | 'off';
    detail?: string;
}) {
    const cfg = state === 'ok'    ? { color: 'var(--accent-green)',  bg: 'rgba(16,185,129,.10)', border: 'rgba(16,185,129,.28)' }
              : state === 'warn'  ? { color: 'var(--accent-yellow)', bg: 'rgba(245,158,11,.10)', border: 'rgba(245,158,11,.28)' }
              : state === 'error' ? { color: 'var(--accent-red)',    bg: 'rgba(239,68,68,.10)',  border: 'rgba(239,68,68,.28)' }
              :                     { color: 'var(--text-muted)',    bg: 'var(--bg-surface-2)',  border: 'var(--border)' };

    return (
        <span title={detail || undefined} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10.5, fontWeight: 600,
            padding: '2px 7px', borderRadius: 999,
            color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
            whiteSpace: 'nowrap',
        }}>
            {icon} {label}
        </span>
    );
}

// ─── Setup Checklist — visão de "o que falta configurar" ─────────────────

type SetupStatus = 'done' | 'warn' | 'pending';

interface SetupItem {
    key: string;
    label: string;
    detail: string;
    status: SetupStatus;
    actionLabel?: string;
    onAction?: () => void;
}

function SetupChecklist({
    source, stats, onGoTo, onOpenEdit, onRunTest, testing, testResult,
}: {
    source: any;
    stats: any;
    onGoTo: (tab: ModalTabKey) => void;
    onOpenEdit: () => void;
    onRunTest: () => void;
    testing: boolean;
    testResult: string;
}) {
    const events24h = Number(stats?.totals?.total || 0);
    const failed24h = Number(stats?.totals?.failed || 0);
    const emq7d = Number(stats?.totals?.avg_emq || 0);
    const hasWebEvents = Boolean(stats?.by_event?.some((e: any) => ['PageView', 'ViewContent', 'Scroll50', 'Scroll90'].includes(e.event_name)));
    const hasCrmEvents = Boolean(stats?.by_event?.some((e: any) => ['Lead', 'Contact', 'Purchase', 'Schedule'].includes(e.event_name)));

    const items: SetupItem[] = [
        {
            key: 'pixel_id',
            label: 'Pixel ID configurado',
            detail: source.pixel_id ? `Pixel ${source.pixel_id}` : 'Sem Pixel ID — não consegue mandar evento pra Meta',
            status: source.pixel_id ? 'done' : 'pending',
            actionLabel: source.pixel_id ? undefined : 'Editar credenciais',
            onAction: source.pixel_id ? undefined : onOpenEdit,
        },
        {
            key: 'access_token',
            label: 'Token CAPI da Meta',
            detail: source.access_token || source.pixel_id
                ? 'Token salvo — usado pra postar em graph.facebook.com'
                : 'Falta o Access Token do pixel (Conversions API)',
            // Se pixel_id existe mas access_token não veio no GET (por segurança),
            // presume que tá ok. O melhor sinal é ter eventos com meta_status=sent.
            status: (stats?.totals?.sent && Number(stats.totals.sent) > 0) ? 'done'
                  : (source.pixel_id ? 'warn' : 'pending'),
            actionLabel: 'Editar credenciais',
            onAction: onOpenEdit,
        },
        {
            key: 'test_mode',
            label: 'Modo produção (não-teste)',
            detail: source.test_event_code
                ? `test_event_code="${source.test_event_code}" — eventos SÓ na aba Test Events da Meta`
                : 'Sem test_event_code — eventos contam em produção',
            status: source.test_event_code ? 'warn' : 'done',
            actionLabel: source.test_event_code ? 'Remover test code' : undefined,
            onAction: source.test_event_code ? onOpenEdit : undefined,
        },
        {
            key: 'pixel_events',
            label: 'Pixel instalado no site',
            detail: hasWebEvents
                ? `${events24h.toLocaleString('pt-BR')} evento(s) nas últimas 24h`
                : 'Nenhum evento browser (PageView/ViewContent) nas últimas 24h — confira o <script> no site',
            status: hasWebEvents ? 'done' : 'warn',
            actionLabel: hasWebEvents ? undefined : 'Ver código do pixel',
            onAction: hasWebEvents ? undefined : () => onGoTo('install'),
        },
        {
            key: 'crm',
            label: 'CRM Kommo conectado',
            detail: source.crm_type
                ? `${source.crm_type} · ${source.crm_subdomain || '—'}${hasCrmEvents ? ' · disparando eventos' : ' · sem eventos ainda'}`
                : 'Sem CRM — eventos server-side (Lead/Purchase) só via Salesbot manual',
            status: source.crm_type && hasCrmEvents ? 'done'
                  : source.crm_type ? 'warn'
                  : 'pending',
            actionLabel: source.crm_type ? undefined : 'Conectar CRM',
            onAction: source.crm_type ? undefined : onOpenEdit,
        },
        {
            key: 'backfill',
            label: 'Backfill executado',
            detail: source.last_backfill_at
                ? `Última execução: ${fmtRelative(source.last_backfill_at)}`
                : source.crm_type
                    ? 'Nunca rodou — importa histórico do CRM (Purchase + Lead retroativo)'
                    : 'Conecte um CRM primeiro pra habilitar',
            status: source.last_backfill_at ? 'done' : source.crm_type ? 'warn' : 'pending',
            actionLabel: source.crm_type ? 'Rodar backfill' : undefined,
            onAction: source.crm_type ? () => onGoTo('crm') : undefined,
        },
        {
            key: 'quality',
            label: 'Qualidade dos eventos (EMQ)',
            detail: events24h === 0 ? 'Sem eventos ainda pra medir'
                  : emq7d >= 7 ? `EMQ médio ${emq7d.toFixed(1)}/10 — atribuição forte`
                  : emq7d >= 4 ? `EMQ médio ${emq7d.toFixed(1)}/10 — PII incompleta, atribuição parcial`
                  : `EMQ médio ${emq7d.toFixed(1)}/10 — quase sem PII, quase não atribui`,
            status: events24h === 0 ? 'pending' : emq7d >= 7 ? 'done' : emq7d >= 4 ? 'warn' : 'warn',
        },
    ];

    // Failed events como alerta separado
    const doneCount = items.filter(i => i.status === 'done').length;
    const totalCount = items.length;
    const progressPct = Math.round((doneCount / totalCount) * 100);
    const progressColor = progressPct >= 80 ? 'var(--accent-green)' : progressPct >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header com progress */}
            <div style={{
                padding: '18px 20px',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                    <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                            {doneCount === totalCount ? 'Setup completo ✓' : `${doneCount} de ${totalCount} passos concluídos`}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {doneCount === totalCount
                                ? 'Tudo pronto — os eventos estão fluindo pra Meta.'
                                : 'Complete os passos abaixo pra o tracking funcionar 100%.'}
                        </div>
                    </div>
                    <button type="button" onClick={onRunTest} disabled={testing}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8,
                            background: 'var(--primary)', color: '#fff',
                            border: 'none', fontSize: 12.5, fontWeight: 600,
                            cursor: testing ? 'not-allowed' : 'pointer',
                            opacity: testing ? 0.7 : 1,
                            whiteSpace: 'nowrap',
                        }}>
                        <Sparkles size={12} /> {testing ? 'Testando…' : 'Disparar teste'}
                    </button>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: 'var(--bg-input)', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: `${progressPct}%`,
                        background: progressColor, transition: 'width 300ms ease',
                    }} />
                </div>
                {testResult && (
                    <div style={{
                        marginTop: 10, fontSize: 12,
                        color: testResult.startsWith('OK') ? 'var(--accent-green)' : 'var(--accent-red)',
                    }}>{testResult}</div>
                )}
            </div>

            {/* Alertas críticos (erros recentes) */}
            {failed24h > 0 && (
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(239,68,68,.08)',
                    border: '1px solid rgba(239,68,68,.25)',
                    borderRadius: 10,
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                    <CircleAlert size={16} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-red)' }}>
                            {failed24h} evento{failed24h !== 1 ? 's' : ''} falharam nas últimas 24h
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            Veja a razão no tab Eventos e retente. Podem ser credencial errada, PII inválida ou pixel excluído.
                        </div>
                    </div>
                    <button type="button" onClick={() => onGoTo('events')}
                        style={{
                            padding: '6px 12px', borderRadius: 6,
                            background: 'transparent', border: '1px solid var(--accent-red)',
                            color: 'var(--accent-red)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            whiteSpace: 'nowrap',
                        }}>
                        Ver falhas
                    </button>
                </div>
            )}

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(item => (
                    <SetupRow key={item.key} item={item} />
                ))}
            </div>
        </div>
    );
}

function SetupRow({ item }: { item: SetupItem }) {
    const cfg = item.status === 'done'
        ? { color: 'var(--accent-green)', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.22)', icon: <Check size={13} /> }
        : item.status === 'warn'
        ? { color: 'var(--accent-yellow)', bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.22)', icon: <CircleAlert size={13} /> }
        : { color: 'var(--text-muted)', bg: 'var(--bg-surface-2)', border: 'var(--border)', icon: <Clock size={13} /> };

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 12,
            padding: '12px 14px',
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            borderRadius: 10,
            alignItems: 'center',
        }}>
            <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: cfg.color, color: '#fff',
                display: 'grid', placeItems: 'center',
                flexShrink: 0,
            }}>
                {cfg.icon}
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.detail}</div>
            </div>
            {item.actionLabel && item.onAction && (
                <button type="button" onClick={item.onAction}
                    style={{
                        padding: '6px 12px', borderRadius: 6,
                        background: 'transparent', border: `1px solid ${cfg.color}`,
                        color: cfg.color, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}>
                    {item.actionLabel}
                </button>
            )}
        </div>
    );
}

// ─── Modal tabs ────────────────────────────────────────────────────────────

const TAB_DEFS = [
    { key: 'setup',    label: 'Setup' },
    { key: 'overview', label: 'Visão geral' },
    { key: 'events',   label: 'Eventos' },
    { key: 'install',  label: 'Instalação' },
    { key: 'crm',      label: 'CRM' },
] as const;

type ModalTabKey = 'setup' | 'overview' | 'events' | 'install' | 'crm';

function ModalTabs({
    active,
    onChange,
    badges,
}: {
    active: ModalTabKey;
    onChange: (k: ModalTabKey) => void;
    badges?: { setup?: number; events?: number; crm?: string };
}) {
    return (
        <div
            role="tablist"
            style={{
                display: 'flex',
                gap: 2,
                marginBottom: 24,
                borderBottom: '1px solid var(--border)',
                overflowX: 'auto',
            }}
        >
            {TAB_DEFS.map(tab => {
                const isActive = active === tab.key;
                const badge = tab.key === 'setup' ? badges?.setup
                            : tab.key === 'events' ? badges?.events
                            : tab.key === 'crm' ? badges?.crm
                            : undefined;
                return (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={isActive}
                        type="button"
                        onClick={() => onChange(tab.key)}
                        style={{
                            position: 'relative',
                            padding: '11px 18px',
                            fontSize: 13.5,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            marginBottom: -1,
                            borderBottom: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                            transition: 'color 150ms ease, border-color 150ms ease',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        {tab.label}
                        {badge !== undefined && (
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 18,
                                height: 18,
                                padding: '0 6px',
                                fontSize: 10.5,
                                fontWeight: 700,
                                borderRadius: 999,
                                background: typeof badge === 'number'
                                    ? 'rgba(239,68,68,.16)'
                                    : 'rgba(16,185,129,.16)',
                                color: typeof badge === 'number'
                                    ? 'var(--accent-red)'
                                    : 'var(--accent-green)',
                            }}>
                                {typeof badge === 'number' ? (badge > 99 ? '99+' : badge) : badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

function HealthBanner({ health }: { health: any }) {
    if (!health?.status) return null;
    const visual = STATUS_VISUAL[health.status.state] || STATUS_VISUAL.idle;
    const severity = health.status.severity as 'ok' | 'info' | 'warn' | 'error';

    const sig = health.signals || {};
    const lastEvent = sig.last_event_at ? fmtRelative(sig.last_event_at) : '—';
    const lastPixel = sig.last_pixel_event_at ? fmtRelative(sig.last_pixel_event_at) : 'nunca';

    return (
        <div style={{
            marginBottom: 18,
            background: visual.bg,
            border: `1px solid ${visual.color}33`,
            borderRadius: 'var(--radius-md)',
            padding: 14,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: visual.color,
                    boxShadow: severity === 'ok' ? `0 0 0 4px ${visual.color}22` : 'none',
                }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: visual.color }}>{visual.label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>· {health.status.detail}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                    Último evento: <strong style={{ color: 'var(--text-primary)' }}>{lastEvent}</strong>
                    {' · '}Pixel browser: <strong style={{ color: 'var(--text-primary)' }}>{lastPixel}</strong>
                </span>
            </div>

            {/* Checklist */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                {(health.checklist || []).map((c: any) => (
                    <div key={c.key} title={c.hint} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '8px 10px',
                        background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                    }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                            background: c.ok ? 'var(--accent-green)' : 'rgba(245,158,11,.18)',
                            color: c.ok ? '#fff' : 'var(--accent-yellow)',
                            marginTop: 1,
                        }}>
                            {c.ok ? <Check size={11} strokeWidth={3} /> : <CircleAlert size={12} />}
                        </span>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>{c.label}</div>
                            {c.hint && !c.ok && (
                                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{c.hint}</div>
                            )}
                        </div>
                    </div>
                ))}
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
    const [crmSchema, setCrmSchema] = useState<Record<string, any> | null>(null);
    const [loadingSchema, setLoadingSchema] = useState(mode === 'create');

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // Carregar schema de CRM no modo 'create'
    useEffect(() => {
        if (mode !== 'create') return;
        const loadSchema = async () => {
            try {
                const res = await fetch(`${API_BASE}/tracking/crm-schema`);
                if (res.ok) {
                    const data = await res.json();
                    setCrmSchema(data.data || {});
                }
            } catch {
                // Se falhar, continua sem schema (fallback)
            } finally {
                setLoadingSchema(false);
            }
        };
        loadSchema();
    }, [mode]);

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

                {/* ── Seção de CRM no modo CREATE ────────────────────── */}
                {mode === 'create' && (
                    <>
                        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 14px' }} />
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 12 }}>
                            Configurar CRM <span style={{ color: 'var(--accent-green)' }}>· opcional mas recomendado</span>
                        </div>

                        {loadingSchema ? (
                            <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 13 }}>Carregando CRMs disponíveis…</div>
                        ) : (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Qual CRM você usa?</label>
                                    <select
                                        className="form-select"
                                        value={form.crm_type}
                                        onChange={e => upd('crm_type', e.target.value)}
                                    >
                                        <option value="">— Pular (configurar depois) —</option>
                                        {crmSchema && Object.entries(crmSchema).map(([key, crm]: [string, any]) => (
                                            <option key={key} value={key}>
                                                {crm.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Campos dinâmicos conforme CRM selecionado */}
                                {form.crm_type && crmSchema && crmSchema[form.crm_type] && (
                                    <>
                                        {crmSchema[form.crm_type].description && (
                                            <div style={{
                                                marginBottom: 12,
                                                padding: '10px 12px',
                                                background: 'rgba(59,130,246,.08)',
                                                border: '1px solid rgba(59,130,246,.25)',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: 12.5,
                                                color: 'var(--text-primary)',
                                            }}>
                                                {crmSchema[form.crm_type].description}
                                            </div>
                                        )}
                                        {crmSchema[form.crm_type].fields.map((field: any) => (
                                            <div key={field.key} className="form-group">
                                                <label className="form-label">
                                                    {field.label}
                                                    {field.required && <span style={{ color: 'var(--accent-red)' }}> *</span>}
                                                </label>
                                                <input
                                                    type={field.type}
                                                    className="form-input"
                                                    value={form[field.key as keyof FormState] || ''}
                                                    onChange={e => upd(field.key as keyof FormState, e.target.value)}
                                                    placeholder={field.placeholder || ''}
                                                    autoComplete="off"
                                                    required={field.required && !!form.crm_type}
                                                />
                                                {field.help && (
                                                    <span className="form-hint">{field.help}</span>
                                                )}
                                            </div>
                                        ))}
                                        {crmSchema[form.crm_type].note && (
                                            <div style={{
                                                marginBottom: 12, marginTop: 8,
                                                padding: '10px 12px',
                                                background: 'rgba(245,158,11,.08)',
                                                border: '1px solid rgba(245,158,11,.25)',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: 12.5,
                                                color: 'var(--text-primary)',
                                            }}>
                                                <strong style={{ color: 'var(--accent-yellow)' }}>💡 Info:</strong> {crmSchema[form.crm_type].note}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 14px' }} />
                    </>
                )}

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
                    <label className="form-label">Pixel ID (Conjunto de Dados)</label>
                    <input
                        type="text" className="form-input"
                        value={form.pixel_id}
                        onChange={e => upd('pixel_id', e.target.value)}
                        placeholder="ex: 26710064741954259"
                    />
                    <span className="form-hint">
                        Events Manager &rsaquo; abre o pixel &rsaquo; copia o número embaixo do nome ("Identificação").
                    </span>
                </div>

                <div className="form-group">
                    <label className="form-label">Token de Acesso do Pixel <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Conversions API)</span></label>
                    <input
                        type="password" className="form-input"
                        value={form.access_token}
                        onChange={e => upd('access_token', e.target.value)}
                        placeholder={mode === 'edit' ? 'Deixe vazio pra manter o atual' : 'Cole o token gerado no pixel (começa com EAA...)'}
                        autoComplete="off"
                    />
                    <span className="form-hint">
                        <strong>Token DO PIXEL, não do app.</strong> Events Manager &rsaquo; abre o pixel &rsaquo; aba <strong>Configurações</strong> &rsaquo; rola até "Token de acesso da API de Conversões" &rsaquo; <strong>Gerar token de acesso</strong>. É permanente, não expira.
                    </span>
                </div>

                <div className="form-group" style={{ marginBottom: 24 }}>
                    <label className="form-label">Test Event Code <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional — só pra debug)</span></label>
                    <input
                        type="text" className="form-input"
                        value={form.test_event_code}
                        onChange={e => upd('test_event_code', e.target.value)}
                        placeholder="TESTxxxxx · DEIXE VAZIO em produção"
                    />
                    <span className="form-hint" style={{ color: 'var(--accent-yellow)' }}>
                        ⚠ Com isso preenchido, os eventos vão SÓ pra aba "Eventos de teste" da Meta — não contam em produção, não otimizam campanha.
                    </span>
                </div>

                {/* ── Integração CRM (opcional) ──────────────────────────── */}
                {mode === 'edit' && (
                    <>
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
                                Conexão com o CRM <span style={{ color: 'var(--accent-green)' }}>· recomendado</span>
                            </div>
                            <div style={{
                                marginTop: 8, marginBottom: 14,
                                padding: '10px 12px',
                                background: 'rgba(245,158,11,.08)',
                                border: '1px solid rgba(245,158,11,.25)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: 12.5,
                                color: 'var(--text-primary)',
                                lineHeight: 1.55,
                            }}>
                                <strong style={{ color: 'var(--accent-yellow)' }}>Importante:</strong> o webhook do Kommo (Salesbot) raramente envia
                                email/telefone do contato no payload. Sem essas credenciais, o backend não consegue
                                <strong> enriquecer o evento via API do Kommo</strong> e a Meta recebe os eventos com PII vazia (EMQ ~2,
                                atribuição ruim). Configure pra ter EMQ 7+ e otimização real de campanha.
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Tipo de CRM</label>
                            <select
                                className="form-select"
                                value={form.crm_type}
                                onChange={e => upd('crm_type', e.target.value)}
                            >
                                <option value="">— Nenhum (não recomendado) —</option>
                                <option value="kommo">Kommo</option>
                                <option value="datacrazy">DataCrazy</option>
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
                                    <span className="form-hint">
                                        A parte antes de <span className="mono">.kommo.com</span> na URL que você usa pra logar.
                                    </span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Token de Acesso do Kommo <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(API privada)</span></label>
                                    <input
                                        type="password" className="form-input"
                                        value={form.crm_access_token}
                                        onChange={e => upd('crm_access_token', e.target.value)}
                                        placeholder={source?.crm_access_token ? 'Deixe vazio pra manter o atual' : 'Token de integração privada do Kommo'}
                                        autoComplete="off"
                                    />
                                    <span className="form-hint">
                                        No Kommo: <strong>Configurações &rsaquo; Integrações &rsaquo; aba Integrações privadas &rsaquo; Criar integração</strong> &rsaquo;
                                        marca permissões <span className="mono">Leads</span> e <span className="mono">Contatos</span> (read), salva, copia o <strong>Access Token de longa duração</strong>.
                                    </span>
                                </div>
                            </>
                        )}

                        {form.crm_type === 'datacrazy' && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">API Key DataCrazy</label>
                                    <input
                                        type="password" className="form-input"
                                        value={form.crm_access_token}
                                        onChange={e => upd('crm_access_token', e.target.value)}
                                        placeholder={source?.crm_access_token ? 'Deixe vazio pra manter o atual' : 'Token gerado no DataCrazy'}
                                        autoComplete="off"
                                    />
                                    <span className="form-hint">
                                        No DataCrazy: abra <strong>https://crm.datacrazy.io → Settings → API → Generate Token</strong> &rsaquo; copia o token (só aparece uma vez!).
                                    </span>
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
