"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = dashboardRoutes;
const dashboard_service_1 = require("./dashboard.service");
const dashboard_controller_1 = require("./dashboard.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
async function dashboardRoutes(app) {
    const service = new dashboard_service_1.DashboardService();
    const controller = new dashboard_controller_1.DashboardController(service);
    app.addHook('preHandler', auth_middleware_1.authenticate);
    // GET /dashboard/overview?from=&to=
    app.get('/overview', (req, reply) => controller.getOverview(req, reply));
    // GET /dashboard/connections?from=&to=
    app.get('/connections', (req, reply) => controller.getConnections(req, reply));
    // GET /dashboard/campaigns/:id?from=&to=
    app.get('/campaigns/:id', (req, reply) => controller.getCampaign(req, reply));
    // GET /dashboard/throughput?from=&to=
    app.get('/throughput', (req, reply) => controller.getThroughput(req, reply));
}
//# sourceMappingURL=dashboard.routes.js.map