"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = metaAdsRoutes;

const meta_ads_service_1 = require("./meta-ads.service");
const leads_middleware_1 = require("../leads/leads.middleware");

async function metaAdsRoutes(app) {
    const service = new meta_ads_service_1.MetaAdsService();

    app.addHook('preHandler', leads_middleware_1.authenticateLeadUser);

    // ── Listar contas conectadas ─────────────────────────────────────
    app.get('/accounts', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        return reply.send(await service.listAccounts(wsId));
    });

    // ── Conectar conta (admin) ───────────────────────────────────────
    app.post('/accounts', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            const acc = await service.connect(wsId, req.leadUser.id, req.body || {});
            return reply.status(201).send(acc);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    // ── Desconectar (admin) ──────────────────────────────────────────
    app.delete('/accounts/:id', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            await service.disconnect(wsId, req.params.id);
            return reply.status(204).send();
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    // ── Sync sob demanda (admin) ─────────────────────────────────────
    app.post('/accounts/:id/sync', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        try {
            const r = await service.sync(wsId, req.params.id, req.body || {});
            return reply.send(r);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    // ── Dashboard ────────────────────────────────────────────────────
    app.get('/dashboard', async (req, reply) => {
        const wsId = req.leadUser.workspaceId;
        const { since, until, accountId } = req.query || {};
        try {
            const data = await service.getDashboard(wsId, { since, until, accountId });
            return reply.send(data);
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });
}
