"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTelegramBotSchema = exports.createTelegramBotSchema = void 0;
const zod_1 = require("zod");
exports.createTelegramBotSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    botToken: zod_1.z.string().min(20, 'Token inválido'),
});
exports.updateTelegramBotSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
});
//# sourceMappingURL=telegram.schema.js.map