"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = leadsRoutes;
const leads_service_1 = require("./leads.service");
const leads_controller_1 = require("./leads.controller");
const leads_middleware_1 = require("./leads.middleware");
const connections_service_1 = require("../../modules/connections/connections.service");
const templates_service_1 = require("../../modules/templates/templates.service");
const connections_schema_1 = require("../../modules/connections/connections.schema");
const leads_schema_1 = require("./leads.schema");
const common_types_1 = require("../../types/common.types");
const database_1 = require("../../config/database");
async function leadsRoutes(app) {
    const service = new leads_service_1.LeadsService(app);
    const controller = new leads_controller_1.LeadsController(service);
    const connService = new connections_service_1.ConnectionsService();
    const templatesService = new templates_service_1.TemplatesService();
    // ─── Public ──────────────────────────────────────────────────────────────
    // /auth/check always returns exists:true — setup is disabled
    app.get('/auth/check', (_req, reply) => reply.send({ exists: true }));
    // /auth/setup is permanently disabled
    app.post('/auth/setup', (_req, reply) => reply.status(404).send({ error: 'Not found' }));
    app.post('/auth/login', (req, reply) => controller.login(req, reply));
    // ─── Authenticated ────────────────────────────────────────────────────────
    app.register(async (authed) => {
        authed.addHook('preHandler', leads_middleware_1.authenticateLeadUser);
        authed.get('/me', async (req, reply) => {
            const { id } = req.leadUser;
            return reply.send(await service.getMe(id));
        });
        authed.patch('/me', async (req, reply) => {
            const body = leads_schema_1.updateProfileSchema.safeParse(req.body);
            if (!body.success)
                throw common_types_1.HttpError.badRequest(body.error.message);
            const { id } = req.leadUser;
            return reply.send(await service.updateProfile(id, body.data));
        });
        authed.get('/', (req, reply) => controller.list(req, reply));
        authed.get('/tag-options', (req, reply) => controller.getTagOptions(req, reply));
        authed.put('/:id', (req, reply) => controller.update(req, reply));
        authed.get('/:id/conversation', (req, reply) => controller.getConversation(req, reply));
        authed.get('/:id/messages/:msgId/media', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            const { msgId } = req.params;
            const msg = await database_1.prisma.message.findUnique({
                where: { id: msgId },
                select: { metaResponse: true, connectionId: true, direction: true },
            });
            if (!msg)
                return reply.status(404).send();
            const meta = msg.metaResponse;
            const type = meta?.type;
            const mediaId = meta?.[type]?.id;
            if (!mediaId)
                return reply.status(404).send();
            const connection = await database_1.prisma.whatsappConnection.findFirst({
                where: { id: msg.connectionId, OR: [{ workspaceId }, { workspaceId: null }] },
                select: { accessTokenEnc: true },
            });
            if (!connection)
                return reply.status(404).send();
            const { decrypt } = await Promise.resolve().then(() => __importStar(require('../../services/crypto/token.encryption')));
            const accessToken = decrypt(connection.accessTokenEnc);
            const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!metaRes.ok)
                return reply.status(502).send();
            const { url } = await metaRes.json();
            const mediaRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!mediaRes.ok)
                return reply.status(502).send();
            const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';
            reply.header('Content-Type', contentType);
            reply.header('Cache-Control', 'private, max-age=3600');
            return reply.send(Buffer.from(await mediaRes.arrayBuffer()));
        });
        authed.post('/:id/read', (req, reply) => controller.markAsRead(req, reply));
        authed.post('/:id/reply', (req, reply) => controller.sendReply(req, reply));
        authed.post('/:id/reply-audio', async (req, reply) => {
            const { id: userId, role, workspaceId, permissions } = req.leadUser;
            const data = await req.file();
            if (!data)
                throw common_types_1.HttpError.badRequest('Arquivo de áudio obrigatório');
            const buffer = await data.toBuffer();
            const mimeType = data.mimetype || 'audio/ogg';
            const connectionId = req.query?.connectionId;
            return reply.status(201).send(await service.sendAudioReply(req.params.id, buffer, mimeType, userId, role, workspaceId, permissions, connectionId));
        });
        authed.post('/:id/start-conversation', async (req, reply) => {
            const body = leads_schema_1.startConversationSchema.safeParse(req.body);
            if (!body.success)
                throw common_types_1.HttpError.badRequest(body.error.message);
            const { id: userId, role, workspaceId, permissions } = req.leadUser;
            return reply.send(await service.startConversation(req.params.id, body.data.connectionId, body.data.templateName, body.data.language, body.data.variables, userId, role, workspaceId, permissions));
        });
        authed.post('/:id/block', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await service.blockLead(req.params.id, workspaceId));
        });
        authed.post('/:id/unblock', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await service.unblockLead(req.params.id, workspaceId));
        });
        authed.delete('/:id/conversation', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await service.deleteConversation(req.params.id, workspaceId));
        });
        // Listagem de conexões acessível a todos os usuários autenticados (usada no picker de templates)
        authed.get('/connections', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await connService.list({ page: 1, limit: 100 }, workspaceId));
        });
        // Templates aprovados do workspace (usados no picker de templates)
        authed.get('/templates', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            const connections = await database_1.prisma.whatsappConnection.findMany({
                where: { workspaceId, status: 'ACTIVE' },
                select: { id: true, name: true },
            });
            const connIds = connections.map(c => c.id);
            const connMap = Object.fromEntries(connections.map(c => [c.id, c.name]));
            const templates = await database_1.prisma.template.findMany({
                where: { connectionId: { in: connIds }, status: 'APPROVED' },
                orderBy: { name: 'asc' },
                select: { id: true, name: true, language: true, category: true, body: true, variablesCount: true, connectionId: true },
            });
            return reply.send(templates.map(t => ({ ...t, connectionName: t.connectionId ? connMap[t.connectionId] ?? null : null })));
        });
        // Templates por conexão (leitura)
        authed.get('/connections/:id/templates', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await templatesService.listByConnection(req.params.id, workspaceId));
        });
        // ─── Admin only ────────────────────────────────────────────────────────
        authed.register(async (admin) => {
            admin.addHook('preHandler', leads_middleware_1.requireLeadAdmin);
            admin.post('/', (req, reply) => controller.create(req, reply));
            admin.delete('/:id', (req, reply) => controller.delete(req, reply));
            admin.post('/import', (req, reply) => controller.bulkImport(req, reply));
            admin.post('/bulk-assign', (req, reply) => controller.bulkAssign(req, reply));
            admin.post('/redistribute', (req, reply) => controller.redistribute(req, reply));
        });
        // ─── Dashboard ─────────────────────────────────────────────────────────
        // Admin dashboard: admin ou viewReports
        authed.get('/dashboard/admin', async (req, reply) => {
            await (0, leads_middleware_1.requirePermission)('viewReports')(req, reply);
            return controller.dashboardAdmin(req, reply);
        });
        // Operator dashboard: qualquer usuário autenticado (dados filtrados por userId)
        authed.get('/dashboard/operator', (req, reply) => controller.dashboardOperator(req, reply));
        // ─── Admin OR permission ───────────────────────────────────────────────
        authed.register(async (perm) => {
            // Relatórios: admin ou viewReports
            perm.get('/report', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('viewReports')(req, reply);
                return controller.report(req, reply);
            });
            // Gestão de usuários: admin ou manageUsers
            perm.get('/users', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('manageUsers')(req, reply);
                return controller.listUsers(req, reply);
            });
            perm.post('/users', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('manageUsers')(req, reply);
                return controller.createUser(req, reply);
            });
            perm.put('/users/:id', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('manageUsers')(req, reply);
                return controller.updateUser(req, reply);
            });
            perm.delete('/users/:id', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('manageUsers')(req, reply);
                return controller.deleteUser(req, reply);
            });
        });
        // ─── Connections (admin only) ──────────────────────────────────────────
        authed.register(async (admin) => {
            admin.addHook('preHandler', leads_middleware_1.requireLeadAdmin);
            // ─── Connections (manage — admin only) ──────────────────────────────
            admin.post('/connections', async (req, reply) => {
                const body = connections_schema_1.createConnectionSchema.safeParse(req.body);
                if (!body.success)
                    throw common_types_1.HttpError.badRequest(body.error.message);
                const { workspaceId } = req.leadUser;
                const sysAdmin = await database_1.prisma.user.findFirst({
                    where: { isActive: true },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' },
                });
                if (!sysAdmin)
                    throw common_types_1.HttpError.badRequest('Nenhum usuário do sistema encontrado');
                const result = await connService.create(body.data, sysAdmin.id, workspaceId);
                return reply.status(201).send(result);
            });
            admin.get('/connections/:id', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.getById(req.params.id, workspaceId));
            });
            admin.put('/connections/:id', async (req, reply) => {
                const body = connections_schema_1.updateConnectionSchema.safeParse(req.body);
                if (!body.success)
                    throw common_types_1.HttpError.badRequest(body.error.message);
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.update(req.params.id, body.data, undefined, workspaceId));
            });
            admin.patch('/connections/:id/status', async (req, reply) => {
                const body = connections_schema_1.updateConnectionStatusSchema.safeParse(req.body);
                if (!body.success)
                    throw common_types_1.HttpError.badRequest(body.error.message);
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.updateStatus(req.params.id, body.data, workspaceId));
            });
            admin.delete('/connections/:id', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                await connService.delete(req.params.id, workspaceId);
                return reply.status(204).send();
            });
            admin.get('/connections/:id/health', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.getHealth(req.params.id, workspaceId));
            });
            admin.post('/connections/:id/check', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.checkToken(req.params.id, workspaceId));
            });
            // ─── Templates por conexão (sync — admin only) ─────────────────────────
            admin.post('/connections/:id/templates/sync', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                return reply.send(await templatesService.syncFromMeta(req.params.id, workspaceId));
            });
        });
    });
}
//# sourceMappingURL=leads.routes.js.map