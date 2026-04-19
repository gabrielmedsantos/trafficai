'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAccount } from '@/app/AccountContext';
import {
    DollarSign, Eye, MousePointerClick, Target, TrendingUp, RefreshCw,
    Link as LinkIcon, Activity, BarChart3, AlertTriangle, ChevronDown,
    MessageSquare, UserPlus, Megaphone, Radio, Heart, ShoppingCart, Zap,
    CalendarDays, X,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar,
} from 'recharts';

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractAction(actions: any[], ...types: string[]): number {
    if (!Array.isArray(actions)) return 0;
    for (const type of types) {
        const found = actions.find((a: any) => a.action_type === type);
        if (found) return Number(found.value) || 0;
    }
    return 0;
}

function fmtBRL(v: number) {
    return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(v: number) { return v.toLocaleString('pt-BR'); }
function fmtPct(v: number) { return `${v.toFixed(2)}%`; }
function fmtX(v: number)   { return `${v.toFixed(2)}x`; }

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
}

// ─── Date range helpers ────────────────────────────────────────────────────

function toISO(d: Date) { return d.toISOString().split('T')[0]; }

interface DateRange { since: string; until: string }

const DATE_PRESETS: { label: string; id: string; range: () => DateRange }[] = [
    { id: 'today',    label: 'Hoje',           range: () => { const d = toISO(new Date()); return { since: d, until: d }; } },
    { id: 'yesterday',label: 'Ontem',          range: () => { const d = new Date(); d.setDate(d.getDate()-1); const s = toISO(d); return { since: s, until: s }; } },
    { id: '7d',       label: 'Últimos 7 dias', range: () => { const u = new Date(); const s = new Date(); s.setDate(s.getDate()-6); return { since: toISO(s), until: toISO(u) }; } },
    { id: '14d',      label: 'Últimos 14 dias',range: () => { const u = new Date(); const s = new Date(); s.setDate(s.getDate()-13); return { since: toISO(s), until: toISO(u) }; } },
    { id: '30d',      label: 'Últimos 30 dias',range: () => { const u = new Date(); const s = new Date(); s.setDate(s.getDate()-29); return { since: toISO(s), until: toISO(u) }; } },
    { id: 'thisMonth',label: 'Este mês',       range: () => { const n = new Date(); return { since: `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`, until: toISO(n) }; } },
    { id: 'lastMonth',label: 'Mês passado',    range: () => {
        const n = new Date(); const y = n.getMonth() === 0 ? n.getFullYear()-1 : n.getFullYear();
        const m = n.getMonth() === 0 ? 12 : n.getMonth();
        const last = new Date(y, m, 0);
        return { since: `${y}-${String(m).padStart(2,'0')}-01`, until: toISO(last) };
    }},
    { id: 'custom',   label: 'Personalizado',  range: () => { const u = new Date(); const s = new Date(); s.setDate(s.getDate()-13); return { since: toISO(s), until: toISO(u) }; } },
];

function labelForRange(since: string, until: string, presetId: string): string {
    const p = DATE_PRESETS.find(p => p.id === presetId);
    if (p && p.id !== 'custom') return p.label;
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    return `${fmt(since)} – ${fmt(until)}`;
}

// ─── Objective configs ─────────────────────────────────────────────────────

export type ObjectiveId = 'messages' | 'conversions' | 'leads' | 'traffic' | 'awareness' | 'engagement';

interface KpiDef {
    key: string;
    label: string;
    fmt: (v: number) => string;
    color: string;
    bg: string;
    icon: React.ReactNode;
}

interface ObjectiveConfig {
    id: ObjectiveId;
    label: string;
    icon: React.ReactNode;
    color: string;
    metaObjectives: string[];
    kpis: KpiDef[];
    chartA: { key: string; label: string; color: string };
    chartB: { key: string; label: string; color: string };
}

