import type { CreateStageInput, UpdateStageInput, ReorderStagesInput } from './kanban.schema';
export declare class KanbanService {
    private getOrCreatePipeline;
    getBoard(workspaceId: string): Promise<{
        pipeline: {
            id: string;
            name: string;
        };
        stages: {
            leads: {
                status: import(".prisma/client").$Enums.LeadStatus;
                id: string;
                origin: string | null;
                name: string;
                createdAt: Date;
                phone: string;
                tags: string[];
                assignedToId: string | null;
                lastMessageAt: Date | null;
                unreadCount: number;
                stageId: string | null;
                assignedTo: {
                    id: string;
                    name: string;
                } | null;
            }[];
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            color: string;
            position: number;
            pipelineId: string;
        }[];
        rules: any[];
        unstagedLeads: {
            status: import(".prisma/client").$Enums.LeadStatus;
            id: string;
            origin: string | null;
            name: string;
            createdAt: Date;
            phone: string;
            tags: string[];
            assignedToId: string | null;
            lastMessageAt: Date | null;
            unreadCount: number;
            stageId: string | null;
            assignedTo: {
                id: string;
                name: string;
            } | null;
        }[];
    }>;
    invalidateCache(workspaceId: string): Promise<void>;
    createStage(workspaceId: string, input: CreateStageInput): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        position: number;
        pipelineId: string;
    }>;
    updateStage(workspaceId: string, stageId: string, input: UpdateStageInput): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        position: number;
        pipelineId: string;
    }>;
    deleteStage(workspaceId: string, stageId: string): Promise<void>;
    reorderStages(workspaceId: string, input: ReorderStagesInput): Promise<void>;
    createRule(workspaceId: string, body: any): Promise<any>;
    updateRule(workspaceId: string, ruleId: string, body: any): Promise<any>;
    deleteRule(workspaceId: string, ruleId: string): Promise<void>;
    static applyEventRules(workspaceId: string, leadId: string, currentStageId: string | null, trigger: string): Promise<void>;
    static applyAutoAssignRules(workspaceId: string, leadId: string, currentStageId: string | null): Promise<void>;
    static startNoResponseDispatcher(logger?: any): void;
    private findStageForWorkspace;
}
//# sourceMappingURL=kanban.service.d.ts.map