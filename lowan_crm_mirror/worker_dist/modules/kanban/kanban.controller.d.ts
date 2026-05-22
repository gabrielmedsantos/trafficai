import { FastifyRequest, FastifyReply } from 'fastify';
import { KanbanService } from './kanban.service';
export declare class KanbanController {
    private readonly service;
    constructor(service: KanbanService);
    getBoard(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    createStage(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    updateStage(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    deleteStage(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    reorderStages(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    createRule(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    updateRule(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    deleteRule(request: FastifyRequest<{
        Params: {
            id: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=kanban.controller.d.ts.map