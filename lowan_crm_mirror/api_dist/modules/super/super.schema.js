"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWorkspaceSchema = exports.createWorkspaceSchema = exports.superSetupSchema = exports.superLoginSchema = void 0;
const zod_1 = require("zod");
exports.superLoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.superSetupSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});
exports.createWorkspaceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    slug: zod_1.z
        .string()
        .min(2)
        .max(100)
        .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
    adminName: zod_1.z.string().min(1).max(255),
    adminEmail: zod_1.z.string().email(),
    adminPassword: zod_1.z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});
exports.updateWorkspaceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
    isActive: zod_1.z.boolean().optional(),
});
//# sourceMappingURL=super.schema.js.map