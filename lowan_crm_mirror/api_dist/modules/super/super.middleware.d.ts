import { FastifyRequest, FastifyReply } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        superAdmin?: {
            id: string;
        };
    }
}
export declare function authenticateSuperAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void>;
//# sourceMappingURL=super.middleware.d.ts.map