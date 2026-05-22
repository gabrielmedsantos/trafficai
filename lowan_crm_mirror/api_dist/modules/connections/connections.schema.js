"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listConnectionsSchema = exports.updateConnectionStatusSchema = exports.updateConnectionSchema = exports.createConnectionSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.createConnectionSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    phoneNumberId: zod_1.z.string().min(1).max(100),
    wabaId: zod_1.z.string().min(1).max(100),
    accessToken: zod_1.z.string().min(1),
    appSecret: zod_1.z.string().min(1).optional(),
    webhookVerifyToken: zod_1.z.string().min(8),
    priority: zod_1.z.number().int().min(1).max(10).default(1),
    rateLimitPerMinute: zod_1.z.number().int().min(1).max(1000).default(10),
    rateLimitPerDay: zod_1.z.number().int().min(1).max(100000).default(1000),
});
exports.updateConnectionSchema = exports.createConnectionSchema
    .partial()
    .extend({
    name: zod_1.z.string().min(1).max(255).optional(),
    appSecret: zod_1.z.string().min(1).nullable().optional(),
});
exports.updateConnectionStatusSchema = zod_1.z.object({
    status: zod_1.z.enum([
        client_1.ConnectionStatus.ACTIVE,
        client_1.ConnectionStatus.PAUSED,
        client_1.ConnectionStatus.INACTIVE,
    ]),
    reason: zod_1.z.string().max(500).optional(),
});
exports.listConnectionsSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    status: zod_1.z.nativeEnum(client_1.ConnectionStatus).optional(),
});
//# sourceMappingURL=connections.schema.js.map