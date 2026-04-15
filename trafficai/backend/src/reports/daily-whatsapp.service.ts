// ==============================
// TrafficAI — Daily WhatsApp Text Report Service
// Envia resumo diário de métricas via WhatsApp (texto, não link)
// ==============================

import axios from 'axios';
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

export class DailyWhatsAppService {

    /**
     * Envia relatório diário de texto via WhatsApp para todas as contas habilitadas.
     * Chamado automaticamente pelo cron às 08:00.
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
                    ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token
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

        // Ontem
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        for (const acc of accounts) {
            if (acc.client_phone!.startsWith('https://chat.whatsapp.com/')) {
                logger.warn(`daily-whatsapp: ${acc.account_name} usa link de grupo — envio automático não suportado, pulando`);
                continue;
            }
            try {
                const metrics = await this.getMetricsForDate(acc.id, dateStr);
                const message = this.buildMessage(acc, metrics, dateStr);
                await this.send(acc, message);
                logger.info(`✅ Relatório diário enviado: ${acc.account_name} → ${acc.client_phone}`);
            } catch (err: any) {
                logger.error(`Falha ao enviar relatório diário para ${acc.account_name}`, { error: err.message });
            }
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
                ns.zapi_instance_id, ns.zapi_token, ns.zapi_client_token
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
            throw new Error('Links de grupo não funcionam para envio automático. Use o número (ex: 5511999999999)');
        }
        acc.client_phone = resolvedPhone;

        const targetDate = dateStr || (() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return d.toISOString().split('T')[0];
        })();

        const metrics = await this.getMetricsForDate(acc.id, targetDate);
        const message = this.buildMessage(acc, metrics, targetDate);
        await this.send(acc, message);

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

    private async send(acc: AccountWithSettings, message: string): Promise<void> {
        const phone = acc.client_phone!;
        const provider = acc.whatsapp_provider || 'uazapi';

        if (provider === 'uazapi') {
            await this.sendViaUazapi(acc, phone, message);
        } else if (provider === 'zapi') {
            await this.sendViaZapi(acc, phone, message);
        } else {
            await this.sendViaEvolution(acc, phone, message);
        }
    }

    private normalizePhone(phone: string): string {
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
        if (!acc.evolution_api_url || !acc.evolution_instance) {
            throw new Error('Evolution API não configurada');
        }

        const number = this.normalizePhone(phone);
        const url = `${acc.evolution_api_url}/message/sendText/${acc.evolution_instance}`;

        try {
            await axios.post(url, {
                number,
                textMessage: { text: message },
            }, {
                headers: {
                    apikey: acc.evolution_api_key || '',
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
