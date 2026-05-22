"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheckQueue = exports.webhookEventsQueue = exports.campaignRunnerQueue = exports.messageSendQueue = void 0;
exports.getQueue = getQueue;
exports.closeAllQueues = closeAllQueues;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const queue_types_1 = require("../types/queue.types");
const defaultJobOptions = {
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 },
};
const queues = new Map();
function createQueue(name, options) {
    const q = new bullmq_1.Queue(name, {
        connection: redis_1.bullMQConnection,
        defaultJobOptions,
        ...options,
    });
    queues.set(name, q);
    return q;
}
// Initialize all queues
exports.messageSendQueue = createQueue(queue_types_1.QueueName.MessageSend);
exports.campaignRunnerQueue = createQueue(queue_types_1.QueueName.CampaignRunner);
exports.webhookEventsQueue = createQueue(queue_types_1.QueueName.WebhookEvents);
exports.healthCheckQueue = createQueue(queue_types_1.QueueName.HealthCheck);
function getQueue(name) {
    const q = queues.get(name);
    if (!q)
        throw new Error(`Queue "${name}" not found`);
    return q;
}
async function closeAllQueues() {
    await Promise.all([...queues.values()].map((q) => q.close()));
}
//# sourceMappingURL=queues.js.map