import { FastifyInstance } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        correlationId: string;
    }
}
declare function correlationPlugin(fastify: FastifyInstance): Promise<void>;
declare const _default: typeof correlationPlugin;
export default _default;
//# sourceMappingURL=correlation.middleware.d.ts.map