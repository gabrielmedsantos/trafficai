// ==============================
// TrafficAI — Smart Alerts Service
// Sistema inteligente de alertas — ciente do objetivo de cada campanha
// ==============================

import { query } from '../database/connection';
import { metaRepository } from '../meta/meta.repository';
import { logger } from '../shared/logger';
import { notificationService } from '../notifications/notification.service';

// ── Prioridade de ações: mesmo mapeamento do meta.service.ts ──────────────────
const ACTION_PRIORITY: { type: string; label: string }[] = [
    { type: 'offsite_conversion.fb_pixel_purchase',                      label: 'Compras' },
    { type: 'purchase',                                                   label: 'Compras' },
    { type: 'offsite_conversion.fb_pixel_lead',                           label: 'Leads' },
    { type: 'lead',                                                        label: 'Leads' },
    { type: 'complete_registration',                                      label: 'Cadastros' },
    { type: 'onsite_conversion.messaging_conversation_started_7d',        label: 'Conversas iniciadas no WhatsApp' },
    { type: 'onsite_conversion.total_messaging_connection',               label: 'Conexões de mensagem' },
    { type: 'onsite_conversion.messaging_first_reply',                    label: 'Primeiras respostas' },
    { type: 'post_engagement',                                            label: 'Engajamentos' },
    { type: 'page_engagement',                                            label: 'Engajamentos' },
    { type: 'post_reaction',                                              label: 'Reações' },
    { type: 'link_click',                                                  label: 'Cliques no link' },
    { type: 'video_view',                                                  label: 'Visualizações de vídeo' },
    { type: 'thruplay',                                                    label: 'ThruPlays' },
];

/** Objetivos cujo sucesso é volume de alcance/views — não CPA nem conversão */
const AWARENESS_OBJECTIVES = new Set([
    // Nomenclatura legada
    'REACH', 'BRAND_AWARENESS', 'VIDEO_VIEWS', 'POST_ENGAGEMENT', 'PAGE_LIKES',
    'EVENT_RESPONSES', 'LOCAL_AWARENESS',
    // Nomenclatura OUTCOME_* (Meta API v14+)
    'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT',
]);

/** Objetivos de tráfego — foco em CTR / cliques */
const TRAFFIC_OBJECTIVES = new Set([
    'LINK_CLICKS', 'TRAFFIC', 'STORE_TRAFFIC',
    'OUTCOME_TRAFFIC',
]);

/** Objetivos de mensagens */
const MESSAGE_OBJECTIVES = new Set([
    'MESSAGES', 'CONVERSATIONS', 'WHATSAPP_MESSAGE',
]);

// ── Tipos de alertas que não fazem sentido por objetivo ──────────────────────
function shouldSkipConversionAlert(objective?: string): boolean {
    if (!objective) return false;
    const obj = objective.toUpperCase();
    return AWARENESS_OBJECTIVES.has(obj) || TRAFFIC_OBJECTIVES.has(obj);
}

function shouldSkipRoasAlert(objective?: string): boolean {
    if (!objective) return false;
    const obj = objective.toUpperCase();
    return AWARENESS_OBJECTIVES.has(obj) || TRAFFIC_OBJECTIVES.has(obj) || MESSAGE_OBJECTIVES.has(obj);
}

// ── Detecta ação primária a partir do JSONB actions[] ─────────────────────────
interface PrimaryAction { count: number; label: string; actionType: string }

function detectPrimaryAction(actions: any[]): PrimaryAction | null {
    if (!Array.isArray(actions) || actions.length === 0) return null;

    for (const { type, label } of ACTION_PRIORITY) {
        const found = actions.find((a: any) => a.action_type === type);
        if (found) {
            const count = parseInt(found.value || found.values?.[0]?.value || '0', 10);
            if (count > 0) return { count, label, actionType: type };
        }
    }
    return null;
}

