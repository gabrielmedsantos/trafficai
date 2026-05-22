"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAuthSchema = void 0;
exports.verifyAuthSchema = void 0;
exports.setStatusSchema = void 0;
const zod_1 = require("zod");

exports.startAuthSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    phone: zod_1.z.string().regex(/^\+[1-9]\d{8,14}$/, 'phone deve ser E.164 (+5511...)'),
});

exports.verifyAuthSchema = zod_1.z.object({
    sessionTempId: zod_1.z.string().min(16).max(64),
    code: zod_1.z.string().regex(/^\d{4,7}$/, 'código deve ter 4-7 dígitos'),
    password: zod_1.z.string().min(1).optional(),
});

exports.setStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACTIVE','PAUSED']),
    reason: zod_1.z.string().max(500).optional(),
});
