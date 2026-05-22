"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionsController = void 0;
const connections_schema_1 = require("./connections.schema");
const common_types_1 = require("../../types/common.types");
class ConnectionsController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(request, reply) {
        const query = connections_schema_1.listConnectionsSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        const result = await this.service.list(query.data);
        return reply.send(result);
    }
    async getById(request, reply) {
        const result = await this.service.getById(request.params.id);
        return reply.send(result);
    }
    async create(request, reply) {
        const body = connections_schema_1.createConnectionSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        const result = await this.service.create(body.data, request.user.id);
        return reply.status(201).send(result);
    }
    async update(request, reply) {
        const body = connections_schema_1.updateConnectionSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        const result = await this.service.update(request.params.id, body.data, request.user.id);
        return reply.send(result);
    }
    async updateStatus(request, reply) {
        const body = connections_schema_1.updateConnectionStatusSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        const result = await this.service.updateStatus(request.params.id, body.data);
        return reply.send(result);
    }
    async delete(request, reply) {
        const force = request.query.force === 'true';
        try {
            await this.service.delete(request.params.id, force);
        }
        catch (err) {
            if (err && typeof err === 'object' && 'statusCode' in err)
                throw err;
            const msg = err instanceof Error ? err.message : 'Erro ao deletar conexão';
            throw common_types_1.HttpError.badRequest(msg, 'DELETE_FAILED');
        }
        return reply.status(204).send();
    }
    async getHealth(request, reply) {
        const result = await this.service.getHealth(request.params.id);
        return reply.send(result);
    }
    async checkToken(request, reply) {
        const result = await this.service.checkToken(request.params.id);
        return reply.send(result);
    }
}
exports.ConnectionsController = ConnectionsController;
//# sourceMappingURL=connections.controller.js.map