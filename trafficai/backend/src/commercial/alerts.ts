// ==============================
// TrafficAI — Commercial Alerts
// Detecta condições críticas e envia email via Resend (1x/dia por user, throttle).
// Condições:
//  - Deals parados (acima de stuck_threshold_days da etapa)
//  - Chats sem resposta há > 24h
// ==============================

import { Resend } from 'resend';
import { query, queryOne } from '../database/connection';
import { logger } from '../shared/logger';

const ALERT_THROTTLE_HOURS = 22;   // não envia 2 emails em < 22h pra mesmo user

interface AlertContext {
    userId: string;
    email: string;
    stuckDeals: Array<{ contact_name: string | null; stage_name: string; days: number; value: string }>;
    unansweredChats: Array<{ contact_name: string | null; phone: string; hours: number }>;
}

async function detectAlerts(): Promise<AlertContext[]> {
    // Pega cada user que tem dados comerciais + email do auth
    const users = await query<{ user_id: string; email: string }>(
        `SELECT DISTINCT u.id AS user_id, u.email
         FROM users u
         WHERE EXISTS (SELECT 1 FROM comm_deals WHERE user_id = u.id)
            OR EXISTS (SELECT 1 FROM comm_conversations WHERE user_id = u.id)`
    );

    const contexts: AlertContext[] = [];

    for (const u of users) {
        // Deals parados além do threshold da etapa
        const stuck = await query<{ contact_name: string | null; stage_name: string; days: string; value: string }>(
            `SELECT d.contact_name, s.name AS stage_name,
                    EXTRACT(DAY FROM (NOW() - d.last_stage_change_at))::INT::TEXT AS days,
                    d.value::TEXT AS value
             FROM comm_deals d
             JOIN comm_pipeline_stages s ON s.id = d.stage_id
             WHERE d.user_id = $1 AND d.status = 'open'
               AND d.last_stage_change_at < NOW() - (s.stuck_threshold_days || ' days')::INTERVAL
               AND s.stage_type NOT IN ('won', 'lost')
             ORDER BY d.last_stage_change_at ASC
             LIMIT 10`,
            [u.user_id]
        );

        // Chats sem resposta há mais de 24h
        const unanswered = await query<{ contact_name: string | null; phone: string; hours: string }>(
            `SELECT contact_name, contact_phone AS phone,
                    EXTRACT(EPOCH FROM (NOW() - unanswered_since))::INT / 3600 AS hours
             FROM comm_conversations
             WHERE user_id = $1 AND unanswered_since IS NOT NULL
               AND unanswered_since < NOW() - INTERVAL '24 hours'
             ORDER BY unanswered_since ASC
             LIMIT 10`,
            [u.user_id]
        );

        if (stuck.length === 0 && unanswered.length === 0) continue;

        contexts.push({
            userId: u.user_id,
            email: u.email,
            stuckDeals: stuck.map(s => ({
                contact_name: s.contact_name,
                stage_name: s.stage_name,
                days: Number(s.days),
                value: s.value,
            })),
            unansweredChats: unanswered.map(c => ({
                contact_name: c.contact_name,
                phone: c.phone,
                hours: Math.floor(Number(c.hours)),
            })),
        });
    }

    return contexts;
}

