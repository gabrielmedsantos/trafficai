// ==============================
// TrafficAI — Daily WhatsApp Text Report Service
// Envia resumo diário de métricas via WhatsApp (texto, não link)
// ==============================

import axios from 'axios';
import crypto from 'crypto';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

interface AccountWithSettings {
    id: string;
    user_id: string;
    account_name: string;
    meta_account_id: string;
    client_name: string | null;
    client_phone: string | null;
    // notification_settings
    whatsapp_provider: 'uazapi' | 'evolution' | 'zapi' | null;
    uazapi_url: string | null;
    uazapi_token: string | null;
    evolution_api_url: string | null;
    evolution_api_key: string | null;
    evolution_instance: string | null;
    zapi_instance_id: string | null;
    zapi_token: string | null;
    zapi_client_token: string | null;
    // approval workflow
    owner_whatsapp: string | null;
    daily_report_approval_required: boolean | null;
}

const PUBLIC_BASE_URL = process.env.PUBLIC_API_URL || 'https://api.alfamaxdigital.com.br';

/** Retorna a data de "ontem" em fuso de Brasília (BRT, UTC-3), formato YYYY-MM-DD. */
function yesterdayBRT(): string {
    const nowUtc = Date.now();
    const brtMs = nowUtc - 3 * 60 * 60 * 1000;
    const yesterdayBrt = new Date(brtMs - 24 * 60 * 60 * 1000);
    return yesterdayBrt.toISOString().slice(0, 10);
}

interface DayMetrics {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpm: number;
    roas: number;
    cost_per_conversion: number;
    primary_action_label: string;
}

interface RangeMetrics {
    spend: number;
    impressions: number;
    leads: number;
    cost_per_lead: number;
    primary_action_label: string;
}

export class DailyWhatsAppService {

    /**
     * Roda a cada 15min — dispara relatório pra contas cujo horário UTC bate com o slot atual
     * e que ainda não enviaram hoje (controle por daily_whatsapp_last_sent_date).
     */
    async sendScheduledReports(): Promise<void> {
        const now = new Date();
        // Slot de 15min: arredonda pra baixo (ex: 14:33 → 14:30)
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(Math.floor(now.getUTCMinutes() / 15) * 15).padStart(2, '0');
        const slot = `${hh}:${mm}`;
        const todayStr = now.toISOString().slice(0, 10);

        let accounts: AccountWithSettings[];
        try {
            accounts = await query<AccountWithSettings>(`
                SELECT
                    a.id, a.user_id, a.account_name, a.meta_account_id,
                    rs.client_name, rs.client_phone,
                    ns.whatsapp_provider,
                    ns.uazapi_url, ns.uazapi_token,
                    ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                    ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token,
                    ns.owner_whatsapp, ns.daily_report_approval_required
                FROM ad_accounts a
                JOIN report_settings rs ON rs.account_id = a.id
                LEFT JOIN notification_settings ns ON ns.user_id = a.user_id
                WHERE a.is_client_active = true
                  AND rs.daily_whatsapp_enabled = true
                  AND rs.client_phone IS NOT NULL AND rs.client_phone <> ''
                  AND COALESCE(rs.daily_whatsapp_time, '11:15') = $1
                  AND (rs.daily_whatsapp_last_sent_date IS NULL OR rs.daily_whatsapp_last_sent_date < $2::DATE)
            `, [slot, todayStr]);
        } catch (err: any) {
            // tabela/coluna não criada ainda — silencia
            return;
        }

        if (!accounts.length) return;

        logger.info(`📱 Slot ${slot} UTC: ${accounts.length} relatório(s) WhatsApp pra enviar`);

        // Data reportada: ONTEM em BRT (relatório diário sempre fala do dia anterior em horário Brasília)
        const dateStr = yesterdayBRT();

        for (const acc of accounts) {
            if (acc.client_phone!.startsWith('https://chat.whatsapp.com/')) {
                logger.warn(`daily-whatsapp: ${acc.account_name} usa link convite — use ID do grupo (xxx@g.us) ou número`);
                continue;
            }
            try {
                const message = await this.buildFullReport(acc, dateStr);
                if (acc.daily_report_approval_required && acc.owner_whatsapp) {
                    await this.queueForApproval(acc, message, dateStr);
                    logger.info(`📤 Relatório p/ aprovação: ${acc.account_name} → dono`);
                } else {
                    await this.send(acc, acc.client_phone!, message);
                    logger.info(`✅ Relatório enviado: ${acc.account_name} → ${acc.client_phone}`);
                }
                await query(
                    `UPDATE report_settings SET daily_whatsapp_last_sent_date = $1::DATE WHERE account_id = $2`,
                    [todayStr, acc.id]
                );
            } catch (err: any) {
                logger.error(`Falha relatório ${acc.account_name}`, { error: err.message });
            }
        }
    }

