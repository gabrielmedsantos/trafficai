import { FastifyRequest, FastifyReply } from 'fastify';
import { ContactsService } from './contacts.service';
export declare class ContactsController {
    private readonly service;
    constructor(service: ContactsService);
    list(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    exportAll(request: FastifyRequest, reply: FastifyReply): Promise<never>;
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
    blacklist(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    removeFromBlacklist(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    optIn(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    optOut(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    bulkOptIn(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    getMessages(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getTags(_request: FastifyRequest, reply: FastifyReply): Promise<never>;
    importCsv(request: FastifyRequest, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=contacts.controller.d.ts.map