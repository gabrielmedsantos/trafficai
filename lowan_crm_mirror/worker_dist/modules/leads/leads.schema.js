"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfileSchema = exports.startConversationSchema = exports.redistributeSchema = exports.bulkAssignSchema = exports.importLeadsSchema = exports.updateLeadSchema = exports.createLeadSchema = exports.updateLeadUserSchema = exports.createLeadUserSchema = exports.setupLeadAdminSchema = exports.leadLoginSchema = exports.identifySchema = void 0;
const zod_1 = require("zod");
// ─── Auth ─────────────────────────────────────────────────────────────────────
exports.identifySchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.leadLoginSchema = zod_1.z.object({
    workspaceSlug: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.setupLeadAdminSchema = zod_1.z.object({
    workspaceSlug: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1).max(255),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});
// ─── Users ────────────────────────────────────────────────────────────────────
exports.createLeadUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
    role: zod_1.z.enum(['ADMIN', 'COLLABORATOR']).optional().default('COLLABORATOR'),
    permissions: zod_1.z.record(zod_1.z.unknown()).optional(),
});
exports.updateLeadUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(6).optional(),
    isActive: zod_1.z.boolean().optional(),
    role: zod_1.z.enum(['ADMIN', 'COLLABORATOR']).optional(),
    permissions: zod_1.z.record(zod_1.z.unknown()).optional(),
});
// ─── Leads ────────────────────────────────────────────────────────────────────
exports.createLeadSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    phone: zod_1.z.string().min(1).max(30),
    origin: zod_1.z.string().max(255).optional(),
    notes: zod_1.z.string().optional(),
    assignedToId: zod_1.z.string().uuid().optional().nullable(),
});
exports.updateLeadSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
    phone: zod_1.z.string().min(1).max(30).optional(),
    origin: zod_1.z.string().max(255).optional().nullable(),
    notes: zod_1.z.string().optional().nullable(),
    status: zod_1.z.enum(['disponivel', 'pego', 'em_andamento', 'perdido']).optional(),
    vendedor: zod_1.z.string().max(255).optional().nullable(),
    assignedToId: zod_1.z.string().uuid().optional().nullable(),
    stageId: zod_1.z.string().uuid().optional().nullable(),
    tags: zod_1.z.array(zod_1.z.string().max(50)).max(20).optional(),
});
exports.importLeadsSchema = zod_1.z.object({
    assignedToId: zod_1.z.string().uuid().optional().nullable(),
    items: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1).max(255),
        phone: zod_1.z.string().min(1).max(30),
        origin: zod_1.z.string().max(255).optional(),
        notes: zod_1.z.string().optional(),
    })),
});
exports.bulkAssignSchema = zod_1.z.object({
    leadIds: zod_1.z.array(zod_1.z.string().uuid()).min(1),
    assignedToId: zod_1.z.string().uuid().optional().nullable(),
});
exports.redistributeSchema = zod_1.z.object({
    scope: zod_1.z.enum(['all', 'unassigned', 'filtered']),
    userIds: zod_1.z.array(zod_1.z.string().uuid()).min(1),
    leadIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    limit: zod_1.z.number().int().positive().optional(),
});
// ─── Conversation ─────────────────────────────────────────────────────────────
exports.startConversationSchema = zod_1.z.object({
    connectionId: zod_1.z.string().uuid(),
    templateName: zod_1.z.string().min(1),
    language: zod_1.z.string().min(1),
    variables: zod_1.z.array(zod_1.z.string()).optional().default([]),
});
// ─── Profile ──────────────────────────────────────────────────────────────────
exports.updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
    password: zod_1.z.string().min(6).optional(),
});
//# sourceMappingURL=leads.schema.js.map