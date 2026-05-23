"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = kanbanRoutes;
const kanban_service_1 = require("./kanban.service");
const kanban_controller_1 = require("./kanban.controller");
const leads_middleware_1 = require("../leads/leads.middleware");
async function kanbanRoutes(app) {
    const service = new kanban_service_1.KanbanService();
    const controller = new kanban_controller_1.KanbanController(service);
    app.register(async (authed) => {
        authed.addHook('preHandler', leads_middleware_1.authenticateLeadUser);
        authed.get('/', (req, reply) => controller.getBoard(req, reply));
        // Data-Lite: contadores agregados sem precisar do board completo
        authed.get('/summary', (req, reply) => controller.summary(req, reply));
        authed.post('/stages', (req, reply) => controller.createStage(req, reply));
        authed.patch('/stages/:id', (req, reply) => controller.updateStage(req, reply));
        authed.delete('/stages/:id', (req, reply) => controller.deleteStage(req, reply));
        authed.post('/stages/reorder', (req, reply) => controller.reorderStages(req, reply));
        // Gatilhos / Rules
        authed.post('/rules', (req, reply) => controller.createRule(req, reply));
        authed.patch('/rules/:id', (req, reply) => controller.updateRule(req, reply));
        authed.delete('/rules/:id', (req, reply) => controller.deleteRule(req, reply));
    });
}
//# sourceMappingURL=kanban.routes.js.map