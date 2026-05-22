import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';
declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: {
            sub: string;
            email: string;
            role: UserRole;
        };
        user: {
            id: string;
            email: string;
            role: UserRole;
        };
    }
}
export declare function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function requireRole(...roles: UserRole[]): (request: FastifyRequest, _reply: FastifyReply) => Promise<void>;
//# sourceMappingURL=auth.middleware.d.ts.map