// ── Retorna rótulo contextual de "ação" para mensagens de alerta ─────────────
function actionLabelFor(objective?: string, primaryAction?: PrimaryAction | null): string {
    if (primaryAction) return primaryAction.label;
    const obj = (objective || '').toUpperCase();
    if (MESSAGE_OBJECTIVES.has(obj))  return 'conversas iniciadas';
    if (TRAFFIC_OBJECTIVES.has(obj))  return 'cliques';
    if (AWARENESS_OBJECTIVES.has(obj)) return 'visualizações';
    return 'conversões';
}

// ── Retorna rótulo para "custo por ação" ─────────────────────────────────────
function cpaLabelFor(objective?: string, primaryAction?: PrimaryAction | null): string {
    const base = actionLabelFor(objective, primaryAction);
    // Remover plural onde necessário
    const map: Record<string, string> = {
        'compras': 'Custo por Compra',
        'leads': 'Custo por Lead',
        'cadastros': 'Custo por Cadastro',
        'conversas iniciadas no whatsapp': 'Custo por Conversa',
        'conexões de mensagem': 'Custo por Conexão',
        'primeiras respostas': 'Custo por Resposta',
        'engajamentos': 'Custo por Engajamento',
        'cliques no link': 'Custo por Clique',
        'visualizações de vídeo': 'Custo por Visualização',
        'thruplays': 'Custo por ThruPlay',
        'cliques': 'Custo por Clique',
        'conversões': 'Custo por Conversão',
    };
    return map[base.toLowerCase()] ?? `Custo por ${base}`;
}

// ── Interface interna de alerta ───────────────────────────────────────────────
interface Alert {
    user_id: string;
    account_id?: string;
    campaign_id?: string;
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    metric_name?: string;
    previous_value?: number;
    current_value?: number;
    metric_threshold?: number;
    auto_generated: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
export class SmartAlertsService {

    /**
     * Analisa TODAS as contas ativas de todos os usuários.
     * Chamado pelo alerts.worker a cada 30 minutos.
     */
    async analyzeActiveAccounts(): Promise<void> {
        try {
            logger.info('🔔 Iniciando análise de alertas para contas ativas');

            const accounts = await query<any>(
                `SELECT a.*, u.id as user_id
                 FROM ad_accounts a
                 JOIN users u ON a.user_id = u.id
                 WHERE a.is_client_active = true`
            );

            logger.info(`Analisando ${accounts.length} contas ativas`);
            for (const account of accounts) {
                await this.analyzeAccount(account);
            }
            logger.info('✅ Análise de alertas concluída');
        } catch (error: any) {
            logger.error('Erro ao analisar contas para alertas', { error: error.message });
        }
    }

    /**
     * Analisa apenas as contas ativas de um usuário específico.
     * Chamado pelo sync.worker após cada ciclo de sincronização.
     */
    async analyzeActiveAccountsByUser(userId: string): Promise<void> {
        try {
            const accounts = await query<any>(
                `SELECT a.*, $1::uuid as user_id
                 FROM ad_accounts a
                 WHERE a.user_id = $1
                   AND a.is_client_active = true`,
                [userId]
            );

            logger.info(`Analisando ${accounts.length} contas ativas do usuário ${userId}`);
            for (const account of accounts) {
                await this.analyzeAccount(account);
            }
        } catch (error: any) {
            logger.error('Erro ao analisar contas do usuário para alertas', { userId, error: error.message });
        }
    }

