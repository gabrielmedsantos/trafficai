// ==============================
// TrafficAI — Notification Service
// Envia alertas via Email (Resend) e WhatsApp (UazAPI / Evolution / Z-API)
// ==============================

import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { sendPushToUser } from './push.service';

interface NotificationSettings {
    user_id: string;
    email_enabled: boolean;
    notification_email: string | null;
    resend_api_key: string | null;
    whatsapp_enabled: boolean;
    whatsapp_number: string | null;
    whatsapp_provider: 'uazapi' | 'evolution' | 'zapi';
    uazapi_url: string | null;
    uazapi_token: string | null;
    evolution_api_url: string | null;
    evolution_api_key: string | null;
    evolution_instance: string | null;
    zapi_instance_id: string | null;
    zapi_token: string | null;
    zapi_client_token: string | null;
    notify_critical: boolean;
    notify_warning: boolean;
    notify_info: boolean;
    quiet_hours_enabled: boolean;
    quiet_start: string;
    quiet_end: string;
    push_enabled: boolean;
}

interface AlertPayload {
    id: string;
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    metric_name?: string;
    previous_value?: number;
    current_value?: number;
}

export class NotificationService {

    /**
     * Envia notificação de um alerta para todos os canais configurados
     */
    async sendAlertNotification(userId: string, alert: AlertPayload): Promise<void> {
        const settings = await this.getSettings(userId);
        if (!settings) return;

        // Verifica se deve notificar essa severidade
        if (alert.severity === 'critical' && !settings.notify_critical) return;
        if (alert.severity === 'warning' && !settings.notify_warning) return;
        if (alert.severity === 'info' && !settings.notify_info) return;

        // Verifica horário silencioso
        if (settings.quiet_hours_enabled && this.isQuietTime(settings.quiet_start, settings.quiet_end)) {
            logger.info(`🔕 Notificação suprimida por horário silencioso (${alert.title})`);
            return;
        }

        const promises: Promise<void>[] = [];

        if (settings.email_enabled && settings.notification_email) {
            promises.push(this.sendEmail(settings, alert));
        }

        // WhatsApp apenas para alertas críticos — evita spam
        if (settings.whatsapp_enabled && settings.whatsapp_number && alert.severity === 'critical') {
            promises.push(this.sendWhatsApp(settings, alert));
        }

        if (settings.push_enabled) {
            promises.push(this.sendPush(settings, alert));
        }

        await Promise.allSettled(promises);
    }

    // ─── PUSH ─────────────────────────────────────────────────────────────────

    private async sendPush(settings: NotificationSettings, alert: AlertPayload): Promise<void> {
        try {
            const { sent } = await sendPushToUser(settings.user_id, {
                title: `${{ critical: '🚨 CRÍTICO', warning: '⚠️ ATENÇÃO', info: 'ℹ️ INFO' }[alert.severity]} — ${alert.title}`,
                body: alert.message,
                url: '/alerts',
                tag: alert.type,
            });
            await this.logNotification(settings.user_id, alert.id, 'push', sent > 0 ? 'sent' : 'skipped');
        } catch (error: any) {
            await this.logNotification(settings.user_id, alert.id, 'push', 'failed', error.message);
            logger.error(`Falha ao enviar push: ${error.message}`);
        }
    }

    // ─── EMAIL ────────────────────────────────────────────────────────────────

