import { z } from 'zod';
export declare const createConnectionSchema: z.ZodObject<{
    name: z.ZodString;
    phoneNumberId: z.ZodString;
    wabaId: z.ZodString;
    accessToken: z.ZodString;
    appSecret: z.ZodOptional<z.ZodString>;
    webhookVerifyToken: z.ZodString;
    priority: z.ZodDefault<z.ZodNumber>;
    rateLimitPerMinute: z.ZodDefault<z.ZodNumber>;
    rateLimitPerDay: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    phoneNumberId: string;
    wabaId: string;
    accessToken: string;
    webhookVerifyToken: string;
    priority: number;
    rateLimitPerMinute: number;
    rateLimitPerDay: number;
    appSecret?: string | undefined;
}, {
    name: string;
    phoneNumberId: string;
    wabaId: string;
    accessToken: string;
    webhookVerifyToken: string;
    appSecret?: string | undefined;
    priority?: number | undefined;
    rateLimitPerMinute?: number | undefined;
    rateLimitPerDay?: number | undefined;
}>;
export declare const updateConnectionSchema: z.ZodObject<{
    phoneNumberId: z.ZodOptional<z.ZodString>;
    wabaId: z.ZodOptional<z.ZodString>;
    accessToken: z.ZodOptional<z.ZodString>;
    webhookVerifyToken: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    rateLimitPerMinute: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    rateLimitPerDay: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
} & {
    name: z.ZodOptional<z.ZodString>;
    appSecret: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    phoneNumberId?: string | undefined;
    wabaId?: string | undefined;
    accessToken?: string | undefined;
    appSecret?: string | null | undefined;
    webhookVerifyToken?: string | undefined;
    priority?: number | undefined;
    rateLimitPerMinute?: number | undefined;
    rateLimitPerDay?: number | undefined;
}, {
    name?: string | undefined;
    phoneNumberId?: string | undefined;
    wabaId?: string | undefined;
    accessToken?: string | undefined;
    appSecret?: string | null | undefined;
    webhookVerifyToken?: string | undefined;
    priority?: number | undefined;
    rateLimitPerMinute?: number | undefined;
    rateLimitPerDay?: number | undefined;
}>;
export declare const updateConnectionStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["ACTIVE", "PAUSED", "INACTIVE"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "PAUSED" | "INACTIVE";
    reason?: string | undefined;
}, {
    status: "ACTIVE" | "PAUSED" | "INACTIVE";
    reason?: string | undefined;
}>;
export declare const listConnectionsSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    status: z.ZodOptional<z.ZodNativeEnum<{
        ACTIVE: "ACTIVE";
        PAUSED: "PAUSED";
        ERROR: "ERROR";
        INACTIVE: "INACTIVE";
    }>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "ACTIVE" | "PAUSED" | "INACTIVE" | "ERROR" | undefined;
}, {
    status?: "ACTIVE" | "PAUSED" | "INACTIVE" | "ERROR" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
export type UpdateConnectionStatusInput = z.infer<typeof updateConnectionStatusSchema>;
export type ListConnectionsInput = z.infer<typeof listConnectionsSchema>;
//# sourceMappingURL=connections.schema.d.ts.map