async function shouldThrottle(userId: string): Promise<boolean> {
    const last = await queryOne<{ created_at: Date }>(
        `SELECT created_at FROM alerts
         WHERE user_id = $1 AND type = 'commercial_summary'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
    );
    if (!last) return false;
    const hoursAgo = (Date.now() - last.created_at.getTime()) / 3600 / 1000;
    return hoursAgo < ALERT_THROTTLE_HOURS;
}

async function sendAlertEmail(ctx: AlertContext): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.warn('Resend não configurado — alerta não enviado');
        return;
    }
    const resend = new Resend(apiKey);

    const subject = ctx.stuckDeals.length > 0
        ? `🚨 ${ctx.stuckDeals.length} deals precisam de atenção`
        : `⏰ ${ctx.unansweredChats.length} clientes esperando resposta`;

    const html = renderAlertHtml(ctx);

    try {
        const result = await resend.emails.send({
            from: process.env.ALERTS_FROM_EMAIL || 'TrafficAI <noreply@alfamaxdigital.com.br>',
            to: ctx.email,
            subject,
            html,
        });
        if ((result as any).error) {
            logger.warn('Resend retornou erro', { userId: ctx.userId, error: (result as any).error });
            return;
        }

        // Registra na tabela alerts pra throttle e auditoria
        await query(
            `INSERT INTO alerts (user_id, type, severity, title, message)
             VALUES ($1, 'commercial_summary', 'warning', $2, $3)`,
            [ctx.userId, subject,
                `Deals parados: ${ctx.stuckDeals.length} · Sem resposta: ${ctx.unansweredChats.length}`]
        );
        logger.info('Alerta comercial enviado', { userId: ctx.userId, email: ctx.email });
    } catch (err: any) {
        logger.error('Falha ao enviar alerta Resend', { userId: ctx.userId, error: err.message });
    }
}

function renderAlertHtml(ctx: AlertContext): string {
    const stuckRows = ctx.stuckDeals.map(d => `
        <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(d.contact_name ?? '—')}</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(d.stage_name)}</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #ef4444; font-weight: 600;">${d.days} dias</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb;">R$ ${Number(d.value).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
        </tr>`).join('');

    const chatRows = ctx.unansweredChats.map(c => `
        <tr>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(c.contact_name ?? c.phone)}</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">${escapeHtml(c.phone)}</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #f59e0b; font-weight: 600;">${c.hours}h</td>
        </tr>`).join('');

    const dashboardUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.alfamaxdigital.com.br') + '/comercial';

    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Alerta Comercial</title></head>
<body style="font-family: 'Segoe UI', system-ui, sans-serif; background: #f3f4f6; padding: 24px; color: #111827; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.07);">
    <div style="background: #0a0d14; padding: 20px 24px; color: white;">
      <h1 style="margin: 0; font-size: 18px;">🎯 Resumo Comercial Diário</h1>
      <p style="margin: 4px 0 0; color: #94a3b8; font-size: 12px;">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
    </div>

    <div style="padding: 24px;">
      ${ctx.stuckDeals.length > 0 ? `
        <h2 style="font-size: 14px; margin: 0 0 12px; color: #ef4444;">🚨 ${ctx.stuckDeals.length} deals parados</h2>
        <p style="font-size: 13px; color: #6b7280; margin: 0 0 12px;">Estes leads passaram do prazo limite da etapa atual.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Contato</th>
              <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Etapa</th>
              <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Tempo</th>
              <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Valor</th>
            </tr>
          </thead>
          <tbody>${stuckRows}</tbody>
        </table>
      ` : ''}

      ${ctx.unansweredChats.length > 0 ? `
        <h2 style="font-size: 14px; margin: 0 0 12px; color: #f59e0b;">⏰ ${ctx.unansweredChats.length} chats sem resposta</h2>
        <p style="font-size: 13px; color: #6b7280; margin: 0 0 12px;">Clientes esperando há mais de 24 horas.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Contato</th>
              <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Telefone</th>
              <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Espera</th>
            </tr>
          </thead>
          <tbody>${chatRows}</tbody>
        </table>
      ` : ''}

      <div style="text-align: center; padding-top: 16px;">
        <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px;">
          Abrir dashboard →
        </a>
      </div>
    </div>

    <div style="padding: 16px 24px; background: #f9fafb; text-align: center; color: #6b7280; font-size: 11px;">
      Você está recebendo este resumo porque tem dados comerciais ativos no TrafficAI.<br>
      Para ajustar a frequência, acesse Configurações.
    </div>
  </div>
</body></html>
    `.trim();
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}

export async function runCommercialAlerts(): Promise<{ users: number; sent: number; throttled: number }> {
    const start = Date.now();
    const contexts = await detectAlerts();
    let sent = 0, throttled = 0;
    for (const ctx of contexts) {
        if (await shouldThrottle(ctx.userId)) {
            throttled++;
            continue;
        }
        await sendAlertEmail(ctx);
        sent++;
    }
    logger.info('Alertas comerciais', {
        users: contexts.length, sent, throttled, durationMs: Date.now() - start,
    });
    return { users: contexts.length, sent, throttled };
}
