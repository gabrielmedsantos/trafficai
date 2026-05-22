"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuperController = void 0;
const super_schema_1 = require("./super.schema");
const common_types_1 = require("../../types/common.types");
class SuperController {
    service;
    constructor(service) {
        this.service = service;
    }
    async check(_request, reply) {
        return reply.send({ exists: await this.service.hasAnySuperAdmin() });
    }
    async setup(request, reply) {
        const body = super_schema_1.superSetupSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.setup(body.data));
    }
    async login(request, reply) {
        const body = super_schema_1.superLoginSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.login(body.data));
    }
    async listWorkspaces(_request, reply) {
        return reply.send(await this.service.listWorkspaces());
    }
    async createWorkspace(request, reply) {
        const body = super_schema_1.createWorkspaceSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.status(201).send(await this.service.createWorkspace(body.data));
    }
    async updateWorkspace(request, reply) {
        const body = super_schema_1.updateWorkspaceSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.updateWorkspace(request.params.id, body.data));
    }
    async deleteWorkspace(request, reply) {
        await this.service.deleteWorkspace(request.params.id);
        return reply.status(204).send();
    }
    async getWorkspace(request, reply) {
        return reply.send(await this.service.getWorkspace(request.params.id));
    }
    async getWorkspaceUsers(request, reply) {
        return reply.send(await this.service.getWorkspaceUsers(request.params.id));
    }
    async impersonateWorkspace(request, reply) {
        return reply.send(await this.service.impersonateWorkspace(request.params.id));
    }
}
exports.SuperController = SuperController;
//# sourceMappingURL=super.controller.js.map