    /**
     * Envia relatório diário de texto via WhatsApp para todas as contas habilitadas.
     * Chamado manualmente — sem filtro de horário, sem dedupe diário.
     */
    async sendDailyReports(): Promise<void> {
        // Busca contas com daily_whatsapp_enabled = true e client_phone configurado
        let accounts: AccountWithSettings[];
        try {
            accounts = await query<AccountWithSettings>(`
                SELECT
                    a.id, a.user_id, a.account_name, a.meta_account_id,
                    rs.client_name, rs.client_phone,
                    ns.whatsapp_provider,
                    ns.uazapi_url, ns.uazapi_token,
                    ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                    ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token,
                    ns.owner_whatsapp, ns.daily_report_approval_required
                FROM ad_accounts a
                JOIN report_settings rs ON rs.account_id = a.id
                LEFT JOIN notification_settings ns ON ns.user_id = a.user_id
                WHERE a.is_client_active = true
                  AND rs.daily_whatsapp_enabled = true
                  AND rs.client_phone IS NOT NULL
                  AND rs.client_phone <> ''
            `);
        } catch (err: any) {
            logger.warn('daily-whatsapp: coluna daily_whatsapp_enabled não existe ainda', { error: err.message });
            return;
        }

        if (!accounts.length) {
            logger.info('daily-whatsapp: nenhuma conta habilitada');
            return;
        }

        logger.info(`📱 Enviando relatório diário WhatsApp para ${accounts.length} conta(s)`);

        // Ontem em BRT
        const dateStr = yesterdayBRT();

        for (const acc of accounts) {
            if (acc.client_phone!.startsWith('https://chat.whatsapp.com/')) {
                logger.warn(`daily-whatsapp: ${acc.account_name} usa link convite — use o ID do grupo (xxx@g.us) ou número`);
                continue;
            }
            try {
                const message = await this.buildFullReport(acc, dateStr);

                // Modo aprovação: manda pro DONO com link, salva pendente
                if (acc.daily_report_approval_required && acc.owner_whatsapp) {
                    await this.queueForApproval(acc, message, dateStr);
                    logger.info(`📤 Relatório enviado pra aprovação: ${acc.account_name} → dono`);
                } else {
                    await this.send(acc, acc.client_phone!, message);
                    logger.info(`✅ Relatório diário enviado: ${acc.account_name} → ${acc.client_phone}`);
                }
            } catch (err: any) {
                logger.error(`Falha ao enviar relatório diário para ${acc.account_name}`, { error: err.message });
            }
        }
    }

