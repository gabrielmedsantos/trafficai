"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCampaignsSchema = exports.updateCampaignSchema = exports.createCampaignSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const campaignBaseSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().max(2000).optional(),
    templateId: zod_1.z.string().uuid(),
    contactTags: zod_1.z.array(zod_1.z.string().max(100)).default([]),
    allowedConnectionIds: zod_1.z.array(zod_1.z.string().uuid()).default([]),
    contactFilter: zod_1.z.record(zod_1.z.unknown()).optional(),
    scheduledAt: zod_1.z.string().datetime().optional().nullable(),
    sendWindowStart: zod_1.z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:MM')
        .optional()
        .nullable(),
    sendWindowEnd: zod_1.z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:MM')
        .optional()
        .nullable(),
    timezone: zod_1.z.string().default('America/Sao_Paulo'),
    maxMessagesPerContact: zod_1.z.number().int().min(1).max(10).default(1),
    minIntervalSeconds: zod_1.z.number().int().min(0).max(3600).default(1),
    maxIntervalSeconds: zod_1.z.number().int().min(0).max(3600).default(5),
});
exports.createCampaignSchema = campaignBaseSchema.refine((data) => {
    if (data.sendWindowStart && data.sendWindowEnd) {
        return data.sendWindowStart < data.sendWindowEnd;
    }
    return true;
}, { message: 'sendWindowStart must be before sendWindowEnd', path: ['sendWindowStart'] }).refine((data) => data.minIntervalSeconds <= data.maxIntervalSeconds, { message: 'minIntervalSeconds must be <= maxIntervalSeconds', path: ['minIntervalSeconds'] });
exports.updateCampaignSchema = campaignBaseSchema.partial();
exports.listCampaignsSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    status: zod_1.z.nativeEnum(client_1.CampaignStatus).optional(),
    search: zod_1.z.string().optional(),
});
//# sourceMappingURL=campaigns.schema.js.map