"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const database_1 = require("./config/database");
const redis_1 = require("./config/redis");
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const message_worker_1 = require("./queue/workers/message.worker");
const campaign_worker_1 = require("./queue/workers/campaign.worker");
const webhook_worker_1 = require("./queue/workers/webhook.worker");
const health_worker_1 = require("./queue/workers/health.worker");
const queues_1 = require("./queue/queues");
async function bootstrap() {
    logger_1.logger.info(`Starting WhatsApp Blast Workers [${env_1.env.NODE_ENV}]`);
    await (0, database_1.connectDatabase)();
    await (0, redis_1.connectRedis)();
    const messageWorker = (0, message_worker_1.createMessageWorker)();
    const campaignWorker = (0, campaign_worker_1.createCampaignWorker)();
    const webhookWorker = (0, webhook_worker_1.createWebhookWorker)();
    const healthWorker = (0, health_worker_1.createHealthWorker)();
    await (0, health_worker_1.scheduleHealthChecks)();
    (0, health_worker_1.scheduleDailyReset)();
    logger_1.logger.info('All workers running');
    const shutdown = async (signal) => {
        logger_1.logger.info(`Received ${signal}, shutting down workers...`);
        await Promise.all([
            messageWorker.close(),
            campaignWorker.close(),
            webhookWorker.close(),
            healthWorker.close(),
        ]);
        await (0, queues_1.closeAllQueues)();
        await (0, database_1.disconnectDatabase)();
        await (0, redis_1.disconnectRedis)();
        logger_1.logger.info('Workers shutdown complete');
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
bootstrap().catch((err) => {
    logger_1.logger.error({ err }, 'Failed to start workers');
    process.exit(1);
});
//# sourceMappingURL=worker.js.map