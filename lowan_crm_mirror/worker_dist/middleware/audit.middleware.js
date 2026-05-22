"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withAudit = withAudit;
const audit_1 = require("../utils/audit");
function withAudit(options) {
    return async (request, reply) => {
        const oldData = options.getOldData ? await options.getOldData(request) : undefined;
        const resourceId = options.getResourceId ? options.getResourceId(request) : undefined;
        reply.addHook('onSend', async (_req, _rep, payload) => {
            if (reply.statusCode >= 200 && reply.statusCode < 300) {
                await (0, audit_1.createAuditLog)({
                    userId: request.user?.id,
                    action: options.action,
                    resourceType: options.resourceType,
                    resourceId,
                    oldData,
                    newData: payload ? JSON.parse(payload) : undefined,
                    ipAddress: request.ip,
                    userAgent: request.headers['user-agent'],
                    correlationId: request.correlationId,
                });
            }
            return payload;
        });
    };
}
//# sourceMappingURL=audit.middleware.js.map