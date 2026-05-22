import { FastifyRequest, FastifyReply } from 'fastify';
import { ConnectionsService } from './connections.service';
export declare class ConnectionsController {
    private readonly service;
    constructor(service: ConnectionsService);
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
    updateStatus(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    delete(request: FastifyRequest<{
        Params: {
            id: string;
        };
        Querystring: {
            force?: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getHealth(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    checkToken(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=connections.controller.d.ts.map