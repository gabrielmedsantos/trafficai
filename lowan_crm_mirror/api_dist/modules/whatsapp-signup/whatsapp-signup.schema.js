"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSignupSchema = void 0;
exports.completeSignupSchema = void 0;
const zod_1 = require("zod");

// 1. /start — recebe code do FB.login + IDs do postMessage WA_EMBEDDED_SIGNUP
exports.startSignupSchema = zod_1.z.object({
    code: zod_1.z.string().min(10),
    phoneNumberId: zod_1.z.string().min(1).max(100),
    wabaId: zod_1.z.string().min(1).max(100),
    businessId: zod_1.z.string().max(100).optional(),
});

// 2. /complete — usuário confirmou preview, traz sessionId + name + PIN
exports.completeSignupSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(16).max(128),
    name: zod_1.z.string().min(1).max(255),
    pin: zod_1.z.string().regex(/^\d{6}$/, 'PIN deve ter exatamente 6 dígitos'),
});
//# sourceMappingURL=whatsapp-signup.schema.js.map
