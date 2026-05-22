import { z } from 'zod';
export declare const createStageSchema: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    color: string;
}, {
    name: string;
    color?: string | undefined;
}>;
export declare const updateStageSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    color?: string | undefined;
}, {
    name?: string | undefined;
    color?: string | undefined;
}>;
export declare const reorderStagesSchema: z.ZodObject<{
    stageIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    stageIds: string[];
}, {
    stageIds: string[];
}>;
export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
export type ReorderStagesInput = z.infer<typeof reorderStagesSchema>;
//# sourceMappingURL=kanban.schema.d.ts.map