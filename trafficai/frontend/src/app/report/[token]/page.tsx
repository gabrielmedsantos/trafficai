'use client';

// Página pública do relatório — acessível pelo cliente sem login
// URL: /report/:token

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// ─── Paleta lime (nova) ────────────────────────────────────────────────
const C = {
  bg: '#0a0e1a',
  card: '#111726',
  cardHover: '#151b2e',
  border: '#1e2942',
  borderHover: '#2b3a5e',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  primary: '#d3f100',       // lime
  primaryDark: '#a3d900',
  primaryGlow: 'rgba(211,241,0,.18)',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#38bdf8',
  purple: '#8b5cf6',
};

interface AdData {
  ad_id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks?: number;
  reach?: number;
  frequency?: number;
  conversions: number;
  action_label: string;
  action_singular: string;
  ctr: number;
  cpc: number;
  roas: number;
  cpa: number;
  hook_rate: number | null;
  thumbnail_url?: string;
  is_video?: boolean;
  watch_url?: string;
}

interface ReportMetrics {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  primary_action_label?: string;
  avg_ctr: number;
  avg_cpc: number;
  avg_cpm: number;
  avg_roas: number;
  avg_frequency: number;
  cost_per_conversion: number;
  campaigns_active: number;
  spend_change_pct: number | null;
  conversions_change_pct: number | null;
  roas_change_pct: number | null;
  cpa_change_pct: number | null;
  top_campaigns: Array<{
    id?: string;
    meta_campaign_id?: string;
    name: string;
    spend: number;
    conversions: number;
    roas: number;
    ctr: number;
    status: string;
    objective?: string;
    breakdowns?: {
      publisher_platform?: BreakdownRow[];
      platform_position?: BreakdownRow[];
      impression_device?: BreakdownRow[];
      age_gender?: Array<BreakdownRow & { age: string; gender: string }>;
      region?: BreakdownRow[];
    };
  }>;
  top_ads?: AdData[];
  daily_breakdown: Array<{ date: string; spend: number; conversions: number; clicks: number }>;
  breakdowns?: {
    publisher_platform?: BreakdownRow[];
    platform_position?: BreakdownRow[];
    impression_device?: BreakdownRow[];
    age_gender?: Array<BreakdownRow & { age: string; gender: string }>;
    region?: BreakdownRow[];
  };
}

interface BreakdownRow {
  label: string;
  spend: number;
  impressions: number;
  conversions: number;
}

interface Report {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  title: string;
  summary: string;
  metrics: ReportMetrics;
  ai_analysis: string;
  edited_analysis: string | null;
  recommendations: string[];
  edited_recommendations: string[] | null;
  custom_note: string | null;
  selected_campaign_ids: string[] | null;
  show_campaign_table: boolean;
  show_ai_analysis: boolean;
  client_name: string | null;
  account_name: string;
  currency: string;
  created_at: string;
}

function PublicReportPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/reports/public/${token}`)
      .then(r => r.json())
      .then(result => {
        if (result.success) setReport(result.data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (report && searchParams?.get('print') === '1') {
      setTimeout(() => window.print(), 800);
    }
  }, [report, searchParams]);

  if (loading) {
    return (
      <div style={fullCenter}>
        <div style={{ textAlign: 'center', color: C.textMuted }}>
          <div style={logoMark}><LogoSvg size={20} /></div>
          <div style={{ marginTop: 16, fontSize: 14 }}>Carregando relatório…</div>
          <div style={{ width: 24, height: 24, border: `2.5px solid ${C.border}`, borderTopColor: C.primary, borderRadius: '50%', margin: '14px auto 0', animation: 'spin 0.75s linear infinite' }} />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={fullCenter}>
        <div style={{ textAlign: 'center', color: C.textMuted }}>
          <div style={logoMark}><LogoSvg size={20} /></div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 16, marginBottom: 6, color: C.text }}>Relatório não encontrado</h1>
          <p style={{ fontSize: 14, color: C.textDim }}>Este link pode ter expirado ou é inválido.</p>
        </div>
      </div>
    );
  }

  const m = report.metrics;
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: report.currency || 'BRL' }).format(v);
  const fmtNum = (v: number) => v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toLocaleString('pt-BR');
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const typeLabel = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' }[report.type];
  const actionLabel = m.primary_action_label || 'Conversões';
  const actionSingular: Record<string, string> = {
    'Mensagens': 'Mensagem', 'Compras': 'Compra', 'Leads': 'Lead', 'Cadastros': 'Cadastro',
    'Engajamentos': 'Engajamento', 'Cliques no link': 'Clique', 'Visualizações de vídeo': 'Visualização',
    'Conversões': 'Conversão',
  };
  const cpaLabel = `Custo por ${actionSingular[actionLabel] || actionLabel}`;
  const daysCount = Math.max(1, Math.round((new Date(report.period_end).getTime() - new Date(report.period_start).getTime()) / 86400000) + 1);

  const changeBadge = (pct: number | null | undefined, invert = false) => {
    if (pct === null || pct === undefined) return null;
    const good = invert ? pct < 0 : pct >= 0;
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '·';
    return (
      <span style={{
        fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 10,
        background: good ? 'rgba(34,197,94,.13)' : 'rgba(239,68,68,.13)',
        color: good ? C.green : C.red,
        border: `1px solid ${good ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
      }}>{arrow} {Math.abs(pct).toFixed(1)}%</span>
    );
  };

  const recommendations: string[] = Array.isArray(report.edited_recommendations) && report.edited_recommendations.length > 0
    ? report.edited_recommendations
    : (Array.isArray(report.recommendations) ? report.recommendations : []);

  const visibleCampaigns = report.selected_campaign_ids
    ? m.top_campaigns.filter(c => c.id && report.selected_campaign_ids!.includes(c.id))
    : m.top_campaigns;

  // Ranking por performance (relatórios antigos foram salvos ordenados por spend):
  // quem tem resultado ordena por CPA asc; sem resultado vai pro fim por spend desc
  const topAds = [...(m.top_ads || [])].sort((a, b) => {
    const ac = a.conversions || 0, bc = b.conversions || 0;
    if (ac > 0 && bc > 0) return (a.cpa || 0) - (b.cpa || 0);
    if (ac > 0) return -1;
    if (bc > 0) return 1;
    return b.spend - a.spend;
  });
  // Fallback pro nome quando o relatório é antigo e não tem is_video salvo ainda.
  const isVideoAd = (ad: AdData) => ad.is_video ?? /video|vídeo|reel/i.test(ad.name);
  const staticAds = topAds.filter(ad => !isVideoAd(ad));
  const videoAds = topAds.filter(ad => isVideoAd(ad));

  const typeStats = (ads: AdData[]) => {
    const results = ads.reduce((s, a) => s + (a.conversions || 0), 0);
    const spend = ads.reduce((s, a) => s + a.spend, 0);
    return { count: ads.length, spend, results, cpa: results > 0 ? spend / results : 0 };
  };
  const allResults = topAds.reduce((s, a) => s + (a.conversions || 0), 0);
  const staticStats = typeStats(staticAds);
  const videoStats = typeStats(videoAds);

  // Insights automáticos
  const insights: string[] = [];
  if (visibleCampaigns.length > 0) {
    const best = [...visibleCampaigns].sort((a, b) => b.conversions - a.conversions)[0];
    if (best.conversions > 0) insights.push(`Melhor campanha: "${best.name}" com ${best.conversions} ${actionLabel.toLowerCase()}.`);
  }
  if (topAds.length > 0) {
    const bestAd = [...topAds].filter(a => a.cpa > 0).sort((a, b) => a.cpa - b.cpa)[0];
    if (bestAd) insights.push(`Criativo mais eficiente: "${bestAd.name}" com CPA de ${fmt(bestAd.cpa)}.`);
  }
  if (m.spend_change_pct !== null && m.spend_change_pct !== undefined && Math.abs(m.spend_change_pct) >= 10) {
    insights.push(`Investimento ${m.spend_change_pct > 0 ? 'cresceu' : 'reduziu'} ${Math.abs(m.spend_change_pct).toFixed(1)}% vs. período anterior.`);
  }
  if (m.conversions_change_pct !== null && m.conversions_change_pct !== undefined && Math.abs(m.conversions_change_pct) >= 15) {
    insights.push(`${actionLabel} ${m.conversions_change_pct > 0 ? 'cresceram' : 'caíram'} ${Math.abs(m.conversions_change_pct).toFixed(1)}% vs. período anterior.`);
  }
  if (m.avg_ctr >= 2) insights.push(`CTR de ${m.avg_ctr.toFixed(2)}% está acima da média de mercado (1,5–2%).`);
  if (staticStats.results > 0 && videoStats.results > 0) {
    const winner = staticStats.cpa < videoStats.cpa ? 'estáticos' : 'em vídeo';
    insights.push(`Criativos ${winner} têm melhor custo-benefício neste período.`);
  }

  // Distribuição por objetivo (baseado em campanhas)
  const objMap = new Map<string, number>();
  for (const c of visibleCampaigns) {
    const key = mapObjective(c.objective || actionLabel);
    objMap.set(key, (objMap.get(key) || 0) + c.spend);
  }
  const totalObjSpend = Array.from(objMap.values()).reduce((s, v) => s + v, 0);
  const objDist = Array.from(objMap.entries())
    .map(([label, spend]) => ({ label, spend, pct: totalObjSpend > 0 ? (spend / totalObjSpend) * 100 : 0 }))
    .sort((a, b) => b.spend - a.spend);
  const OBJ_COLORS = [C.primary, C.blue, C.purple, C.amber, '#ec4899', '#14b8a6'];

  const analysisText = report.edited_analysis || report.ai_analysis;
  const maxCpa = Math.max(...topAds.map(a => a.cpa || 0), 1);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', -apple-system, sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.borderHover}; }
        .kpi-card, .card, .rec-card { transition: transform .15s, border-color .15s; }
        .kpi-card:hover, .card:hover { border-color: ${C.borderHover}; }
        .rec-card:hover { transform: translateY(-2px); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: ${C.bg} !important; }
          a { text-decoration: none !important; }
        }
      `}</style>

      {/* ═══ HERO ═══ */}
      <div style={{
        background: `linear-gradient(135deg, #0a0e1a 0%, #131a2e 40%, #0a0e1a 100%)`,
        padding: '56px 24px 48px', borderBottom: `1px solid ${C.border}`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -120, right: -80, width: 380, height: 380, background: `radial-gradient(circle, ${C.primaryGlow} 0%, transparent 65%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, left: '15%', width: 260, height: 260, background: 'radial-gradient(circle, rgba(139,92,246,.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1000, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 20px ${C.primaryGlow}` }}>
                <LogoSvg size={17} color="#0a0e1a" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Alfamax Digital</div>
                <div style={{ fontSize: 10, color: C.textDim, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>Gestão de Tráfego</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                background: C.primaryGlow, color: C.primary,
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 800,
                border: `1px solid ${C.primary}40`, letterSpacing: '.02em',
              }}>Relatório {typeLabel}</span>
              <button
                className="no-print"
                onClick={() => window.print()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 20, padding: '6px 14px', color: C.text,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Baixar PDF
              </button>
            </div>
          </div>

          <div style={{ display: 'inline-block', fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: C.primary, fontWeight: 800, marginBottom: 12 }}>
            📊 Relatório de Performance
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, marginBottom: 8, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            {report.client_name || report.account_name}
          </h1>
          <p style={{ fontSize: 15, color: C.textMuted, marginBottom: 20, fontWeight: 500 }}>
            📅 <b style={{ color: C.text }}>{fmtDate(report.period_start)}</b> a <b style={{ color: C.text }}>{fmtDate(report.period_end)}</b>
            <span style={{ color: C.textDim, margin: '0 8px' }}>·</span>
            {daysCount} dias
            <span style={{ color: C.textDim, margin: '0 8px' }}>·</span>
            {visibleCampaigns.length} campanhas
          </p>

          {/* Quick stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 20, marginTop: 32, paddingTop: 28, borderTop: '1px solid rgba(255,255,255,.08)' }}>
            {[
              { label: 'Investimento', value: fmt(m.total_spend) },
              { label: actionLabel, value: fmtNum(m.total_conversions) },
              { label: cpaLabel, value: m.cost_per_conversion > 0 ? fmt(m.cost_per_conversion) : '—' },
              { label: 'Impressões', value: fmtNum(m.total_impressions) },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 10.5, color: C.textDim, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {report.custom_note && (
            <div style={{ marginTop: 28, background: C.primaryGlow, border: `1px solid ${C.primary}40`, borderLeft: `3px solid ${C.primary}`, borderRadius: '0 10px 10px 0', padding: '16px 20px' }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: C.text }}>{report.custom_note}</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ BODY ═══ */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>

        {/* KPIs completos */}
        <section style={{ marginBottom: 12 }}>
          <SectionHeader title="Sumário Executivo" subtitle={m.spend_change_pct !== null ? 'vs. período anterior' : ''} icon="📊" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 10 }}>
            <KpiCard label="Investimento" value={fmt(m.total_spend)} sub={`${fmt(m.total_spend / daysCount)}/dia`} accent={C.primary} delta={changeBadge(m.spend_change_pct, false)} />
            <KpiCard label={`${actionLabel} Totais`} value={fmtNum(m.total_conversions)} sub="Conversões primárias" accent={C.green} delta={changeBadge(m.conversions_change_pct, false)} highlight />
            <KpiCard label={cpaLabel} value={m.cost_per_conversion > 0 ? fmt(m.cost_per_conversion) : '—'} sub="CPA médio" accent={C.amber} delta={changeBadge(m.cpa_change_pct, true)} />
            <KpiCard label="Impressões" value={fmtNum(m.total_impressions)} sub={`CPM ${fmt(m.avg_cpm)}`} accent={C.purple} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 40 }}>
            {[
              { label: 'Cliques', value: fmtNum(m.total_clicks), color: C.blue },
              { label: 'CTR', value: `${m.avg_ctr.toFixed(2)}%`, color: '#ec4899' },
              { label: 'CPC', value: fmt(m.avg_cpc), color: C.amber },
              { label: 'Frequência', value: `${m.avg_frequency.toFixed(1)}×`, color: C.textMuted },
              ...(m.avg_roas > 0 ? [{ label: 'ROAS', value: `${m.avg_roas.toFixed(2)}×`, color: C.green }] : []),
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: C.card, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: C.textDim, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Destaques */}
        {insights.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Destaques do Período" icon="💡" />
            <div style={{ background: `linear-gradient(135deg, ${C.card} 0%, rgba(211,241,0,.05) 100%)`, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < insights.length - 1 ? `1px dashed ${C.border}` : 'none' }}>
                  <span style={{ color: C.primary, fontSize: 13, fontWeight: 800, marginTop: 2 }}>▸</span>
                  <span style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55 }}>{ins}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Evolução diária */}
        {m.daily_breakdown && m.daily_breakdown.length > 1 && (() => {
          const maxSpend = Math.max(...m.daily_breakdown.map(d => d.spend), 1);
          const maxConv = Math.max(...m.daily_breakdown.map(d => d.conversions), 1);
          return (
            <section style={{ marginBottom: 40 }}>
              <SectionHeader title="Evolução Diária" icon="📈" />
              <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Investimento diário</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
                    {m.daily_breakdown.map((d, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                        <div title={`${d.date?.substring(5)}: ${fmt(d.spend)}`}
                          style={{ width: '100%', height: `${Math.max(4, (d.spend / maxSpend) * 80)}px`, borderRadius: '3px 3px 0 0', background: `linear-gradient(to top, ${C.primaryDark}, ${C.primary})`, opacity: 0.9 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.9'; }} />
                      </div>
                    ))}
                  </div>
                </div>
                {maxConv > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{actionLabel} diário</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 52 }}>
                      {m.daily_breakdown.map((d, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                          <div title={`${d.date?.substring(5)}: ${d.conversions}`}
                            style={{ width: '100%', height: `${Math.max(d.conversions > 0 ? 4 : 0, (d.conversions / maxConv) * 52)}px`, borderRadius: '3px 3px 0 0', background: `linear-gradient(to top, #16a34a, ${C.green})`, opacity: 0.85 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: C.textDim }}>{m.daily_breakdown[0]?.date?.substring(5)}</span>
                  <span style={{ fontSize: 11, color: C.textDim }}>{m.daily_breakdown[m.daily_breakdown.length - 1]?.date?.substring(5)}</span>
                </div>
              </div>
            </section>
          );
        })()}

        {/* Distribuição por objetivo */}
        {objDist.length > 1 && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Distribuição por Objetivo" icon="🎯" />
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {objDist.map((o, i) => (
                  <div key={o.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: OBJ_COLORS[i % OBJ_COLORS.length] }} />
                        {o.label}
                      </span>
                      <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 700 }}>{fmt(o.spend)} · <b style={{ color: C.text }}>{o.pct.toFixed(1)}%</b></span>
                    </div>
                    <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${o.pct}%`, background: OBJ_COLORS[i % OBJ_COLORS.length], borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Análise IA */}
        {report.show_ai_analysis !== false && analysisText && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Análise Estratégica" icon="🤖" />
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px 28px' }}>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{analysisText}</div>
            </div>
          </section>
        )}

        {/* Performance por tipo de criativo */}
        {topAds.length > 0 && staticAds.length > 0 && videoAds.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Performance por Tipo de Criativo" icon="🎬" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <TypeCard label="Criativos Estáticos" color={C.green} stats={staticStats} totalResults={allResults} actionLabel={actionLabel} cpaLabel={cpaLabel} fmt={fmt} fmtNum={fmtNum} icon="✓" />
              <TypeCard label="Criativos em Vídeo" color={C.purple} stats={videoStats} totalResults={allResults} actionLabel={actionLabel} cpaLabel={cpaLabel} fmt={fmt} fmtNum={fmtNum} icon="▶" />
            </div>
          </section>
        )}

        {/* Comparativo de CPA */}
        {topAds.filter(a => a.cpa > 0).length > 1 && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title={`${cpaLabel} — Comparativo`} icon="📊" />
            <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 170, paddingBottom: 4 }}>
                {topAds.map((ad, i) => {
                  const cpa = ad.cpa || 0;
                  const barH = Math.max(cpa > 0 ? 12 : 0, (cpa / maxCpa) * 140);
                  const isVid = isVideoAd(ad);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                      {cpa > 0 && <div style={{ fontSize: 11, color: isVid ? C.purple : C.primary, fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt(cpa)}</div>}
                      <div style={{ width: '100%', height: `${barH}px`, background: isVid ? `linear-gradient(to top, #7c3aed, ${C.purple})` : `linear-gradient(to top, ${C.primaryDark}, ${C.primary})`, borderRadius: '4px 4px 0 0', minHeight: cpa > 0 ? 8 : 0 }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                {topAds.map((ad, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.name}>
                    {ad.name.length > 18 ? ad.name.slice(0, 16) + '…' : ad.name}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Desempenho individual — cards com thumbnails */}
        {topAds.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Ranking de Criativos" icon="🏆" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {topAds.map((ad, i) => {
                const isVid = isVideoAd(ad);
                const color = isVid ? C.purple : C.primary;
                const canWatch = isVid && !!ad.watch_url;
                const thumbBox = (
                  <>
                    {ad.thumbnail_url ? (
                      <div style={{ width: '100%', aspectRatio: '1/1', position: 'relative', overflow: 'hidden', background: '#000' }}>
                        {/* Fundo blurred da mesma imagem pra preencher moldura sem cortar */}
                        <img src={ad.thumbnail_url} alt="" aria-hidden="true" loading="eager" decoding="async"
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(.5)', transform: 'scale(1.2)' }} />
                        {/* Imagem principal — contain, imageRendering pra melhor upscale */}
                        <img src={ad.thumbnail_url} alt={ad.name} loading="eager" decoding="async"
                          style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', display: 'block', imageRendering: 'auto' as any }}
                          onError={e => { (e.currentTarget.parentElement!.innerHTML = `<div style="width:100%;height:100%;display:grid;place-items:center;color:${C.textDim};font-size:12px">sem preview</div>`); }} />
                      </div>
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '1/1', background: `linear-gradient(135deg, ${C.bg}, ${C.border})`, display: 'grid', placeItems: 'center', color: C.textDim, fontSize: 14, fontWeight: 700 }}>
                        {isVid ? '▶ VÍDEO' : '📷 IMAGEM'}
                      </div>
                    )}
                    {canWatch && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                        background: 'rgba(10,14,26,.15)', transition: 'background .15s',
                      }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%', background: 'rgba(10,14,26,.55)',
                          border: `2px solid ${C.purple}`, display: 'grid', placeItems: 'center',
                          backdropFilter: 'blur(4px)',
                        }}>
                          <span style={{ color: '#fff', fontSize: 20, marginLeft: 3 }}>▶</span>
                        </div>
                      </div>
                    )}
                  </>
                );
                return (
                  <div key={ad.ad_id || i} className="card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, background: color, color: '#0a0e1a', fontSize: 12, fontWeight: 900, padding: '5px 12px', borderRadius: 10, boxShadow: `0 4px 12px ${color}55` }}>#{i + 1}</div>
                    {canWatch ? (
                      <a href={ad.watch_url} target="_blank" rel="noopener noreferrer" title="Assistir anúncio" style={{ display: 'block', position: 'relative', cursor: 'pointer' }}>
                        {thumbBox}
                      </a>
                    ) : (
                      <div style={{ position: 'relative' }}>{thumbBox}</div>
                    )}
                    <div style={{ padding: 16 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.name}>{ad.name}</div>
                      <div style={{ fontSize: 10.5, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Custo por {ad.action_singular || actionSingular[actionLabel] || actionLabel}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: '-0.02em', marginBottom: 12 }}>{ad.cpa > 0 ? fmt(ad.cpa) : '—'}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                        <div><div style={{ color: C.textDim, marginBottom: 2 }}>Invest.</div><b style={{ color: C.text }}>{fmt(ad.spend)}</b></div>
                        <div><div style={{ color: C.textDim, marginBottom: 2 }}>{ad.action_label || actionLabel}</div><b style={{ color: C.text }}>{ad.conversions || 0}</b></div>
                        <div><div style={{ color: C.textDim, marginBottom: 2 }}>Impressões</div><b style={{ color: C.text }}>{fmtNum(ad.impressions)}</b></div>
                        <div><div style={{ color: C.textDim, marginBottom: 2 }}>Alcance</div><b style={{ color: C.text }}>{fmtNum(ad.reach || 0)}</b></div>
                        <div><div style={{ color: C.textDim, marginBottom: 2 }}>Frequência</div><b style={{ color: C.text }}>{(ad.frequency || 0).toFixed(2)}</b></div>
                        <div><div style={{ color: C.textDim, marginBottom: 2 }}>Cliques</div><b style={{ color: C.blue }}>{fmtNum(ad.clicks)}</b></div>
                        <div><div style={{ color: C.textDim, marginBottom: 2 }}>Cliques no Link</div><b style={{ color: C.blue }}>{fmtNum(ad.link_clicks || 0)}</b></div>
                        {ad.roas > 0 && (
                          <div><div style={{ color: C.textDim, marginBottom: 2 }}>ROI</div><b style={{ color: C.green }}>{ad.roas.toFixed(2)}×</b></div>
                        )}
                      </div>
                      {canWatch && (
                        <a href={ad.watch_url} target="_blank" rel="noopener noreferrer" style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          marginTop: 12, padding: '8px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                          color: C.purple, border: `1px solid ${C.purple}55`, textDecoration: 'none',
                        }}>
                          ▶ Assistir anúncio
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Segmentação (breakdowns) */}
        {m.breakdowns && (m.breakdowns.publisher_platform?.length || m.breakdowns.age_gender?.length) && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Segmentação do Público" icon="🧠" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>

              {m.breakdowns.publisher_platform && m.breakdowns.publisher_platform.length > 0 && (
                <BreakdownCard title="Plataforma" rows={m.breakdowns.publisher_platform} totalSpend={m.total_spend} fmt={fmt} fmtNum={fmtNum} accent={C.blue} labelMap={{ facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger' }} />
              )}

              {m.breakdowns.platform_position && m.breakdowns.platform_position.length > 0 && (
                <BreakdownCard title="Posicionamento" rows={m.breakdowns.platform_position} totalSpend={m.total_spend} fmt={fmt} fmtNum={fmtNum} accent={C.primary} labelMap={{ feed: 'Feed', story: 'Stories', reels: 'Reels', instagram_reels: 'Reels IG', facebook_reels: 'Reels FB', marketplace: 'Marketplace', video_feeds: 'Vídeo Feed', instream_video: 'Vídeo In-Stream', search: 'Search', biz_disco_feed: 'Feed Business', instagram_search: 'Busca IG', instagram_explore: 'Explorar IG' }} />
              )}

              {m.breakdowns.impression_device && m.breakdowns.impression_device.length > 0 && (
                <BreakdownCard title="Dispositivo" rows={m.breakdowns.impression_device} totalSpend={m.total_spend} fmt={fmt} fmtNum={fmtNum} accent={C.purple} labelMap={{ iphone: '📱 iPhone', android_smartphone: '📱 Android', ipad: 'iPad', android_tablet: 'Tablet Android', desktop: '💻 Desktop', other: 'Outros' }} />
              )}

              {m.breakdowns.age_gender && m.breakdowns.age_gender.length > 0 && (
                <div className="card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 12, color: C.textDim, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>Idade & Gênero</div>
                  <AgeGenderChart rows={m.breakdowns.age_gender} fmt={fmt} fmtNum={fmtNum} />
                </div>
              )}
            </div>

            {m.breakdowns.region && m.breakdowns.region.length > 0 && (
              <div className="card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginTop: 14 }}>
                <div style={{ fontSize: 12, color: C.textDim, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>Top Regiões</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {m.breakdowns.region.slice(0, 10).map((r, i) => {
                    const maxSpend = Math.max(...m.breakdowns!.region!.map(x => x.spend));
                    const pct = maxSpend > 0 ? (r.spend / maxSpend) * 100 : 0;
                    return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: C.text, fontWeight: 600 }}>📍 {r.label}</span>
                          <span style={{ color: C.textMuted, fontWeight: 700 }}>{fmt(r.spend)}</span>
                        </div>
                        <div style={{ height: 5, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.primaryDark}, ${C.primary})` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Recomendações */}
        {recommendations.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Recomendações Estratégicas" icon="💼" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {recommendations.map((rec, i) => {
                const palette = [
                  { border: C.primary, titleColor: C.primary },
                  { border: C.green, titleColor: '#4ade80' },
                  { border: C.amber, titleColor: '#fbbf24' },
                  { border: C.blue, titleColor: '#60a5fa' },
                  { border: C.purple, titleColor: '#a78bfa' },
                ][i % 5];
                const parsed = (() => {
                  const dot = rec.indexOf('. ');
                  if (dot > 0 && dot < 80) return { title: rec.slice(0, dot), body: rec.slice(dot + 2) };
                  return { title: rec, body: '' };
                })();
                return (
                  <div key={i} className="rec-card" style={{
                    background: C.card, borderRadius: 12, padding: '18px 20px',
                    border: `1px solid ${C.border}`, borderLeft: `3px solid ${palette.border}`,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: palette.titleColor, marginBottom: parsed.body ? 8 : 0 }}>
                      {parsed.title}
                    </div>
                    {parsed.body && <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.65 }}>{parsed.body}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Detalhamento por Campanha (com breakdowns individuais) */}
        {visibleCampaigns.some(c => c.breakdowns) && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Detalhamento por Campanha" icon="🔍" />
            {visibleCampaigns.filter(c => c.breakdowns).map((c, i) => (
              <div key={c.id || i} className="card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: C.primary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{mapObjective(c.objective || actionLabel)}</div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{c.name}</h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>{fmt(c.spend)}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{c.conversions} {actionLabel.toLowerCase()} · CTR {c.ctr.toFixed(2)}%</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                  {c.breakdowns?.publisher_platform && c.breakdowns.publisher_platform.length > 0 && (
                    <BreakdownCard title="Plataforma" rows={c.breakdowns.publisher_platform} totalSpend={c.spend} fmt={fmt} fmtNum={fmtNum} accent={C.blue} compact labelMap={{ facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Aud. Network', messenger: 'Messenger' }} />
                  )}
                  {c.breakdowns?.platform_position && c.breakdowns.platform_position.length > 0 && (
                    <BreakdownCard title="Posicionamento" rows={c.breakdowns.platform_position} totalSpend={c.spend} fmt={fmt} fmtNum={fmtNum} accent={C.primary} compact labelMap={{ feed: 'Feed', story: 'Stories', reels: 'Reels', instagram_reels: 'Reels IG', facebook_reels: 'Reels FB', marketplace: 'Marketplace', video_feeds: 'Vídeo Feed', instream_video: 'In-Stream', search: 'Search', biz_disco_feed: 'Feed Business', instagram_search: 'Busca IG', instagram_explore: 'Explorar IG' }} />
                  )}
                  {c.breakdowns?.impression_device && c.breakdowns.impression_device.length > 0 && (
                    <BreakdownCard title="Dispositivo" rows={c.breakdowns.impression_device} totalSpend={c.spend} fmt={fmt} fmtNum={fmtNum} accent={C.purple} compact labelMap={{ iphone: '📱 iPhone', android_smartphone: '📱 Android', ipad: 'iPad', android_tablet: 'Tablet Android', desktop: '💻 Desktop', other: 'Outros' }} />
                  )}
                  {c.breakdowns?.age_gender && c.breakdowns.age_gender.length > 0 && (
                    <div style={{ background: C.bg + '80', border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                      <div style={{ fontSize: 11, color: C.textDim, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Idade & Gênero</div>
                      <AgeGenderChart rows={c.breakdowns.age_gender} fmt={fmt} fmtNum={fmtNum} />
                    </div>
                  )}
                  {c.breakdowns?.region && c.breakdowns.region.length > 0 && (
                    <BreakdownCard title="Top Regiões" rows={c.breakdowns.region.slice(0, 6)} totalSpend={c.spend} fmt={fmt} fmtNum={fmtNum} accent={C.green} compact />
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Campanhas */}
        {report.show_campaign_table !== false && visibleCampaigns.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader title="Campanhas do Período" icon="🚀" />
            <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,.02)', borderBottom: `1px solid ${C.border}` }}>
                      {['Campanha', 'Status', 'Investimento', actionLabel, ...(m.avg_roas > 0 ? ['ROAS'] : []), 'CTR'].map(h => (
                        <th key={h} style={{ padding: '13px 16px', textAlign: h === 'Campanha' ? 'left' : 'center', fontSize: 10.5, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCampaigns.map((c, i) => (
                      <tr key={i} style={{ borderBottom: i < visibleCampaigns.length - 1 ? `1px solid ${C.border}80` : 'none' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: C.text, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 10, background: c.status === 'ACTIVE' ? 'rgba(34,197,94,.13)' : 'rgba(148,163,184,.1)', color: c.status === 'ACTIVE' ? C.green : C.textMuted, border: `1px solid ${c.status === 'ACTIVE' ? 'rgba(34,197,94,.25)' : 'rgba(148,163,184,.2)'}` }}>
                            {c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{fmt(c.spend)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: C.primary }}>{c.conversions}</td>
                        {m.avg_roas > 0 && (
                          <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: c.roas >= 2 ? C.green : c.roas >= 1 ? C.amber : C.red }}>{c.roas.toFixed(2)}×</td>
                        )}
                        <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: C.textMuted }}>{c.ctr.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 32, textAlign: 'center', color: C.textDim }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LogoSvg size={12} color="#0a0e1a" />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.textMuted }}>Alfamax Digital</span>
          </div>
          <p style={{ fontSize: 11.5, color: C.textDim }}>Powered by TrafficAI · Gerado em {new Date(report.created_at).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Components ───────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 3, height: 18, background: `linear-gradient(180deg, ${C.primary}, ${C.primaryDark})`, borderRadius: 2, alignSelf: 'center' }} />
      {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{title}</h2>
      {subtitle && <span style={{ fontSize: 11.5, color: C.textDim, fontWeight: 500 }}>· {subtitle}</span>}
    </div>
  );
}

function KpiCard({ label, value, sub, accent, delta, highlight }: {
  label: string; value: string; sub?: string; accent: string;
  delta?: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className="kpi-card" style={{
      background: highlight ? `linear-gradient(135deg, ${C.card}, rgba(34,197,94,.06))` : C.card,
      borderRadius: 12, padding: 20, border: `1px solid ${highlight ? 'rgba(34,197,94,.25)' : C.border}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}55, ${accent})` }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
        <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
        {delta}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: highlight ? accent : C.text, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function TypeCard({ label, color, stats, totalResults, actionLabel, cpaLabel, fmt, fmtNum, icon }: {
  label: string; color: string; icon: string;
  stats: { count: number; spend: number; results: number; cpa: number };
  totalResults: number; actionLabel: string; cpaLabel: string;
  fmt: (v: number) => string; fmtNum: (v: number) => string;
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `3px solid ${color}`, borderRadius: 12, padding: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span> {label}
      </h3>
      <div style={{ display: 'grid', gap: 14 }}>
        <MiniStat label="Anúncios" value={String(stats.count)} />
        <MiniStat label="Investimento" value={fmt(stats.spend)} color={color} />
        <MiniStat label={actionLabel} value={fmtNum(stats.results)} bold />
        <div style={{ background: color + '18', border: `1px solid ${color}30`, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>{cpaLabel}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color }}>{stats.cpa > 0 ? fmt(stats.cpa) : '—'}</div>
        </div>
        {totalResults > 0 && stats.results > 0 && (
          <div style={{ fontSize: 12, color, fontWeight: 600 }}>✓ {Math.round((stats.results / totalResults) * 100)}% dos {actionLabel.toLowerCase()}</div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: bold ? 22 : 20, fontWeight: bold ? 900 : 800, color: color || C.text }}>{value}</div>
    </div>
  );
}

function BreakdownCard({ title, rows, totalSpend, fmt, fmtNum, accent, labelMap, compact }: {
  title: string;
  rows: BreakdownRow[];
  totalSpend: number;
  fmt: (v: number) => string;
  fmtNum: (v: number) => string;
  accent: string;
  labelMap?: Record<string, string>;
  compact?: boolean;
}) {
  const max = Math.max(...rows.map(r => r.spend), 1);
  return (
    <div className="card" style={{ background: compact ? C.bg + '80' : C.card, border: `1px solid ${C.border}`, borderRadius: compact ? 10 : 12, padding: compact ? 16 : 20 }}>
      <div style={{ fontSize: 11, color: C.textDim, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: compact ? 12 : 14 }}>{title}</div>
      <div style={{ display: 'grid', gap: compact ? 8 : 10 }}>
        {rows.slice(0, 8).map((r, i) => {
          const pct = max > 0 ? (r.spend / max) * 100 : 0;
          const spendPct = totalSpend > 0 ? (r.spend / totalSpend) * 100 : 0;
          const label = labelMap?.[r.label] || (r.label ? r.label.charAt(0).toUpperCase() + r.label.slice(1).replace(/_/g, ' ') : 'Outros');
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ color: C.text, fontWeight: 600 }}>{label}</span>
                <span style={{ color: C.textMuted, fontWeight: 700, fontSize: 11 }}>
                  {fmt(r.spend)} <span style={{ color: C.textDim }}>· {spendPct.toFixed(1)}%</span>
                </span>
              </div>
              <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 3 }} />
              </div>
              {r.conversions > 0 && (
                <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 3 }}>
                  {r.conversions} result. · {fmtNum(r.impressions)} impr.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgeGenderChart({ rows, fmt, fmtNum }: {
  rows: Array<BreakdownRow & { age: string; gender: string }>;
  fmt: (v: number) => string;
  fmtNum: (v: number) => string;
}) {
  const AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const byAge = new Map<string, { m: number; f: number; other: number }>();
  for (const r of rows) {
    const cur = byAge.get(r.age) || { m: 0, f: 0, other: 0 };
    if (r.gender === 'male') cur.m += r.spend;
    else if (r.gender === 'female') cur.f += r.spend;
    else cur.other += r.spend;
    byAge.set(r.age, cur);
  }
  const ages = AGES.filter(a => byAge.has(a));
  if (ages.length === 0) [...byAge.keys()].forEach(k => ages.push(k));
  const max = Math.max(...Array.from(byAge.values()).map(v => Math.max(v.m, v.f, v.other)), 1);

  const totalM = rows.filter(r => r.gender === 'male').reduce((s, r) => s + r.spend, 0);
  const totalF = rows.filter(r => r.gender === 'female').reduce((s, r) => s + r.spend, 0);
  const totalAll = totalM + totalF;

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: C.blue, borderRadius: 2 }} /> Masculino <b style={{ color: C.text }}>{totalAll > 0 ? ((totalM / totalAll) * 100).toFixed(0) : 0}%</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: '#ec4899', borderRadius: 2 }} /> Feminino <b style={{ color: C.text }}>{totalAll > 0 ? ((totalF / totalAll) * 100).toFixed(0) : 0}%</b>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {ages.map(age => {
          const v = byAge.get(age)!;
          return (
            <div key={age} style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: 10, alignItems: 'center', fontSize: 11 }}>
              <div style={{ color: C.textMuted, fontWeight: 700 }}>{age}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.textDim }}>{fmt(v.m)}</span>
                  <div style={{ width: `${(v.m / max) * 100}%`, height: 10, background: C.blue, borderRadius: 2, minWidth: v.m > 0 ? 4 : 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: `${(v.f / max) * 100}%`, height: 10, background: '#ec4899', borderRadius: 2, minWidth: v.f > 0 ? 4 : 0 }} />
                  <span style={{ fontSize: 10, color: C.textDim }}>{fmt(v.f)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogoSvg({ size = 20, color = 'white' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function mapObjective(o: string): string {
  const s = String(o).toUpperCase();
  if (/LEAD/.test(s)) return 'Geração de Leads';
  if (/SAL|PURCH|CONV/.test(s)) return 'Vendas';
  if (/MESS/.test(s)) return 'Mensagens';
  if (/ENGAG|POST/.test(s)) return 'Engajamento';
  if (/TRAF|LINK/.test(s)) return 'Tráfego';
  if (/AWARE|REACH/.test(s)) return 'Alcance';
  if (/VIDEO/.test(s)) return 'Visualizações';
  return o.charAt(0).toUpperCase() + o.slice(1).toLowerCase();
}

export default function PublicReportPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: C.bg }} />}>
      <PublicReportPageInner />
    </Suspense>
  );
}

const fullCenter: React.CSSProperties = {
  minHeight: '100vh', background: C.bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'Inter', sans-serif",
};

const logoMark: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 14,
  background: `linear-gradient(135deg, ${C.primaryDark}, ${C.primary})`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 24, margin: '0 auto',
  boxShadow: `0 8px 24px ${C.primaryGlow}`,
};
