"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_schema_1 = require("./auth.schema");
const common_types_1 = require("../../types/common.types");
class AuthController {
    service;
    constructor(service) {
        this.service = service;
    }
    async login(request, reply) {
        const body = auth_schema_1.loginSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message, 'VALIDATION_ERROR');
        const result = await this.service.login(body.data);
        return reply.status(200).send(result);
    }
    async refresh(request, reply) {
        const body = auth_schema_1.refreshSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message, 'VALIDATION_ERROR');
        const result = await this.service.refresh(body.data.refreshToken);
        return reply.status(200).send(result);
    }
    async logout(request, reply) {
        await this.service.logout(request.user.id);
        return reply.status(204).send();
    }
    async me(request, reply) {
        const user = await this.service.getMe(request.user.id);
        return reply.status(200).send(user);
    }
    async changePassword(request, reply) {
        const body = auth_schema_1.changePasswordSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message, 'VALIDATION_ERROR');
        await this.service.changePassword(request.user.id, body.data.currentPassword, body.data.newPassword);
        return reply.status(204).send();
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map