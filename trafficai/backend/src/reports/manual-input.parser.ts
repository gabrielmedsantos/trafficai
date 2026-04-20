// ==============================
// TrafficAI — Parser de input manual para relatórios
// Aceita:
//   1. CSV exportado do Gerenciador de Anúncios da Meta (pt-BR e en-US)
//   2. Texto livre (extraído via OpenAI quando CSV não é fornecido)
// Retorna um ReportMetrics compatível com o service.
// ==============================

import axios from 'axios';
import { logger } from '../shared/logger';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface ParsedMetrics {
    total_spend: number;
    total_impressions: number;
    total_clicks: number;
    total_conversions: number;
    avg_ctr: number;
    avg_cpc: number;
    avg_cpm: number;
    avg_roas: number;
    avg_frequency: number;
    cost_per_conversion: number;
    primary_action_label: string;
    campaigns_total: number;
    campaigns_active: number;
    top_campaigns: Array<{
        name: string;
        status: string;
        spend: number;
        conversions: number;
        roas: number;
        ctr: number;
    }>;
    daily_breakdown: Array<{
        date: string;
        spend: number;
        conversions: number;
        clicks: number;
        impressions: number;
    }>;
}

// ─── CSV utils ──────────────────────────────────────────────────────────────

/** Split CSV considerando campos entre aspas. */
function splitCsvLine(line: string, sep: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
            else quoted = !quoted;
        } else if (ch === sep && !quoted) {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out.map(v => v.trim());
}

function detectSeparator(firstLine: string): string {
    const commas = (firstLine.match(/,/g) || []).length;
    const semis = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    if (tabs > commas && tabs > semis) return '\t';
    if (semis > commas) return ';';
    return ',';
}

