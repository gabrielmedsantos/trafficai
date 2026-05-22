import { Job } from 'bullmq';
import type { WebhookJobData } from '../../types/queue.types';
export declare function processWebhookEvent(job: Job<WebhookJobData>): Promise<void>;
//# sourceMappingURL=webhook.processor.d.ts.map