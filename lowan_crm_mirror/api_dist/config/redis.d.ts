import Redis from 'ioredis';
export declare const redis: Redis;
export declare const bullMQConnection: {
    host: string;
    port: number;
    password: string | undefined;
    db: number;
};
export declare const bullRedis: Redis;
export declare function connectRedis(): Promise<void>;
export declare function disconnectRedis(): Promise<void>;
export declare const RedisKeys: {
    rateConnMin: (id: string) => string;
    rateConnDay: (id: string) => string;
    rateGlobalMin: () => string;
    healthConn: (id: string) => string;
    queuePending: (id: string) => string;
    userSession: (userId: string) => string;
    campaignPause: (id: string) => string;
    connPaused: (id: string) => string;
    idempotency: (key: string) => string;
    connErrorCount: (id: string, type: string) => string;
    rateConnTplDay: (id: string) => string;
    leadsListCache: (workspaceId: string, scope: string) => string;
    dashboardAdminCache: (workspaceId: string, from: string, to: string) => string;
    dashboardOperatorCache: (userId: string, from: string, to: string) => string;
    kanbanCache: (workspaceId: string) => string;
};
//# sourceMappingURL=redis.d.ts.map