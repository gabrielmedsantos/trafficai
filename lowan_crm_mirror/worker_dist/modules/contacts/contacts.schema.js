"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkOptInSchema = exports.importCsvSchema = exports.optInContactSchema = exports.blacklistContactSchema = exports.listContactsSchema = exports.updateContactSchema = exports.createContactSchema = void 0;
const zod_1 = require("zod");
exports.createContactSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    phone: zod_1.z.string().min(8).max(30),
    email: zod_1.z.string().email().optional().nullable(),
    origin: zod_1.z.string().max(100).optional(),
    notes: zod_1.z.string().max(2000).optional(),
    optIn: zod_1.z.boolean().default(false),
    optInAt: zod_1.z.string().datetime().optional().nullable(),
    optInSource: zod_1.z.string().max(255).optional(),
    tags: zod_1.z.array(zod_1.z.string().max(100)).default([]),
    customVariables: zod_1.z.record(zod_1.z.string()).default({}),
});
exports.updateContactSchema = exports.createContactSchema.partial().omit({ phone: true });
exports.listContactsSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    search: zod_1.z.string().optional(),
    tags: zod_1.z.string().optional(), // comma-separated
    optIn: zod_1.z.coerce.boolean().optional(),
    blacklisted: zod_1.z.coerce.boolean().optional(),
    origin: zod_1.z.string().optional(),
    hasMessages: zod_1.z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});
exports.blacklistContactSchema = zod_1.z.object({
    reason: zod_1.z.string().max(500).optional(),
});
exports.optInContactSchema = zod_1.z.object({
    source: zod_1.z.string().max(255).optional(),
    optInAt: zod_1.z.string().datetime().optional(),
});
exports.importCsvSchema = zod_1.z.object({
    optIn: zod_1.z.coerce.boolean().default(false),
    optInSource: zod_1.z.string().max(255).optional(),
    tags: zod_1.z.string().optional(), // comma-separated tags to apply to all
    origin: zod_1.z.string().max(100).optional(),
});
exports.bulkOptInSchema = zod_1.z.object({
    tag: zod_1.z.string().min(1).max(100),
    source: zod_1.z.string().max(255).optional(),
});
//# sourceMappingURL=contacts.schema.js.map