const OBJECTIVES: ObjectiveConfig[] = [
    {
        id: 'messages',
        label: 'Mensagens / WhatsApp',
        icon: <MessageSquare size={15} />,
        color: '#25d366',
        metaObjectives: ['MESSAGES', 'OUTCOME_ENGAGEMENT'],
        kpis: [
            { key: 'spend',          label: 'Investimento',        fmt: fmtBRL, color: '#34d399', bg: 'rgba(16,185,129,.12)',   icon: <DollarSign size={17} /> },
            { key: 'messages',       label: 'Mensagens Iniciadas', fmt: fmtNum, color: '#25d366', bg: 'rgba(37,211,102,.12)',   icon: <MessageSquare size={17} /> },
            { key: 'costPerMessage', label: 'Custo por Mensagem',  fmt: fmtBRL, color: '#60a5fa', bg: 'rgba(59,130,246,.12)',   icon: <DollarSign size={17} /> },
            { key: 'clicks',         label: 'Cliques',             fmt: fmtNum, color: '#a78bfa', bg: 'rgba(139,92,246,.12)',   icon: <MousePointerClick size={17} /> },
            { key: 'impressions',    label: 'Impressões',          fmt: fmtNum, color: '#fbbf24', bg: 'rgba(245,158,11,.12)',   icon: <Eye size={17} /> },
            { key: 'cpm',            label: 'CPM',                 fmt: fmtBRL, color: '#fb923c', bg: 'rgba(249,115,22,.12)',   icon: <Activity size={17} /> },
        ],
        chartA: { key: 'messages', label: 'Mensagens', color: '#25d366' },
        chartB: { key: 'clicks',   label: 'Cliques',   color: '#6366f1' },
    },
    {
        id: 'conversions',
        label: 'Conversões / Vendas',
        icon: <ShoppingCart size={15} />,
        color: '#10b981',
        metaObjectives: ['CONVERSIONS', 'OUTCOME_SALES'],
        kpis: [
            { key: 'spend',              label: 'Investimento',          fmt: fmtBRL, color: '#34d399', bg: 'rgba(16,185,129,.12)',  icon: <DollarSign size={17} /> },
            { key: 'conversions',        label: 'Conversões',            fmt: fmtNum, color: '#10b981', bg: 'rgba(16,185,129,.12)',  icon: <Target size={17} /> },
            { key: 'costPerConversion',  label: 'Custo por Conversão',   fmt: fmtBRL, color: '#60a5fa', bg: 'rgba(59,130,246,.12)',  icon: <DollarSign size={17} /> },
            { key: 'roas',               label: 'ROAS',                  fmt: fmtX,   color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  icon: <TrendingUp size={17} /> },
            { key: 'ctr',                label: 'CTR',                   fmt: fmtPct, color: '#a78bfa', bg: 'rgba(139,92,246,.12)',  icon: <Activity size={17} /> },
            { key: 'cpc',                label: 'CPC',                   fmt: fmtBRL, color: '#fb923c', bg: 'rgba(249,115,22,.12)',  icon: <DollarSign size={17} /> },
        ],
        chartA: { key: 'conversions', label: 'Conversões', color: '#10b981' },
        chartB: { key: 'spend',       label: 'Gasto',      color: '#3b82f6' },
    },
    {
        id: 'leads',
        label: 'Geração de Leads',
        icon: <UserPlus size={15} />,
        color: '#3b82f6',
        metaObjectives: ['LEAD_GENERATION', 'OUTCOME_LEADS'],
        kpis: [
            { key: 'spend',             label: 'Investimento',  fmt: fmtBRL, color: '#34d399', bg: 'rgba(16,185,129,.12)',  icon: <DollarSign size={17} /> },
            { key: 'conversions',       label: 'Leads',         fmt: fmtNum, color: '#3b82f6', bg: 'rgba(59,130,246,.12)',  icon: <UserPlus size={17} /> },
            { key: 'costPerConversion', label: 'Custo por Lead', fmt: fmtBRL, color: '#60a5fa', bg: 'rgba(59,130,246,.12)', icon: <DollarSign size={17} /> },
            { key: 'ctr',               label: 'CTR',           fmt: fmtPct, color: '#a78bfa', bg: 'rgba(139,92,246,.12)', icon: <Activity size={17} /> },
            { key: 'cpm',               label: 'CPM',           fmt: fmtBRL, color: '#fbbf24', bg: 'rgba(245,158,11,.12)', icon: <Activity size={17} /> },
            { key: 'impressions',       label: 'Impressões',    fmt: fmtNum, color: '#fb923c', bg: 'rgba(249,115,22,.12)', icon: <Eye size={17} /> },
        ],
        chartA: { key: 'conversions', label: 'Leads',   color: '#3b82f6' },
        chartB: { key: 'clicks',      label: 'Cliques', color: '#6366f1' },
    },
    {
        id: 'traffic',
        label: 'Tráfego / Visitas',
        icon: <MousePointerClick size={15} />,
        color: '#8b5cf6',
        metaObjectives: ['LINK_CLICKS', 'OUTCOME_TRAFFIC'],
        kpis: [
            { key: 'spend',       label: 'Investimento', fmt: fmtBRL, color: '#34d399', bg: 'rgba(16,185,129,.12)',  icon: <DollarSign size={17} /> },
            { key: 'clicks',      label: 'Cliques',      fmt: fmtNum, color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', icon: <MousePointerClick size={17} /> },
            { key: 'cpc',         label: 'CPC',          fmt: fmtBRL, color: '#60a5fa', bg: 'rgba(59,130,246,.12)', icon: <DollarSign size={17} /> },
            { key: 'ctr',         label: 'CTR',          fmt: fmtPct, color: '#a78bfa', bg: 'rgba(139,92,246,.12)', icon: <Activity size={17} /> },
            { key: 'impressions', label: 'Impressões',   fmt: fmtNum, color: '#fbbf24', bg: 'rgba(245,158,11,.12)', icon: <Eye size={17} /> },
            { key: 'cpm',         label: 'CPM',          fmt: fmtBRL, color: '#fb923c', bg: 'rgba(249,115,22,.12)', icon: <Activity size={17} /> },
        ],
        chartA: { key: 'clicks',   label: 'Cliques',    color: '#8b5cf6' },
        chartB: { key: 'spend',    label: 'Gasto',      color: '#3b82f6' },
    },
    {
        id: 'awareness',
        label: 'Alcance / Awareness',
        icon: <Eye size={15} />,
        color: '#f59e0b',
        metaObjectives: ['REACH', 'BRAND_AWARENESS', 'OUTCOME_AWARENESS'],
        kpis: [
            { key: 'spend',       label: 'Investimento', fmt: fmtBRL, color: '#34d399', bg: 'rgba(16,185,129,.12)', icon: <DollarSign size={17} /> },
            { key: 'impressions', label: 'Impressões',   fmt: fmtNum, color: '#f59e0b', bg: 'rgba(245,158,11,.12)', icon: <Eye size={17} /> },
            { key: 'reach',       label: 'Alcance',      fmt: fmtNum, color: '#60a5fa', bg: 'rgba(59,130,246,.12)', icon: <Radio size={17} /> },
            { key: 'frequency',   label: 'Frequência',   fmt: v => v.toFixed(2), color: '#a78bfa', bg: 'rgba(139,92,246,.12)', icon: <Activity size={17} /> },
            { key: 'cpm',         label: 'CPM',          fmt: fmtBRL, color: '#fb923c', bg: 'rgba(249,115,22,.12)', icon: <Activity size={17} /> },
            { key: 'ctr',         label: 'CTR',          fmt: fmtPct, color: '#fbbf24', bg: 'rgba(245,158,11,.12)', icon: <TrendingUp size={17} /> },
        ],
        chartA: { key: 'impressions', label: 'Impressões', color: '#f59e0b' },
        chartB: { key: 'reach',       label: 'Alcance',    color: '#3b82f6' },
    },
    {
        id: 'engagement',
        label: 'Engajamento',
        icon: <Heart size={15} />,
        color: '#ec4899',
        metaObjectives: ['ENGAGEMENT', 'POST_ENGAGEMENT', 'VIDEO_VIEWS', 'OUTCOME_ENGAGEMENT'],
        kpis: [
            { key: 'spend',       label: 'Investimento', fmt: fmtBRL, color: '#34d399', bg: 'rgba(16,185,129,.12)', icon: <DollarSign size={17} /> },
            { key: 'conversions', label: 'Engajamentos', fmt: fmtNum, color: '#ec4899', bg: 'rgba(236,72,153,.12)', icon: <Heart size={17} /> },
            { key: 'cpm',         label: 'CPM',          fmt: fmtBRL, color: '#60a5fa', bg: 'rgba(59,130,246,.12)', icon: <Activity size={17} /> },
            { key: 'impressions', label: 'Impressões',   fmt: fmtNum, color: '#fbbf24', bg: 'rgba(245,158,11,.12)', icon: <Eye size={17} /> },
            { key: 'clicks',      label: 'Cliques',      fmt: fmtNum, color: '#a78bfa', bg: 'rgba(139,92,246,.12)', icon: <MousePointerClick size={17} /> },
            { key: 'ctr',         label: 'CTR',          fmt: fmtPct, color: '#fb923c', bg: 'rgba(249,115,22,.12)', icon: <TrendingUp size={17} /> },
        ],
        chartA: { key: 'conversions', label: 'Engajamentos', color: '#ec4899' },
        chartB: { key: 'impressions', label: 'Impressões',   color: '#f59e0b' },
    },
];

// Map Meta API objective strings → our ObjectiveId
const OBJECTIVE_MAP: Record<string, ObjectiveId> = {
    MESSAGES:            'messages',
    OUTCOME_ENGAGEMENT:  'messages',   // Meta often uses this for WhatsApp click objectives
    CONVERSIONS:         'conversions',
    OUTCOME_SALES:       'conversions',
    LEAD_GENERATION:     'leads',
    OUTCOME_LEADS:       'leads',
    LINK_CLICKS:         'traffic',
    OUTCOME_TRAFFIC:     'traffic',
    REACH:               'awareness',
    BRAND_AWARENESS:     'awareness',
    OUTCOME_AWARENESS:   'awareness',
    ENGAGEMENT:          'engagement',
    POST_ENGAGEMENT:     'engagement',
    VIDEO_VIEWS:         'engagement',
    OUTCOME_APP_PROMOTION: 'traffic',
    APP_INSTALLS:        'traffic',
};

function detectObjective(campaigns: any[]): ObjectiveId {
    const counts: Record<string, number> = {};
    for (const c of campaigns) {
        if (!c.objective) continue;
        const mapped = OBJECTIVE_MAP[c.objective.toUpperCase()] || 'conversions';
        counts[mapped] = (counts[mapped] || 0) + (c.status === 'ACTIVE' ? 2 : 1);
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return (best?.[0] as ObjectiveId) || 'conversions';
}

// ─── Stats type ────────────────────────────────────────────────────────────

interface DashStats {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    conversions: number;
    costPerConversion: number;
    roas: number;
    messages: number;
    costPerMessage: number;
}

const EMPTY_STATS: DashStats = {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    ctr: 0, cpc: 0, cpm: 0, frequency: 0,
    conversions: 0, costPerConversion: 0, roas: 0,
    messages: 0, costPerMessage: 0,
};

const tooltipStyle = {
    contentStyle: { background: '#141928', border: '1px solid #1e2744', borderRadius: '10px', color: '#eef2ff', fontSize: '12.5px', boxShadow: '0 8px 24px rgba(0,0,0,.5)' },
    labelStyle: { color: '#94a3b8', marginBottom: '4px', fontWeight: 600 },
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [user, setUser]           = useState<any>(null);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [stats, setStats]         = useState<DashStats>(EMPTY_STATS);
    const [chartData, setChartData] = useState<any[]>([]);
    const [alerts, setAlerts]       = useState<any[]>([]);
    const [loading, setLoading]     = useState(true);
    const [syncing, setSyncing]     = useState(false);
    const [objective, setObjective] = useState<ObjectiveId>('conversions');
    const [objectiveAuto, setObjectiveAuto] = useState(true);
    const [showObjectivePicker, setShowObjectivePicker] = useState(false);

    // Date range
    const [presetId, setPresetId]   = useState('14d');
    const [dateRange, setDateRange] = useState<DateRange>(() => DATE_PRESETS.find(p => p.id === '14d')!.range());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [customSince, setCustomSince] = useState(dateRange.since);
    const [customUntil, setCustomUntil] = useState(dateRange.until);

    const { selectedAccountId } = useAccount();

    useEffect(() => { loadDashboard(); }, [selectedAccountId, dateRange]);

    async function loadDashboard() {
        setLoading(true);
        try {
            const [userData, campaignsData] = await Promise.all([
                api.getMe(),
                api.getCampaigns(selectedAccountId || undefined),
            ]);
            setUser(userData);
            setCampaigns(campaignsData);

            // Auto-detect objective from campaigns
            const detected = detectObjective(campaignsData);
            if (objectiveAuto) setObjective(detected);

            // Aggregate insights — TODAS as campanhas (sem limite).
            // Métricas derivadas (CTR, CPC, CPM, ROAS) são calculadas dos TOTAIS,
            // não média de linhas diárias — assim batem com o Gerenciador da Meta.
            let totalSpend = 0, totalImpressions = 0, totalReach = 0, totalClicks = 0;
            let totalConversions = 0, totalMessages = 0;
            let reachWeightedFreqSum = 0; // frequência ponderada por alcance
            let purchaseValueSum = 0;     // para calcular ROAS real = receita / gasto
            const dailyData: Record<string, any> = {};

            // Busca insights de todas as campanhas em paralelo (com limite de concorrência simples).
            const CONCURRENCY = 8;
            async function fetchInsightsInParallel() {
                const results: any[] = [];
                for (let i = 0; i < campaignsData.length; i += CONCURRENCY) {
                    const batch = campaignsData.slice(i, i + CONCURRENCY);
                    const batchResults = await Promise.all(
                        batch.map(async (c: any) => {
                            try {
                                return await api.getInsights(c.id, 1000, dateRange.since, dateRange.until);
                            } catch { return []; }
                        })
                    );
                    results.push(...batchResults.flat());
                }
                return results;
            }

            const allInsights = await fetchInsightsInParallel();
            for (const insight of allInsights) {
                const sp = Number(insight.spend) || 0;
                const imp = Number(insight.impressions) || 0;
                const rch = Number(insight.reach) || 0;
                const clk = Number(insight.clicks) || 0;
                const cnv = Number(insight.conversions) || 0;

                totalSpend       += sp;
                totalImpressions += imp;
                totalReach       += rch;
                totalClicks      += clk;
                totalConversions += cnv;
                reachWeightedFreqSum += (Number(insight.frequency) || 0) * rch;

                // Valor de compra (purchase_value) via actions — se houver
                purchaseValueSum += extractAction(
                    insight.actions || [],
                    'omni_purchase_value',
                    'offsite_conversion.fb_pixel_purchase.value',
                );

                // Extract messaging actions
                totalMessages += extractAction(
                    insight.actions || [],
                    'onsite_conversion.messaging_conversation_started_7d',
                    'onsite_conversion.total_messaging_connection',
                    'onsite_conversion.messaging_first_reply',
                );

                // Daily chart aggregation
                const day = insight.date?.substring(0, 10);
                if (day) {
                    if (!dailyData[day]) dailyData[day] = {
                        date: day, spend: 0, clicks: 0, conversions: 0,
                        impressions: 0, reach: 0, messages: 0,
                    };
                    dailyData[day].spend       += sp;
                    dailyData[day].clicks      += clk;
                    dailyData[day].conversions += cnv;
                    dailyData[day].impressions += imp;
                    dailyData[day].reach       += rch;
                    dailyData[day].messages    += extractAction(
                        insight.actions || [],
                        'onsite_conversion.messaging_conversation_started_7d',
                        'onsite_conversion.total_messaging_connection',
                    );
                }
            }

            // Métricas derivadas corretas (iguais ao Gerenciador da Meta)
            const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
            const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
            const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
            const freq = totalReach > 0 ? reachWeightedFreqSum / totalReach : 0;
            const roas = totalSpend > 0 ? purchaseValueSum / totalSpend : 0;

            setStats({
                spend: totalSpend,
                impressions: totalImpressions,
                reach: totalReach,
                clicks: totalClicks,
                conversions: totalConversions,
                messages: totalMessages,
                ctr,
                cpc,
                cpm,
                roas,
                frequency: freq,
                costPerConversion: totalConversions > 0 ? totalSpend / totalConversions : 0,
                costPerMessage: totalMessages > 0 ? totalSpend / totalMessages : 0,
            });

            setChartData(
                Object.values(dailyData).sort((a: any, b: any) => a.date.localeCompare(b.date))
            );

            try {
                const alertData = await api.getAlerts();
                setAlerts(alertData.alerts?.slice(0, 5) || []);
            } catch { /* no alerts */ }

        } catch (err: any) {
            console.error('Dashboard load failed:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSync() {
        setSyncing(true);
        try {
            if (selectedAccountId) {
                // Sync specifically the selected account for the current date range
                await api.syncAccount(selectedAccountId, dateRange.since, dateRange.until);
            } else {
                await api.triggerSync();
            }
            await loadDashboard();
        } catch { } finally { setSyncing(false); }
    }

    function applyPreset(id: string) {
        const preset = DATE_PRESETS.find(p => p.id === id)!;
        const range = preset.range();
        setPresetId(id);
        setDateRange(range);
        setCustomSince(range.since);
        setCustomUntil(range.until);
        if (id !== 'custom') setShowDatePicker(false);
    }

    function applyCustom() {
        if (!customSince || !customUntil || customSince > customUntil) return;
        setDateRange({ since: customSince, until: customUntil });
        setShowDatePicker(false);
    }

    async function handleConnectMeta() {
        try {
            const data = await api.getMetaConnectUrl();
            window.location.href = data.url;
        } catch { }
    }

    function pickObjective(id: ObjectiveId) {
        setObjective(id);
        setObjectiveAuto(false);
        setShowObjectivePicker(false);
    }

    /* ── Loading skeleton ── */
    if (loading) {
        return (
            <div className="fade-in">
                <div className="page-header">
                    <div>
                        <div className="skeleton" style={{ width: '220px', height: '28px', marginBottom: '8px' }} />
                        <div className="skeleton" style={{ width: '280px', height: '15px' }} />
                    </div>
                </div>
                <div className="stats-grid">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="skeleton" style={{ height: '108px', borderRadius: '12px' }} />
                    ))}
                </div>
                <div className="grid-2">
                    {[1, 2].map(i => (
                        <div key={i} className="skeleton" style={{ height: '320px', borderRadius: '12px' }} />
                    ))}
                </div>
            </div>
        );
    }

    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
    const cfg = OBJECTIVES.find(o => o.id === objective) ?? OBJECTIVES[1];

    return (
        <div className="fade-in" onClick={() => { setShowObjectivePicker(false); setShowDatePicker(false); }}>

            {/* ── Header ── */}
            <div className="page-header">
                <div>
                    <h1>
                        {greeting()}
                        {user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
                    </h1>
                    <p>
                        {activeCampaigns.length > 0
                            ? `${activeCampaigns.length} campanha${activeCampaigns.length > 1 ? 's ativas' : ' ativa'} · ${labelForRange(dateRange.since, dateRange.until, presetId).toLowerCase()}`
                            : 'Visão geral das suas campanhas de tráfego pago'}
                    </p>
                </div>
                <div className="page-header-actions" style={{ alignItems: 'center', gap: '10px' }}>

                    {/* Date Range Picker */}
                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setShowDatePicker(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                                background: 'var(--bg-input)', border: '1px solid var(--border)',
                                color: 'var(--text)', fontSize: 13, fontWeight: 500,
                            }}
                        >
                            <CalendarDays size={14} style={{ color: 'var(--text-muted)' }} />
                            {labelForRange(dateRange.since, dateRange.until, presetId)}
                            <ChevronDown size={13} style={{ opacity: .5 }} />
                        </button>

                        {showDatePicker && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 300,
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 14, padding: 8, minWidth: 220,
                                boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 10px 8px', letterSpacing: '.4px', textTransform: 'uppercase' }}>
                                    Período
                                </div>
                                {DATE_PRESETS.filter(p => p.id !== 'custom').map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => applyPreset(p.id)}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left',
                                            padding: '9px 12px', borderRadius: 8, border: 'none',
                                            cursor: 'pointer', fontSize: 13,
                                            background: presetId === p.id ? 'rgba(99,102,241,.14)' : 'transparent',
                                            color: presetId === p.id ? '#a5b4fc' : 'var(--text)',
                                            fontWeight: presetId === p.id ? 600 : 400,
                                        }}
                                    >
                                        {p.label}
                                    </button>
                                ))}

                                {/* Custom date range */}
                                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 8, padding: '8px 10px 6px' }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '.3px' }}>PERSONALIZADO</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <input type="date" value={customSince} onChange={e => { setCustomSince(e.target.value); setPresetId('custom'); }}
                                            style={{ padding: '7px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                                        <input type="date" value={customUntil} onChange={e => { setCustomUntil(e.target.value); setPresetId('custom'); }}
                                            style={{ padding: '7px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                                        <button onClick={applyCustom} style={{ padding: '8px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                            Aplicar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Objective Picker */}
                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setShowObjectivePicker(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                                background: `${cfg.color}14`, border: `1px solid ${cfg.color}40`,
                                color: cfg.color, fontSize: 13, fontWeight: 600,
                            }}
                        >
                            {cfg.icon}
                            {cfg.label}
                            {objectiveAuto && (
                                <span style={{ fontSize: 10, background: `${cfg.color}25`, padding: '1px 6px', borderRadius: 10, fontWeight: 700, letterSpacing: '.3px' }}>AUTO</span>
                            )}
                            <ChevronDown size={13} style={{ opacity: .7 }} />
                        </button>

                        {showObjectivePicker && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 14, padding: 8, minWidth: 240,
                                boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 10px 8px', letterSpacing: '.4px', textTransform: 'uppercase' }}>
                                    Objetivo da Campanha
                                </div>
                                {OBJECTIVES.map(o => (
                                    <button
                                        key={o.id}
                                        onClick={() => pickObjective(o.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            width: '100%', padding: '9px 12px', borderRadius: 9,
                                            border: 'none', cursor: 'pointer', textAlign: 'left',
                                            background: objective === o.id ? `${o.color}14` : 'transparent',
                                            color: objective === o.id ? o.color : 'var(--text)',
                                            fontSize: 13, fontWeight: objective === o.id ? 600 : 400,
                                        }}
                                    >
                                        <span style={{ color: o.color }}>{o.icon}</span>
                                        {o.label}
                                        {objectiveAuto && objective === o.id && (
                                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>detectado</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {user && !user.meta_connected && (
                        <button className="btn btn-primary" onClick={handleConnectMeta}>
                            <LinkIcon size={15} /> Conectar Meta
                        </button>
                    )}
                    <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
                        <RefreshCw size={15} className={syncing ? 'spinning' : ''} />
                        {syncing ? 'Sincronizando…' : 'Sincronizar'}
                    </button>
                </div>
            </div>

            {/* ── Objective label strip ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 12, marginBottom: 22,
                background: `${cfg.color}0d`, border: `1px solid ${cfg.color}25`,
            }}>
                <span style={{ color: cfg.color }}>{cfg.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
                    — métricas adaptadas para este objetivo · {labelForRange(dateRange.since, dateRange.until, presetId).toLowerCase()}
                </span>
                {!objectiveAuto && (
                    <button
                        onClick={() => { setObjectiveAuto(true); setObjective(detectObjective(campaigns)); }}
                        style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        detectar automaticamente
                    </button>
                )}
            </div>

            {/* ── KPI Cards (objective-aware) ── */}
            <div className="stats-grid">
                {cfg.kpis.map(kpi => (
                    <div key={kpi.key} className="card stat-card" style={{ gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span className="stat-label">{kpi.label}</span>
                            <div className="stat-icon" style={{ background: kpi.bg, color: kpi.color }}>{kpi.icon}</div>
                        </div>
                        <span className="stat-value" style={{ color: kpi.color }}>
                            {kpi.fmt((stats as any)[kpi.key] ?? 0)}
                        </span>
                    </div>
                ))}
            </div>

            {/* ── Charts (objective-aware) ── */}
            <div className="grid-2" style={{ marginBottom: '24px' }}>
                {/* Primary trend chart */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BarChart3 size={15} color={cfg.color} />
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: 700 }}>Gasto Diário</span>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '3px 10px', borderRadius: '20px', fontWeight: 600 }}>{labelForRange(dateRange.since, dateRange.until, presetId)}</span>
                    </div>
                    <div style={{ height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                                <defs>
                                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.22} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,39,68,0.8)" vertical={false} />
                                <XAxis dataKey="date" stroke="#4f6080" fontSize={11} tickFormatter={v => v?.substring(5)} axisLine={false} tickLine={false} />
                                <YAxis stroke="#4f6080" fontSize={11} axisLine={false} tickLine={false} width={38} />
                                <Tooltip {...tooltipStyle} cursor={{ stroke: 'rgba(59,130,246,0.15)', strokeWidth: 24 }} />
                                <Area type="monotone" dataKey="spend" name="Gasto (R$)" stroke="#3b82f6" fill="url(#spendGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Secondary chart (objective-specific) */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Activity size={15} color={cfg.color} />
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: 700 }}>{cfg.chartA.label} & {cfg.chartB.label}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {[cfg.chartA, cfg.chartB].map(l => (
                                <span key={l.key} style={{ fontSize: '11.5px', color: l.color, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: l.color, display: 'inline-block' }} />
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div style={{ height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,39,68,0.8)" vertical={false} />
                                <XAxis dataKey="date" stroke="#4f6080" fontSize={11} tickFormatter={v => v?.substring(5)} axisLine={false} tickLine={false} />
                                <YAxis stroke="#4f6080" fontSize={11} axisLine={false} tickLine={false} width={38} />
                                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.025)' }} />
                                <Bar dataKey={cfg.chartA.key} name={cfg.chartA.label} fill={cfg.chartA.color} radius={[3, 3, 0, 0]} maxBarSize={24} />
                                <Bar dataKey={cfg.chartB.key} name={cfg.chartB.label} fill={cfg.chartB.color} radius={[3, 3, 0, 0]} maxBarSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ── Campaigns + Alerts ── */}
            <div className="grid-2">
                {/* Campaigns */}
                <div className="card" style={{ padding: '20px' }}>
                    <div className="section-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="section-title">Campanhas</span>
                            {campaigns.length > 0 && (
                                <span style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' }}>
                                    {campaigns.length}
                                </span>
                            )}
                        </div>
                        {activeCampaigns.length > 0 && (
                            <span style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 600 }}>
                                {activeCampaigns.length} ativa{activeCampaigns.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {campaigns.length === 0 ? (
                        <div className="empty-state" style={{ padding: '40px 20px' }}>
                            <div className="empty-state-icon"><AlertTriangle size={22} /></div>
                            <h3>Nenhuma campanha</h3>
                            <p>Conecte sua conta Meta para ver campanhas</p>
                        </div>
                    ) : (
                        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Campanha</th>
                                        <th>Status</th>
                                        <th>Objetivo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaigns.slice(0, 8).map(c => {
                                        const objId = c.objective ? OBJECTIVE_MAP[c.objective.toUpperCase()] : undefined;
                                        const objCfg = objId ? OBJECTIVES.find(o => o.id === objId) : undefined;
                                        return (
                                            <tr key={c.id}>
                                                <td style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: '180px' }} className="truncate">
                                                    {c.name}
                                                </td>
                                                <td>
                                                    <span className={`badge ${c.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`}>
                                                        {c.status === 'ACTIVE' ? 'Ativo' : c.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    {objCfg ? (
                                                        <span style={{ fontSize: '12px', color: objCfg.color, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                                                            {objCfg.icon} {objCfg.label}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{c.objective || '—'}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Alerts */}
                <div className="card" style={{ padding: '20px' }}>
                    <div className="section-header">
                        <span className="section-title">Alertas Recentes</span>
                        {alerts.length > 0 && (
                            <span style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                {alerts.length}
                            </span>
                        )}
                    </div>

                    {alerts.length === 0 ? (
                        <div className="empty-state" style={{ padding: '40px 20px' }}>
                            <div className="empty-state-icon" style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)', color: 'var(--accent-green)' }}>
                                <Activity size={22} />
                            </div>
                            <h3>Tudo certo</h3>
                            <p>Nenhum alerta no momento</p>
                        </div>
                    ) : (
                        alerts.map(alert => (
                            <div key={alert.id} className={`alert-item ${!alert.is_read ? 'unread' : ''}`}>
                                <div className={`alert-icon ${alert.severity}`}>
                                    <Activity size={16} />
                                </div>
                                <div className="alert-content">
                                    <div className="alert-title">{alert.title}</div>
                                    <div className="alert-message">{alert.message?.substring(0, 90)}…</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
