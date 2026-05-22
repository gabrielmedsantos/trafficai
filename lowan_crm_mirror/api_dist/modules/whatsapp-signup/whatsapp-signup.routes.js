"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = whatsappSignupRoutes;
const whatsapp_signup_service_1 = require("./whatsapp-signup.service");
const whatsapp_signup_schema_1 = require("./whatsapp-signup.schema");
const leads_middleware_1 = require("../leads/leads.middleware");
const common_types_1 = require("../../types/common.types");

async function whatsappSignupRoutes(app) {
    const service = new whatsapp_signup_service_1.WhatsappSignupService();

    // GET /api/v1/leads/whatsapp-signup/config — qualquer leadUser autenticado
    app.get('/config', async (_req, reply) => {
        return reply.send(service.getPublicConfig());
    });

    // POST /api/v1/leads/whatsapp-signup/start — exchange + preview (leadUser ADMIN)
    app.post('/start', { preHandler: (0, leads_middleware_1.requirePermission)("manageConnections") }, async (req, reply) => {
        const parsed = whatsapp_signup_schema_1.startSignupSchema.safeParse(req.body);
        if (!parsed.success) {
            throw common_types_1.HttpError.badRequest(parsed.error.message, 'VALIDATION');
        }
        const result = await service.startSignup(parsed.data, req.leadUser);
        return reply.send(result);
    });

    // POST /api/v1/leads/whatsapp-signup/complete — confirma preview, cria conexão (leadUser ADMIN)
    app.post('/complete', { preHandler: (0, leads_middleware_1.requirePermission)("manageConnections") }, async (req, reply) => {
        const parsed = whatsapp_signup_schema_1.completeSignupSchema.safeParse(req.body);
        if (!parsed.success) {
            throw common_types_1.HttpError.badRequest(parsed.error.message, 'VALIDATION');
        }
        const result = await service.completeSignup(parsed.data, req.leadUser);
        return reply.status(201).send(result);
    });

    // GET /api/v1/leads/whatsapp-signup/business-map — { [connectionId]: { businessId, businessName, wabaId } }
    app.get('/business-map', async (req, reply) => {
        const map = await service.getBusinessMap(req.leadUser.workspaceId);
        return reply.send(map);
    });

    // POST /api/v1/leads/whatsapp-signup/refresh-business/:id — força fetch da Meta + persiste
    // body opcional: { businessId } — pra conexões antigas sem businessId persistido
    app.post('/refresh-business/:id', { preHandler: (0, leads_middleware_1.requirePermission)("manageConnections") }, async (req, reply) => {
        const { id } = req.params || {};
        if (!id || typeof id !== 'string') {
            throw common_types_1.HttpError.badRequest('id é obrigatório', 'MISSING_ID');
        }
        const businessIdOverride = (req.body && typeof req.body.businessId === 'string' && req.body.businessId.trim()) || null;
        const result = await service.refreshBusinessInfo(id, req.leadUser, businessIdOverride);
        return reply.send(result);
    });
}
//# sourceMappingURL=whatsapp-signup.routes.js.map
