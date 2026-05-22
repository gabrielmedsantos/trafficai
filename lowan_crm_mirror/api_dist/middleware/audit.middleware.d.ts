import { FastifyRequest, FastifyReply } from 'fastify';
type AuditOptions = {
    action: string;
    resourceType: string;
    getResourceId?: (req: FastifyRequest) => string | undefined;
    getOldData?: (req: FastifyRequest) => Promise<unknown>;
    getNewData?: (req: FastifyRequest, reply: FastifyReply) => unknown;
};
export declare function withAudit(options: AuditOptions): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export {};
//# sourceMappingURL=audit.middleware.d.ts.map