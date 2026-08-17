// ==============================
// PDF Report Service — gera HTML profissional completo estilo AdsDaily.
// Estrutura: capa → sumário executivo (KPIs + delta vs período anterior) →
// tendência diária (spark line) → distribuição por objetivo (donut) →
// top criativos (com thumbnails) → cards de campanha → insights → footer.
// ==============================

import crypto from 'crypto';
import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { metaService } from '../meta/meta.service';
import { authRepository } from '../auth/auth.repository';

/** Baixa uma imagem e retorna como data URI. Em caso de falha, retorna null. */
async function fetchAsDataUri(url: string): Promise<string | null> {
    try {
        const resp = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 8000,
            validateStatus: () => true,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrafficAI/1.0)' },
        });
        if (resp.status !== 200 || !resp.data || resp.data.length < 100) return null;
        const ct = resp.headers['content-type'] || 'image/jpeg';
        const base64 = Buffer.from(resp.data).toString('base64');
        // Limite 200KB base64 pra não estourar HTML
        if (base64.length > 200000) return null;
        return `data:${ct};base64,${base64}`;
    } catch { return null; }
}

/** Baixa em batch e retorna Map<url_original, data_uri>. Paralelo com concurrency 5. */
async function fetchThumbsAsBase64(urls: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = [...new Set(urls.filter(Boolean))];
    const CONCURRENCY = 5;
    for (let i = 0; i < unique.length; i += CONCURRENCY) {
        const batch = unique.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(async u => ({ u, data: await fetchAsDataUri(u) })));
        for (const r of results) {
            if (r.data) map.set(r.u, r.data);
        }
    }
    return map;
}

async function getUserAccessToken(userId: string): Promise<string> {
    const user = await authRepository.findById(userId);
    if (!user?.access_token) throw new Error('Meta access token não configurado');
    return user.access_token;
}

interface BreakdownRow { label: string; spend: number; impressions: number; conversions: number; }
interface CampaignBreakdowns {
    publisher_platform?: BreakdownRow[];
    platform_position?: BreakdownRow[];
    impression_device?: BreakdownRow[];
    age_gender?: Array<BreakdownRow & { age: string; gender: string }>;
    region?: BreakdownRow[];
}

interface CampaignRow {
    id: string;
    meta_campaign_id?: string;
    name: string;
    objective: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    action_label: string;
    ctr: number;
    cpc: number;
    cpm: number;
    cpa: number;
    breakdowns?: CampaignBreakdowns;
}

interface AdRow {
    ad_name: string;
    spend: number;
    conversions: number;
    cpa: number;
    reach: number;
    thumbnail_url?: string | null;
    campaign_name?: string;
    ctr?: number;
    action_label?: string;
}

interface DailyPoint {
    date: string;
    spend: number;
    clicks: number;
    conversions: number;
}

interface Totals {
    spend: number; impressions: number; reach: number; clicks: number;
    ctr: number; cpc: number; cpm: number; frequency: number; conversions: number;
}

interface ReportInput {
    accountId: string;
    accountName: string;
    periodStart: string;
    periodEnd: string;
    periodLabel?: string;
    agencyName: string;
    totals: Totals;
    totalsPrev: Totals | null;
    counts: { campaigns: number; ads: number };
    daily: DailyPoint[];
    objectiveDist: Array<{ label: string; spend: number; pct: number }>;
    campaigns: Array<CampaignRow & { ads?: AdRow[] }>;
    topAds: AdRow[];
    insights: string[];
    breakdowns?: CampaignBreakdowns | null;
}

function fmtBRL(v: number): string {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtN(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1).replace('.0', '') + 'K';
    return v.toLocaleString('pt-BR');
}
function fmtPct(v: number): string {
    return v.toFixed(2).replace('.', ',') + '%';
}

function deltaBadge(now: number, prev: number | undefined | null, invert: boolean = false): string {
    if (prev == null || prev === 0 || !isFinite(prev)) return '';
    const pct = ((now - prev) / prev) * 100;
    if (!isFinite(pct)) return '';
    const good = invert ? pct < 0 : pct > 0;
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '·';
    const color = good ? '#22c55e' : pct === 0 ? '#94a3b8' : '#ef4444';
    const bg = good ? '#dcfce7' : pct === 0 ? '#f1f5f9' : '#fee2e2';
    return `<span style="display:inline-block;font-size:10.5px;font-weight:700;color:${color};background:${bg};padding:2px 7px;border-radius:10px;margin-left:6px">${arrow} ${Math.abs(pct).toFixed(1).replace('.', ',')}%</span>`;
}

function donutSvg(segments: Array<{ value: number; color: string; label: string }>, centerLabel: string, centerValue: string): string {
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (total <= 0) return `<div style="width:180px;height:180px;border-radius:50%;background:#f1f5f9;display:grid;place-items:center;color:#94a3b8;font-size:12px">sem dados</div>`;
    const r = 70, cx = 90, cy = 90, circ = 2 * Math.PI * r;
    let offset = 0;
    const arcs = segments.map(seg => {
        const len = (seg.value / total) * circ;
        const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="26" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += len;
        return arc;
    }).join('');
    return `<svg viewBox="0 0 180 180" style="width:180px;height:180px">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e2942" stroke-width="26"/>
        ${arcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="26" font-weight="800" fill="#f1f5f9" font-family="Inter, sans-serif">${centerValue}</text>
        <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10.5" fill="#94a3b8" font-family="Inter, sans-serif" letter-spacing=".08em">${centerLabel}</text>
    </svg>`;
}

