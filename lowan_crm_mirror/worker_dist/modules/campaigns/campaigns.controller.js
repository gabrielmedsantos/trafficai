"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignsController = void 0;
const campaigns_schema_1 = require("./campaigns.schema");
const common_types_1 = require("../../types/common.types");
class CampaignsController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(request, reply) {
        const query = campaigns_schema_1.listCampaignsSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        return reply.send(await this.service.list(query.data));
    }
    async getById(request, reply) {
        return reply.send(await this.service.getById(request.params.id));
    }
    async create(request, reply) {
        const body = campaigns_schema_1.createCampaignSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.status(201).send(await this.service.create(body.data, request.user.id));
    }
    async update(request, reply) {
        const body = campaigns_schema_1.updateCampaignSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.update(request.params.id, body.data, request.user.id));
    }
    async delete(request, reply) {
        await this.service.delete(request.params.id);
        return reply.status(204).send();
    }
    async start(request, reply) {
        return reply.send(await this.service.start(request.params.id, request.user.id));
    }
    async pause(request, reply) {
        return reply.send(await this.service.pause(request.params.id));
    }
    async resume(request, reply) {
        return reply.send(await this.service.resume(request.params.id, request.user.id));
    }
    async getStats(request, reply) {
        return reply.send(await this.service.getStats(request.params.id));
    }
    async getContacts(request, reply) {
        const page = Math.max(1, parseInt(request.query.page ?? '1'));
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50')));
        const status = request.query.status;
        return reply.send(await this.service.getContacts(request.params.id, page, limit, status));
    }
}
exports.CampaignsController = CampaignsController;
//# sourceMappingURL=campaigns.controller.js.map