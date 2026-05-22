"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthMonitor = exports.HealthMonitor = void 0;
const client_1 = require("@prisma/client");
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
class HealthMonitor {
    /**
     * Incrementa o contador de erros de um tipo específico.
     * Retorna se o número deve ser pausado automaticamente.
     */
    async recordError(connectionId, errorType) {
        const key = redis_1.RedisKeys.connErrorCount(connectionId, errorType);
        const count = await redis_1.redis.incr(key);
        await redis_1.redis.expire(key, 300); // janela de 5 minutos
        // Degradar health score a cada erro
        await this.degradeHealthScore(connectionId, errorType);
        const thresholds = {
            AUTH: { max: env_1.env.HEALTH_MAX_AUTH_ERRORS, pauseSeconds: 0 }, // 0 = manual recovery
            RATE_LIMIT: { max: env_1.env.HEALTH_MAX_RATE_ERRORS, pauseSeconds: env_1.env.HEALTH_PAUSE_RATE_LIMIT_SECONDS },
            TEMPORARY: { max: env_1.env.HEALTH_MAX_TEMP_ERRORS, pauseSeconds: env_1.env.HEALTH_PAUSE_TEMP_ERROR_SECONDS },
        };
        const threshold = thresholds[errorType];
        if (threshold && count >= threshold.max) {
            // Reset counter after triggering pause
            await redis_1.redis.del(key);
            return { shouldPause: true, pauseSeconds: threshold.pauseSeconds };
        }
        return { shouldPause: false, pauseSeconds: 0 };
    }
    /**
     * Pausa automaticamente um número e registra no banco + Redis.
     */
    async autoPauseConnection(connectionId, reason, pauseSeconds) {
        const pausedUntil = pauseSeconds > 0 ? new Date(Date.now() + pauseSeconds * 1000) : null;
        await database_1.prisma.whatsappConnection.update({
            where: { id: connectionId },
            data: {
                status: pauseSeconds > 0 ? client_1.ConnectionStatus.PAUSED : client_1.ConnectionStatus.ERROR,
                pausedUntil,
                pausedReason: reason,
            },
        });
        await redis_1.redis.set(redis_1.RedisKeys.connPaused(connectionId), reason);
        if (pausedUntil) {
            await redis_1.redis.hset(redis_1.RedisKeys.healthConn(connectionId), {
                status: client_1.ConnectionStatus.PAUSED,
                paused_until: pausedUntil.toISOString(),
            });
        }
        logger_1.logger.warn({ connectionId, reason, pauseSeconds }, 'Connection auto-paused');
    }
    /**
     * Tenta reativar conexões com pausedUntil expirado.
     * Chamado periodicamente pelo HealthWorker.
     */
    async tryAutoRecovery() {
        const expired = await database_1.prisma.whatsappConnection.findMany({
            where: {
                status: client_1.ConnectionStatus.PAUSED,
                pausedUntil: { lte: new Date(), not: null },
            },
            select: { id: true, pausedUntil: true },
        });
        for (const conn of expired) {
            await this.recoverConnection(conn.id);
        }
    }
    async recoverConnection(connectionId) {
        await database_1.prisma.whatsappConnection.update({
            where: { id: connectionId },
            data: {
                status: client_1.ConnectionStatus.ACTIVE,
                pausedUntil: null,
                pausedReason: null,
            },
        });
        await redis_1.redis.del(redis_1.RedisKeys.connPaused(connectionId));
        await redis_1.redis.hset(redis_1.RedisKeys.healthConn(connectionId), { status: client_1.ConnectionStatus.ACTIVE });
        // Boost health score on recovery
        await this.boostHealthScore(connectionId, 20);
        logger_1.logger.info({ connectionId }, 'Connection auto-recovered');
    }
    async updateHealthScore(connectionId, score) {
        const clamped = Math.max(0, Math.min(100, score));
        await Promise.all([
            database_1.prisma.whatsappConnection.update({
                where: { id: connectionId },
                data: { healthScore: clamped },
            }),
            redis_1.redis.hset(redis_1.RedisKeys.healthConn(connectionId), {
                score: clamped,
                last_check: new Date().toISOString(),
            }),
        ]);
    }
    async logHealthSnapshot(connectionId) {
        const [conn, sentToday, failedToday] = await Promise.all([
            database_1.prisma.whatsappConnection.findUnique({
                where: { id: connectionId },
                select: { healthScore: true, status: true },
            }),
            redis_1.redis.get(redis_1.RedisKeys.rateConnDay(connectionId)),
            database_1.prisma.message.count({
                where: {
                    connectionId,
                    status: 'FAILED',
                    createdAt: { gte: new Date(Date.now() - 86400000) },
                },
            }),
        ]);
        if (!conn)
            return;
        await database_1.prisma.connectionHealthLog.create({
            data: {
                connectionId,
                healthScore: conn.healthScore,
                status: conn.status,
                messagesSent: parseInt(sentToday ?? '0'),
                messagesFailed: failedToday,
            },
        });
    }
    async degradeHealthScore(connectionId, errorType) {
        const penalties = {
            AUTH: 30,
            RATE_LIMIT: 10,
            TEMPORARY: 5,
            PERMANENT: 2,
            INVALID_NUMBER: 1,
            TEMPLATE: 0,
        };
        const penalty = penalties[errorType] ?? 2;
        const current = await database_1.prisma.whatsappConnection.findUnique({
            where: { id: connectionId },
            select: { healthScore: true },
        });
        if (current) {
            await this.updateHealthScore(connectionId, current.healthScore - penalty);
        }
    }
    async boostHealthScore(connectionId, amount) {
        const current = await database_1.prisma.whatsappConnection.findUnique({
            where: { id: connectionId },
            select: { healthScore: true },
        });
        if (current) {
            await this.updateHealthScore(connectionId, current.healthScore + amount);
        }
    }
    async resetErrorCounters(connectionId) {
        await redis_1.redis.del(redis_1.RedisKeys.connErrorCount(connectionId, 'AUTH'), redis_1.RedisKeys.connErrorCount(connectionId, 'RATE_LIMIT'), redis_1.RedisKeys.connErrorCount(connectionId, 'TEMPORARY'));
    }
}
exports.HealthMonitor = HealthMonitor;
exports.healthMonitor = new HealthMonitor();
//# sourceMappingURL=health.monitor.js.map