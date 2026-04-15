// ==============================
// TrafficAI — Report Worker
// Gera relatórios automáticos via cron
// ==============================

import cron from 'node-cron';
import { reportService } from './report.service';
import { dailyWhatsAppService } from './daily-whatsapp.service';
import { logger } from '../shared/logger';

export function startReportWorker() {
    // Relatório diário — todo dia às 08:00
    cron.schedule('0 8 * * *', async () => {
        logger.info('📊 Report worker: gerando relatórios diários');
        try {
            await reportService.generateAutoReports('daily');
        } catch (error: any) {
            logger.error('Erro nos relatórios diários', { error: error.message });
        }
    }, { timezone: 'America/Sao_Paulo' });

    // Relatório semanal — toda segunda-feira às 08:00
    cron.schedule('0 8 * * 1', async () => {
        logger.info('📊 Report worker: gerando relatórios semanais');
        try {
            await reportService.generateAutoReports('weekly');
        } catch (error: any) {
            logger.error('Erro nos relatórios semanais', { error: error.message });
        }
    }, { timezone: 'America/Sao_Paulo' });

    // Relatório mensal — dia 1 de cada mês às 08:00
    cron.schedule('0 8 1 * *', async () => {
        logger.info('📊 Report worker: gerando relatórios mensais');
        try {
            await reportService.generateAutoReports('monthly');
        } catch (error: any) {
            logger.error('Erro nos relatórios mensais', { error: error.message });
        }
    }, { timezone: 'America/Sao_Paulo' });

    // Relatório diário em texto via WhatsApp — todo dia às 08:15
    cron.schedule('15 8 * * *', async () => {
        logger.info('📱 Report worker: enviando relatórios diários via WhatsApp');
        try {
            await dailyWhatsAppService.sendDailyReports();
        } catch (error: any) {
            logger.error('Erro nos relatórios diários WhatsApp', { error: error.message });
        }
    }, { timezone: 'America/Sao_Paulo' });

    logger.info('📊 Report worker iniciado (diário 08h | semanal seg 08h | mensal dia 1 08h | whatsapp diário 08h15)');
}
