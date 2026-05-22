"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processHealthCheck = processHealthCheck;
const database_1 = require("../../config/database");
const health_monitor_1 = require("../../services/balancer/health.monitor");
const cloud_api_service_1 = require("../../services/whatsapp/cloud-api.service");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const logger_1 = require("../../config/logger");
async function processHealthCheck(job) {
    const { connectionId } = job.data;
    const connection = await database_1.prisma.whatsappConnection.findUnique({
        where: { id: connectionId },
        select: { id: true, status: true, pausedUntil: true, phoneNumberId: true, accessTokenEnc: true },
    });
    if (!connection)
        return;
    // Tentar auto-recovery de conexões com pausedUntil expirado
    if (connection.status === 'PAUSED' && connection.pausedUntil && connection.pausedUntil <= new Date()) {
        await health_monitor_1.healthMonitor.recoverConnection(connectionId);
        logger_1.logger.info({ connectionId }, 'Health check: connection auto-recovered');
    }
    // Verificar token na Meta API
    try {
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const check = await cloud_api_service_1.cloudApiService.checkToken(connection.phoneNumberId, accessToken);
        if (!check.valid) {
            logger_1.logger.warn({ connectionId, errorCode: check.errorCode, errorMessage: check.errorMessage }, 'Health check: token invalid');
            if (check.banned) {
                await database_1.prisma.whatsappConnection.update({
                    where: { id: connectionId },
                    data: { status: 'ERROR', pausedReason: 'Número banido ou restrito pela Meta', healthScore: 0 },
                });
                logger_1.logger.warn({ connectionId }, 'Health check: number banned');
            }
            else if (check.errorCode === 190) {
                await database_1.prisma.whatsappConnection.update({
                    where: { id: connectionId },
                    data: { status: 'ERROR', pausedReason: `Token inválido: ${check.errorMessage}`, healthScore: 0 },
                });
            }
        }
        else {
            const updateData = {};
            // Sempre salvar qualidade mais recente da Meta
            if (check.qualityRating && check.qualityRating !== 'UNKNOWN') {
                updateData.metaQualityRating = check.qualityRating;
            }
            const blockReason = check.blockReason;
            if (check.banned) {
                updateData.status = 'ERROR';
                updateData.pausedReason = 'WABA banida pela Meta';
                updateData.healthScore = 0;
                logger_1.logger.warn({ connectionId, qualityRating: check.qualityRating, accountMode: check.accountMode }, 'Health check: WABA banned');
            }
            else if (blockReason === 'PAYMENT_ISSUE') {
                updateData.status = 'ERROR';
                updateData.pausedReason = 'Pagamento pendente no WABA — adicione método de pagamento válido no Meta Business';
                updateData.healthScore = 0;
                logger_1.logger.warn({ connectionId }, 'Health check: payment issue detected');
            }
            else if (check.qualityRating === 'RED') {
                // Qualidade vermelha: pausar automaticamente para proteger o número
                updateData.status = 'PAUSED';
                updateData.pausedReason = 'Qualidade RED — pausado automaticamente para proteger o número. Aguarde melhora antes de retomar.';
                updateData.healthScore = 10;
                logger_1.logger.warn({ connectionId }, 'Health check: quality RED — auto-paused to protect number');
            }
            else if (check.qualityRating === 'YELLOW' && connection.status === 'ACTIVE') {
                // Qualidade amarela: apenas logar alerta, não pausar
                logger_1.logger.warn({ connectionId, qualityRating: 'YELLOW' }, 'Health check: quality YELLOW — monitor closely');
            }
            else if (connection.status === 'ERROR') {
                updateData.status = 'ACTIVE';
                updateData.pausedReason = null;
                updateData.healthScore = 100;
                logger_1.logger.info({ connectionId }, 'Health check: connection recovered (token valid)');
            }
            if (Object.keys(updateData).length > 0) {
                await database_1.prisma.whatsappConnection.update({ where: { id: connectionId }, data: updateData });
            }
        }
    }
    catch (err) {
        logger_1.logger.warn({ connectionId, err }, 'Health check: token verification failed');
    }
    // Registrar snapshot de saúde
    await health_monitor_1.healthMonitor.logHealthSnapshot(connectionId);
    // Calcular health score baseado em métricas recentes
    const recentFailRate = await calculateRecentFailRate(connectionId);
    const connection2 = await database_1.prisma.whatsappConnection.findUnique({
        where: { id: connectionId },
        select: { healthScore: true },
    });
    if (connection2) {
        let newScore = connection2.healthScore;
        if (recentFailRate > 0.5) {
            newScore = Math.max(0, newScore - 10);
        }
        else if (recentFailRate < 0.1 && newScore < 100) {
            newScore = Math.min(100, newScore + 2);
        }
        if (newScore !== connection2.healthScore) {
            await health_monitor_1.healthMonitor.updateHealthScore(connectionId, newScore);
        }
    }
}
async function calculateRecentFailRate(connectionId) {
    const since = new Date(Date.now() - 5 * 60 * 1000); // últimos 5 min
    const [total, failed] = await Promise.all([
        database_1.prisma.message.count({ where: { connectionId, createdAt: { gte: since } } }),
        database_1.prisma.message.count({ where: { connectionId, status: 'FAILED', createdAt: { gte: since } } }),
    ]);
    if (total === 0)
        return 0;
    return failed / total;
}
//# sourceMappingURL=health.processor.js.map