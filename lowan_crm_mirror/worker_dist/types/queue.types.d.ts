export interface MessageJobData {
    messageId: string;
    campaignId: string;
    campaignRunId: string;
    campaignContactId: string;
    contactId: string;
    templateId: string;
    connectionId?: string;
    variables: Record<string, string>;
    idempotencyKey: string;
    attempt: number;
}
export interface CampaignJobData {
    campaignId: string;
    campaignRunId: string;
    page: number;
    pageSize: number;
}
export interface WebhookJobData {
    webhookEventId?: string;
    rawPayload: unknown;
    receivedAt: string;
    type?: 'META' | 'TELEGRAM';
    connectionId?: string;
    workspaceId?: string | null;
}
export interface HealthCheckJobData {
    connectionId: string;
}
export declare enum QueueName {
    MessageSend = "message-send",
    CampaignRunner = "campaign-runner",
    WebhookEvents = "webhook-events",
    HealthCheck = "health-check"
}
//# sourceMappingURL=queue.types.d.ts.map