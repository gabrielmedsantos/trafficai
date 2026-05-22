import { FastifyRequest, FastifyReply } from 'fastify';
import { CampaignsService } from './campaigns.service';
export declare class CampaignsController {
    private readonly service;
    constructor(service: CampaignsService);
    list(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    getById(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    create(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    update(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    delete(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    start(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    pause(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    resume(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getStats(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getContacts(request: FastifyRequest<{
        Params: {
            id: string;
        };
        Querystring: {
            page?: string;
            limit?: string;
            status?: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=campaigns.controller.d.ts.map