"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTemplatesSchema = exports.updateTemplateSchema = exports.createTemplateSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const templateVariableSchema = zod_1.z.object({
    index: zod_1.z.number().int().min(1),
    name: zod_1.z.string().min(1).max(100),
    example: zod_1.z.string().max(255).optional(),
});
const templateButtonSchema = zod_1.z.object({
    type: zod_1.z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
    text: zod_1.z.string().max(200),
    url: zod_1.z.string().url().optional(),
    phone_number: zod_1.z.string().optional(),
});
exports.createTemplateSchema = zod_1.z.object({
    metaTemplateId: zod_1.z.string().max(255).optional(),
    name: zod_1.z.string().min(1).max(255),
    language: zod_1.z.string().min(2).max(10),
    category: zod_1.z.nativeEnum(client_1.TemplateCategory),
    status: zod_1.z.nativeEnum(client_1.TemplateStatus).default(client_1.TemplateStatus.PENDING),
    headerType: zod_1.z.nativeEnum(client_1.TemplateHeaderType).optional().nullable(),
    headerContent: zod_1.z.string().max(2000).optional().nullable(),
    body: zod_1.z.string().min(1).max(1024),
    footer: zod_1.z.string().max(60).optional().nullable(),
    buttons: zod_1.z.array(templateButtonSchema).max(3).optional().nullable(),
    variables: zod_1.z.array(templateVariableSchema).default([]),
    connectionId: zod_1.z.string().uuid().optional().nullable(),
    connectionIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
exports.updateTemplateSchema = exports.createTemplateSchema.partial();
exports.listTemplatesSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    status: zod_1.z.nativeEnum(client_1.TemplateStatus).optional(),
    category: zod_1.z.nativeEnum(client_1.TemplateCategory).optional(),
    search: zod_1.z.string().optional(),
});
//# sourceMappingURL=templates.schema.js.map