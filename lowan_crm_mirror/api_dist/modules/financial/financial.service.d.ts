export declare class FinancialService {
    listTypes(workspaceId: string): Promise<any[]>;
    createType(workspaceId: string, name: string): Promise<any>;
    updateType(id: string, workspaceId: string, data: {
        name?: string;
        active?: boolean;
    }): Promise<any>;
    deleteType(id: string, workspaceId: string): Promise<void>;
    listCommissions(workspaceId: string): Promise<any[]>;
    upsertCommission(workspaceId: string, typeId: string, percentage: number, active: boolean): Promise<any>;
    getRanking(workspaceId: string, period: string): Promise<any[]>;
    listGoals(workspaceId: string, period: string): Promise<any[]>;
    upsertGoal(workspaceId: string, input: {
        financialTypeId: string;
        period: string;
        goalAmount: number;
        operatorId?: string;
        operatorName?: string;
    }): Promise<any>;
    deleteGoal(id: string, workspaceId: string): Promise<void>;
    getAudit(workspaceId: string, period: string): Promise<any[]>;
    getLeadRecords(leadId: string, workspaceId: string): Promise<any[]>;
    getLeadSummary(leadId: string, workspaceId: string): Promise<any[]>;
    createLeadRecord(leadId: string, workspaceId: string, userId: string, userName: string, input: {
        financialTypeId: string;
        amount: number;
        description?: string;
    }): Promise<any>;
    deleteLeadRecord(recId: string, workspaceId: string, userId: string, userName: string): Promise<void>;
}
//# sourceMappingURL=financial.service.d.ts.map