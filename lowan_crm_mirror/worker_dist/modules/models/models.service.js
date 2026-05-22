"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelsService = void 0;
const database_1 = require("../../config/database");
class ModelsService {
    // ── Text Models ───────────────────────────────────────────────────────────
    async listTextModels(workspaceId) {
        return database_1.prisma.textModel.findMany({
            where: { workspaceId },
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
        });
    }
    async createTextModel(workspaceId, data) {
        return database_1.prisma.textModel.create({
            data: {
                name: data.name.trim(),
                content: data.content,
                category: data.category?.trim() || 'geral',
                workspaceId,
            },
        });
    }
    async updateTextModel(id, workspaceId, data) {
        const existing = await database_1.prisma.textModel.findFirst({ where: { id, workspaceId } });
        if (!existing)
            throw new Error('Modelo não encontrado');
        return database_1.prisma.textModel.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.content !== undefined && { content: data.content }),
                ...(data.category !== undefined && { category: data.category.trim() || 'geral' }),
            },
        });
    }
    async deleteTextModel(id, workspaceId) {
        const existing = await database_1.prisma.textModel.findFirst({ where: { id, workspaceId } });
        if (!existing)
            throw new Error('Modelo não encontrado');
        await database_1.prisma.textModel.delete({ where: { id } });
    }
    // ── Audio Models ──────────────────────────────────────────────────────────
    async listAudioModels(workspaceId) {
        return database_1.prisma.audioModel.findMany({
            where: { workspaceId },
            orderBy: { name: 'asc' },
        });
    }
    async createAudioModel(workspaceId, data) {
        return database_1.prisma.audioModel.create({
            data: {
                name: data.name.trim(),
                fileUrl: data.fileUrl,
                duration: data.duration ?? null,
                workspaceId,
            },
        });
    }
    async deleteAudioModel(id, workspaceId) {
        const existing = await database_1.prisma.audioModel.findFirst({ where: { id, workspaceId } });
        if (!existing)
            throw new Error('Modelo de áudio não encontrado');
        await database_1.prisma.audioModel.delete({ where: { id } });
    }
}
exports.ModelsService = ModelsService;
//# sourceMappingURL=models.service.js.map