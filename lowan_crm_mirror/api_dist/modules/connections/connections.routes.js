"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = connectionsRoutes;
const connections_service_1 = require("./connections.service");
const connections_controller_1 = require("./connections.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const client_1 = require("@prisma/client");
async function connectionsRoutes(app) {
    const service = new connections_service_1.ConnectionsService();
    const controller = new connections_controller_1.ConnectionsController(service);
    app.addHook('preHandler', auth_middleware_1.authenticate);
    // GET /connections
    app.get('/', (req, reply) => controller.list(req, reply));
    // GET /connections/:id
    app.get('/:id', (req, reply) => controller.getById(req, reply));
    // GET /connections/:id/health
    app.get('/:id/health', (req, reply) => controller.getHealth(req, reply));
    // POST /connections/:id/check
    app.post('/:id/check', (req, reply) => controller.checkToken(req, reply));
    // Admin/Operator only below
    app.register(async (restricted) => {
        restricted.addHook('preHandler', (0, auth_middleware_1.requireRole)(client_1.UserRole.ADMIN, client_1.UserRole.OPERATOR));
        // POST /connections
        restricted.post('/', (req, reply) => controller.create(req, reply));
        // PUT /connections/:id
        restricted.put('/:id', (req, reply) => controller.update(req, reply));
        // PATCH /connections/:id/status
        restricted.patch('/:id/status', (req, reply) => controller.updateStatus(req, reply));
        // DELETE /connections/:id
        restricted.delete('/:id', (req, reply) => controller.delete(req, reply));
    });
}
//# sourceMappingURL=connections.routes.js.map