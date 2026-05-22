import { z } from 'zod';
export declare const createContactSchema: z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodString;
    email: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    origin: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    optIn: z.ZodDefault<z.ZodBoolean>;
    optInAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    optInSource: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    customVariables: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    phone: string;
    optIn: boolean;
    tags: string[];
    customVariables: Record<string, string>;
    origin?: string | undefined;
    email?: string | null | undefined;
    notes?: string | undefined;
    optInAt?: string | null | undefined;
    optInSource?: string | undefined;
}, {
    name: string;
    phone: string;
    origin?: string | undefined;
    email?: string | null | undefined;
    notes?: string | undefined;
    optIn?: boolean | undefined;
    optInAt?: string | null | undefined;
    optInSource?: string | undefined;
    tags?: string[] | undefined;
    customVariables?: Record<string, string> | undefined;
}>;
export declare const updateContactSchema: z.ZodObject<Omit<{
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    origin: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    optIn: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    optInAt: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    optInSource: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    tags: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    customVariables: z.ZodOptional<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>>;
}, "phone">, "strip", z.ZodTypeAny, {
    origin?: string | undefined;
    email?: string | null | undefined;
    name?: string | undefined;
    notes?: string | undefined;
    optIn?: boolean | undefined;
    optInAt?: string | null | undefined;
    optInSource?: string | undefined;
    tags?: string[] | undefined;
    customVariables?: Record<string, string> | undefined;
}, {
    origin?: string | undefined;
    email?: string | null | undefined;
    name?: string | undefined;
    notes?: string | undefined;
    optIn?: boolean | undefined;
    optInAt?: string | null | undefined;
    optInSource?: string | undefined;
    tags?: string[] | undefined;
    customVariables?: Record<string, string> | undefined;
}>;
export declare const listContactsSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodString>;
    optIn: z.ZodOptional<z.ZodBoolean>;
    blacklisted: z.ZodOptional<z.ZodBoolean>;
    origin: z.ZodOptional<z.ZodString>;
    hasMessages: z.ZodOptional<z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    origin?: string | undefined;
    search?: string | undefined;
    optIn?: boolean | undefined;
    tags?: string | undefined;
    blacklisted?: boolean | undefined;
    hasMessages?: boolean | undefined;
}, {
    origin?: string | undefined;
    search?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    optIn?: boolean | undefined;
    tags?: string | undefined;
    blacklisted?: boolean | undefined;
    hasMessages?: "true" | "false" | undefined;
}>;
export declare const blacklistContactSchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
export declare const optInContactSchema: z.ZodObject<{
    source: z.ZodOptional<z.ZodString>;
    optInAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    optInAt?: string | undefined;
    source?: string | undefined;
}, {
    optInAt?: string | undefined;
    source?: string | undefined;
}>;
export declare const importCsvSchema: z.ZodObject<{
    optIn: z.ZodDefault<z.ZodBoolean>;
    optInSource: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodString>;
    origin: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    optIn: boolean;
    origin?: string | undefined;
    optInSource?: string | undefined;
    tags?: string | undefined;
}, {
    origin?: string | undefined;
    optIn?: boolean | undefined;
    optInSource?: string | undefined;
    tags?: string | undefined;
}>;
export declare const bulkOptInSchema: z.ZodObject<{
    tag: z.ZodString;
    source: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    tag: string;
    source?: string | undefined;
}, {
    tag: string;
    source?: string | undefined;
}>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsInput = z.infer<typeof listContactsSchema>;
export type BlacklistContactInput = z.infer<typeof blacklistContactSchema>;
export type OptInContactInput = z.infer<typeof optInContactSchema>;
export type ImportCsvInput = z.infer<typeof importCsvSchema>;
export type BulkOptInInput = z.infer<typeof bulkOptInSchema>;
//# sourceMappingURL=contacts.schema.d.ts.map