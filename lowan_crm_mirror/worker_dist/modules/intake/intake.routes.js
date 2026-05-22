"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = intakeRoutes;

const intake_service_1 = require("./intake.service");
const leads_middleware_1 = require("../leads/leads.middleware");

async function intakeRoutes(app) {
    const service = new intake_service_1.IntakeService();

    // ── Endpoint público: POST /api/v1/intake/leads ─────────────────
    // Auth via header X-Intake-Token (token único por workspace)
    app.post('/leads', async (req, reply) => {
        const token = req.headers['x-intake-token'] || req.query?.token;
        if (!token) return reply.status(401).send({ error: 'X-Intake-Token header obrigatório' });

        const ws = await service.resolveWorkspaceByToken(String(token));
        if (!ws) return reply.status(401).send({ error: 'Token inválido' });

        try {
            const body = req.body || {};
            const result = await service.intakeLead(ws.id, body);
            return reply.status(result.isNew ? 201 : 200).send(result);
        } catch (e) {
            return reply.status(400).send({ error: e.message });
        }
    });

    // ── Endpoints autenticados (admin) ──────────────────────────────
    app.register(async function authedRoutes(authed) {
        authed.addHook('preHandler', leads_middleware_1.authenticateLeadUser);

        // GET token (admin only)
        authed.get('/token', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
            const wsId = req.leadUser.workspaceId;
            const tok = await service.getOrCreateToken(wsId);
            return reply.send({ token: tok });
        });

        // POST regenerate
        authed.post('/token/regenerate', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
            const wsId = req.leadUser.workspaceId;
            const tok = await service.regenerateToken(wsId);
            return reply.send({ token: tok });
        });

        // GET UTM dum lead
        authed.get('/leads/:id/utm', async (req, reply) => {
            const wsId = req.leadUser.workspaceId;
            const utm = await service.getLeadUtm(wsId, req.params.id);
            if (!utm) return reply.status(404).send({ error: 'Lead não encontrado' });
            return reply.send(utm);
        });

        // PATCH UTM (admin/manageLeads)
        authed.patch('/leads/:id/utm', async (req, reply) => {
            const wsId = req.leadUser.workspaceId;
            const role = req.leadUser.role;
            const perms = req.leadUser.permissions || {};
            if (role !== 'ADMIN' && !perms.manageLeads) {
                return reply.status(403).send({ error: 'Sem permissão' });
            }
            try {
                const updated = await service.updateLeadUtm(wsId, req.params.id, req.body || {});
                return reply.send(updated);
            } catch (e) {
                return reply.status(400).send({ error: e.message });
            }
        });

        // DELETE UTM (clear)
        authed.delete('/leads/:id/utm', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
            const wsId = req.leadUser.workspaceId;
            await service.clearLeadUtm(wsId, req.params.id);
            return reply.status(204).send();
        });
    });
}
