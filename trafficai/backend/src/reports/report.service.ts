// ==============================
// TrafficAI — Report Service
// Gera relatórios diários/semanais/mensais por cliente com análise IA
// ==============================

import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { metaService } from '../meta/meta.service';
import { authRepository } from '../auth/auth.repository';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export type ReportType = 'daily' | 'weekly' | 'monthly';

interface ReportMetrics {
    total_spend: number;
    total_impressions: number;
    total_clicks: number;
    total_conversions: number;
    primary_action_label: string; // ex: "Conversas iniciadas", "Leads", "Compras"
    avg_ctr: number;
    avg_cpc: number;
    avg_cpm: number;
    avg_roas: number;
    avg_frequency: number;
    cost_per_conversion: number;
    campaigns_active: number;
    campaigns_total: number;
    // Comparação com período anterior
    spend_change_pct: number | null;
    conversions_change_pct: number | null;
    roas_change_pct: number | null;
    cpa_change_pct: number | null;
    // Por campanha
    top_campaigns: Array<{
        name: string;
        spend: number;
        conversions: number;
        roas: number;
        ctr: number;
        status: string;
    }>;
    top_ads: Array<{
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
        hook_rate: number | null; // 3s video plays / impressions (%)
        thumbnail_url?: string;
    }>;
    daily_breakdown: Array<{
        date: string;
        spend: number;
        conversions: number;
        clicks: number;
        impressions: number;
    }>;
}

interface GeneratedReport {
    title: string;
    summary: string;
    metrics: ReportMetrics;
    ai_analysis: string;
    recommendations: string[];
}

import { parseMetaCsv, parseTextMetrics, ParsedMetrics } from './manual-input.parser';

export interface ManualReportInput {
    type: ReportType;
    period_start: Date;
    period_end: Date;
    // Fonte — uma das duas
    csv_data?: string;
    text_data?: string;
    // Opcional: vincular a conta existente; senão o relatório fica sem account_id
    account_id?: string;
    client_name?: string;
    client_email?: string;
    client_phone?: string;
    primary_action?: 'purchase' | 'lead' | 'message';
}

export class ReportService {

    /**
     * Gera relatório a partir de dados manuais (CSV do Meta ou texto livre).
     * Usado quando a conta NÃO está conectada ao perfil Meta do usuário.
     * Pula o sync com a Meta API e os dados vêm direto do input.
     */
    async generateReportFromManualData(
        userId: string,
        input: ManualReportInput
    ): Promise<string> {
        // 1. Parseia input em métricas estruturadas
        let parsed: ParsedMetrics;
        let source: 'manual_csv' | 'manual_text';
        let rawInput: string;

        if (input.csv_data && input.csv_data.trim()) {
            parsed = parseMetaCsv(input.csv_data, { primary_action: input.primary_action });
            source = 'manual_csv';
            rawInput = input.csv_data;
        } else if (input.text_data && input.text_data.trim()) {
            parsed = await parseTextMetrics(input.text_data, { primary_action: input.primary_action });
            source = 'manual_text';
            rawInput = input.text_data;
        } else {
            throw new Error('csv_data ou text_data é obrigatório');
        }

        if (parsed.total_spend <= 0 && parsed.total_impressions <= 0) {
            throw new Error('Não consegui extrair métricas dos dados fornecidos. Verifique o formato.');
        }

        // 2. Monta ReportMetrics com campos extras zerados (sem comparação período anterior)
        const metrics: ReportMetrics = {
            total_spend: parsed.total_spend,
            total_impressions: parsed.total_impressions,
            total_clicks: parsed.total_clicks,
            total_conversions: parsed.total_conversions,
            primary_action_label: parsed.primary_action_label,
            avg_ctr: parsed.avg_ctr,
            avg_cpc: parsed.avg_cpc,
            avg_cpm: parsed.avg_cpm,
            avg_roas: parsed.avg_roas,
            avg_frequency: parsed.avg_frequency,
            cost_per_conversion: parsed.cost_per_conversion,
            campaigns_active: parsed.campaigns_active,
            campaigns_total: parsed.campaigns_total,
            spend_change_pct: null,
            conversions_change_pct: null,
            roas_change_pct: null,
            cpa_change_pct: null,
            top_campaigns: parsed.top_campaigns,
            top_ads: [],
            daily_breakdown: parsed.daily_breakdown,
        };

        // 3. Resolve dados do cliente (conta vinculada OU input direto)
        let accountData: any = {
            account_name: input.client_name || 'Cliente',
            client_name: input.client_name || null,
            client_email: input.client_email || null,
            client_phone: input.client_phone || null,
            auto_send_email: false,
        };

        if (input.account_id) {
            const rows = await query<any>(
                `SELECT a.*, rs.client_name, rs.client_email, rs.client_phone, rs.agency_name, rs.auto_send_email
                 FROM ad_accounts a
                 LEFT JOIN report_settings rs ON rs.account_id = a.id
                 WHERE a.id = $1 AND a.user_id = $2`,
                [input.account_id, userId]
            );
            if (rows.length) {
                accountData = {
                    ...rows[0],
                    client_name: input.client_name || rows[0].client_name,
                    client_email: input.client_email || rows[0].client_email,
                    client_phone: input.client_phone || rows[0].client_phone,
                };
            }
        }

        // 4. Gera análise com IA (reusa o mesmo prompt do fluxo normal)
        const prevMetrics: ReportMetrics = { ...metrics };  // sem comparação
        const { summary, ai_analysis, recommendations } = await this.generateAIAnalysis(
            accountData, input.type, input.period_start, input.period_end, metrics, prevMetrics
        );

        const typeLabels: Record<ReportType, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };
        const clientDisplay = accountData.client_name || accountData.account_name || 'Cliente';
        const title = `Relatório ${typeLabels[input.type]} — ${clientDisplay} (${this.formatDateBR(input.period_start)} a ${this.formatDateBR(input.period_end)})`;

