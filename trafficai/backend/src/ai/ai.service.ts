// ==============================
// TrafficAI — AI Analysis Service (Claude API)
// ==============================

import axios from 'axios';
import { aiRepository, AiAnalysisRecord } from './ai.repository';
import { metaRepository, InsightRecord } from '../meta/meta.repository';
import { logger } from '../shared/logger';
import { AppError } from '../shared/errors';

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