    private async sendEmail(settings: NotificationSettings, alert: AlertPayload): Promise<void> {
        const apiKey = settings.resend_api_key || process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'alertas@trafficai.app';

        if (!apiKey) {
            logger.warn('Email não enviado: RESEND_API_KEY não configurada');
            return;
        }

        const severityColor = {
            critical: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6',
        }[alert.severity];

        const severityLabel = {
            critical: 'CRÍTICO',
            warning: 'ATENÇÃO',
            info: 'INFO',
        }[alert.severity];

        const html = this.buildEmailHtml(alert, severityColor, severityLabel);

        try {
            await axios.post('https://api.resend.com/emails', {
                from: `${process.env.AGENCY_NAME || 'Alfamax Digital'} Alertas <${fromEmail}>`,
                to: [settings.notification_email!],
                subject: `[${severityLabel}] ${alert.title}`,
                html,
            }, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });

            await this.logNotification(settings.user_id, alert.id, 'email', 'sent');
            logger.info(`📧 Email enviado: ${alert.title} → ${settings.notification_email}`);
        } catch (error: any) {
            const msg = error.response?.data?.message || error.message;
            await this.logNotification(settings.user_id, alert.id, 'email', 'failed', msg);
            logger.error(`Falha ao enviar email: ${msg}`);
        }
    }

    private buildEmailHtml(alert: AlertPayload, color: string, label: string): string {
        const metricSection = (alert.previous_value !== undefined && alert.current_value !== undefined)
            ? `<tr>
                <td style="padding:16px;background:#1e293b;border-radius:8px;margin-top:16px">
                    <table width="100%">
                        <tr>
                            <td style="text-align:center;padding:8px">
                                <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">ANTES</div>
                                <div style="font-size:20px;font-weight:700;color:#94a3b8">${alert.previous_value?.toFixed(2)}</div>
                            </td>
                            <td style="text-align:center;padding:8px;font-size:24px;color:#475569">→</td>
                            <td style="text-align:center;padding:8px">
                                <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">AGORA</div>
                                <div style="font-size:20px;font-weight:700;color:${color}">${alert.current_value?.toFixed(2)}</div>
                            </td>
                        </tr>
                    </table>
                </td>
               </tr>`
            : '';

        return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a2234;border-radius:12px;overflow:hidden">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px">
          <table width="100%">
            <tr>
              <td>
                <div style="font-size:22px;font-weight:800;color:#fff">TrafficAI</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:2px">Gestor de Tráfego Inteligente</div>
              </td>
              <td align="right">
                <span style="background:${color};color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:1px">${label}</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px">
          <table width="100%" cellspacing="0" cellpadding="0">

            <!-- Title -->
            <tr><td style="padding-bottom:16px">
              <div style="font-size:22px;font-weight:700;color:#f1f5f9;line-height:1.3">${alert.title}</div>
            </td></tr>

            <!-- Message -->
            <tr><td style="padding-bottom:24px">
              <div style="font-size:15px;color:#94a3b8;line-height:1.7">${alert.message}</div>
            </td></tr>

            <!-- Metric Comparison -->
            ${metricSection}

            <!-- CTA -->
            <tr><td style="padding-top:24px">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/alerts"
                 style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600">
                Ver Alertas no TrafficAI →
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #334155">
          <p style="margin:0;font-size:12px;color:#475569;text-align:center">
            Você recebeu este email porque configurou alertas no TrafficAI.<br>
            Para desativar, acesse <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings" style="color:#6366f1">Configurações → Notificações</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
    }

    // ─── WHATSAPP ─────────────────────────────────────────────────────────────

    private async sendWhatsApp(settings: NotificationSettings, alert: AlertPayload): Promise<void> {
        const message = this.buildWhatsAppMessage(alert);

        // Default: Evolution se ENV global configurado, senão UazAPI
        const envEvolutionConfigured = !!process.env.EVOLUTION_API_BASE_URL && !!process.env.EVOLUTION_API_KEY;
        const provider = settings.whatsapp_provider || (envEvolutionConfigured ? 'evolution' : 'uazapi');

        try {
            if (provider === 'uazapi') {
                await this.sendViaUazapi(settings, message);
            } else if (provider === 'zapi') {
                await this.sendViaZapi(settings, message);
            } else {
                await this.sendViaEvolution(settings, message);
            }

            await this.logNotification(settings.user_id, alert.id, 'whatsapp', 'sent');
            logger.info(`📱 WhatsApp enviado: ${alert.title} → ${settings.whatsapp_number}`);
        } catch (error: any) {
            const msg = error.response?.data?.message || error.message;
            await this.logNotification(settings.user_id, alert.id, 'whatsapp', 'failed', msg);
            logger.error(`Falha ao enviar WhatsApp: ${msg}`);
        }
    }

    private async sendViaUazapi(settings: NotificationSettings, message: string): Promise<void> {
        if (!settings.uazapi_url || !settings.uazapi_token) {
            throw new Error('UazAPI não configurada: URL e Token são obrigatórios');
        }

        const phone = this.normalizePhone(settings.whatsapp_number!);
        const baseUrl = settings.uazapi_url.replace(/\/$/, '');
        const url = `${baseUrl}/send/text`;

        await axios.post(url, {
            number: phone,
            text: message,
        }, {
            headers: {
                token: settings.uazapi_token,
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        });
    }

    private async sendViaEvolution(settings: NotificationSettings, message: string): Promise<void> {
        // Fallbacks: per-user → ENV global → comm_integrations conectada
        let baseUrl = settings.evolution_api_url || process.env.EVOLUTION_API_BASE_URL || '';
        let apiKey = settings.evolution_api_key || process.env.EVOLUTION_API_KEY || '';
        let instance = settings.evolution_instance || '';

        if (!instance) {
            try {
                const integ = await query<any>(
                    `SELECT config, credentials FROM comm_integrations
                     WHERE user_id = $1 AND type = 'whatsapp_evolution' AND status = 'connected'
                     ORDER BY connected_at DESC NULLS LAST LIMIT 1`,
                    [settings.user_id]
                );
                if (integ.length) {
                    const cfg = integ[0].config || {};
                    const creds = integ[0].credentials || {};
                    instance = cfg.instanceName || cfg.instance || '';
                    if (!baseUrl) baseUrl = cfg.baseUrl || cfg.evolutionBaseUrl || '';
                    if (!apiKey) apiKey = creds.apiKey || creds.evolutionApiKey || '';
                }
            } catch { /* ignore */ }
        }

        if (!baseUrl || !instance) {
            throw new Error('Evolution API não configurada — defina ENV ou conecte uma instância em /comercial/integrations');
        }

        const url = `${baseUrl.replace(/\/$/, '')}/message/sendText/${instance}`;
        const number = this.normalizePhone(settings.whatsapp_number!);

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
    }

    private async sendViaZapi(settings: NotificationSettings, message: string): Promise<void> {
        if (!settings.zapi_instance_id || !settings.zapi_token) {
            throw new Error('Z-API não configurada');
        }

        const url = `https://api.z-api.io/instances/${settings.zapi_instance_id}/token/${settings.zapi_token}/send-text`;
        const phone = this.normalizePhone(settings.whatsapp_number!);

        await axios.post(url, {
            phone,
            message,
        }, {
            headers: {
                'Client-Token': settings.zapi_client_token || '',
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        });
    }

    private buildWhatsAppMessage(alert: AlertPayload): string {
        const icon = {
            critical: '🚨',
            warning: '⚠️',
            info: 'ℹ️',
        }[alert.severity];

        const label = {
            critical: '*CRÍTICO*',
            warning: '*ATENÇÃO*',
            info: '_INFO_',
        }[alert.severity];

        let msg = `${icon} ${label} — TrafficAI\n\n`;
        msg += `*${alert.title}*\n\n`;
        msg += `${alert.message}`;

        if (alert.previous_value !== undefined && alert.current_value !== undefined) {
            msg += `\n\n📊 ${alert.metric_name?.toUpperCase() || 'MÉTRICA'}: ${alert.previous_value?.toFixed(2)} → *${alert.current_value?.toFixed(2)}*`;
        }

        msg += `\n\n🔗 Ver alertas: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/alerts`;

        return msg;
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    private async getSettings(userId: string): Promise<NotificationSettings | null> {
        const rows = await query<NotificationSettings>(
            `SELECT * FROM notification_settings WHERE user_id = $1 LIMIT 1`,
            [userId]
        );
        return rows[0] || null;
    }

    private async logNotification(
        userId: string,
        alertId: string,
        channel: string,
        status: string,
        errorMessage?: string
    ): Promise<void> {
        try {
            await query(
                `INSERT INTO notification_log (user_id, alert_id, channel, status, error_message)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, alertId, channel, status, errorMessage || null]
            );
        } catch { /* não bloqueia o fluxo principal */ }
    }

    private isQuietTime(start: string, end: string): boolean {
        const now = new Date();
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;

        if (startMins > endMins) {
            // Passa da meia-noite: 22:00 → 08:00
            return nowMins >= startMins || nowMins < endMins;
        }
        return nowMins >= startMins && nowMins < endMins;
    }

    private normalizePhone(phone: string): string {
        // Remove tudo que não é número
        return phone.replace(/\D/g, '');
    }

    /**
     * Envia uma notificação de teste
     */
    async sendTestNotification(userId: string, channel: 'email' | 'whatsapp' | 'push'): Promise<{ success: boolean; message: string }> {
        const settings = await this.getSettings(userId);
        if (!settings) {
            return { success: false, message: 'Configurações não encontradas' };
        }

        const testAlert: AlertPayload = {
            id: 'test',
            type: 'test',
            severity: 'warning',
            title: '🧪 Notificação de Teste — TrafficAI',
            message: 'Esta é uma notificação de teste. Seu canal de alertas está funcionando corretamente!',
            metric_name: 'cpa',
            previous_value: 25.00,
            current_value: 42.50,
        };

        try {
            if (channel === 'email') {
                if (!settings.notification_email) return { success: false, message: 'Email não configurado' };
                await this.sendEmail(settings, testAlert);
            } else if (channel === 'whatsapp') {
                if (!settings.whatsapp_number) return { success: false, message: 'WhatsApp não configurado' };
                await this.sendWhatsApp(settings, testAlert);
            } else {
                const { sent } = await sendPushToUser(userId, {
                    title: '🧪 Notificação de Teste — TrafficAI',
                    body: testAlert.message,
                    url: '/alerts',
                    tag: 'test',
                });
                if (sent === 0) return { success: false, message: 'Nenhum dispositivo inscrito para push — ative nas Configurações neste dispositivo primeiro' };
            }
            return { success: true, message: `Teste enviado com sucesso via ${channel}` };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }
}

export const notificationService = new NotificationService();
