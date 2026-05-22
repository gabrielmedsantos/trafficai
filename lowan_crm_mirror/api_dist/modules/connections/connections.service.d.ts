import type { CreateConnectionInput, UpdateConnectionInput, UpdateConnectionStatusInput, ListConnectionsInput } from './connections.schema';
export declare class ConnectionsService {
    list(input: ListConnectionsInput, workspaceId?: string): Promise<import("../../types/common.types").PaginatedResult<{
        totalMessagesSent: number;
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        _count: {
            messages: number;
        };
        phoneNumberId: string;
        wabaId: string;
        priority: number;
        rateLimitPerMinute: number;
        rateLimitPerDay: number;
        healthScore: number;
        messagesSentToday: number;
        pausedUntil: Date | null;
        pausedReason: string | null;
        metaDisplayName: string | null;
        metaQualityRating: string | null;
    }>>;
    getById(id: string, workspaceId?: string): Promise<{
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        phoneNumberId: string;
        wabaId: string;
        webhookVerifyToken: string;
        priority: number;
        rateLimitPerMinute: number;
        rateLimitPerDay: number;
        healthScore: number;
        messagesSentToday: number;
        pausedUntil: Date | null;
        pausedReason: string | null;
        metaDisplayName: string | null;
        metaQualityRating: string | null;
    }>;
    create(input: CreateConnectionInput, userId: string, workspaceId?: string): Promise<{
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        name: string;
        createdAt: Date;
        phoneNumberId: string;
        wabaId: string;
        priority: number;
        rateLimitPerMinute: number;
        rateLimitPerDay: number;
    }>;
    update(id: string, input: UpdateConnectionInput, userId?: string, workspaceId?: string): Promise<{
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        name: string;
        updatedAt: Date;
        phoneNumberId: string;
        priority: number;
        rateLimitPerMinute: number;
        rateLimitPerDay: number;
    }>;
    updateStatus(id: string, input: UpdateConnectionStatusInput, workspaceId?: string): Promise<{
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        updatedAt: Date;
        pausedReason: string | null;
    }>;
    delete(id: string, workspaceId?: string | boolean, force?: boolean): Promise<{
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        phoneNumberId: string;
        wabaId: string;
        webhookVerifyToken: string;
        priority: number;
        rateLimitPerMinute: number;
        rateLimitPerDay: number;
        healthScore: number;
        messagesSentToday: number;
        pausedUntil: Date | null;
        pausedReason: string | null;
        metaDisplayName: string | null;
        metaQualityRating: string | null;
    }>;
    checkToken(id: string, workspaceId?: string): Promise<{
        valid: boolean;
        banned: boolean;
        blockReason: string | undefined;
        qualityRating: string | undefined;
        accountMode: string | undefined;
        messagingLimit: string | undefined;
        healthStatus: any;
        status: string;
        errorCode?: undefined;
        errorMessage?: undefined;
    } | {
        valid: boolean;
        banned: boolean | undefined;
        errorCode: number | undefined;
        errorMessage: string | undefined;
        blockReason?: undefined;
        qualityRating?: undefined;
        accountMode?: undefined;
        messagingLimit?: undefined;
        healthStatus?: undefined;
        status?: undefined;
    }>;
    getHealth(id: string, workspaceId?: string): Promise<{
        healthScore: number;
        status: string;
        lastCheck: string;
        sentToday: number;
        sentThisMinute: number;
        recentLogs: {
            status: import(".prisma/client").$Enums.ConnectionStatus;
            id: string;
            workspaceId: string | null;
            healthScore: number;
            connectionId: string;
            messagesSent: number;
            messagesFailed: number;
            lastErrorCode: string | null;
            lastErrorMessage: string | null;
            checkedAt: Date;
        }[];
        metaHealth: any;
    }>;
    /** Decrypts the access token — only call inside worker/service context, never expose via API */
    getDecryptedToken(id: string): Promise<string>;
}
//# sourceMappingURL=connections.service.d.ts.map