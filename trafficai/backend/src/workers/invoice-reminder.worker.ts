// ==============================
// TrafficAI — Invoice Reminder Worker
// Avisa o CLIENTE FINAL (não o usuário da agência) por WhatsApp quando uma
// cobrança (contract_billing) está perto de vencer, vence hoje, ou está
// atrasada — no estilo Asaas. Idempotente via tabela billing_reminders.
//
// Por padrão cada lembrete fica PENDENTE DE APROVAÇÃO: em vez de mandar
// direto, fica na fila (pending_invoice_reminders) e o usuário da agência
// é notificado (email/whatsapp/push, conforme as preferências dele em
// Configurações) pra revisar e aprovar no app. Só sai automático se o modo
// efetivo do cliente (clients.reminder_mode, ou o padrão geral em
// financial_settings.default_reminder_mode se o cliente não tiver override)
// for 'automatic'.
// ==============================

import cron from 'node-cron';
import { randomUUID } from 'crypto';
import { query } from '../database/connection';
import { sendWhatsAppMessage } from '../notifications/whatsapp.helper';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../shared/logger';

type ReminderType = 'before' | 'due' | 'overdue';
type ReminderMode = 'approval' | 'automatic';

interface ReminderRow {
    billing_id: string;
    reminder_type: ReminderType;
    user_id: string;
    client_id: string;
    total_amount: string | number;
    due_date_fmt: string;
    ref_month_fmt: string;
    client_name: string;
    client_phone: string;
    agency_name: string;
    effective_mode: ReminderMode;
}

