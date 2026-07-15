'use client';

import { useEffect, useState } from 'react';
import {
    BarChart3, TrendingUp, TrendingDown, Minus,
    MessageSquare, Clock, Hourglass, AlertCircle, CheckSquare, Phone,
} from 'lucide-react';
import Link from 'next/link';
import {
    ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { api } from '@/lib/api';
import ClientPicker from './_components/ClientPicker';
import styles from './comercial.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'this_month' | 'custom';

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
    perSalesperson: Array<{
        salespersonId: string; name: string; avatarColor: string;
        monthlyGoal: number; achieved: number; achievedPct: number;
        pacePerDay: number; projectedEnd: number; projectedEndPct: number;
        onTrack: boolean; advice: string | null;
    }>;
}

interface TimeSeriesPoint {
    date: string;
    leadsCreated: number;
    dealsWon: number;
    dealsWonValue: number;
    messagesReceived: number;
}

interface Overview {
    pipelineId: string | null;
    heroKpis: HeroKpiCard[];
    insights: InsightCard[];
    funnel: FunnelStage[];
    channels: Channel[];
    forecast: GoalForecast;
    timeSeries: TimeSeriesPoint[];
    conversations: {
        messagesReceived: { total: number; byChannel: Array<{ channel: string; count: number }> };
        activeConversations: number; activeConversationsDelta: number;
        unansweredChats: number; unansweredChatsDelta: number;
        avgResponseTimeMinutes: number; longestWaitDays: number;
    };
    leads: { wonLeads: number; wonValue: number; wonDelta: number; activeLeads: number; activeValue: number; activeDelta: number };
    tasks: { pendingTasks: number; overdueTasks: number; tasksDelta: number };
    period: PeriodPreset;
}

interface Pipeline { id: string; name: string; is_main: boolean }
interface Salesperson { id: string; name: string }

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
    v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
        : v >= 1_000 ? `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`
            : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const fmtNum = (v: number) => v.toLocaleString('pt-BR');

const fmtMinutes = (mins: number) => {
    if (mins < 1) return '< 1';
    if (mins < 60) return Math.round(mins).toString();
    return (mins / 60).toFixed(1).replace('.', ',') + 'h';
};

