import { FastifyRequest, FastifyReply } from 'fastify';
import { TelegramService } from './telegram.service';
export declare class TelegramController {
    private readonly service;
    constructor(service: TelegramService);
    list(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    create(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    delete(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    check(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=telegram.controller.d.ts.map