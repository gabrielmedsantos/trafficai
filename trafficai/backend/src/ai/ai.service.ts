// ==============================
// TrafficAI — AI Analysis Service (Claude API)
// ==============================

import axios from 'axios';
import { aiRepository, AiAnalysisRecord } from './ai.repository';
import { metaRepository, InsightRecord } from '../meta/meta.repository';
import { metaService } from '../meta/meta.service';
import { authRepository } from '../auth/auth.repository';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { AppError } from '../shared/errors';

async function getUserAccessToken(userId: string): Promise<string> {
    const user = await authRepository.findById(userId);
    if (!user?.access_token) throw new AppError('Meta access token não configurado', 401);
    return user.access_token;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface CampaignAnalysisResult {
    status: 'excelente' | 'bom' | 'alerta' | 'critico';
    diagnostico: string;
    risco: number;
    acao_recomendada: string;
}

interface CreativeAnalysisResult {
    forca_hook: number;         // 0-100
    clareza_oferta: number;     // 0-100
    alinhamento_publico: number; // 0-100
    probabilidade_fadiga: number; // 0-100
    pontos_fortes: string[];
    pontos_fracos: string[];
    sugestoes: string[];
    avaliacao_geral: string;
}

export class AiService {
    /**
     * Analyze a campaign using Claude AI
     */
    async analyzeCampaign(campaignId: string): Promise<AiAnalysisRecord> {
        const campaign = await metaRepository.getCampaignById(campaignId);
        if (!campaign) {
            throw new AppError('Campaign not found', 404);
        }

        const insights = await metaRepository.getInsightsByCampaign(campaignId, 30);
        if (insights.length === 0) {
            throw new AppError('No insight data available for this campaign', 400);
        }

        const latestInsight = insights[0];
        const previousInsights = insights.slice(1);

        const prompt = this.buildCampaignAnalysisPrompt(campaign, latestInsight, previousInsights);
        const analysis = await this.callClaude<CampaignAnalysisResult>(prompt);

        // Save to database
        const saved = await aiRepository.save({
            campaign_id: campaignId,
            status: analysis.status,
            analysis: analysis.diagnostico,
            risk_score: Math.min(100, Math.max(0, analysis.risco)),
            recommendation: analysis.acao_recomendada,
            raw_response: analysis,
        });

        logger.info('Campaign analysis completed', {
            campaignId,
            status: analysis.status,
            riskScore: analysis.risco,
        });

        return saved;
    }

    /**
     * Analyze creative assets (image/video/text)
     */
    async analyzeCreative(
        userId: string,
        fileType: 'image' | 'video' | 'text',
        content: string, // base64 for images/videos, plain text for text
        context?: string
    ): Promise<CreativeAnalysisResult> {
        const prompt = this.buildCreativeAnalysisPrompt(fileType, content, context);
        const analysis = await this.callClaude<CreativeAnalysisResult>(prompt);

        logger.info('Creative analysis completed', { userId, fileType });

        return analysis;
    }

    // ---- Private Methods ----

    private buildCampaignAnalysisPrompt(
        campaign: any,
        latest: InsightRecord,
        history: InsightRecord[]
    ): string {
        const objective = (campaign.objective || '').toUpperCase();

        // Categorize objective to determine relevant metrics
        const isMessaging = ['MESSAGES', 'CONVERSATIONS', 'OUTCOME_ENGAGEMENT'].some(o => objective.includes(o));
        const isAwareness = ['AWARENESS', 'REACH', 'BRAND_AWARENESS', 'OUTCOME_AWARENESS'].some(o => objective.includes(o));
        const isTraffic = ['TRAFFIC', 'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'OUTCOME_TRAFFIC'].some(o => objective.includes(o));
        const isSalesOrLeads = ['SALES', 'CONVERSIONS', 'LEAD', 'PURCHASE', 'OUTCOME_SALES', 'OUTCOME_LEADS'].some(o => objective.includes(o));

        // Build objective-specific context
        let objectiveContext = '';
        let metricsSection = '';
        let considerSection = '';

        if (isMessaging) {
            objectiveContext = 'OBJETIVO: Campanhas de mensagens/conversas. O KPI principal é custo por conversa iniciada (messages_started) e volume de conversas. NÃO analise ROAS nem conversões de venda — esses dados são irrelevantes para este objetivo.';
            metricsSection = `- Gasto: R$${latest.spend}
- Impressões: ${latest.impressions}
- Alcance: ${latest.reach}
- Cliques (para iniciar conversa): ${latest.clicks}
- CTR: ${latest.ctr}%
- CPC: R$${latest.cpc}
- CPM: R$${latest.cpm}
- Frequência: ${latest.frequency}`;
            considerSection = `- CTR abaixo de 1% indica criativo fraco para engajar
- CPC alto indica audiência saturada ou criativo pouco atrativo
- Frequência acima de 3 indica saturação de público
- CPM crescente indica competição no leilão
- IGNORE ROAS e conversões — não são métricas válidas para este objetivo`;
            const historyStr = history.map(h =>
                `Data: ${h.date} | Gasto: R$${h.spend} | Impr: ${h.impressions} | Cliques: ${h.clicks} | CTR: ${h.ctr}% | CPC: R$${h.cpc} | CPM: R$${h.cpm} | Freq: ${h.frequency}`
            ).join('\n');
            return this.buildPromptTemplate(campaign, objective, objectiveContext, metricsSection, historyStr, considerSection);
        }

        if (isAwareness) {
            objectiveContext = 'OBJETIVO: Campanhas de alcance/awareness. O KPI principal é CPM (custo por mil impressões), alcance e frequência. NÃO analise ROAS, conversões ou CPC — esses dados são irrelevantes para este objetivo.';
            metricsSection = `- Gasto: R$${latest.spend}
- Impressões: ${latest.impressions}
- Alcance: ${latest.reach}
- CPM: R$${latest.cpm}
- Frequência: ${latest.frequency}`;
            considerSection = `- CPM alto pode indicar audiência muito nichada ou saturada
- Frequência entre 1.5 e 3 é ideal para awareness
- Frequência acima de 4 indica saturação excessiva
- Alcance baixo com gasto alto indica problema no público-alvo
- IGNORE ROAS, conversões, CTR e CPC — não são métricas primárias para awareness`;
            const historyStr = history.map(h =>
                `Data: ${h.date} | Gasto: R$${h.spend} | Impr: ${h.impressions} | Alcance: ${h.reach} | CPM: R$${h.cpm} | Freq: ${h.frequency}`
            ).join('\n');
            return this.buildPromptTemplate(campaign, objective, objectiveContext, metricsSection, historyStr, considerSection);
        }

        if (isTraffic) {
            objectiveContext = 'OBJETIVO: Campanhas de tráfego. Os KPIs principais são CTR (taxa de clique) e CPC (custo por clique). NÃO analise ROAS nem conversões — esses dados são irrelevantes para este objetivo.';
            metricsSection = `- Gasto: R$${latest.spend}
- Impressões: ${latest.impressions}
- Alcance: ${latest.reach}
- Cliques: ${latest.clicks}
- CTR: ${latest.ctr}%
- CPC: R$${latest.cpc}
- CPM: R$${latest.cpm}
- Frequência: ${latest.frequency}`;
            considerSection = `- CTR abaixo de 1.5% é preocupante para tráfego
- CTR acima de 3% é excelente
- CPC crescente indica saturação de público ou criativo ruim
- Frequência acima de 3 indica saturação
- IGNORE ROAS e conversões — não são métricas primárias para tráfego`;
            const historyStr = history.map(h =>
                `Data: ${h.date} | Gasto: R$${h.spend} | Impr: ${h.impressions} | Cliques: ${h.clicks} | CTR: ${h.ctr}% | CPC: R$${h.cpc} | CPM: R$${h.cpm}`
            ).join('\n');
            return this.buildPromptTemplate(campaign, objective, objectiveContext, metricsSection, historyStr, considerSection);
        }

        // Sales/Leads (default for conversion-focused objectives)
        objectiveContext = 'OBJETIVO: Campanhas de vendas/leads/conversões. Os KPIs principais são ROAS, custo por conversão e volume de conversões.';
        metricsSection = `- Gasto: R$${latest.spend}
- Impressões: ${latest.impressions}
- Alcance: ${latest.reach}
- Cliques: ${latest.clicks}
- CTR: ${latest.ctr}%
- CPC: R$${latest.cpc}
- CPM: R$${latest.cpm}
- Frequência: ${latest.frequency}
- Conversões: ${latest.conversions}
- Custo por conversão: R$${latest.cost_per_conversion}
- ROAS: ${latest.roas}`;
        considerSection = `- ROAS abaixo de 2 é alerta crítico para vendas
- Custo por conversão crescente indica problemas
- CTR abaixo de 1% indica criativo fraco
- Frequência acima de 3 indica saturação
- Compare ROAS atual com histórico para tendências`;
        const historyStr = history.map(h =>
            `Data: ${h.date} | Gasto: R$${h.spend} | Impr: ${h.impressions} | Cliques: ${h.clicks} | CTR: ${h.ctr}% | CPC: R$${h.cpc} | Conv: ${h.conversions} | ROAS: ${h.roas}`
        ).join('\n');
        return this.buildPromptTemplate(campaign, objective, objectiveContext, metricsSection, historyStr, considerSection);
    }

    private buildPromptTemplate(
        campaign: any,
        objective: string,
        objectiveContext: string,
        metricsSection: string,
        historyStr: string,
        considerSection: string
    ): string {
        return `Você é um especialista em tráfego pago e Meta Ads. Analise a seguinte campanha e forneça um diagnóstico completo baseado no objetivo correto da campanha.

## CONTEXTO DO OBJETIVO
${objectiveContext}

## Dados da Campanha
- Nome: ${campaign.name}
- Objetivo Meta Ads: ${objective}
- Status: ${campaign.status}

## Métricas Atuais (último dia disponível)
${metricsSection}

## Histórico Recente
${historyStr || 'Sem histórico anterior disponível'}

## Instruções
Analise todos os dados acima considerando APENAS as métricas relevantes para o objetivo "${objective}".
Responda EXCLUSIVAMENTE em JSON válido com a seguinte estrutura:
{
  "status": "excelente" | "bom" | "alerta" | "critico",
  "diagnostico": "análise detalhada focada nas métricas relevantes para este objetivo",
  "risco": 0-100,
  "acao_recomendada": "ações práticas e específicas baseadas no objetivo da campanha"
}

Considerações específicas para este objetivo:
${considerSection}

Responda APENAS com o JSON, sem markdown, sem explicações extras.`;
    }

    private buildCreativeAnalysisPrompt(
        fileType: string,
        content: string,
        context?: string
    ): string {
        const contextStr = context ? `\nContexto adicional: ${context}` : '';

        if (fileType === 'text') {
            return `Você é um especialista em copywriting para anúncios pagos. Analise o seguinte texto de anúncio:

"${content}"
${contextStr}

Responda EXCLUSIVAMENTE em JSON válido:
{
  "forca_hook": 0-100,
  "clareza_oferta": 0-100,
  "alinhamento_publico": 0-100,
  "probabilidade_fadiga": 0-100,
  "pontos_fortes": ["..."],
  "pontos_fracos": ["..."],
  "sugestoes": ["..."],
  "avaliacao_geral": "resumo da análise"
}

Considere: força do gancho inicial, clareza da proposta de valor, urgência, CTA, alinhamento com público-alvo, originalidade.
Responda APENAS com o JSON.`;
        }

        return `Você é um especialista em criativos para anúncios pagos. Analise o seguinte criativo de ${fileType === 'image' ? 'imagem' : 'vídeo'}.
${contextStr}

Com base no conteúdo fornecido, responda EXCLUSIVAMENTE em JSON válido:
{
  "forca_hook": 0-100,
  "clareza_oferta": 0-100,
  "alinhamento_publico": 0-100,
  "probabilidade_fadiga": 0-100,
  "pontos_fortes": ["..."],
  "pontos_fracos": ["..."],
  "sugestoes": ["..."],
  "avaliacao_geral": "resumo da análise"
}

Considere: impacto visual, clareza da mensagem, call-to-action, potencial de fadiga criativa.
Responda APENAS com o JSON.`;
    }

    /**
     * Analisa os top criativos de uma conta nos últimos N dias.
     * Fluxo: puxa top ads via Meta API (level=ad ordenado por spend) →
     * calcula CPA/CTR/CPC de cada → envia pra IA que identifica padrões
     * vencedores + recomendações → retorna análise estruturada + os ads.
     */
    async analyzeTopCreatives(
        userId: string,
        accountId: string,
        days: number = 30,
        limit: number = 10,
    ): Promise<{
        period: { days: number; label: string };
        account: { id: string; name: string };
        totals: { spend: number; conversions: number; impressions: number; clicks: number };
        top_ads: Array<{
            ad_id: string;
            ad_name: string;
            campaign_name: string;
            spend: number;
            impressions: number;
            clicks: number;
            ctr: number;
            cpc: number;
            cpm: number;
            conversions: number;
            cpa: number;
            action_type_label: string;
            thumbnail_url: string | null;
            permalink_url: string | null;
            media_type: string | null;
        }>;
        analysis: {
            winning_patterns: Array<{ pattern: string; evidence: string; ads: string[] }>;
            recommendations: string[];
            insights: string[];
            summary: string;
        };
    }> {
        // 1) Descobre conta + token
        const accRows = await query<any>(
            `SELECT id, meta_account_id, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2`,
            [accountId, userId]
        );
        if (!accRows.length) throw new AppError('Conta não encontrada', 404);
        const acc = accRows[0];
        const accessToken = await getUserAccessToken(userId);

        // 2) Puxa top ads
        const raw = await metaService.getTopAdsForAccount(userId, accessToken, acc.meta_account_id, days, limit);
        if (!raw.length) {
            throw new AppError(`Nenhum anúncio com spend nos últimos ${days} dias`, 400);
        }

        // 3) Normaliza: extrai action primária + calcula CPA
        const ACTION_PRIORITY = [
            { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
            { type: 'purchase', label: 'Compras' },
            { type: 'offsite_conversion.fb_pixel_lead', label: 'Leads' },
            { type: 'lead', label: 'Leads' },
            { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Conversas' },
            { type: 'onsite_conversion.total_messaging_connection', label: 'Conversas' },
            { type: 'link_click', label: 'Cliques' },
            { type: 'post_engagement', label: 'Engajamentos' },
        ];
        function extractPrimary(actions: any[] = []): { count: number; label: string; type: string } {
            for (const p of ACTION_PRIORITY) {
                const m = actions.find(a => a.action_type === p.type);
                if (m && parseInt(m.value, 10) > 0) return { count: parseInt(m.value, 10), label: p.label, type: p.type };
            }
            return { count: 0, label: 'Conversões', type: '' };
        }

        const topAds = raw.map((r: any) => {
            const spend = parseFloat(r.spend || '0');
            const impressions = parseInt(r.impressions || '0', 10);
            const clicks = parseInt(r.clicks || '0', 10);
            const primary = extractPrimary(r.actions || []);
            const cpa = primary.count > 0 ? spend / primary.count : 0;
            const cre = r.creative || {};
            const perm = cre.instagram_permalink_url;
            const permalink = perm ? (perm.startsWith('http') ? perm : `https://www.facebook.com${perm}`) : null;
            return {
                ad_id: r.ad_id,
                ad_name: r.ad_name || '(sem nome)',
                campaign_name: r.campaign_name || '',
                spend, impressions, clicks,
                ctr: parseFloat(r.ctr || '0'),
                cpc: parseFloat(r.cpc || '0'),
                cpm: parseFloat(r.cpm || '0'),
                conversions: primary.count,
                cpa,
                action_type_label: primary.label,
                thumbnail_url: cre.image_url || cre.thumbnail_url || null,
                permalink_url: permalink,
                media_type: cre.object_type || null,
            };
        });

        // 4) Totais agregados
        const totals = topAds.reduce((acc, ad) => ({
            spend: acc.spend + ad.spend,
            impressions: acc.impressions + ad.impressions,
            clicks: acc.clicks + ad.clicks,
            conversions: acc.conversions + ad.conversions,
        }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });

        // 5) Prompt pra IA
        const prompt = this.buildTopCreativesPrompt(acc.account_name, days, topAds, totals);
        const analysis = await this.callClaude<{
            winning_patterns: Array<{ pattern: string; evidence: string; ads: string[] }>;
            recommendations: string[];
            insights: string[];
            summary: string;
        }>(prompt);

        return {
            period: { days, label: `últimos ${days} dias` },
            account: { id: acc.id, name: acc.account_name },
            totals,
            top_ads: topAds,
            analysis,
        };
    }

    private buildTopCreativesPrompt(
        accountName: string,
        days: number,
        ads: any[],
        totals: any,
    ): string {
        const rows = ads.map((a, i) => (
            `${i + 1}. "${a.ad_name}" (campanha: ${a.campaign_name})\n` +
            `   spend: R$ ${a.spend.toFixed(2)} | impressões: ${a.impressions.toLocaleString('pt-BR')} | cliques: ${a.clicks}\n` +
            `   CTR: ${a.ctr.toFixed(2)}% | CPC: R$ ${a.cpc.toFixed(2)} | CPM: R$ ${a.cpm.toFixed(2)}\n` +
            `   ${a.action_type_label}: ${a.conversions} | CPA: R$ ${a.cpa.toFixed(2)}\n` +
            `   formato: ${a.media_type || 'desconhecido'}`
        )).join('\n\n');

        return `Você é um analista sênior de mídia paga especializado em Meta Ads. Analise os ${ads.length} anúncios abaixo (top criativos da conta "${accountName}" nos últimos ${days} dias, ordenados por spend) e identifique padrões vencedores + recomendações práticas pra escalar.

DADOS DOS ANÚNCIOS:
${rows}

TOTAIS DO PERÍODO:
Spend: R$ ${totals.spend.toFixed(2)} | Impressões: ${totals.impressions.toLocaleString('pt-BR')} | Cliques: ${totals.clicks.toLocaleString('pt-BR')} | Conversões: ${totals.conversions}

REGRAS DE ANÁLISE:
1. Padrões vencedores: identifique 2-4 padrões concretos nos NOMES dos anúncios (temas, marcas, ganchos, formatos). Cite evidências e liste os ads (por número) que sustentam cada padrão.
2. Recomendações: 3-5 sugestões PRÁTICAS pra próximos criativos (o que produzir, o que evitar).
3. Insights: 2-3 observações relevantes sobre eficiência (CTR alto/baixo, CPA disperso, formato dominante).
4. Summary: 1 parágrafo curto (2-3 frases) que fecharia uma reunião de review criativo.
5. Não invente dado. Use APENAS o que está listado.
6. Tom: direto, jornalístico, terceira pessoa. Português BR.

RESPONDA EXATAMENTE com este JSON (sem texto antes ou depois):
{
  "winning_patterns": [
    { "pattern": "descrição do padrão", "evidence": "por que esse padrão é vencedor com números", "ads": ["#1", "#3", "#5"] }
  ],
  "recommendations": ["recomendação 1", "..."],
  "insights": ["insight 1", "..."],
  "summary": "resumo curto pra reunião"
}`;
    }

    private async callClaude<T>(prompt: string): Promise<T> {
        if (!OPENAI_API_KEY) {
            throw new AppError('OpenAI API key not configured', 500);
        }

        try {
            const headers: any = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            };
            if (OPENAI_ORG_ID) headers['OpenAI-Organization'] = OPENAI_ORG_ID;

            const response = await axios.post(
                OPENAI_API_URL,
                {
                    model: OPENAI_MODEL,
                    max_tokens: 2048,
                    messages: [{ role: 'user', content: prompt }],
                },
                { headers, timeout: 60000 }
            );

            const textContent = response.data.choices?.[0]?.message?.content;
            if (!textContent) {
                throw new Error('Empty response from OpenAI');
            }

            const jsonStr = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(jsonStr) as T;
        } catch (error: any) {
            if (error instanceof SyntaxError) {
                logger.error('Failed to parse OpenAI response as JSON', { error: error.message });
                throw new AppError('AI returned invalid response format', 502);
            }
            logger.error('OpenAI API call failed', { error: error.message });
            throw new AppError(`AI analysis failed: ${error.message}`, 502);
        }
    }
}

export const aiService = new AiService();