function toBRL(amount: string | number): string {
    return Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildMessage(row: ReminderRow): string {
    const value = toBRL(row.total_amount);
    const first = row.client_name?.split(' ')[0] || row.client_name;

    switch (row.reminder_type) {
        case 'before':
            return `Olá, ${first}! Passando pra lembrar que sua fatura de ${row.ref_month_fmt} (R$ ${value}) vence em ${row.due_date_fmt}. Qualquer dúvida, é só chamar por aqui.\n\n— ${row.agency_name}`;
        case 'due':
            return `Olá, ${first}! Sua fatura de ${row.ref_month_fmt} (R$ ${value}) vence hoje (${row.due_date_fmt}).\n\n— ${row.agency_name}`;
        case 'overdue':
            return `Olá, ${first}. Notamos que sua fatura de ${row.ref_month_fmt} (R$ ${value}), com vencimento em ${row.due_date_fmt}, ainda está em aberto. Pode verificar quando possível? Qualquer coisa estamos à disposição.\n\n— ${row.agency_name}`;
    }
}

async function fetchPendingReminders(): Promise<ReminderRow[]> {
    return query<ReminderRow>(
        `SELECT * FROM (
            SELECT cb.id AS billing_id, 'before'::varchar AS reminder_type, cb.user_id, cb.client_id,
                   cb.total_amount, to_char(cb.due_date, 'DD/MM/YYYY') AS due_date_fmt,
                   to_char(cb.reference_month, 'MM/YYYY') AS ref_month_fmt,
                   cl.name AS client_name, cl.phone AS client_phone,
                   COALESCE(u.name, 'TrafficAI') AS agency_name,
                   COALESCE(cl.reminder_mode, fs.default_reminder_mode) AS effective_mode
            FROM contract_billing cb
            JOIN clients cl ON cl.id = cb.client_id
            JOIN users u ON u.id = cb.user_id
            JOIN financial_settings fs ON fs.user_id = cb.user_id AND fs.invoice_reminders_enabled = true
            WHERE cb.status = 'pending'
              AND cb.due_date = CURRENT_DATE + INTERVAL '3 days'
              AND cl.phone IS NOT NULL AND cl.phone <> ''
              AND NOT EXISTS (
                  SELECT 1 FROM billing_reminders br
                  WHERE br.billing_id = cb.id AND br.reminder_type = 'before'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pending_invoice_reminders pr
                  WHERE pr.billing_id = cb.id AND pr.reminder_type = 'before'
              )

            UNION ALL

            SELECT cb.id, 'due', cb.user_id, cb.client_id,
                   cb.total_amount, to_char(cb.due_date, 'DD/MM/YYYY'),
                   to_char(cb.reference_month, 'MM/YYYY'),
                   cl.name, cl.phone,
                   COALESCE(u.name, 'TrafficAI'),
                   COALESCE(cl.reminder_mode, fs.default_reminder_mode)
            FROM contract_billing cb
            JOIN clients cl ON cl.id = cb.client_id
            JOIN users u ON u.id = cb.user_id
            JOIN financial_settings fs ON fs.user_id = cb.user_id AND fs.invoice_reminders_enabled = true
            WHERE cb.status = 'pending'
              AND cb.due_date = CURRENT_DATE
              AND cl.phone IS NOT NULL AND cl.phone <> ''
              AND NOT EXISTS (
                  SELECT 1 FROM billing_reminders br
                  WHERE br.billing_id = cb.id AND br.reminder_type = 'due'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pending_invoice_reminders pr
                  WHERE pr.billing_id = cb.id AND pr.reminder_type = 'due'
              )

            UNION ALL

            SELECT cb.id, 'overdue', cb.user_id, cb.client_id,
                   cb.total_amount, to_char(cb.due_date, 'DD/MM/YYYY'),
                   to_char(cb.reference_month, 'MM/YYYY'),
                   cl.name, cl.phone,
                   COALESCE(u.name, 'TrafficAI'),
                   COALESCE(cl.reminder_mode, fs.default_reminder_mode)
            FROM contract_billing cb
            JOIN clients cl ON cl.id = cb.client_id
            JOIN users u ON u.id = cb.user_id
            JOIN financial_settings fs ON fs.user_id = cb.user_id AND fs.invoice_reminders_enabled = true
            WHERE cb.status = 'overdue'
              AND cl.phone IS NOT NULL AND cl.phone <> ''
              AND NOT EXISTS (
                  SELECT 1 FROM billing_reminders br
                  WHERE br.billing_id = cb.id AND br.reminder_type = 'overdue'
                    AND br.sent_at > NOW() - INTERVAL '5 days'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pending_invoice_reminders pr
                  WHERE pr.billing_id = cb.id AND pr.reminder_type = 'overdue'
                    AND pr.created_at > NOW() - INTERVAL '5 days'
              )
        ) reminders
        ORDER BY reminder_type`
    );
}

export async function sendInvoiceReminders(): Promise<{ sent: number; queued: number; failed: number }> {
    const rows = await fetchPendingReminders();
    let sent = 0;
    let queued = 0;
    let failed = 0;
    const usersToNotify = new Map<string, number>();

    for (const row of rows) {
        try {
            if (row.effective_mode === 'automatic') {
                await sendWhatsAppMessage(row.user_id, row.client_phone, buildMessage(row));
                await query(
                    `INSERT INTO billing_reminders (billing_id, reminder_type) VALUES ($1, $2)`,
                    [row.billing_id, row.reminder_type]
                );
                sent++;
            } else {
                await query(
                    `INSERT INTO pending_invoice_reminders (billing_id, reminder_type, user_id, client_id, message)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [row.billing_id, row.reminder_type, row.user_id, row.client_id, buildMessage(row)]
                );
                queued++;
                usersToNotify.set(row.user_id, (usersToNotify.get(row.user_id) || 0) + 1);
            }
        } catch (err: any) {
            failed++;
            logger.warn('invoice-reminder: falha ao processar', {
                billing_id: row.billing_id,
                reminder_type: row.reminder_type,
                mode: row.effective_mode,
                error: err.message,
            });
        }
    }

    for (const [userId, count] of usersToNotify) {
        notificationService.sendAlertNotification(userId, {
            id: randomUUID(),
            type: 'invoice_reminder_pending',
            severity: 'warning',
            title: 'Lembretes de fatura aguardando aprovação',
            message: `Você tem ${count} lembrete${count > 1 ? 's' : ''} de fatura pra revisar antes de enviar ao cliente. Abra Financeiro → Recorrências no app pra aprovar.`,
        }).catch((err: any) => logger.error('Erro ao notificar sobre lembretes pendentes', { error: err.message }));
    }

    return { sent, queued, failed };
}

/**
 * Roda todo dia às 04:15 UTC — logo depois do billing worker (04:00 UTC),
 * que gera as cobranças do mês e marca overdue. Precisa rodar depois pra
 * já enxergar o status atualizado no mesmo dia.
 */
export function startInvoiceReminderWorker() {
    // Liga/desliga é por user (Financeiro → Recorrências → "Lembretes automáticos
    // de fatura"), via financial_settings.invoice_reminders_enabled — o worker
    // roda sempre, mas o JOIN na query já filtra só quem ativou.
    cron.schedule('15 4 * * *', async () => {
        try {
            const r = await sendInvoiceReminders();
            logger.info(`💬 Lembretes de fatura: ${r.sent} enviado(s), ${r.queued} na fila de aprovação, ${r.failed} falha(s)`);
        } catch (err: any) {
            logger.error('Invoice reminder worker falhou', { error: err.message });
        }
    });

    // Roda 45s após o boot (billing worker roda aos 30s) pra fechar gap
    // caso o serviço tenha ficado fora no horário do cron.
    setTimeout(async () => {
        try {
            const r = await sendInvoiceReminders();
            logger.info(`💬 Lembretes de fatura (inicial): ${r.sent} enviado(s), ${r.queued} na fila de aprovação, ${r.failed} falha(s)`);
        } catch (err: any) {
            logger.error('Invoice reminder inicial falhou', { error: err.message });
        }
    }, 45 * 1000);

    logger.info('💬 Invoice reminder worker started (diário às 04:15 UTC + boot)');
}