    /**
     * Monta o relatório completo (3 períodos + ads ativos) no formato cliente.
     */
    private async buildFullReport(acc: AccountWithSettings, todayDateStr: string): Promise<string> {
        // "Hoje" no relatório = data informada (geralmente ontem, conforme cron)
        const today = new Date(todayDateStr + 'T12:00:00Z');
        // Últimos 7 dias COMPLETOS antes do dia "Hoje"
        const last7End = new Date(today); last7End.setUTCDate(last7End.getUTCDate() - 1);
        const last7Start = new Date(last7End); last7Start.setUTCDate(last7Start.getUTCDate() - 6);
        // Mês corrente: dia 1 do mês de "Hoje" até o próprio "Hoje"
        const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        const monthEnd = today;

        const todayStr = this.toISODate(today);
        const last7StartStr = this.toISODate(last7Start);
        const last7EndStr = this.toISODate(last7End);
        const monthStartStr = this.toISODate(monthStart);
        const monthEndStr = this.toISODate(monthEnd);

        const [todayM, last7M, monthM, activeAds] = await Promise.all([
            this.getRangeMetrics(acc.id, todayStr, todayStr),
            this.getRangeMetrics(acc.id, last7StartStr, last7EndStr),
            this.getRangeMetrics(acc.id, monthStartStr, monthEndStr),
            this.countActiveAds(acc.id),
        ]);

        return this.buildMessageNew(acc, {
            today: { metrics: todayM, label: this.formatDayBR(todayStr) },
            last7d: { metrics: last7M, label: `${this.formatDayBR(last7StartStr)} a ${this.formatDayBR(last7EndStr)}` },
            month: { metrics: monthM, label: `${this.formatDayBR(monthStartStr)} a ${this.formatDayBR(monthEndStr)}` },
            activeAds,
        });
    }

    private toISODate(d: Date): string {
        return d.toISOString().slice(0, 10);
    }

    private formatDayBR(iso: string): string {
        const [, m, d] = iso.split('-');
        return `${d}/${m}`;
    }

    private async getRangeMetrics(accountId: string, fromDate: string, toDate: string): Promise<RangeMetrics> {
        const rows = await query<any>(`
            SELECT
                COALESCE(SUM(ih.spend), 0)         AS spend,
                COALESCE(SUM(ih.impressions), 0)   AS impressions,
                COALESCE(SUM(ih.conversions), 0)   AS conversions
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1
              AND ih.date >= $2 AND ih.date <= $3
        `, [accountId, fromDate, toDate]);
        const t = rows[0] || {};
        const spend = parseFloat(t.spend) || 0;
        const conversions = parseInt(t.conversions) || 0;

        // Detecta label da ação primária pelo período
        const actionsRows = await query<any>(`
            SELECT ih.actions FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1 AND ih.date >= $2 AND ih.date <= $3
        `, [accountId, fromDate, toDate]);

        return {
            spend,
            impressions: parseInt(t.impressions) || 0,
            leads: conversions,
            cost_per_lead: conversions > 0 ? spend / conversions : 0,
            primary_action_label: this.detectPrimaryAction(actionsRows),
        };
    }

    private async countActiveAds(accountId: string): Promise<number> {
        // "Ativos" = ACTIVE/em análise NO META + tiveram impressões nos últimos 7 dias
        // (filtro de impressões evita contar campaigns pausadas que ficaram com status defasado)
        const r = await query<any>(`
            SELECT COUNT(DISTINCT c.id)::INT AS n
            FROM campaigns c
            LEFT JOIN insights_history ih ON ih.campaign_id = c.id
                AND ih.date >= (CURRENT_DATE - INTERVAL '7 days')
                AND ih.impressions > 0
            WHERE c.account_id = $1
              AND (
                  c.status IN ('ACTIVE', 'IN_PROCESS', 'PENDING_REVIEW', 'IN_REVIEW', 'PREAPPROVED')
                  OR ih.id IS NOT NULL
              )
        `, [accountId]);
        return Number(r[0]?.n ?? 0);
    }

    private greetingPrefix(): string {
        const hour = new Date().getHours();
        if (hour < 12) return 'Bom dia';
        if (hour < 18) return 'Boa tarde';
        return 'Boa noite';
    }

