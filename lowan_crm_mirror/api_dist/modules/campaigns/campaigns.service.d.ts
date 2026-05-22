import type { CreateCampaignInput, UpdateCampaignInput, ListCampaignsInput } from './campaigns.schema';
export declare class CampaignsService {
    list(input: ListCampaignsInput): Promise<import("../../types/common.types").PaginatedResult<{
        sentCount: number;
        failedCount: number;
        deliveredCount: number;
        readCount: number;
        totalContacts: number;
        pauseReason: string | null;
        template: {
            status: import(".prisma/client").$Enums.TemplateStatus;
            id: string;
            name: string;
            language: string;
        };
        _count: {
            campaignContacts: number;
        };
        status: import(".prisma/client").$Enums.CampaignStatus;
        id: string;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        templateId: string;
        description: string | null;
        contactTags: import("@prisma/client/runtime/library").JsonValue;
        allowedConnectionIds: import("@prisma/client/runtime/library").JsonValue;
        contactFilter: import("@prisma/client/runtime/library").JsonValue | null;
        scheduledAt: Date | null;
        sendWindowStart: string | null;
        sendWindowEnd: string | null;
        timezone: string;
        maxMessagesPerContact: number;
        minIntervalSeconds: number;
        maxIntervalSeconds: number;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>>;
    getById(id: string): Promise<{
        template: {
            status: import(".prisma/client").$Enums.TemplateStatus;
            id: string;
            name: string;
            language: string;
            variablesCount: number;
        };
        _count: {
            messages: number;
            campaignContacts: number;
        };
        runs: {
            status: import(".prisma/client").$Enums.CampaignRunStatus;
            id: string;
            workspaceId: string | null;
            createdAt: Date;
            campaignId: string;
            startedAt: Date;
            finishedAt: Date | null;
            runNumber: number;
            totalJobs: number;
            processedJobs: number;
            failedJobs: number;
            triggeredById: string | null;
        }[];
    } & {
        status: import(".prisma/client").$Enums.CampaignStatus;
        id: string;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        templateId: string;
        description: string | null;
        contactTags: import("@prisma/client/runtime/library").JsonValue;
        allowedConnectionIds: import("@prisma/client/runtime/library").JsonValue;
        contactFilter: import("@prisma/client/runtime/library").JsonValue | null;
        scheduledAt: Date | null;
        sendWindowStart: string | null;
        sendWindowEnd: string | null;
        timezone: string;
        maxMessagesPerContact: number;
        minIntervalSeconds: number;
        maxIntervalSeconds: number;
        totalContacts: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
    create(input: CreateCampaignInput, userId: string): Promise<{
        status: import(".prisma/client").$Enums.CampaignStatus;
        id: string;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        templateId: string;
        description: string | null;
        contactTags: import("@prisma/client/runtime/library").JsonValue;
        allowedConnectionIds: import("@prisma/client/runtime/library").JsonValue;
        contactFilter: import("@prisma/client/runtime/library").JsonValue | null;
        scheduledAt: Date | null;
        sendWindowStart: string | null;
        sendWindowEnd: string | null;
        timezone: string;
        maxMessagesPerContact: number;
        minIntervalSeconds: number;
        maxIntervalSeconds: number;
        totalContacts: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
    update(id: string, input: UpdateCampaignInput, userId: string): Promise<{
        status: import(".prisma/client").$Enums.CampaignStatus;
        id: string;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        templateId: string;
        description: string | null;
        contactTags: import("@prisma/client/runtime/library").JsonValue;
        allowedConnectionIds: import("@prisma/client/runtime/library").JsonValue;
        contactFilter: import("@prisma/client/runtime/library").JsonValue | null;
        scheduledAt: Date | null;
        sendWindowStart: string | null;
        sendWindowEnd: string | null;
        timezone: string;
        maxMessagesPerContact: number;
        minIntervalSeconds: number;
        maxIntervalSeconds: number;
        totalContacts: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
        startedAt: Date | null;
        finishedAt: Date | null;
    }>;
    delete(id: string): Promise<void>;
    start(id: string, userId: string): Promise<{
        campaignId: string;
        runId: string;
        eligibleContacts: number;
    }>;
    pause(id: string): Promise<{
        campaignId: string;
        status: "PAUSED";
    }>;
    resume(id: string, userId: string): Promise<{
        campaignId: string;
        runId: string;
        eligibleContacts: number;
    }>;
    getStats(id: string): Promise<{
        statusBreakdown: {
            [k: string]: number;
        };
        topErrors: {
            code: string | null;
            count: number;
        }[];
        status?: import(".prisma/client").$Enums.CampaignStatus | undefined;
        totalContacts?: number | undefined;
        sentCount?: number | undefined;
        deliveredCount?: number | undefined;
        readCount?: number | undefined;
        failedCount?: number | undefined;
        startedAt?: Date | null | undefined;
        finishedAt?: Date | null | undefined;
    }>;
    getContacts(id: string, page: number, limit: number, status?: string): Promise<import("../../types/common.types").PaginatedResult<{
        message: {
            status: import(".prisma/client").$Enums.MessageStatus;
            wamid: string | null;
            errorCode: string | null;
            errorMessage: string | null;
            sentAt: Date | null;
            deliveredAt: Date | null;
            readAt: Date | null;
        } | null;
        status: import(".prisma/client").$Enums.CampaignContactStatus;
        id: string;
        contact: {
            id: string;
            name: string;
            phone: string;
        };
        skipReason: string | null;
        attemptCount: number;
        lastAttemptAt: Date | null;
    }>>;
    private countEligibleContacts;
}
//# sourceMappingURL=campaigns.service.d.ts.map