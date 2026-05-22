"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebhookWorker = createWebhookWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../config/redis");
const env_1 = require("../../config/env");
const logger_1 = require("../../config/logger");
const webhook_processor_1 = require("../../queue/processors/webhook.processor");
const queue_types_1 = require("../../types/queue.types");
function createWebhookWorker() {
    const worker = new bullmq_1.Worker(queue_types_1.QueueName.WebhookEvents, async (job) => {
        await (0, webhook_processor_1.processWebhookEvent)(job);
    }, {
        connection: redis_1.bullMQConnection,
        concurrency: env_1.env.QUEUE_WEBHOOK_CONCURRENCY,
    });
    worker.on('completed', (job) => {
        logger_1.logger.debug({ jobId: job.id, webhookId: job.data.webhookEventId }, 'Webhook event processed');
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ jobId: job?.id, err: err.message }, 'Webhook job failed');
    });
    worker.on('error', (err) => {
        logger_1.logger.error({ err }, 'Webhook worker error');
    });
    logger_1.logger.info({ concurrency: env_1.env.QUEUE_WEBHOOK_CONCURRENCY }, 'Webhook worker started');
    return worker;
}
//# sourceMappingURL=webhook.worker.js.map