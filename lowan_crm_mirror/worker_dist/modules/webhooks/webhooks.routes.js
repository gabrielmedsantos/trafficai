"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = webhooksRoutes;
const webhooks_service_1 = require("./webhooks.service");
const webhooks_controller_1 = require("./webhooks.controller");
async function webhooksRoutes(app) {
    const service = new webhooks_service_1.WebhooksService();
    const controller = new webhooks_controller_1.WebhooksController(service);
    // Preservar body bruto para validação HMAC correta da Meta
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
        try {
            ;
            req.rawBody = body;
            done(null, JSON.parse(body));
        }
        catch (err) {
            err.statusCode = 400;
            done(err, undefined);
        }
    });
    // GET /webhooks/meta — verificação do endpoint pela Meta
    app.get('/meta', (req, reply) => controller.verify(req, reply));
    // POST /webhooks/meta — recebimento de eventos
    app.post('/meta', (req, reply) => controller.receive(req, reply));
    // POST /webhooks/telegram/:connectionId — updates do Telegram Bot API
    // Sem auth — Telegram faz POST direto; connectionId na URL identifica o bot
    app.post('/telegram/:connectionId', (req, reply) => controller.receiveTelegram(req, reply));
    // POST /webhooks/telegram-user/:connectionId — inbound do container MTProto (auth X-Internal-Token)
    app.post('/telegram-user/:connectionId', (req, reply) => controller.receiveTelegramUser(req, reply));
    app.post('/uazapi', (req, reply) => controller.receiveUazapi(req, reply));
}
//# sourceMappingURL=webhooks.routes.js.map