    private buildMessageNew(
        acc: AccountWithSettings,
        data: {
            today: { metrics: RangeMetrics; label: string };
            last7d: { metrics: RangeMetrics; label: string };
            month: { metrics: RangeMetrics; label: string };
            activeAds: number;
        }
    ): string {
        const clientName = (acc.client_name || acc.account_name || 'Cliente').toUpperCase();
        const greeting = this.greetingPrefix();
        const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const fmtNum = (v: number) => v.toLocaleString('pt-BR');

        const block = (m: RangeMetrics) =>
            `💰 Investimento de ${fmtBRL(m.spend)}\n` +
            `⚡️ Impressões: ${fmtNum(m.impressions)}\n` +
            `📊 Total de ${fmtNum(m.leads)} ${m.leads === 1 ? 'lead' : 'leads'}\n` +
            `💰 Custo por lead de ${fmtBRL(m.cost_per_lead)}`;

        return [
            `${greeting} *${clientName}*, tudo bem?`,
            '',
            'Resumo de Ontem:',
            `> [${data.today.label}]`,
            '',
            block(data.today.metrics),
            '',
            'Resumo de nossas campanhas nos últimos 7 dias:',
            `> [${data.last7d.label}]`,
            '',
            block(data.last7d.metrics),
            '',
            'Resumo desse mês:',
            `> [${data.month.label}]`,
            '',
            block(data.month.metrics),
            '',
            `🏷️ Anúncios rodando ou em análise: ${data.activeAds}`,
        ].join('\n');
    }

