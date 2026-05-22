import { Queue } from 'bullmq';
export declare const messageSendQueue: Queue<any, any, string, any, any, string>;
export declare const campaignRunnerQueue: Queue<any, any, string, any, any, string>;
export declare const webhookEventsQueue: Queue<any, any, string, any, any, string>;
export declare const healthCheckQueue: Queue<any, any, string, any, any, string>;
export declare function getQueue(name: string): Queue;
export declare function closeAllQueues(): Promise<void>;
//# sourceMappingURL=queues.d.ts.map