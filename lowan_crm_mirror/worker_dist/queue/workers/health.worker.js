"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthWorker = createHealthWorker;
exports.scheduleDailyReset = scheduleDailyReset;
exports.scheduleHealthChecks = scheduleHealthChecks;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../config/redis");
const env_1 = require("../../config/env");
const logger_1 = require("../../config/logger");
const health_processor_1 = require("../../queue/processors/health.processor");
const queues_1 = require("../../queue/queues");
const database_1 = require("../../config/database");
const queue_types_1 = require("../../types/queue.types");
function createHealthWorker() {
    const worker = new bullmq_1.Worker(queue_types_1.QueueName.HealthCheck, async (job) => {
        await (0, health_processor_1.processHealthCheck)(job);
    }, {
        connection: redis_1.bullMQConnection,
        concurrency: env_1.env.QUEUE_HEALTH_CONCURRENCY,
    });
    worker.on('error', (err) => {
        logger_1.logger.error({ err }, 'Health worker error');
    });
    logger_1.logger.info('Health worker started');
    return worker;
}
/**
 * Agenda reset diário do contador messagesSentToday à meia-noite.
 */
function scheduleDailyReset() {
    const scheduleNext = () => {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = midnight.getTime() - now.getTime();
        setTimeout(async () => {
            try {
                await database_1.prisma.whatsappConnection.updateMany({ data: { messagesSentToday: 0 } });
                logger_1.logger.info('Daily reset: messagesSentToday zeroed for all connections');
            }
            catch (err) {
                logger_1.logger.error({ err }, 'Daily reset failed');
            }
            setInterval(async () => {
                try {
                    await database_1.prisma.whatsappConnection.updateMany({ data: { messagesSentToday: 0 } });
                    logger_1.logger.info('Daily reset: messagesSentToday zeroed for all connections');
                }
                catch (err) {
                    logger_1.logger.error({ err }, 'Daily reset failed');
                }
            }, 24 * 60 * 60 * 1000);
        }, msUntilMidnight);
        logger_1.logger.info({ msUntilMidnight }, 'Daily reset scheduled');
    };
    scheduleNext();
}
/**
 * Agenda health checks periódicos para todas as conexões ativas.
 * Chamado uma vez na inicialização dos workers.
 */
async function scheduleHealthChecks() {
    const interval = env_1.env.HEALTH_CHECK_INTERVAL_MS;
    const enqueueAll = async () => {
        const connections = await database_1.prisma.whatsappConnection.findMany({
            where: { status: { in: ['ACTIVE', 'PAUSED'] } },
            select: { id: true },
        });
        for (const conn of connections) {
            await queues_1.healthCheckQueue.add(`health-${conn.id}`, { connectionId: conn.id }, {
                jobId: `health-${conn.id}-${Date.now()}`,
                removeOnComplete: true,
                removeOnFail: { age: 3600 },
            });
        }
    };
    await enqueueAll();
    setInterval(enqueueAll, interval);
    logger_1.logger.info({ intervalMs: interval }, 'Health checks scheduled');
}
//# sourceMappingURL=health.worker.js.map