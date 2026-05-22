import type { CreateTemplateInput, UpdateTemplateInput, ListTemplatesInput } from './templates.schema';
export declare class TemplatesService {
    list(input: ListTemplatesInput): Promise<import("../../types/common.types").PaginatedResult<{
        status: import(".prisma/client").$Enums.TemplateStatus;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        connectionId: string | null;
        metaTemplateId: string | null;
        language: string;
        category: import(".prisma/client").$Enums.TemplateCategory;
        headerType: import(".prisma/client").$Enums.TemplateHeaderType | null;
        variablesCount: number;
    }>>;
    getById(id: string): Promise<{
        status: import(".prisma/client").$Enums.TemplateStatus;
        id: string;
        body: string;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        connectionId: string | null;
        metaTemplateId: string | null;
        language: string;
        category: import(".prisma/client").$Enums.TemplateCategory;
        headerType: import(".prisma/client").$Enums.TemplateHeaderType | null;
        headerContent: string | null;
        footer: string | null;
        buttons: import("@prisma/client/runtime/library").JsonValue | null;
        variables: import("@prisma/client/runtime/library").JsonValue;
        variablesCount: number;
    }>;
    create(input: CreateTemplateInput, userId: string): Promise<{
        status: import(".prisma/client").$Enums.TemplateStatus;
        id: string;
        body: string;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        connectionId: string | null;
        metaTemplateId: string | null;
        language: string;
        category: import(".prisma/client").$Enums.TemplateCategory;
        headerType: import(".prisma/client").$Enums.TemplateHeaderType | null;
        headerContent: string | null;
        footer: string | null;
        buttons: import("@prisma/client/runtime/library").JsonValue | null;
        variables: import("@prisma/client/runtime/library").JsonValue;
        variablesCount: number;
    } | {
        status: import(".prisma/client").$Enums.TemplateStatus;
        id: string;
        body: string;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        connectionId: string | null;
        metaTemplateId: string | null;
        language: string;
        category: import(".prisma/client").$Enums.TemplateCategory;
        headerType: import(".prisma/client").$Enums.TemplateHeaderType | null;
        headerContent: string | null;
        footer: string | null;
        buttons: import("@prisma/client/runtime/library").JsonValue | null;
        variables: import("@prisma/client/runtime/library").JsonValue;
        variablesCount: number;
    }[]>;
    private submitToMeta;
    private buildMetaComponents;
    update(id: string, input: UpdateTemplateInput, userId: string): Promise<{
        status: import(".prisma/client").$Enums.TemplateStatus;
        id: string;
        body: string;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        connectionId: string | null;
        metaTemplateId: string | null;
        language: string;
        category: import(".prisma/client").$Enums.TemplateCategory;
        headerType: import(".prisma/client").$Enums.TemplateHeaderType | null;
        headerContent: string | null;
        footer: string | null;
        buttons: import("@prisma/client/runtime/library").JsonValue | null;
        variables: import("@prisma/client/runtime/library").JsonValue;
        variablesCount: number;
    }>;
    resubmit(id: string): Promise<{
        submitted: boolean;
        metaTemplateId?: string;
    }>;
    syncStatus(id: string): Promise<{
        status: string;
        updated: boolean;
    }>;
    delete(id: string): Promise<void>;
    /**
     * Validates that all required variables for the template are present in the provided values.
     * Returns the filled-in body as a preview.
     */
    validateVariables(template: {
        variables: unknown;
        variablesCount: number;
    }, values: Record<string, string>): {
        valid: boolean;
        missing: string[];
        preview?: string;
    };
    listByConnection(connectionId: string, workspaceId: string): Promise<{
        status: import(".prisma/client").$Enums.TemplateStatus;
        id: string;
        body: string;
        name: string;
        createdAt: Date;
        connectionId: string | null;
        metaTemplateId: string | null;
        language: string;
        category: import(".prisma/client").$Enums.TemplateCategory;
        variablesCount: number;
    }[]>;
    syncFromMeta(connectionId: string, workspaceId: string): Promise<{
        created: number;
        synced: number;
    }>;
    private countBodyVariables;
}
//# sourceMappingURL=templates.service.d.ts.map