        // 5. Persiste
        const inserted = await query<{ id: string }>(
            `INSERT INTO client_reports (
                user_id, account_id, type, period_start, period_end,
                title, summary, metrics, ai_analysis, recommendations, raw_insights,
                client_name, client_email, client_phone, source
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            RETURNING id`,
            [
                userId,
                input.account_id || null,
                input.type,
                input.period_start.toISOString().split('T')[0],
                input.period_end.toISOString().split('T')[0],
                title, summary,
                JSON.stringify(metrics),
                ai_analysis,
                JSON.stringify(recommendations),
                JSON.stringify({ source, raw_input: rawInput.slice(0, 50_000) }),
                accountData.client_name || null,
                accountData.client_email || null,
                accountData.client_phone || null,
                source,
            ]
        );

        const reportId = inserted[0].id;
        logger.info(`Relatório manual gerado: ${reportId} (${source})`);
        return reportId;
    }

    /**
     * Gera relatório para uma conta em um período
     */
    async generateReport(
        userId: string,
        accountId: string,
        type: ReportType,
        periodStart: Date,
        periodEnd: Date
    ): Promise<string> {
        logger.info(`📊 Gerando relatório ${type} para conta ${accountId}`);

        // 1. Busca dados da conta
        const accountRows = await query<any>(
            `SELECT a.*, rs.client_name, rs.client_email, rs.client_phone, rs.agency_name, rs.custom_message,
                    rs.daily_enabled, rs.weekly_enabled, rs.monthly_enabled, rs.auto_send_email, rs.auto_send_whatsapp
             FROM ad_accounts a
             LEFT JOIN report_settings rs ON rs.account_id = a.id
             WHERE a.id = $1 AND a.user_id = $2`,
            [accountId, userId]
        );

        if (!accountRows.length) throw new Error('Conta não encontrada');
        const account = accountRows[0];

        // 2. Sincroniza dados da Meta API para o período do relatório
        const since = periodStart.toISOString().split('T')[0];
        const until = periodEnd.toISOString().split('T')[0];
        try {
            const user = await authRepository.findById(userId);
            if (user?.access_token) {
                logger.info(`🔄 Sincronizando dados Meta para relatório: ${since} a ${until}`);
                await metaService.syncAccountForPeriod(userId, user.access_token, accountId, since, until);
            } else {
                logger.warn('Sem token Meta — usando dados locais existentes');
            }
        } catch (syncErr: any) {
            logger.warn('Falha ao sincronizar dados Meta, usando dados locais', { error: syncErr.message });
        }

        // 3. Agrega métricas do período atual
        const metrics = await this.aggregateMetrics(accountId, periodStart, periodEnd);

        // 3b. Busca dados de criativos (nível de anúncio) diretamente da Meta API
        try {
            const user = await authRepository.findById(userId);
            if (user?.access_token) {
                const adInsights = await metaService.getAdInsightsForReport(
                    userId, user.access_token, account.meta_account_id, since, until
                );
                if (adInsights.length > 0) {
                    const adIds = adInsights.map((a: any) => a.ad_id).filter(Boolean);
                    const thumbnails = await metaService.getAdThumbnails(
                        userId, user.access_token, account.meta_account_id, adIds
                    );
                    metrics.top_ads = this.processAdInsights(adInsights, thumbnails);
                }
            }
        } catch (adErr: any) {
            logger.warn('Falha ao buscar criativos para relatório', { error: adErr.message });
            metrics.top_ads = [];
        }

        // 4. Métricas do período anterior para comparação
        const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
        const prevEnd = new Date(periodStart);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - periodDays);
        const prevMetrics = await this.aggregateMetrics(accountId, prevStart, prevEnd);

        // 4. Calcula variações percentuais
        metrics.spend_change_pct = this.calcChange(prevMetrics.total_spend, metrics.total_spend);
        metrics.conversions_change_pct = this.calcChange(prevMetrics.total_conversions, metrics.total_conversions);
        metrics.roas_change_pct = this.calcChange(prevMetrics.avg_roas, metrics.avg_roas);
        metrics.cpa_change_pct = this.calcChange(prevMetrics.cost_per_conversion, metrics.cost_per_conversion);

        // 5. Gera análise com IA
        const { summary, ai_analysis, recommendations } = await this.generateAIAnalysis(
            account, type, periodStart, periodEnd, metrics, prevMetrics
        );

        const typeLabels: Record<ReportType, string> = {
            daily: 'Diário',
            weekly: 'Semanal',
            monthly: 'Mensal',
        };

        const title = `Relatório ${typeLabels[type]} — ${account.account_name || account.client_name || 'Conta'} (${this.formatDateBR(periodStart)} a ${this.formatDateBR(periodEnd)})`;

        // 6. Salva no banco
        const inserted = await query<{ id: string }>(
            `INSERT INTO client_reports (
                user_id, account_id, type, period_start, period_end,
                title, summary, metrics, ai_analysis, recommendations, raw_insights,
                client_name, client_email, client_phone
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING id`,
            [
                userId, accountId, type,
                periodStart.toISOString().split('T')[0],
                periodEnd.toISOString().split('T')[0],
                title, summary,
                JSON.stringify(metrics),
                ai_analysis,
                JSON.stringify(recommendations),
                JSON.stringify({ period_days: periodDays }),
                account.client_name || null,
                account.client_email || null,
                account.client_phone || null,
            ]
        );

        const reportId = inserted[0].id;
        logger.info(`✅ Relatório gerado: ${reportId} (${type})`);

        // 7. Auto-envio por email se configurado
        if (account.auto_send_email && account.client_email) {
            await this.sendReportByEmail(reportId);
        }

        return reportId;
    }

    /**
     * Envia relatório por email para o cliente
     */
    async sendReportByEmail(reportId: string, toEmail?: string): Promise<void> {
        const rows = await query<any>(
            `SELECT r.*, a.account_name, u.email as manager_email,
                    ns.resend_api_key, ns.notification_email as manager_notification_email
             FROM client_reports r
             LEFT JOIN ad_accounts a ON r.account_id = a.id
             JOIN users u ON r.user_id = u.id
             LEFT JOIN notification_settings ns ON ns.user_id = r.user_id
             WHERE r.id = $1`,
            [reportId]
        );

        if (!rows.length) throw new Error('Relatório não encontrado');
        const report = rows[0];

        const recipientEmail = toEmail || report.client_email;
        if (!recipientEmail) throw new Error('Email do cliente não configurado');

        const apiKey = report.resend_api_key || process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error('Chave Resend não configurada');

        const publicUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/report/${report.public_token}`;
        const metrics: ReportMetrics = report.metrics;
        const currency = 'BRL';

        const html = this.buildReportEmail(report, metrics, publicUrl, currency);

        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        const fromName = process.env.AGENCY_NAME || 'Alfamax Digital';
        logger.info(`📧 Enviando email: from="${fromName} <${fromEmail}>" to="${recipientEmail}"`);

        try {
            const emailRes = await axios.post('https://api.resend.com/emails', {
                from: `${fromName} <${fromEmail}>`,
                to: [recipientEmail],
                subject: report.title,
                html,
            }, {
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 10000,
            });
            logger.info(`📧 Email enviado com sucesso`, { id: emailRes.data?.id });
        } catch (emailErr: any) {
            const detail = emailErr.response?.data;
            logger.error(`📧 Falha ao enviar email`, { status: emailErr.response?.status, detail });
            throw new Error(`Resend error ${emailErr.response?.status}: ${JSON.stringify(detail)}`);
        }

        await query(
            `UPDATE client_reports SET status = 'sent', sent_at = COALESCE(sent_at, NOW()) WHERE id = $1`,
            [reportId]
        );

        // Registra no histórico de envios (requer migration 009)
        try {
            await query(
                `INSERT INTO report_sends (report_id, user_id, channel, recipient, status)
                 VALUES ($1, $2, 'email', $3, 'sent')`,
                [reportId, report.user_id, recipientEmail]
            );
        } catch (histErr: any) {
            logger.warn('report_sends não disponível ainda (rode a migration 009)', { error: histErr.message });
        }

        logger.info(`📧 Relatório enviado para ${recipientEmail}: ${report.title}`);
    }

    // ─── MÉTRICAS ─────────────────────────────────────────────────────────────

    private async aggregateMetrics(accountId: string, start: Date, end: Date): Promise<ReportMetrics> {
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];

        // Totais do período — métricas derivadas (CTR, CPC, CPM) calculadas
        // dos TOTAIS (não média de linhas) para bater com o Gerenciador da Meta.
        // Frequência usa média ponderada pelo alcance.
        const totals = await query<any>(`
            SELECT
                COALESCE(SUM(ih.spend), 0) as total_spend,
                COALESCE(SUM(ih.impressions), 0) as total_impressions,
                COALESCE(SUM(ih.reach), 0) as total_reach,
                COALESCE(SUM(ih.clicks), 0) as total_clicks,
                COALESCE(SUM(ih.conversions), 0) as total_conversions,
                COALESCE(SUM(ih.frequency * ih.reach), 0) as weighted_frequency_sum,
                COALESCE(SUM(ih.roas * ih.spend), 0) as weighted_roas_sum,
                COUNT(DISTINCT c.id) as campaigns_total
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1
              AND ih.date BETWEEN $2 AND $3
        `, [accountId, startStr, endStr]);

        const t = totals[0];
        const totalSpend = parseFloat(t.total_spend) || 0;
        const totalImpressions = parseInt(t.total_impressions) || 0;
        const totalReach = parseInt(t.total_reach) || 0;
        const totalClicks = parseInt(t.total_clicks) || 0;
        const totalConversions = parseInt(t.total_conversions) || 0;
        const weightedFreq = parseFloat(t.weighted_frequency_sum) || 0;
        const weightedRoas = parseFloat(t.weighted_roas_sum) || 0;

        const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
        const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
        const avgFrequency = totalReach > 0 ? weightedFreq / totalReach : 0;
        const avgRoas = totalSpend > 0 ? weightedRoas / totalSpend : 0;

        // Detecta o tipo de ação primária olhando TODO o JSON de actions salvo
        // (sem LIMIT — varremos todas as linhas para não enviesar por ordem).
        const actionsRows = await query<any>(`
            SELECT ih.actions FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3
              AND ih.actions IS NOT NULL
        `, [accountId, startStr, endStr]);

        let primaryActionLabel = 'Conversões';

        // Tiers de ações: dentro de cada tier, pega a de MAIOR volume.
        // Só desce para o próximo tier se o tier atual não tiver dados.
        const ACTION_TIERS = [
            [
                { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
                { type: 'purchase',                             label: 'Compras' },
                { type: 'offsite_conversion.fb_pixel_lead',     label: 'Leads' },
                { type: 'lead',                                 label: 'Leads' },
                { type: 'complete_registration',                label: 'Cadastros' },
                { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Mensagens' },
                { type: 'onsite_conversion.total_messaging_connection',        label: 'Mensagens' },
                { type: 'onsite_conversion.messaging_first_reply',             label: 'Mensagens' },
            ],
            [
                { type: 'post_engagement', label: 'Engajamentos' },
                { type: 'link_click',      label: 'Cliques no link' },
            ],
            [
                { type: 'video_view', label: 'Visualizações de vídeo' },
                { type: 'thruplay',   label: 'ThruPlays' },
            ],
        ];

        // Conta totais por action_type em todas as linhas de actions
        const actionTotals: Record<string, number> = {};
        for (const row of actionsRows) {
            const acts: any[] = Array.isArray(row.actions) ? row.actions : [];
            for (const a of acts) {
                actionTotals[a.action_type] = (actionTotals[a.action_type] || 0) + parseInt(a.value || '0', 10);
            }
        }

        // Dentro do tier mais alto com dados, escolhe o de maior volume
        for (const tier of ACTION_TIERS) {
            let bestCount = 0;
            for (const p of tier) {
                const count = actionTotals[p.type] || 0;
                if (count > bestCount) {
                    bestCount = count;
                    primaryActionLabel = p.label;
                }
            }
            if (bestCount > 0) break;
        }

        // Todas as campanhas do período — sem limite. ROAS e CTR ponderados.
        const topCampaigns = await query<any>(`
            SELECT
                c.name,
                c.status,
                COALESCE(SUM(ih.spend), 0) as spend,
                COALESCE(SUM(ih.impressions), 0) as impressions,
                COALESCE(SUM(ih.clicks), 0) as clicks,
                COALESCE(SUM(ih.conversions), 0) as conversions,
                COALESCE(SUM(ih.roas * ih.spend), 0) as weighted_roas_sum
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1
              AND ih.date BETWEEN $2 AND $3
            GROUP BY c.id, c.name, c.status
            ORDER BY spend DESC
        `, [accountId, startStr, endStr]);

        // Breakdown diário
        const dailyBreakdown = await query<any>(`
            SELECT
                ih.date::text,
                COALESCE(SUM(ih.spend), 0) as spend,
                COALESCE(SUM(ih.conversions), 0) as conversions,
                COALESCE(SUM(ih.clicks), 0) as clicks,
                COALESCE(SUM(ih.impressions), 0) as impressions
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1
              AND ih.date BETWEEN $2 AND $3
            GROUP BY ih.date
            ORDER BY ih.date ASC
        `, [accountId, startStr, endStr]);

        // Campanhas ativas no período
        const activeCampaigns = await query<any>(`
            SELECT COUNT(DISTINCT c.id) as count
            FROM campaigns c
            WHERE c.account_id = $1 AND c.status = 'ACTIVE'
        `, [accountId]);

        return {
            total_spend: totalSpend,
            total_impressions: totalImpressions,
            total_clicks: totalClicks,
            total_conversions: totalConversions,
            primary_action_label: primaryActionLabel,
            avg_ctr: avgCtr,
            avg_cpc: avgCpc,
            avg_cpm: avgCpm,
            avg_roas: avgRoas,
            avg_frequency: avgFrequency,
            cost_per_conversion: totalConversions > 0 ? totalSpend / totalConversions : 0,
            campaigns_active: parseInt(activeCampaigns[0]?.count) || 0,
            campaigns_total: parseInt(t.campaigns_total) || 0,
            spend_change_pct: null,
            conversions_change_pct: null,
            roas_change_pct: null,
            cpa_change_pct: null,
            top_campaigns: topCampaigns.map(c => {
                const sp = parseFloat(c.spend) || 0;
                const imp = parseInt(c.impressions) || 0;
                const clk = parseInt(c.clicks) || 0;
                const weightedRoasSum = parseFloat(c.weighted_roas_sum) || 0;
                return {
                    name: c.name,
                    status: c.status,
                    spend: sp,
                    conversions: parseInt(c.conversions) || 0,
                    roas: sp > 0 ? weightedRoasSum / sp : 0,
                    ctr: imp > 0 ? (clk / imp) * 100 : 0,
                };
            }),
            top_ads: [], // preenchido após sync em generateReport
            daily_breakdown: dailyBreakdown.map(d => ({
                date: d.date,
                spend: parseFloat(d.spend) || 0,
                conversions: parseInt(d.conversions) || 0,
                clicks: parseInt(d.clicks) || 0,
                impressions: parseInt(d.impressions) || 0,
            })),
        };
    }

    // ─── IA ───────────────────────────────────────────────────────────────────

    private async generateAIAnalysis(
        account: any,
        type: ReportType,
        periodStart: Date,
        periodEnd: Date,
        metrics: ReportMetrics,
        prevMetrics: ReportMetrics
    ): Promise<{ summary: string; ai_analysis: string; recommendations: string[] }> {
        const typeLabel = { daily: 'diário', weekly: 'semanal', monthly: 'mensal' }[type];
        const clientName = account.client_name || account.account_name || 'cliente';
        const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        const prompt = `Você é um especialista em gestão de tráfego pago. Analise o relatório ${typeLabel} abaixo e gere:
1. Um RESUMO EXECUTIVO (3-4 frases, em linguagem clara para o cliente, sem jargão técnico)
2. Uma ANÁLISE DETALHADA (paragrafos com insights reais, pontos de atenção e explicações)
3. Uma lista de RECOMENDAÇÕES PRIORITÁRIAS (máximo 5, objetivas e acionáveis)

Período: ${this.formatDateBR(periodStart)} a ${this.formatDateBR(periodEnd)}
Cliente: ${clientName}

MÉTRICA PRINCIPAL DAS CAMPANHAS: ${metrics.primary_action_label}
(Importante: analise as campanhas com base no objetivo correto — ${metrics.primary_action_label}. NÃO critique ausência de ROAS se o objetivo for mensagens/tráfego/engajamento.)

MÉTRICAS DO PERÍODO:
- Investimento: ${currency.format(metrics.total_spend)}
- Impressões: ${metrics.total_impressions.toLocaleString('pt-BR')}
- Cliques: ${metrics.total_clicks.toLocaleString('pt-BR')}
- ${metrics.primary_action_label}: ${metrics.total_conversions}
- Custo por ${metrics.primary_action_label}: ${metrics.cost_per_conversion > 0 ? currency.format(metrics.cost_per_conversion) : 'N/A'}
- CTR: ${metrics.avg_ctr.toFixed(2)}%
- CPC: ${currency.format(metrics.avg_cpc)}
- CPM: ${currency.format(metrics.avg_cpm)}
${metrics.avg_roas > 0 ? `- ROAS: ${metrics.avg_roas.toFixed(2)}x` : '- ROAS: N/A (objetivo não é conversão de vendas)'}
- Frequência: ${metrics.avg_frequency.toFixed(1)}x
- Campanhas ativas: ${metrics.campaigns_active}

VARIAÇÕES VS PERÍODO ANTERIOR:
- Investimento: ${this.formatChange(metrics.spend_change_pct)}
- ${metrics.primary_action_label}: ${this.formatChange(metrics.conversions_change_pct)}
${metrics.avg_roas > 0 ? `- ROAS: ${this.formatChange(metrics.roas_change_pct)}` : ''}
- Custo por resultado: ${this.formatChange(metrics.cpa_change_pct)}

TOP CAMPANHAS:
${metrics.top_campaigns.slice(0, 5).map(c =>
    `- ${c.name}: ${currency.format(c.spend)} investido, ${c.conversions} ${metrics.primary_action_label.toLowerCase()}${metrics.avg_roas > 0 ? `, ROAS ${c.roas.toFixed(2)}x` : ''}, CTR ${c.ctr.toFixed(2)}%`
).join('\n')}

Responda EXCLUSIVAMENTE em JSON com este formato:
{
  "resumo": "texto do resumo executivo para o cliente...",
  "analise": "análise detalhada em markdown...",
  "recomendacoes": ["recomendação 1", "recomendação 2", "recomendação 3"]
}`;

        try {
            const headers: any = {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            };
            if (OPENAI_ORG_ID) headers['OpenAI-Organization'] = OPENAI_ORG_ID;

            const response = await axios.post(OPENAI_API_URL, {
                model: OPENAI_MODEL,
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }],
            }, { headers, timeout: 30000 });

            const text = response.data.choices[0].message.content;
            const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());

            return {
                summary: json.resumo || '',
                ai_analysis: json.analise || '',
                recommendations: Array.isArray(json.recomendacoes) ? json.recomendacoes : [],
            };
        } catch (error: any) {
            logger.error('Erro ao gerar análise IA para relatório', { error: error.message });
            return {
                summary: `Relatório ${typeLabel} gerado para o período de ${this.formatDateBR(periodStart)} a ${this.formatDateBR(periodEnd)}.`,
                ai_analysis: 'Análise automática indisponível no momento.',
                recommendations: [],
            };
        }
    }

    // ─── EMAIL ────────────────────────────────────────────────────────────────

    private buildReportEmail(report: any, metrics: ReportMetrics, publicUrl: string, currency: string): string {
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v);
        const fmtNum = (v: number) => v.toLocaleString('pt-BR');

        const changeHtml = (pct: number | null) => {
            if (pct === null) return '<span style="color:#94a3b8">—</span>';
            const color = pct >= 0 ? '#22c55e' : '#ef4444';
            const arrow = pct >= 0 ? '↑' : '↓';
            return `<span style="color:${color}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
        };

        return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px">
