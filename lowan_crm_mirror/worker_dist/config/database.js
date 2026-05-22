"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
const client_1 = require("@prisma/client");
const logger_1 = require("./logger");
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
        ],
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;
exports.prisma.$on('error', (e) => {
    logger_1.logger.error({ err: e }, 'Prisma error');
});
exports.prisma.$on('warn', (e) => {
    logger_1.logger.warn({ msg: e.message }, 'Prisma warning');
});
async function connectDatabase() {
    try {
        await exports.prisma.$connect();
        logger_1.logger.info('Database connected');
    }
    catch (error) {
        logger_1.logger.error({ err: error }, 'Failed to connect to database');
        throw error;
    }
}
async function disconnectDatabase() {
    await exports.prisma.$disconnect();
    logger_1.logger.info('Database disconnected');
}
//# sourceMappingURL=database.js.map