    /**
     * Salva o relatório como pendente de aprovação e manda link pro dono via WhatsApp.
     */
    private async queueForApproval(
        acc: AccountWithSettings,
        message: string,
        dateStr: string,
    ): Promise<void> {
        const token = crypto.randomBytes(18).toString('hex');
        await query(
            `INSERT INTO daily_report_approvals
             (user_id, account_id, report_date, client_name, client_phone, message_text, approval_token, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
            [
                acc.user_id, acc.id, dateStr,
                acc.client_name || acc.account_name,
                acc.client_phone,
                message,
                token,
            ]
        );

        const approvalUrl = `${PUBLIC_BASE_URL}/api/v1/r/${token}`;
        const previewLines = message.split('\n').slice(0, 3).join('\n');
        const ownerMessage =
            `📋 *Aprovação pendente — ${acc.client_name || acc.account_name}*\n` +
            `📅 ${this.formatDateBR(dateStr)}\n\n` +
            `Cliente: ${acc.client_phone}\n\n` +
            `${previewLines}…\n\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `👇 *Ver e aprovar:*\n${approvalUrl}`;

        await this.send(acc, acc.owner_whatsapp!, ownerMessage);
    }

    /**
     * Reenvia um relatório APROVADO pro telefone do cliente.
     * Chamado pelo endpoint público de aprovação.
     */
    async sendApproved(approvalId: string): Promise<void> {
        const rows = await query<any>(`
            SELECT
                dra.id, dra.user_id, dra.account_id, dra.client_phone, dra.message_text, dra.status,
                ns.whatsapp_provider,
                ns.uazapi_url, ns.uazapi_token,
                ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token
            FROM daily_report_approvals dra
            LEFT JOIN notification_settings ns ON ns.user_id = dra.user_id
            WHERE dra.id = $1
        `, [approvalId]);
        if (!rows.length) throw new Error('Aprovação não encontrada');
        const r = rows[0];
        if (r.status === 'sent') return;

        const fakeAcc: AccountWithSettings = {
            id: r.account_id, user_id: r.user_id,
            account_name: '', meta_account_id: '',
            client_name: null, client_phone: r.client_phone,
            whatsapp_provider: r.whatsapp_provider,
            uazapi_url: r.uazapi_url, uazapi_token: r.uazapi_token,
            evolution_api_url: r.evolution_api_url, evolution_api_key: r.evolution_api_key,
            evolution_instance: r.evolution_instance,
            zapi_instance_id: r.zapi_instance_id, zapi_token: r.zapi_token,
            zapi_client_token: r.zapi_client_token,
            owner_whatsapp: null, daily_report_approval_required: null,
        };

        try {
            await this.send(fakeAcc, r.client_phone, r.message_text);
            await query(
                `UPDATE daily_report_approvals SET status = 'sent', sent_at = NOW() WHERE id = $1`,
                [approvalId]
            );
        } catch (err: any) {
            await query(
                `UPDATE daily_report_approvals SET status = 'failed', error_message = $2 WHERE id = $1`,
                [approvalId, err.message]
            );
            throw err;
        }
    }

    /**
     * Envia para uma conta específica (para testes manuais via endpoint).
     */
    async sendForAccount(userId: string, accountId: string, dateStr?: string, phone?: string): Promise<{ message: string }> {
        const rows = await query<AccountWithSettings>(`
            SELECT
                a.id, a.user_id, a.account_name, a.meta_account_id,
                rs.client_name,
                ns.whatsapp_provider,
                ns.uazapi_url, ns.uazapi_token,
                ns.evolution_api_url, ns.evolution_api_key, ns.evolution_instance,
                ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token,
                ns.owner_whatsapp, ns.daily_report_approval_required
            FROM ad_accounts a
            LEFT JOIN report_settings rs ON rs.account_id = a.id
            LEFT JOIN notification_settings ns ON ns.user_id = a.user_id
            WHERE a.id = $1 AND a.user_id = $2
        `, [accountId, userId]);

        if (!rows.length) throw new Error('Conta não encontrada');

        const acc = rows[0];

        // phone pode vir como parâmetro (teste manual) ou da coluna client_phone (após migration 009)
        const resolvedPhone = phone || (acc as any).client_phone || null;
        if (!resolvedPhone) throw new Error('WhatsApp do cliente não configurado nesta conta');
        if (resolvedPhone.startsWith('https://chat.whatsapp.com/')) {
            throw new Error('Links convite não funcionam pra envio automático. Use o número (ex: 5511999999999) OU o ID do grupo (ex: 1234567890@g.us)');
        }
        acc.client_phone = resolvedPhone;

        const targetDate = dateStr || yesterdayBRT();

        const message = await this.buildFullReport(acc, targetDate);
        await this.send(acc, acc.client_phone!, message);

        return { message };
    }

    // ─── MÉTRICAS ─────────────────────────────────────────────────────────────

    private async getMetricsForDate(accountId: string, dateStr: string): Promise<DayMetrics> {
        const rows = await query<any>(`
            SELECT
                COALESCE(SUM(ih.spend), 0)         AS spend,
                COALESCE(SUM(ih.impressions), 0)   AS impressions,
                COALESCE(SUM(ih.clicks), 0)        AS clicks,
                COALESCE(SUM(ih.conversions), 0)   AS conversions,
                COALESCE(AVG(NULLIF(ih.ctr, 0)), 0) AS ctr,
                COALESCE(AVG(NULLIF(ih.cpc, 0)), 0) AS cpc,
                COALESCE(AVG(NULLIF(ih.cpm, 0)), 0) AS cpm,
                COALESCE(AVG(NULLIF(ih.roas, 0)), 0) AS roas
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1
              AND ih.date = $2
        `, [accountId, dateStr]);

        const t = rows[0] || {};
        const spend = parseFloat(t.spend) || 0;
        const conversions = parseInt(t.conversions) || 0;

        // Determina o label da ação principal baseado no que tem valor
        const actionsRows = await query<any>(`
            SELECT ih.actions
            FROM insights_history ih
            JOIN campaigns c ON ih.campaign_id = c.id
            WHERE c.account_id = $1 AND ih.date = $2
        `, [accountId, dateStr]);

        const primaryActionLabel = this.detectPrimaryAction(actionsRows);

        return {
            spend,
            impressions: parseInt(t.impressions) || 0,
            clicks: parseInt(t.clicks) || 0,
            conversions,
            ctr: parseFloat(t.ctr) || 0,
            cpc: parseFloat(t.cpc) || 0,
            cpm: parseFloat(t.cpm) || 0,
            roas: parseFloat(t.roas) || 0,
            cost_per_conversion: conversions > 0 ? spend / conversions : 0,
            primary_action_label: primaryActionLabel,
        };
    }

    private detectPrimaryAction(actionsRows: any[]): string {
        const ACTION_PRIORITY = [
            { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
            { type: 'purchase',                             label: 'Compras' },
            { type: 'offsite_conversion.fb_pixel_lead',     label: 'Leads' },
            { type: 'lead',                                 label: 'Leads' },
            { type: 'complete_registration',                label: 'Cadastros' },
            { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Conversas (WhatsApp)' },
            { type: 'onsite_conversion.total_messaging_connection',        label: 'Conexões' },
            { type: 'post_engagement',  label: 'Engajamentos' },
            { type: 'link_click',       label: 'Cliques' },
        ];

        const totals: Record<string, number> = {};
        for (const row of actionsRows) {
            const acts: any[] = Array.isArray(row.actions) ? row.actions : [];
            for (const a of acts) {
                totals[a.action_type] = (totals[a.action_type] || 0) + parseInt(a.value || '0', 10);
            }
        }

        for (const p of ACTION_PRIORITY) {
            if ((totals[p.type] || 0) > 0) return p.label;
        }
        return 'Conversões';
    }

    // ─── MENSAGEM ─────────────────────────────────────────────────────────────

    private buildMessage(acc: AccountWithSettings, m: DayMetrics, dateStr: string): string {
        const clientName = acc.client_name || acc.account_name;
        const dateFmt = this.formatDateBR(dateStr);

        const roas = m.roas > 0 ? `${m.roas.toFixed(2)}x` : '—';
        const cpa = m.cost_per_conversion > 0 ? `R$ ${m.cost_per_conversion.toFixed(2)}` : '—';
        const ctr = m.ctr > 0 ? `${m.ctr.toFixed(2)}%` : '—';
        const impressoes = m.impressions > 0 ? m.impressions.toLocaleString('pt-BR') : '0';
        const cliques = m.clicks > 0 ? m.clicks.toLocaleString('pt-BR') : '0';

        let msg = `📊 *Relatório do Dia — ${clientName}*\n`;
        msg += `📅 ${dateFmt}\n\n`;

        if (m.spend === 0 && m.impressions === 0) {
            msg += `_Nenhum dado encontrado para este dia._\n`;
            msg += `Verifique se as campanhas estavam ativas.`;
            return msg;
        }

        msg += `💰 *Investimento:* R$ ${m.spend.toFixed(2)}\n`;
        msg += `🎯 *${m.primary_action_label}:* ${m.conversions}\n`;

        if (m.cost_per_conversion > 0) {
            msg += `💸 *Custo por ${m.primary_action_label}:* ${cpa}\n`;
        }

        if (m.roas > 0) {
            msg += `📈 *ROAS:* ${roas}\n`;
        }

        msg += `🖱 *Cliques:* ${cliques}\n`;
        msg += `👁 *Impressões:* ${impressoes}\n`;
        msg += `📉 *CTR:* ${ctr}\n`;

        if (m.cpc > 0) {
            msg += `🔗 *CPC:* R$ ${m.cpc.toFixed(2)}\n`;
        }

        msg += `\n_Enviado automaticamente pelo TrafficAI_`;

        return msg;
    }

    private formatDateBR(dateStr: string): string {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    // ─── ENVIO ────────────────────────────────────────────────────────────────

    private async send(acc: AccountWithSettings, phone: string, message: string): Promise<void> {
        // Default: Evolution se ENV global estiver configurado, senão UazAPI (legado)
        const envEvolutionConfigured = !!process.env.EVOLUTION_API_BASE_URL && !!process.env.EVOLUTION_API_KEY;
        const provider = acc.whatsapp_provider || (envEvolutionConfigured ? 'evolution' : 'uazapi');

        if (provider === 'uazapi') {
            await this.sendViaUazapi(acc, phone, message);
        } else if (provider === 'zapi') {
            await this.sendViaZapi(acc, phone, message);
        } else {
            await this.sendViaEvolution(acc, phone, message);
        }
    }

    private normalizePhone(phone: string): string {
        // Group ID do WhatsApp: 1234567890@g.us — preserva como veio
        if (phone.includes('@g.us') || phone.includes('@s.whatsapp.net')) {
            return phone.trim();
        }
        return phone.replace(/\D/g, '');
    }

    private async sendViaUazapi(acc: AccountWithSettings, phone: string, message: string): Promise<void> {
        if (!acc.uazapi_url || !acc.uazapi_token) {
            throw new Error('UazAPI não configurada para este usuário (configure em Configurações → Notificações)');
        }

        const normalizedPhone = this.normalizePhone(phone);
        const baseUrl = acc.uazapi_url.replace(/\/$/, '');
        const url = `${baseUrl}/send/text`;

        try {
            await axios.post(url, {
                number: normalizedPhone,
                text: message,
            }, {
                headers: {
                    token: acc.uazapi_token,
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            });
        } catch (err: any) {
            const detail = err.response?.data
                ? JSON.stringify(err.response.data)
                : err.message;
            throw new Error(`UazAPI erro (${err.response?.status || 'sem resposta'}): ${detail}`);
        }
    }

    private async sendViaEvolution(acc: AccountWithSettings, phone: string, message: string): Promise<void> {
        // Fallbacks: per-user → ENV global → comm_integrations conectada do user
        let baseUrl = acc.evolution_api_url || process.env.EVOLUTION_API_BASE_URL || '';
        let apiKey = acc.evolution_api_key || process.env.EVOLUTION_API_KEY || '';
        let instance = acc.evolution_instance || '';

        if (!instance) {
            try {
                const integ = await query<any>(
                    `SELECT config, credentials FROM comm_integrations
                     WHERE user_id = $1 AND type = 'whatsapp_evolution' AND status = 'connected'
                     ORDER BY connected_at DESC NULLS LAST LIMIT 1`,
                    [acc.user_id]
                );
                if (integ.length) {
                    const cfg = integ[0].config || {};
                    const creds = integ[0].credentials || {};
                    instance = cfg.instanceName || cfg.instance || '';
                    if (!baseUrl) baseUrl = cfg.baseUrl || cfg.evolutionBaseUrl || '';
                    if (!apiKey) apiKey = creds.apiKey || creds.evolutionApiKey || '';
                }
            } catch (err: any) {
                logger.warn('lookup comm_integrations falhou', { error: err.message });
            }
        }

        if (!baseUrl || !instance) {
            throw new Error('Evolution API não configurada — defina EVOLUTION_API_BASE_URL/EVOLUTION_API_KEY no .env, ou conecte uma instância em /comercial/integrations, ou preencha em Configurações → Notificações');
        }

        const number = this.normalizePhone(phone);
        const url = `${baseUrl.replace(/\/$/, '')}/message/sendText/${instance}`;

        try {
            await axios.post(url, {
                number,
                text: message,           // v2 payload
            }, {
                headers: {
                    apikey: apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            });
        } catch (err: any) {
            const detail = err.response?.data
                ? JSON.stringify(err.response.data)
                : err.message;
            throw new Error(`Evolution API erro (${err.response?.status || 'sem resposta'}): ${detail}`);
        }
    }

    private async sendViaZapi(acc: AccountWithSettings, phone: string, message: string): Promise<void> {
        if (!acc.zapi_instance_id || !acc.zapi_token) {
            throw new Error('Z-API não configurada');
        }

        const normalizedPhone = this.normalizePhone(phone);
        const url = `https://api.z-api.io/instances/${acc.zapi_instance_id}/token/${acc.zapi_token}/send-text`;

        try {
            await axios.post(url, {
                phone: normalizedPhone,
                message,
            }, {
                headers: {
                    'Client-Token': acc.zapi_client_token || '',
                    'Content-Type': 'application/json',
                },
                timeout: 15000,
            });
        } catch (err: any) {
            const detail = err.response?.data
                ? JSON.stringify(err.response.data)
                : err.message;
            throw new Error(`Z-API erro (${err.response?.status || 'sem resposta'}): ${detail}`);
        }
    }
}

export const dailyWhatsAppService = new DailyWhatsAppService();
