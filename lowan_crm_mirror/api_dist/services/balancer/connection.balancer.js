"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionBalancer = void 0;
const client_1 = require("@prisma/client");
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const logger_1 = require("../../config/logger");
class ConnectionBalancer {
    /**
     * Selects the best available connection for sending a message.
     * Returns null if no connections are available.
     */
    async selectConnection(allowedConnectionIds) {
        const connections = await database_1.prisma.whatsappConnection.findMany({
            where: { status: client_1.ConnectionStatus.ACTIVE, ...(allowedConnectionIds?.length ? { id: { in: allowedConnectionIds } } : {}) },
            select: {
                id: true,
                priority: true,
                healthScore: true,
                status: true,
                rateLimitPerMinute: true,
                rateLimitPerDay: true,
                pausedUntil: true,
            },
        });
        if (connections.length === 0) {
            return { connectionId: null, reason: 'No active connections' };
        }
        // Enrich with Redis counters
        const candidates = await Promise.all(connections.map(async (conn) => {
            const [sentMin, sentDay, queuePending] = await Promise.all([
                redis_1.redis.get(redis_1.RedisKeys.rateConnMin(conn.id)),
                redis_1.redis.get(redis_1.RedisKeys.rateConnDay(conn.id)),
                redis_1.redis.get(redis_1.RedisKeys.queuePending(conn.id)),
            ]);
            return {
                ...conn,
                sentThisMinute: parseInt(sentMin ?? '0'),
                sentToday: parseInt(sentDay ?? '0'),
                queuePending: parseInt(queuePending ?? '0'),
            };
        }));
        // Filter hard constraints
        const eligible = candidates.filter((c) => this.isEligible(c));
        if (eligible.length === 0) {
            logger_1.logger.warn('ConnectionBalancer: no eligible connections available');
            return { connectionId: null, reason: 'All connections are at capacity or paused' };
        }
        const selected = this.selectBestCandidate(eligible);
        if (!selected) {
            return { connectionId: null, reason: 'No suitable connection found' };
        }
        // Reserve the slot atomically
        await this.reserveSlot(selected.id, selected.rateLimitPerDay);
        return { connectionId: selected.id };
    }
    isEligible(candidate) {
        if (candidate.status !== client_1.ConnectionStatus.ACTIVE)
            return false;
        if (candidate.pausedUntil && candidate.pausedUntil > new Date())
            return false;
        if (candidate.sentThisMinute >= candidate.rateLimitPerMinute)
            return false;
        if (candidate.sentToday >= candidate.rateLimitPerDay)
            return false;
        if (candidate.healthScore < 10)
            return false;
        return true;
    }
    calculateScore(candidate) {
        const minuteCapacity = (candidate.rateLimitPerMinute - candidate.sentThisMinute) / candidate.rateLimitPerMinute;
        const dayCapacity = (candidate.rateLimitPerDay - candidate.sentToday) / candidate.rateLimitPerDay;
        const queuePressure = 1 - Math.min(candidate.queuePending / 100, 1);
        const normalizedPriority = candidate.priority / 10;
        const health = candidate.healthScore / 100;
        if (minuteCapacity <= 0 || dayCapacity <= 0)
            return 0;
        return normalizedPriority * minuteCapacity * dayCapacity * queuePressure * health;
    }
    selectBestCandidate(candidates) {
        if (candidates.length === 0)
            return null;
        return candidates.reduce((best, current) => {
            const bestScore = this.calculateScore(best);
            const currentScore = this.calculateScore(current);
            if (currentScore > bestScore)
                return current;
            if (currentScore === bestScore && current.queuePending < best.queuePending)
                return current;
            return best;
        });
    }
    async reserveSlot(connectionId, rateLimitPerDay) {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000);
        const minKey = redis_1.RedisKeys.rateConnMin(connectionId);
        const dayKey = redis_1.RedisKeys.rateConnDay(connectionId);
        const pendingKey = redis_1.RedisKeys.queuePending(connectionId);
        const pipeline = redis_1.redis.pipeline();
        pipeline.incr(minKey);
        pipeline.expire(minKey, 60);
        pipeline.incr(dayKey);
        pipeline.expire(dayKey, secondsUntilMidnight);
        pipeline.incr(pendingKey);
        await pipeline.exec();
    }
    /** Call after a message job completes (success or permanent failure) */
    async releaseSlot(connectionId) {
        const current = await redis_1.redis.get(redis_1.RedisKeys.queuePending(connectionId));
        const val = parseInt(current ?? '0');
        if (val > 0) {
            await redis_1.redis.decr(redis_1.RedisKeys.queuePending(connectionId));
        }
    }
}
exports.ConnectionBalancer = ConnectionBalancer;
//# sourceMappingURL=connection.balancer.js.map