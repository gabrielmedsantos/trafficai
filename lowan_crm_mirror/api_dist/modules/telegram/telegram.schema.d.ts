import { z } from 'zod';
export declare const createTelegramBotSchema: z.ZodObject<{
    name: z.ZodString;
    botToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    botToken: string;
}, {
    name: string;
    botToken: string;
}>;
export declare const updateTelegramBotSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
}, {
    name?: string | undefined;
}>;
export type CreateTelegramBotInput = z.infer<typeof createTelegramBotSchema>;
export type UpdateTelegramBotInput = z.infer<typeof updateTelegramBotSchema>;
//# sourceMappingURL=telegram.schema.d.ts.map