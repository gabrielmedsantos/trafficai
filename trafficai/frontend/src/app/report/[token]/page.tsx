'use client';

// Página pública do relatório — acessível pelo cliente sem login
// URL: /report/:token

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface AdData {
  ad_id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  action_label: string;
  action_singular: string;
  ctr: number;
  cpc: number;
  roas: number;
  cpa: number;
  hook_rate: number | null;
  thumbnail_url?: string;
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
  top_campaigns: Array<{ name: string; spend: number; conversions: number; roas: number; ctr: number; status: string }>;
  top_ads?: AdData[];
  daily_breakdown: Array<{ date: string; spend: number; conversions: number; clicks: number }>;
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

  // Auto-print when ?print=1
  useEffect(() => {
    if (report && searchParams?.get('print') === '1') {
      setTimeout(() => window.print(), 800);
    }
  }, [report, searchParams]);

  if (loading) {
    return (
      <div style={fullCenter}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={logoMark} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div style={{ marginTop: '16px', fontSize: '14px' }}>Carregando relatório…</div>
          <div style={{ width: '24px', height: '24px', border: '2.5px solid #1e2744', borderTopColor: '#6366f1', borderRadius: '50%', margin: '14px auto 0', animation: 'spin 0.75s linear infinite' }} />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={fullCenter}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={logoMark} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginTop: '16px', marginBottom: '6px', color: '#f1f5f9' }}>
            Relatório não encontrado
          </h1>
          <p style={{ fontSize: '14px', color: '#475569' }}>Este link pode ter expirado ou é inválido.</p>
        </div>
      </div>
    );
  }

  const m = report.metrics;
  const fmt     = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: report.currency || 'BRL' }).format(v);
  const fmtNum  = (v: number) => v >= 1000 ? v.toLocaleString('pt-BR') : String(v);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const typeLabel = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' }[report.type];
  const actionLabel = m.primary_action_label || 'Conversões';
  // Para labels no singular: "Mensagens" → "Mensagem", "Compras" → "Compra", etc.
  const actionSingular: Record<string, string> = {
    'Mensagens': 'Mensagem',
    'Compras': 'Compra',
    'Leads': 'Lead',
    'Cadastros': 'Cadastro',
    'Engajamentos': 'Engajamento',
    'Cliques no link': 'Clique',
    'Visualizações de vídeo': 'Visualização',
    'Conversões': 'Conversão',
  };
  const cpaLabel = `Custo por ${actionSingular[actionLabel] || actionLabel}`;

  const changeBadge = (pct: number | null | undefined, invert = false) => {
    if (pct === null || pct === undefined) return null;
    const good = invert ? pct < 0 : pct >= 0;
    return (
      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: good ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)', color: good ? '#34d399' : '#f87171', border: `1px solid ${good ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)'}` }}>
        {pct >= 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  const recommendations: string[] = Array.isArray(report.edited_recommendations) && report.edited_recommendations.length > 0
    ? report.edited_recommendations
    : (Array.isArray(report.recommendations) ? report.recommendations : []);

  const visibleCampaigns = report.selected_campaign_ids
    ? m.top_campaigns.filter(c => (c as any).id && report.selected_campaign_ids!.includes((c as any).id))
    : m.top_campaigns;

  const topAds = m.top_ads || [];

  // Creative type detection
  const isVideoAd = (name: string) => /video|vídeo/i.test(name);
  const staticAds = topAds.filter(ad => !isVideoAd(ad.name));
  const videoAds  = topAds.filter(ad => isVideoAd(ad.name));

  const typeStats = (ads: AdData[]) => {
    const results = ads.reduce((s, a) => s + (a.conversions || 0), 0);
    const spend   = ads.reduce((s, a) => s + a.spend, 0);
    return { count: ads.length, spend, results, cpa: results > 0 ? spend / results : 0 };
  };
  const allResults  = topAds.reduce((s, a) => s + (a.conversions || 0), 0);
  const staticStats = typeStats(staticAds);
  const videoStats  = typeStats(videoAds);

  // Recommendation parsing
  const parseRec = (rec: string) => {
    const dot = rec.indexOf('. ');
    if (dot > 0 && dot < 80) return { title: rec.slice(0, dot), body: rec.slice(dot + 2) };
    return { title: rec, body: '' };
  };
  const recPalette = [
    { bg: 'rgba(239,68,68,0.08)',   border: '#ef4444', titleColor: '#fca5a5', dotColor: '#ef4444' },
    { bg: 'rgba(16,185,129,0.08)',  border: '#10b981', titleColor: '#6ee7b7', dotColor: '#10b981' },
    { bg: 'rgba(245,158,11,0.08)',  border: '#f59e0b', titleColor: '#fcd34d', dotColor: '#f59e0b' },
    { bg: 'rgba(99,102,241,0.08)',  border: '#6366f1', titleColor: '#a5b4fc', dotColor: '#6366f1' },
  ];

  const maxCpa = Math.max(...topAds.map(a => a.cpa || 0), 1);

  return (
    <div style={{ minHeight: '100vh', background: '#080c18', fontFamily: "'Inter', -apple-system, sans-serif", color: '#eef2ff' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #1e2744; border-radius: 3px; }
        .rec-card { transition: transform .15s; }
        .rec-card:hover { transform: translateY(-2px); }
        @keyframes spin { to { transform: rotate(360deg); } }
        .no-print { }
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #080c18 !important; }
          a { text-decoration: none !important; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* ── Hero ── */}
      <div style={{ background: 'linear-gradient(160deg, #0e0b2e 0%, #16123a 40%, #0e0b2e 100%)', padding: '48px 24px 40px', borderBottom: '1px solid rgba(99,102,241,.18)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-80px', right: '-40px', width: '320px', height: '320px', background: 'radial-gradient(circle, rgba(99,102,241,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-60px', left: '8%', width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(124,58,237,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,.4)' }} aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <span style={{ fontSize: '14px', fontWeight: 800, color: 'rgba(255,255,255,.85)' }}>Alfamax Digital</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: 'rgba(99,102,241,.18)', color: '#a5b4fc', padding: '5px 14px', borderRadius: '20px', fontSize: '12.5px', fontWeight: 700, border: '1px solid rgba(99,102,241,.25)' }}>
                Relatório {typeLabel}
              </span>
              <button
                className="no-print"
                onClick={() => window.print()}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: '20px', padding: '5px 14px', color: 'rgba(255,255,255,.8)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.14)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Baixar PDF
              </button>
            </div>
          </div>

          <h1 style={{ fontSize: 'clamp(22px,4vw,32px)', fontWeight: 900, marginBottom: '6px', lineHeight: 1.2, letterSpacing: '-0.5px' }}>
            Relatório de Resultados
          </h1>
          <p style={{ fontSize: '15px', color: '#8899c0', marginBottom: '6px', fontWeight: 500 }}>
            {report.client_name || report.account_name}
          </p>
          <p style={{ fontSize: '13px', color: '#4f6080', marginBottom: (report.custom_note || report.summary) ? '24px' : '0' }}>
            Período: {fmtDate(report.period_start)} a {fmtDate(report.period_end)}
          </p>

          {(report.custom_note) && (
            <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderLeft: '3px solid rgba(99,102,241,.6)', borderRadius: '0 10px 10px 0', padding: '16px 20px' }}>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.8, color: '#c7d2fe' }}>
                {report.custom_note}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '44px 24px' }}>

        {/* ── KPI Cards Principais ── */}
        <section style={{ marginBottom: '12px' }}>
          <SectionHeader title="Resultados do Período" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '10px' }}>
            {/* Investimento */}
            <div style={{ background: '#141928', borderRadius: '12px', padding: '20px', border: '1px solid #1e2744', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #818cf833, #818cf8)' }} />
              <div style={{ fontSize: '12px', color: '#4f6080', fontWeight: 600, marginBottom: '8px' }}>Investimento Total</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#eef2ff', letterSpacing: '-0.5px', marginBottom: '8px' }}>{fmt(m.total_spend)}</div>
              {changeBadge(m.spend_change_pct, false)}
            </div>

            {/* Resultados (highlighted) */}
            <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(16,185,129,0.3)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #10b98133, #10b981)' }} />
              <div style={{ fontSize: '12px', color: '#4f6080', fontWeight: 600, marginBottom: '8px' }}>{actionLabel} Totais</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#10b981', letterSpacing: '-0.5px', marginBottom: '8px' }}>{fmtNum(m.total_conversions)}</div>
              {changeBadge(m.conversions_change_pct, false)}
            </div>

            {/* Custo por Resultado */}
            <div style={{ background: '#141928', borderRadius: '12px', padding: '20px', border: '1px solid #1e2744', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #f59e0b33, #f59e0b)' }} />
              <div style={{ fontSize: '12px', color: '#4f6080', fontWeight: 600, marginBottom: '8px' }}>{cpaLabel}</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#eef2ff', letterSpacing: '-0.5px', marginBottom: '8px' }}>{m.cost_per_conversion > 0 ? fmt(m.cost_per_conversion) : '—'}</div>
              {changeBadge(m.cpa_change_pct, true)}
            </div>

            {/* Impressões */}
            <div style={{ background: '#141928', borderRadius: '12px', padding: '20px', border: '1px solid #1e2744', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #a78bfa33, #a78bfa)' }} />
              <div style={{ fontSize: '12px', color: '#4f6080', fontWeight: 600, marginBottom: '8px' }}>Impressões</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#eef2ff', letterSpacing: '-0.5px', marginBottom: '8px' }}>{fmtNum(m.total_impressions)}</div>
            </div>
          </div>

          {/* Secondary metrics row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '32px' }}>
            {[
              { label: 'Cliques',    value: fmtNum(m.total_clicks),            color: '#38bdf8' },
              { label: 'CTR',        value: `${m.avg_ctr.toFixed(2)}%`,         color: '#f472b6' },
              { label: 'CPM',        value: fmt(m.avg_cpm),                     color: '#fb923c' },
              { label: 'Frequência', value: `${m.avg_frequency.toFixed(1)}×`,   color: '#94a3b8' },
              ...(m.avg_roas > 0 ? [{ label: 'ROAS', value: `${m.avg_roas.toFixed(2)}×`, color: '#60a5fa' }] : []),
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#0f1420', borderRadius: '8px', padding: '10px 14px', border: '1px solid #1a2338', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Gráfico diário ── */}
        {m.daily_breakdown && m.daily_breakdown.length > 1 && (() => {
          const maxSpend = Math.max(...m.daily_breakdown.map(d => d.spend), 1);
          const maxConv  = Math.max(...m.daily_breakdown.map(d => d.conversions), 1);
          return (
            <section style={{ marginBottom: '44px' }}>
              <SectionHeader title="Evolução do Período" />
              <div style={{ background: '#141928', borderRadius: '12px', padding: '24px', border: '1px solid #1e2744' }}>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Investimento diário</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '72px' }}>
                    {m.daily_breakdown.map((d, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                        <div
                          title={`${d.date?.substring(5)}: ${fmt(d.spend)}`}
                          style={{ width: '100%', height: `${Math.max(4, (d.spend / maxSpend) * 72)}px`, borderRadius: '3px 3px 0 0', background: 'linear-gradient(to top,#4f46e5,#818cf8)', opacity: 0.85, cursor: 'default', transition: 'opacity .15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {maxConv > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{actionLabel} diário</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '48px' }}>
                      {m.daily_breakdown.map((d, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                          <div
                            title={`${d.date?.substring(5)}: ${d.conversions}`}
                            style={{ width: '100%', height: `${Math.max(d.conversions > 0 ? 4 : 0, (d.conversions / maxConv) * 48)}px`, borderRadius: '3px 3px 0 0', background: 'linear-gradient(to top,#10b981,#34d399)', opacity: 0.8, cursor: 'default', transition: 'opacity .15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8'; }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#2d3a5c' }}>{m.daily_breakdown[0]?.date?.substring(5)}</span>
                  <span style={{ fontSize: '11px', color: '#2d3a5c' }}>{m.daily_breakdown[m.daily_breakdown.length - 1]?.date?.substring(5)}</span>
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── Performance por Tipo de Criativo ── */}
        {topAds.length > 0 && (staticAds.length > 0 || videoAds.length > 0) && (
          <section style={{ marginBottom: '44px' }}>
            <SectionHeader title="Performance por Tipo de Criativo" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {staticAds.length > 0 && (
                <div style={{ background: '#141928', border: '1px solid #1e2744', borderTop: '3px solid #10b981', borderRadius: '12px', padding: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                    Criativos Estáticos
                  </h3>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Campanhas</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#eef2ff' }}>{staticStats.count}</div>
                  </div>
                  <div style={{ borderTop: '1px solid #1e2744', paddingTop: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Investimento</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981' }}>{fmt(staticStats.spend)}</div>
                  </div>
                  <div style={{ borderTop: '1px solid #1e2744', paddingTop: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{actionLabel}</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#eef2ff' }}>{fmtNum(staticStats.results)}</div>
                  </div>
                  <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '14px 16px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px' }}>{cpaLabel}</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#10b981' }}>{staticStats.cpa > 0 ? fmt(staticStats.cpa) : '—'}</div>
                  </div>
                  {allResults > 0 && staticStats.results > 0 && (
                    <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 500 }}>
                      ✓ {Math.round((staticStats.results / allResults) * 100)}% dos {actionLabel.toLowerCase()} com melhor custo-benefício
                    </div>
                  )}
                </div>
              )}

              {videoAds.length > 0 && (
                <div style={{ background: '#141928', border: '1px solid #1e2744', borderTop: '3px solid #8b5cf6', borderRadius: '12px', padding: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#8b5cf6', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    Criativos em Vídeo
                  </h3>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Campanhas</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#eef2ff' }}>{videoStats.count}</div>
                  </div>
                  <div style={{ borderTop: '1px solid #1e2744', paddingTop: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Investimento</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#8b5cf6' }}>{fmt(videoStats.spend)}</div>
                  </div>
                  <div style={{ borderTop: '1px solid #1e2744', paddingTop: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{actionLabel}</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#eef2ff' }}>{fmtNum(videoStats.results)}</div>
                  </div>
                  <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', padding: '14px 16px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px' }}>{cpaLabel}</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#8b5cf6' }}>{videoStats.cpa > 0 ? fmt(videoStats.cpa) : '—'}</div>
                  </div>
                  {allResults > 0 && videoStats.results > 0 && (
                    <div style={{ fontSize: '12px', color: '#8b5cf6', fontWeight: 500 }}>
                      ✓ {Math.round((videoStats.results / allResults) * 100)}% dos {actionLabel.toLowerCase()} via vídeo
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Gráfico Comparativo ── */}
        {topAds.filter(a => a.cpa > 0).length > 1 && (
          <section style={{ marginBottom: '44px' }}>
            <SectionHeader title={`${cpaLabel} — Comparativo`} />
            <div style={{ background: '#141928', borderRadius: '12px', padding: '24px', border: '1px solid #1e2744' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '160px', borderBottom: '1px solid #1a2338', paddingBottom: '0', marginBottom: '0' }}>
                {topAds.map((ad, i) => {
                  const cpa = ad.cpa || 0;
                  const barH = Math.max(cpa > 0 ? 12 : 0, (cpa / maxCpa) * 130);
                  const isVid = isVideoAd(ad.name);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: '4px' }}>
                      {cpa > 0 && (
                        <div style={{ fontSize: '11px', color: isVid ? '#a78bfa' : '#818cf8', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {fmt(cpa)}
                        </div>
                      )}
                      <div style={{
                        width: '100%',
                        height: `${barH}px`,
                        background: isVid
                          ? 'linear-gradient(to top, #6d28d9, #8b5cf6)'
                          : 'linear-gradient(to top, #4338ca, #6366f1)',
                        borderRadius: '4px 4px 0 0',
                        minHeight: cpa > 0 ? '8px' : '0',
                      }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                {topAds.map((ad, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: isVideoAd(ad.name) ? '#6d28d9' : '#4338ca', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.name}>
                    {ad.name}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Desempenho Individual por Criativo ── */}
        {topAds.length > 0 && (
          <section style={{ marginBottom: '44px' }}>
            <SectionHeader title="Desempenho Individual por Criativo" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {topAds.map((ad, i) => {
                const isVid = isVideoAd(ad.name);
                const color = isVid ? '#8b5cf6' : '#10b981';
                return (
                  <div key={ad.ad_id || i} style={{ background: '#141928', border: '1px solid #1e2744', borderTop: `3px solid ${color}`, borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '18px 18px 14px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#eef2ff', marginBottom: '14px', lineHeight: 1.4 }} title={ad.name}>
                        {ad.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#3d4f70', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Custo por {ad.action_singular || actionSingular[actionLabel] || actionLabel}
                      </div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color, letterSpacing: '-0.5px' }}>
                        {ad.cpa > 0 ? fmt(ad.cpa) : '—'}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#1e2744', borderTop: '1px solid #1e2744' }}>
                      {[
                        { label: 'Investimento', value: fmt(ad.spend),              vc: '#94a3b8' },
                        { label: ad.action_label || actionLabel, value: String(ad.conversions || 0), vc: '#eef2ff' },
                        { label: 'Impressões',   value: fmtNum(ad.impressions),      vc: '#94a3b8' },
                        { label: 'Cliques',      value: fmtNum(ad.clicks),           vc: '#38bdf8' },
                      ].map(({ label, value, vc }) => (
                        <div key={label} style={{ background: '#0f1420', padding: '10px 14px' }}>
                          <div style={{ fontSize: '10px', color: '#2d3a5c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{label}</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: vc }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}


        {/* ── Recomendações Estratégicas ── */}
        {recommendations.length > 0 && (
          <section style={{ marginBottom: '44px' }}>
            <SectionHeader title="Recomendações Estratégicas" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {recommendations.map((rec, i) => {
                const c = recPalette[i % recPalette.length];
                const parsed = parseRec(rec);
                return (
                  <div key={i} className="rec-card" style={{ background: c.bg, borderRadius: '10px', padding: '18px 20px', border: `1px solid ${c.border}22`, borderLeft: `3px solid ${c.border}` }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: c.titleColor, marginBottom: parsed.body ? '8px' : '0', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c.dotColor, flexShrink: 0, marginTop: '3px', display: 'inline-block' }} aria-hidden="true" />
                      <span>{parsed.title}</span>
                    </div>
                    {parsed.body && <p style={{ fontSize: '13px', color: '#7f92b0', lineHeight: 1.65, margin: 0 }}>{parsed.body}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}


        {/* ── Campanhas ── */}
        {report.show_campaign_table !== false && visibleCampaigns.length > 0 && (
          <section style={{ marginBottom: '44px' }}>
            <SectionHeader title="Campanhas do Período" />
            <div style={{ background: '#141928', borderRadius: '12px', border: '1px solid #1e2744', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e2744', background: 'rgba(255,255,255,.02)' }}>
                      {['Campanha', 'Status', 'Investimento', actionLabel, ...(m.avg_roas > 0 ? ['ROAS'] : []), 'CTR'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Campanha' ? 'left' : 'center', fontSize: '10.5px', fontWeight: 700, color: '#3d4f70', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCampaigns.map((c, i) => (
                      <tr key={i} style={{ borderBottom: i < visibleCampaigns.length - 1 ? '1px solid rgba(30,39,68,.6)' : 'none' }}>
                        <td style={{ padding: '13px 16px', fontSize: '13px', fontWeight: 600, color: '#c7d2fe', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '10px', background: c.status === 'ACTIVE' ? 'rgba(16,185,129,.12)' : 'rgba(100,116,139,.1)', color: c.status === 'ACTIVE' ? '#34d399' : '#64748b', border: `1px solid ${c.status === 'ACTIVE' ? 'rgba(16,185,129,.2)' : 'rgba(100,116,139,.15)'}` }}>
                            {c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                          </span>
                        </td>
                        <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>{fmt(c.spend)}</td>
                        <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#a5b4fc' }}>{c.conversions}</td>
                        {m.avg_roas > 0 && (
                          <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: c.roas >= 2 ? '#34d399' : c.roas >= 1 ? '#fbbf24' : '#f87171' }}>
                            {c.roas.toFixed(2)}×
                          </td>
                        )}
                        <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: '13px', color: '#7f92b0' }}>{c.ctr.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <div style={{ borderTop: '1px solid #131c30', paddingTop: '28px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#2d3a5c' }}>Alfamax Digital</span>
          </div>
          <p style={{ fontSize: '11.5px', color: '#2d3a5c' }}>Gerado em {new Date(report.created_at).toLocaleDateString('pt-BR')}</p>
          <p style={{ fontSize: '11px', color: '#1e2744', marginTop: '3px' }}>Dados baseados nas métricas do período informado.</p>
        </div>

      </div>
    </div>
  );
}

export default function PublicReportPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#080c18' }} />}>
      <PublicReportPageInner />
    </Suspense>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #131c30' }}>
      <div style={{ width: '3px', height: '18px', background: 'linear-gradient(180deg, #6366f1, #8b5cf6)', borderRadius: '2px', flexShrink: 0 }} aria-hidden="true" />
      <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#eef2ff', letterSpacing: '-0.2px' }}>{title}</h2>
    </div>
  );
}

const fullCenter: React.CSSProperties = {
  minHeight: '100vh', background: '#080c18',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'Inter', sans-serif",
};

const logoMark: React.CSSProperties = {
  width: '52px', height: '52px', borderRadius: '14px',
  background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '24px', margin: '0 auto',
  boxShadow: '0 8px 24px rgba(99,102,241,.4)',
};
