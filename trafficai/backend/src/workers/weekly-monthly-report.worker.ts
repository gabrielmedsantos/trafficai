// ==============================
// Weekly & Monthly Report Worker
// Dispara relatórios semanais (dia da semana escolhido) e mensais (dia do mês).
// Envia via WhatsApp usando template configurado + link do PDF.
// ==============================

import cron from 'node-cron';
import { query } from '../database/connection';
import { sendWhatsAppMessage } from '../notifications/whatsapp.helper';
import { buildReportForAccount, renderReportHTML, saveReportSnapshot } from '../reports/pdf-report.service';
import { logger } from '../shared/logger';

/**
 * Roda toda manhã 09:00 UTC e checa quais contas devem receber weekly/monthly hoje.
 */
async function checkAndSendPeriodicReports() {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const brtDayOfWeek = brt.getUTCDay();   // 0=domingo
    const brtDayOfMonth = brt.getUTCDate();
    const todayStr = brt.toISOString().slice(0, 10);

    // Semanal
    const weeklyRows = await query<any>(`
        SELECT rs.*, a.account_name, a.user_id
        FROM report_settings rs
        JOIN ad_accounts a ON rs.account_id = a.id
        WHERE rs.weekly_report_enabled = TRUE
          AND rs.weekly_report_day = $1
          AND rs.client_phone IS NOT NULL AND rs.client_phone <> ''
          AND (rs.weekly_report_last_sent IS NULL OR rs.weekly_report_last_sent < $2::date)
    `, [brtDayOfWeek, todayStr]);

    for (const r of weeklyRows) {
        try { await generateAndSend(r, 'weekly', 7); } catch (e: any) {
            logger.warn(`weekly report falhou: ${r.account_name}`, { error: e.message });
        }
    }
    if (weeklyRows.length > 0) {
        logger.info(`📅 Weekly reports: ${weeklyRows.length} enviado(s)`);
    }

    // Mensal
    const monthlyRows = await query<any>(`
        SELECT rs.*, a.account_name, a.user_id
        FROM report_settings rs
        JOIN ad_accounts a ON rs.account_id = a.id
        WHERE rs.monthly_report_enabled = TRUE
          AND rs.monthly_report_day = $1
          AND rs.client_phone IS NOT NULL AND rs.client_phone <> ''
          AND (rs.monthly_report_last_sent IS NULL OR rs.monthly_report_last_sent < $2::date)
    `, [brtDayOfMonth, todayStr]);

    for (const r of monthlyRows) {
        try { await generateAndSend(r, 'monthly', 30); } catch (e: any) {
            logger.warn(`monthly report falhou: ${r.account_name}`, { error: e.message });
        }
    }
    if (monthlyRows.length > 0) {
        logger.info(`📅 Monthly reports: ${monthlyRows.length} enviado(s)`);
    }
}

async function generateAndSend(settings: any, kind: 'weekly' | 'monthly', daysBack: number) {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const end = new Date(brt); end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - (daysBack - 1));
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    // Gera PDF snapshot
    const data = await buildReportForAccount(settings.user_id, settings.account_id, startStr, endStr);
    const html = renderReportHTML(data);
    const snapshot = await saveReportSnapshot(settings.user_id, settings.account_id, html, {
        periodStart: startStr,
        periodEnd: endStr,
        accountName: data.accountName,
    });

    const kindLabel = kind === 'weekly' ? 'Relatório Semanal' : 'Relatório Mensal';
    const emoji = kind === 'weekly' ? '📊' : '📅';
    const cpaLabel = data.totals.conversions > 0 ? `R$ ${fmt(data.totals.spend / data.totals.conversions)}` : '—';
    const msg = `${emoji} *${kindLabel} — ${data.accountName}*\n` +
        `🗓 ${formatBR(startStr)} → ${formatBR(endStr)}\n\n` +
        `💰 Investimento: R$ ${fmt(data.totals.spend)}\n` +
        `📊 Resultados: ${short(data.totals.conversions)} · ${cpaLabel}/result.\n` +
        `👁 Impressões: ${short(data.totals.impressions)}\n` +
        `🖱 Cliques: ${short(data.totals.clicks)} · CTR ${data.totals.ctr.toFixed(2)}%\n` +
        `🎯 ${data.counts.campaigns} campanhas ativas\n\n` +
        `📄 Relatório visual completo:\n${snapshot.url}`;

    await sendWhatsAppMessage(settings.user_id, settings.client_phone, msg);

    const col = kind === 'weekly' ? 'weekly_report_last_sent' : 'monthly_report_last_sent';
    await query(`UPDATE report_settings SET ${col} = CURRENT_DATE WHERE account_id = $1`, [settings.account_id]);
}

function fmt(v: number): string { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function short(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
}
function formatBR(iso: string): string { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

export function startWeeklyMonthlyReportWorker() {
    // 09:00 UTC = 06:00 BRT (antes de todo mundo abrir o app)
    cron.schedule('0 9 * * *', async () => {
        try { await checkAndSendPeriodicReports(); }
        catch (err: any) { logger.error('weekly-monthly report worker falhou', { error: err.message }); }
    });
    logger.info('📅 Weekly/Monthly report worker started (09:00 UTC / 06:00 BRT)');
}
