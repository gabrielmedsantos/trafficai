import { FastifyRequest, FastifyReply } from 'fastify';
import { LeadsService } from './leads.service';
export declare class LeadsController {
    private readonly service;
    constructor(service: LeadsService);
    setup(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    identify(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    login(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    hasAnyUser(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    listUsers(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    createUser(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    updateUser(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    deleteUser(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    list(request: FastifyRequest, reply: FastifyReply): Promise<never>;
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
    bulkImport(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    report(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    bulkAssign(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    redistribute(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    getConversation(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    aiAssist(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getTagOptions(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    createTagOption(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    deleteTagOption(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    markAsRead(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    sendReply(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    dashboardAdmin(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashboardOperator(request: FastifyRequest, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=leads.controller.d.ts.map