"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaignWorker = createCampaignWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../config/redis");
const env_1 = require("../../config/env");
const logger_1 = require("../../config/logger");
const campaign_processor_1 = require("../../queue/processors/campaign.processor");
const queue_types_1 = require("../../types/queue.types");
function createCampaignWorker() {
    const worker = new bullmq_1.Worker(queue_types_1.QueueName.CampaignRunner, async (job) => {
        await (0, campaign_processor_1.processCampaign)(job);
    }, {
        connection: redis_1.bullMQConnection,
        concurrency: env_1.env.QUEUE_CAMPAIGN_CONCURRENCY,
    });
    worker.on('completed', (job) => {
        logger_1.logger.debug({ jobId: job.id, campaignId: job.data.campaignId, page: job.data.page }, 'Campaign page processed');
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ jobId: job?.id, campaignId: job?.data.campaignId, err: err.message }, 'Campaign job failed');
    });
    worker.on('error', (err) => {
        logger_1.logger.error({ err }, 'Campaign worker error');
    });
    logger_1.logger.info({ concurrency: env_1.env.QUEUE_CAMPAIGN_CONCURRENCY }, 'Campaign worker started');
    return worker;
}
//# sourceMappingURL=campaign.worker.js.map