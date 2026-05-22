interface DateFilter {
    from?: string;
    to?: string;
}
export declare class DashboardService {
    getOverview(filter?: DateFilter): Promise<{
        connections: {
            total: number;
            active: number;
            inactive: number;
        };
        contacts: {
            total: number;
            optIn: number;
            blacklisted: number;
        };
        campaigns: {
            total: number;
            byStatus: {
                [k: string]: number;
            };
        };
        messages: {
            total: number;
            sent: number;
            delivered: number;
            read: number;
            failed: number;
            deliveryRate: string;
            readRate: string;
        };
        topErrors: {
            code: string | null;
            count: number;
        }[];
    }>;
    getConnectionsStats(filter?: DateFilter): Promise<{
        stats: {
            totalMessages: number;
            sent: number;
            delivered: number;
            read: number;
            failed: number;
            deliveryRate: string;
        };
        realtime: {
            sentThisMinute: number;
            sentToday: number;
            queuePending: number;
        };
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        name: string;
        phoneNumberId: string;
        priority: number;
        rateLimitPerMinute: number;
        rateLimitPerDay: number;
        healthScore: number;
        messagesSentToday: number;
        metaQualityRating: string | null;
    }[]>;
    getCampaignStats(campaignId: string, filter?: DateFilter): Promise<{
        statusBreakdown: {
            [k: string]: number;
        };
        throughputTimeline: {
            hour: Date;
            count: number;
        }[];
        topErrors: {
            code: string | null;
            count: number;
        }[];
        status: import(".prisma/client").$Enums.CampaignStatus;
        id: string;
        name: string;
        totalContacts: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
        startedAt: Date | null;
        finishedAt: Date | null;
    } | null>;
    getThroughput(filter?: DateFilter): Promise<{
        connectionId: string | null;
        name: string;
        phoneNumberId: string;
        messageCount: number;
    }[]>;
}
export {};
//# sourceMappingURL=dashboard.service.d.ts.map