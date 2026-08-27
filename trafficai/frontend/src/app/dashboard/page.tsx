'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

function periodTitle() {
    // Dashboard não precisa de cumprimento — título sóbrio, sem emoji, sem "!".
    return 'Visão geral';
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
        chartB: { key: 'clicks',   label: 'Cliques',   color: '#ff6b35' },
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
        chartB: { key: 'clicks',      label: 'Cliques', color: '#ff6b35' },
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

/** Métricas cujo aumento é RUIM (comparação de período inverte a cor do delta). */
const LOWER_IS_BETTER = new Set(['costPerConversion', 'costPerMessage', 'cpc', 'cpm']);
/** Métricas cujo delta não é "bom/ruim" — só informativo (cinza). */
const NEUTRAL_DELTA = new Set(['spend', 'frequency']);

function pctChange(curr: number, prev: number): number | null {
    if (!prev) return null; // sem base de comparação (0 ou período anterior sem dado)
    return ((curr - prev) / prev) * 100;
}

/**
 * Soma spend/impressions/reach/clicks/conversions/messages de todas as campanhas
 * num período — mesma lógica usada pro período atual, reaproveitada pro período
 * anterior (comparação de delta). Não faz mais requisições que o dashboard já fazia:
 * dobra a chamada de insights (uma vez por período), não por campanha adicional.
 */
async function aggregateForRange(campaignsData: any[], since: string, until: string): Promise<DashStats> {
    let totalSpend = 0, totalImpressions = 0, totalReach = 0, totalClicks = 0;
    let totalConversions = 0, totalMessages = 0;
    let reachWeightedFreqSum = 0;
    let purchaseValueSum = 0;

    const CONCURRENCY = 8;
    const allInsights: any[] = [];
    for (let i = 0; i < campaignsData.length; i += CONCURRENCY) {
        const batch = campaignsData.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map(async (c: any) => {
                try { return await api.getInsights(c.id, 1000, since, until); } catch { return []; }
            })
        );
        allInsights.push(...batchResults.flat());
    }

    for (const insight of allInsights) {
        const sp = Number(insight.spend) || 0;
        const imp = Number(insight.impressions) || 0;
        const rch = Number(insight.reach) || 0;
        const clk = Number(insight.clicks) || 0;
        const cnv = Number(insight.conversions) || 0;

        totalSpend += sp;
        totalImpressions += imp;
        totalReach += rch;
        totalClicks += clk;
        totalConversions += cnv;
        reachWeightedFreqSum += (Number(insight.frequency) || 0) * rch;

        purchaseValueSum += extractAction(
            insight.actions || [],
            'omni_purchase_value',
            'offsite_conversion.fb_pixel_purchase.value',
        );
        totalMessages += extractAction(
            insight.actions || [],
            'onsite_conversion.messaging_conversation_started_7d',
            'onsite_conversion.total_messaging_connection',
            'onsite_conversion.messaging_first_reply',
        );
    }

    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
    const freq = totalReach > 0 ? reachWeightedFreqSum / totalReach : 0;
    const roas = totalSpend > 0 ? purchaseValueSum / totalSpend : 0;

    return {
        spend: totalSpend,
        impressions: totalImpressions,
        reach: totalReach,
        clicks: totalClicks,
        conversions: totalConversions,
        messages: totalMessages,
        ctr, cpc, cpm, roas,
        frequency: freq,
        costPerConversion: totalConversions > 0 ? totalSpend / totalConversions : 0,
        costPerMessage: totalMessages > 0 ? totalSpend / totalMessages : 0,
    };
}

/** Período imediatamente anterior, com a mesma duração do período selecionado. */
function previousRange(range: DateRange): DateRange {
    const since = new Date(range.since + 'T00:00:00');
    const until = new Date(range.until + 'T00:00:00');
    const days = Math.round((until.getTime() - since.getTime()) / 86400000) + 1;
    const prevUntil = new Date(since); prevUntil.setDate(prevUntil.getDate() - 1);
    const prevSince = new Date(prevUntil); prevSince.setDate(prevSince.getDate() - (days - 1));
    return { since: toISO(prevSince), until: toISO(prevUntil) };
}

