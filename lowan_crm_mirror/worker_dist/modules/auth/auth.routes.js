"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = authRoutes;
const auth_service_1 = require("./auth.service");
const auth_controller_1 = require("./auth.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
async function authRoutes(app) {
    const service = new auth_service_1.AuthService(app);
    const controller = new auth_controller_1.AuthController(service);
    // POST /auth/login
    app.post('/login', (req, reply) => controller.login(req, reply));
    // POST /auth/refresh
    app.post('/refresh', (req, reply) => controller.refresh(req, reply));
    // Authenticated routes
    app.register(async (secured) => {
        secured.addHook('preHandler', auth_middleware_1.authenticate);
        // POST /auth/logout
        secured.post('/logout', (req, reply) => controller.logout(req, reply));
        // GET /auth/me
        secured.get('/me', (req, reply) => controller.me(req, reply));
        // PATCH /auth/me/password
        secured.patch('/me/password', (req, reply) => controller.changePassword(req, reply));
    });
}
//# sourceMappingURL=auth.routes.js.map