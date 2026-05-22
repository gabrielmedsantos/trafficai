import { z } from 'zod';
export declare const createTemplateSchema: z.ZodObject<{
    metaTemplateId: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    language: z.ZodString;
    category: z.ZodNativeEnum<{
        MARKETING: "MARKETING";
        UTILITY: "UTILITY";
        AUTHENTICATION: "AUTHENTICATION";
    }>;
    status: z.ZodDefault<z.ZodNativeEnum<{
        APPROVED: "APPROVED";
        PENDING: "PENDING";
        REJECTED: "REJECTED";
        DISABLED: "DISABLED";
    }>>;
    headerType: z.ZodNullable<z.ZodOptional<z.ZodNativeEnum<{
        TEXT: "TEXT";
        IMAGE: "IMAGE";
        VIDEO: "VIDEO";
        DOCUMENT: "DOCUMENT";
    }>>>;
    headerContent: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    body: z.ZodString;
    footer: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    buttons: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["QUICK_REPLY", "URL", "PHONE_NUMBER"]>;
        text: z.ZodString;
        url: z.ZodOptional<z.ZodString>;
        phone_number: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
        text: string;
        url?: string | undefined;
        phone_number?: string | undefined;
    }, {
        type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
        text: string;
        url?: string | undefined;
        phone_number?: string | undefined;
    }>, "many">>>;
    variables: z.ZodDefault<z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        name: z.ZodString;
        example: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        index: number;
        example?: string | undefined;
    }, {
        name: string;
        index: number;
        example?: string | undefined;
    }>, "many">>;
    connectionId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    connectionIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status: "APPROVED" | "REJECTED" | "DISABLED" | "PENDING";
    body: string;
    name: string;
    language: string;
    category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
    variables: {
        name: string;
        index: number;
        example?: string | undefined;
    }[];
    connectionId?: string | null | undefined;
    metaTemplateId?: string | undefined;
    headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null | undefined;
    headerContent?: string | null | undefined;
    footer?: string | null | undefined;
    buttons?: {
        type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
        text: string;
        url?: string | undefined;
        phone_number?: string | undefined;
    }[] | null | undefined;
    connectionIds?: string[] | undefined;
}, {
    body: string;
    name: string;
    language: string;
    category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
    status?: "APPROVED" | "REJECTED" | "DISABLED" | "PENDING" | undefined;
    connectionId?: string | null | undefined;
    metaTemplateId?: string | undefined;
    headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null | undefined;
    headerContent?: string | null | undefined;
    footer?: string | null | undefined;
    buttons?: {
        type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
        text: string;
        url?: string | undefined;
        phone_number?: string | undefined;
    }[] | null | undefined;
    variables?: {
        name: string;
        index: number;
        example?: string | undefined;
    }[] | undefined;
    connectionIds?: string[] | undefined;
}>;
export declare const updateTemplateSchema: z.ZodObject<{
    metaTemplateId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    name: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodNativeEnum<{
        MARKETING: "MARKETING";
        UTILITY: "UTILITY";
        AUTHENTICATION: "AUTHENTICATION";
    }>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodNativeEnum<{
        APPROVED: "APPROVED";
        PENDING: "PENDING";
        REJECTED: "REJECTED";
        DISABLED: "DISABLED";
    }>>>;
    headerType: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNativeEnum<{
        TEXT: "TEXT";
        IMAGE: "IMAGE";
        VIDEO: "VIDEO";
        DOCUMENT: "DOCUMENT";
    }>>>>;
    headerContent: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    body: z.ZodOptional<z.ZodString>;
    footer: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    buttons: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["QUICK_REPLY", "URL", "PHONE_NUMBER"]>;
        text: z.ZodString;
        url: z.ZodOptional<z.ZodString>;
        phone_number: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
        text: string;
        url?: string | undefined;
        phone_number?: string | undefined;
    }, {
        type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
        text: string;
        url?: string | undefined;
        phone_number?: string | undefined;
    }>, "many">>>>;
    variables: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        name: z.ZodString;
        example: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        index: number;
        example?: string | undefined;
    }, {
        name: string;
        index: number;
        example?: string | undefined;
    }>, "many">>>;
    connectionId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    connectionIds: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    status?: "APPROVED" | "REJECTED" | "DISABLED" | "PENDING" | undefined;
    body?: string | undefined;
    name?: string | undefined;
    connectionId?: string | null | undefined;
    metaTemplateId?: string | undefined;
    language?: string | undefined;
    category?: "MARKETING" | "UTILITY" | "AUTHENTICATION" | undefined;
    headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null | undefined;
    headerContent?: string | null | undefined;
    footer?: string | null | undefined;
    buttons?: {
        type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
        text: string;
        url?: string | undefined;
        phone_number?: string | undefined;
    }[] | null | undefined;
    variables?: {
        name: string;
        index: number;
        example?: string | undefined;
    }[] | undefined;
    connectionIds?: string[] | undefined;
}, {
    status?: "APPROVED" | "REJECTED" | "DISABLED" | "PENDING" | undefined;
    body?: string | undefined;
    name?: string | undefined;
    connectionId?: string | null | undefined;
    metaTemplateId?: string | undefined;
    language?: string | undefined;
    category?: "MARKETING" | "UTILITY" | "AUTHENTICATION" | undefined;
    headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null | undefined;
    headerContent?: string | null | undefined;
    footer?: string | null | undefined;
    buttons?: {
        type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
        text: string;
        url?: string | undefined;
        phone_number?: string | undefined;
    }[] | null | undefined;
    variables?: {
        name: string;
        index: number;
        example?: string | undefined;
    }[] | undefined;
    connectionIds?: string[] | undefined;
}>;
export declare const listTemplatesSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    status: z.ZodOptional<z.ZodNativeEnum<{
        APPROVED: "APPROVED";
        PENDING: "PENDING";
        REJECTED: "REJECTED";
        DISABLED: "DISABLED";
    }>>;
    category: z.ZodOptional<z.ZodNativeEnum<{
        MARKETING: "MARKETING";
        UTILITY: "UTILITY";
        AUTHENTICATION: "AUTHENTICATION";
    }>>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "APPROVED" | "REJECTED" | "DISABLED" | "PENDING" | undefined;
    search?: string | undefined;
    category?: "MARKETING" | "UTILITY" | "AUTHENTICATION" | undefined;
}, {
    status?: "APPROVED" | "REJECTED" | "DISABLED" | "PENDING" | undefined;
    search?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    category?: "MARKETING" | "UTILITY" | "AUTHENTICATION" | undefined;
}>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type ListTemplatesInput = z.infer<typeof listTemplatesSchema>;
//# sourceMappingURL=templates.schema.d.ts.map