<table width="620" cellpadding="0" cellspacing="0" style="background:#1a2234;border-radius:12px;overflow:hidden">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px">
    <table width="100%"><tr>
      <td><div style="font-size:24px;font-weight:800;color:#fff">TrafficAI</div>
          <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:2px">Relatório de Performance</div></td>
      <td align="right"><span style="background:rgba(255,255,255,.2);color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600">${report.type === 'daily' ? '📅 Diário' : report.type === 'weekly' ? '📆 Semanal' : '🗓️ Mensal'}</span></td>
    </tr></table>
  </td></tr>

  <!-- Title -->
  <tr><td style="padding:24px 32px 0">
    <h2 style="margin:0;font-size:20px;font-weight:700;color:#f1f5f9">${report.client_name || 'Seu negócio'}</h2>
    <p style="margin:6px 0 0;font-size:14px;color:#64748b">${report.title}</p>
  </td></tr>

  <!-- Summary -->
  <tr><td style="padding:20px 32px">
    <div style="background:#1e293b;border-radius:8px;padding:16px;border-left:3px solid #6366f1">
      <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.7">${report.summary}</p>
    </div>
  </td></tr>

  <!-- Metrics Grid -->
  <tr><td style="padding:0 32px 24px">
    <table width="100%" cellspacing="8">
      <tr>
        ${this.metricCard('💰 Investimento', fmt(metrics.total_spend), changeHtml(metrics.spend_change_pct))}
        ${this.metricCard('🎯 Conversões', fmtNum(metrics.total_conversions), changeHtml(metrics.conversions_change_pct))}
        ${this.metricCard('📈 ROAS', `${metrics.avg_roas.toFixed(2)}x`, changeHtml(metrics.roas_change_pct))}
        ${this.metricCard('💸 CPA', fmt(metrics.cost_per_conversion), changeHtml(metrics.cpa_change_pct))}
      </tr>
      <tr>
        ${this.metricCard('👁️ Impressões', fmtNum(metrics.total_impressions), '')}
        ${this.metricCard('🖱️ Cliques', fmtNum(metrics.total_clicks), '')}
        ${this.metricCard('📊 CTR', `${metrics.avg_ctr.toFixed(2)}%`, '')}
        ${this.metricCard('🔁 Frequência', `${metrics.avg_frequency.toFixed(1)}x`, '')}
      </tr>
    </table>
  </td></tr>

  <!-- Recommendations -->
  ${Array.isArray(report.recommendations) && report.recommendations.length > 0 ? `
  <tr><td style="padding:0 32px 24px">
    <h3 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#f1f5f9">🎯 Recomendações Prioritárias</h3>
    <table width="100%">
      ${(report.recommendations as string[]).map((rec, i) => `
      <tr><td style="padding:8px 12px;background:#1e293b;border-radius:6px;margin-bottom:6px;display:block">
        <span style="color:#6366f1;font-weight:700;margin-right:8px">${i + 1}.</span>
        <span style="font-size:13px;color:#94a3b8">${rec}</span>
      </td></tr>`).join('')}
    </table>
  </td></tr>` : ''}

  <!-- CTA -->
  <tr><td style="padding:0 32px 32px">
    <a href="${publicUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:16px;border-radius:8px;font-size:15px;font-weight:600">
      Ver Relatório Completo Online →
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 32px;border-top:1px solid #334155">
    <p style="margin:0;font-size:12px;color:#475569;text-align:center">
      Relatório gerado automaticamente pelo TrafficAI<br>
      <a href="${publicUrl}" style="color:#6366f1">Acessar relatório online</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
    }

    private metricCard(label: string, value: string, change: string): string {
        return `<td style="background:#1e293b;border-radius:8px;padding:14px;text-align:center;width:25%">
          <div style="font-size:11px;color:#64748b;margin-bottom:6px">${label}</div>
          <div style="font-size:18px;font-weight:700;color:#f1f5f9">${value}</div>
          ${change ? `<div style="font-size:12px;margin-top:4px">${change}</div>` : ''}
        </td>`;
    }

    // ─── CRIATIVOS ────────────────────────────────────────────────────────────

    private processAdInsights(adInsights: any[], thumbnails: Map<string, string>) {
        const AD_ACTION_TIERS: { type: string; label: string; singular: string }[][] = [
            [
                { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras',    singular: 'Compra' },
                { type: 'purchase',                             label: 'Compras',    singular: 'Compra' },
                { type: 'offsite_conversion.fb_pixel_lead',     label: 'Leads',      singular: 'Lead' },
                { type: 'lead',                                 label: 'Leads',      singular: 'Lead' },
                { type: 'complete_registration',                label: 'Cadastros',  singular: 'Cadastro' },
                { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Mensagens', singular: 'Mensagem' },
                { type: 'onsite_conversion.total_messaging_connection',        label: 'Mensagens', singular: 'Mensagem' },
                { type: 'onsite_conversion.messaging_first_reply',             label: 'Mensagens', singular: 'Mensagem' },
            ],
            [
                { type: 'post_engagement', label: 'Engajamentos',    singular: 'Engajamento' },
                { type: 'link_click',      label: 'Cliques no link', singular: 'Clique' },
            ],
            [
                { type: 'video_view', label: 'Visualizações', singular: 'Visualização' },
                { type: 'thruplay',   label: 'ThruPlays',     singular: 'ThruPlay' },
            ],
        ];

        return adInsights
            .map((a: any) => {
                const spend = parseFloat(a.spend || '0');
                const impressions = parseInt(a.impressions || '0', 10);
                const clicks = parseInt(a.clicks || '0', 10);
                const ctr = parseFloat(a.ctr || '0');
                const cpc = parseFloat(a.cpc || '0');
                const actions: any[] = Array.isArray(a.actions) ? a.actions : [];

                // Por criativo: dentro do tier mais alto com dados, pega o de MAIOR volume
                let conversions = 0;
                let actionLabel = 'Resultado';
                let actionSingular = 'Resultado';
                for (const tier of AD_ACTION_TIERS) {
                    let bestCount = 0;
                    for (const p of tier) {
                        const found = actions.find((x: any) => x.action_type === p.type);
                        const count = found ? parseInt(found.value || '0', 10) : 0;
                        if (count > bestCount) {
                            bestCount = count;
                            conversions = count;
                            actionLabel = p.label;
                            actionSingular = p.singular;
                        }
                    }
                    if (bestCount > 0) break;
                }

                // ROAS
                const roasArr: any[] = Array.isArray(a.purchase_roas) ? a.purchase_roas : [];
                const roas = roasArr.length ? parseFloat(roasArr[0].value || '0') : 0;

                // Hook rate: video_play_actions onde action_type === 'video_view' / impressions
                const videoPlays: any[] = Array.isArray(a.video_play_actions) ? a.video_play_actions : [];
                const threeSecViews = videoPlays.find((x: any) => x.action_type === 'video_view');
                const hookRate = (threeSecViews && impressions > 0)
                    ? (parseInt(threeSecViews.value || '0', 10) / impressions) * 100
                    : null;

                return {
                    ad_id: a.ad_id || '',
                    name: a.ad_name || 'Anúncio',
                    spend,
                    impressions,
                    clicks,
                    conversions,
                    action_label: actionLabel,
                    action_singular: actionSingular,
                    ctr,
                    cpc,
                    roas,
                    cpa: conversions > 0 ? spend / conversions : 0,
                    hook_rate: hookRate,
                    thumbnail_url: thumbnails.get(a.ad_id) || undefined,
                };
            })
            .filter(a => a.spend > 0)
            .sort((a, b) => b.spend - a.spend);
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    private calcChange(prev: number, curr: number): number | null {
        if (!prev || prev === 0) return null;
        return ((curr - prev) / prev) * 100;
    }

    private formatChange(pct: number | null): string {
        if (pct === null) return 'sem dados anteriores';
        const sign = pct >= 0 ? '+' : '';
        return `${sign}${pct.toFixed(1)}%`;
    }

    private formatDateBR(date: Date): string {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    /**
     * Retorna as datas do período para cada tipo.
     * Monthly = mês completo (dia 1 ao último dia). O cron roda no dia 1 do mês seguinte.
     * Weekly  = 7 dias encerrados ontem.
     * Daily   = dia de ontem.
     */
    static getPeriodDates(type: ReportType): { start: Date; end: Date } {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (type === 'daily') {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            return { start: yesterday, end: yesterday };
        }

        if (type === 'weekly') {
            const end = new Date(now);
            end.setDate(end.getDate() - 1); // ontem
            const start = new Date(end);
            start.setDate(start.getDate() - 6); // 7 dias atrás
            return { start, end };
        }

        // monthly: mês completo anterior (ex.: gerado em 2026-05-01 → 2026-04-01 a 2026-04-30)
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(firstOfThisMonth);
        end.setDate(end.getDate() - 1); // último dia do mês anterior
        const start = new Date(end.getFullYear(), end.getMonth(), 1);
        return { start, end };
    }

    /**
     * Gera relatórios automáticos para todas as contas ativas com a configuração habilitada
     */
    async generateAutoReports(type: ReportType): Promise<void> {
        const field = `${type}_enabled`;
        const accounts = await query<any>(`
            SELECT a.id, a.user_id
            FROM ad_accounts a
            JOIN report_settings rs ON rs.account_id = a.id
            WHERE a.is_client_active = true
              AND rs.${field} = true
        `);

        logger.info(`📊 Gerando ${accounts.length} relatórios ${type} automáticos`);

        const { start, end } = ReportService.getPeriodDates(type);

        for (const acc of accounts) {
            try {
                await this.generateReport(acc.user_id, acc.id, type, start, end);
            } catch (err: any) {
                logger.error(`Erro ao gerar relatório ${type} para conta ${acc.id}`, { error: err.message });
            }
        }
    }
}

export const reportService = new ReportService();
