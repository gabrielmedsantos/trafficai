"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramController = void 0;
const telegram_schema_1 = require("./telegram.schema");
const common_types_1 = require("../../types/common.types");
class TelegramController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(request, reply) {
        const { workspaceId } = request.leadUser;
        return reply.send(await this.service.list(workspaceId));
    }
    async create(request, reply) {
        const body = telegram_schema_1.createTelegramBotSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        const { id: userId, workspaceId } = request.leadUser;
        return reply.status(201).send(await this.service.create(body.data, userId, workspaceId));
    }
    async delete(request, reply) {
        const { workspaceId } = request.leadUser;
        return reply.send(await this.service.delete(request.params.id, workspaceId));
    }
    async check(request, reply) {
        const { workspaceId } = request.leadUser;
        return reply.send(await this.service.check(request.params.id, workspaceId));
    }
}
exports.TelegramController = TelegramController;
//# sourceMappingURL=telegram.controller.js.map