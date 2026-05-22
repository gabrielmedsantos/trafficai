import { FastifyRequest, FastifyReply } from 'fastify';
import { WebhooksService } from './webhooks.service';
export declare class WebhooksController {
    private readonly service;
    constructor(service: WebhooksService);
    /**
     * GET /webhooks/meta
     * Meta envia hub.mode, hub.verify_token e hub.challenge para verificar o endpoint
     */
    verify(request: FastifyRequest<{
        Querystring: {
            'hub.mode': string;
            'hub.verify_token': string;
            'hub.challenge': string;
        };
    }>, reply: FastifyReply): Promise<never>;
    /**
     * POST /webhooks/meta
     * Recebe todos os eventos de status e mensagens da Meta
     */
    receive(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    /**
     * POST /webhooks/telegram/:connectionId
     * Recebe updates do Telegram para um bot específico.
     * Telegram exige resposta 200 em < 60s; processamos de forma assíncrona.
     */
    receiveTelegram(request: FastifyRequest<{
        Params: {
            connectionId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=webhooks.controller.d.ts.map