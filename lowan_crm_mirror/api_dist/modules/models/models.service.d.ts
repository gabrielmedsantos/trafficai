export declare class ModelsService {
    listTextModels(workspaceId: string): Promise<{
        id: string;
        content: string;
        name: string;
        workspaceId: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
    }[]>;
    createTextModel(workspaceId: string, data: {
        name: string;
        content: string;
        category?: string;
    }): Promise<{
        id: string;
        content: string;
        name: string;
        workspaceId: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
    }>;
    updateTextModel(id: string, workspaceId: string, data: {
        name?: string;
        content?: string;
        category?: string;
    }): Promise<{
        id: string;
        content: string;
        name: string;
        workspaceId: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
    }>;
    deleteTextModel(id: string, workspaceId: string): Promise<void>;
    listAudioModels(workspaceId: string): Promise<{
        id: string;
        name: string;
        workspaceId: string;
        createdAt: Date;
        updatedAt: Date;
        fileUrl: string;
        duration: number | null;
    }[]>;
    createAudioModel(workspaceId: string, data: {
        name: string;
        fileUrl: string;
        duration?: number;
    }): Promise<{
        id: string;
        name: string;
        workspaceId: string;
        createdAt: Date;
        updatedAt: Date;
        fileUrl: string;
        duration: number | null;
    }>;
    deleteAudioModel(id: string, workspaceId: string): Promise<void>;
}
//# sourceMappingURL=models.service.d.ts.map