const PERIODS: { value: PeriodPreset; label: string }[] = [
    { value: 'today', label: 'Hoje' },
    { value: '7d', label: '7 dias' },
    { value: '30d', label: '30 dias' },
    { value: '90d', label: '90 dias' },
    { value: 'this_month', label: 'Mês atual' },
    { value: 'custom', label: 'Personalizado' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthAgoISO = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ComercialDashboardPage() {
    const [period, setPeriod] = useState<PeriodPreset>('30d');
    const [customFrom, setCustomFrom] = useState<string>(monthAgoISO());
    const [customTo, setCustomTo] = useState<string>(todayISO());
    const [pipelineId, setPipelineId] = useState<string>('');
    const [salespersonId, setSalespersonId] = useState<string>('');
    const [clientId, setClientId] = useState<string>('');
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
    const [overview, setOverview] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            api.getCommercialPipelines(clientId || undefined),
            api.getCommercialSalespeople(clientId || undefined),
        ]).then(([p, s]) => {
            setPipelines(p); setSalespeople(s);
            if (pipelineId && !p.find((x: Pipeline) => x.id === pipelineId)) setPipelineId('');
            if (salespersonId && !s.find((x: Salesperson) => x.id === salespersonId)) setSalespersonId('');
        }).catch(e => setError(e.message));
    }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (period === 'custom' && (!customFrom || !customTo)) return;
        setLoading(true);
        api.getCommercialOverview({
            period,
            ...(period === 'custom' && { from: customFrom, to: customTo }),
            ...(clientId && { clientId }),
            ...(pipelineId && { pipelineId }),
            ...(salespersonId && { salespersonId }),
        })
            .then(setOverview)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [period, customFrom, customTo, clientId, pipelineId, salespersonId]);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <div className={styles.title}>
                        <BarChart3 size={22} className={styles.titleIcon} strokeWidth={2} />
                        <h1 className={styles.titleText}>Dashboard Comercial</h1>
                    </div>
                    <p className={styles.subtitle}>Visão executiva do funil, performance e diagnóstico do time</p>
                </div>
                <div className={styles.filters}>
                    <ClientPicker value={clientId} onChange={setClientId} />
                    {PERIODS.map(p => (
                        <button key={p.value} onClick={() => setPeriod(p.value)}
                            className={`${styles.filterChip} ${period === p.value ? styles.filterChipActive : ''}`}
                            type="button">{p.label}</button>
                    ))}
                    {period === 'custom' && (
                        <>
                            <input type="date" value={customFrom} max={customTo}
                                onChange={e => setCustomFrom(e.target.value)} className={styles.filterSelect} />
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                            <input type="date" value={customTo} min={customFrom} max={todayISO()}
                                onChange={e => setCustomTo(e.target.value)} className={styles.filterSelect} />
                        </>
                    )}
                    {pipelines.length > 1 && (
                        <select className={styles.filterSelect} value={pipelineId}
                            onChange={e => setPipelineId(e.target.value)}>
                            <option value="">Pipeline ativo</option>
                            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    )}
                    <select className={styles.filterSelect} value={salespersonId}
                        onChange={e => setSalespersonId(e.target.value)}>
                        <option value="">Todos os vendedores</option>
                        {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            </header>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {loading && !overview ? <SkeletonGrid /> : overview ? (
                <>
                    <HeroRow kpis={overview.heroKpis} />
                    <MetaForecastSection forecast={overview.forecast} />
                    <TimeSeriesSection data={overview.timeSeries} />
                    <InsightsRow insights={overview.insights} />
                    <FunnelVisualSection funnel={overview.funnel} />
                    <OperationSection data={overview} />
                    <ChannelsSection channels={overview.channels} />
                </>
            ) : null}
        </div>
    );
}

// ─── TIME SERIES — Gráfico de Linha ────────────────────────────────────────

