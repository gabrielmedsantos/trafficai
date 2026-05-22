import type { CreateContactInput, UpdateContactInput, ListContactsInput, BlacklistContactInput, OptInContactInput, BulkOptInInput } from './contacts.schema';
export declare class ContactsService {
    list(input: ListContactsInput): Promise<import("../../types/common.types").PaginatedResult<{
        tags: string[];
        messageCount: number;
        _count: {
            messages: number;
        };
        id: string;
        origin: string | null;
        email: string | null;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        phone: string;
        notes: string | null;
        optIn: boolean;
        optInAt: Date | null;
        optInSource: string | null;
        customVariables: import("@prisma/client/runtime/library").JsonValue;
        phoneNormalized: string;
        isBlacklisted: boolean;
        telegramChatId: string | null;
        blacklistedAt: Date | null;
        blacklistReason: string | null;
    }>>;
    exportAll(tags?: string, search?: string): Promise<{
        tags: string[];
        origin: string | null;
        email: string | null;
        name: string;
        phone: string;
        notes: string | null;
        optIn: boolean;
    }[]>;
    getById(id: string): Promise<{
        tags: string[];
        id: string;
        origin: string | null;
        email: string | null;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        phone: string;
        notes: string | null;
        optIn: boolean;
        optInAt: Date | null;
        optInSource: string | null;
        customVariables: import("@prisma/client/runtime/library").JsonValue;
        phoneNormalized: string;
        isBlacklisted: boolean;
        telegramChatId: string | null;
        blacklistedAt: Date | null;
        blacklistReason: string | null;
    }>;
    create(input: CreateContactInput): Promise<{
        tags: string[];
        id: string;
        origin: string | null;
        email: string | null;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        phone: string;
        notes: string | null;
        optIn: boolean;
        optInAt: Date | null;
        optInSource: string | null;
        customVariables: import("@prisma/client/runtime/library").JsonValue;
        phoneNormalized: string;
        isBlacklisted: boolean;
        telegramChatId: string | null;
        blacklistedAt: Date | null;
        blacklistReason: string | null;
    }>;
    update(id: string, input: UpdateContactInput): Promise<{
        tags: string[];
        id: string;
        origin: string | null;
        email: string | null;
        name: string;
        workspaceId: string | null;
        createdAt: Date;
        updatedAt: Date;
        phone: string;
        notes: string | null;
        optIn: boolean;
        optInAt: Date | null;
        optInSource: string | null;
        customVariables: import("@prisma/client/runtime/library").JsonValue;
        phoneNormalized: string;
        isBlacklisted: boolean;
        telegramChatId: string | null;
        blacklistedAt: Date | null;
        blacklistReason: string | null;
    }>;
    delete(id: string): Promise<void>;
    blacklist(id: string, input: BlacklistContactInput): Promise<{
        id: string;
        isBlacklisted: boolean;
        blacklistedAt: Date | null;
        blacklistReason: string | null;
    }>;
    removeFromBlacklist(id: string): Promise<{
        id: string;
        isBlacklisted: boolean;
    }>;
    setOptIn(id: string, input: OptInContactInput): Promise<{
        id: string;
        optIn: boolean;
        optInAt: Date | null;
        optInSource: string | null;
    }>;
    setOptOut(id: string): Promise<{
        id: string;
        optIn: boolean;
    }>;
    bulkOptIn(input: BulkOptInInput): Promise<{
        updated: number;
    }>;
    getMessages(id: string): Promise<{
        status: import(".prisma/client").$Enums.MessageStatus;
        id: string;
        template: {
            name: string;
        } | null;
        campaign: {
            id: string;
            name: string;
        } | null;
        createdAt: Date;
        errorMessage: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
    }[]>;
    getTags(): Promise<{
        tag: string;
        count: number;
    }[]>;
}
//# sourceMappingURL=contacts.service.d.ts.map