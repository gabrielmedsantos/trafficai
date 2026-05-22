"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const zod_1 = require("zod");
const common_types_1 = require("../../types/common.types");
const dateFilterSchema = zod_1.z.object({
    from: zod_1.z.string().datetime({ offset: true }).optional(),
    to: zod_1.z.string().datetime({ offset: true }).optional(),
});
class DashboardController {
    service;
    constructor(service) {
        this.service = service;
    }
    async getOverview(request, reply) {
        const query = dateFilterSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        return reply.send(await this.service.getOverview(query.data));
    }
    async getConnections(request, reply) {
        const query = dateFilterSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        return reply.send(await this.service.getConnectionsStats(query.data));
    }
    async getCampaign(request, reply) {
        const query = dateFilterSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        const stats = await this.service.getCampaignStats(request.params.id, query.data);
        if (!stats)
            throw common_types_1.HttpError.notFound('Campaign not found');
        return reply.send(stats);
    }
    async getThroughput(request, reply) {
        const query = dateFilterSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        return reply.send(await this.service.getThroughput(query.data));
    }
}
exports.DashboardController = DashboardController;
//# sourceMappingURL=dashboard.controller.js.map