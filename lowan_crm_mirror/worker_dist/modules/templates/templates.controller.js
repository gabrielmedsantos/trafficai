"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplatesController = void 0;
const templates_schema_1 = require("./templates.schema");
const common_types_1 = require("../../types/common.types");
class TemplatesController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(request, reply) {
        const query = templates_schema_1.listTemplatesSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        return reply.send(await this.service.list(query.data));
    }
    async getById(request, reply) {
        return reply.send(await this.service.getById(request.params.id));
    }
    async create(request, reply) {
        const body = templates_schema_1.createTemplateSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.status(201).send(await this.service.create(body.data, request.user.id));
    }
    async update(request, reply) {
        const body = templates_schema_1.updateTemplateSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.update(request.params.id, body.data, request.user.id));
    }
    async resubmit(request, reply) {
        try {
            return reply.send(await this.service.resubmit(request.params.id));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to submit template to Meta';
            throw common_types_1.HttpError.badRequest(msg, 'RESUBMIT_FAILED');
        }
    }
    async syncStatus(request, reply) {
        try {
            return reply.send(await this.service.syncStatus(request.params.id));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to sync template status';
            throw common_types_1.HttpError.badRequest(msg, 'SYNC_FAILED');
        }
    }
    async delete(request, reply) {
        await this.service.delete(request.params.id);
        return reply.status(204).send();
    }
}
exports.TemplatesController = TemplatesController;
//# sourceMappingURL=templates.controller.js.map