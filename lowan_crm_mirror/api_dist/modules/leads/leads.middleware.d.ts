import { FastifyRequest, FastifyReply } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        leadUser?: {
            id: string;
            role: 'ADMIN' | 'COLLABORATOR';
            workspaceId: string;
            permissions?: Record<string, boolean>;
        };
    }
}
export declare function authenticateLeadUser(request: FastifyRequest, _reply: FastifyReply): Promise<void>;
export declare function requireLeadAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void>;
export declare function requirePermission(key: string): (request: FastifyRequest, _reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=leads.middleware.d.ts.map