import { z } from 'zod';
export declare const identifySchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const leadLoginSchema: z.ZodObject<{
    workspaceSlug: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    workspaceSlug: string;
}, {
    email: string;
    password: string;
    workspaceSlug: string;
}>;
export declare const setupLeadAdminSchema: z.ZodObject<{
    workspaceSlug: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
    workspaceSlug: string;
}, {
    email: string;
    password: string;
    name: string;
    workspaceSlug: string;
}>;
export declare const createLeadUserSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodDefault<z.ZodOptional<z.ZodEnum<["ADMIN", "COLLABORATOR"]>>>;
    permissions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
    role: "ADMIN" | "COLLABORATOR";
    permissions?: Record<string, unknown> | undefined;
}, {
    email: string;
    password: string;
    name: string;
    role?: "ADMIN" | "COLLABORATOR" | undefined;
    permissions?: Record<string, unknown> | undefined;
}>;
export declare const updateLeadUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
    role: z.ZodOptional<z.ZodEnum<["ADMIN", "COLLABORATOR"]>>;
    permissions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    password?: string | undefined;
    name?: string | undefined;
    role?: "ADMIN" | "COLLABORATOR" | undefined;
    isActive?: boolean | undefined;
    permissions?: Record<string, unknown> | undefined;
}, {
    email?: string | undefined;
    password?: string | undefined;
    name?: string | undefined;
    role?: "ADMIN" | "COLLABORATOR" | undefined;
    isActive?: boolean | undefined;
    permissions?: Record<string, unknown> | undefined;
}>;
export declare const createLeadSchema: z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodString;
    origin: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    assignedToId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    phone: string;
    origin?: string | undefined;
    notes?: string | undefined;
    assignedToId?: string | null | undefined;
}, {
    name: string;
    phone: string;
    origin?: string | undefined;
    notes?: string | undefined;
    assignedToId?: string | null | undefined;
}>;
export declare const updateLeadSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    origin: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<["disponivel", "pego", "em_andamento", "perdido"]>>;
    vendedor: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    assignedToId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    stageId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: "disponivel" | "pego" | "em_andamento" | "perdido" | undefined;
    origin?: string | null | undefined;
    name?: string | undefined;
    phone?: string | undefined;
    notes?: string | null | undefined;
    tags?: string[] | undefined;
    assignedToId?: string | null | undefined;
    stageId?: string | null | undefined;
    vendedor?: string | null | undefined;
}, {
    status?: "disponivel" | "pego" | "em_andamento" | "perdido" | undefined;
    origin?: string | null | undefined;
    name?: string | undefined;
    phone?: string | undefined;
    notes?: string | null | undefined;
    tags?: string[] | undefined;
    assignedToId?: string | null | undefined;
    stageId?: string | null | undefined;
    vendedor?: string | null | undefined;
}>;
export declare const importLeadsSchema: z.ZodObject<{
    assignedToId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    items: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        origin: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        phone: string;
        origin?: string | undefined;
        notes?: string | undefined;
    }, {
        name: string;
        phone: string;
        origin?: string | undefined;
        notes?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    items: {
        name: string;
        phone: string;
        origin?: string | undefined;
        notes?: string | undefined;
    }[];
    assignedToId?: string | null | undefined;
}, {
    items: {
        name: string;
        phone: string;
        origin?: string | undefined;
        notes?: string | undefined;
    }[];
    assignedToId?: string | null | undefined;
}>;
export declare const bulkAssignSchema: z.ZodObject<{
    leadIds: z.ZodArray<z.ZodString, "many">;
    assignedToId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    leadIds: string[];
    assignedToId?: string | null | undefined;
}, {
    leadIds: string[];
    assignedToId?: string | null | undefined;
}>;
export declare const redistributeSchema: z.ZodObject<{
    scope: z.ZodEnum<["all", "unassigned", "filtered"]>;
    userIds: z.ZodArray<z.ZodString, "many">;
    leadIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    scope: "all" | "unassigned" | "filtered";
    userIds: string[];
    limit?: number | undefined;
    leadIds?: string[] | undefined;
}, {
    scope: "all" | "unassigned" | "filtered";
    userIds: string[];
    limit?: number | undefined;
    leadIds?: string[] | undefined;
}>;
export declare const startConversationSchema: z.ZodObject<{
    connectionId: z.ZodString;
    templateName: z.ZodString;
    language: z.ZodString;
    variables: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    templateName: string;
    connectionId: string;
    language: string;
    variables: string[];
}, {
    templateName: string;
    connectionId: string;
    language: string;
    variables?: string[] | undefined;
}>;
export declare const updateProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    password?: string | undefined;
    name?: string | undefined;
}, {
    password?: string | undefined;
    name?: string | undefined;
}>;
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
export type RedistributeInput = z.infer<typeof redistributeSchema>;
export type LeadLoginInput = z.infer<typeof leadLoginSchema>;
export type SetupLeadAdminInput = z.infer<typeof setupLeadAdminSchema>;
export type CreateLeadUserInput = z.infer<typeof createLeadUserSchema>;
export type UpdateLeadUserInput = z.infer<typeof updateLeadUserSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ImportLeadsInput = z.infer<typeof importLeadsSchema>;
export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
//# sourceMappingURL=leads.schema.d.ts.map