import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private readonly service;
    constructor(service: DashboardService);
    getOverview(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    getConnections(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    getCampaign(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getThroughput(request: FastifyRequest, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=dashboard.controller.d.ts.map