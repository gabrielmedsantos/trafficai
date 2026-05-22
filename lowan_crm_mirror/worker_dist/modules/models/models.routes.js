"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = modelsRoutes;
const models_service_1 = require("./models.service");
const leads_middleware_1 = require("../../modules/leads/leads.middleware");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = require("stream/promises");
const UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads', 'audio_models');
async function modelsRoutes(app) {
    const service = new models_service_1.ModelsService();
    app.addHook('preHandler', leads_middleware_1.authenticateLeadUser);
    // ── Text Models ──────────────────────────────────────────────────────────
    app.get('/text', async (req, reply) => {
        const workspaceId = req.leadUser.workspaceId;
        return reply.send(await service.listTextModels(workspaceId));
    });
    app.post('/text', async (req, reply) => {
        const workspaceId = req.leadUser.workspaceId;
        const { name, content, category } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'Nome obrigatório' });
        if (!content?.trim())
            return reply.status(400).send({ error: 'Conteúdo obrigatório' });
        const model = await service.createTextModel(workspaceId, { name, content, category });
        return reply.status(201).send(model);
    });
    app.put('/text/:id', async (req, reply) => {
        const workspaceId = req.leadUser.workspaceId;
        const { id } = req.params;
        const { name, content, category } = req.body;
        try {
            const model = await service.updateTextModel(id, workspaceId, { name, content, category });
            return reply.send(model);
        }
        catch (e) {
            return reply.status(404).send({ error: e.message });
        }
    });
    app.delete('/text/:id', async (req, reply) => {
        const workspaceId = req.leadUser.workspaceId;
        const { id } = req.params;
        try {
            await service.deleteTextModel(id, workspaceId);
            return reply.status(204).send();
        }
        catch (e) {
            return reply.status(404).send({ error: e.message });
        }
    });
    // ── Audio Models ─────────────────────────────────────────────────────────
    app.get('/audio', async (req, reply) => {
        const workspaceId = req.leadUser.workspaceId;
        return reply.send(await service.listAudioModels(workspaceId));
    });
    app.post('/audio/upload', async (req, reply) => {
        const workspaceId = req.leadUser.workspaceId;
        const data = await req.file();
        if (!data)
            return reply.status(400).send({ error: 'Arquivo obrigatório' });
        const nameField = data.fields?.name?.value;
        const rawName = nameField || data.filename || 'audio';
        const name = String(rawName).replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim() || 'audio';
        const ext = path_1.default.extname(data.filename || '.ogg') || '.ogg';
        const safeExt = ['.ogg', '.mp3', '.webm', '.m4a', '.opus'].includes(ext.toLowerCase()) ? ext.toLowerCase() : '.ogg';
        const filename = `am_${Date.now()}_${Math.random().toString(36).slice(2)}${safeExt}`;
        fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
        const filePath = path_1.default.join(UPLOAD_DIR, filename);
        await (0, promises_1.pipeline)(data.file, fs_1.default.createWriteStream(filePath));
        const fileUrl = `/api/v1/models/audio/file/${filename}`;
        const model = await service.createAudioModel(workspaceId, { name, fileUrl });
        return reply.status(201).send(model);
    });
    app.delete('/audio/:id', async (req, reply) => {
        const workspaceId = req.leadUser.workspaceId;
        const { id } = req.params;
        try {
            await service.deleteAudioModel(id, workspaceId);
            return reply.status(204).send();
        }
        catch (e) {
            return reply.status(404).send({ error: e.message });
        }
    });
}
//# sourceMappingURL=models.routes.js.map