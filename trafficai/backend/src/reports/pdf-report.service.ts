// ==============================
// PDF Report Service — gera HTML profissional (formato AdsDaily)
// pronto pra imprimir/converter em PDF via browser ou puppeteer futuro.
//
// Estratégia inicial: gera HTML self-contained + salva em daily_report_pdfs
// e serve via link público /r/pdf/:token. Cliente abre no navegador e usa
// "Salvar como PDF". Futuro: adicionar puppeteer pra gerar PDF real automatic.
// ==============================

import crypto from 'crypto';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

interface CampaignRow {
    id: string;
    name: string;
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
}

interface AdRow {
    ad_name: string;
    spend: number;
    conversions: number;
    cpa: number;
    reach: number;
}

interface ReportInput {
    accountId: string;
    accountName: string;
    periodStart: string;   // YYYY-MM-DD
    periodEnd: string;     // YYYY-MM-DD
    totals: {
        spend: number;
        impressions: number;
        reach: number;
        clicks: number;
        ctr: number;
        cpc: number;
        cpm: number;
        frequency: number;
    };
    counts: {
        campaigns: number;
        ads: number;
    };
    campaigns: Array<CampaignRow & { ads?: AdRow[] }>;
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

function donutSvg(value: number, label: string, color: string = '#a3d900'): string {
    return `
    <svg viewBox="0 0 120 120" style="width:110px;height:110px">
      <circle cx="60" cy="60" r="50" fill="none" stroke="#e8ebf0" stroke-width="14"/>
      <circle cx="60" cy="60" r="50" fill="none" stroke="${color}" stroke-width="14"
              stroke-dasharray="314" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
      <text x="60" y="60" text-anchor="middle" font-size="24" font-weight="800" fill="#1a1e26"
            font-family="Inter, sans-serif">${value.toLocaleString('pt-BR')}</text>
      <text x="60" y="78" text-anchor="middle" font-size="10" fill="#7a8290"
            font-family="Inter, sans-serif">${label}</text>
    </svg>`;
}

function segmentBar(label: string, count: number, spend: number, impr: number, maxCount: number): string {
    const pct = maxCount > 0 ? Math.min(100, (count / maxCount) * 100) : 0;
    return `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:#333;font-weight:500">${label}</span>
        <span style="color:#1a1e26;font-weight:700">${count}</span>
      </div>
      <div style="height:6px;background:#eef1f4;border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#a3d900,#d3f100);border-radius:3px"></div>
      </div>
      <div style="font-size:10px;color:#7a8290;margin-top:4px">R$ ${fmtBRL(spend)} · ${fmtN(impr)} impr.</div>
    </div>`;
}

export function renderReportHTML(data: ReportInput): string {
    const periodLabel = `${formatDateBR(data.periodStart)} — ${formatDateBR(data.periodEnd)}`;

    const kpis = [
        { label: 'Invest.', value: 'R$ ' + fmtBRL(data.totals.spend), sub: 'Período total' },
        { label: 'CTR', value: fmtPct(data.totals.ctr), sub: 'Cliques/Impr.' },
        { label: 'Impress.', value: fmtN(data.totals.impressions), sub: 'CPM: R$ ' + fmtBRL(data.totals.cpm) },
        { label: 'Alcance', value: fmtN(data.totals.reach), sub: 'Freq.: ' + data.totals.frequency.toFixed(2) + 'x' },
        { label: 'Cliques', value: fmtN(data.totals.clicks), sub: 'Total período' },
        { label: 'CPC', value: 'R$ ' + fmtBRL(data.totals.cpc), sub: 'Custo/clique' },
    ];

    const campaignCards = data.campaigns.map(c => `
    <div style="border:1px solid #e8ebf0;border-radius:12px;padding:24px;margin-bottom:16px;background:#fff">
      <h3 style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1a1e26">${escapeHtml(c.name)}</h3>
      <div style="display:grid;grid-template-columns:1fr 130px;gap:24px;align-items:center">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:6px 0;color:#7a8290">Investimento</td><td style="text-align:right;font-weight:700">R$ ${fmtBRL(c.spend)}</td></tr>
          <tr><td style="padding:6px 0;color:#7a8290">${c.action_label}</td><td style="text-align:right;font-weight:800;color:#7bb800">${fmtN(c.conversions)}</td></tr>
          <tr><td style="padding:6px 0;color:#7a8290">Custo/Res.</td><td style="text-align:right;font-weight:700">R$ ${fmtBRL(c.cpa)}</td></tr>
          <tr><td style="padding:6px 0;color:#7a8290">Alcance</td><td style="text-align:right;font-weight:700">${fmtN(c.reach)}</td></tr>
          <tr><td style="padding:6px 0;color:#7a8290">Impressões</td><td style="text-align:right;font-weight:700">${fmtN(c.impressions)}</td></tr>
          <tr><td style="padding:6px 0;color:#7a8290">Cliques</td><td style="text-align:right;font-weight:700">${fmtN(c.clicks)}</td></tr>
          <tr><td style="padding:6px 0;color:#7a8290">CTR</td><td style="text-align:right;font-weight:700">${fmtPct(c.ctr)}</td></tr>
          <tr><td style="padding:6px 0;color:#7a8290">CPC</td><td style="text-align:right;font-weight:700">R$ ${fmtBRL(c.cpc)}</td></tr>
        </table>
        <div style="text-align:center">
          ${donutSvg(c.conversions, c.action_label)}
        </div>
      </div>

      ${c.ads && c.ads.length > 0 ? `
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eef1f4">
        <div style="font-size:11px;color:#7a8290;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;font-weight:700">Ranking de Criativos</div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="color:#7a8290;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase">
              <th style="text-align:left;padding:8px 0;font-weight:600">#</th>
              <th style="text-align:left;padding:8px 6px;font-weight:600">Anúncio</th>
              <th style="text-align:right;padding:8px 6px;font-weight:600">${c.action_label}</th>
              <th style="text-align:right;padding:8px 6px;font-weight:600">Invest.</th>
              <th style="text-align:right;padding:8px 6px;font-weight:600">Custo/Res.</th>
              <th style="text-align:right;padding:8px 6px;font-weight:600">Alcance</th>
            </tr>
          </thead>
          <tbody>
            ${c.ads.map((a, i) => `
              <tr style="border-top:1px solid #f2f4f7">
                <td style="padding:10px 0">
                  <div style="width:22px;height:22px;border-radius:50%;background:${i === 0 ? 'linear-gradient(135deg,#a3d900,#d3f100)' : '#eef1f4'};color:${i === 0 ? '#1a1e26' : '#7a8290'};font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</div>
                </td>
                <td style="padding:10px 6px;color:#1a1e26">${escapeHtml(a.ad_name.slice(0, 40))}</td>
                <td style="padding:10px 6px;text-align:right;font-weight:700;color:${a.conversions > 0 ? '#7bb800' : '#c0c4ca'}">${a.conversions}</td>
                <td style="padding:10px 6px;text-align:right">R$ ${fmtBRL(a.spend)}</td>
                <td style="padding:10px 6px;text-align:right;font-weight:600;color:${a.cpa > 0 ? '#1a1e26' : '#c0c4ca'}">${a.cpa > 0 ? 'R$ ' + fmtBRL(a.cpa) : '—'}</td>
                <td style="padding:10px 6px;text-align:right">${fmtN(a.reach)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>`).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Meta Ads — ${escapeHtml(data.accountName)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Inter', sans-serif; background:#f7f8fa; color:#1a1e26; padding:32px; line-height:1.5; }
  .container { max-width: 820px; margin: 0 auto; }
  .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:32px; padding-bottom:20px; border-bottom:1px solid #e8ebf0; }
  .logo { display:flex; align-items:center; gap:10px; }
  .logo-mark { width:34px; height:34px; border-radius:8px; background:linear-gradient(135deg,#a3d900,#d3f100); display:grid; place-items:center; font-weight:900; color:#1a1e26; font-size:14px; }
  .logo-txt { font-weight:800; font-size:16px; color:#1a1e26; }
  .meta-badge { font-size:12px; color:#7a8290; }
  .meta-badge b { color:#0866ff; font-weight:700; }
  h1 { font-size:32px; font-weight:800; letter-spacing:-0.02em; margin-bottom:8px; }
  .subtitle { color:#7a8290; font-size:14px; margin-bottom:32px; }
  .subtitle span { color:#1a1e26; font-weight:600; margin: 0 6px; }

  .section-title { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#7a8290; font-weight:700; margin: 32px 0 14px; }

  .kpi-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom: 12px; }
  .kpi-card { background:#fff; border:1px solid #e8ebf0; border-radius:12px; padding:16px 18px; }
  .kpi-label { font-size:11.5px; color:#7a8290; margin-bottom:6px; text-transform:uppercase; letter-spacing:.04em; font-weight:500; }
  .kpi-value { font-size:22px; font-weight:800; color:#1a1e26; letter-spacing:-0.01em; }
  .kpi-sub { font-size:10.5px; color:#7a8290; margin-top:3px; }

  @media print { body { background:#fff; padding:0; } .container { max-width:none; } }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="logo">
      <div class="logo-mark">T</div>
      <div class="logo-txt">TrafficAI</div>
    </div>
    <div class="meta-badge">Relatório · <b>Meta Ads</b></div>
  </div>

  <h1>${escapeHtml(data.accountName)}</h1>
  <p class="subtitle">
    ${periodLabel}
    <span style="color:#c0c4ca">·</span>
    <span>${data.counts.ads}</span> anúncios
    <span style="color:#c0c4ca">·</span>
    <span>${data.counts.campaigns}</span> campanhas
  </p>

  <div class="section-title">Resultados Gerais</div>
  <div class="kpi-grid">
    ${kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>`).join('')}
  </div>

  <div class="section-title" style="margin-top:36px">Performance por Campanha</div>
  ${campaignCards}

  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e8ebf0;display:flex;justify-content:space-between;align-items:center;color:#7a8290;font-size:11px">
    <div class="logo" style="opacity:.6">
      <div class="logo-mark" style="width:24px;height:24px;font-size:11px">T</div>
      <span class="logo-txt" style="font-size:12px">TrafficAI</span>
    </div>
    <div>${escapeHtml(data.accountName)} · ${formatDateBR(data.periodEnd)}</div>
    <div>© 2026</div>
  </div>

</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

function formatDateBR(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

/**
 * Salva HTML como snapshot público acessível via /r/pdf/:token pra
 * o cliente abrir no navegador + "Salvar como PDF".
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
 * Puxa dados do banco + monta ReportInput.
 */
export async function buildReportForAccount(userId: string, accountId: string, periodStart: string, periodEnd: string): Promise<ReportInput> {
    const accRows = await query<any>(
        `SELECT id, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2`,
        [accountId, userId]
    );
    if (!accRows.length) throw new Error('Conta não encontrada');
    const acc = accRows[0];

    // Totais agregados
    const t = await query<any>(`
        SELECT COALESCE(SUM(ih.spend),0)::float AS spend,
               COALESCE(SUM(ih.impressions),0)::float AS impressions,
               COALESCE(SUM(ih.reach),0)::float AS reach,
               COALESCE(SUM(ih.clicks),0)::float AS clicks,
               COALESCE(AVG(NULLIF(ih.frequency,0)),0)::float AS frequency
        FROM insights_history ih
        JOIN campaigns c ON ih.campaign_id = c.id
        WHERE c.account_id = $1 AND ih.date BETWEEN $2::date AND $3::date
    `, [accountId, periodStart, periodEnd]);
    const total = t[0] || {};
    const totals = {
        spend: Number(total.spend) || 0,
        impressions: Number(total.impressions) || 0,
        reach: Number(total.reach) || 0,
        clicks: Number(total.clicks) || 0,
        ctr: total.impressions > 0 ? (Number(total.clicks) / Number(total.impressions)) * 100 : 0,
        cpc: total.clicks > 0 ? Number(total.spend) / Number(total.clicks) : 0,
        cpm: total.impressions > 0 ? (Number(total.spend) / Number(total.impressions)) * 1000 : 0,
        frequency: Number(total.frequency) || 0,
    };

    // Por campanha
    const camps = await query<any>(`
        SELECT c.id, c.name, c.objective,
               COALESCE(SUM(ih.spend),0)::float AS spend,
               COALESCE(SUM(ih.impressions),0)::float AS impressions,
               COALESCE(SUM(ih.reach),0)::float AS reach,
               COALESCE(SUM(ih.clicks),0)::float AS clicks,
               COALESCE(SUM(ih.conversions),0)::float AS conversions
        FROM campaigns c
        LEFT JOIN insights_history ih ON ih.campaign_id = c.id
            AND ih.date BETWEEN $2::date AND $3::date
        WHERE c.account_id = $1
        GROUP BY c.id
        HAVING COALESCE(SUM(ih.spend),0) > 0
        ORDER BY spend DESC
    `, [accountId, periodStart, periodEnd]);

    const campaigns = camps.map((c: any) => {
        const spend = Number(c.spend);
        const clicks = Number(c.clicks);
        const impr = Number(c.impressions);
        const conv = Number(c.conversions);
        return {
            id: c.id,
            name: c.name,
            spend, impressions: impr, reach: Number(c.reach), clicks, conversions: conv,
            action_label: labelForObjective(c.objective),
            ctr: impr > 0 ? (clicks / impr) * 100 : 0,
            cpc: clicks > 0 ? spend / clicks : 0,
            cpm: impr > 0 ? (spend / impr) * 1000 : 0,
            cpa: conv > 0 ? spend / conv : 0,
            ads: [] as AdRow[],
        };
    });

    // Conta ads (rough — pra header do relatório)
    const adCount = await query<any>(
        `SELECT COUNT(DISTINCT c.id)::int AS n FROM campaigns c WHERE c.account_id = $1`,
        [accountId]
    );

    return {
        accountId,
        accountName: acc.account_name,
        periodStart, periodEnd,
        totals,
        counts: { campaigns: campaigns.length, ads: adCount[0]?.n || 0 },
        campaigns,
    };
}

function labelForObjective(obj: string): string {
    const map: Record<string, string> = {
        OUTCOME_LEADS: 'Leads',
        LEAD_GENERATION: 'Leads',
        OUTCOME_SALES: 'Compras',
        CONVERSIONS: 'Compras',
        OUTCOME_ENGAGEMENT: 'Conversas',
        MESSAGES: 'Conversas',
        OUTCOME_TRAFFIC: 'Cliques',
        LINK_CLICKS: 'Cliques',
        OUTCOME_AWARENESS: 'Engajamentos',
        VIDEO_VIEWS: 'Views',
    };
    return map[obj] || 'Resultados';
}
