"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const service_1 = require("./broadcasts.service");
const leads_middleware_1 = require("../leads/leads.middleware");

async function broadcastsRoutes(app) {
    const svc = new service_1.BroadcastsService();
    app.addHook('preHandler', leads_middleware_1.authenticateLeadUser);
    app.addHook('preHandler', leads_middleware_1.requireLeadAdmin);

    app.get('/', async (req) => svc.list(req.leadUser.workspaceId));

    app.get('/:id', async (req, reply) => {
        const bc = await svc.get(req.leadUser.workspaceId, req.params.id);
        if (!bc) return reply.status(404).send({ error: 'Broadcast não encontrado' });
        return bc;
    });

    app.post('/preview-count', async (req) => {
        const n = await svc.previewCount(req.leadUser.workspaceId, req.body?.filters || {});
        return { count: n };
    });

    app.get('/:id/stats', async (req) => svc.stats(req.leadUser.workspaceId, req.params.id));
    app.get('/:id/metrics', async (req) => svc.detailedStats(req.leadUser.workspaceId, req.params.id));

    app.post('/', async (req, reply) => {
        const b = req.body || {};
        if (!b.name) return reply.status(400).send({ error: 'name obrigatório' });
        const mt = b.messageType || 'text';
        if (mt === 'text' && !b.content) return reply.status(400).send({ error: 'content obrigatório para tipo texto' });
        if (mt === 'template' && !b.templateId) return reply.status(400).send({ error: 'templateId obrigatório' });
        if (mt === 'document' && !b.documentUrl) return reply.status(400).send({ error: 'documentUrl obrigatório' });
        if (!b.content) b.content = '';
        const created = await svc.create(req.leadUser.workspaceId, req.leadUser.id, b);
        return reply.status(201).send(created);
    });

    app.put('/:id', async (req, reply) => {
        try {
            const updated = await svc.update(req.leadUser.workspaceId, req.params.id, req.body || {});
            if (!updated) return reply.status(404).send({ error: 'não encontrado' });
            return updated;
        } catch (e) { return reply.status(400).send({ error: e.message }); }
    });

    app.delete('/:id', async (req, reply) => {
        const ok = await svc.remove(req.leadUser.workspaceId, req.params.id);
        if (!ok) return reply.status(404).send({ error: 'não encontrado' });
        return reply.status(204).send();
    });

    app.post('/:id/start', async (req, reply) => {
        try {
            const r = await svc.start(req.leadUser.workspaceId, req.params.id);
            return r;
        } catch (e) { return reply.status(400).send({ error: e.message }); }
    });

    app.post('/:id/pause', async (req, reply) => {
        const r = await svc.pause(req.leadUser.workspaceId, req.params.id);
        if (!r) return reply.status(404).send({ error: 'não encontrado' });
        return r;
    });
}

module.exports = broadcastsRoutes;
module.exports.default = broadcastsRoutes;