    private async analyzeAccount(account: any): Promise<void> {
        const alerts: Alert[] = [];

        // ── Balance / payment checks (account-level) ──────────────────────────
        await this.checkAccountBalance(account);

        const campaigns = await metaRepository.getCampaignsByAccount(account.id);

        for (const campaign of campaigns) {
            const insights = await metaRepository.getInsightsByCampaign(campaign.id, 7);
            if (insights.length === 0) continue;

            const latest   = insights[0];
            const previous = insights[1];
            const currency = account.currency || 'BRL';
            const name     = campaign.name;
            const obj      = campaign.objective as string | undefined;

            // Detecta ação primária a partir do JSONB de ações
            const latestAction   = detectPrimaryAction(latest.actions   ?? []);
            const previousAction = detectPrimaryAction(previous?.actions ?? []);

            // Valores contextuais de "conversão"
            const latestCount   = latestAction?.count   ?? latest.conversions   ?? 0;
            const previousCount = previousAction?.count ?? previous?.conversions ?? 0;
            const latestCpa     = latestCount  > 0 ? latest.spend  / latestCount  : latest.cost_per_conversion;
            const previousCpa   = previousCount > 0 ? previous?.spend / previousCount : previous?.cost_per_conversion;

            const actionLabel = actionLabelFor(obj, latestAction);
            const cpaLabel    = cpaLabelFor(obj, latestAction);

            // ── 1. Orçamento acabando ───────────────────────────────────────
            if (campaign.daily_budget && latest.spend) {
                const pct = (latest.spend / campaign.daily_budget) * 100;
                if (pct >= 90 && pct < 100) {
                    alerts.push({
                        user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                        type: 'budget_warning', severity: 'warning',
                        title: '⚠️ Orçamento Diário Acabando',
                        message: `"${name}" já consumiu ${pct.toFixed(1)}% do orçamento diário (${this.fmt(latest.spend, currency)} de ${this.fmt(campaign.daily_budget, currency)}).`,
                        metric_name: 'daily_spend', current_value: latest.spend,
                        metric_threshold: campaign.daily_budget, auto_generated: true,
                    });
                }
            }

            // ── 2. Orçamento esgotado ──────────────────────────────────────
            if (campaign.daily_budget && latest.spend >= campaign.daily_budget) {
                alerts.push({
                    user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                    type: 'budget_exhausted', severity: 'critical',
                    title: '🚨 Orçamento Diário Esgotado',
                    message: `"${name}" atingiu 100% do orçamento diário (${this.fmt(campaign.daily_budget, currency)}). Anúncios pausados.`,
                    metric_name: 'daily_spend', current_value: latest.spend,
                    metric_threshold: campaign.daily_budget, auto_generated: true,
                });
            }

            if (previous) {
                // ── 3. CPA / Custo por ação elevado ───────────────────────
                if (!shouldSkipConversionAlert(obj) && latestCpa > 0 && previousCpa && previousCpa > 0) {
                    const cpaIncrease = ((latestCpa - previousCpa) / previousCpa) * 100;
                    if (cpaIncrease > 50) {
                        alerts.push({
                            user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                            type: 'cpa_spike', severity: 'critical',
                            title: `📈 ${cpaLabel} Subiu Drasticamente`,
                            message: `"${name}": o ${cpaLabel.toLowerCase()} aumentou ${cpaIncrease.toFixed(1)}% — de ${this.fmt(previousCpa, currency)} para ${this.fmt(latestCpa, currency)}. Verifique público-alvo e criativos.`,
                            metric_name: 'cpa', previous_value: previousCpa, current_value: latestCpa,
                            auto_generated: true,
                        });
                    }
                }

                // ── 4. CTR baixo ───────────────────────────────────────────
                if (latest.ctr < 0.5 && latest.impressions > 1000) {
                    const tip = TRAFFIC_OBJECTIVES.has((obj || '').toUpperCase())
                        ? 'Como esta campanha foca em tráfego, o CTR é a métrica principal — revise o criativo e o copy.'
                        : 'Considere revisar criativos, copy e segmentação.';
                    alerts.push({
                        user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                        type: 'low_ctr', severity: 'warning',
                        title: '📉 CTR Abaixo do Esperado',
                        message: `"${name}" com CTR de ${Number(latest.ctr).toFixed(2)}%. ${tip}`,
                        metric_name: 'ctr', current_value: Number(latest.ctr),
                        metric_threshold: 0.5, auto_generated: true,
                    });
                }

                // ── 5. ROAS baixo ──────────────────────────────────────────
                if (!shouldSkipRoasAlert(obj) && latest.roas > 0 && latest.roas < 1.5 && latest.spend > 100) {
                    alerts.push({
                        user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                        type: 'low_roas', severity: 'critical',
                        title: '💸 ROAS Abaixo do Ideal',
                        message: `"${name}" com ROAS de apenas ${Number(latest.roas).toFixed(2)}×. O investimento não está gerando retorno suficiente — revise segmentação e oferta.`,
                        metric_name: 'roas', current_value: Number(latest.roas),
                        metric_threshold: 1.5, auto_generated: true,
                    });
                }

                // ── 6. Queda de ações ──────────────────────────────────────
                if (!shouldSkipConversionAlert(obj) && latestCount > 0 && previousCount > 0) {
                    const drop = ((previousCount - latestCount) / previousCount) * 100;
                    if (drop > 40) {
                        alerts.push({
                            user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                            type: 'conversions_drop', severity: 'warning',
                            title: `📊 ${this.capitalize(actionLabel)} em Queda`,
                            message: `"${name}": ${actionLabel} caíram ${drop.toFixed(1)}% — de ${previousCount} para ${latestCount}. Verifique funil, criativo e segmentação.`,
                            metric_name: 'conversions', previous_value: previousCount, current_value: latestCount,
                            auto_generated: true,
                        });
                    }
                }

                // ── 7. Frequência alta ─────────────────────────────────────
                if (Number(latest.frequency) > 4) {
                    const tip = MESSAGE_OBJECTIVES.has((obj || '').toUpperCase())
                        ? 'Para campanhas de mensagens, alta frequência pode incomodar o usuário antes de iniciar a conversa.'
                        : 'Seu público pode estar saturado. Considere ampliar público ou renovar criativos.';
                    alerts.push({
                        user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                        type: 'high_frequency', severity: Number(latest.frequency) > 6 ? 'critical' : 'warning',
                        title: '🔁 Frequência Muito Alta',
                        message: `"${name}" exibindo anúncios ${Number(latest.frequency).toFixed(1)}× para a mesma pessoa. ${tip}`,
                        metric_name: 'frequency', current_value: Number(latest.frequency),
                        metric_threshold: 4, auto_generated: true,
                    });
                }

                // ── 8. CPM elevado ─────────────────────────────────────────
                if (Number(latest.cpm) > 50 && Number(previous.cpm) > 0) {
                    const cpmIncrease = ((Number(latest.cpm) - Number(previous.cpm)) / Number(previous.cpm)) * 100;
                    if (cpmIncrease > 30) {
                        const tip = AWARENESS_OBJECTIVES.has((obj || '').toUpperCase())
                            ? 'Para campanhas de alcance, CPM alto impacta diretamente o custo por pessoa alcançada.'
                            : 'Pode indicar alta concorrência no leilão ou queda no índice de qualidade do anúncio.';
                        alerts.push({
                            user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                            type: 'high_cpm', severity: 'warning',
                            title: '💰 CPM Elevado',
                            message: `"${name}": CPM subiu ${cpmIncrease.toFixed(1)}% (${this.fmt(Number(latest.cpm), currency)}). ${tip}`,
                            metric_name: 'cpm', previous_value: Number(previous.cpm), current_value: Number(latest.cpm),
                            auto_generated: true,
                        });
                    }
                }

                // ── 9. Baixa diversidade de alcance ───────────────────────
                if (Number(latest.impressions) > 0 && Number(latest.reach) > 0) {
                    const reachRatio = (Number(latest.reach) / Number(latest.impressions)) * 100;
                    if (reachRatio < 40 && Number(latest.impressions) > 10000) {
                        alerts.push({
                            user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                            type: 'low_delivery', severity: 'info',
                            title: '📢 Público com Baixa Diversidade',
                            message: `"${name}": apenas ${reachRatio.toFixed(1)}% das impressões são de pessoas diferentes. Considere expandir o público.`,
                            metric_name: 'reach_ratio', current_value: reachRatio,
                            metric_threshold: 40, auto_generated: true,
                        });
                    }
                }
            }

            // ── 10. Sem ações (gasto sem resultado) ────────────────────────
            if (!shouldSkipConversionAlert(obj) && latest.spend > 50 && latestCount === 0) {
                // Monta mensagem específica por objetivo
                let tip: string;
                const upperObj = (obj || '').toUpperCase();
                if (MESSAGE_OBJECTIVES.has(upperObj)) {
                    tip = `Nenhuma conversa iniciada no WhatsApp. Verifique o botão de CTA, horário de atendimento e se o número do WhatsApp está configurado corretamente.`;
                } else if (upperObj.includes('LEAD')) {
                    tip = `Nenhum lead gerado. Confira o formulário nativo do Facebook, a página de destino e o pixel.`;
                } else {
                    tip = `Nenhum resultado de ${actionLabel}. Verifique o pixel, a página de destino e o funil de conversão.`;
                }
                alerts.push({
                    user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                    type: 'no_conversions', severity: 'critical',
                    title: `🎯 Sem ${this.capitalize(actionLabel)}`,
                    message: `"${name}" já gastou ${this.fmt(latest.spend, currency)} e não gerou nenhum resultado. ${tip}`,
                    metric_name: 'conversions', current_value: 0,
                    auto_generated: true,
                });
            }

            // ── 11. Alerta específico para tráfego sem cliques ─────────────
            if (TRAFFIC_OBJECTIVES.has((obj || '').toUpperCase()) && latest.spend > 30 && Number(latest.clicks) === 0) {
                alerts.push({
                    user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                    type: 'no_clicks', severity: 'critical',
                    title: '🖱️ Campanha de Tráfego Sem Cliques',
                    message: `"${name}" é uma campanha de tráfego que gastou ${this.fmt(latest.spend, currency)} sem nenhum clique. Revise o criativo, CTA e segmentação imediatamente.`,
                    metric_name: 'clicks', current_value: 0,
                    auto_generated: true,
                });
            }

            // ── 12. Alerta específico para engajamento/alcance sem impressões ─
            if (AWARENESS_OBJECTIVES.has((obj || '').toUpperCase()) && latest.spend > 30 && Number(latest.impressions) < 100) {
                alerts.push({
                    user_id: account.user_id, account_id: account.id, campaign_id: campaign.id,
                    type: 'low_impressions', severity: 'warning',
                    title: '📉 Pouquíssimas Impressões',
                    message: `"${name}" é uma campanha de alcance/consciência que gerou apenas ${latest.impressions} impressões com ${this.fmt(latest.spend, currency)} gastos. Verifique aprovação do anúncio e segmentação.`,
                    metric_name: 'impressions', current_value: Number(latest.impressions),
                    auto_generated: true,
                });
            }
        }

        for (const alert of alerts) {
            await this.createAlertIfNotExists(alert);
        }
    }

