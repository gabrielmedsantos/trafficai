"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = campaignsRoutes;
const campaigns_service_1 = require("./campaigns.service");
const campaigns_controller_1 = require("./campaigns.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const client_1 = require("@prisma/client");
async function campaignsRoutes(app) {
    const service = new campaigns_service_1.CampaignsService();
    const controller = new campaigns_controller_1.CampaignsController(service);
    app.addHook('preHandler', auth_middleware_1.authenticate);
    app.get('/', (req, reply) => controller.list(req, reply));
    app.get('/:id', (req, reply) => controller.getById(req, reply));
    app.get('/:id/stats', (req, reply) => controller.getStats(req, reply));
    app.get('/:id/contacts', (req, reply) => controller.getContacts(req, reply));
    app.register(async (restricted) => {
        restricted.addHook('preHandler', (0, auth_middleware_1.requireRole)(client_1.UserRole.ADMIN, client_1.UserRole.OPERATOR));
        restricted.post('/', (req, reply) => controller.create(req, reply));
        restricted.put('/:id', (req, reply) => controller.update(req, reply));
        restricted.delete('/:id', (req, reply) => controller.delete(req, reply));
        restricted.post('/:id/start', (req, reply) => controller.start(req, reply));
        restricted.post('/:id/pause', (req, reply) => controller.pause(req, reply));
        restricted.post('/:id/resume', (req, reply) => controller.resume(req, reply));
    });
}
//# sourceMappingURL=campaigns.routes.js.map