const tooltipStyle = {
    contentStyle: {
        background: '#151a28',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#e6eaf5',
        fontSize: 12.5,
        padding: '8px 10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    },
    labelStyle: { color: '#a1a9ba', marginBottom: 2, fontWeight: 500, fontSize: 11.5 },
    itemStyle: { color: '#e6eaf5' },
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [user, setUser]           = useState<any>(null);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [stats, setStats]         = useState<DashStats>(EMPTY_STATS);
    const [prevStats, setPrevStats] = useState<DashStats | null>(null);
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
                setAlerts(alertData.alerts || []);
            } catch { /* no alerts */ }

            // Período anterior (mesma duração) — só pra comparação de delta nos KPIs,
            // não precisa do detalhamento diário (chart), por isso não duplica o
            // dailyData nem o número de campanhas — é a mesma lista já carregada.
            try {
                const prevRange = previousRange(dateRange);
                const prev = await aggregateForRange(campaignsData, prevRange.since, prevRange.until);
                setPrevStats(prev);
            } catch { setPrevStats(null); }

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

    // Campanhas com alerta não lido — mesmos sinais que já alimentam a página de
    // Alertas, só resumidos aqui em cima (não duplica lógica, só reagrupa por campanha).
    const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const attentionItems = (() => {
        const byCampaign = new Map<string, any>();
        for (const a of alerts) {
            if (a.is_read || !a.campaign_id) continue;
            const existing = byCampaign.get(a.campaign_id);
            if (!existing || SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[existing.severity]) {
                byCampaign.set(a.campaign_id, a);
            }
        }
        return Array.from(byCampaign.values())
            .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
            .slice(0, 5);
    })();

    return (
        <div className="fade-in" onClick={() => { setShowObjectivePicker(false); setShowDatePicker(false); }}>

            {/* ── Header ── */}
            <div className="page-header">
                <div>
                    <h1>{periodTitle()}</h1>
                    <p>
                        {user?.name ? `Olá, ${user.name.split(' ')[0]}. ` : ''}
                        {activeCampaigns.length > 0
                            ? `${activeCampaigns.length} campanha${activeCampaigns.length > 1 ? 's ativas' : ' ativa'} · ${labelForRange(dateRange.since, dateRange.until, presetId).toLowerCase()}`
                            : 'Conecte sua conta Meta para ver os dados.'}
                    </p>
                </div>
                <div className="page-header-actions">
                    {/* Objective picker */}
                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setShowObjectivePicker(v => !v)}
                            className="btn btn-secondary btn-sm"
                            type="button"
                        >
                            {cfg.icon}
                            <span>{cfg.label}</span>
                            {objectiveAuto && (
                                <span style={{ fontSize: 10, background: 'var(--primary-soft)', color: 'var(--primary)', padding: '1px 5px', borderRadius: 4, fontWeight: 600, letterSpacing: '.3px' }}>AUTO</span>
                            )}
                            <ChevronDown size={12} style={{ opacity: 0.6 }} />
                        </button>

                        {showObjectivePicker && (
                            <div className="dropdown-menu">
                                <div className="dropdown-section-label">Objetivo</div>
                                {OBJECTIVES.map(o => (
                                    <button
                                        key={o.id}
                                        onClick={() => pickObjective(o.id)}
                                        className={`dropdown-item ${objective === o.id ? 'active' : ''}`}
                                        type="button"
                                    >
                                        <span style={{ color: objective === o.id ? 'var(--primary)' : 'var(--text-muted)', display: 'inline-flex' }}>{o.icon}</span>
                                        <span>{o.label}</span>
                                        {objectiveAuto && objective === o.id && (
                                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>detectado</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Date Range Picker */}
                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setShowDatePicker(v => !v)}
                            className="btn btn-secondary btn-sm"
                            type="button"
                        >
                            <CalendarDays size={13} />
                            {labelForRange(dateRange.since, dateRange.until, presetId)}
                            <ChevronDown size={12} style={{ opacity: 0.6 }} />
                        </button>

                        {showDatePicker && (
                            <div className="dropdown-menu">
                                <div className="dropdown-section-label">Período</div>
                                {DATE_PRESETS.filter(p => p.id !== 'custom').map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => applyPreset(p.id)}
                                        className={`dropdown-item ${presetId === p.id ? 'active' : ''}`}
                                        type="button"
                                    >
                                        {p.label}
                                    </button>
                                ))}

                                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 10, padding: '10px 10px 4px' }}>
                                    <div className="dropdown-section-label" style={{ padding: 0, marginBottom: 6 }}>Personalizado</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <input type="date" value={customSince} onChange={e => { setCustomSince(e.target.value); setPresetId('custom'); }} className="form-input" style={{ minHeight: 32, padding: '6px 10px', fontSize: 12 }} />
                                        <input type="date" value={customUntil} onChange={e => { setCustomUntil(e.target.value); setPresetId('custom'); }} className="form-input" style={{ minHeight: 32, padding: '6px 10px', fontSize: 12 }} />
                                        <button onClick={applyCustom} className="btn btn-primary btn-sm" type="button">Aplicar</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {user && !user.meta_connected && (
                        <button className="btn btn-primary btn-sm" onClick={handleConnectMeta} type="button">
                            <LinkIcon size={13} /> Conectar Meta
                        </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing} type="button">
                        <RefreshCw size={13} className={syncing ? 'spinning' : ''} />
                        {syncing ? 'Sincronizando' : 'Sincronizar'}
                    </button>
                </div>
            </div>

            {/* ── Precisa de atenção ── */}
            {attentionItems.length > 0 && (
                <Link href="/alerts" className="card" style={{
                    display: 'block', textDecoration: 'none', color: 'inherit', marginBottom: 20,
                    borderLeft: '3px solid #ef4444',
                }}>
                    <div className="section-header" style={{ marginBottom: 12 }}>
                        <span className="section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={15} color="#ef4444" />
                            Precisa de atenção
                        </span>
                        <span className="section-subtitle">ver todos os alertas →</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {attentionItems.map(a => (
                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                                <span style={{
                                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                    background: a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6',
                                }} />
                                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{a.campaign_name || 'Conta'}</span>
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                            </div>
                        ))}
                    </div>
                </Link>
            )}

            {/* ── KPI Cards (objective-aware) ── */}
            <div className="stats-grid">
                {cfg.kpis.map(kpi => {
                    const curr = (stats as any)[kpi.key] ?? 0;
                    const prev = prevStats ? (prevStats as any)[kpi.key] ?? 0 : null;
                    const delta = prevStats ? pctChange(curr, prev) : null;
                    const isNeutral = NEUTRAL_DELTA.has(kpi.key);
                    const isGood = delta == null ? null : (LOWER_IS_BETTER.has(kpi.key) ? delta < 0 : delta > 0);
                    return (
                        <div key={kpi.key} className="card stat-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <span className="stat-label">{kpi.label}</span>
                                <div className="stat-icon">{kpi.icon}</div>
                            </div>
                            <span className="stat-value">
                                {kpi.fmt(curr)}
                            </span>
                            {delta != null && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4,
                                    fontSize: 11.5, fontWeight: 600,
                                    color: isNeutral ? 'var(--text-muted)' : isGood ? '#22c55e' : '#ef4444',
                                }}>
                                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(1)}%
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs. período anterior</span>
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Charts ── */}
            <div className="grid-2" style={{ marginBottom: 20 }}>
                {/* Gasto diário */}
                <div className="card">
                    <div className="section-header">
                        <span className="section-title">Gasto diário</span>
                        <span className="section-subtitle">{labelForRange(dateRange.since, dateRange.until, presetId)}</span>
                    </div>
                    <div style={{ height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                                <defs>
                                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%"   stopColor="#ff6b35" stopOpacity={0.28} />
                                        <stop offset="100%" stopColor="#ff6b35" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="date" stroke="#6b7388" fontSize={11} tickFormatter={v => v?.substring(5)} axisLine={false} tickLine={false} />
                                <YAxis stroke="#6b7388" fontSize={11} axisLine={false} tickLine={false} width={38} />
                                <Tooltip {...tooltipStyle} cursor={{ stroke: 'rgba(255, 107, 53,0.18)', strokeWidth: 24 }} />
                                <Area type="monotone" dataKey="spend" name="Gasto (R$)" stroke="#ff6b35" fill="url(#spendGrad)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#ff6b35', strokeWidth: 0 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Performance */}
                <div className="card">
                    <div className="section-header">
                        <span className="section-title">{cfg.chartA.label} &amp; {cfg.chartB.label}</span>
                        <div style={{ display: 'flex', gap: 12 }}>
                            {[cfg.chartA, cfg.chartB].map(l => (
                                <span key={l.key} style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div style={{ height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="date" stroke="#6b7388" fontSize={11} tickFormatter={v => v?.substring(5)} axisLine={false} tickLine={false} />
                                <YAxis stroke="#6b7388" fontSize={11} axisLine={false} tickLine={false} width={38} />
                                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                                <Bar dataKey={cfg.chartA.key} name={cfg.chartA.label} fill={cfg.chartA.color} radius={[2, 2, 0, 0]} maxBarSize={22} />
                                <Bar dataKey={cfg.chartB.key} name={cfg.chartB.label} fill={cfg.chartB.color} radius={[2, 2, 0, 0]} maxBarSize={22} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ── Campaigns + Alerts ── */}
            <div className="grid-2">
                {/* Campaigns */}
                <div className="card">
                    <div className="section-header">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span className="section-title">Campanhas</span>
                            {campaigns.length > 0 && (
                                <span className="badge badge-gray">{campaigns.length}</span>
                            )}
                        </div>
                        {activeCampaigns.length > 0 && (
                            <span className="section-subtitle">
                                {activeCampaigns.length} ativa{activeCampaigns.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {campaigns.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon"><AlertTriangle size={20} /></div>
                            <h3>Nenhuma campanha</h3>
                            <p>Conecte sua conta Meta para ver campanhas</p>
                        </div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
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
                                                <td style={{ fontWeight: 500, color: 'var(--text-primary)', maxWidth: 200 }} className="truncate">
                                                    {c.name}
                                                </td>
                                                <td>
                                                    <span className={`badge ${c.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`}>
                                                        {c.status === 'ACTIVE' ? 'Ativo' : c.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    {objCfg ? (
                                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                                            <span style={{ color: objCfg.color, display: 'inline-flex' }}>{objCfg.icon}</span>
                                                            {objCfg.label}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{c.objective || '—'}</span>
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
                <div className="card">
                    <div className="section-header">
                        <span className="section-title">Alertas recentes</span>
                        {alerts.length > 0 && <span className="badge badge-red">{alerts.length}</span>}
                    </div>

                    {alerts.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon" style={{ color: 'var(--accent-green)' }}>
                                <Activity size={20} />
                            </div>
                            <h3>Tudo certo</h3>
                            <p>Nenhum alerta no momento</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {alerts.slice(0, 5).map(alert => (
                                <div key={alert.id} className={`alert-item ${!alert.is_read ? 'unread' : ''}`}>
                                    <div className={`alert-icon ${alert.severity}`}>
                                        <Activity size={14} />
                                    </div>
                                    <div className="alert-content">
                                        <div className="alert-title">{alert.title}</div>
                                        <div className="alert-message">{alert.message?.substring(0, 90)}…</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