    // ── Verifica saldo e status de pagamento da conta ─────────────────────────
    private async checkAccountBalance(account: any): Promise<void> {
        const currency = account.currency || 'BRL';
        const accountName: string = account.account_name || account.id;

        // ── LOW_BALANCE: PIX accounts below threshold ───────────────────────
        if (
            account.payment_type === 'pix' &&
            account.balance_alert_threshold != null &&
            Number(account.balance_alert_threshold) > 0 &&
            account.cached_balance != null
        ) {
            const balance   = Number(account.cached_balance);
            const threshold = Number(account.balance_alert_threshold);

            if (balance <= threshold) {
                const title = `Saldo baixo — ${accountName}`;
                const alreadyExists = await this.alertExistsByTitle(account.user_id, title);
                if (!alreadyExists) {
                    await this.createAlertIfNotExists({
                        user_id: account.user_id,
                        account_id: account.id,
                        campaign_id: undefined,
                        type: 'LOW_BALANCE',
                        severity: 'critical',
                        title,
                        message: `Saldo atual ${this.fmt(balance, currency)} está abaixo do limite configurado de ${this.fmt(threshold, currency)}. Solicite recarga ao cliente.`,
                        metric_name: 'balance',
                        current_value: balance,
                        metric_threshold: threshold,
                        auto_generated: true,
                    });
                }
            }
        }

        // ── PAYMENT_FAILED: account_status is unsettled / grace / closure ───
        const problematicStatuses = new Set([3, 7, 9]);
        if (
            account.cached_account_status != null &&
            problematicStatuses.has(Number(account.cached_account_status))
        ) {
            const statusCode = Number(account.cached_account_status);
            const statusMessages: Record<number, string> = {
                3: 'Conta com pagamento em aberto (Unsettled). Verifique o método de pagamento.',
                7: 'Conta em período de carência. O pagamento está pendente.',
                9: 'Conta prestes a ser encerrada por falta de pagamento.',
            };
            const title = `Problema no pagamento — ${accountName}`;
            const alreadyExists = await this.alertExistsByTitle(account.user_id, title);
            if (!alreadyExists) {
                await this.createAlertIfNotExists({
                    user_id: account.user_id,
                    account_id: account.id,
                    campaign_id: undefined,
                    type: 'PAYMENT_FAILED',
                    severity: 'critical',
                    title,
                    message: statusMessages[statusCode] ?? 'Problema de pagamento detectado na conta.',
                    metric_name: 'account_status',
                    current_value: statusCode,
                    auto_generated: true,
                });
            }
        }
    }

