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
        const { text, history } = req.body || {};
        try {
            const result = await service.test(wsId, req.params.id, text, Array.isArray(history) ? history : null);
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

    // ── Override global de IA (admin) ───────────────────────────────────────
    app.get('/global-override', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        return reply.send(await service.getGlobalOverride(wsId));
    });

    app.post('/global-override', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        const { active, until, reason } = req.body || {};
        try {
            const r = await service.setGlobalOverride(wsId, !!active, {
                userId: req.leadUser.id,
                until: until || null,
                reason: reason || null,
            });
            return reply.send(r);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    // ── Estado da IA por lead ───────────────────────────────────────────────
    app.get('/lead-state/:leadId', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            const r = await service.getLeadAiState(req.params.leadId, wsId);
            if (!r) return reply.status(404).send({ error: 'Lead não encontrado' });
            return reply.send(r);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    app.post('/lead-state/:leadId', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        const { state, reason } = req.body || {};
        try {
            const r = await service.setLeadAiState(req.params.leadId, wsId, state, req.leadUser.id, reason || null);
            return reply.send(r);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    app.get('/lead-state/:leadId/log', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        const limit = Math.min(parseInt(req.query?.limit, 10) || 50, 200);
        try {
            const rows = await require('../../config/database').prisma.$queryRawUnsafe(
                `SELECT id, prev_state, new_state, reason, actor_id, created_at
                 FROM ai_lead_state_log
                 WHERE lead_id = $1::uuid AND workspace_id = $2::uuid
                 ORDER BY created_at DESC
                 LIMIT $3::int`,
                req.params.leadId, wsId, limit
            );
            return reply.send(rows);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });
}
