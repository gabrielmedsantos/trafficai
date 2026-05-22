import { FastifyInstance } from 'fastify';
import type { LeadLoginInput, SetupLeadAdminInput, CreateLeadUserInput, UpdateLeadUserInput, CreateLeadInput, UpdateLeadInput, ImportLeadsInput, LeadUserPermissions, UpdateProfileInput } from './leads.schema';
export declare class LeadsService {
    private readonly app;
    constructor(app: FastifyInstance);
    hasAnyUser(workspaceSlug?: string): Promise<boolean>;
    setup(input: SetupLeadAdminInput): Promise<{
        token: any;
        user: {
            id: string;
            name: string;
            email: string;
            role: import(".prisma/client").$Enums.LeadUserRole;
        };
    }>;
    login(input: LeadLoginInput): Promise<{
        token: any;
        user: {
            id: string;
            name: string;
            email: string;
            role: import(".prisma/client").$Enums.LeadUserRole;
        };
    }>;
    listUsers(workspaceId: string): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.LeadUserRole;
        isActive: boolean;
        createdAt: Date;
        permissions: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    createUser(input: CreateLeadUserInput, workspaceId: string): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.LeadUserRole;
        isActive: boolean;
        createdAt: Date;
    }>;
    updateUser(id: string, input: UpdateLeadUserInput, workspaceId: string, requestingUserId?: string): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.LeadUserRole;
        isActive: boolean;
        createdAt: Date;
        permissions: import("@prisma/client/runtime/library").JsonValue;
    }>;
    deleteUser(id: string, workspaceId: string): Promise<void>;
    getMe(id: string): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.LeadUserRole;
        avatar: string | null;
    }>;
    updateProfile(id: string, input: UpdateProfileInput): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.LeadUserRole;
        avatar: string | null;
    }>;
    list(userId: string, role: 'ADMIN' | 'COLLABORATOR', workspaceId: string, permissions?: LeadUserPermissions): Promise<({
        stage: {
            id: string;
            name: string;
            color: string;
        } | null;
        assignedTo: {
            id: string;
            name: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LeadStatus;
        id: string;
        origin: string | null;
        name: string;
        workspaceId: string;
        createdAt: Date;
        updatedAt: Date;
        contactId: string | null;
        phone: string;
        notes: string | null;
        tags: string[];
        assignedToId: string | null;
        pegadoAt: Date | null;
        lastMessageAt: Date | null;
        unreadCount: number;
        stageId: string | null;
        stageMovedAt: Date | null;
        isBlocked: boolean;
        blockedAt: Date | null;
    })[]>;
    create(input: CreateLeadInput, workspaceId: string): Promise<{
        assignedTo: {
            id: string;
            name: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LeadStatus;
        id: string;
        origin: string | null;
        name: string;
        workspaceId: string;
        createdAt: Date;
        updatedAt: Date;
        contactId: string | null;
        phone: string;
        notes: string | null;
        tags: string[];
        assignedToId: string | null;
        pegadoAt: Date | null;
        lastMessageAt: Date | null;
        unreadCount: number;
        stageId: string | null;
        stageMovedAt: Date | null;
        isBlocked: boolean;
        blockedAt: Date | null;
    }>;
    private findOrCreateContact;
    update(id: string, input: UpdateLeadInput, userId: string, role: 'ADMIN' | 'COLLABORATOR', workspaceId: string, permissions?: LeadUserPermissions): Promise<{
        assignedTo: {
            id: string;
            name: string;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.LeadStatus;
        id: string;
        origin: string | null;
        name: string;
        workspaceId: string;
        createdAt: Date;
        updatedAt: Date;
        contactId: string | null;
        phone: string;
        notes: string | null;
        tags: string[];
        assignedToId: string | null;
        pegadoAt: Date | null;
        lastMessageAt: Date | null;
        unreadCount: number;
        stageId: string | null;
        stageMovedAt: Date | null;
        isBlocked: boolean;
        blockedAt: Date | null;
    }>;
    report(from: Date, to: Date, workspaceId: string): Promise<{
        period: {
            from: string;
            to: string;
        };
        activity: {
            name: string;
            pego: number;
            em_andamento: number;
            perdido: number;
            disponivel: number;
        }[];
        portfolio: {
            id: string;
            name: string;
            total: number;
            disponivel: number;
            pego: number;
            em_andamento: number;
            perdido: number;
        }[];
    }>;
    delete(id: string, workspaceId: string): Promise<void>;
    blockLead(id: string, workspaceId: string): Promise<{
        blocked: boolean;
    }>;
    unblockLead(id: string, workspaceId: string): Promise<{
        blocked: boolean;
    }>;
    deleteConversation(leadId: string, workspaceId: string): Promise<{
        deleted: number;
    }>;
    isPhoneBlocked(phone: string, workspaceId: string): Promise<boolean>;
    bulkAssign(leadIds: string[], assignedToId: string | null, workspaceId: string): Promise<{
        updated: number;
    }>;
    redistribute(scope: 'all' | 'unassigned', userIds: string[], workspaceId: string): Promise<{
        distributed: number;
        perUser: Record<string, number>;
    }>;
    bulkImport(input: ImportLeadsInput, workspaceId: string): Promise<{
        imported: number;
        skipped: number;
    }>;
    getConversation(leadId: string, userId: string, role: 'ADMIN' | 'COLLABORATOR', workspaceId: string, permissions?: LeadUserPermissions): Promise<{
        messages: never[];
        hasContact: boolean;
        events?: undefined;
    } | {
        messages: {
            status: import(".prisma/client").$Enums.MessageStatus;
            connection: {
                id: string;
                name: string;
            } | null;
            id: string;
            createdAt: Date;
            errorCode: string | null;
            errorMessage: string | null;
            connectionId: string | null;
            direction: import(".prisma/client").$Enums.MessageDirection;
            messageContent: string | null;
            metaResponse: import("@prisma/client/runtime/library").JsonValue;
            sentAt: Date | null;
        }[];
        events: {
            id: string;
            actorName: string | null;
            type: string;
            payload: any;
            createdAt: Date;
        }[];
        hasContact: boolean;
    }>;
    getTagOptions(workspaceId: string): Promise<string[]>;
    markAsRead(leadId: string, userId: string, role: 'ADMIN' | 'COLLABORATOR', workspaceId: string, permissions?: LeadUserPermissions): Promise<{
        ok: boolean;
    }>;
    startConversation(leadId: string, connectionId: string, templateName: string, language: string, variables: string[], userId: string, role: 'ADMIN' | 'COLLABORATOR', workspaceId: string, permissions?: LeadUserPermissions): Promise<{
        newStageId: string | null;
        status: import(".prisma/client").$Enums.MessageStatus;
        connection: {
            id: string;
            name: string;
        } | null;
        id: string;
        createdAt: Date;
        errorCode: string | null;
        errorMessage: string | null;
        connectionId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        messageContent: string | null;
        sentAt: Date | null;
    }>;
    sendReply(leadId: string, text: string, userId: string, role: 'ADMIN' | 'COLLABORATOR', workspaceId: string, permissions?: LeadUserPermissions, preferredConnectionId?: string): Promise<{
        status: import(".prisma/client").$Enums.MessageStatus;
        connection: {
            id: string;
            name: string;
        } | null;
        id: string;
        createdAt: Date;
        errorCode: string | null;
        errorMessage: string | null;
        connectionId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        messageContent: string | null;
        sentAt: Date | null;
    }>;
    getDashboardAdmin(workspaceId: string, from?: Date, to?: Date): Promise<{
        overview: {
            total: number;
            disponivel: number;
            pego: number;
            em_andamento: number;
            perdido: number;
            conversionRate: string;
            lossRate: string;
            newLeads: number;
            initiated: number;
            stageMoves: number;
            activeConvs: number;
        };
        alerts: {
            pendingReplies: number;
            totalUnread: number;
            unassigned: number;
            stale: number;
        };
        team: {
            totalOperators: number;
            activeOperators: number;
            operators: {
                id: string;
                name: string;
                avatar: string | null;
                isActive: boolean;
                total: number;
                newLeads: number;
                initiated: number;
                stageMoves: number;
                activeConvs: number;
                unreadTotal: number;
                avgResponseMinutes: number;
            }[];
        };
        pipeline: {
            stages: {
                id: string;
                name: string;
                color: string;
                count: number;
                initiatedInPeriod: number;
            }[];
            withoutStage: number;
            initiatedTotal: number;
        };
        timeline: {
            last14days: {
                date: string;
                created: number;
                initiated: number;
            }[];
        };
        connections: {
            id: string;
            name: string;
            status: import(".prisma/client").$Enums.ConnectionStatus;
            phoneNumberId: string;
        }[];
    }>;
    getDashboardOperator(userId: string, workspaceId: string, from?: Date, to?: Date): Promise<{
        myStats: {
            total: number;
            disponivel: number;
            pego: number;
            em_andamento: number;
            perdido: number;
            unreadTotal: number;
            newLeads: number;
            initiated: number;
            stageMoves: number;
            activeConvs: number;
            avgResponseMinutes: number | null;
        };
        priority: {
            id: string;
            name: string;
            phone: string;
            status: import(".prisma/client").$Enums.LeadStatus;
            unreadCount: number;
            lastMessageAt: string | null;
            minutesSinceLastMessage: number | null;
            stageName: string | null;
            stageColor: string | null;
            tags: string[];
        }[];
        timeline: {
            last14days: {
                date: string;
                converted: number;
            }[];
        };
    }>;
}
//# sourceMappingURL=leads.service.d.ts.map