    // ── Verifica se já existe alerta com o mesmo título nas últimas 24h ───────
    private async alertExistsByTitle(userId: string, title: string): Promise<boolean> {
        const existing = await query<{ id: string }>(
            `SELECT id FROM alerts
             WHERE user_id = $1 AND title = $2
               AND created_at > NOW() - INTERVAL '24 hours'
             LIMIT 1`,
            [userId, title]
        );
        return existing.length > 0;
    }

    // ── Cria alerta se não existe similar nas últimas 24h ────────────────────
    private async createAlertIfNotExists(alert: Alert): Promise<void> {
        try {
            const existing = await query(
                `SELECT id FROM alerts
                 WHERE user_id = $1 AND type = $2 AND campaign_id = $3
                   AND created_at > NOW() - INTERVAL '24 hours'
                 LIMIT 1`,
                [alert.user_id, alert.type, alert.campaign_id]
            );
            if (existing.length > 0) return;

            const inserted = await query<{ id: string }>(
                `INSERT INTO alerts (
                    user_id, account_id, campaign_id, type, severity, title, message,
                    metric_name, previous_value, current_value, metric_threshold, auto_generated
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                RETURNING id`,
                [
                    alert.user_id, alert.account_id || null, alert.campaign_id || null,
                    alert.type, alert.severity, alert.title, alert.message,
                    alert.metric_name || null, alert.previous_value || null,
                    alert.current_value || null, alert.metric_threshold || null,
                    alert.auto_generated,
                ]
            );

            logger.info(`✅ Alerta criado: ${alert.title}`, { type: alert.type });

            if (inserted.length > 0) {
                notificationService.sendAlertNotification(alert.user_id, {
                    id: inserted[0].id,
                    type: alert.type, severity: alert.severity,
                    title: alert.title, message: alert.message,
                    metric_name: alert.metric_name,
                    previous_value: alert.previous_value,
                    current_value: alert.current_value,
                }).catch(err => logger.error('Erro ao enviar notificação', { error: err.message }));
            }
        } catch (error: any) {
            logger.error('Erro ao criar alerta', { error: error.message });
        }
    }

    private fmt(value: number, currency: string): string {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value);
    }

    private capitalize(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
}

export const smartAlertsService = new SmartAlertsService();
