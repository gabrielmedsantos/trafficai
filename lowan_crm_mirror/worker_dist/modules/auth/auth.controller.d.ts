import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly service;
    constructor(service: AuthService);
    login(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    refresh(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    logout(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    me(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    changePassword(request: FastifyRequest, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=auth.controller.d.ts.map