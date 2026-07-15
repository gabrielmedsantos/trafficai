'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
    Lock, Loader2, BarChart3, TrendingUp, TrendingDown, Minus,
    MessageSquare, Clock, Hourglass, AlertCircle, CheckSquare, Target, Users,
    Phone, Mail, Calendar, MessageCircle, RefreshCw, Check, X,
    AlertTriangle, ChevronDown, ChevronUp, ChevronRight,
} from 'lucide-react';
import {
    ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import overviewStyles from '../../comercial/comercial.module.css';
import styles from './public.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'this_month' | 'custom';
type TabKey = 'overview' | 'conversations' | 'leads' | 'tasks' | 'team';

interface HeroKpiCard {
    label: string; value: number; valueFormatted: string;
    delta: number; deltaPercent: number;
    sparkline: number[]; isPositiveTrend: boolean;
    icon: string; color: 'green' | 'purple' | 'red' | 'yellow' | 'blue';
    href?: string;
}
interface InsightCard {
    severity: 'critical' | 'warning' | 'info' | 'success';
    icon: string; title: string; description: string;
    metric?: string; href?: string;
}
interface FunnelStage {
    stageId: string; name: string; color: string; position: number;
    stageType: 'incoming' | 'normal' | 'won' | 'lost';
    totalLeads: number; totalValue: number;
    enteredInPeriod: number; enteredValueInPeriod: number;
    advancedInPeriod: number; advancedValueInPeriod: number;
    lostInPeriod: number; lostValueInPeriod: number;
    conversionToNext: number | null;
    avgDaysInStage: number;
}
interface Channel {
    sourceId: string | null; name: string; color: string;
    leads: number; won: number; lost: number; open: number;
    convRate: number; wonValue: number; avgTicket: number;
    quality: 'high' | 'medium' | 'low';
}
interface GoalForecast {
    monthStart: string; monthEnd: string;
    daysTotal: number; daysElapsed: number; daysRemaining: number;
    workspaceGoal: number; workspaceAchieved: number; workspaceAchievedPct: number;
    expectedAtThisPoint: number; expectedPct: number;
    dailyPace: number; projectedEnd: number; projectedEndPct: number;
    willHit: boolean; gapToGoal: number;
    requiredDailyPace: number; accelerationNeededPct: number;
    advice: string; status: 'success' | 'warning' | 'critical' | 'no_goal';
}
interface TimeSeriesPoint {
    date: string; leadsCreated: number; dealsWon: number; dealsWonValue: number; messagesReceived: number;
}
interface PublicData {
    name: string;
    period: string;
    pipelineId: string | null;
    heroKpis: HeroKpiCard[];
    insights: InsightCard[];
    funnel: FunnelStage[];
    channels: Channel[];
    forecast: GoalForecast | null;
    timeSeries: TimeSeriesPoint[];
    conversations: {
        messagesReceived: { total: number; byChannel: Array<{ channel: string; count: number }> };
        activeConversations: number; activeConversationsDelta: number;
        unansweredChats: number; unansweredChatsDelta: number;
        avgResponseTimeMinutes: number; longestWaitDays: number;
    };
    leads: { wonLeads: number; wonValue: number; wonDelta: number; activeLeads: number; activeValue: number; activeDelta: number };
    tasks: { pendingTasks: number; overdueTasks: number; tasksDelta: number };
}

interface Pipeline { id: string; name: string; is_main: boolean; stages: Array<{ id: string; name: string; color: string }> }
interface Salesperson { id: string; name: string; avatar_color?: string | null }

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number | string) => {
    const n = typeof v === 'string' ? Number(v) : v;
    return n >= 1_000_000 ? `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
        : n >= 1_000 ? `R$ ${(n / 1_000).toFixed(1).replace('.', ',')}k`
            : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};
const fmtNum = (v: number) => v.toLocaleString('pt-BR');
const fmtMinutes = (mins: number) => {
    if (mins < 1) return '< 1';
    if (mins < 60) return Math.round(mins).toString();
    return (mins / 60).toFixed(1).replace('.', ',') + 'h';
};

const TABS: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: 'overview', label: 'Visão geral', icon: BarChart3 },
    { key: 'conversations', label: 'Conversas', icon: MessageSquare },
    { key: 'leads', label: 'Leads', icon: Target },
    { key: 'tasks', label: 'Tarefas', icon: CheckSquare },
    { key: 'team', label: 'Time', icon: Users },
];

const PERIODS: Array<{ v: PeriodPreset; l: string }> = [
    { v: 'today', l: 'Hoje' },
    { v: '7d', l: '7 dias' },
    { v: '30d', l: '30 dias' },
    { v: '90d', l: '90 dias' },
    { v: 'this_month', l: 'Mês atual' },
    { v: 'custom', l: 'Personalizado' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthAgoISO = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PublicDashboardPage() {
    const params = useParams<{ token: string }>();
    const token = params?.token as string;

    const [linkInfo, setLinkInfo] = useState<{ name: string; requiresPassword: boolean } | null>(null);
    const [authed, setAuthed] = useState(false);
    const [savedPassword, setSavedPassword] = useState<string | null>(null);
    const [passwordInput, setPasswordInput] = useState('');

    const [tab, setTab] = useState<TabKey>('overview');
    const [period, setPeriod] = useState<PeriodPreset>('30d');
    const [customFrom, setCustomFrom] = useState<string>(monthAgoISO());
    const [customTo, setCustomTo] = useState<string>(todayISO());
    const [pipelineId, setPipelineId] = useState('');
    const [salespersonId, setSalespersonId] = useState('');

    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [salespeople, setSalespeople] = useState<Salesperson[]>([]);

    const [overview, setOverview] = useState<PublicData | null>(null);
    const [overviewLoading, setOverviewLoading] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [bootLoading, setBootLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // ── 1) Carrega info do link
    useEffect(() => {
        let cancelled = false;
        api.getPublicShareLink(token)
            .then(info => { if (!cancelled) setLinkInfo(info); })
            .catch(e => { if (!cancelled) setError(e.message); })
            .finally(() => { if (!cancelled) setBootLoading(false); });
        return () => { cancelled = true; };
    }, [token]);

    // ── 2) Auth helper: tenta fetch overview com a senha; se passar, marca authed
    const tryAuth = useCallback(async (pwd?: string) => {
        setSubmitting(true);
        setError(null);
        try {
            const d = await api.getPublicShareLinkData(token, {
                ...(pwd && { password: pwd }),
                period,
                ...(period === 'custom' && { dateRange: { from: customFrom, to: customTo } }),
            });
            setOverview(d);
            setSavedPassword(pwd ?? null);
            setAuthed(true);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    }, [token, period, customFrom, customTo]);

    // ── 3) Quando linkInfo carrega e não exige senha, busca overview direto
    useEffect(() => {
        if (linkInfo && !linkInfo.requiresPassword && !authed) {
            tryAuth();
        }
    }, [linkInfo, authed, tryAuth]);

    // ── 4) Já authed: carrega filtros (pipelines + vendedores) uma vez
    useEffect(() => {
        if (!authed) return;
        const pwd = { ...(savedPassword && { password: savedPassword }) };
        Promise.all([
            api.getPublicCommercialPipelines(token, pwd),
            api.getPublicCommercialSalespeople(token, pwd),
        ]).then(([p, s]) => {
            setPipelines(p);
            setSalespeople(s);
        }).catch(() => {});
    }, [authed, token, savedPassword]);

    // ── 5) Refetch overview quando filtros mudam
    useEffect(() => {
        if (!authed) return;
        if (tab !== 'overview' && tab !== 'team') return; // outras tabs gerenciam próprio fetch
        if (tab === 'overview') {
            if (period === 'custom' && (!customFrom || !customTo)) return;
            setOverviewLoading(true);
            api.getPublicShareLinkData(token, {
                ...(savedPassword && { password: savedPassword }),
                period,
                ...(period === 'custom' && { dateRange: { from: customFrom, to: customTo } }),
                ...(pipelineId && { pipelineId }),
                ...(salespersonId && { salespersonId }),
            })
                .then(setOverview)
                .catch(e => setError(e.message))
                .finally(() => setOverviewLoading(false));
        }
    }, [authed, tab, period, customFrom, customTo, pipelineId, salespersonId, token, savedPassword]);

    // ── Render

    if (bootLoading) {
        return <div className={styles.center}><Loader2 size={32} className={styles.spin} style={{ color: 'var(--accent-purple)' }} /></div>;
    }
    if (!linkInfo) {
        return (
            <div className={styles.center}>
                <div className={styles.errorBox}>
                    <h2>Link inválido</h2>
                    <p>{error || 'Este link não existe, foi revogado ou expirou.'}</p>
                </div>
            </div>
        );
    }
    if (linkInfo.requiresPassword && !authed) {
        return (
            <div className={styles.center}>
                <form onSubmit={e => { e.preventDefault(); tryAuth(passwordInput); }} className={styles.passwordCard}>
                    <div className={styles.passwordIcon}><Lock size={28} strokeWidth={1.5} /></div>
                    <h1>{linkInfo.name}</h1>
                    <p>Este dashboard é protegido por senha</p>
                    <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Digite a senha" autoFocus required />
                    {error && <div className={styles.errorMsg}>{error}</div>}
                    <button type="submit" disabled={submitting}>
                        {submitting ? <><Loader2 size={14} className={styles.spin} /> Verificando…</> : 'Acessar dashboard'}
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className={styles.publicWrap}>
            <header className={styles.publicHeader}>
                <div className={styles.publicTitle}>
                    <BarChart3 size={20} style={{ color: 'var(--accent-purple)' }} />
                    <span>{overview?.name ?? linkInfo.name}</span>
                </div>
                <div className={styles.publicFilters}>
                    {PERIODS.map(p => (
                        <button
                            key={p.v}
                            onClick={() => setPeriod(p.v)}
                            className={`${styles.publicChip} ${period === p.v ? styles.publicChipActive : ''}`}
                            type="button"
                        >
                            {p.l}
                        </button>
                    ))}
                    {period === 'custom' && (
                        <>
                            <input
                                type="date"
                                value={customFrom}
                                max={customTo}
                                onChange={e => setCustomFrom(e.target.value)}
                                className={styles.publicSelect}
                            />
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                            <input
                                type="date"
                                value={customTo}
                                min={customFrom}
                                max={todayISO()}
                                onChange={e => setCustomTo(e.target.value)}
                                className={styles.publicSelect}
                            />
                        </>
                    )}
                    {pipelines.length > 1 && (
                        <select className={styles.publicSelect} value={pipelineId} onChange={e => setPipelineId(e.target.value)}>
                            <option value="">Pipeline ativo</option>
                            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    )}
                    {salespeople.length > 0 && (
                        <select className={styles.publicSelect} value={salespersonId} onChange={e => setSalespersonId(e.target.value)}>
                            <option value="">Todos os vendedores</option>
                            {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    )}
                </div>
            </header>

            <nav className={styles.publicTabs}>
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`${styles.tabBtn} ${tab === t.key ? styles.tabBtnActive : ''}`}
                            type="button"
                        >
                            <Icon size={14} strokeWidth={2} />
                            {t.label}
                        </button>
                    );
                })}
            </nav>

            <main className={overviewStyles.page} style={{ paddingTop: 12 }}>
                {tab === 'overview' && (
                    overviewLoading && !overview ? (
                        <div className={styles.tabEmpty}>Carregando…</div>
                    ) : overview ? (
                        <>
                            <HeroRow kpis={overview.heroKpis} />
                            {overview.forecast && <MetaForecastSection forecast={overview.forecast} />}
                            <TimeSeriesSection data={overview.timeSeries} />
                            <InsightsRow insights={overview.insights} />
                            <FunnelVisualSection funnel={overview.funnel} />
                            <OperationSection data={overview} />
                            <ChannelsSection channels={overview.channels} />
                        </>
                    ) : null
                )}
                {tab === 'conversations' && (
                    <ConversationsTab
                        token={token}
                        password={savedPassword}
                        salespeople={salespeople}
                        salespersonId={salespersonId}
                        period={period}
                        customFrom={customFrom}
                        customTo={customTo}
                    />
                )}
                {tab === 'leads' && (
                    <LeadsTab
                        token={token}
                        password={savedPassword}
                        pipelines={pipelines}
                        salespeople={salespeople}
                        pipelineId={pipelineId}
                        salespersonId={salespersonId}
                        period={period}
                        customFrom={customFrom}
                        customTo={customTo}
                    />
                )}
                {tab === 'tasks' && (
                    <TasksTab
                        token={token}
                        password={savedPassword}
                        salespersonId={salespersonId}
                        period={period}
                        customFrom={customFrom}
                        customTo={customTo}
                    />
                )}
                {tab === 'team' && (
                    <TeamTab
                        token={token}
                        password={savedPassword}
                        period={period}
                        customFrom={customFrom}
                        customTo={customTo}
                    />
                )}
            </main>

            <footer className={styles.publicFooter}>
                Powered by <strong>TrafficAI</strong>
            </footer>
        </div>
    );
}

// ─── HERO ───────────────────────────────────────────────────────────────────

function HeroRow({ kpis }: { kpis: HeroKpiCard[] }) {
    if (!kpis || kpis.length === 0) return null;
    return <div className={overviewStyles.heroGrid}>{kpis.map((k, i) => <HeroKpi key={i} kpi={k} />)}</div>;
}

function HeroKpi({ kpi }: { kpi: HeroKpiCard }) {
    const isPositive = kpi.delta > 0 ? kpi.isPositiveTrend : kpi.delta < 0 ? !kpi.isPositiveTrend : null;
    const deltaClass = isPositive === true ? overviewStyles.up : isPositive === false ? overviewStyles.down : overviewStyles.flat;
    return (
        <div className={overviewStyles.heroCard}>
            <span className={overviewStyles.heroIcon}>{kpi.icon}</span>
            <div className={overviewStyles.heroLabel}>{kpi.label}</div>
            <div className={`${overviewStyles.heroValue} ${overviewStyles[kpi.color]}`}>{kpi.valueFormatted}</div>
            <div className={`${overviewStyles.heroDelta} ${deltaClass}`}>
                {kpi.deltaPercent > 0 && <TrendingUp size={11} />}
                {kpi.deltaPercent < 0 && <TrendingDown size={11} />}
                {kpi.deltaPercent === 0 && <Minus size={11} />}
                {kpi.deltaPercent > 0 ? '+' : ''}{kpi.deltaPercent.toFixed(1).replace('.', ',')}%
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>vs anterior</span>
            </div>
            <Sparkline data={kpi.sparkline} color={kpi.color} />
        </div>
    );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
    if (!data || data.length === 0) return <div className={overviewStyles.heroSparkline} />;
    const w = 200, h = 28;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = w / Math.max(data.length - 1, 1);
    const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
    const stroke = color === 'green' ? '#22c55e' : color === 'purple' ? '#8b5cf6' : color === 'red' ? '#ef4444' : color === 'yellow' ? '#f59e0b' : '#3b82f6';
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={overviewStyles.heroSparkline}>
            <defs><linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity="0.25" /><stop offset="100%" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
            <path d={`M ${points.split(' ').join(' L ')} L ${w},${h} L 0,${h} Z`} fill={`url(#grad-${color})`} />
            <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ─── META & FORECAST ───────────────────────────────────────────────────────

function MetaForecastSection({ forecast: f }: { forecast: GoalForecast }) {
    const statusBadge = { success: 'NO RITMO', warning: 'ATENÇÃO', critical: 'CRÍTICO', no_goal: 'SEM META' }[f.status];
    const adviceIcon = { success: '✅', warning: '⚠️', critical: '🚨', no_goal: 'ℹ️' }[f.status];
    const fillPct = Math.min(100, f.workspaceAchievedPct);
    const expectedMarker = Math.min(100, f.expectedPct);

    return (
        <div className={`${overviewStyles.metaSection} ${overviewStyles[f.status]}`}>
            <div className={overviewStyles.metaLayout}>
                <div className={overviewStyles.metaProgress}>
                    <div className={overviewStyles.metaTitle}>
                        Meta do mês corrente
                        <span className={`${overviewStyles.badge} ${overviewStyles[f.status]}`}>{statusBadge}</span>
                    </div>
                    <div className={overviewStyles.metaBigValue}>
                        <span className={`${overviewStyles.metaPct} ${overviewStyles[f.status]}`}>
                            {f.workspaceGoal > 0 ? `${f.workspaceAchievedPct.toFixed(1).replace('.', ',')}%` : '—'}
                        </span>
                        {f.workspaceGoal > 0 && (
                            <span className={overviewStyles.metaSubValue}>de {fmtBRL(f.workspaceGoal)}</span>
                        )}
                    </div>
                    <div className={overviewStyles.metaBarTrack}>
                        {f.workspaceGoal > 0 && (
                            <>
                                <div className={`${overviewStyles.metaBarFill} ${overviewStyles[f.status === 'no_goal' ? 'warning' : f.status]}`} style={{ width: `${fillPct}%` }} />
                                {f.status !== 'no_goal' && expectedMarker > 0 && expectedMarker < 100 && (
                                    <div className={overviewStyles.metaBarMarker} style={{ left: `${expectedMarker}%` }} />
                                )}
                            </>
                        )}
                    </div>
                    <div className={overviewStyles.metaBarLabels}>
                        <span>{fmtBRL(f.workspaceAchieved)} fechado</span>
                        <span>Dia {f.daysElapsed}/{f.daysTotal}</span>
                    </div>
                </div>
                <div className={overviewStyles.metaForecast}>
                    <div className={overviewStyles.metaForecastLabel}>Projeção fim do mês</div>
                    <div className={`${overviewStyles.metaForecastValue} ${overviewStyles[f.status === 'no_goal' ? 'warning' : f.status]}`}>
                        {f.workspaceGoal > 0 ? fmtBRL(f.projectedEnd) : '—'}
                    </div>
                    <div className={overviewStyles.metaForecastSub}>
                        {f.workspaceGoal > 0 ? (
                            <>{f.projectedEndPct.toFixed(0)}% da meta · ritmo {fmtBRL(f.dailyPace)}/dia<br />{f.daysRemaining > 0 ? `${f.daysRemaining} dias restantes` : 'mês encerrando'}</>
                        ) : 'Sem meta configurada'}
                    </div>
                </div>
                <div className={`${overviewStyles.metaAdvice} ${overviewStyles[f.status]}`}>
                    <span className={overviewStyles.metaAdviceIcon}>{adviceIcon}</span>
                    <span>{f.advice}</span>
                </div>
            </div>
        </div>
    );
}

// ─── TIME SERIES ────────────────────────────────────────────────────────────

function TimeSeriesSection({ data }: { data: TimeSeriesPoint[] }) {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 720);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    if (!data || data.length === 0) return null;
    const chartData = data.map(d => {
        const date = new Date(d.date);
        return {
            date: d.date,
            label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
            'Leads gerados': d.leadsCreated,
            'Vendas fechadas': d.dealsWon,
            'R$ Ganho': d.dealsWonValue,
            'Mensagens': d.messagesReceived,
        };
    });
    const totalLeads = data.reduce((s, d) => s + d.leadsCreated, 0);
    const totalWon = data.reduce((s, d) => s + d.dealsWon, 0);
    const totalWonValue = data.reduce((s, d) => s + d.dealsWonValue, 0);
    const totalMsgs = data.reduce((s, d) => s + d.messagesReceived, 0);

    return (
        <div className={overviewStyles.section}>
            <div className={overviewStyles.sectionHeader}>
                <div className={overviewStyles.sectionTitle}>Evolução Temporal</div>
                <div className={overviewStyles.sectionHint}>
                    Leads criados · vendas fechadas · receita · mensagens recebidas no período
                </div>
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 12 : 24, marginBottom: 14, flexWrap: 'wrap' }}>
                <ChartLegendItem color="#60a5fa" label="Leads gerados" value={fmtNum(totalLeads)} />
                <ChartLegendItem color="#4ade80" label="Vendas fechadas" value={fmtNum(totalWon)} />
                <ChartLegendItem color="#a78bfa" label="R$ Ganho" value={fmtBRL(totalWonValue)} />
                <ChartLegendItem color="#fbbf24" label="Mensagens" value={fmtNum(totalMsgs)} />
            </div>
            <div style={{ width: '100%', height: isMobile ? 240 : 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: isMobile ? 8 : 16, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="gradLeadsP" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradRevenueP" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: '#6b7388', fontSize: isMobile ? 9 : 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / (isMobile ? 5 : 12)))} />
                        <YAxis yAxisId="left" tick={{ fill: '#6b7388', fontSize: isMobile ? 9 : 11 }} axisLine={false} tickLine={false} width={isMobile ? 32 : 42} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7388', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} width={isMobile ? 0 : 48} hide={isMobile} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area yAxisId="right" type="monotone" dataKey="R$ Ganho" stroke="#a78bfa" fill="url(#gradRevenueP)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#a78bfa' }} />
                        <Area yAxisId="left" type="monotone" dataKey="Leads gerados" stroke="#60a5fa" fill="url(#gradLeadsP)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#60a5fa' }} />
                        <Line yAxisId="left" type="monotone" dataKey="Vendas fechadas" stroke="#4ade80" strokeWidth={2.5} dot={{ r: 3, fill: '#4ade80', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#4ade80' }} />
                        <Line yAxisId="left" type="monotone" dataKey="Mensagens" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 4, fill: '#fbbf24' }} opacity={0.7} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function ChartLegendItem({ color, label, value }: { color: string; label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}80` }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
        </div>
    );
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontVariantNumeric: 'tabular-nums' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            {payload.map((p: any) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginTop: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{p.name}:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                        {p.name === 'R$ Ganho' ? fmtBRL(p.value) : fmtNum(p.value)}
                    </strong>
                </div>
            ))}
        </div>
    );
}

// ─── INSIGHTS ───────────────────────────────────────────────────────────────

function InsightsRow({ insights }: { insights: InsightCard[] }) {
    if (!insights || insights.length === 0) return null;
    return <div className={overviewStyles.insightsGrid}>{insights.map((ins, i) => <Insight key={i} insight={ins} />)}</div>;
}

function Insight({ insight }: { insight: InsightCard }) {
    return (
        <div className={`${overviewStyles.insightCard} ${overviewStyles[insight.severity]}`}>
            <div className={overviewStyles.insightHeader}>
                <span className={overviewStyles.insightIcon}>{insight.icon}</span>
                {insight.metric && <span className={`${overviewStyles.insightMetric} ${overviewStyles[insight.severity]}`}>{insight.metric}</span>}
            </div>
            <div className={overviewStyles.insightTitle}>{insight.title}</div>
            <div className={overviewStyles.insightDesc}>{insight.description}</div>
        </div>
    );
}

// ─── FUNNEL ─────────────────────────────────────────────────────────────────

function FunnelVisualSection({ funnel }: { funnel: FunnelStage[] }) {
    const flow = funnel.filter(s => s.stageType !== 'lost');
    if (flow.length === 0) {
        return <div className={overviewStyles.section}><div className={overviewStyles.sectionHint}>Sem dados de funil.</div></div>;
    }
    const max = Math.max(...flow.map(s => s.totalLeads), 1);
    const minBarPct = 4;
    const convClass = (rate: number | null) => {
        if (rate === null) return overviewStyles.empty;
        if (rate >= 50) return overviewStyles.good;
        if (rate >= 25) return overviewStyles.mid;
        return overviewStyles.bad;
    };

    return (
        <div className={overviewStyles.section}>
            <div className={overviewStyles.sectionHeader}>
                <div className={overviewStyles.sectionTitle}>Funil de Conversão</div>
                <div className={overviewStyles.sectionHint}>Volume de leads por etapa · taxa de avanço entre etapas no período</div>
            </div>
            <div className={overviewStyles.funnelLayout}>
                <div className={overviewStyles.funnelBars}>
                    {flow.map((s, i) => {
                        const widthPct = Math.max(minBarPct, (s.totalLeads / max) * 100);
                        const next = flow[i + 1];
                        return (
                            <div key={s.stageId}>
                                <div className={overviewStyles.funnelStageRow}>
                                    <div className={overviewStyles.funnelStageName}>{s.name}</div>
                                    <div className={overviewStyles.funnelBarTrack}>
                                        <div className={overviewStyles.funnelBarFill} style={{ width: `${widthPct}%`, ['--bar-color' as any]: s.color }} />
                                        <div className={overviewStyles.funnelBarLabel}>
                                            {fmtNum(s.totalLeads)} <small>leads</small>
                                        </div>
                                    </div>
                                    <div className={overviewStyles.funnelStageMetric}>
                                        <div className={overviewStyles.funnelStageMetricNum}>{fmtBRL(s.totalValue)}</div>
                                        <div className={overviewStyles.funnelStageMetricSub}>
                                            {s.totalLeads > 0 ? `${(s.totalValue / s.totalLeads).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} méd.` : '—'}
                                        </div>
                                    </div>
                                </div>
                                {next && (
                                    <div className={overviewStyles.funnelConnector}>
                                        <span className={overviewStyles.funnelConnectorLine} />
                                        <span className={`${overviewStyles.funnelConnectorRate} ${convClass(s.conversionToNext)}`}>
                                            {s.conversionToNext !== null ? `${s.conversionToNext.toFixed(0)}%` : '—'}
                                        </span>
                                        <span>avançou pra {next.name.toLowerCase()}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <table className={overviewStyles.funnelTable}>
                    <thead>
                        <tr>
                            <th>Etapa</th>
                            <th className="right">Total</th>
                            <th className="right">Entrou</th>
                            <th className="right">Avançou</th>
                            <th className="right">Perdeu</th>
                            <th className="right">Conv.</th>
                            <th className="right">Tempo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {flow.map(s => (
                            <tr key={s.stageId}>
                                <td>
                                    <div className={overviewStyles.funnelTableStage}>
                                        <span className="dot" style={{ background: s.color }} />
                                        {s.name}
                                    </div>
                                </td>
                                <td className="num">{fmtNum(s.totalLeads)}</td>
                                <td className={`num ${s.enteredInPeriod > 0 ? 'entered' : 'muted'}`}>{s.enteredInPeriod > 0 ? `+${s.enteredInPeriod}` : '—'}</td>
                                <td className={`num ${s.advancedInPeriod > 0 ? 'advanced' : 'muted'}`}>{s.advancedInPeriod > 0 ? s.advancedInPeriod : '—'}</td>
                                <td className={`num ${s.lostInPeriod > 0 ? 'lost' : 'muted'}`}>{s.lostInPeriod > 0 ? `−${s.lostInPeriod}` : '—'}</td>
                                <td className={`${overviewStyles.funnelTableConv} ${convClass(s.conversionToNext)}`}>{s.conversionToNext !== null ? `${s.conversionToNext.toFixed(0)}%` : '—'}</td>
                                <td className="num muted">{s.avgDaysInStage > 0 ? `${s.avgDaysInStage.toFixed(1).replace('.', ',')}d` : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── OPERAÇÃO ──────────────────────────────────────────────────────────────

function OperationSection({ data }: { data: PublicData }) {
    const conv = data.conversations;
    const tasks = data.tasks;
    const leads = data.leads;
    const responseColor: 'green' | 'yellow' | 'red' =
        conv.avgResponseTimeMinutes <= 30 ? 'green' :
            conv.avgResponseTimeMinutes <= 120 ? 'yellow' : 'red';
    const channelBreakdown = conv.messagesReceived.byChannel
        .slice(0, 3)
        .map(c => `${c.channel === 'whatsapp' ? 'WhatsApp' : c.channel}: ${fmtNum(c.count)}`)
        .join(' · ');

    return (
        <div className={overviewStyles.section}>
            <div className={overviewStyles.sectionHeader}>
                <div className={overviewStyles.sectionTitle}>Operação WhatsApp & Tarefas</div>
                <div className={overviewStyles.sectionHint}>Saúde do atendimento e produtividade do time</div>
            </div>
            <div className={overviewStyles.opGrid}>
                <div className={overviewStyles.miniCard}>
                    <div className={overviewStyles.miniLabel}>
                        <MessageSquare size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Mensagens recebidas
                    </div>
                    <div className={`${overviewStyles.miniValue} green`}>{fmtNum(conv.messagesReceived.total)}</div>
                    <div className={overviewStyles.miniSub}>{channelBreakdown || 'no período'}</div>
                </div>
                <div className={overviewStyles.miniCard}>
                    <div className={overviewStyles.miniLabel}>Conversas ativas</div>
                    <div className={`${overviewStyles.miniValue} purple`}>{fmtNum(conv.activeConversations)}</div>
                </div>
                <div className={`${overviewStyles.miniCard} ${conv.unansweredChats > 5 ? overviewStyles.alert : ''}`}>
                    <div className={overviewStyles.miniLabel}>
                        <AlertCircle size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Sem resposta
                    </div>
                    <div className={`${overviewStyles.miniValue} ${conv.unansweredChats > 5 ? 'red' : 'purple'}`}>
                        {fmtNum(conv.unansweredChats)}
                    </div>
                </div>
                <div className={overviewStyles.miniCard}>
                    <div className={overviewStyles.miniLabel}>
                        <Clock size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Tempo 1ª resposta
                    </div>
                    <div className={`${overviewStyles.miniValue} ${responseColor}`}>
                        {conv.avgResponseTimeMinutes < 60
                            ? `${fmtMinutes(conv.avgResponseTimeMinutes)}min`
                            : fmtMinutes(conv.avgResponseTimeMinutes)}
                    </div>
                    <div className={overviewStyles.miniSub}>média no período</div>
                </div>
                <div className={`${overviewStyles.miniCard} ${conv.longestWaitDays > 7 ? overviewStyles.warn : ''}`}>
                    <div className={overviewStyles.miniLabel}>
                        <Hourglass size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Maior espera
                    </div>
                    <div className={`${overviewStyles.miniValue} ${conv.longestWaitDays > 7 ? 'yellow' : 'purple'}`}>
                        {conv.longestWaitDays}<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}> dias</span>
                    </div>
                    <div className={overviewStyles.miniSub}>lead mais antigo</div>
                </div>
                <div className={`${overviewStyles.miniCard} ${tasks.overdueTasks > 0 ? overviewStyles.warn : ''}`}>
                    <div className={overviewStyles.miniLabel}>
                        <CheckSquare size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Tarefas pendentes
                    </div>
                    <div className={`${overviewStyles.miniValue} purple`}>{fmtNum(tasks.pendingTasks)}</div>
                    <div className={overviewStyles.miniSub}>
                        {tasks.overdueTasks > 0
                            ? <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>{tasks.overdueTasks} atrasadas</span>
                            : 'todas em dia'}
                    </div>
                </div>
            </div>
            <div className={overviewStyles.opGrid} style={{ marginTop: 10 }}>
                <div className={overviewStyles.miniCard}>
                    <div className={overviewStyles.miniLabel}>Leads ativos</div>
                    <div className={`${overviewStyles.miniValue} blue`}>{fmtNum(leads.activeLeads)}</div>
                    <div className={overviewStyles.miniSub}>{fmtBRL(leads.activeValue)} em pipeline</div>
                </div>
            </div>
        </div>
    );
}

// ─── CANAIS ─────────────────────────────────────────────────────────────────

function ChannelsSection({ channels }: { channels: Channel[] }) {
    if (!channels || channels.length === 0) return null;
    const maxLeads = Math.max(...channels.map(c => c.leads), 1);
    const ranked = [...channels].sort((a, b) => b.convRate - a.convRate);
    const best = ranked[0];
    const volumeLeader = [...channels].sort((a, b) => b.leads - a.leads)[0];
    let insight: string | null = null;
    if (best && volumeLeader && best.sourceId !== volumeLeader.sourceId && best.convRate > 0 && volumeLeader.convRate > 0) {
        const ratio = best.convRate / Math.max(volumeLeader.convRate, 0.1);
        if (ratio >= 2) {
            insight = `${best.name} converte ${ratio.toFixed(1).replace('.', ',')}x mais que ${volumeLeader.name} (canal de maior volume). Vale investir mais nesse canal de alta qualidade.`;
        }
    }
    const stars = (q: 'high' | 'medium' | 'low') => q === 'high' ? '★★★★★' : q === 'medium' ? '★★★' : '★';

    return (
        <div className={overviewStyles.section}>
            <div className={overviewStyles.sectionHeader}>
                <div className={overviewStyles.sectionTitle}>Canais de Aquisição — Volume e Qualidade</div>
                <div className={overviewStyles.sectionHint}>Quem traz mais e quem traz melhor</div>
            </div>
            <div className={overviewStyles.channelsGrid}>
                <div className={`${overviewStyles.channelRow} ${overviewStyles.header}`}>
                    <span></span>
                    <span>Origem</span>
                    <span>Leads</span>
                    <span>Volume</span>
                    <span>Conv.</span>
                    <span>R$ ganho</span>
                    <span>Qualidade</span>
                </div>
                {channels.map(c => (
                    <div key={c.sourceId ?? 'null'} className={overviewStyles.channelRow}>
                        <span className={overviewStyles.channelBullet} style={{ background: c.color, color: c.color }} />
                        <span className={overviewStyles.channelName}>{c.name}</span>
                        <span className={overviewStyles.channelLeads}>{fmtNum(c.leads)}</span>
                        <span className={overviewStyles.channelBarBg}>
                            <span className={overviewStyles.channelBar}>
                                <span className={overviewStyles.channelBarFill} style={{ width: `${(c.leads / maxLeads) * 100}%`, ['--ch-color' as any]: c.color }} />
                            </span>
                        </span>
                        <span className={`${overviewStyles.channelConv} ${c.quality === 'high' ? overviewStyles.good : c.quality === 'medium' ? overviewStyles.mid : overviewStyles.bad}`}>
                            {c.convRate.toFixed(1).replace('.', ',')}%
                        </span>
                        <span className={overviewStyles.channelValue}>{c.wonValue > 0 ? fmtBRL(c.wonValue) : '—'}</span>
                        <span className={overviewStyles.channelStars} title={c.quality}>{stars(c.quality)}</span>
                    </div>
                ))}
            </div>
            {insight && (
                <div className={overviewStyles.channelInsight}>
                    💡 <strong>{insight}</strong>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Conversas
// ═══════════════════════════════════════════════════════════════════════════

interface ConversationRow {
    id: string;
    contact_name: string | null;
    contact_phone: string;
    channel: string;
    status: 'open' | 'pending' | 'closed';
    last_message_at: string;
    last_message_direction: 'in' | 'out' | null;
    unanswered_since: string | null;
    message_count: number;
    first_response_seconds: number | null;
    salesperson_id: string | null;
    salesperson_name: string | null;
    salesperson_color: string | null;
    source_name: string | null;
    source_color: string | null;
}
interface MessageRow {
    id: string;
    direction: 'in' | 'out';
    content: string | null;
    type: string;
    sent_at: string;
}

const fmtRelative = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d`;
    return new Date(iso).toLocaleDateString('pt-BR');
};

function ConversationsTab({ token, password, salespeople, salespersonId, period, customFrom, customTo }: {
    token: string; password: string | null;
    salespeople: Salesperson[]; salespersonId: string;
    period: PeriodPreset; customFrom: string; customTo: string;
}) {
    const [rows, setRows] = useState<ConversationRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterMode, setFilterMode] = useState<'' | 'unanswered'>('');
    const [innerSp, setInnerSp] = useState(salespersonId);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ConversationRow | null>(null);
    const [messages, setMessages] = useState<MessageRow[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);

    useEffect(() => { setInnerSp(salespersonId); setPage(1); }, [salespersonId]);

    useEffect(() => {
        if (period === 'custom' && (!customFrom || !customTo)) return;
        setLoading(true);
        api.getPublicCommercialConversations(token, {
            ...(password && { password }),
            ...(filterStatus && { status: filterStatus }),
            ...(filterMode && { filter: filterMode }),
            ...(innerSp && { salespersonId: innerSp }),
            period,
            ...(period === 'custom' && { dateRange: { from: customFrom, to: customTo } }),
            page, limit: 25,
        })
            .then(d => { setRows(d.rows); setTotal(d.total); })
            .finally(() => setLoading(false));
    }, [token, password, filterStatus, filterMode, innerSp, page, period, customFrom, customTo]);

    const openDrawer = (c: ConversationRow) => {
        setSelected(c);
        setMessages([]);
        setLoadingMessages(true);
        api.getPublicCommercialConversationMessages(token, c.id, { ...(password && { password }) })
            .then(setMessages)
            .finally(() => setLoadingMessages(false));
    };

    return (
        <div className={overviewStyles.section}>
            <div className={overviewStyles.sectionHeader}>
                <div className={overviewStyles.sectionTitle}>Conversas</div>
                <div className={overviewStyles.sectionHint}>{total} conversas{filterMode === 'unanswered' && ' sem resposta'}</div>
            </div>
            <div className={styles.tabFilters}>
                <button onClick={() => { setFilterStatus(''); setFilterMode(''); setPage(1); }}
                    className={`${styles.publicChip} ${!filterStatus && !filterMode ? styles.publicChipActive : ''}`}>Todas</button>
                <button onClick={() => { setFilterStatus('open'); setFilterMode(''); setPage(1); }}
                    className={`${styles.publicChip} ${filterStatus === 'open' ? styles.publicChipActive : ''}`}>Em aberto</button>
                <button onClick={() => { setFilterStatus('pending'); setFilterMode(''); setPage(1); }}
                    className={`${styles.publicChip} ${filterStatus === 'pending' ? styles.publicChipActive : ''}`}>Pendentes</button>
                <button onClick={() => { setFilterMode('unanswered'); setFilterStatus(''); setPage(1); }}
                    className={`${styles.publicChip} ${filterMode === 'unanswered' ? styles.publicChipActive : ''}`}>Sem resposta</button>
                <button onClick={() => { setFilterStatus('closed'); setFilterMode(''); setPage(1); }}
                    className={`${styles.publicChip} ${filterStatus === 'closed' ? styles.publicChipActive : ''}`}>Encerradas</button>
                <select value={innerSp} onChange={e => { setInnerSp(e.target.value); setPage(1); }} className={styles.publicSelect}>
                    <option value="">Todos os vendedores</option>
                    {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </div>

            <div className={styles.convList}>
                {loading && rows.length === 0 && <div className={styles.tabEmpty}>Carregando…</div>}
                {!loading && rows.length === 0 && <div className={styles.tabEmpty}>Nenhuma conversa com esses filtros</div>}
                {rows.map(c => (
                    <button key={c.id} onClick={() => openDrawer(c)} className={styles.convRow} type="button">
                        <div className={styles.convAvatar} style={{ background: c.salesperson_color || 'var(--bg-surface-2)' }}>
                            {(c.contact_name || c.contact_phone).slice(0, 1).toUpperCase()}
                        </div>
                        <div className={styles.convMain}>
                            <div className={styles.convName}>
                                {c.contact_name || c.contact_phone}
                                {c.unanswered_since && (
                                    <span className={styles.convBadgeRed}><AlertCircle size={11} /> sem resposta</span>
                                )}
                            </div>
                            <div className={styles.convMeta}>
                                <span>{c.contact_phone}</span>
                                <span>·</span>
                                <span>{c.message_count} mensagens</span>
                                {c.source_name && (
                                    <>
                                        <span>·</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: 3, background: c.source_color || '#6b7388' }} />
                                            {c.source_name}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className={styles.convSide}>
                            <div className={styles.convTime}><Clock size={11} /> {fmtRelative(c.last_message_at)}</div>
                            <div className={styles.convSp}>
                                {c.salesperson_name ?? <span style={{ color: 'var(--text-muted)' }}>sem dono</span>}
                            </div>
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    </button>
                ))}
            </div>

            {total > 25 && (
                <div className={styles.pagination}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={styles.pageBtn}>← Anterior</button>
                    <span>Página {page} de {Math.ceil(total / 25)}</span>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * 25 >= total} className={styles.pageBtn}>Próxima →</button>
                </div>
            )}

            {selected && (
                <>
                    <div className={styles.drawerBackdrop} onClick={() => setSelected(null)} />
                    <aside className={styles.drawer}>
                        <header className={styles.drawerHeader}>
                            <div>
                                <h3>{selected.contact_name || selected.contact_phone}</h3>
                                <p>{selected.contact_phone} · {selected.message_count} mensagens</p>
                            </div>
                            <button onClick={() => setSelected(null)} className={styles.drawerClose}>
                                <X size={18} />
                            </button>
                        </header>
                        <div className={styles.drawerMessages}>
                            {loadingMessages && <div className={styles.tabEmpty}>Carregando mensagens…</div>}
                            {!loadingMessages && messages.length === 0 && <div className={styles.tabEmpty}>Sem mensagens</div>}
                            {messages.map(m => (
                                <div key={m.id} className={`${styles.msg} ${m.direction === 'out' ? styles.msgOut : styles.msgIn}`}>
                                    <div className={styles.msgBubble}>{m.content || <em>(mídia)</em>}</div>
                                    <div className={styles.msgTime}>
                                        {new Date(m.sent_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Leads
// ═══════════════════════════════════════════════════════════════════════════

interface LeadRow {
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    title: string | null;
    value: string;
    status: 'open' | 'won' | 'lost';
    days_in_stage: number;
    days_to_conversion: string | null;
    stage_id: string;
    stage_name: string;
    stage_color: string;
    stuck_threshold_days: number;
    salesperson_name: string | null;
    salesperson_color: string | null;
    source_name: string | null;
    source_color: string | null;
    created_at: string;
    closed_at: string | null;
    last_activity_at: string;
}
type SortField = 'last_activity_at' | 'created_at' | 'value' | 'last_stage_change_at' | 'contact_name';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

function LeadsTab({ token, password, pipelines, salespeople, pipelineId, salespersonId, period, customFrom, customTo }: {
    token: string; password: string | null;
    pipelines: Pipeline[]; salespeople: Salesperson[];
    pipelineId: string; salespersonId: string;
    period: PeriodPreset; customFrom: string; customTo: string;
}) {
    const [rows, setRows] = useState<LeadRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [stageId, setStageId] = useState('');
    const [status, setStatus] = useState('open');
    const [innerSp, setInnerSp] = useState(salespersonId);
    const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
    const [sourceId, setSourceId] = useState('');
    const [sort, setSort] = useState<SortField>('last_activity_at');
    const [dir, setDir] = useState<'asc' | 'desc'>('desc');
    const [loading, setLoading] = useState(true);

    const stages = useMemo(() => {
        const main = pipelineId ? pipelines.find(p => p.id === pipelineId) : pipelines[0];
        return main?.stages || [];
    }, [pipelines, pipelineId]);

    useEffect(() => { setInnerSp(salespersonId); setPage(1); }, [salespersonId]);

    useEffect(() => {
        api.getPublicCommercialLeadSources(token, { ...(password && { password }) })
            .then(setSources)
            .catch(() => {});
    }, [token, password]);

    useEffect(() => {
        if (period === 'custom' && (!customFrom || !customTo)) return;
        setLoading(true);
        api.getPublicCommercialLeads(token, {
            ...(password && { password }),
            ...(pipelineId && { pipelineId }),
            ...(stageId && { stageId }),
            ...(status && { status }),
            ...(innerSp && { salespersonId: innerSp }),
            ...(sourceId && { sourceId }),
            period,
            ...(period === 'custom' && { dateRange: { from: customFrom, to: customTo } }),
            sort, dir, page, limit: 50,
        })
            .then(d => { setRows(d.rows); setTotal(d.total); })
            .finally(() => setLoading(false));
    }, [token, password, pipelineId, stageId, status, innerSp, sourceId, sort, dir, page, period, customFrom, customTo]);

    const toggleSort = (f: SortField) => {
        if (sort === f) setDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSort(f); setDir('desc'); }
    };

    return (
        <div className={overviewStyles.section}>
            <div className={overviewStyles.sectionHeader}>
                <div className={overviewStyles.sectionTitle}>Leads</div>
                <div className={overviewStyles.sectionHint}>{total} leads encontrados</div>
            </div>
            <div className={styles.tabFilters}>
                <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={styles.publicSelect}>
                    <option value="open">Abertos</option>
                    <option value="won">Ganhos</option>
                    <option value="lost">Perdidos</option>
                    <option value="">Todos</option>
                </select>
                <select value={stageId} onChange={e => { setStageId(e.target.value); setPage(1); }} className={styles.publicSelect}>
                    <option value="">Todas as etapas</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={innerSp} onChange={e => { setInnerSp(e.target.value); setPage(1); }} className={styles.publicSelect}>
                    <option value="">Todos os vendedores</option>
                    {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={sourceId} onChange={e => { setSourceId(e.target.value); setPage(1); }} className={styles.publicSelect}>
                    <option value="">Todas as origens</option>
                    {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </div>

            <div className={styles.tableWrap}>
                <table className={styles.leadsTable}>
                    <thead>
                        <tr>
                            <ThSort label="Contato" active={sort === 'contact_name'} dir={dir} onClick={() => toggleSort('contact_name')} />
                            <th>Etapa</th>
                            <th>Vendedor</th>
                            <ThSort label="Valor" active={sort === 'value'} dir={dir} onClick={() => toggleSort('value')} align="right" />
                            <ThSort label="Dias na etapa" active={sort === 'last_stage_change_at'} dir={dir} onClick={() => toggleSort('last_stage_change_at')} align="right" />
                            <th style={{ textAlign: 'right' }}>Tempo p/ ganho</th>
                            <ThSort label="Entrada" active={sort === 'created_at'} dir={dir} onClick={() => toggleSort('created_at')} align="right" />
                            <th style={{ textAlign: 'right' }}>Fechamento</th>
                            <ThSort label="Última atividade" active={sort === 'last_activity_at'} dir={dir} onClick={() => toggleSort('last_activity_at')} align="right" />
                            <th>Origem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 && (
                            <tr><td colSpan={10} className={styles.tabEmpty}>Carregando…</td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={10} className={styles.tabEmpty}>Nenhum lead com esses filtros</td></tr>
                        )}
                        {rows.map(l => {
                            const stuck = l.status === 'open' && l.days_in_stage >= l.stuck_threshold_days;
                            return (
                                <tr key={l.id} className={stuck ? styles.stuckRow : ''}>
                                    <td>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.contact_name || '—'}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.title || l.contact_phone}</div>
                                    </td>
                                    <td>
                                        <span className={styles.stageBadge} style={{ borderLeftColor: l.stage_color }}>{l.stage_name}</span>
                                    </td>
                                    <td>
                                        {l.salesperson_name ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: 3, background: l.salesperson_color || '#6b7388' }} />
                                                {l.salesperson_name}
                                            </span>
                                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td className={styles.right}><strong>{fmtBRL(l.value)}</strong></td>
                                    <td className={styles.right}>
                                        <span style={{ color: stuck ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: stuck ? 600 : 400 }}>
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
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: 3, background: l.source_color || '#6b7388' }} />
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
                    <span>Página {page} de {Math.ceil(total / 50)}</span>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total} className={styles.pageBtn}>Próxima →</button>
                </div>
            )}
        </div>
    );
}

function ThSort({ label, active, dir, onClick, align = 'left' }: {
    label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; align?: 'left' | 'right';
}) {
    return (
        <th onClick={onClick} style={{ cursor: 'pointer', textAlign: align }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {label}
                {active && (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
            </span>
        </th>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Tarefas
// ═══════════════════════════════════════════════════════════════════════════

interface TaskRow {
    id: string;
    title: string;
    type: string | null;
    due_at: string | null;
    status: 'pending' | 'completed' | 'overdue' | 'cancelled';
    salesperson_name: string | null;
    salesperson_color: string | null;
    contact_name: string | null;
    deal_value: string | null;
    bucket: 'completed' | 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_date';
}

const TASK_BUCKETS: { key: TaskRow['bucket']; label: string; color: string }[] = [
    { key: 'overdue', label: 'Atrasadas', color: 'var(--accent-red)' },
    { key: 'today', label: 'Hoje', color: 'var(--accent-yellow)' },
    { key: 'tomorrow', label: 'Amanhã', color: 'var(--accent-blue)' },
    { key: 'this_week', label: 'Esta semana', color: 'var(--accent-purple)' },
    { key: 'later', label: 'Mais tarde', color: 'var(--text-secondary)' },
    { key: 'no_date', label: 'Sem prazo', color: 'var(--text-muted)' },
    { key: 'completed', label: 'Concluídas', color: 'var(--accent-green)' },
];

const TASK_ICONS: Record<string, any> = {
    call: Phone, meeting: Calendar, email: Mail, whatsapp: MessageCircle, follow_up: RefreshCw,
};

const fmtDue = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function TasksTab({ token, password, salespersonId, period, customFrom, customTo }: {
    token: string; password: string | null; salespersonId: string;
    period: PeriodPreset; customFrom: string; customTo: string;
}) {
    const [rows, setRows] = useState<TaskRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (period === 'custom' && (!customFrom || !customTo)) return;
        setLoading(true);
        api.getPublicCommercialTasks(token, {
            ...(password && { password }),
            ...(salespersonId && { salespersonId }),
            period,
            ...(period === 'custom' && { dateRange: { from: customFrom, to: customTo } }),
        })
            .then(setRows)
            .finally(() => setLoading(false));
    }, [token, password, salespersonId, period, customFrom, customTo]);

    const grouped = TASK_BUCKETS.map(b => ({ ...b, items: rows.filter(t => t.bucket === b.key) }));

    return (
        <div className={overviewStyles.section}>
            <div className={overviewStyles.sectionHeader}>
                <div className={overviewStyles.sectionTitle}>Tarefas</div>
                <div className={overviewStyles.sectionHint}>{rows.length} tarefas</div>
            </div>

            {loading && <div className={styles.tabEmpty}>Carregando…</div>}
            {!loading && rows.length === 0 && <div className={styles.tabEmpty}>Sem tarefas</div>}

            {!loading && grouped.map(g => g.items.length > 0 && (
                <section key={g.key} className={styles.taskSection}>
                    <div className={styles.taskSectionHeader}>
                        <span className={styles.taskBucketDot} style={{ background: g.color }} />
                        <h3>{g.label}</h3>
                        <span className={styles.taskCount}>{g.items.length}</span>
                    </div>
                    <div className={styles.taskList}>
                        {g.items.map(t => {
                            const Icon = TASK_ICONS[t.type || ''] || CheckSquare;
                            const done = t.status === 'completed';
                            return (
                                <div key={t.id} className={`${styles.taskCard} ${done ? styles.taskDone : ''}`}>
                                    <div className={styles.taskCheck}>{done && <Check size={14} />}</div>
                                    <div className={styles.taskMain}>
                                        <div className={styles.taskTitle}>
                                            <Icon size={12} strokeWidth={2} style={{ marginRight: 6, verticalAlign: '-1px', color: 'var(--text-muted)' }} />
                                            {t.title}
                                        </div>
                                        <div className={styles.taskMeta}>
                                            {t.contact_name && <span>{t.contact_name}</span>}
                                            {t.deal_value && <span>· {fmtBRL(t.deal_value)}</span>}
                                            {t.due_at && <span>· vence {fmtDue(t.due_at)}</span>}
                                        </div>
                                    </div>
                                    {t.salesperson_name && (
                                        <div className={styles.taskSp}>
                                            <span style={{ width: 6, height: 6, borderRadius: 3, background: t.salesperson_color || '#6b7388' }} />
                                            {t.salesperson_name}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Time
// ═══════════════════════════════════════════════════════════════════════════

interface TeamMember {
    salespersonId: string;
    name: string;
    avatarColor: string;
    messagesSent: number;
    avgFirstResponseSeconds: number;
    proposalsSent: number;
    dealsWon: number;
    dealsWonValue: number;
    monthlyGoalValue: number;
    goalProgressPct: number;
}

const fmtTime = (s: number) => {
    if (!s) return '—';
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.round(s / 60)}min`;
    return `${(s / 3600).toFixed(1)}h`;
};

function TeamTab({ token, password, period, customFrom, customTo }: {
    token: string; password: string | null; period: PeriodPreset;
    customFrom: string; customTo: string;
}) {
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [showGoalsModal, setShowGoalsModal] = useState(false);

    const load = useCallback(() => {
        if (period === 'custom' && (!customFrom || !customTo)) return;
        setLoading(true);
        api.getPublicCommercialTeam(token, {
            ...(password && { password }),
            period,
            ...(period === 'custom' && { dateRange: { from: customFrom, to: customTo } }),
        })
            .then(setTeam)
            .finally(() => setLoading(false));
    }, [token, password, period, customFrom, customTo]);

    useEffect(() => { load(); }, [load]);

    const totalGoal = team.reduce((s, sp) => s + sp.monthlyGoalValue, 0);

    return (
        <div className={overviewStyles.section}>
            <div className={overviewStyles.sectionHeader}>
                <div className={overviewStyles.sectionTitle}>Time</div>
                <div className={overviewStyles.sectionHint}>
                    Performance no período · Meta total do mês: <strong style={{ color: 'var(--text-primary)' }}>{fmtBRL(totalGoal)}</strong>
                </div>
                <button onClick={() => setShowGoalsModal(true)} className={styles.btnPrimary} style={{ marginLeft: 'auto' }}>
                    <Target size={13} /> Gerenciar Metas
                </button>
            </div>

            {showGoalsModal && (
                <ManageGoalsModalPublic
                    token={token}
                    password={password}
                    onClose={() => setShowGoalsModal(false)}
                    onSaved={() => { setShowGoalsModal(false); load(); }}
                />
            )}

            {loading && <div className={styles.tabEmpty}>Carregando…</div>}
            {!loading && team.length === 0 && <div className={styles.tabEmpty}>Nenhum vendedor cadastrado</div>}

            <div className={styles.teamGrid}>
                {team.map((sp, idx) => (
                    <div key={sp.salespersonId} className={styles.teamCard}>
                        <div className={styles.teamRank}>#{idx + 1}</div>
                        <div className={styles.teamHeader}>
                            <div className={styles.teamAvatar} style={{ background: sp.avatarColor }}>
                                {sp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                            </div>
                            <div>
                                <h4 className={styles.teamName}>{sp.name}</h4>
                                <p className={styles.teamSub}>
                                    {sp.dealsWon} ganhos · {fmtBRL(sp.dealsWonValue)}
                                </p>
                            </div>
                        </div>

                        {sp.monthlyGoalValue > 0 && (
                            <div className={styles.teamGoal}>
                                <div className={styles.teamGoalHeader}>
                                    <span>Meta mensal</span>
                                    <span className={styles.teamGoalPct}>{sp.goalProgressPct.toFixed(0)}%</span>
                                </div>
                                <div className={styles.teamGoalBar}>
                                    <div className={styles.teamGoalFill} style={{
                                        width: `${Math.min(100, sp.goalProgressPct)}%`,
                                        background: sp.goalProgressPct >= 100 ? 'var(--accent-green)' : sp.avatarColor,
                                    }} />
                                </div>
                                <div className={styles.teamGoalText}>
                                    {fmtBRL(sp.dealsWonValue)} de {fmtBRL(sp.monthlyGoalValue)}
                                </div>
                            </div>
                        )}

                        <div className={styles.teamStats}>
                            <div className={styles.teamStat}>
                                <div className={styles.teamStatLabel}>Mensagens</div>
                                <div className={styles.teamStatValue}>{fmtNum(sp.messagesSent)}</div>
                            </div>
                            <div className={styles.teamStat}>
                                <div className={styles.teamStatLabel}>1ª resposta</div>
                                <div className={styles.teamStatValue}>{fmtTime(sp.avgFirstResponseSeconds)}</div>
                            </div>
                            <div className={styles.teamStat}>
                                <div className={styles.teamStatLabel}>Propostas</div>
                                <div className={styles.teamStatValue}>{fmtNum(sp.proposalsSent)}</div>
                            </div>
                            <div className={styles.teamStat}>
                                <div className={styles.teamStatLabel}>Fechamentos</div>
                                <div className={styles.teamStatValue}>{fmtNum(sp.dealsWon)}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Gerenciar Metas (público — limitado a meta + ativo)
// ═══════════════════════════════════════════════════════════════════════════

interface SalespersonAll {
    id: string;
    name: string;
    avatar_color: string | null;
    monthly_goal_value: string | number;
    active: boolean;
    external_source: string | null;
}

function ManageGoalsModalPublic({ token, password, onClose, onSaved }: {
    token: string; password: string | null;
    onClose: () => void; onSaved: () => void;
}) {
    const [allSps, setAllSps] = useState<SalespersonAll[]>([]);
    const [individualGoals, setIndividualGoals] = useState<Record<string, string>>({});
    const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
    const [totalGoal, setTotalGoal] = useState<string>('0');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.getPublicCommercialSalespeople(token, {
            ...(password && { password }),
            includeInactive: true,
        })
            .then((rows: any[]) => {
                const list: SalespersonAll[] = rows.map(r => ({
                    id: r.id,
                    name: r.name,
                    avatar_color: r.avatar_color,
                    monthly_goal_value: r.monthly_goal_value,
                    active: r.active,
                    external_source: r.external_source,
                }));
                setAllSps(list);
                const goals: Record<string, string> = {};
                const actives: Record<string, boolean> = {};
                let total = 0;
                list.forEach(sp => {
                    goals[sp.id] = String(Number(sp.monthly_goal_value) || 0);
                    actives[sp.id] = sp.active;
                    if (sp.active) total += Number(sp.monthly_goal_value) || 0;
                });
                setIndividualGoals(goals);
                setActiveMap(actives);
                setTotalGoal(String(total));
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [token, password]);

    const distributeEqually = () => {
        const total = parseFloat(totalGoal) || 0;
        const activeOnes = allSps.filter(sp => activeMap[sp.id]);
        const each = activeOnes.length > 0 ? total / activeOnes.length : 0;
        const goals = { ...individualGoals };
        activeOnes.forEach(sp => { goals[sp.id] = String(Math.round(each)); });
        setIndividualGoals(goals);
    };

    const sumActive = allSps
        .filter(sp => activeMap[sp.id])
        .reduce((s, sp) => s + (parseFloat(individualGoals[sp.id] || '0') || 0), 0);

    const save = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await Promise.all(
                allSps.map(sp =>
                    api.updatePublicCommercialSalesperson(token, sp.id, {
                        ...(password && { password }),
                        monthly_goal_value: parseFloat(individualGoals[sp.id] || '0') || 0,
                        active: activeMap[sp.id],
                    })
                )
            );
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleActive = (id: string) => {
        setActiveMap({ ...activeMap, [id]: !activeMap[id] });
    };

    const sourceBadge = (src: string | null) => {
        if (src === 'kommo') return { label: 'Kommo', color: '#22c55e' };
        if (src === 'manual') return { label: 'Mock', color: '#f59e0b' };
        return { label: src || '—', color: '#6b7280' };
    };

    return (
        <>
            <div className={styles.modalBackdrop} onClick={onClose} />
            <div className={styles.modal}>
                <header className={styles.modalHeader}>
                    <h2>Gerenciar Metas e Vendedores</h2>
                    <button onClick={onClose} className={styles.modalClose}><X size={18} /></button>
                </header>
                <div className={styles.modalBody}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <Loader2 size={20} className={styles.spin} /> Carregando…
                        </div>
                    ) : (
                        <>
                            <div className={styles.modalField}>
                                <label>Meta total do workspace (R$)</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="number"
                                        value={totalGoal}
                                        onChange={e => setTotalGoal(e.target.value)}
                                        placeholder="ex: 200000"
                                        style={{ flex: 1 }}
                                    />
                                    <button type="button" onClick={distributeEqually} className={styles.btnSecondary}>
                                        Distribuir igual
                                    </button>
                                </div>
                                <small>Distribui apenas entre os vendedores ATIVOS abaixo.</small>
                            </div>

                            <div className={styles.modalField}>
                                <label>Vendedores ({allSps.filter(s => activeMap[s.id]).length} ativos / {allSps.length} total)</label>
                                <small style={{ marginBottom: 8 }}>
                                    Desmarque vendedores duplicados ou inativos.
                                </small>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                                    {allSps.map(sp => {
                                        const isActive = activeMap[sp.id] ?? false;
                                        const badge = sourceBadge(sp.external_source);
                                        return (
                                            <div
                                                key={sp.id}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'auto auto 1fr auto auto',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '8px 10px',
                                                    background: isActive ? 'var(--bg-surface-2)' : 'rgba(255,255,255,0.02)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 6,
                                                    opacity: isActive ? 1 : 0.55,
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => toggleActive(sp.id)}
                                                    title={isActive ? 'Desativar vendedor' : 'Ativar vendedor'}
                                                    style={{
                                                        width: 36, height: 20,
                                                        background: isActive ? 'var(--accent-green)' : 'var(--bg-surface)',
                                                        border: '1px solid ' + (isActive ? 'var(--accent-green)' : 'var(--border)'),
                                                        borderRadius: 10,
                                                        position: 'relative',
                                                        cursor: 'pointer',
                                                        transition: 'all 140ms',
                                                    }}
                                                >
                                                    <span style={{
                                                        position: 'absolute',
                                                        top: 1, left: isActive ? 17 : 1,
                                                        width: 16, height: 16,
                                                        background: 'white',
                                                        borderRadius: '50%',
                                                        transition: 'left 140ms',
                                                    }} />
                                                </button>
                                                <span
                                                    style={{
                                                        width: 28, height: 28, borderRadius: '50%',
                                                        background: sp.avatar_color || '#ff6b35',
                                                        color: 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 11, fontWeight: 600,
                                                    }}
                                                >
                                                    {sp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                                </span>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                                    <span style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {sp.name}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 9,
                                                        fontWeight: 700,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: 0.4,
                                                        color: badge.color,
                                                        padding: '1px 6px',
                                                        background: `${badge.color}15`,
                                                        border: `1px solid ${badge.color}30`,
                                                        borderRadius: 8,
                                                        width: 'fit-content',
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>R$</span>
                                                <input
                                                    type="number"
                                                    value={individualGoals[sp.id] || ''}
                                                    onChange={e => setIndividualGoals({
                                                        ...individualGoals,
                                                        [sp.id]: e.target.value,
                                                    })}
                                                    disabled={!isActive}
                                                    style={{ width: 110, textAlign: 'right' }}
                                                    placeholder="0"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <small style={{ marginTop: 8 }}>
                                    Soma dos ativos: <strong style={{ color: 'var(--text-primary)' }}>{fmtBRL(sumActive)}</strong>
                                    {Math.abs(sumActive - (parseFloat(totalGoal) || 0)) > 0.01 && (
                                        <span style={{ color: 'var(--accent-yellow)' }}>
                                            {' '}· difere de {fmtBRL(parseFloat(totalGoal) || 0)} (total)
                                        </span>
                                    )}
                                </small>
                            </div>

                            {error && <div className={styles.errorMsg}>{error}</div>}

                            <div className={styles.modalActions}>
                                <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancelar</button>
                                <button type="button" onClick={save} disabled={submitting} className={styles.btnPrimary}>
                                    {submitting ? <><Loader2 size={14} className={styles.spin} /> Salvando…</> : <><Check size={13} /> Salvar tudo</>}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
