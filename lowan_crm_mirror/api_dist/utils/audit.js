"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
const database_1 = require("../config/database");
async function createAuditLog(params) {
    try {
        await database_1.prisma.auditLog.create({
            data: {
                userId: params.userId,
                action: params.action,
                resourceType: params.resourceType,
                resourceId: params.resourceId,
                oldData: params.oldData ? params.oldData : undefined,
                newData: params.newData ? params.newData : undefined,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                correlationId: params.correlationId,
            },
        });
    }
    catch {
        // Audit log não deve derrubar a operação principal
    }
}
//# sourceMappingURL=audit.js.map