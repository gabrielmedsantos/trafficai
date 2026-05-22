"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessageWorker = createMessageWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../config/redis");
const env_1 = require("../../config/env");
const logger_1 = require("../../config/logger");
const message_processor_1 = require("../../queue/processors/message.processor");
const queue_types_1 = require("../../types/queue.types");
function createMessageWorker() {
    const worker = new bullmq_1.Worker(queue_types_1.QueueName.MessageSend, async (job) => {
        await (0, message_processor_1.processMessage)(job);
    }, {
        connection: redis_1.bullMQConnection,
        concurrency: env_1.env.QUEUE_MESSAGE_CONCURRENCY,
        limiter: {
            max: env_1.env.QUEUE_GLOBAL_RATE_MAX,
            duration: env_1.env.QUEUE_GLOBAL_RATE_DURATION_MS,
        },
        settings: {
            stalledInterval: 30000,
            maxStalledCount: 2,
        },
    });
    worker.on('completed', (job) => {
        logger_1.logger.debug({ jobId: job.id, contactId: job.data.contactId }, 'Message job completed');
    });
    worker.on('failed', (job, err) => {
        const isRetryable = err.message.startsWith('Retryable') ||
            err.message.startsWith('CAMPAIGN_PAUSED') ||
            err.message.startsWith('NO_CONNECTION') ||
            err.message.startsWith('OUTSIDE_SEND_WINDOW');
        logger_1.logger.warn({ jobId: job?.id, contactId: job?.data.contactId, err: err.message, retryable: isRetryable }, 'Message job failed');
    });
    worker.on('error', (err) => {
        logger_1.logger.error({ err }, 'Message worker error');
    });
    logger_1.logger.info({ concurrency: env_1.env.QUEUE_MESSAGE_CONCURRENCY }, 'Message worker started');
    return worker;
}
//# sourceMappingURL=message.worker.js.map