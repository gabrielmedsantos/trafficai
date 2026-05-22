"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = telegramRoutes;
const telegram_service_1 = require("./telegram.service");
const telegram_controller_1 = require("./telegram.controller");
const leads_middleware_1 = require("../../modules/leads/leads.middleware");
async function telegramRoutes(app) {
    const service = new telegram_service_1.TelegramService();
    const controller = new telegram_controller_1.TelegramController(service);
    app.addHook('preHandler', leads_middleware_1.authenticateLeadUser);
    app.addHook('preHandler', leads_middleware_1.requireLeadAdmin);
    // GET /api/v1/leads/telegram
    app.get('/', (req, reply) => controller.list(req, reply));
    // POST /api/v1/leads/telegram
    app.post('/', (req, reply) => controller.create(req, reply));
    // DELETE /api/v1/leads/telegram/:id
    app.delete('/:id', (req, reply) => controller.delete(req, reply));
    // POST /api/v1/leads/telegram/:id/check
    app.post('/:id/check', (req, reply) => controller.check(req, reply));
}
//# sourceMappingURL=telegram.routes.js.map