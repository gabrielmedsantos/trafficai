"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reorderStagesSchema = exports.updateStageSchema = exports.createStageSchema = void 0;
const zod_1 = require("zod");
exports.createStageSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    color: zod_1.z.string().max(20).optional().default('#94a3b8'),
});
exports.updateStageSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
    color: zod_1.z.string().max(20).optional(),
});
exports.reorderStagesSchema = zod_1.z.object({
    stageIds: zod_1.z.array(zod_1.z.string().uuid()).min(1),
});
//# sourceMappingURL=kanban.schema.js.map