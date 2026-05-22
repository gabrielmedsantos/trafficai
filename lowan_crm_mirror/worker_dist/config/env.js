"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().default(3000),
    HOST: zod_1.z.string().default('0.0.0.0'),
    API_PREFIX: zod_1.z.string().default('/api/v1'),
    DATABASE_URL: zod_1.z.string().min(1),
    REDIS_HOST: zod_1.z.string().default('localhost'),
    REDIS_PORT: zod_1.z.coerce.number().default(6379),
    REDIS_PASSWORD: zod_1.z.string().optional(),
    REDIS_DB: zod_1.z.coerce.number().default(0),
    JWT_SECRET: zod_1.z.string().min(32),
    JWT_EXPIRES_IN: zod_1.z.string().default('15m'),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('7d'),
    ENCRYPTION_KEY: zod_1.z.string().length(64, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
    META_API_VERSION: zod_1.z.string().default('v19.0'),
    META_API_BASE_URL: zod_1.z.string().default('https://graph.facebook.com'),
    META_APP_SECRET: zod_1.z.string().min(1),
    META_APP_ID: zod_1.z.string().optional(),
    META_EMBEDDED_SIGNUP_CONFIG_ID: zod_1.z.string().optional(),
    TELEGRAM_USER_API_ID: zod_1.z.string().optional(),
    TELEGRAM_USER_API_HASH: zod_1.z.string().optional(),
    TELEGRAM_USER_URL: zod_1.z.string().default('http://telegram-user:3003'),
    INTERNAL_SHARED_SECRET: zod_1.z.string().optional(),
    META_REQUEST_TIMEOUT_MS: zod_1.z.coerce.number().default(10000),
    WEBHOOK_BASE_URL: zod_1.z.string().url(),
    WEBHOOK_PATH: zod_1.z.string().default('/webhooks/meta'),
    QUEUE_MESSAGE_CONCURRENCY: zod_1.z.coerce.number().default(20),
    QUEUE_CAMPAIGN_CONCURRENCY: zod_1.z.coerce.number().default(5),
    QUEUE_WEBHOOK_CONCURRENCY: zod_1.z.coerce.number().default(10),
    QUEUE_HEALTH_CONCURRENCY: zod_1.z.coerce.number().default(2),
    QUEUE_GLOBAL_RATE_MAX: zod_1.z.coerce.number().default(200),
    QUEUE_GLOBAL_RATE_DURATION_MS: zod_1.z.coerce.number().default(1000),
    HEALTH_CHECK_INTERVAL_MS: zod_1.z.coerce.number().default(30000),
    HEALTH_MAX_AUTH_ERRORS: zod_1.z.coerce.number().default(3),
    HEALTH_MAX_RATE_ERRORS: zod_1.z.coerce.number().default(5),
    HEALTH_MAX_TEMP_ERRORS: zod_1.z.coerce.number().default(10),
    HEALTH_PAUSE_RATE_LIMIT_SECONDS: zod_1.z.coerce.number().default(300),
    HEALTH_PAUSE_TEMP_ERROR_SECONDS: zod_1.z.coerce.number().default(120),
    LOG_LEVEL: zod_1.z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    LOG_FORMAT: zod_1.z.enum(['pretty', 'json']).default('pretty'),
    CORS_ORIGINS: zod_1.z.string().default('http://localhost:3000'),
    RATE_LIMIT_MAX: zod_1.z.coerce.number().default(100),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().default(60000),
    BCRYPT_ROUNDS: zod_1.z.coerce.number().default(12),
    ANTHROPIC_API_KEY: zod_1.z.string().optional(),
    DAILY_RESET_CRON: zod_1.z.string().default('0 0 * * *'),
    DAILY_RESET_TIMEZONE: zod_1.z.string().default('America/Sao_Paulo'),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
//# sourceMappingURL=env.js.map