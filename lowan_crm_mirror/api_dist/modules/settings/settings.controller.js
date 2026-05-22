"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const zod_1 = require("zod");
const common_types_1 = require("../../types/common.types");
const updateSchema = zod_1.z.object({
    proxyUrl: zod_1.z.string().min(1).nullable(),
});
const testSchema = zod_1.z.object({
    proxyUrl: zod_1.z.string().min(1),
});
class SettingsController {
    service;
    constructor(service) {
        this.service = service;
    }
    async getSettings(_request, reply) {
        const proxyUrl = await this.service.getProxyUrl();
        return reply.send({ proxyUrl: proxyUrl ?? null });
    }
    async updateSettings(request, reply) {
        const body = updateSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        await this.service.setProxyUrl(body.data.proxyUrl);
        const proxyUrl = await this.service.getProxyUrl();
        return reply.send({ proxyUrl: proxyUrl ?? null });
    }
    async testProxy(request, reply) {
        const body = testSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        const result = await this.service.testProxy(body.data.proxyUrl);
        return reply.send(result);
    }
}
exports.SettingsController = SettingsController;
//# sourceMappingURL=settings.controller.js.map