"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = telegramUserInternalRoutes;
const telegram_user_service_1 = require("./telegram-user.service");
const env_1 = require("../../config/env");
const common_types_1 = require("../../types/common.types");

function checkInternalToken(req) {
    const tok = req.headers['x-internal-token'];
    if (!tok || tok !== env_1.env.INTERNAL_SHARED_SECRET) {
        throw common_types_1.HttpError.forbidden('Internal token inválido', 'INTERNAL_AUTH_FAILED');
    }
}

async function telegramUserInternalRoutes(app) {
    const svc = new telegram_user_service_1.TelegramUserInternalService();

    // GET /restore-list — container chama no boot pra restaurar sessões ACTIVE
    app.get('/telegram-user/restore-list', async (req, reply) => {
        checkInternalToken(req);
        const list = await svc.restoreList();
        return reply.send(list);
    });

    // PATCH /:id/heartbeat — container envia a cada 60s
    app.patch('/telegram-user/:id/heartbeat', async (req, reply) => {
        checkInternalToken(req);
        const status = (req.body && req.body.status) || 'ACTIVE';
        await svc.heartbeat(req.params.id, status);
        return reply.send({ ok: true });
    });
}
