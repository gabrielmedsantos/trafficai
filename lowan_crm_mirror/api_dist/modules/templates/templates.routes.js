"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = templatesRoutes;
const templates_service_1 = require("./templates.service");
const templates_controller_1 = require("./templates.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const client_1 = require("@prisma/client");
async function templatesRoutes(app) {
    const service = new templates_service_1.TemplatesService();
    const controller = new templates_controller_1.TemplatesController(service);
    app.addHook('preHandler', auth_middleware_1.authenticate);
    app.get('/', (req, reply) => controller.list(req, reply));
    app.get('/:id', (req, reply) => controller.getById(req, reply));
    app.register(async (restricted) => {
        restricted.addHook('preHandler', (0, auth_middleware_1.requireRole)(client_1.UserRole.ADMIN, client_1.UserRole.OPERATOR));
        restricted.post('/', (req, reply) => controller.create(req, reply));
        restricted.post('/:id/resubmit', (req, reply) => controller.resubmit(req, reply));
        restricted.post('/:id/sync-status', (req, reply) => controller.syncStatus(req, reply));
        restricted.put('/:id', (req, reply) => controller.update(req, reply));
        restricted.delete('/:id', (req, reply) => controller.delete(req, reply));
    });
}
//# sourceMappingURL=templates.routes.js.map