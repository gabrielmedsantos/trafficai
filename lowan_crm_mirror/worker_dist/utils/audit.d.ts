interface CreateAuditLogParams {
    userId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    oldData?: unknown;
    newData?: unknown;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
}
export declare function createAuditLog(params: CreateAuditLogParams): Promise<void>;
export {};
//# sourceMappingURL=audit.d.ts.map