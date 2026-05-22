"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const fs_2 = require("fs");
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const redis_1 = require("./config/redis");
const common_types_1 = require("./types/common.types");
const correlation_middleware_1 = __importDefault(require("./middleware/correlation.middleware"));
// Modules
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const connections_routes_1 = __importDefault(require("./modules/connections/connections.routes"));
const contacts_routes_1 = __importDefault(require("./modules/contacts/contacts.routes"));
const templates_routes_1 = __importDefault(require("./modules/templates/templates.routes"));
const campaigns_routes_1 = __importDefault(require("./modules/campaigns/campaigns.routes"));
const webhooks_routes_1 = __importDefault(require("./modules/webhooks/webhooks.routes"));
const dashboard_routes_1 = __importDefault(require("./modules/dashboard/dashboard.routes"));
const settings_routes_1 = __importDefault(require("./modules/settings/settings.routes"));
const leads_routes_1 = __importDefault(require("./modules/leads/leads.routes"));
const super_routes_1 = __importDefault(require("./modules/super/super.routes"));
const kanban_routes_1 = __importDefault(require("./modules/kanban/kanban.routes"));
const models_routes_1 = __importDefault(require("./modules/models/models.routes"));
const financial_routes_1 = __importDefault(require("./modules/financial/financial.routes"));
const telegram_user_internal_routes_1 = __importDefault(require("./modules/telegram-user/internal.routes"));
// Modules restaurados após rebuild incidental de 19/05 03:27
const ai_agents_routes_1 = __importDefault(require("./modules/ai-agents/ai-agents.routes"));
const broadcasts_routes_1 = __importDefault(require("./modules/broadcasts/broadcasts.routes"));
const intake_routes_1 = __importDefault(require("./modules/intake/intake.routes"));
const meta_ads_routes_1 = __importDefault(require("./modules/meta-ads/meta-ads.routes"));
async function buildApp() {
    const app = (0, fastify_1.default)({
        logger: logger_1.logger,
        genReqId: () => require('crypto').randomUUID(),
        trustProxy: true,
    });
    // ─── Plugins ─────────────────────────────────────────────────────────────
    await app.register(helmet_1.default, {
        contentSecurityPolicy: false,
    });
    await app.register(cors_1.default, {
        origin: env_1.env.CORS_ORIGINS.split(',').map((o) => o.trim()),
        credentials: true,
    });
    await app.register(rate_limit_1.default, {
        max: env_1.env.RATE_LIMIT_MAX,
        timeWindow: env_1.env.RATE_LIMIT_WINDOW_MS,
        redis: redis_1.redis,
        keyGenerator: (req) => req.ip,
    });
    await app.register(jwt_1.default, {
        secret: env_1.env.JWT_SECRET,
    });
    await app.register(multipart_1.default, {
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB
        },
    });
    await app.register(correlation_middleware_1.default);
    // ─── Error Handler ───────────────────────────────────────────────────────
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof common_types_1.HttpError) {
            return reply.status(error.statusCode).send({
                statusCode: error.statusCode,
                error: error.code,
                message: error.message,
                correlationId: request.correlationId,
            });
        }
        // Fastify validation error
        if (error.validation) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: error.validation,
                correlationId: request.correlationId,
            });
        }
        // Zod error passado como HttpError
        if (error.statusCode) {
            return reply.status(error.statusCode).send({
                statusCode: error.statusCode,
                error: error.code ?? 'ERROR',
                message: error.message,
                correlationId: request.correlationId,
            });
        }
        request.log.error({ err: error, correlationId: request.correlationId }, 'Unhandled error');
        return reply.status(500).send({
            statusCode: 500,
            error: 'INTERNAL_ERROR',
            message: 'Internal server error',
            correlationId: request.correlationId,
        });
    });
    // ─── Public: audio model files (sem auth) ───────────────────────────────
    const AUDIO_UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads', 'audio_models');
    app.get(`${env_1.env.API_PREFIX}/models/audio/file/:filename`, async (req, reply) => {
        const { filename } = req.params;
        if (!/^[a-zA-Z0-9_\-.]+$/.test(filename))
            return reply.status(404).send();
        const filePath = path_1.default.join(AUDIO_UPLOAD_DIR, filename);
        if (!fs_1.default.existsSync(filePath))
            return reply.status(404).send();
        const ext = path_1.default.extname(filename).toLowerCase();
        const mimeMap = {
            '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.webm': 'audio/webm',
            '.m4a': 'audio/mp4', '.opus': 'audio/ogg',
        };
        reply.header('Content-Type', mimeMap[ext] || 'audio/octet-stream');
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send((0, fs_2.createReadStream)(filePath));
    });
    // ─── Health check ────────────────────────────────────────────────────────
    app.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    }));
    // ─── Routes ──────────────────────────────────────────────────────────────
    await app.register(auth_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/auth` });
    await app.register(connections_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/connections` });
    await app.register(contacts_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/contacts` });
    await app.register(templates_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/templates` });
    await app.register(campaigns_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/campaigns` });
    await app.register(webhooks_routes_1.default, { prefix: `/webhooks` });
    await app.register(dashboard_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/dashboard` });
    await app.register(settings_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/settings` });
    await app.register(leads_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/leads` });
    await app.register(super_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/super` });
    await app.register(kanban_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/kanban` });
    await app.register(models_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/models` });
    await app.register(financial_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/financial` });
    // Modules restaurados após rebuild incidental de 19/05 03:27 (perdidos do app.js da imagem)
    await app.register(ai_agents_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/ai-agents` });
    await app.register(broadcasts_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/broadcasts` });
    await app.register(intake_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/intake` });
    await app.register(meta_ads_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/meta-ads` });
    // Internal routes — chamadas server-to-server (container telegram-user). Auth via X-Internal-Token.
    await app.register(telegram_user_internal_routes_1.default, { prefix: `${env_1.env.API_PREFIX}/internal` });
    return app;
}
//# sourceMappingURL=app.js.map