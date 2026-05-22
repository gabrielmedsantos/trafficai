"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisKeys = exports.bullRedis = exports.bullMQConnection = exports.redis = void 0;
exports.connectRedis = connectRedis;
exports.disconnectRedis = disconnectRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
const logger_1 = require("./logger");
const redisConfig = {
    host: env_1.env.REDIS_HOST,
    port: env_1.env.REDIS_PORT,
    password: env_1.env.REDIS_PASSWORD || undefined,
    db: env_1.env.REDIS_DB,
    enableReadyCheck: false,
    lazyConnect: true,
};
// Main Redis client (for general use)
exports.redis = new ioredis_1.default(redisConfig);
// Connection OPTIONS for BullMQ — BullMQ manages its own connections
// Do NOT pass a lazyConnect ioredis instance; pass plain options instead
exports.bullMQConnection = {
    host: env_1.env.REDIS_HOST,
    port: env_1.env.REDIS_PORT,
    password: env_1.env.REDIS_PASSWORD || undefined,
    db: env_1.env.REDIS_DB,
};
// Keep bullRedis for backwards compat in connectRedis/disconnectRedis
exports.bullRedis = new ioredis_1.default({ ...redisConfig, lazyConnect: true });
exports.redis.on('connect', () => logger_1.logger.info('Redis connected'));
exports.redis.on('error', (err) => logger_1.logger.error({ err }, 'Redis error'));
exports.redis.on('reconnecting', () => logger_1.logger.warn('Redis reconnecting'));
exports.bullRedis.on('error', (err) => logger_1.logger.error({ err }, 'BullMQ Redis error'));
async function connectRedis() {
    if (exports.redis.status === 'wait')
        await exports.redis.connect();
    if (exports.bullRedis.status === 'wait')
        await exports.bullRedis.connect();
}
async function disconnectRedis() {
    await exports.redis.quit();
    await exports.bullRedis.quit();
    logger_1.logger.info('Redis disconnected');
}
// ─── Redis Key Helpers ───────────────────────────────────────────────────────
exports.RedisKeys = {
    rateConnMin: (id) => `rate:conn:${id}:min`,
    rateConnDay: (id) => `rate:conn:${id}:day`,
    rateGlobalMin: () => `rate:global:min`,
    healthConn: (id) => `health:conn:${id}`,
    queuePending: (id) => `queue:pending:${id}`,
    userSession: (userId) => `session:${userId}`,
    campaignPause: (id) => `campaign:pause:${id}`,
    connPaused: (id) => `conn:paused:${id}`,
    idempotency: (key) => `idempotency:${key}`,
    connErrorCount: (id, type) => `conn:errors:${id}:${type}`,
    rateConnTplDay: (id) => `rate:conn:${id}:tpl:day`,
    leadsListCache: (workspaceId, scope) => `cache:leads:${workspaceId}:${scope}`,
    dashboardAdminCache: (workspaceId, from, to) => `cache:dash:admin:${workspaceId}:${from}:${to}`,
    dashboardOperatorCache: (userId, from, to) => `cache:dash:op:${userId}:${from}:${to}`,
    kanbanCache: (workspaceId) => `cache:kanban:${workspaceId}`,
};
//# sourceMappingURL=redis.js.map