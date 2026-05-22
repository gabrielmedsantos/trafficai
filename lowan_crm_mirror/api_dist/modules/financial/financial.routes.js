"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = financialRoutes;
const leads_middleware_1 = require("../../modules/leads/leads.middleware");
const financial_service_1 = require("./financial.service");
const database_1 = require("../../config/database");
async function financialRoutes(app) {
    const svc = new financial_service_1.FinancialService();
    app.addHook('preHandler', leads_middleware_1.authenticateLeadUser);
    const ws = (req) => req.leadUser.workspaceId;
    const uid = (req) => req.leadUser.id;
    async function getUserName(req) {
        const user = await database_1.prisma.leadUser.findUnique({ where: { id: uid(req) }, select: { name: true } });
        return user?.name ?? 'Desconhecido';
    }
    // ── Types ───────────────────────────────────────────────────────────────────
    app.get('/types', async (req) => svc.listTypes(ws(req)));
    app.post('/types', { preHandler: [leads_middleware_1.requireLeadAdmin] }, async (req, reply) => {
        const { name } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'Nome obrigatório' });
        return reply.status(201).send(await svc.createType(ws(req), name.trim()));
    });
    app.put('/types/:id', { preHandler: [leads_middleware_1.requireLeadAdmin] }, async (req, reply) => {
        const { id } = req.params;
        const { name, active } = req.body;
        try {
            return reply.send(await svc.updateType(id, ws(req), { name, active }));
        }
        catch (e) {
            return reply.status(404).send({ error: e.message });
        }
    });
    app.delete('/types/:id', { preHandler: [leads_middleware_1.requireLeadAdmin] }, async (req, reply) => {
        const { id } = req.params;
        await svc.deleteType(id, ws(req));
        return reply.status(204).send();
    });
    // ── Commissions ─────────────────────────────────────────────────────────────
    app.get('/commissions', async (req) => svc.listCommissions(ws(req)));
    app.put('/commissions/:typeId', { preHandler: [leads_middleware_1.requireLeadAdmin] }, async (req, reply) => {
        const { typeId } = req.params;
        const { percentage, active } = req.body;
        return reply.send(await svc.upsertCommission(ws(req), typeId, parseFloat(percentage) || 0, active !== false));
    });
    // ── Ranking ─────────────────────────────────────────────────────────────────
    app.get('/ranking', async (req) => {
        const { period } = req.query;
        const p = period || new Date().toISOString().slice(0, 7);
        return svc.getRanking(ws(req), p);
    });
    // ── Goals ────────────────────────────────────────────────────────────────────
    app.get('/goals', async (req) => {
        const { period } = req.query;
        const p = period || new Date().toISOString().slice(0, 7);
        return svc.listGoals(ws(req), p);
    });
    app.put('/goals', { preHandler: [leads_middleware_1.requireLeadAdmin] }, async (req, reply) => {
        const body = req.body;
        if (!body.financialTypeId)
            return reply.status(400).send({ error: 'financialTypeId obrigatório' });
        if (!body.period)
            return reply.status(400).send({ error: 'period obrigatório' });
        return reply.send(await svc.upsertGoal(ws(req), {
            financialTypeId: body.financialTypeId,
            period: body.period,
            goalAmount: parseFloat(body.goalAmount) || 0,
            operatorId: body.operatorId,
            operatorName: body.operatorName,
        }));
    });
    app.delete('/goals/:goalId', { preHandler: [leads_middleware_1.requireLeadAdmin] }, async (req, reply) => {
        const { goalId } = req.params;
        await svc.deleteGoal(goalId, ws(req));
        return reply.status(204).send();
    });
    // ── Audit (admin only) ───────────────────────────────────────────────────────
    app.get('/audit', { preHandler: [leads_middleware_1.requireLeadAdmin] }, async (req) => {
        const { period } = req.query;
        const p = period || new Date().toISOString().slice(0, 7);
        return svc.getAudit(ws(req), p);
    });
    // ── Lead records ─────────────────────────────────────────────────────────────
    app.get('/lead/:leadId', async (req) => {
        const { leadId } = req.params;
        return svc.getLeadRecords(leadId, ws(req));
    });
    app.get('/lead/:leadId/summary', async (req) => {
        const { leadId } = req.params;
        return svc.getLeadSummary(leadId, ws(req));
    });
    app.post('/lead/:leadId', async (req, reply) => {
        const { leadId } = req.params;
        const { financialTypeId, amount, description } = req.body;
        if (!financialTypeId)
            return reply.status(400).send({ error: 'financialTypeId obrigatório' });
        if (amount == null || isNaN(parseFloat(amount)))
            return reply.status(400).send({ error: 'Valor inválido' });
        const userName = await getUserName(req);
        return reply.status(201).send(await svc.createLeadRecord(leadId, ws(req), uid(req), userName, {
            financialTypeId,
            amount: parseFloat(amount),
            description,
        }));
    });
    // ── Record delete ────────────────────────────────────────────────────────────
    app.delete('/record/:recId', async (req, reply) => {
        const { recId } = req.params;
        try {
            const userName = await getUserName(req);
            await svc.deleteLeadRecord(recId, ws(req), uid(req), userName);
            return reply.status(204).send();
        }
        catch (e) {
            return reply.status(404).send({ error: e.message });
        }
    });
}
//# sourceMappingURL=financial.routes.js.map