"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = telegramUserRoutes;
const telegram_user_service_1 = require("./telegram-user.service");
const telegram_user_schema_1 = require("./telegram-user.schema");
const leads_middleware_1 = require("../leads/leads.middleware");
const common_types_1 = require("../../types/common.types");

async function telegramUserRoutes(app) {
    const service = new telegram_user_service_1.TelegramUserService();

    // GET / — lista conexões do workspace
    app.get('/', async (req, reply) => {
        const list = await service.list(req.leadUser.workspaceId);
        return reply.send(list);
    });

    // POST /start — inicia auth, envia SMS code via Telegram
    app.post('/start', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const parsed = telegram_user_schema_1.startAuthSchema.safeParse(req.body);
        if (!parsed.success) throw common_types_1.HttpError.badRequest(parsed.error.message, 'VALIDATION');
        const r = await service.startAuth(parsed.data, req.leadUser);
        return reply.send(r);
    });

    // POST /verify — finaliza auth com code (+ password se 2FA)
    app.post('/verify', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const parsed = telegram_user_schema_1.verifyAuthSchema.safeParse(req.body);
        if (!parsed.success) throw common_types_1.HttpError.badRequest(parsed.error.message, 'VALIDATION');
        const r = await service.verifyAuth(parsed.data, req.leadUser);
        return reply.status(201).send(r);
    });

    // POST /:id/check
    app.post('/:id/check', async (req, reply) => {
        const r = await service.check(req.params.id, req.leadUser.workspaceId);
        return reply.send(r);
    });

    // POST /:id/pause | /:id/resume
    app.post('/:id/pause', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const r = await service.setStatus(req.params.id, req.leadUser.workspaceId, 'PAUSED', 'Pausado manualmente');
        return reply.send(r);
    });
    app.post('/:id/resume', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const r = await service.setStatus(req.params.id, req.leadUser.workspaceId, 'ACTIVE', null);
        return reply.send(r);
    });

    // DELETE /:id
    app.delete('/:id', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        await service.remove(req.params.id, req.leadUser.workspaceId);
        return reply.status(204).send();
    });
}
