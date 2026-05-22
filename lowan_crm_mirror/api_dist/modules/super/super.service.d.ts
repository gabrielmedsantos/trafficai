import { FastifyInstance } from 'fastify';
import type { SuperLoginInput, SuperSetupInput, CreateWorkspaceInput, UpdateWorkspaceInput } from './super.schema';
export declare class SuperService {
    private readonly app;
    constructor(app: FastifyInstance);
    hasAnySuperAdmin(): Promise<boolean>;
    setup(input: SuperSetupInput): Promise<{
        token: any;
        admin: {
            id: string;
            name: string;
            email: string;
        };
    }>;
    login(input: SuperLoginInput): Promise<{
        token: any;
        admin: {
            id: string;
            name: string;
            email: string;
        };
    }>;
    listWorkspaces(): Promise<({
        _count: {
            connections: number;
            leads: number;
            leadUsers: number;
        };
    } & {
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
    })[]>;
    createWorkspace(input: CreateWorkspaceInput): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
    }>;
    updateWorkspace(id: string, input: UpdateWorkspaceInput): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
    }>;
    deleteWorkspace(id: string): Promise<void>;
    getWorkspace(id: string): Promise<{
        _count: {
            connections: number;
            leads: number;
            leadUsers: number;
        };
    } & {
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
    }>;
    getWorkspaceUsers(workspaceId: string): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.LeadUserRole;
        isActive: boolean;
        createdAt: Date;
    }[]>;
    impersonateWorkspace(workspaceId: string): Promise<{
        token: any;
        user: {
            id: string;
            name: string;
            email: string;
            role: import(".prisma/client").$Enums.LeadUserRole;
        };
        workspaceSlug: string;
    }>;
}
//# sourceMappingURL=super.service.d.ts.map