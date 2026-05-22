"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KanbanController = void 0;
const kanban_schema_1 = require("./kanban.schema");
const common_types_1 = require("../../types/common.types");
class KanbanController {
    service;
    constructor(service) {
        this.service = service;
    }
    async getBoard(request, reply) {
        const { workspaceId } = request.leadUser;
        return reply.send(await this.service.getBoard(workspaceId));
    }
    async createStage(request, reply) {
        const { workspaceId } = request.leadUser;
        const body = kanban_schema_1.createStageSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.status(201).send(await this.service.createStage(workspaceId, body.data));
    }
    async updateStage(request, reply) {
        const { workspaceId } = request.leadUser;
        const body = kanban_schema_1.updateStageSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.updateStage(workspaceId, request.params.id, body.data));
    }
    async deleteStage(request, reply) {
        const { workspaceId } = request.leadUser;
        await this.service.deleteStage(workspaceId, request.params.id);
        return reply.status(204).send();
    }
    async reorderStages(request, reply) {
        const { workspaceId } = request.leadUser;
        const body = kanban_schema_1.reorderStagesSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        await this.service.reorderStages(workspaceId, body.data);
        return reply.send({ ok: true });
    }
    async createRule(request, reply) {
        const { workspaceId } = request.leadUser;
        return reply.status(201).send(await this.service.createRule(workspaceId, request.body));
    }
    async updateRule(request, reply) {
        const { workspaceId } = request.leadUser;
        return reply.send(await this.service.updateRule(workspaceId, request.params.id, request.body));
    }
    async deleteRule(request, reply) {
        const { workspaceId } = request.leadUser;
        await this.service.deleteRule(workspaceId, request.params.id);
        return reply.status(204).send();
    }
}
exports.KanbanController = KanbanController;
//# sourceMappingURL=kanban.controller.js.map