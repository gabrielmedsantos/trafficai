"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = leadsRoutes;
const leads_service_1 = require("./leads.service");
const leads_controller_1 = require("./leads.controller");
const leads_middleware_1 = require("./leads.middleware");
const connections_service_1 = require("../../modules/connections/connections.service");
const templates_service_1 = require("../../modules/templates/templates.service");
const telegram_routes_1 = __importDefault(require("../../modules/telegram/telegram.routes"));
const whatsapp_signup_routes_1 = __importDefault(require("../../modules/whatsapp-signup/whatsapp-signup.routes"));
const telegram_user_routes_1 = __importDefault(require("../../modules/telegram-user/telegram-user.routes"));
const uazapi_routes_1 = __importDefault(require("../../modules/uazapi/uazapi.routes"));
const connections_schema_1 = require("../../modules/connections/connections.schema");
const leads_schema_1 = require("./leads.schema");
const common_types_1 = require("../../types/common.types");
const database_1 = require("../../config/database");
async function leadsRoutes(app) {
    const service = new leads_service_1.LeadsService(app);
    const controller = new leads_controller_1.LeadsController(service);
    const connService = new connections_service_1.ConnectionsService();
    const templatesService = new templates_service_1.TemplatesService();
    // ─── Telegram bots (workspace-scoped) ─────────────────────────────────────
    app.register(telegram_routes_1.default, { prefix: '/telegram' });
    // ─── Public ──────────────────────────────────────────────────────────────
    // Serve áudios temporários para a Meta buscar via URL (sem auth)
    app.get('/tmp-audio/:filename', async (req, reply) => {
        const { filename } = req.params;
        if (!/^[a-z0-9_-]+\.ogg$/.test(filename))
            return reply.status(404).send();
        const { tmpdir } = await Promise.resolve().then(() => __importStar(require('os')));
        const { createReadStream, existsSync } = await Promise.resolve().then(() => __importStar(require('fs')));
        const filePath = `${tmpdir()}/wha_${filename}`;
        if (!existsSync(filePath))
            return reply.status(404).send();
        reply.header('Content-Type', 'audio/ogg');
        reply.header('Cache-Control', 'no-store');
        return reply.send(createReadStream(filePath));
    });
    // /auth/check always returns exists:true — setup is disabled
    app.get('/auth/check', (_req, reply) => reply.send({ exists: true }));
    // /auth/setup is permanently disabled
    app.post('/auth/setup', (_req, reply) => reply.status(404).send({ error: 'Not found' }));
    app.post('/auth/identify', (req, reply) => controller.identify(req, reply));
    app.post('/auth/login', (req, reply) => controller.login(req, reply));
    // ─── Authenticated ────────────────────────────────────────────────────────
    app.register(async (authed) => {
        authed.addHook('preHandler', leads_middleware_1.authenticateLeadUser);
        // ─── WhatsApp Embedded Signup (workspace-scoped via leadUser.workspaceId) ──
        authed.register(whatsapp_signup_routes_1.default, { prefix: '/whatsapp-signup' });
        // ─── Telegram MTProto (user/personal — workspace-scoped) ──────────────────
        authed.register(telegram_user_routes_1.default, { prefix: '/telegram-user' });
        // ─── WhatsApp Web não-oficial via uazapi (workspace-scoped) ───────────────
        authed.register(uazapi_routes_1.default, { prefix: '/uazapi-instances' });
        authed.get('/auth/workspaces', (req, reply) => controller.listWorkspaces(req, reply));
        authed.post('/auth/switch-workspace', (req, reply) => controller.switchWorkspace(req, reply));
        authed.get('/me', async (req, reply) => {
            const { id } = req.leadUser;
            return reply.send(await service.getMe(id));
        });
        authed.patch('/me', async (req, reply) => {
            const body = leads_schema_1.updateProfileSchema.safeParse(req.body);
            if (!body.success)
                throw common_types_1.HttpError.badRequest(body.error.message);
            const { id } = req.leadUser;
            return reply.send(await service.updateProfile(id, body.data));
        });
        authed.get('/', (req, reply) => controller.list(req, reply));
        // Data-Lite: contadores agregados sem precisar carregar a lista
        authed.get('/summary', (req, reply) => controller.summary(req, reply));
        authed.get('/inbox/summary', (req, reply) => controller.inboxSummary(req, reply));
        // Data-Lite: lista paginada lean (filtros server-side + cursor pagination).
        authed.get('/lite', (req, reply) => controller.listLite(req, reply));
        authed.get('/tag-options', (req, reply) => controller.getTagOptions(req, reply));
        authed.post('/tag-options', (req, reply) => controller.createTagOption(req, reply));
        authed.delete('/tag-options/:tag', (req, reply) => controller.deleteTagOption(req, reply));
        authed.put('/:id', (req, reply) => controller.update(req, reply));
        // Salva avatar (dataUrl base64 ou URL) obtido via sessão não-oficial
        authed.patch('/:id/avatar', async (req, reply) => {
            const { id } = req.params;
            const { workspaceId } = req.leadUser;
            const { avatarUrl } = req.body;
            const lead = await database_1.prisma.lead.findFirst({ where: { id, workspaceId } });
            if (!lead)
                return reply.status(404).send({ error: 'Lead não encontrado' });
            const updated = await database_1.prisma.lead.update({
                where: { id },
                data: { avatarUrl: avatarUrl ?? null },
                select: { id: true, avatarUrl: true },
            });
            return reply.send(updated);
        });
        authed.get('/:id/conversation', (req, reply) => controller.getConversation(req, reply));
        authed.get('/:id/activity', async (req, reply) => {
            const { id } = req.params;
            const { workspaceId } = req.leadUser;
            const lead = await database_1.prisma.lead.findFirst({ where: { id, workspaceId }, select: { id: true } });
            if (!lead) return reply.status(404).send({ error: 'Lead não encontrado' });
            const limit = Math.min(parseInt(req.query?.limit) || 50, 200);
            const events = await database_1.prisma.$queryRaw `
                SELECT id, type, payload, actor_id AS "actorId", actor_name AS "actorName", created_at AS "createdAt"
                FROM lead_events
                WHERE lead_id = ${id}::uuid
                ORDER BY created_at DESC
                LIMIT ${limit}
            `;
            return reply.send(events);
        });
        authed.get('/:id/messages/:msgId/media', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            const { msgId } = req.params;
            // Inclui unofficial_session_id (raw) — coluna não está no Prisma schema
            const msgRows = await database_1.prisma.$queryRawUnsafe(
                `SELECT meta_response AS "metaResponse", connection_id AS "connectionId",
                        telegram_connection_id AS "telegramConnectionId",
                        unofficial_session_id AS "unofficialSessionId",
                        channel, direction
                 FROM messages WHERE id = $1::uuid LIMIT 1`,
                msgId);
            const msg = msgRows?.[0];
            if (!msg)
                return reply.status(404).send();
            const meta = msg.metaResponse;
            // ─── Unofficial (Baileys) branch ─────────────────────────────────
            // Mídia inbound é baixada e armazenada no volume do wablast_unofficial.
            // Pra outbound, ainda não temos persistência (não precisa servir de volta).
            if (msg.unofficialSessionId && msg.direction === 'INBOUND') {
                const filename = meta?.[meta?.type]?.id;
                if (!filename) return reply.status(404).send();
                try {
                    const { createSigner } = require('fast-jwt');
                    const sign = createSigner({ key: process.env.JWT_SECRET || '' });
                    const tok = sign({ service: 'unofficial' });
                    const unoffRes = await fetch(
                        `http://unofficial:3002/sessions/${msg.unofficialSessionId}/media/${encodeURIComponent(filename)}`,
                        { headers: { Authorization: `Bearer ${tok}` } }
                    );
                    if (!unoffRes.ok) return reply.status(502).send({ error: 'unofficial media fetch failed' });
                    const buf = Buffer.from(await unoffRes.arrayBuffer());
                    const ct = unoffRes.headers.get('content-type') || meta?.[meta?.type]?.mimetype || 'application/octet-stream';
                    reply.header('Content-Type', ct);
                    reply.header('Cache-Control', 'private, max-age=3600');
                    return reply.send(buf);
                } catch (err) {
                    return reply.status(502).send({ error: err?.message || 'unofficial proxy failed' });
                }
            }
            // ─── Telegram branch ──────────────────────────────────────────────
            if (msg.channel === 'TELEGRAM') {
                // file_id pode estar em meta.voice/audio/video/document/sticker.file_id
                // ou no array meta.photo (escolher maior resolução)
                let fileId = null;
                if (Array.isArray(meta?.photo) && meta.photo.length) fileId = meta.photo[meta.photo.length - 1].file_id;
                else if (meta?.voice?.file_id) fileId = meta.voice.file_id;
                else if (meta?.audio?.file_id) fileId = meta.audio.file_id;
                else if (meta?.video?.file_id) fileId = meta.video.file_id;
                else if (meta?.video_note?.file_id) fileId = meta.video_note.file_id;
                else if (meta?.document?.file_id) fileId = meta.document.file_id;
                else if (meta?.sticker?.file_id) fileId = meta.sticker.file_id;
                if (!fileId)
                    return reply.status(404).send();
                if (!msg.telegramConnectionId)
                    return reply.status(404).send();
                const tgConn = await database_1.prisma.telegramConnection.findUnique({
                    where: { id: msg.telegramConnectionId },
                    select: { botTokenEnc: true },
                });
                if (!tgConn?.botTokenEnc)
                    return reply.status(404).send();
                const { decrypt: tgDecrypt } = await Promise.resolve().then(() => __importStar(require('../../services/crypto/token.encryption')));
                const { telegramApiService } = await Promise.resolve().then(() => __importStar(require('../../services/telegram/telegram-api.service')));
                const botToken = tgDecrypt(tgConn.botTokenEnc);
                try {
                    const file = await telegramApiService.getFile(botToken, fileId);
                    if (!file?.file_path)
                        return reply.status(502).send();
                    const buf = await telegramApiService.downloadFile(botToken, file.file_path);
                    // Determina content-type pela extensão / mime conhecido na meta
                    const path = file.file_path.toLowerCase();
                    let ct = meta?.voice?.mime_type || meta?.audio?.mime_type || meta?.video?.mime_type || meta?.video_note?.mime_type || meta?.document?.mime_type;
                    if (!ct) {
                        if (path.endsWith('.jpg') || path.endsWith('.jpeg')) ct = 'image/jpeg';
                        else if (path.endsWith('.png')) ct = 'image/png';
                        else if (path.endsWith('.webp')) ct = 'image/webp';
                        else if (path.endsWith('.ogg') || path.endsWith('.oga')) ct = 'audio/ogg';
                        else if (path.endsWith('.mp3')) ct = 'audio/mpeg';
                        else if (path.endsWith('.m4a')) ct = 'audio/mp4';
                        else if (path.endsWith('.mp4')) ct = 'video/mp4';
                        else if (path.endsWith('.webm')) ct = 'video/webm';
                        else if (path.endsWith('.pdf')) ct = 'application/pdf';
                        else ct = 'application/octet-stream';
                    }
                    reply.header('Content-Type', ct);
                    reply.header('Cache-Control', 'private, max-age=3600');
                    return reply.send(buf);
                } catch (err) {
                    return reply.status(502).send({ error: err?.message || 'telegram media fetch failed' });
                }
            }
            // ─── WhatsApp Cloud branch (original, intacto) ────────────────────
            const type = meta?.type;
            const mediaId = meta?.[type]?.id;
            if (!mediaId)
                return reply.status(404).send();
            // Guard: msg.connectionId null causa Prisma crash. Pode acontecer em
            // mensagens unofficial (Baileys), que não tem connectionId.
            if (!msg.connectionId)
                return reply.status(404).send();
            const connection = await database_1.prisma.whatsappConnection.findUnique({
                where: { id: msg.connectionId },
                select: { accessTokenEnc: true },
            });
            if (!connection)
                return reply.status(404).send();
            const { decrypt } = await Promise.resolve().then(() => __importStar(require('../../services/crypto/token.encryption')));
            const accessToken = decrypt(connection.accessTokenEnc);
            const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!metaRes.ok)
                return reply.status(502).send();
            const { url } = await metaRes.json();
            const mediaRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!mediaRes.ok)
                return reply.status(502).send();
            const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';
            reply.header('Content-Type', contentType);
            reply.header('Cache-Control', 'private, max-age=3600');
            return reply.send(Buffer.from(await mediaRes.arrayBuffer()));
        });
        authed.post('/:id/ai-assist', (req, reply) => controller.aiAssist(req, reply));
        authed.post('/:id/read', (req, reply) => controller.markAsRead(req, reply));
        authed.post('/:id/unread', async (req, reply) => {
            const { id } = req.params;
            const { id: userId, role, workspaceId, permissions } = req.leadUser;
            const lead = await database_1.prisma.lead.findFirst({ where: { id, workspaceId }, select: { id: true, assignedToId: true } });
            if (!lead) throw common_types_1.HttpError.notFound('Lead não encontrado');
            if (role !== 'ADMIN' && !permissions?.viewAllLeads && lead.assignedToId !== userId) throw common_types_1.HttpError.forbidden('Sem permissão');
            await database_1.prisma.lead.update({ where: { id }, data: { unreadCount: 1 } });
            return reply.send({ ok: true });
        });
        authed.post('/:id/reply', (req, reply) => controller.sendReply(req, reply));
        authed.post('/:id/reply-image', async (req, reply) => {
            const { id: userId, role, workspaceId, permissions } = req.leadUser;
            const data = await req.file();
            if (!data)
                throw common_types_1.HttpError.badRequest('Arquivo de imagem obrigatório');
            const buffer = await data.toBuffer();
            const mimeType = data.mimetype || 'image/jpeg';
            const caption = req.query?.caption ?? '';
            const connectionId = req.query?.connectionId;
            return reply.status(201).send(await service.sendImageReply(req.params.id, buffer, mimeType, caption, userId, role, workspaceId, permissions, connectionId));
        });
        authed.post('/:id/reply-audio', async (req, reply) => {
            const { id: userId, role, workspaceId, permissions } = req.leadUser;
            const data = await req.file();
            if (!data)
                throw common_types_1.HttpError.badRequest('Arquivo de áudio obrigatório');
            const buffer = await data.toBuffer();
            const mimeType = data.mimetype || 'audio/ogg';
            const connectionId = req.query?.connectionId;
            return reply.status(201).send(await service.sendAudioReply(req.params.id, buffer, mimeType, userId, role, workspaceId, permissions, connectionId));
        });
        authed.post('/:id/share-contact', async (req, reply) => {
            const { id: userId, role, workspaceId, permissions } = req.leadUser;
            const body = req.body;
            if (!body?.contactName || !body?.contactPhone)
                throw common_types_1.HttpError.badRequest('contactName e contactPhone são obrigatórios');
            return reply.status(201).send(await service.shareContact(req.params.id, String(body.contactName), String(body.contactPhone), userId, role, workspaceId, permissions, body.connectionId));
        });
        authed.post('/:id/start-conversation', async (req, reply) => {
            const body = leads_schema_1.startConversationSchema.safeParse(req.body);
            if (!body.success)
                throw common_types_1.HttpError.badRequest(body.error.message);
            const { id: userId, role, workspaceId, permissions } = req.leadUser;
            return reply.send(await service.startConversation(req.params.id, body.data.connectionId, body.data.templateName, body.data.language, body.data.variables, userId, role, workspaceId, permissions));
        });
        // ─── Agenda de contatos compartilhada ────────────────────────────────────
        authed.get('/contact-book', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            const search = req.query?.search?.trim() ?? '';
            const where = {
                origin: 'contact_book',
                workspaceId,
            };
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search.replace(/\D/g, '') } },
                    { phoneNormalized: { contains: search.replace(/\D/g, '') } },
                ];
            }
            const contacts = await database_1.prisma.contact.findMany({
                where,
                orderBy: { name: 'asc' },
                take: 50,
                select: { id: true, name: true, phone: true },
            });
            return reply.send(contacts);
        });
        authed.post('/contact-book', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            const body = req.body;
            if (!body?.name || !body?.phone)
                throw common_types_1.HttpError.badRequest('name e phone são obrigatórios');
            const phone = String(body.phone).replace(/\D/g, '');
            if (!phone)
                throw common_types_1.HttpError.badRequest('Telefone inválido');
            const contact = await database_1.prisma.contact.upsert({
                where: { phoneNormalized_workspaceId: { phoneNormalized: phone, workspaceId } },
                update: { name: String(body.name).trim() },
                create: {
                    name: String(body.name).trim(),
                    phone: body.phone,
                    phoneNormalized: phone,
                    origin: 'contact_book',
                    workspaceId,
                    optIn: true,
                },
                select: { id: true, name: true, phone: true },
            });
            return reply.status(200).send(contact);
        });
        authed.delete('/contact-book/:contactId', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            await database_1.prisma.contact.deleteMany({
                where: { id: req.params.contactId, origin: 'contact_book', workspaceId },
            });
            return reply.status(204).send();
        });
        // ─────────────────────────────────────────────────────────────────────────
        authed.post('/:id/block', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await service.blockLead(req.params.id, workspaceId));
        });
        authed.post('/:id/unblock', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await service.unblockLead(req.params.id, workspaceId));
        });
        // Listagem de leads bloqueados — view dedicada na aba Leads
        authed.get('/blocked', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await service.listBlocked(workspaceId));
        });
        // ─── Blacklist de telefones (admin only) ────────────────────────────────
        authed.get('/blocked-phones', async (req, reply) => {
            await (0, leads_middleware_1.requireLeadAdmin)(req, reply);
            const { workspaceId } = req.leadUser;
            return reply.send(await service.listBlockedPhones(workspaceId));
        });
        authed.post('/blocked-phones', async (req, reply) => {
            await (0, leads_middleware_1.requireLeadAdmin)(req, reply);
            const { workspaceId } = req.leadUser;
            const phone = req.body?.phone;
            return reply.send(await service.addBlockedPhone(phone, workspaceId));
        });
        authed.delete('/blocked-phones/:phone', async (req, reply) => {
            await (0, leads_middleware_1.requireLeadAdmin)(req, reply);
            const { workspaceId } = req.leadUser;
            return reply.send(await service.removeBlockedPhone(req.params.phone, workspaceId));
        });
        authed.delete('/:id/conversation', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            const deleteLead = req.query?.deleteLead === 'true';
            const blacklist = req.query?.blacklist === 'true';
            return reply.send(await service.deleteConversation(req.params.id, workspaceId, deleteLead, blacklist));
        });
        // Listagem de conexões acessível a todos os usuários autenticados (usada no picker de templates)
        authed.get('/connections', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            const includeDeleted = req.query?.includeDeleted === 'true';
            const result = await connService.list({ page: 1, limit: 100, includeDeleted }, workspaceId);
            // Enrich com proxy fields (colunas fora do Prisma schema)
            try {
                const ids = (result?.data || result || []).map(c => c.id);
                if (ids.length) {
                    const rows = await database_1.prisma.$queryRawUnsafe(
                        `SELECT id, proxy_url AS "proxyUrl", proxy_label AS "proxyLabel", proxy_country AS "proxyCountry"
                         FROM whatsapp_connections WHERE id = ANY($1::uuid[])`,
                        ids
                    );
                    const proxyMap = Object.fromEntries(rows.map(r => [r.id, r]));
                    const enrich = (c) => ({ ...c, ...(proxyMap[c.id] || { proxyUrl: null, proxyLabel: null, proxyCountry: null }) });
                    if (Array.isArray(result)) return reply.send(result.map(enrich));
                    if (result?.data) return reply.send({ ...result, data: result.data.map(enrich) });
                }
            } catch (e) { /* fallback: response sem proxy info */ }
            return reply.send(result);
        });
        // Templates aprovados do workspace (usados no picker de templates)
        authed.get('/templates', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            const connections = await database_1.prisma.whatsappConnection.findMany({
                where: { workspaceId, status: 'ACTIVE' },
                select: { id: true, name: true },
            });
            const connIds = connections.map(c => c.id);
            const connMap = Object.fromEntries(connections.map(c => [c.id, c.name]));
            const templates = await database_1.prisma.template.findMany({
                where: { connectionId: { in: connIds }, status: 'APPROVED' },
                orderBy: { name: 'asc' },
                select: { id: true, name: true, language: true, category: true, body: true, variablesCount: true, connectionId: true },
            });
            return reply.send(templates.map(t => ({ ...t, connectionName: t.connectionId ? connMap[t.connectionId] ?? null : null })));
        });
        // Templates por conexão (leitura)
        authed.get('/connections/:id/templates', async (req, reply) => {
            const { workspaceId } = req.leadUser;
            return reply.send(await templatesService.listByConnection(req.params.id, workspaceId));
        });
        // Criar lead: admin ou manageLeads
        authed.post('/', async (req, reply) => {
            await (0, leads_middleware_1.requirePermission)('manageLeads')(req, reply);
            return controller.create(req, reply);
        });
        // Apagar lead: admin ou manageLeads
        authed.delete('/:id', async (req, reply) => {
            await (0, leads_middleware_1.requirePermission)('manageLeads')(req, reply);
            return controller.delete(req, reply);
        });
        // ─── Admin only ────────────────────────────────────────────────────────
        authed.register(async (admin) => {
            admin.addHook('preHandler', leads_middleware_1.requireLeadAdmin);
            admin.post('/import', (req, reply) => controller.bulkImport(req, reply));
            admin.post('/bulk-assign', (req, reply) => controller.bulkAssign(req, reply));
            admin.post('/redistribute', (req, reply) => controller.redistribute(req, reply));
        });
        // ─── Dashboard ─────────────────────────────────────────────────────────
        // Admin dashboard: admin ou viewReports
        authed.get('/dashboard/admin', async (req, reply) => {
            await (0, leads_middleware_1.requirePermission)('viewReports')(req, reply);
            return controller.dashboardAdmin(req, reply);
        });
        // Operator dashboard: qualquer usuário autenticado (dados filtrados por userId)
        authed.get('/dashboard/operator', (req, reply) => controller.dashboardOperator(req, reply));
        // ─── Admin OR permission ───────────────────────────────────────────────
        authed.register(async (perm) => {
            // Relatórios: admin ou viewReports
            perm.get('/report', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('viewReports')(req, reply);
                return controller.report(req, reply);
            });
            // Gestão de usuários: admin ou manageUsers
            perm.get('/users', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('manageUsers')(req, reply);
                return controller.listUsers(req, reply);
            });
            perm.post('/users', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('manageUsers')(req, reply);
                return controller.createUser(req, reply);
            });
            perm.put('/users/:id', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('manageUsers')(req, reply);
                return controller.updateUser(req, reply);
            });
            perm.delete('/users/:id', async (req, reply) => {
                await (0, leads_middleware_1.requirePermission)('manageUsers')(req, reply);
                return controller.deleteUser(req, reply);
            });
        });
        // ─── Connections — create/update/status/proxy/check/templates-sync ─────
        // Liberado pra ADMIN OU COLLABORATOR com permissão manageConnections.
        // DELETE fica em bloco admin-only abaixo (ação destrutiva mesmo com soft-delete).
        authed.register(async (mgr) => {
            mgr.addHook('preHandler', async (req, reply) => {
                if (req.leadUser?.role === 'ADMIN') return;
                await (0, leads_middleware_1.requirePermission)('manageConnections')(req, reply);
            });
            mgr.post('/connections', async (req, reply) => {
                const body = connections_schema_1.createConnectionSchema.safeParse(req.body);
                if (!body.success)
                    throw common_types_1.HttpError.badRequest(body.error.message);
                const { workspaceId } = req.leadUser;
                const sysAdmin = await database_1.prisma.user.findFirst({
                    where: { isActive: true },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' },
                });
                if (!sysAdmin)
                    throw common_types_1.HttpError.badRequest('Nenhum usuário do sistema encontrado');
                const result = await connService.create(body.data, sysAdmin.id, workspaceId);
                return reply.status(201).send(result);
            });
            mgr.get('/connections/:id', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.getById(req.params.id, workspaceId));
            });
            // ADMIN-ONLY: credenciais com Access Token descriptografado.
            // Bloqueia colaboradores com manageConnections — só role=ADMIN.
            mgr.get('/connections/:id/credentials', async (req, reply) => {
                if (req.leadUser?.role !== 'ADMIN') {
                    throw common_types_1.HttpError.forbidden('Apenas administradores podem visualizar credenciais');
                }
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.getCredentials(req.params.id, workspaceId));
            });
            // ADMIN-ONLY: permissões por usuário pra esta conexão.
            mgr.get('/connections/:id/access', async (req, reply) => {
                if (req.leadUser?.role !== 'ADMIN') {
                    throw common_types_1.HttpError.forbidden('Apenas administradores podem gerenciar permissões');
                }
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.listAccess(req.params.id, workspaceId));
            });
            mgr.put('/connections/:id/access', async (req, reply) => {
                if (req.leadUser?.role !== 'ADMIN') {
                    throw common_types_1.HttpError.forbidden('Apenas administradores podem gerenciar permissões');
                }
                const body = req.body || {};
                const userIds = Array.isArray(body.userIds) ? body.userIds.filter(s => typeof s === 'string') : [];
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.setAccess(req.params.id, userIds, workspaceId));
            });
            mgr.put('/connections/:id', async (req, reply) => {
                const body = connections_schema_1.updateConnectionSchema.safeParse(req.body);
                if (!body.success)
                    throw common_types_1.HttpError.badRequest(body.error.message);
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.update(req.params.id, body.data, undefined, workspaceId));
            });
            mgr.patch('/connections/:id/status', async (req, reply) => {
                const body = connections_schema_1.updateConnectionStatusSchema.safeParse(req.body);
                if (!body.success)
                    throw common_types_1.HttpError.badRequest(body.error.message);
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.updateStatus(req.params.id, body.data, workspaceId));
            });
            // PATCH /connections/:id/proxy — atualiza proxy_url/proxy_label/proxy_country
            // Per-WABA proxy: cada conexão Cloud API pode sair por IP residencial dedicado.
            // Raw SQL — colunas não estão no Prisma schema.
            mgr.patch('/connections/:id/proxy', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                const { id } = req.params;
                const { proxyUrl, proxyLabel, proxyCountry } = req.body || {};
                // Confirma que connection pertence ao workspace
                const conn = await database_1.prisma.whatsappConnection.findFirst({
                    where: { id, workspaceId }, select: { id: true },
                });
                if (!conn) throw common_types_1.HttpError.notFound('Conexão não encontrada');
                await database_1.prisma.$queryRawUnsafe(
                    `UPDATE whatsapp_connections SET
                        proxy_url = $1, proxy_label = $2, proxy_country = $3, updated_at = now()
                     WHERE id = $4::uuid`,
                    proxyUrl?.trim() || null,
                    proxyLabel?.trim() || null,
                    proxyCountry?.trim() || null,
                    id
                );
                return reply.send({ ok: true, proxyUrl: proxyUrl?.trim() || null, proxyLabel: proxyLabel?.trim() || null, proxyCountry: proxyCountry?.trim() || null });
            });
            mgr.get('/connections/:id/health', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.getHealth(req.params.id, workspaceId));
            });
            mgr.post('/connections/:id/check', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                return reply.send(await connService.checkToken(req.params.id, workspaceId));
            });
            mgr.post('/connections/:id/templates/sync', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                return reply.send(await templatesService.syncFromMeta(req.params.id, workspaceId));
            });
            // ─── Templates Meta (CRUD) — escopo via connection.workspace_id ─────
            // Helper local: verifica que o template pertence ao workspace do leadUser
            const assertTemplateInWorkspace = async (templateId, workspaceId) => {
                const t = await database_1.prisma.template.findUnique({
                    where: { id: templateId },
                    select: { id: true, connectionId: true, connection: { select: { workspaceId: true } } },
                });
                if (!t) throw common_types_1.HttpError.notFound('Template não encontrado');
                if (t.connection && t.connection.workspaceId && t.connection.workspaceId !== workspaceId) {
                    throw common_types_1.HttpError.forbidden('Template pertence a outro workspace');
                }
                return t;
            };
            mgr.post('/templates', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                // Se body tem connectionId, valida workspace ownership
                const body = req.body || {};
                if (body.connectionId) {
                    const c = await database_1.prisma.whatsappConnection.findFirst({
                        where: { id: body.connectionId, workspaceId },
                        select: { id: true },
                    });
                    if (!c) throw common_types_1.HttpError.notFound('Conexão não encontrada neste workspace');
                }
                // Usa sysAdmin id pra createdById (FK constraint) — mesmo trick do Embedded Signup
                const sysAdmin = await database_1.prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
                if (!sysAdmin) throw common_types_1.HttpError.badRequest('Nenhum usuário do sistema');
                return reply.status(201).send(await templatesService.create(body, sysAdmin.id));
            });
            mgr.post('/templates/:id/resubmit', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                await assertTemplateInWorkspace(req.params.id, workspaceId);
                return reply.send(await templatesService.resubmit(req.params.id));
            });
            mgr.put('/templates/:id', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                await assertTemplateInWorkspace(req.params.id, workspaceId);
                const sysAdmin = await database_1.prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
                return reply.send(await templatesService.update(req.params.id, req.body || {}, sysAdmin.id));
            });
            mgr.delete('/templates/:id', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                await assertTemplateInWorkspace(req.params.id, workspaceId);
                await templatesService.delete(req.params.id);
                return reply.status(204).send();
            });
            // POST /templates/:id/sync-status — alias pra resubmit (frontend antigo chamava esse path)
            mgr.post('/templates/:id/sync-status', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                await assertTemplateInWorkspace(req.params.id, workspaceId);
                // Se templatesService.syncStatus não existe, fallback pra refetch do meta-template-id na lista
                if (typeof templatesService.syncStatus === 'function') {
                    return reply.send(await templatesService.syncStatus(req.params.id));
                }
                // Fallback: retorna template atualizado do DB
                const t = await database_1.prisma.template.findUnique({ where: { id: req.params.id } });
                return reply.send(t);
            });
        });
        // ─── Connections (admin only — destrutivos) ────────────────────────────
        authed.register(async (admin) => {
            admin.addHook('preHandler', leads_middleware_1.requireLeadAdmin);
            admin.delete('/connections/:id', async (req, reply) => {
                const { workspaceId } = req.leadUser;
                const force = req.query?.force === 'true';
                await connService.delete(req.params.id, workspaceId, force);
                return reply.status(204).send();
            });
        });
    });
}
//# sourceMappingURL=leads.routes.js.map