function sparklineSvg(points: number[], color: string, height: number = 60, width: number = 700): string {
    if (points.length < 2) return `<div style="height:${height}px;color:#94a3b8;font-size:12px;padding:20px">Sem dados suficientes</div>`;
    const max = Math.max(...points);
    const min = Math.min(...points);
    const span = max - min || 1;
    const step = width / (points.length - 1);
    const coords = points.map((p, i) => `${(i * step).toFixed(1)},${(height - ((p - min) / span) * (height - 10) - 5).toFixed(1)}`);
    const path = `M ${coords.join(' L ')}`;
    const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
    return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px" preserveAspectRatio="none">
        <defs><linearGradient id="grad-${color.replace('#', '')}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity=".35"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${areaPath}" fill="url(#grad-${color.replace('#', '')})"/>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function dailyBarsSvg(daily: DailyPoint[], height: number = 100): string {
    if (daily.length < 2) return `<div style="height:${height}px;color:#94a3b8;font-size:12px;padding:20px">Sem dados diários</div>`;
    const max = Math.max(...daily.map(d => d.spend), 1);
    const barW = 100 / daily.length;
    return `<svg viewBox="0 0 100 ${height}" style="width:100%;height:${height}px" preserveAspectRatio="none">
        ${daily.map((d, i) => {
            const h = (d.spend / max) * (height - 8);
            const x = i * barW + barW * 0.15;
            const w = barW * 0.7;
            const y = height - h;
            return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#a3d900" rx="1"/>`;
        }).join('')}
    </svg>`;
}

export function renderReportHTML(data: ReportInput): string {
    const periodLabel = data.periodLabel || `${formatDateBR(data.periodStart)} — ${formatDateBR(data.periodEnd)}`;
    const daysCount = daysBetween(data.periodStart, data.periodEnd) + 1;
    const p = data.totalsPrev;

    // KPI cards com delta comparativo
    const kpis: Array<{ label: string; value: string; sub: string; delta: string; invert?: boolean }> = [
        { label: 'Investimento', value: 'R$ ' + fmtBRL(data.totals.spend), sub: `Média R$ ${fmtBRL(data.totals.spend / Math.max(1, daysCount))}/dia`, delta: deltaBadge(data.totals.spend, p?.spend) },
        { label: 'Resultados', value: fmtN(data.totals.conversions), sub: 'Conversões primárias', delta: deltaBadge(data.totals.conversions, p?.conversions) },
        { label: 'Custo/Resultado', value: data.totals.conversions > 0 ? 'R$ ' + fmtBRL(data.totals.spend / data.totals.conversions) : '—', sub: 'CPA médio', delta: deltaBadge(data.totals.conversions > 0 ? data.totals.spend / data.totals.conversions : 0, p && p.conversions > 0 ? p.spend / p.conversions : 0, true), invert: true },
        { label: 'Impressões', value: fmtN(data.totals.impressions), sub: `CPM R$ ${fmtBRL(data.totals.cpm)}`, delta: deltaBadge(data.totals.impressions, p?.impressions) },
        { label: 'Alcance', value: fmtN(data.totals.reach), sub: `Freq. ${data.totals.frequency.toFixed(2)}x`, delta: deltaBadge(data.totals.reach, p?.reach) },
        { label: 'Cliques', value: fmtN(data.totals.clicks), sub: `CPC R$ ${fmtBRL(data.totals.cpc)}`, delta: deltaBadge(data.totals.clicks, p?.clicks) },
        { label: 'CTR', value: fmtPct(data.totals.ctr), sub: 'Taxa de cliques', delta: deltaBadge(data.totals.ctr, p?.ctr) },
        { label: 'Frequência', value: data.totals.frequency.toFixed(2) + 'x', sub: 'Impr. por pessoa', delta: '' },
    ];

    // Colors por objetivo (donut)
    const OBJ_COLORS = ['#a3d900', '#0ea5e9', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6', '#eab308'];
    const objSegs = data.objectiveDist.map((o, i) => ({ value: o.spend, color: OBJ_COLORS[i % OBJ_COLORS.length], label: o.label }));

    // TODOS os criativos ordenados por spend
    const topAdsBlock = data.topAds.length > 0 ? `
      <div class="section-title" style="margin-top:44px">🏆 Ranking de Criativos <span style="color:#64748b;font-weight:500;text-transform:none;letter-spacing:0;font-size:11px">· ${data.topAds.length} anúncios</span></div>
      <div class="creative-grid">
        ${data.topAds.map((ad, i) => `
          <div class="creative-card">
            <div class="creative-rank">#${i + 1}</div>
            ${ad.thumbnail_url
                ? `<div class="creative-thumb">
                     <img class="bg" src="${escapeAttr(ad.thumbnail_url)}" alt="" referrerpolicy="no-referrer"/>
                     <img class="fg" src="${escapeAttr(ad.thumbnail_url)}" alt="" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<div class=creative-thumb-empty>sem preview</div>'"/>
                   </div>`
                : `<div class="creative-thumb"><div class="creative-thumb-empty">sem preview</div></div>`}
            <div class="creative-info">
              <div class="creative-name" title="${escapeAttr(ad.ad_name)}">${escapeHtml(ad.ad_name.slice(0, 60))}${ad.ad_name.length > 60 ? '…' : ''}</div>
              <div class="creative-camp">${escapeHtml((ad.campaign_name || '').slice(0, 50))}</div>
              <div class="creative-metrics">
                <div><span class="ml">${escapeHtml(ad.action_label || 'Result.')}</span><b>${ad.conversions}</b></div>
                <div><span class="ml">Investimento</span><b>R$ ${fmtBRL(ad.spend)}</b></div>
                <div><span class="ml">Custo/${escapeHtml((ad.action_label || 'result.').replace(/s$/, '').toLowerCase())}</span><b>${ad.cpa > 0 ? 'R$ ' + fmtBRL(ad.cpa) : '—'}</b></div>
                <div><span class="ml">CTR</span><b>${(ad.ctr || 0).toFixed(2).replace('.', ',')}%</b></div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>` : '';

    // Insights bullets (highlights automáticos)
    const insightsBlock = data.insights.length > 0 ? `
      <div class="section-title" style="margin-top:44px">💡 Destaques do Período</div>
      <div class="insights-box">
        ${data.insights.map(i => `<div class="insight-row">▸ ${escapeHtml(i)}</div>`).join('')}
      </div>` : '';

    // Campaign cards com breakdowns por campanha
    const campaignCards = data.campaigns.map(c => `
    <div class="camp-card">
      <div class="camp-head">
        <div>
          <div class="camp-obj">${escapeHtml(c.action_label)} · ${escapeHtml(c.objective || '')}</div>
          <h3 class="camp-name">${escapeHtml(c.name)}</h3>
        </div>
        <div class="camp-spend">R$ ${fmtBRL(c.spend)}</div>
      </div>
      <div class="camp-metrics">
        <div class="mini-kpi"><div class="mini-label">${escapeHtml(c.action_label)}</div><div class="mini-value">${fmtN(c.conversions)}</div></div>
        <div class="mini-kpi"><div class="mini-label">Custo/Res.</div><div class="mini-value">R$ ${fmtBRL(c.cpa)}</div></div>
        <div class="mini-kpi"><div class="mini-label">Alcance</div><div class="mini-value">${fmtN(c.reach)}</div></div>
        <div class="mini-kpi"><div class="mini-label">Impressões</div><div class="mini-value">${fmtN(c.impressions)}</div></div>
        <div class="mini-kpi"><div class="mini-label">Cliques</div><div class="mini-value">${fmtN(c.clicks)}</div></div>
        <div class="mini-kpi"><div class="mini-label">CTR</div><div class="mini-value">${fmtPct(c.ctr)}</div></div>
        <div class="mini-kpi"><div class="mini-label">CPC</div><div class="mini-value">R$ ${fmtBRL(c.cpc)}</div></div>
        <div class="mini-kpi"><div class="mini-label">CPM</div><div class="mini-value">R$ ${fmtBRL(c.cpm)}</div></div>
      </div>
      ${c.breakdowns ? renderCampaignBreakdowns(c.breakdowns, c.spend) : ''}
      ${c.ads && c.ads.length > 0 ? `
      <div class="camp-ads">
        <div class="mini-section-title">Anúncios da campanha</div>
        <table class="ad-table">
          <thead><tr>
            <th style="width:24px">#</th><th>Anúncio</th>
            <th style="text-align:right">${escapeHtml(c.action_label)}</th>
            <th style="text-align:right">Invest.</th>
            <th style="text-align:right">CPA</th>
            <th style="text-align:right">CTR</th>
          </tr></thead>
          <tbody>
            ${c.ads.slice(0, 8).map((a, i) => `
              <tr>
                <td><div class="rank-badge ${i === 0 ? 'top' : ''}">${i + 1}</div></td>
                <td>${escapeHtml(a.ad_name.slice(0, 45))}${a.ad_name.length > 45 ? '…' : ''}</td>
                <td style="text-align:right;font-weight:700;color:${a.conversions > 0 ? '#22c55e' : '#94a3b8'}">${a.conversions}</td>
                <td style="text-align:right">R$ ${fmtBRL(a.spend)}</td>
                <td style="text-align:right">${a.cpa > 0 ? 'R$ ' + fmtBRL(a.cpa) : '—'}</td>
                <td style="text-align:right">${((a.ctr) || 0).toFixed(2).replace('.', ',')}%</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>`).join('');

    // Objective distribution as legend
    const objLegend = data.objectiveDist.map((o, i) => `
        <div class="obj-row">
          <span class="obj-dot" style="background:${OBJ_COLORS[i % OBJ_COLORS.length]}"></span>
          <span class="obj-label">${escapeHtml(o.label)}</span>
          <span class="obj-pct">${o.pct.toFixed(1).replace('.', ',')}%</span>
          <span class="obj-spend">R$ ${fmtBRL(o.spend)}</span>
        </div>`).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório — ${escapeHtml(data.accountName)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; background:#0a0e1a; color:#f1f5f9; line-height:1.5; }
  .container { max-width: 1000px; margin: 0 auto; padding: 0 24px 40px; }

  /* ─── COVER ─── */
  .cover { background:linear-gradient(135deg,#0a0e1a 0%,#131a2e 40%,#0a0e1a 100%); color:#fff; padding:56px 24px 48px; border-bottom:1px solid #1e2942; position:relative; overflow:hidden; }
  .cover-inner { max-width: 1000px; margin: 0 auto; position:relative; z-index:1; }
  .cover::before { content:''; position:absolute; top:-100px; right:-100px; width:400px; height:400px; background:radial-gradient(circle,#a3d900 0%,transparent 70%); opacity:.25; border-radius:50%; }
  .cover-brand { display:flex; align-items:center; gap:12px; margin-bottom:32px; position:relative; z-index:1; }
  .cover-brand-mark { width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg,#a3d900,#d3f100); display:grid; place-items:center; font-weight:900; color:#0f172a; font-size:16px; }
  .cover-brand-txt { font-size:15px; font-weight:800; letter-spacing:.02em; }
  .cover-brand-sub { font-size:11px; color:#94a3b8; letter-spacing:.06em; text-transform:uppercase; }
  .cover-tag { display:inline-block; font-size:11px; letter-spacing:.15em; text-transform:uppercase; padding:5px 12px; background:rgba(163,217,0,.15); color:#d3f100; border-radius:20px; font-weight:700; margin-bottom:16px; position:relative; z-index:1; }
  .cover-title { font-size:44px; font-weight:900; letter-spacing:-0.03em; line-height:1.05; margin-bottom:14px; position:relative; z-index:1; }
  .cover-period { font-size:16px; color:#cbd5e1; font-weight:500; position:relative; z-index:1; }
  .cover-period b { color:#fff; font-weight:700; }
  .cover-quick { display:flex; gap:32px; margin-top:32px; padding-top:28px; border-top:1px solid rgba(255,255,255,.1); position:relative; z-index:1; }
  .cq-item .cq-label { font-size:11px; color:#94a3b8; letter-spacing:.06em; text-transform:uppercase; font-weight:600; margin-bottom:4px; }
  .cq-item .cq-val { font-size:22px; font-weight:800; color:#fff; }

  /* ─── SECTIONS ─── */
  .section-title { font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:#94a3b8; font-weight:700; margin: 40px 0 16px; display:flex; align-items:center; gap:8px; }

  .kpi-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; }
  .kpi-card { background:#111726; border:1px solid #1e2942; border-radius:14px; padding:18px 18px; transition:transform .2s; }
  .kpi-label { font-size:11px; color:#94a3b8; margin-bottom:8px; text-transform:uppercase; letter-spacing:.06em; font-weight:700; display:flex; align-items:center; }
  .kpi-value { font-size:24px; font-weight:900; color:#f1f5f9; letter-spacing:-0.02em; line-height:1.1; }
  .kpi-sub { font-size:11px; color:#64748b; margin-top:4px; }

  /* ─── TREND ─── */
  .trend-box { background:#111726; border:1px solid #1e2942; border-radius:14px; padding:20px 24px; }
  .trend-title { font-size:13px; font-weight:700; color:#f1f5f9; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; }
  .trend-title .trend-badge { font-size:11px; font-weight:600; color:#94a3b8; background:#1e2942; padding:3px 10px; border-radius:12px; }
  .trend-labels { display:flex; justify-content:space-between; margin-top:8px; font-size:10px; color:#64748b; }

  /* ─── OBJECTIVE DIST ─── */
  .obj-box { background:#111726; border:1px solid #1e2942; border-radius:14px; padding:24px; display:grid; grid-template-columns: 210px 1fr; gap:32px; align-items:center; }
  .obj-legend { display:flex; flex-direction:column; gap:10px; }
  .obj-row { display:grid; grid-template-columns: 18px 1fr auto auto; gap:10px; font-size:13px; align-items:center; padding:6px 0; border-bottom:1px dashed #1e2942; }
  .obj-row:last-child { border-bottom:0; }
  .obj-dot { width:12px; height:12px; border-radius:3px; display:inline-block; }
  .obj-label { color:#cbd5e1; font-weight:600; }
  .obj-pct { color:#94a3b8; font-weight:700; font-size:12px; }
  .obj-spend { color:#f1f5f9; font-weight:800; font-size:12px; text-align:right; min-width:100px; }

  /* ─── CRIATIVOS ─── */
  .creative-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
  .creative-card { background:#111726; border:1px solid #1e2942; border-radius:14px; overflow:hidden; position:relative; }
  .creative-rank { position:absolute; top:10px; left:10px; z-index:2; background:linear-gradient(135deg,#a3d900,#d3f100); color:#0a0e1a; font-size:12px; font-weight:900; padding:4px 10px; border-radius:8px; box-shadow:0 4px 12px rgba(211,241,0,.35); }
  .creative-thumb { width:100%; aspect-ratio:1/1; background:#000; position:relative; overflow:hidden; }
  .creative-thumb img.bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; filter:blur(30px) brightness(.5); transform:scale(1.2); }
  .creative-thumb img.fg { position:relative; width:100%; height:100%; object-fit:contain; display:block; }
  .creative-thumb-empty { color:#64748b; font-size:12px; font-weight:600; text-align:center; padding-top:40%; }
  .creative-info { padding:14px 16px; }
  .creative-name { font-size:13px; font-weight:700; color:#f1f5f9; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .creative-camp { font-size:11px; color:#64748b; margin-bottom:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .creative-metrics { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; font-size:11.5px; color:#94a3b8; }
  .creative-metrics > div { display:flex; flex-direction:column; gap:2px; }
  .creative-metrics .ml { font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }
  .creative-metrics b { color:#f1f5f9; font-weight:800; font-size:12.5px; }

  /* ─── INSIGHTS ─── */
  .insights-box { background:linear-gradient(135deg,#111726,rgba(211,241,0,.05)); border:1px solid #1e2942; border-radius:14px; padding:20px 24px; }
  .insight-row { font-size:13px; color:#f1f5f9; padding:8px 0; font-weight:500; border-bottom:1px dashed #1e2942; }
  .insight-row:last-child { border-bottom:0; }
  .insight-row::before { content:'▸ '; color:#d3f100; font-weight:800; margin-right:6px; }

  /* ─── CAMPAIGN CARDS ─── */
  .camp-card { background:#111726; border:1px solid #1e2942; border-radius:14px; padding:24px; margin-bottom:14px; }
  .camp-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #1e2942; }
  .camp-obj { font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:#d3f100; font-weight:800; margin-bottom:4px; }
  .camp-name { font-size:16px; font-weight:800; color:#f1f5f9; }
  .camp-spend { font-size:22px; font-weight:900; color:#f1f5f9; }
  .camp-metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:16px; }
  .mini-kpi { background:#0a0e1a; border:1px solid #1e2942; padding:12px 14px; border-radius:10px; }
  .mini-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.05em; font-weight:700; margin-bottom:4px; }
  .mini-value { font-size:15px; font-weight:800; color:#f1f5f9; }
  .mini-section-title { font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:#64748b; font-weight:700; margin: 4px 0 10px; }
  .camp-ads { padding-top:16px; border-top:1px solid #1e2942; }
  .ad-table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .ad-table th { text-align:left; padding:8px 4px; font-weight:700; color:#94a3b8; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid #1e2942; }
  .ad-table td { padding:10px 4px; color:#f1f5f9; border-bottom:1px solid #1e2942; }
  .rank-badge { width:22px; height:22px; border-radius:50%; background:#1e2942; color:#94a3b8; font-size:11px; font-weight:800; display:grid; place-items:center; }
  .rank-badge.top { background:linear-gradient(135deg,#a3d900,#d3f100); color:#0a0e1a; }

  /* ─── BREAKDOWNS por campanha ─── */
  .bd-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; padding-top:16px; border-top:1px solid #1e2942; }
  .bd-card { background:#0a0e1a; border:1px solid #1e2942; border-radius:10px; padding:14px; }
  .bd-title { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:#64748b; font-weight:700; margin-bottom:12px; }
  .bd-row { margin-bottom:8px; font-size:12px; }
  .bd-row-head { display:flex; justify-content:space-between; margin-bottom:4px; }
  .bd-row-head .lbl { color:#f1f5f9; font-weight:600; }
  .bd-row-head .val { color:#94a3b8; font-weight:700; font-size:11px; }
  .bd-bar { height:6px; background:#111726; border-radius:3px; overflow:hidden; }
  .bd-bar-fill { height:100%; border-radius:3px; }

  /* ─── FOOTER ─── */
  .footer { margin-top:56px; padding:24px 0; border-top:1px solid #1e2942; display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:11px; }
  .footer-brand { display:flex; align-items:center; gap:8px; }
  .footer-brand .fb-mark { width:24px; height:24px; border-radius:6px; background:linear-gradient(135deg,#a3d900,#d3f100); display:grid; place-items:center; font-weight:900; color:#0a0e1a; font-size:11px; }

  @media print {
    body { background:#0a0e1a; }
    .container { max-width:none; padding:0; }
    .cover { border-radius:0; }
    .kpi-card, .camp-card, .trend-box, .obj-box, .creative-card { break-inside:avoid; page-break-inside:avoid; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }

  /* ─── TABLET (< 900px) ─── */
  @media (max-width:900px) {
    .obj-box { grid-template-columns:1fr; gap:20px; text-align:center; }
    .obj-box > div:first-child { display:flex; justify-content:center; }
  }

  /* ─── MOBILE (< 720px) ─── */
  @media (max-width:720px) {
    .container { padding:0 16px 32px; }
    .cover { padding:32px 20px 28px; }
    .cover-brand { margin-bottom:20px; gap:10px; }
    .cover-brand-mark { width:34px; height:34px; }
    .cover-brand-txt { font-size:13px; }
    .cover-brand-sub { font-size:10px; }
    .cover-tag { font-size:10px; padding:4px 10px; margin-bottom:10px; }
    .cover-title { font-size:28px; margin-bottom:8px; }
    .cover-period { font-size:13px; }
    .cover-quick { gap:16px; margin-top:20px; padding-top:18px; flex-wrap:wrap; }
    .cq-item { flex:1 1 45%; min-width:120px; }
    .cq-item .cq-val { font-size:18px; }
    .cq-item .cq-label { font-size:10px; }

    .section-title { font-size:11px; margin:28px 0 12px; }

    .kpi-grid { grid-template-columns:repeat(2,1fr); gap:8px; }
    .kpi-card { padding:14px 12px; border-radius:10px; }
    .kpi-value { font-size:19px; }
    .kpi-label { font-size:10px; margin-bottom:6px; }
    .kpi-sub { font-size:10px; }

    .trend-box, .obj-box, .insights-box, .camp-card { padding:16px 14px; border-radius:10px; }

    .creative-grid { grid-template-columns:1fr 1fr; gap:8px; }
    .creative-card { border-radius:10px; }
    .creative-rank { top:6px; left:6px; font-size:10px; padding:3px 8px; }
    .creative-info { padding:10px 12px; }
    .creative-name { font-size:12px; }
    .creative-camp { font-size:10px; margin-bottom:8px; }
    .creative-metrics { font-size:10.5px; gap:4px 8px; }

    .camp-head { flex-direction:column; gap:8px; padding-bottom:12px; margin-bottom:14px; }
    .camp-name { font-size:14px; }
    .camp-spend { font-size:18px; }
    .camp-metrics { grid-template-columns:repeat(2,1fr); gap:6px; margin-bottom:12px; }
    .mini-kpi { padding:9px 10px; border-radius:8px; }
    .mini-value { font-size:13px; }
    .mini-label { font-size:9px; }

    .bd-grid { grid-template-columns:1fr; gap:8px; }
    .bd-card { padding:12px; }
    .bd-title { font-size:10px; margin-bottom:10px; }
    .bd-row { font-size:11px; }
    .bd-row-head .val { font-size:10px; }

    .ad-table { font-size:11px; }
    .ad-table th { font-size:9.5px; padding:6px 3px; }
    .ad-table td { padding:8px 3px; }

    .insight-row { font-size:12px; padding:6px 0; }

    .footer { flex-direction:column; gap:8px; text-align:center; padding:20px 0; font-size:10.5px; }

    .obj-row { grid-template-columns:14px 1fr; row-gap:2px; }
    .obj-row .obj-pct, .obj-row .obj-spend { grid-column:2; text-align:left; font-size:10.5px; }
  }

  /* ─── EXTRA SMALL (< 400px) ─── */
  @media (max-width:400px) {
    .cover-title { font-size:24px; }
    .creative-grid { grid-template-columns:1fr; }
    .cq-item { flex:1 1 100%; }
  }
</style>
</head>
<body>
  <!-- COVER -->
  <div class="cover">
    <div class="cover-inner">
      <div class="cover-brand">
        <div class="cover-brand-mark">A</div>
        <div>
          <div class="cover-brand-txt">${escapeHtml(data.agencyName)}</div>
          <div class="cover-brand-sub">Powered by TrafficAI</div>
        </div>
      </div>
      <div class="cover-tag">Relatório de Performance</div>
      <h1 class="cover-title">${escapeHtml(data.accountName)}</h1>
      <div class="cover-period">📅 <b>${periodLabel}</b> · ${daysCount} dias · ${data.counts.campaigns} campanhas · ${data.counts.ads} anúncios</div>

      <div class="cover-quick">
        <div class="cq-item"><div class="cq-label">Investimento</div><div class="cq-val">R$ ${fmtBRL(data.totals.spend)}</div></div>
        <div class="cq-item"><div class="cq-label">Resultados</div><div class="cq-val">${fmtN(data.totals.conversions)}</div></div>
        <div class="cq-item"><div class="cq-label">CPA médio</div><div class="cq-val">${data.totals.conversions > 0 ? 'R$ ' + fmtBRL(data.totals.spend / data.totals.conversions) : '—'}</div></div>
        <div class="cq-item"><div class="cq-label">Impressões</div><div class="cq-val">${fmtN(data.totals.impressions)}</div></div>
      </div>
    </div>
  </div>

  <div class="container">

    <!-- KPI GRID -->
    <div class="section-title">📊 Sumário Executivo${p ? ' <span style="color:#94a3b8;font-weight:500;text-transform:none;letter-spacing:0;font-size:11px">· vs. período anterior</span>' : ''}</div>
    <div class="kpi-grid">
      ${kpis.map(k => `
        <div class="kpi-card">
          <div class="kpi-label">${k.label} ${k.delta}</div>
          <div class="kpi-value">${k.value}</div>
          <div class="kpi-sub">${k.sub}</div>
        </div>`).join('')}
    </div>

    <!-- TENDÊNCIA -->
    <div class="section-title">📈 Evolução Diária</div>
    <div class="trend-box">
      <div class="trend-title">
        <span>Investimento por dia</span>
        <span class="trend-badge">${daysCount} dias</span>
      </div>
      ${dailyBarsSvg(data.daily, 90)}
      <div class="trend-labels">
        <span>${data.daily.length > 0 ? formatDateBR(data.daily[0].date) : ''}</span>
        <span>${data.daily.length > 0 ? formatDateBR(data.daily[data.daily.length - 1].date) : ''}</span>
      </div>
    </div>

    <!-- OBJETIVOS -->
    ${data.objectiveDist.length > 0 ? `
    <div class="section-title">🎯 Distribuição por Objetivo</div>
    <div class="obj-box">
      <div>${donutSvg(objSegs, 'CAMPANHAS', String(data.counts.campaigns))}</div>
      <div class="obj-legend">${objLegend}</div>
    </div>` : ''}

    ${topAdsBlock}
    ${insightsBlock}

    <!-- CAMPANHAS -->
    ${data.campaigns.length > 0 ? `
      <div class="section-title">🚀 Performance por Campanha</div>
      ${campaignCards}` : ''}

    <div class="footer">
      <div class="footer-brand">
        <div class="fb-mark">A</div>
        <span>${escapeHtml(data.agencyName)} · Powered by TrafficAI</span>
      </div>
      <div>${escapeHtml(data.accountName)}</div>
      <div>Gerado em ${formatDateBR(new Date().toISOString().slice(0, 10))}</div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: any): string {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const PP_LABELS: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Aud. Network', messenger: 'Messenger' };
const POS_LABELS: Record<string, string> = { feed: 'Feed', story: 'Stories', reels: 'Reels', instagram_reels: 'Reels IG', facebook_reels: 'Reels FB', marketplace: 'Marketplace', video_feeds: 'Vídeo Feed', instream_video: 'In-Stream', search: 'Search', biz_disco_feed: 'Feed Business', instagram_search: 'Busca IG', instagram_explore: 'Explorar IG' };
const DEV_LABELS: Record<string, string> = { iphone: '📱 iPhone', android_smartphone: '📱 Android', ipad: 'iPad', android_tablet: 'Tablet Android', desktop: '💻 Desktop', other: 'Outros' };

function renderBreakdownList(rows: BreakdownRow[], title: string, totalSpend: number, color: string, labelMap: Record<string, string> = {}): string {
    if (!rows || rows.length === 0) return '';
    const max = Math.max(...rows.map(r => r.spend), 1);
    return `<div class="bd-card">
        <div class="bd-title">${title}</div>
        ${rows.slice(0, 6).map(r => {
            const pct = max > 0 ? (r.spend / max) * 100 : 0;
            const spendPct = totalSpend > 0 ? (r.spend / totalSpend) * 100 : 0;
            const label = labelMap[r.label] || (r.label ? r.label.charAt(0).toUpperCase() + r.label.slice(1).replace(/_/g, ' ') : 'Outros');
            return `<div class="bd-row">
                <div class="bd-row-head">
                    <span class="lbl">${escapeHtml(label)}</span>
                    <span class="val">R$ ${fmtBRL(r.spend)} · ${spendPct.toFixed(1).replace('.', ',')}%</span>
                </div>
                <div class="bd-bar"><div class="bd-bar-fill" style="width:${pct}%;background:${color}"></div></div>
            </div>`;
        }).join('')}
    </div>`;
}

function renderCampaignBreakdowns(bd: CampaignBreakdowns, campSpend: number): string {
    const parts: string[] = [];
    if (bd.publisher_platform?.length) parts.push(renderBreakdownList(bd.publisher_platform, 'Plataforma', campSpend, '#38bdf8', PP_LABELS));
    if (bd.platform_position?.length) parts.push(renderBreakdownList(bd.platform_position, 'Posicionamento', campSpend, '#d3f100', POS_LABELS));
    if (bd.impression_device?.length) parts.push(renderBreakdownList(bd.impression_device, 'Dispositivo', campSpend, '#8b5cf6', DEV_LABELS));
    if (bd.region?.length) parts.push(renderBreakdownList(bd.region.slice(0, 6), 'Top Regiões', campSpend, '#22c55e'));
    if (parts.length === 0) return '';
    return `<div class="bd-grid">${parts.join('')}</div>`;
}
function escapeAttr(s: any): string {
    return String(s || '').replace(/["']/g, c => c === '"' ? '&quot;' : '&#39;');
}
function formatDateBR(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}
function daysBetween(a: string, b: string): number {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/**
 * Salva HTML como snapshot público acessível via /r/pdf/:token.
 */
export async function saveReportSnapshot(userId: string, accountId: string, html: string, meta: { periodStart: string; periodEnd: string; accountName: string }): Promise<{ token: string; url: string }> {
    const token = crypto.randomBytes(18).toString('hex');
    await query(
        `INSERT INTO report_pdf_snapshots (token, user_id, account_id, html, period_start, period_end, account_name, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [token, userId, accountId, html, meta.periodStart, meta.periodEnd, meta.accountName]
    );
    const baseUrl = process.env.PUBLIC_API_URL || 'https://api.alfamaxdigital.com.br';
    const url = `${baseUrl}/api/v1/r/pdf/${token}`;
    logger.info('pdf-report: snapshot salvo', { userId, accountId, token });
    return { token, url };
}

/**
 * Monta ReportInput completo com dados do banco + top ads da Meta API.
 */
export async function buildReportForAccount(userId: string, accountId: string, periodStart: string, periodEnd: string): Promise<ReportInput> {
    const accRows = await query<any>(
        `SELECT id, account_name, meta_account_id FROM ad_accounts WHERE id = $1 AND user_id = $2`,
        [accountId, userId]
    );
    if (!accRows.length) throw new Error('Conta não encontrada');
    const acc = accRows[0];

    // Nome da agência (report_settings ou default)
    const settingsRows = await query<any>(
        `SELECT agency_name FROM report_settings WHERE account_id = $1 LIMIT 1`,
        [accountId]
    );
    const agencyName = settingsRows[0]?.agency_name || 'Alfamax Digital';

    // Totais período atual
    const totals = await queryTotals(accountId, periodStart, periodEnd);

    // Totais período anterior (mesma duração)
    const days = daysBetween(periodStart, periodEnd) + 1;
    const prevEnd = shiftDate(periodStart, -1);
    const prevStart = shiftDate(prevEnd, -(days - 1));
    const totalsPrev = await queryTotals(accountId, prevStart, prevEnd).catch(() => null);

    // Séries diárias
    const dailyRows = await query<any>(`
        SELECT ih.date::text AS date,
               COALESCE(SUM(ih.spend),0)::float AS spend,
               COALESCE(SUM(ih.clicks),0)::int AS clicks,
               COALESCE(SUM(ih.conversions),0)::int AS conversions
        FROM insights_history ih
        JOIN campaigns c ON ih.campaign_id = c.id
        WHERE c.account_id = $1 AND ih.date BETWEEN $2::date AND $3::date
        GROUP BY ih.date
        ORDER BY ih.date ASC
    `, [accountId, periodStart, periodEnd]);
    const daily: DailyPoint[] = dailyRows.map((r: any) => ({
        date: r.date, spend: Number(r.spend), clicks: Number(r.clicks), conversions: Number(r.conversions),
    }));

    // Por campanha
    const campRows = await query<any>(`
        SELECT c.id, c.meta_campaign_id, c.name, c.objective,
               COALESCE(SUM(ih.spend),0)::float AS spend,
               COALESCE(SUM(ih.impressions),0)::float AS impressions,
               COALESCE(SUM(ih.reach),0)::float AS reach,
               COALESCE(SUM(ih.clicks),0)::float AS clicks,
               COALESCE(SUM(ih.conversions),0)::float AS conversions
        FROM campaigns c
        LEFT JOIN insights_history ih ON ih.campaign_id = c.id
            AND ih.date BETWEEN $2::date AND $3::date
        WHERE c.account_id = $1
        GROUP BY c.id, c.meta_campaign_id
        HAVING COALESCE(SUM(ih.spend),0) > 0
        ORDER BY spend DESC
    `, [accountId, periodStart, periodEnd]);

    const campaigns = campRows.map((c: any) => {
        const spend = Number(c.spend);
        const clicks = Number(c.clicks);
        const impr = Number(c.impressions);
        const conv = Number(c.conversions);
        return {
            id: c.id, meta_campaign_id: c.meta_campaign_id, name: c.name, objective: c.objective || '',
            spend, impressions: impr, reach: Number(c.reach), clicks, conversions: conv,
            action_label: labelForObjective(c.objective),
            ctr: impr > 0 ? (clicks / impr) * 100 : 0,
            cpc: clicks > 0 ? spend / clicks : 0,
            cpm: impr > 0 ? (spend / impr) * 1000 : 0,
            cpa: conv > 0 ? spend / conv : 0,
            ads: [] as AdRow[],
        };
    });

    // Distribuição por objetivo
    const objMap = new Map<string, number>();
    for (const c of campaigns) {
        objMap.set(c.action_label, (objMap.get(c.action_label) || 0) + c.spend);
    }
    const totalObjSpend = Array.from(objMap.values()).reduce((s, v) => s + v, 0);
    const objectiveDist = Array.from(objMap.entries())
        .map(([label, spend]) => ({ label, spend, pct: totalObjSpend > 0 ? (spend / totalObjSpend) * 100 : 0 }))
        .sort((a, b) => b.spend - a.spend);

    // TODOS os criativos do período + thumbnails alta res (falha silenciosa se sem token)
    let topAds: AdRow[] = [];
    let breakdowns: any = null;
    let campaignBreakdowns: Map<string, any> = new Map();
    try {
        const accessToken = await getUserAccessToken(userId);
        // Pega insights nível ad para o período completo
        const raw = await metaService.getAdInsightsForReport(userId, accessToken, acc.meta_account_id, periodStart, periodEnd);
        const adIds = raw.map((r: any) => r.ad_id).filter(Boolean);
        // Busca thumbnails com fields expandidos (asset_feed / object_story / image_url)
        const thumbMap = adIds.length > 0
            ? await metaService.getAdThumbnails(userId, accessToken, acc.meta_account_id, adIds)
            : new Map();
        // Determina a AÇÃO DOMINANTE da conta (a métrica que domina o gasto).
        // Todos os ads mostram essa mesma métrica pra consistência com o KPI geral.
        const allActionsArr = raw.map((r: any) => r.actions || []);
        const dominant = extractDominantAction(allActionsArr);

        topAds = raw.map((r: any) => {
            const spend = parseFloat(r.spend || '0');
            const impressions = parseInt(r.impressions || '0', 10);
            const clicks = parseInt(r.clicks || '0', 10);
            const actions: any[] = r.actions || [];
            // Se temos ação dominante, extrai APENAS ela (pode ser 0 pra ads sem essa ação).
            // Se não temos (nenhuma conta com priority action), cai no fallback.
            let convCount = 0;
            let convLabel = 'Result.';
            if (dominant) {
                convCount = extractSpecificAction(actions, dominant.type);
                convLabel = dominant.label;
            } else {
                const p = extractPrimaryAction(actions);
                convCount = p.count;
                convLabel = p.label;
            }
            return {
                ad_name: r.ad_name || '(sem nome)',
                campaign_name: r.campaign_name || '',
                spend, conversions: convCount, reach: 0,
                cpa: convCount > 0 ? spend / convCount : 0,
                ctr: impressions > 0 ? (clicks / impressions) * 100 : parseFloat(r.ctr || '0'),
                thumbnail_url: thumbMap.get(r.ad_id) || null,
                action_label: convLabel,
            };
        })
        // Filtra ads com gasto muito baixo (poluem o ranking): pelo menos R$ 1
        .filter(a => a.spend >= 1.0)
        // Ranking por performance: quem tem resultado ordena por CPA (menor = melhor);
        // ads sem resultado vão pro fim, ordenados por spend desc
        .sort((a, b) => {
            if (a.conversions > 0 && b.conversions > 0) return a.cpa - b.cpa;
            if (a.conversions > 0) return -1;
            if (b.conversions > 0) return 1;
            return b.spend - a.spend;
        });

        // Baixa thumbnails como base64 pra embutir direto no HTML (Meta URLs expiram/protegidas)
        const thumbUrls = topAds.map(a => a.thumbnail_url).filter(Boolean) as string[];
        if (thumbUrls.length > 0) {
            const base64Map = await fetchThumbsAsBase64(thumbUrls);
            for (const ad of topAds) {
                if (ad.thumbnail_url && base64Map.has(ad.thumbnail_url)) {
                    ad.thumbnail_url = base64Map.get(ad.thumbnail_url)!;
                } else if (ad.thumbnail_url) {
                    // fetch falhou — remove pra mostrar placeholder ao invés de img quebrada
                    ad.thumbnail_url = null;
                }
            }
        }

        // Breakdowns agregados + por campanha (paralelo)
        const [bd, byC] = await Promise.all([
            metaService.getBreakdownInsights(userId, accessToken, acc.meta_account_id, periodStart, periodEnd).catch(() => null),
            metaService.getBreakdownInsightsByCampaign(userId, accessToken, acc.meta_account_id, periodStart, periodEnd).catch(() => new Map()),
        ]);
        breakdowns = bd;
        campaignBreakdowns = byC;
        for (const c of campaigns) {
            const mcid = (c as any).meta_campaign_id;
            if (mcid && byC.has(mcid)) {
                (c as any).breakdowns = byC.get(mcid);
            }
        }
    } catch (err: any) {
        logger.warn('pdf-report: falha ao buscar criativos/breakdowns', { userId, accountId, error: err.message });
    }

    // Insights automáticos (highlights)
    const insights: string[] = [];
    if (campaigns.length > 0) {
        const best = campaigns.reduce((a, b) => (a.conversions > b.conversions ? a : b));
        if (best.conversions > 0) {
            insights.push(`Melhor campanha: "${best.name}" com ${best.conversions} ${best.action_label.toLowerCase()} a R$ ${fmtBRL(best.cpa)} cada.`);
        }
        const cheapest = campaigns.filter(c => c.conversions > 0).sort((a, b) => a.cpa - b.cpa)[0];
        if (cheapest && cheapest.id !== best.id) {
            insights.push(`Menor CPA: "${cheapest.name}" com R$ ${fmtBRL(cheapest.cpa)}/${cheapest.action_label.toLowerCase().slice(0, -1)}.`);
        }
    }
    if (totalsPrev && totalsPrev.spend > 0) {
        const spendDelta = ((totals.spend - totalsPrev.spend) / totalsPrev.spend) * 100;
        if (Math.abs(spendDelta) >= 10) {
            insights.push(`Investimento ${spendDelta > 0 ? 'aumentou' : 'reduziu'} ${Math.abs(spendDelta).toFixed(1).replace('.', ',')}% vs. período anterior.`);
        }
        if (totalsPrev.conversions > 0) {
            const convDelta = ((totals.conversions - totalsPrev.conversions) / totalsPrev.conversions) * 100;
            if (Math.abs(convDelta) >= 10) {
                insights.push(`Resultados ${convDelta > 0 ? 'cresceram' : 'caíram'} ${Math.abs(convDelta).toFixed(1).replace('.', ',')}% (${totalsPrev.conversions} → ${totals.conversions}).`);
            }
        }
    }
    const avgCtr = totals.ctr;
    if (avgCtr >= 2) insights.push(`CTR médio de ${avgCtr.toFixed(2).replace('.', ',')}% está acima da média do mercado (1,5–2%).`);

    // Total de ads sem filtro de spend
    const adCount = await query<any>(
        `SELECT COUNT(DISTINCT c.id)::int AS n FROM campaigns c WHERE c.account_id = $1 AND c.status IN ('ACTIVE','PAUSED')`,
        [accountId]
    );

    return {
        accountId,
        accountName: acc.account_name,
        periodStart, periodEnd,
        periodLabel: buildPeriodLabel(periodStart, periodEnd),
        agencyName,
        totals,
        totalsPrev,
        counts: { campaigns: campaigns.length, ads: adCount[0]?.n || 0 },
        daily,
        objectiveDist,
        campaigns,
        topAds,
        insights,
        breakdowns,
    };
}

async function queryTotals(accountId: string, periodStart: string, periodEnd: string): Promise<Totals> {
    const t = await query<any>(`
        SELECT COALESCE(SUM(ih.spend),0)::float AS spend,
               COALESCE(SUM(ih.impressions),0)::float AS impressions,
               COALESCE(SUM(ih.reach),0)::float AS reach,
               COALESCE(SUM(ih.clicks),0)::float AS clicks,
               COALESCE(SUM(ih.conversions),0)::float AS conversions,
               COALESCE(AVG(NULLIF(ih.frequency,0)),0)::float AS frequency
        FROM insights_history ih
        JOIN campaigns c ON ih.campaign_id = c.id
        WHERE c.account_id = $1 AND ih.date BETWEEN $2::date AND $3::date
    `, [accountId, periodStart, periodEnd]);
    const r = t[0] || {};
    return {
        spend: Number(r.spend) || 0,
        impressions: Number(r.impressions) || 0,
        reach: Number(r.reach) || 0,
        clicks: Number(r.clicks) || 0,
        conversions: Number(r.conversions) || 0,
        ctr: r.impressions > 0 ? (Number(r.clicks) / Number(r.impressions)) * 100 : 0,
        cpc: r.clicks > 0 ? Number(r.spend) / Number(r.clicks) : 0,
        cpm: r.impressions > 0 ? (Number(r.spend) / Number(r.impressions)) * 1000 : 0,
        frequency: Number(r.frequency) || 0,
    };
}

const ACTION_PRIORITY = [
    { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
    { type: 'purchase', label: 'Compras' },
    { type: 'offsite_conversion.fb_pixel_lead', label: 'Leads' },
    { type: 'lead', label: 'Leads' },
    { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Conversas' },
    { type: 'onsite_conversion.total_messaging_connection', label: 'Conversas' },
    { type: 'link_click', label: 'Cliques' },
    { type: 'post_engagement', label: 'Engaj.' },
];

function extractPrimaryAction(actions: any[]): { count: number; label: string } {
    for (const p of ACTION_PRIORITY) {
        const m = actions.find(a => a.action_type === p.type);
        if (m && parseInt(m.value, 10) > 0) return { count: parseInt(m.value, 10), label: p.label };
    }
    return { count: 0, label: 'Result.' };
}

/**
 * Determina a ação primária DOMINANTE de toda a conta somando todas as actions dos ads.
 * Retorna o mesmo formato do extractPrimaryAction. Isso garante consistência: se a maioria
 * do gasto foi em campanhas de Conversas, TODOS os ads mostram Conversas (mesmo se 0).
 */
function extractDominantAction(allActions: any[][]): { type: string; label: string } | null {
    const agg = new Map<string, number>();
    for (const actions of allActions) {
        if (!Array.isArray(actions)) continue;
        for (const a of actions) {
            const cur = agg.get(a.action_type) || 0;
            agg.set(a.action_type, cur + (parseInt(a.value, 10) || 0));
        }
    }
    // Pega o tipo com mais volume dentro dos que estão na priority list
    let best: { type: string; label: string; count: number } | null = null;
    for (const p of ACTION_PRIORITY) {
        const c = agg.get(p.type) || 0;
        if (c > 0 && (!best || c > best.count)) {
            best = { type: p.type, label: p.label, count: c };
        }
    }
    return best ? { type: best.type, label: best.label } : null;
}

/** Extrai valor de UMA ação específica (usa quando temos ação dominante coordenada). */
function extractSpecificAction(actions: any[], type: string): number {
    const m = (actions || []).find(a => a.action_type === type);
    return m ? (parseInt(m.value, 10) || 0) : 0;
}

function shiftDate(iso: string, days: number): string {
    const d = new Date(iso + 'T00:00:00');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function buildPeriodLabel(start: string, end: string): string {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
    if (sameMonth) {
        return `${s.getUTCDate().toString().padStart(2, '0')} a ${e.getUTCDate().toString().padStart(2, '0')} de ${monthName(s.getUTCMonth())} ${s.getUTCFullYear()}`;
    }
    return `${formatDateBR(start)} → ${formatDateBR(end)}`;
}
function monthName(m: number): string {
    return ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m];
}

function labelForObjective(obj: string): string {
    const map: Record<string, string> = {
        OUTCOME_LEADS: 'Leads', LEAD_GENERATION: 'Leads',
        OUTCOME_SALES: 'Vendas', CONVERSIONS: 'Vendas', PRODUCT_CATALOG_SALES: 'Vendas',
        OUTCOME_ENGAGEMENT: 'Engajamento', POST_ENGAGEMENT: 'Engajamento',
        MESSAGES: 'Conversas', OUTCOME_MESSAGES: 'Conversas',
        OUTCOME_TRAFFIC: 'Tráfego', LINK_CLICKS: 'Tráfego',
        OUTCOME_AWARENESS: 'Alcance', BRAND_AWARENESS: 'Alcance', REACH: 'Alcance',
        VIDEO_VIEWS: 'Visualizações', OUTCOME_APP_PROMOTION: 'App',
    };
    return map[obj] || 'Outros';
}