function TimeSeriesSection({ data }: { data: TimeSeriesPoint[] }) {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 720);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    if (!data || data.length === 0) return null;

    // Transforma dados pro Recharts: formata data label e nomes amigáveis
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

    // Totais pra header
    const totalLeads = data.reduce((s, d) => s + d.leadsCreated, 0);
    const totalWon = data.reduce((s, d) => s + d.dealsWon, 0);
    const totalWonValue = data.reduce((s, d) => s + d.dealsWonValue, 0);
    const totalMsgs = data.reduce((s, d) => s + d.messagesReceived, 0);

    return (
        <div className={styles.section}>
            <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Evolução Temporal</div>
                <div className={styles.sectionHint}>
                    Leads criados · vendas fechadas · receita · mensagens recebidas no período
                </div>
            </div>

            {/* Mini KPIs do período */}
            <div style={{ display: 'flex', gap: isMobile ? 12 : 24, marginBottom: 14, flexWrap: 'wrap' }}>
                <ChartLegendItem color="#60a5fa" label="Leads gerados" value={fmtNum(totalLeads)} />
                <ChartLegendItem color="#4ade80" label="Vendas fechadas" value={fmtNum(totalWon)} />
                <ChartLegendItem color="#a78bfa" label="R$ Ganho" value={fmtBRL(totalWonValue)} />
                <ChartLegendItem color="#fbbf24" label="Mensagens" value={fmtNum(totalMsgs)} />
            </div>

            <div style={{ width: '100%', height: isMobile ? 240 : 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={chartData}
                        margin={{ top: 10, right: isMobile ? 8 : 16, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                            dataKey="label"
                            tick={{ fill: '#6b7388', fontSize: isMobile ? 9 : 11 }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                            tickLine={false}
                            interval={Math.max(0, Math.floor(chartData.length / (isMobile ? 5 : 12)))}
                        />
                        <YAxis
                            yAxisId="left"
                            tick={{ fill: '#6b7388', fontSize: isMobile ? 9 : 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={isMobile ? 32 : 42}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fill: '#6b7388', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                            width={isMobile ? 0 : 48}
                            hide={isMobile}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            yAxisId="right"
                            type="monotone"
                            dataKey="R$ Ganho"
                            stroke="#a78bfa"
                            fill="url(#gradRevenue)"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: '#a78bfa' }}
                        />
                        <Area
                            yAxisId="left"
                            type="monotone"
                            dataKey="Leads gerados"
                            stroke="#60a5fa"
                            fill="url(#gradLeads)"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: '#60a5fa' }}
                        />
                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="Vendas fechadas"
                            stroke="#4ade80"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: '#4ade80', strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: '#4ade80' }}
                        />
                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="Mensagens"
                            stroke="#fbbf24"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                            activeDot={{ r: 4, fill: '#fbbf24' }}
                            opacity={0.7}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function ChartLegendItem({ color, label, value }: { color: string; label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color, boxShadow: `0 0 6px ${color}80`,
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>
                    {label}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {value}
                </span>
            </div>
        </div>
    );
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '10px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            fontVariantNumeric: 'tabular-nums',
        }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
            </div>
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

// ─── META & FORECAST ───────────────────────────────────────────────────────

function MetaForecastSection({ forecast: f }: { forecast: GoalForecast }) {
    if (!f) return null;

    const statusBadge = {
        success: 'NO RITMO',
        warning: 'ATENÇÃO',
        critical: 'CRÍTICO',
        no_goal: 'SEM META',
    }[f.status];

    const adviceIcon = {
        success: '✅',
        warning: '⚠️',
        critical: '🚨',
        no_goal: 'ℹ️',
    }[f.status];

    // Limita pra 100% pra não furar a barra
    const fillPct = Math.min(100, f.workspaceAchievedPct);
    const expectedMarker = Math.min(100, f.expectedPct);

    return (
        <div className={`${styles.metaSection} ${styles[f.status]}`}>
            <div className={styles.metaLayout}>
                {/* Coluna 1: Progress + barra */}
                <div className={styles.metaProgress}>
                    <div className={styles.metaTitle}>
                        Meta do mês corrente
                        <span className={`${styles.badge} ${styles[f.status]}`}>{statusBadge}</span>
                    </div>
                    <div className={styles.metaBigValue}>
                        <span className={`${styles.metaPct} ${styles[f.status]}`}>
                            {f.workspaceGoal > 0 ? `${f.workspaceAchievedPct.toFixed(1).replace('.', ',')}%` : '—'}
                        </span>
                        {f.workspaceGoal > 0 && (
                            <span className={styles.metaSubValue}>
                                de {fmtBRL(f.workspaceGoal)}
                            </span>
                        )}
                    </div>

                    <div className={styles.metaBarTrack}>
                        {f.workspaceGoal > 0 && (
                            <>
                                <div
                                    className={`${styles.metaBarFill} ${styles[f.status === 'no_goal' ? 'warning' : f.status]}`}
                                    style={{ width: `${fillPct}%` }}
                                />
                                {f.status !== 'no_goal' && expectedMarker > 0 && expectedMarker < 100 && (
                                    <div className={styles.metaBarMarker} style={{ left: `${expectedMarker}%` }} />
                                )}
                            </>
                        )}
                    </div>

                    <div className={styles.metaBarLabels}>
                        <span>{fmtBRL(f.workspaceAchieved)} fechado</span>
                        <span>Dia {f.daysElapsed}/{f.daysTotal}</span>
                    </div>
                </div>

                {/* Coluna 2: Forecast */}
                <div className={styles.metaForecast}>
                    <div className={styles.metaForecastLabel}>Projeção fim do mês</div>
                    <div className={`${styles.metaForecastValue} ${styles[f.status === 'no_goal' ? 'warning' : f.status]}`}>
                        {f.workspaceGoal > 0 ? fmtBRL(f.projectedEnd) : '—'}
                    </div>
                    <div className={styles.metaForecastSub}>
                        {f.workspaceGoal > 0 ? (
                            <>
                                {f.projectedEndPct.toFixed(0)}% da meta · ritmo {fmtBRL(f.dailyPace)}/dia
                                <br />
                                {f.daysRemaining > 0 ? `${f.daysRemaining} dias restantes` : 'mês encerrando'}
                            </>
                        ) : 'Configure metas individuais por vendedor'}
                    </div>
                </div>

                {/* Coluna 3: Advice */}
                <div className={`${styles.metaAdvice} ${styles[f.status]}`}>
                    <span className={styles.metaAdviceIcon}>{adviceIcon}</span>
                    <span>{f.advice}</span>
                </div>
            </div>
        </div>
    );
}

// ─── FAIXA 1 — HERO ─────────────────────────────────────────────────────────

function HeroRow({ kpis }: { kpis: HeroKpiCard[] }) {
    if (!kpis || kpis.length === 0) return null;
    return <div className={styles.heroGrid}>{kpis.map((k, i) => <HeroKpi key={i} kpi={k} />)}</div>;
}

function HeroKpi({ kpi }: { kpi: HeroKpiCard }) {
    const Wrapper = kpi.href ? Link : 'div';
    const wrapperProps = kpi.href ? { href: kpi.href, className: styles.heroCardLink } : {};
    const isPositive = kpi.delta > 0 ? kpi.isPositiveTrend : kpi.delta < 0 ? !kpi.isPositiveTrend : null;
    const deltaClass = isPositive === true ? styles.up : isPositive === false ? styles.down : styles.flat;
    return (
        <Wrapper {...(wrapperProps as any)}>
            <div className={styles.heroCard}>
                <span className={styles.heroIcon}>{kpi.icon}</span>
                <div className={styles.heroLabel}>{kpi.label}</div>
                <div className={`${styles.heroValue} ${styles[kpi.color]}`}>{kpi.valueFormatted}</div>
                <div className={`${styles.heroDelta} ${deltaClass}`}>
                    {kpi.deltaPercent > 0 && <TrendingUp size={11} />}
                    {kpi.deltaPercent < 0 && <TrendingDown size={11} />}
                    {kpi.deltaPercent === 0 && <Minus size={11} />}
                    {kpi.deltaPercent > 0 ? '+' : ''}{kpi.deltaPercent.toFixed(1).replace('.', ',')}%
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>vs anterior</span>
                </div>
                <Sparkline data={kpi.sparkline} color={kpi.color} />
            </div>
        </Wrapper>
    );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
    if (!data || data.length === 0) return <div className={styles.heroSparkline} />;
    const w = 200, h = 28;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = w / Math.max(data.length - 1, 1);
    const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
    const stroke = color === 'green' ? '#22c55e' : color === 'purple' ? '#8b5cf6' : color === 'red' ? '#ef4444' : color === 'yellow' ? '#f59e0b' : '#3b82f6';
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={styles.heroSparkline}>
            <defs><linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity="0.25" /><stop offset="100%" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
            <path d={`M ${points.split(' ').join(' L ')} L ${w},${h} L 0,${h} Z`} fill={`url(#grad-${color})`} />
            <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ─── FAIXA 2 — INSIGHTS ─────────────────────────────────────────────────────

function InsightsRow({ insights }: { insights: InsightCard[] }) {
    if (!insights || insights.length === 0) return null;
    return <div className={styles.insightsGrid}>{insights.map((ins, i) => <Insight key={i} insight={ins} />)}</div>;
}

function Insight({ insight }: { insight: InsightCard }) {
    const className = `${styles.insightCard} ${styles[insight.severity]}`;
    const content = (<>
        <div className={styles.insightHeader}>
            <span className={styles.insightIcon}>{insight.icon}</span>
            {insight.metric && <span className={`${styles.insightMetric} ${styles[insight.severity]}`}>{insight.metric}</span>}
        </div>
        <div className={styles.insightTitle}>{insight.title}</div>
        <div className={styles.insightDesc}>{insight.description}</div>
    </>);
    if (insight.href) return <Link href={insight.href} className={className}>{content}</Link>;
    return <div className={className}>{content}</div>;
}

// ─── FAIXA 3 — FUNIL PROFISSIONAL (horizontal bars + tabela) ───────────────

function FunnelVisualSection({ funnel }: { funnel: FunnelStage[] }) {
    const flow = funnel.filter(s => s.stageType !== 'lost');
    if (flow.length === 0) {
        return <div className={styles.section}><div className={styles.sectionHint}>Pipeline não configurado.</div></div>;
    }

    const max = Math.max(...flow.map(s => s.totalLeads), 1);
    const minBarPct = 4;       // barra nunca abaixo disso pra não sumir

    const convClass = (rate: number | null) => {
        if (rate === null) return styles.empty;
        if (rate >= 50) return styles.good;
        if (rate >= 25) return styles.mid;
        return styles.bad;
    };

    return (
        <div className={styles.section}>
            <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Funil de Conversão</div>
                <div className={styles.sectionHint}>
                    Volume de leads por etapa · taxa de avanço entre etapas no período
                </div>
            </div>

            <div className={styles.funnelLayout}>
                {/* === Barras horizontais === */}
                <div className={styles.funnelBars}>
                    {flow.map((s, i) => {
                        const widthPct = Math.max(minBarPct, (s.totalLeads / max) * 100);
                        const next = flow[i + 1];
                        return (
                            <div key={s.stageId}>
                                <div className={styles.funnelStageRow}>
                                    <div className={styles.funnelStageName}>{s.name}</div>
                                    <div className={styles.funnelBarTrack}>
                                        <div
                                            className={styles.funnelBarFill}
                                            style={{
                                                width: `${widthPct}%`,
                                                ['--bar-color' as any]: s.color,
                                            }}
                                        />
                                        <div className={styles.funnelBarLabel}>
                                            {fmtNum(s.totalLeads)} <small>leads</small>
                                        </div>
                                    </div>
                                    <div className={styles.funnelStageMetric}>
                                        <div className={styles.funnelStageMetricNum}>{fmtBRL(s.totalValue)}</div>
                                        <div className={styles.funnelStageMetricSub}>
                                            {s.totalLeads > 0
                                                ? `${(s.totalValue / s.totalLeads).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} méd.`
                                                : '—'}
                                        </div>
                                    </div>
                                </div>
                                {next && (
                                    <div className={styles.funnelConnector}>
                                        <span className={styles.funnelConnectorLine} />
                                        <span className={`${styles.funnelConnectorRate} ${convClass(s.conversionToNext)}`}>
                                            {s.conversionToNext !== null ? `${s.conversionToNext.toFixed(0)}%` : '—'}
                                        </span>
                                        <span>avançou pra {next.name.toLowerCase()}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* === Tabela densa === */}
                <table className={styles.funnelTable}>
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
                                    <div className={styles.funnelTableStage}>
                                        <span className="dot" style={{ background: s.color }} />
                                        {s.name}
                                    </div>
                                </td>
                                <td className="num">{fmtNum(s.totalLeads)}</td>
                                <td className={`num ${s.enteredInPeriod > 0 ? 'entered' : 'muted'}`}>
                                    {s.enteredInPeriod > 0 ? `+${s.enteredInPeriod}` : '—'}
                                </td>
                                <td className={`num ${s.advancedInPeriod > 0 ? 'advanced' : 'muted'}`}>
                                    {s.advancedInPeriod > 0 ? s.advancedInPeriod : '—'}
                                </td>
                                <td className={`num ${s.lostInPeriod > 0 ? 'lost' : 'muted'}`}>
                                    {s.lostInPeriod > 0 ? `−${s.lostInPeriod}` : '—'}
                                </td>
                                <td className={`${styles.funnelTableConv} ${convClass(s.conversionToNext)}`}>
                                    {s.conversionToNext !== null ? `${s.conversionToNext.toFixed(0)}%` : '—'}
                                </td>
                                <td className="num muted">
                                    {s.avgDaysInStage > 0 ? `${s.avgDaysInStage.toFixed(1).replace('.', ',')}d` : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── FAIXA 4 — OPERAÇÃO (mini-KPIs) ─────────────────────────────────────────

function OperationSection({ data }: { data: Overview }) {
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
        <div className={styles.section}>
            <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Operação WhatsApp & Tarefas</div>
                <div className={styles.sectionHint}>Saúde do atendimento e produtividade do time</div>
            </div>
            <div className={styles.opGrid}>
                <Link href="/comercial/conversations" className={styles.miniCard}>
                    <div className={styles.miniLabel}>
                        <MessageSquare size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Mensagens recebidas
                    </div>
                    <div className={`${styles.miniValue} green`}>{fmtNum(conv.messagesReceived.total)}</div>
                    <div className={styles.miniSub}>{channelBreakdown || 'no período'}</div>
                </Link>

                <Link href="/comercial/conversations?status=open" className={styles.miniCard}>
                    <div className={styles.miniLabel}>Conversas ativas</div>
                    <div className={`${styles.miniValue} purple`}>{fmtNum(conv.activeConversations)}</div>
                    {conv.activeConversationsDelta !== 0 && (
                        <div className={`${styles.miniDelta} ${conv.activeConversationsDelta > 0 ? styles.up : styles.down}`}>
                            {conv.activeConversationsDelta > 0 ? '+' : ''}{conv.activeConversationsDelta} este mês
                        </div>
                    )}
                </Link>

                <Link href="/comercial/conversations?filter=unanswered"
                    className={`${styles.miniCard} ${conv.unansweredChats > 5 ? styles.alert : ''}`}>
                    <div className={styles.miniLabel}>
                        <AlertCircle size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Sem resposta
                    </div>
                    <div className={`${styles.miniValue} ${conv.unansweredChats > 5 ? 'red' : 'purple'}`}>
                        {fmtNum(conv.unansweredChats)}
                    </div>
                    {conv.unansweredChatsDelta !== 0 && (
                        <div className={`${styles.miniDelta} ${conv.unansweredChatsDelta < 0 ? styles.up : styles.down}`}>
                            {conv.unansweredChatsDelta > 0 ? '+' : ''}{conv.unansweredChatsDelta} este mês
                        </div>
                    )}
                </Link>

                <div className={styles.miniCard}>
                    <div className={styles.miniLabel}>
                        <Clock size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Tempo 1ª resposta
                    </div>
                    <div className={`${styles.miniValue} ${responseColor}`}>
                        {conv.avgResponseTimeMinutes < 60
                            ? `${fmtMinutes(conv.avgResponseTimeMinutes)}min`
                            : fmtMinutes(conv.avgResponseTimeMinutes)}
                    </div>
                    <div className={styles.miniSub}>média no período</div>
                </div>

                <div className={`${styles.miniCard} ${conv.longestWaitDays > 7 ? styles.warn : ''}`}>
                    <div className={styles.miniLabel}>
                        <Hourglass size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Maior espera
                    </div>
                    <div className={`${styles.miniValue} ${conv.longestWaitDays > 7 ? 'yellow' : 'purple'}`}>
                        {conv.longestWaitDays}<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}> dias</span>
                    </div>
                    <div className={styles.miniSub}>lead mais antigo sem resposta</div>
                </div>

                <Link href="/comercial/tasks" className={`${styles.miniCard} ${tasks.overdueTasks > 0 ? styles.warn : ''}`}>
                    <div className={styles.miniLabel}>
                        <CheckSquare size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Tarefas pendentes
                    </div>
                    <div className={`${styles.miniValue} purple`}>{fmtNum(tasks.pendingTasks)}</div>
                    <div className={styles.miniSub}>
                        {tasks.overdueTasks > 0
                            ? <><span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>{tasks.overdueTasks} atrasadas</span></>
                            : 'todas em dia'}
                    </div>
                </Link>
            </div>

            {/* Linha extra de leads */}
            <div className={styles.opGrid} style={{ marginTop: 10 }}>
                <Link href="/comercial/leads?status=open" className={styles.miniCard}>
                    <div className={styles.miniLabel}>Leads ativos</div>
                    <div className={`${styles.miniValue} blue`}>{fmtNum(leads.activeLeads)}</div>
                    <div className={styles.miniSub}>{fmtBRL(leads.activeValue)} em pipeline</div>
                </Link>
            </div>
        </div>
    );
}

// ─── FAIXA 5 — CANAIS (volume + qualidade) ─────────────────────────────────

function ChannelsSection({ channels }: { channels: Channel[] }) {
    if (!channels || channels.length === 0) return null;

    const maxLeads = Math.max(...channels.map(c => c.leads), 1);

    // Gera insight: melhor x pior
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
        <div className={styles.section}>
            <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Canais de Aquisição — Volume e Qualidade</div>
                <div className={styles.sectionHint}>Quem traz mais e quem traz melhor</div>
            </div>

            <div className={styles.channelsGrid}>
                <div className={`${styles.channelRow} ${styles.header}`}>
                    <span></span>
                    <span>Origem</span>
                    <span>Leads</span>
                    <span>Volume</span>
                    <span>Conv.</span>
                    <span>R$ ganho</span>
                    <span>Qualidade</span>
                </div>
                {channels.map(c => (
                    <div key={c.sourceId ?? 'null'} className={styles.channelRow}>
                        <span className={styles.channelBullet} style={{ background: c.color, color: c.color }} />
                        <span className={styles.channelName}>{c.name}</span>
                        <span className={styles.channelLeads}>{fmtNum(c.leads)}</span>
                        <span className={styles.channelBarBg}>
                            <span className={styles.channelBar}>
                                <span className={styles.channelBarFill}
                                    style={{ width: `${(c.leads / maxLeads) * 100}%`, ['--ch-color' as any]: c.color }} />
                            </span>
                        </span>
                        <span className={`${styles.channelConv} ${c.quality === 'high' ? styles.good : c.quality === 'medium' ? styles.mid : styles.bad}`}>
                            {c.convRate.toFixed(1).replace('.', ',')}%
                        </span>
                        <span className={styles.channelValue}>{c.wonValue > 0 ? fmtBRL(c.wonValue) : '—'}</span>
                        <span className={styles.channelStars} title={c.quality}>{stars(c.quality)}</span>
                    </div>
                ))}
            </div>

            {insight && (
                <div className={styles.channelInsight}>
                    💡 <strong>{insight}</strong>
                </div>
            )}
        </div>
    );
}

// ─── Loading ────────────────────────────────────────────────────────────────

function SkeletonGrid() {
    return (
        <>
            <div className={styles.heroGrid}>{Array.from({ length: 5 }).map((_, i) => <div key={i} className={styles.skeleton} style={{ height: 130 }} />)}</div>
            <div className={styles.insightsGrid}>{Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skeleton} style={{ height: 95 }} />)}</div>
            <div className={styles.skeleton} style={{ height: 380 }} />
            <div className={styles.skeleton} style={{ height: 220, marginTop: 16 }} />
            <div className={styles.skeleton} style={{ height: 280, marginTop: 16 }} />
        </>
    );
}
