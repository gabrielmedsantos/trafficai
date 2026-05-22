import { z } from 'zod';
export declare const superLoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const superSetupSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
}, {
    email: string;
    password: string;
    name: string;
}>;
export declare const createWorkspaceSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodString;
    adminName: z.ZodString;
    adminEmail: z.ZodString;
    adminPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    slug: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
}, {
    name: string;
    slug: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
}>;
export declare const updateWorkspaceSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    isActive?: boolean | undefined;
}, {
    name?: string | undefined;
    isActive?: boolean | undefined;
}>;
export type SuperLoginInput = z.infer<typeof superLoginSchema>;
export type SuperSetupInput = z.infer<typeof superSetupSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
//# sourceMappingURL=super.schema.d.ts.map