"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = aiAgentsRoutes;

const ai_agents_service_1 = require("./ai-agents.service");
const leads_middleware_1 = require("../leads/leads.middleware");

async function aiAgentsRoutes(app) {
    const service = new ai_agents_service_1.AiAgentsService();

    app.addHook('preHandler', leads_middleware_1.authenticateLeadUser);

    // ── API Key ──────────────────────────────────────────────────────────────
    app.get('/api-key', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        return reply.send(await service.hasApiKey(wsId));
    });

    app.put('/api-key', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        const { apiKey } = req.body || {};
        try {
            const r = await service.setApiKey(wsId, apiKey || null);
            return reply.send(r);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    // ── CRUD agentes ─────────────────────────────────────────────────────────
    app.get('/', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        return reply.send(await service.list(wsId));
    });

    app.get('/:id', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        const agent = await service.get(wsId, req.params.id);
        if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' });
        return reply.send(agent);
    });

    app.post('/', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            const agent = await service.create(wsId, req.leadUser.id, req.body || {});
            return reply.status(201).send(agent);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    app.put('/:id', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            const agent = await service.update(wsId, req.params.id, req.body || {});
            return reply.send(agent);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    app.delete('/:id', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            await service.delete(wsId, req.params.id);
            return reply.status(204).send();
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    app.post('/:id/duplicate', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            const agent = await service.duplicate(wsId, req.leadUser.id, req.params.id);
            return reply.status(201).send(agent);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    app.post('/:id/toggle', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            const agent = await service.toggle(wsId, req.params.id);
            return reply.send(agent);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    // ── Test endpoint (chat de teste, não envia ao cliente) ─────────────────
    app.post('/:id/test', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        const { text } = req.body || {};
        try {
            const result = await service.test(wsId, req.params.id, text);
            return reply.send(result);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    // ── Runs (histórico de execução) ────────────────────────────────────────
    app.get('/:id/runs', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        const limit = parseInt(req.query?.limit, 10) || 50;
        try {
            return reply.send(await service.listRuns(wsId, req.params.id, limit));
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    app.get('/:id/stats', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        return reply.send(await service.stats(wsId, req.params.id));
    });
}
