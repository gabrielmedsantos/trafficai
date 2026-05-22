"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = superRoutes;
const super_service_1 = require("./super.service");
const super_controller_1 = require("./super.controller");
const super_middleware_1 = require("./super.middleware");
async function superRoutes(app) {
    const service = new super_service_1.SuperService(app);
    const controller = new super_controller_1.SuperController(service);
    // ─── Public ──────────────────────────────────────────────────────────────
    app.get('/auth/check', (req, reply) => controller.check(req, reply));
    app.post('/auth/setup', (req, reply) => controller.setup(req, reply));
    app.post('/auth/login', (req, reply) => controller.login(req, reply));
    // ─── Authenticated ────────────────────────────────────────────────────────
    app.register(async (authed) => {
        authed.addHook('preHandler', super_middleware_1.authenticateSuperAdmin);
        authed.get('/workspaces', (req, reply) => controller.listWorkspaces(req, reply));
        authed.post('/workspaces', (req, reply) => controller.createWorkspace(req, reply));
        authed.get('/workspaces/:id', (req, reply) => controller.getWorkspace(req, reply));
        authed.patch('/workspaces/:id', (req, reply) => controller.updateWorkspace(req, reply));
        authed.delete('/workspaces/:id', (req, reply) => controller.deleteWorkspace(req, reply));
        authed.get('/workspaces/:id/users', (req, reply) => controller.getWorkspaceUsers(req, reply));
        authed.post('/workspaces/:id/impersonate', (req, reply) => controller.impersonateWorkspace(req, reply));
    });
}
//# sourceMappingURL=super.routes.js.map