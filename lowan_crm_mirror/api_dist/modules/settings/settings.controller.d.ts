import { FastifyRequest, FastifyReply } from 'fastify';
import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly service;
    constructor(service: SettingsService);
    getSettings(_request: FastifyRequest, reply: FastifyReply): Promise<never>;
    updateSettings(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    testProxy(request: FastifyRequest, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=settings.controller.d.ts.map