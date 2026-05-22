"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const database_1 = require("./config/database");
const redis_1 = require("./config/redis");
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
async function bootstrap() {
    logger_1.logger.info(`Starting WhatsApp Blast API [${env_1.env.NODE_ENV}]`);
    // Connect dependencies
    await (0, database_1.connectDatabase)();
    await (0, redis_1.connectRedis)();
    // Build Fastify app
    const app = await (0, app_1.buildApp)();
    // Start server
    await app.listen({ port: env_1.env.PORT, host: env_1.env.HOST });
    logger_1.logger.info(`Server listening on ${env_1.env.HOST}:${env_1.env.PORT}`);
    // Graceful shutdown
    const shutdown = async (signal) => {
        logger_1.logger.info(`Received ${signal}, shutting down...`);
        await app.close();
        await (0, database_1.disconnectDatabase)();
        await (0, redis_1.disconnectRedis)();
        logger_1.logger.info('Shutdown complete');
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
bootstrap().catch((err) => {
    logger_1.logger.error({ err }, 'Failed to start server');
    process.exit(1);
});
//# sourceMappingURL=server.js.map