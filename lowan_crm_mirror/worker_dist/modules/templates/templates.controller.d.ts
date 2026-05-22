import { FastifyRequest, FastifyReply } from 'fastify';
import { TemplatesService } from './templates.service';
export declare class TemplatesController {
    private readonly service;
    constructor(service: TemplatesService);
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
    resubmit(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    syncStatus(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    delete(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=templates.controller.d.ts.map