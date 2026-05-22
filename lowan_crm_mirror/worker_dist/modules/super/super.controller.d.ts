import { FastifyRequest, FastifyReply } from 'fastify';
import { SuperService } from './super.service';
export declare class SuperController {
    private readonly service;
    constructor(service: SuperService);
    check(_request: FastifyRequest, reply: FastifyReply): Promise<never>;
    setup(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    login(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    listWorkspaces(_request: FastifyRequest, reply: FastifyReply): Promise<never>;
    createWorkspace(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    updateWorkspace(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    deleteWorkspace(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getWorkspace(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getWorkspaceUsers(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    impersonateWorkspace(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=super.controller.d.ts.map