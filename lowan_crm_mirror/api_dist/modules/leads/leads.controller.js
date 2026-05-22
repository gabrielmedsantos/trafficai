"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadsController = void 0;
const leads_schema_1 = require("./leads.schema");
const common_types_1 = require("../../types/common.types");
class LeadsController {
    service;
    constructor(service) {
        this.service = service;
    }
    // ─── Auth ────────────────────────────────────────────────────────────────
    async setup(request, reply) {
        const body = leads_schema_1.setupLeadAdminSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.setup(body.data));
    }
    async identify(request, reply) {
        const body = leads_schema_1.identifySchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.identifyWorkspaces(body.data.email, body.data.password));
    }
    async login(request, reply) {
        const body = leads_schema_1.leadLoginSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.login(body.data));
    }
    async hasAnyUser(request, reply) {
        const { workspace } = request.query;
        return reply.send({ exists: await this.service.hasAnyUser(workspace) });
    }
    // ─── Users ───────────────────────────────────────────────────────────────
    async listUsers(request, reply) {
        return reply.send(await this.service.listUsers(request.leadUser.workspaceId));
    }
    async createUser(request, reply) {
        const body = leads_schema_1.createLeadUserSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.status(201).send(await this.service.createUser(body.data, request.leadUser.workspaceId));
    }
    async updateUser(request, reply) {
        const body = leads_schema_1.updateLeadUserSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.updateUser(request.params.id, body.data, request.leadUser.workspaceId, request.leadUser.id));
    }
    async deleteUser(request, reply) {
        await this.service.deleteUser(request.params.id, request.leadUser.workspaceId);
        return reply.status(204).send();
    }
    // ─── Leads ───────────────────────────────────────────────────────────────
    async list(request, reply) {
        const { id, role, workspaceId, permissions } = request.leadUser;
        const { since, search, withMessages } = request.query;
        const sinceDate = since ? new Date(since) : undefined;
        // withMessages=1 → inclui lastMessagePreview (usado pelo Inbox sidebar).
        // Default → preview=null (Leads/Kanban não exibem preview).
        const wantsPreview = withMessages === '1' || withMessages === 'true';
        return reply.send(await this.service.list(id, role, workspaceId, permissions, sinceDate, search?.trim() || undefined, wantsPreview));
    }
    async create(request, reply) {
        const body = leads_schema_1.createLeadSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        const { id: userId, role, workspaceId } = request.leadUser;
        return reply.status(201).send(await this.service.create(body.data, workspaceId, userId, role));
    }
    async update(request, reply) {
        const body = leads_schema_1.updateLeadSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        const { id: userId, role, workspaceId, permissions } = request.leadUser;
        return reply.send(await this.service.update(request.params.id, body.data, userId, role, workspaceId, permissions));
    }
    async delete(request, reply) {
        await this.service.delete(request.params.id, request.leadUser.workspaceId);
        return reply.status(204).send();
    }
    async bulkImport(request, reply) {
        const body = leads_schema_1.importLeadsSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.bulkImport(body.data, request.leadUser.workspaceId));
    }
    async report(request, reply) {
        const { from, to } = request.query;
        const now = new Date();
        const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
        const toDate = to ? new Date(to) : now;
        return reply.send(await this.service.report(fromDate, toDate, request.leadUser.workspaceId));
    }
    async bulkAssign(request, reply) {
        const body = leads_schema_1.bulkAssignSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.bulkAssign(body.data.leadIds, body.data.assignedToId ?? null, request.leadUser.workspaceId));
    }
    async redistribute(request, reply) {
        const body = leads_schema_1.redistributeSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.redistribute(body.data.scope, body.data.userIds, request.leadUser.workspaceId, body.data.leadIds, body.data.limit));
    }
    async getConversation(request, reply) {
        const { id: userId, role, workspaceId, permissions } = request.leadUser;
        return reply.send(await this.service.getConversation(request.params.id, userId, role, workspaceId, permissions));
    }
    async aiAssist(request, reply) {
        const { id: userId, role, workspaceId, permissions } = request.leadUser;
        return reply.send(await this.service.aiAssist(request.params.id, userId, role, workspaceId, permissions));
    }
    async getTagOptions(request, reply) {
        return reply.send(await this.service.getTagOptions(request.leadUser.workspaceId));
    }
    async createTagOption(request, reply) {
        const { tag } = request.body;
        if (!tag?.trim())
            return reply.status(400).send({ message: 'Tag obrigatória' });
        return reply.status(201).send(await this.service.createTagOption(request.leadUser.workspaceId, tag.trim()));
    }
    async deleteTagOption(request, reply) {
        const { tag } = request.params;
        return reply.send(await this.service.deleteTagOption(request.leadUser.workspaceId, decodeURIComponent(tag)));
    }
    async markAsRead(request, reply) {
        const { id: userId, role, workspaceId, permissions } = request.leadUser;
        return reply.send(await this.service.markAsRead(request.params.id, userId, role, workspaceId, permissions));
    }
    async sendReply(request, reply) {
        const { id: userId, role, workspaceId, permissions } = request.leadUser;
        const { text } = request.body;
        if (!text?.trim())
            throw common_types_1.HttpError.badRequest('Texto obrigatório');
        return reply.status(201).send(await this.service.sendReply(request.params.id, text.trim(), userId, role, workspaceId, permissions));
    }
    // ─── Dashboard ───────────────────────────────────────────────────────────
    async dashboardAdmin(request, reply) {
        const { from, to } = request.query;
        const fromDate = from ? new Date(from) : undefined;
        const toDate = to ? new Date(to) : undefined;
        return reply.send(await this.service.getDashboardAdmin(request.leadUser.workspaceId, fromDate, toDate));
    }
    async dashboardOperator(request, reply) {
        const { id, workspaceId } = request.leadUser;
        const { from, to } = request.query;
        const fromDate = from ? new Date(from) : undefined;
        const toDate = to ? new Date(to) : undefined;
        return reply.send(await this.service.getDashboardOperator(id, workspaceId, fromDate, toDate));
    }
    async listWorkspaces(request, reply) {
        const { id } = request.leadUser;
        return reply.send(await this.service.listWorkspaces(id));
    }
    async switchWorkspace(request, reply) {
        const { id } = request.leadUser;
        const { workspaceSlug } = request.body || {};
        return reply.send(await this.service.switchWorkspace(id, workspaceSlug));
    }
}
exports.LeadsController = LeadsController;
//# sourceMappingURL=leads.controller.js.map