/** Normaliza string de número no formato BR (1.234,56) ou US (1,234.56). */
function parseNumber(value: string | undefined | null): number {
    if (value == null) return 0;
    let s = String(value).trim();
    if (!s || s === '-' || s === '—') return 0;
    // Remove moeda e símbolos comuns
    s = s.replace(/R\$|US\$|€|£|BRL|USD|EUR|%/gi, '').trim();
    // Decide BR (1.234,56) vs US (1,234.56)
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
        // O último separador decide
        const lastComma = s.lastIndexOf(',');
        const lastDot = s.lastIndexOf('.');
        if (lastComma > lastDot) {
            // BR: . é milhar, , é decimal
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // US: , é milhar, . é decimal
            s = s.replace(/,/g, '');
        }
    } else if (hasComma) {
        // só vírgula — tratamos como decimal se tiver 1-2 dígitos depois
        const parts = s.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
            s = parts[0].replace(/\./g, '') + '.' + parts[1];
        } else {
            s = s.replace(/,/g, '');
        }
    } else {
        s = s.replace(/\s/g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

// ─── Aliases de colunas (pt-BR + en-US + variações do Meta) ─────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
    campaign_name: ['nome da campanha', 'campaign name', 'campanha', 'campaign'],
    status: ['status', 'veiculação', 'delivery'],
    spend: ['valor gasto', 'valor usado', 'amount spent', 'total spent', 'gasto', 'investimento', 'valor gasto (brl)', 'valor usado (brl)', 'amount spent (brl)'],
    impressions: ['impressões', 'impressions'],
    reach: ['alcance', 'reach'],
    clicks: ['cliques no link', 'cliques (todos)', 'cliques', 'link clicks', 'clicks (all)', 'clicks'],
    ctr: ['ctr', 'ctr (todos)', 'ctr (all)', 'taxa de cliques'],
    cpc: ['cpc', 'cpc (todos)', 'cpc (all)', 'cpc (custo por clique no link)', 'cpc (cost per link click)', 'custo por clique'],
    cpm: ['cpm', 'cpm (custo por 1.000 impressões)', 'cpm (cost per 1,000 impressions)'],
    frequency: ['frequência', 'frequency'],
    purchases: ['compras', 'purchases', 'compras do site', 'website purchases'],
    leads: ['cadastros', 'leads', 'cadastros do site', 'website leads'],
    messages: ['mensagens iniciadas', 'messaging conversations started', 'conversas iniciadas'],
    purchase_value: ['valor de conversão da compra', 'purchase conversion value', 'valor da compra'],
    roas: ['roas de compra', 'purchase roas', 'roas'],
    cost_per_purchase: ['custo por compra', 'cost per purchase'],
    cost_per_lead: ['custo por cadastro', 'custo por lead', 'cost per lead'],
    date: ['dia', 'date', 'reporting starts', 'início do período'],
};

function findColumn(header: string[], key: string): number {
    const aliases = COLUMN_ALIASES[key] || [];
    const lower = header.map(h => h.toLowerCase().replace(/\s+/g, ' ').trim());
    for (const alias of aliases) {
        const idx = lower.findIndex(h => h === alias);
        if (idx >= 0) return idx;
    }
    // Fallback: procura qualquer header que CONTENHA o alias
    for (const alias of aliases) {
        const idx = lower.findIndex(h => h.includes(alias));
        if (idx >= 0) return idx;
    }
    return -1;
}

// ─── CSV parser ─────────────────────────────────────────────────────────────

/**
 * Parseia CSV exportado do Gerenciador de Anúncios. Retorna métricas agregadas.
 * Aceita granularidade por campanha OU por dia (detectado pela presença de
 * coluna "Dia / Date").
 */
export function parseMetaCsv(csv: string, hint?: { primary_action?: 'purchase' | 'lead' | 'message' }): ParsedMetrics {
    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV precisa de cabeçalho + ao menos 1 linha de dados');

    const sep = detectSeparator(lines[0]);
    const header = splitCsvLine(lines[0], sep);
    const rows = lines.slice(1).map(l => splitCsvLine(l, sep));

    const col = (k: string) => findColumn(header, k);

    const idxName    = col('campaign_name');
    const idxStatus  = col('status');
    const idxSpend   = col('spend');
    const idxImp     = col('impressions');
    const idxReach   = col('reach');
    const idxClicks  = col('clicks');
    const idxCtr     = col('ctr');
    const idxCpc     = col('cpc');
    const idxCpm     = col('cpm');
    const idxFreq    = col('frequency');
    const idxPurch   = col('purchases');
    const idxLeads   = col('leads');
    const idxMsgs    = col('messages');
    const idxRoas    = col('roas');
    const idxDate    = col('date');
    const idxCostPur = col('cost_per_purchase');
    const idxCostLead = col('cost_per_lead');
    const idxPurchValue = col('purchase_value');

    if (idxSpend < 0) {
        throw new Error('Coluna de "Valor gasto" / "Amount spent" não encontrada no CSV');
    }

    // Detecta ação principal
    const hasPurchases = idxPurch >= 0 && rows.some(r => parseNumber(r[idxPurch]) > 0);
    const hasLeads = idxLeads >= 0 && rows.some(r => parseNumber(r[idxLeads]) > 0);
    const hasMessages = idxMsgs >= 0 && rows.some(r => parseNumber(r[idxMsgs]) > 0);

    let primaryActionLabel = 'Conversões';
    let conversionsCol = -1;
    let conversionCostCol = -1;
    if (hint?.primary_action === 'purchase' && idxPurch >= 0) {
        primaryActionLabel = 'Compras'; conversionsCol = idxPurch; conversionCostCol = idxCostPur;
    } else if (hint?.primary_action === 'lead' && idxLeads >= 0) {
        primaryActionLabel = 'Leads'; conversionsCol = idxLeads; conversionCostCol = idxCostLead;
    } else if (hint?.primary_action === 'message' && idxMsgs >= 0) {
        primaryActionLabel = 'Mensagens'; conversionsCol = idxMsgs;
    } else if (hasPurchases) {
        primaryActionLabel = 'Compras'; conversionsCol = idxPurch; conversionCostCol = idxCostPur;
    } else if (hasLeads) {
        primaryActionLabel = 'Leads'; conversionsCol = idxLeads; conversionCostCol = idxCostLead;
    } else if (hasMessages) {
        primaryActionLabel = 'Mensagens'; conversionsCol = idxMsgs;
    }

    // Se tem Data → granularidade por dia → agregamos também por campanha (se houver).
    const dailyMap: Record<string, { spend: number; impressions: number; clicks: number; conversions: number }> = {};
    const campaignsMap: Record<string, {
        name: string; status: string; spend: number; impressions: number;
        clicks: number; conversions: number; purchase_value: number; roas: number; count: number;
    }> = {};

    let totalSpend = 0, totalImp = 0, totalReach = 0, totalClicks = 0, totalConv = 0;
    let freqWeighted = 0, freqReach = 0;
    let totalPurchaseValue = 0;

    for (const r of rows) {
        const spend = parseNumber(r[idxSpend]);
        const imp = idxImp >= 0 ? parseNumber(r[idxImp]) : 0;
        const reach = idxReach >= 0 ? parseNumber(r[idxReach]) : 0;
        const clicks = idxClicks >= 0 ? parseNumber(r[idxClicks]) : 0;
        const conv = conversionsCol >= 0 ? parseNumber(r[conversionsCol]) : 0;
        const freq = idxFreq >= 0 ? parseNumber(r[idxFreq]) : 0;
        const purchaseVal = idxPurchValue >= 0 ? parseNumber(r[idxPurchValue]) : 0;
        const roas = idxRoas >= 0 ? parseNumber(r[idxRoas]) : 0;

        totalSpend += spend;
        totalImp += imp;
        totalReach += reach;
        totalClicks += clicks;
        totalConv += conv;
        totalPurchaseValue += purchaseVal;
        if (freq > 0 && reach > 0) {
            freqWeighted += freq * reach;
            freqReach += reach;
        }

        if (idxDate >= 0 && r[idxDate]) {
            const date = r[idxDate].slice(0, 10);
            if (!dailyMap[date]) dailyMap[date] = { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
            dailyMap[date].spend += spend;
            dailyMap[date].impressions += imp;
            dailyMap[date].clicks += clicks;
            dailyMap[date].conversions += conv;
        }

        if (idxName >= 0 && r[idxName]) {
            const name = r[idxName];
            if (!campaignsMap[name]) {
                campaignsMap[name] = {
                    name,
                    status: idxStatus >= 0 ? (r[idxStatus] || 'ACTIVE') : 'ACTIVE',
                    spend: 0, impressions: 0, clicks: 0, conversions: 0,
                    purchase_value: 0, roas: 0, count: 0,
                };
            }
            const c = campaignsMap[name];
            c.spend += spend;
            c.impressions += imp;
            c.clicks += clicks;
            c.conversions += conv;
            c.purchase_value += purchaseVal;
            c.roas += roas;
            c.count++;
        }
    }

    const ctr = totalImp > 0 ? (totalClicks / totalImp) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const cpm = totalImp > 0 ? (totalSpend / totalImp) * 1000 : 0;
    const frequency = freqReach > 0 ? freqWeighted / freqReach : 0;
    const roasAvg = totalSpend > 0 && totalPurchaseValue > 0
        ? totalPurchaseValue / totalSpend
        : 0;

    const topCampaigns = Object.values(campaignsMap)
        .map(c => ({
            name: c.name,
            status: /ativ|active|running/i.test(c.status) ? 'ACTIVE' : 'PAUSED',
            spend: c.spend,
            conversions: c.conversions,
            roas: c.count > 0 ? c.roas / c.count : 0,
            ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        }))
        .sort((a, b) => b.spend - a.spend);

    const campaignsActive = topCampaigns.filter(c => c.status === 'ACTIVE').length;

    const dailyBreakdown = Object.entries(dailyMap)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return {
        total_spend: totalSpend,
        total_impressions: totalImp,
        total_clicks: totalClicks,
        total_conversions: totalConv,
        avg_ctr: ctr,
        avg_cpc: cpc,
        avg_cpm: cpm,
        avg_roas: roasAvg,
        avg_frequency: frequency,
        cost_per_conversion: totalConv > 0 ? totalSpend / totalConv : 0,
        primary_action_label: primaryActionLabel,
        campaigns_total: topCampaigns.length,
        campaigns_active: campaignsActive || topCampaigns.length, // se não há status, assume todas ativas
        top_campaigns: topCampaigns,
        daily_breakdown: dailyBreakdown,
    };
}

// ─── Parser de texto livre via OpenAI ───────────────────────────────────────

/**
 * Usa GPT-4 para extrair métricas de texto livre escrito pelo gestor.
 * Ex: "Cliente Matheus, abril 2026, investimento R$ 14.000, 8306 cliques,
 *      123k impressões, CTR 6.7%, 45 leads, CPL R$ 311"
 */
export async function parseTextMetrics(text: string, hint?: { primary_action?: string }): Promise<ParsedMetrics> {
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY não configurada — impossível extrair de texto livre. Use CSV.');
    }

    const prompt = `Você é um especialista em tráfego pago. Extraia as métricas descritas no texto abaixo e retorne em JSON estrito.

Regras:
- Converta R$, porcentagens e números BR (1.234,56) para float em unidades padrão.
- CTR e ROAS como números (6.7 representa 6.7%, 3.2 representa 3.2x).
- primary_action_label deve ser "Compras", "Leads", "Cadastros", "Mensagens", "Visualizações" ou "Conversões".
- Se não houver dado para um campo, use 0 (ou string vazia em campos de texto).
- top_campaigns: liste as campanhas citadas (se não houver, lista vazia).
- daily_breakdown: lista vazia se não houver dados diários.

Texto:
"""
${text}
"""

${hint?.primary_action ? `Dica: a ação principal esperada é "${hint.primary_action}".` : ''}

Retorne APENAS um objeto JSON com exatamente esta forma (sem markdown fences):
{
  "total_spend": 0,
  "total_impressions": 0,
  "total_clicks": 0,
  "total_conversions": 0,
  "avg_ctr": 0,
  "avg_cpc": 0,
  "avg_cpm": 0,
  "avg_roas": 0,
  "avg_frequency": 0,
  "cost_per_conversion": 0,
  "primary_action_label": "Conversões",
  "campaigns_total": 0,
  "campaigns_active": 0,
  "top_campaigns": [],
  "daily_breakdown": []
}`;

    try {
        const res = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: OPENAI_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            },
            {
                headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 30000,
            }
        );
        const content = res.data.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        return {
            total_spend: Number(parsed.total_spend || 0),
            total_impressions: Number(parsed.total_impressions || 0),
            total_clicks: Number(parsed.total_clicks || 0),
            total_conversions: Number(parsed.total_conversions || 0),
            avg_ctr: Number(parsed.avg_ctr || 0),
            avg_cpc: Number(parsed.avg_cpc || 0),
            avg_cpm: Number(parsed.avg_cpm || 0),
            avg_roas: Number(parsed.avg_roas || 0),
            avg_frequency: Number(parsed.avg_frequency || 0),
            cost_per_conversion: Number(parsed.cost_per_conversion || 0),
            primary_action_label: parsed.primary_action_label || 'Conversões',
            campaigns_total: Number(parsed.campaigns_total || 0),
            campaigns_active: Number(parsed.campaigns_active || 0),
            top_campaigns: Array.isArray(parsed.top_campaigns) ? parsed.top_campaigns : [],
            daily_breakdown: Array.isArray(parsed.daily_breakdown) ? parsed.daily_breakdown : [],
        };
    } catch (err: any) {
        logger.error('Falha ao extrair métricas do texto', { error: err.message });
        throw new Error('Não consegui entender os dados. Tente colar como CSV do Meta ou descrever mais métricas (investimento, cliques, impressões, conversões).');
    }
}
