"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadsService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../../config/database");
const common_types_1 = require("../../types/common.types");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const cloud_api_service_1 = require("../../services/whatsapp/cloud-api.service");
const kanban_service_1 = require("../../modules/kanban/kanban.service");
const client_1 = require("@prisma/client");
const redis_1 = require("../../config/redis");
const phone_normalizer_1 = require("../../utils/phone.normalizer");
const DEFAULT_PERMS = { viewAllLeads: false, manageLeads: false, exportLeads: false, manageKanban: false, manageUsers: false, viewReports: false };
/** Incrementa os contadores de uso do dia (Redis + DB) para uma conexão. */
async function incrementConnectionCounters(connectionId) {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000);
    const pipeline = redis_1.redis.pipeline();
    pipeline.incr(redis_1.RedisKeys.rateConnDay(connectionId));
    pipeline.expire(redis_1.RedisKeys.rateConnDay(connectionId), secondsUntilMidnight);
    pipeline.incr(redis_1.RedisKeys.rateConnMin(connectionId));
    pipeline.expire(redis_1.RedisKeys.rateConnMin(connectionId), 60);
    await pipeline.exec();
    await database_1.prisma.whatsappConnection.update({
        where: { id: connectionId },
        data: { messagesSentToday: { increment: 1 } },
    });
}
class LeadsService {
    app;
    constructor(app) {
        this.app = app;
    }
    // ─── Auth ──────────────────────────────────────────────────────────────────
    async hasAnyUser(workspaceSlug) {
        if (!workspaceSlug) {
            const count = await database_1.prisma.leadUser.count();
            return count > 0;
        }
        const workspace = await database_1.prisma.workspace.findUnique({ where: { slug: workspaceSlug.toLowerCase() } });
        if (!workspace)
            return false;
        const count = await database_1.prisma.leadUser.count({ where: { workspaceId: workspace.id } });
        return count > 0;
    }
    async setup(input) {
        const workspace = await database_1.prisma.workspace.findUnique({ where: { slug: input.workspaceSlug.toLowerCase() } });
        if (!workspace)
            throw common_types_1.HttpError.notFound('Workspace não encontrado');
        if (!workspace.isActive)
            throw common_types_1.HttpError.forbidden('Workspace inativo');
        const count = await database_1.prisma.leadUser.count({ where: { workspaceId: workspace.id } });
        if (count > 0)
            throw common_types_1.HttpError.conflict('Admin já configurado');
        const passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        const user = await database_1.prisma.leadUser.create({
            data: {
                name: input.name,
                email: input.email.toLowerCase(),
                passwordHash,
                role: 'ADMIN',
                workspaceId: workspace.id,
            },
        });
        const token = this.app.jwt.sign({ sub: user.id, role: user.role, type: 'lead', workspaceId: workspace.id }, { expiresIn: '30d' });
        return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }
    async login(input) {
        const workspace = await database_1.prisma.workspace.findUnique({ where: { slug: input.workspaceSlug.toLowerCase() } });
        if (!workspace || !workspace.isActive)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        const user = await database_1.prisma.leadUser.findUnique({
            where: { workspaceId_email: { workspaceId: workspace.id, email: input.email.toLowerCase() } },
        });
        if (!user || !user.isActive)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        const valid = await bcryptjs_1.default.compare(input.password, user.passwordHash);
        if (!valid)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        const token = this.app.jwt.sign({ sub: user.id, role: user.role, type: 'lead', workspaceId: workspace.id }, { expiresIn: '30d' });
        return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }
    // ─── User management (admin only) ─────────────────────────────────────────
    async listUsers(workspaceId) {
        return database_1.prisma.leadUser.findMany({
            where: { workspaceId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, permissions: true },
        });
    }
    async createUser(input, workspaceId) {
        const existing = await database_1.prisma.leadUser.findUnique({
            where: { workspaceId_email: { workspaceId, email: input.email.toLowerCase() } },
        });
        if (existing)
            throw common_types_1.HttpError.conflict('E-mail já cadastrado');
        const passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        return database_1.prisma.leadUser.create({
            data: { name: input.name, email: input.email.toLowerCase(), passwordHash, role: 'COLLABORATOR', workspaceId },
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        });
    }
    async updateUser(id, input, workspaceId, requestingUserId) {
        const user = await database_1.prisma.leadUser.findFirst({ where: { id, workspaceId } });
        if (!user)
            throw common_types_1.HttpError.notFound('Usuário não encontrado');
        const data = {};
        if (input.name)
            data.name = input.name;
        if (input.email) {
            const existing = await database_1.prisma.leadUser.findUnique({
                where: { workspaceId_email: { workspaceId, email: input.email.toLowerCase() } },
            });
            if (existing && existing.id !== id)
                throw common_types_1.HttpError.conflict('E-mail já em uso');
            data.email = input.email.toLowerCase();
        }
        if (input.password)
            data.passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        if (input.isActive !== undefined)
            data.isActive = input.isActive;
        if (input.permissions !== undefined)
            data.permissions = input.permissions;
        if (input.role && input.role !== user.role) {
            if (id === requestingUserId)
                throw common_types_1.HttpError.conflict('Não é possível alterar o próprio papel');
            if (input.role === 'COLLABORATOR' && user.role === 'ADMIN') {
                const adminCount = await database_1.prisma.leadUser.count({ where: { workspaceId, role: 'ADMIN' } });
                if (adminCount <= 1)
                    throw common_types_1.HttpError.conflict('Não é possível rebaixar o único administrador');
            }
            data.role = input.role;
        }
        return database_1.prisma.leadUser.update({
            where: { id },
            data,
            select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true, createdAt: true },
        });
    }
    async deleteUser(id, workspaceId) {
        const user = await database_1.prisma.leadUser.findFirst({ where: { id, workspaceId } });
        if (!user)
            throw common_types_1.HttpError.notFound('Usuário não encontrado');
        if (user.role === 'ADMIN')
            throw common_types_1.HttpError.conflict('Não é possível excluir o admin');
        await database_1.prisma.lead.updateMany({ where: { assignedToId: id, workspaceId }, data: { assignedToId: null } });
        await database_1.prisma.leadUser.delete({ where: { id } });
    }
    // ─── Profile ───────────────────────────────────────────────────────────────
    async getMe(id) {
        const user = await database_1.prisma.leadUser.findUnique({
            where: { id },
            select: { id: true, name: true, email: true, role: true, avatar: true },
        });
        if (!user)
            throw common_types_1.HttpError.notFound('Usuário não encontrado');
        return user;
    }
    async updateProfile(id, input) {
        const data = {};
        if (input.name)
            data.name = input.name;
        if (input.password)
            data.passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        if (input.avatar !== undefined)
            data.avatar = input.avatar; // null removes avatar
        return database_1.prisma.leadUser.update({
            where: { id },
            data,
            select: { id: true, name: true, email: true, role: true, avatar: true },
        });
    }
    // ─── Leads ─────────────────────────────────────────────────────────────────
    async list(userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const where = (role === 'ADMIN' || permissions.viewAllLeads)
            ? { workspaceId }
            : { workspaceId, assignedToId: userId };
        const leads = await database_1.prisma.lead.findMany({
            where,
            orderBy: [{ stageMovedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
            include: {
                assignedTo: { select: { id: true, name: true } },
                stage: { select: { id: true, name: true, color: true } },
            },
        });
        // Busca a última mensagem de cada contato em uma única query
        const contactIds = leads.map(l => l.contactId).filter(Boolean);
        if (contactIds.length === 0)
            return leads;
        // Raw query para pegar última mensagem por contactId de forma eficiente
        const lastMessages = await database_1.prisma.$queryRaw `
      SELECT DISTINCT ON (contact_id)
        contact_id, message_content, direction, sent_at
      FROM messages
      WHERE contact_id = ANY(${contactIds}::uuid[])
        AND message_content IS NOT NULL
      ORDER BY contact_id, sent_at DESC NULLS LAST
    `;
        const previewMap = new Map(lastMessages.map(m => [m.contact_id, m]));
        return leads.map(l => {
            const preview = l.contactId ? previewMap.get(l.contactId) : undefined;
            return {
                ...l,
                lastMessagePreview: preview?.message_content ?? null,
                lastMessageOut: preview ? preview.direction === 'OUTBOUND' : null,
            };
        });
    }
    async create(input, workspaceId) {
        const phone = input.phone.replace(/\D/g, '');
        const blocked = await database_1.prisma.blockedPhone.findFirst({ where: { phone, workspaceId } });
        if (blocked)
            throw common_types_1.HttpError.conflict('Este número está bloqueado e não pode ser adicionado', 'PHONE_BLOCKED');
        // Dedup: reject if a lead already exists for this canonical phone (handles 9th digit variants)
        const canonicalPhone = (0, phone_normalizer_1.canonicalBrazilianPhone)(input.phone);
        const phoneVariants = (0, phone_normalizer_1.brazilianPhoneVariants)(canonicalPhone);
        const existingLead = await database_1.prisma.lead.findFirst({
            where: { workspaceId, phone: { in: phoneVariants } },
        });
        if (existingLead)
            throw common_types_1.HttpError.conflict('Já existe um lead com este número', 'DUPLICATE_LEAD');
        const contactId = await this.findOrCreateContact(input.phone, input.name);
        return database_1.prisma.lead.create({
            data: {
                name: input.name,
                phone: input.phone,
                origin: input.origin,
                notes: input.notes,
                assignedToId: input.assignedToId ?? null,
                contactId,
                workspaceId,
            },
            include: { assignedTo: { select: { id: true, name: true } } },
        });
    }
    async findOrCreateContact(phone, name) {
        try {
            const phoneNormalized = (0, phone_normalizer_1.canonicalBrazilianPhone)(phone);
            if (!phoneNormalized)
                return null;
            // Try to find by any phone variant (handles 9th digit mismatch)
            const variants = (0, phone_normalizer_1.brazilianPhoneVariants)(phoneNormalized);
            const existing = await database_1.prisma.contact.findFirst({
                where: { phoneNormalized: { in: variants } },
                select: { id: true, lead: { select: { id: true } } },
            });
            if (existing) {
                if (!existing.lead)
                    return existing.id;
                return null;
            }
            const contact = await database_1.prisma.contact.create({
                data: { name, phone, phoneNormalized, optIn: true, optInSource: 'lead_import' },
                select: { id: true },
            });
            return contact.id;
        }
        catch {
            return null;
        }
    }
    async update(id, input, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const lead = await database_1.prisma.lead.findFirst({ where: { id, workspaceId } });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && !permissions.manageLeads && lead.assignedToId !== userId) {
            throw common_types_1.HttpError.forbidden('Sem permissão para editar este lead');
        }
        const data = { ...input };
        if (input.status === 'pego' && !lead.pegadoAt) {
            data.pegadoAt = new Date();
        }
        if (input.stageId !== undefined && input.stageId !== lead.stageId) {
            data.stageMovedAt = new Date();
        }
        const updated = await database_1.prisma.lead.update({
            where: { id },
            data,
            include: { assignedTo: { select: { id: true, name: true } } },
        });
        // Registra evento de atribuição no histórico do lead
        if (input.assignedToId !== undefined && input.assignedToId !== lead.assignedToId) {
            const actor = await database_1.prisma.leadUser.findUnique({ where: { id: userId }, select: { name: true } });
            if (input.assignedToId) {
                const newUser = await database_1.prisma.leadUser.findUnique({ where: { id: input.assignedToId }, select: { name: true } });
                await database_1.prisma.$executeRaw `INSERT INTO lead_events (lead_id, actor_id, actor_name, type, payload)
          VALUES (${id}::uuid, ${userId}::uuid, ${actor?.name ?? null}, 'ASSIGNED',
          ${JSON.stringify({ toId: input.assignedToId, toName: newUser?.name ?? null, fromId: lead.assignedToId, fromName: null })}::jsonb)`;
            }
            else {
                await database_1.prisma.$executeRaw `INSERT INTO lead_events (lead_id, actor_id, actor_name, type, payload)
          VALUES (${id}::uuid, ${userId}::uuid, ${actor?.name ?? null}, 'UNASSIGNED',
          ${JSON.stringify({ fromId: lead.assignedToId })}::jsonb)`;
            }
        }
        // Fire LEAD_ASSIGNED rule if assignedToId was just set
        if (input.assignedToId && input.assignedToId !== lead.assignedToId) {
            kanban_service_1.KanbanService.applyEventRules(workspaceId, id, updated.stageId, 'LEAD_ASSIGNED').catch((err) => logger_1.logger.warn({ err, leadId: id }, 'LEAD_ASSIGNED rule error'));
        }
        // Fire AUTO_ASSIGN rules if lead has no vendor and stage changed
        if (!updated.assignedToId && input.stageId !== undefined && input.stageId !== lead.stageId) {
            kanban_service_1.KanbanService.applyAutoAssignRules(workspaceId, id, updated.stageId).catch((err) => logger_1.logger.warn({ err, leadId: id }, 'AUTO_ASSIGN rule error'));
        }
        return updated;
    }
    async report(from, to, workspaceId) {
        const toEOD = new Date(to);
        toEOD.setHours(23, 59, 59, 999);
        const [allLeads, users] = await Promise.all([
            database_1.prisma.lead.findMany({
                where: { workspaceId },
                select: {
                    id: true,
                    status: true,
                    assignedToId: true,
                    pegadoAt: true,
                    createdAt: true,
                    assignedTo: { select: { id: true, name: true } },
                },
            }),
            database_1.prisma.leadUser.findMany({
                where: { workspaceId, role: 'COLLABORATOR' },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
        ]);
        const pickedInPeriod = allLeads.filter((l) => l.pegadoAt && l.pegadoAt >= from && l.pegadoAt <= toEOD);
        const byVendedor = {};
        for (const l of pickedInPeriod) {
            const key = l.assignedTo?.name || '(sem nome)';
            if (!byVendedor[key])
                byVendedor[key] = { name: key, pego: 0, em_andamento: 0, perdido: 0, disponivel: 0 };
            const stat = l.status;
            if (stat !== 'name')
                byVendedor[key][stat]++;
        }
        const portfolio = users.map((u) => {
            const assigned = allLeads.filter((l) => l.assignedToId === u.id);
            return {
                id: u.id,
                name: u.name,
                total: assigned.length,
                disponivel: assigned.filter((l) => l.status === 'disponivel').length,
                pego: assigned.filter((l) => l.status === 'pego').length,
                em_andamento: assigned.filter((l) => l.status === 'em_andamento').length,
                perdido: assigned.filter((l) => l.status === 'perdido').length,
            };
        });
        return {
            period: { from: from.toISOString(), to: toEOD.toISOString() },
            activity: Object.values(byVendedor).sort((a, b) => b.pego - a.pego),
            portfolio,
        };
    }
    async delete(id, workspaceId) {
        const lead = await database_1.prisma.lead.findFirst({ where: { id, workspaceId } });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        await database_1.prisma.lead.delete({ where: { id } });
    }
    async blockLead(id, workspaceId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id, workspaceId },
            select: { id: true, phone: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        const phone = lead.phone.replace(/\D/g, '');
        await Promise.all([
            database_1.prisma.lead.update({
                where: { id },
                data: { isBlocked: true, blockedAt: new Date() },
            }),
            database_1.prisma.blockedPhone.upsert({
                where: { phone },
                create: { phone, workspaceId },
                update: { blockedAt: new Date() },
            }),
        ]);
        return { blocked: true };
    }
    async unblockLead(id, workspaceId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id, workspaceId },
            select: { id: true, phone: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        const phone = lead.phone.replace(/\D/g, '');
        await Promise.all([
            database_1.prisma.lead.update({ where: { id }, data: { isBlocked: false, blockedAt: null } }),
            database_1.prisma.blockedPhone.deleteMany({ where: { phone, workspaceId } }),
        ]);
        return { blocked: false };
    }
    async deleteConversation(leadId, workspaceId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, contactId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (!lead.contactId)
            return { deleted: 0 };
        const result = await database_1.prisma.message.deleteMany({ where: { contactId: lead.contactId } });
        return { deleted: result.count };
    }
    async isPhoneBlocked(phone, workspaceId) {
        const normalized = phone.replace(/\D/g, '');
        const blocked = await database_1.prisma.blockedPhone.findFirst({
            where: { phone: normalized, workspaceId },
        });
        return !!blocked;
    }
    async bulkAssign(leadIds, assignedToId, workspaceId) {
        const result = await database_1.prisma.lead.updateMany({
            where: { id: { in: leadIds }, workspaceId },
            data: { assignedToId },
        });
        return { updated: result.count };
    }
    async redistribute(scope, userIds, workspaceId) {
        if (userIds.length === 0)
            throw common_types_1.HttpError.badRequest('Selecione ao menos um colaborador');
        const where = scope === 'unassigned'
            ? { workspaceId, assignedToId: null }
            : { workspaceId };
        const leads = await database_1.prisma.lead.findMany({ where, select: { id: true }, orderBy: { createdAt: 'asc' } });
        if (leads.length === 0)
            return { distributed: 0, perUser: {} };
        const perUser = {};
        const updates = [];
        leads.forEach((lead, i) => {
            const userId = userIds[i % userIds.length];
            updates.push({ id: lead.id, assignedToId: userId });
            perUser[userId] = (perUser[userId] ?? 0) + 1;
        });
        await database_1.prisma.$transaction(updates.map((u) => database_1.prisma.lead.update({ where: { id: u.id }, data: { assignedToId: u.assignedToId } })));
        return { distributed: leads.length, perUser };
    }
    async bulkImport(input, workspaceId) {
        const existing = await database_1.prisma.lead.findMany({ where: { workspaceId }, select: { phone: true } });
        const existingPhones = new Set(existing.map((l) => (0, phone_normalizer_1.canonicalBrazilianPhone)(l.phone)));
        const blockedList = await database_1.prisma.blockedPhone.findMany({ where: { workspaceId }, select: { phone: true } });
        const blockedPhones = new Set(blockedList.map((b) => b.phone));
        const toInsert = [];
        for (const item of input.items) {
            const digits = (0, phone_normalizer_1.canonicalBrazilianPhone)(item.phone);
            if (existingPhones.has(digits))
                continue;
            if (blockedPhones.has(digits))
                continue;
            existingPhones.add(digits);
            toInsert.push({
                name: item.name,
                phone: item.phone,
                origin: item.origin,
                notes: item.notes,
                assignedToId: input.assignedToId ?? null,
            });
        }
        if (toInsert.length > 0) {
            for (const item of toInsert) {
                const contactId = await this.findOrCreateContact(item.phone, item.name);
                await database_1.prisma.lead.create({ data: { ...item, contactId, workspaceId } });
            }
        }
        return { imported: toInsert.length, skipped: input.items.length - toInsert.length };
    }
    async getConversation(leadId, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        if (!lead.contactId)
            return { messages: [], hasContact: false };
        const [messages, eventsRaw] = await Promise.all([
            database_1.prisma.message.findMany({
                where: { contactId: lead.contactId },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    direction: true,
                    status: true,
                    messageContent: true,
                    metaResponse: true,
                    errorCode: true,
                    errorMessage: true,
                    sentAt: true,
                    createdAt: true,
                    connectionId: true,
                    connection: { select: { id: true, name: true } },
                },
            }),
            database_1.prisma.$queryRaw `
        SELECT id, actor_name, type, payload, created_at FROM lead_events
        WHERE lead_id = ${leadId}::uuid ORDER BY created_at ASC
      `,
        ]);
        const events = eventsRaw.map(e => ({
            id: e.id,
            actorName: e.actor_name,
            type: e.type,
            payload: e.payload,
            createdAt: e.created_at,
        }));
        return { messages, events, hasContact: true };
    }
    async getTagOptions(workspaceId) {
        const result = await database_1.prisma.lead.findMany({
            where: { workspaceId, tags: { isEmpty: false } },
            select: { tags: true },
        });
        const all = result.flatMap((l) => l.tags);
        return [...new Set(all)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
    async markAsRead(leadId, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const lead = await database_1.prisma.lead.findFirst({ where: { id: leadId, workspaceId }, select: { id: true, assignedToId: true } });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        await database_1.prisma.lead.update({ where: { id: leadId }, data: { unreadCount: 0 } });
        return { ok: true };
    }
    async startConversation(leadId, connectionId, templateName, language, variables, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true, phone: true, name: true, stageId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        const connection = await database_1.prisma.whatsappConnection.findFirst({
            where: { id: connectionId, status: 'ACTIVE' },
            select: { id: true, phoneNumberId: true, accessTokenEnc: true, metaQualityRating: true },
        });
        if (!connection)
            throw common_types_1.HttpError.badRequest('Conexão não encontrada ou inativa');
        if (connection.metaQualityRating === 'RED')
            throw common_types_1.HttpError.badRequest('Conexão com qualidade baixa (RED) na Meta — envio de templates bloqueado. Respostas a conversas existentes ainda funcionam.', 'QUALITY_RED');
        // Ensure contact exists
        const phone = lead.phone.replace(/\D/g, '');
        // Meta exige número com DDI. Se não começar com código de país conhecido, adiciona 55 (Brasil)
        const phoneForMeta = phone.startsWith('55') || phone.startsWith('1') || phone.startsWith('44') || phone.startsWith('351')
            ? phone
            : `55${phone}`;
        // phoneNormalized sempre com DDI (formato E.164 sem +) para garantir match com webhook inbound
        const phoneNormalized = phoneForMeta;
        // Todas as variantes (com/sem DDI, com/sem 9º dígito) para evitar duplicatas
        const phoneVariants = (0, phone_normalizer_1.brazilianPhoneVariants)(phoneNormalized);
        let contact = lead.contactId
            ? await database_1.prisma.contact.findUnique({ where: { id: lead.contactId }, select: { id: true, phoneNormalized: true } })
            : await database_1.prisma.contact.findFirst({ where: { phoneNormalized: { in: phoneVariants } }, select: { id: true, phoneNormalized: true } });
        if (!contact) {
            try {
                contact = await database_1.prisma.contact.create({
                    data: { name: lead.name, phone, phoneNormalized, optIn: true, optInSource: 'manual' },
                    select: { id: true, phoneNormalized: true },
                });
            }
            catch {
                contact = await database_1.prisma.contact.findFirst({ where: { phoneNormalized: { in: phoneVariants } }, select: { id: true, phoneNormalized: true } });
                if (!contact)
                    throw common_types_1.HttpError.badRequest('Erro ao criar contato');
            }
        }
        if (!lead.contactId) {
            await database_1.prisma.lead.update({ where: { id: leadId }, data: { contactId: contact.id } });
        }
        // Fetch template body to build readable messageContent
        const templateRecord = await database_1.prisma.template.findFirst({
            where: { name: templateName, connectionId: connection.id },
            select: { body: true },
        });
        let resolvedContent = `[Template: ${templateName}]`;
        if (templateRecord?.body) {
            resolvedContent = templateRecord.body;
            variables.forEach((v, i) => {
                resolvedContent = resolvedContent.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v);
            });
        }
        // Build template payload
        const components = [];
        if (variables.length > 0) {
            components.push({
                type: 'body',
                parameters: variables.map(v => ({ type: 'text', text: v })),
            });
        }
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const cloudApi = new cloud_api_service_1.CloudApiService();
        const result = await cloudApi.sendTemplate(connection.phoneNumberId, accessToken, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneForMeta,
            type: 'template',
            template: { name: templateName, language: { code: language }, components },
        });
        if (!result.success)
            throw common_types_1.HttpError.badRequest(result.error?.message || 'Falha ao enviar template');
        await incrementConnectionCounters(connection.id).catch(() => { });
        const msg = await database_1.prisma.message.create({
            data: {
                contactId: contact.id,
                connectionId: connection.id,
                direction: 'OUTBOUND',
                status: client_1.MessageStatus.SENT,
                wamid: result.wamid ?? `manual_${Date.now()}`,
                messageContent: resolvedContent,
                metaResponse: result.rawResponse,
                sentAt: new Date(),
            },
            select: {
                id: true, direction: true, status: true,
                messageContent: true, errorCode: true, errorMessage: true,
                sentAt: true, createdAt: true,
                connectionId: true, connection: { select: { id: true, name: true } },
            },
        });
        await database_1.prisma.lead.update({
            where: { id: leadId },
            data: { lastMessageAt: new Date() },
        });
        // Aplica regras do tipo TEMPLATE_SENT e FIRST_MESSAGE do pipeline
        await kanban_service_1.KanbanService.applyEventRules(workspaceId, leadId, lead.stageId, 'TEMPLATE_SENT').catch(() => { });
        await kanban_service_1.KanbanService.applyEventRules(workspaceId, leadId, lead.stageId, 'FIRST_MESSAGE').catch(() => { });
        // Busca o stageId atualizado para retornar ao frontend
        const updated = await database_1.prisma.lead.findUnique({ where: { id: leadId }, select: { stageId: true } });
        return { ...msg, newStageId: updated?.stageId ?? null };
    }
    async sendReply(leadId, text, userId, role, workspaceId, permissions = DEFAULT_PERMS, preferredConnectionId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true, phone: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        if (!lead.contactId)
            throw common_types_1.HttpError.badRequest('Lead sem contato vinculado');
        const contact = await database_1.prisma.contact.findUnique({
            where: { id: lead.contactId },
            select: { phone: true, phoneNormalized: true },
        });
        if (!contact)
            throw common_types_1.HttpError.badRequest('Contato não encontrado');
        const lastMessage = await database_1.prisma.message.findFirst({
            where: { contactId: lead.contactId, direction: 'INBOUND' },
            orderBy: { sentAt: 'desc' },
            select: { connectionId: true },
        });
        // Prioridade: 1) conexão escolhida pelo operador, 2) conexão da última mensagem INBOUND, 3) qualquer ativa do workspace
        const preferredId = preferredConnectionId || lastMessage?.connectionId || null;
        let connection = preferredId
            ? await database_1.prisma.whatsappConnection.findFirst({
                where: { id: preferredId, status: 'ACTIVE' },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true },
            })
            : null;
        // Fallback: qualquer conexão ativa do workspace
        if (!connection) {
            connection = await database_1.prisma.whatsappConnection.findFirst({
                where: { status: 'ACTIVE', OR: [{ workspaceId }, { workspaceId: null }] },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true },
            });
        }
        if (!connection)
            throw common_types_1.HttpError.badRequest('Nenhuma conexão ativa disponível');
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const to = contact.phoneNormalized;
        const cloudApi = new cloud_api_service_1.CloudApiService();
        const result = await cloudApi.sendText(connection.phoneNumberId, accessToken, to, text);
        // Se a Meta rejeitou: salva como FAILED para exibir o erro real no chat
        if (!result.success) {
            const msg = await database_1.prisma.message.create({
                data: {
                    contactId: lead.contactId,
                    connectionId: connection.id,
                    direction: 'OUTBOUND',
                    status: client_1.MessageStatus.FAILED,
                    wamid: `failed_${Date.now()}`,
                    messageContent: text,
                    metaResponse: (result.rawResponse ?? {}),
                    sentAt: new Date(),
                    failedAt: new Date(),
                    errorCode: result.error?.code ? String(result.error.code) : null,
                    errorMessage: result.error?.message ?? 'Falha ao enviar mensagem',
                },
                select: {
                    id: true, direction: true, status: true,
                    messageContent: true, errorCode: true, errorMessage: true,
                    sentAt: true, createdAt: true,
                    connectionId: true, connection: { select: { id: true, name: true } },
                },
            });
            return msg;
        }
        // Respostas de texto livre (janela 24h) não contabilizam no contador — só templates
        const msg = await database_1.prisma.message.create({
            data: {
                contactId: lead.contactId,
                connectionId: connection.id,
                direction: 'OUTBOUND',
                status: client_1.MessageStatus.SENT,
                wamid: result.wamid ?? `manual_${Date.now()}`,
                messageContent: text,
                metaResponse: result.rawResponse,
                sentAt: new Date(),
            },
            select: {
                id: true, direction: true, status: true,
                messageContent: true, errorCode: true, errorMessage: true,
                sentAt: true, createdAt: true,
                connectionId: true, connection: { select: { id: true, name: true } },
            },
        });
        await database_1.prisma.lead.update({
            where: { id: leadId },
            data: { lastMessageAt: new Date() },
        });
        // Dispara FIRST_MESSAGE se for a primeira mensagem OUTBOUND deste lead
        const outboundCount = await database_1.prisma.message.count({
            where: { contactId: lead.contactId, direction: 'OUTBOUND' },
        });
        if (outboundCount <= 1) {
            const updatedLead = await database_1.prisma.lead.findUnique({ where: { id: leadId }, select: { stageId: true, workspaceId: true } });
            if (updatedLead?.workspaceId) {
                kanban_service_1.KanbanService.applyEventRules(updatedLead.workspaceId, leadId, updatedLead.stageId, 'FIRST_MESSAGE').catch(() => { });
            }
        }
        return msg;
    }
    // ─── Dashboard ─────────────────────────────────────────────────────────────
    async getDashboardAdmin(workspaceId, from, to) {
        const now = new Date();
        const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        // Period boundaries
        const periodStart = from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const periodEnd = to ?? now;
        const daysDiff = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
        const inPeriod = (d) => !!d && d >= periodStart && d <= periodEnd;
        // ── Parallel queries ─────────────────────────────────────────────────────
        const [allLeads, users, stages, connections, initiatedByOpRaw, initiatedByDayRaw, initiatedByStageRaw, responseTimeByOpRaw] = await Promise.all([
            database_1.prisma.lead.findMany({
                where: { workspaceId },
                select: {
                    id: true,
                    status: true,
                    assignedToId: true,
                    stageId: true,
                    unreadCount: true,
                    lastMessageAt: true,
                    stageMovedAt: true,
                    createdAt: true,
                },
            }),
            database_1.prisma.leadUser.findMany({
                where: { workspaceId },
                select: { id: true, name: true, avatar: true, isActive: true, role: true },
                orderBy: { name: 'asc' },
            }),
            database_1.prisma.stage.findMany({
                where: { pipeline: { workspaceId } },
                select: { id: true, name: true, color: true, position: true },
                orderBy: { position: 'asc' },
            }),
            database_1.prisma.whatsappConnection.findMany({
                where: { workspaceId },
                select: { id: true, name: true, status: true, phoneNumberId: true },
                orderBy: { priority: 'desc' },
            }),
            // Iniciados: distinct leads with ≥1 outbound message in period, grouped by assignedToId
            database_1.prisma.$queryRaw `
        SELECT l.assigned_to_id AS op_id, COUNT(DISTINCT l.id) AS cnt
        FROM messages m
        JOIN leads l ON l.contact_id = m.contact_id
        WHERE m.direction = 'OUTBOUND'
          AND m.sent_at >= ${periodStart}
          AND m.sent_at <= ${periodEnd}
          AND l.workspace_id = ${workspaceId}::uuid
        GROUP BY l.assigned_to_id
      `,
            // Timeline: initiated per day (outbound messages)
            database_1.prisma.$queryRaw `
        SELECT to_char(date_trunc('day', m.sent_at), 'YYYY-MM-DD') AS day, COUNT(DISTINCT l.id) AS cnt
        FROM messages m
        JOIN leads l ON l.contact_id = m.contact_id
        WHERE m.direction = 'OUTBOUND'
          AND m.sent_at >= ${periodStart}
          AND m.sent_at <= ${periodEnd}
          AND l.workspace_id = ${workspaceId}::uuid
        GROUP BY 1
      `,
            // Iniciados por etapa: leads com ≥1 outbound no período, agrupados pela etapa atual
            database_1.prisma.$queryRaw `
        SELECT l.stage_id, COUNT(DISTINCT l.id) AS cnt
        FROM messages m
        JOIN leads l ON l.contact_id = m.contact_id
        WHERE m.direction = 'OUTBOUND'
          AND m.sent_at >= ${periodStart}
          AND m.sent_at <= ${periodEnd}
          AND l.workspace_id = ${workspaceId}::uuid
        GROUP BY l.stage_id
      `,
            // T. resposta: for leads whose FIRST-EVER outbound message was in the period,
            // average time (minutes) from lead creation to that first message, per operator
            database_1.prisma.$queryRaw `
        SELECT l.assigned_to_id AS op_id,
               ROUND(AVG(EXTRACT(EPOCH FROM (fm.first_sent - l.created_at)) / 60))::int AS avg_min
        FROM (
          SELECT contact_id, MIN(sent_at) AS first_sent
          FROM messages
          WHERE direction = 'OUTBOUND'
          GROUP BY contact_id
        ) fm
        JOIN leads l ON l.contact_id = fm.contact_id
        WHERE l.workspace_id = ${workspaceId}::uuid
          AND l.assigned_to_id IS NOT NULL
          AND fm.first_sent >= ${periodStart}
          AND fm.first_sent <= ${periodEnd}
          AND fm.first_sent > l.created_at
        GROUP BY l.assigned_to_id
      `,
        ]);
        // Build lookup maps
        const initiatedByOp = {};
        for (const r of initiatedByOpRaw) {
            if (r.op_id)
                initiatedByOp[r.op_id] = Number(r.cnt);
        }
        const initiatedByDay = {};
        for (const r of initiatedByDayRaw)
            initiatedByDay[r.day] = Number(r.cnt);
        const initiatedByStage = {};
        let totalInitiated = 0;
        for (const r of initiatedByStageRaw) {
            const cnt = Number(r.cnt);
            totalInitiated += cnt;
            if (r.stage_id)
                initiatedByStage[r.stage_id] = cnt;
        }
        const responseTimeByOp = {};
        for (const r of responseTimeByOpRaw)
            if (r.op_id)
                responseTimeByOp[r.op_id] = Number(r.avg_min);
        // ── Snapshot — current state of ALL leads ────────────────────────────────
        const total = allLeads.length;
        const disponivel = allLeads.filter(l => l.status === 'disponivel').length;
        const pego = allLeads.filter(l => l.status === 'pego').length;
        const em_andamento = allLeads.filter(l => l.status === 'em_andamento').length;
        const perdido = allLeads.filter(l => l.status === 'perdido').length;
        const active = pego + em_andamento;
        const conversionRate = total > 0 ? ((active / total) * 100).toFixed(1) : '0';
        const lossRate = total > 0 ? ((perdido / total) * 100).toFixed(1) : '0';
        // ── Period events ─────────────────────────────────────────────────────────
        // newLeads:    leads created in period
        // initiated:   leads with ≥1 outbound message in period (real contacts started)
        // stageMoves:  leads that changed stage in period
        // activeConvs: leads with any message activity in period
        const newLeads = allLeads.filter(l => inPeriod(l.createdAt)).length;
        const initiated = totalInitiated;
        const stageMoves = allLeads.filter(l => inPeriod(l.stageMovedAt)).length;
        const activeConvs = allLeads.filter(l => inPeriod(l.lastMessageAt)).length;
        // ── Alerts — current state ────────────────────────────────────────────────
        const leadsWithUnread = allLeads.filter(l => l.unreadCount > 0);
        const pendingReplies = leadsWithUnread.length;
        const totalUnread = leadsWithUnread.reduce((acc, l) => acc + l.unreadCount, 0);
        const unassigned = allLeads.filter(l => !l.assignedToId && l.status !== 'perdido').length;
        const stale = allLeads.filter(l => l.status === 'em_andamento' && l.lastMessageAt && l.lastMessageAt < staleThreshold).length;
        // ── Team — period metrics per operator ───────────────────────────────────
        const operators = users
            .filter(u => u.role === 'COLLABORATOR')
            .map(u => {
            const assigned = allLeads.filter(l => l.assignedToId === u.id);
            const opNewLeads = assigned.filter(l => inPeriod(l.createdAt)).length;
            const opInitiated = initiatedByOp[u.id] ?? 0;
            const opStageMoves = assigned.filter(l => inPeriod(l.stageMovedAt)).length;
            const opActiveConvs = assigned.filter(l => inPeriod(l.lastMessageAt)).length;
            const opUnreadTotal = assigned.reduce((acc, l) => acc + l.unreadCount, 0);
            const avgResponseMinutes = responseTimeByOp[u.id] ?? null;
            return {
                id: u.id,
                name: u.name,
                avatar: u.avatar ?? null,
                isActive: u.isActive,
                total: assigned.length,
                newLeads: opNewLeads,
                initiated: opInitiated,
                stageMoves: opStageMoves,
                activeConvs: opActiveConvs,
                unreadTotal: opUnreadTotal,
                avgResponseMinutes,
            };
        })
            .sort((a, b) => b.total - a.total);
        // ── Pipeline — snapshot count + initiated (outbound) per stage in period ────
        const stageCount = stages.map(s => ({
            id: s.id,
            name: s.name,
            color: s.color,
            count: allLeads.filter(l => l.stageId === s.id).length,
            initiatedInPeriod: initiatedByStage[s.id] ?? 0,
        }));
        const withoutStage = allLeads.filter(l => !l.stageId && l.status !== 'perdido').length;
        // ── Timeline — period events per day ──────────────────────────────────────
        const last14days = buildTimeline(daysDiff, periodStart).map(date => {
            const dateStart = new Date(date + 'T00:00:00.000Z');
            const dateEnd = new Date(date + 'T23:59:59.999Z');
            const inDay = (d) => !!d && d >= dateStart && d <= dateEnd;
            return {
                date,
                created: allLeads.filter(l => inDay(l.createdAt)).length,
                initiated: initiatedByDay[date] ?? 0,
            };
        });
        return {
            overview: { total, disponivel, pego, em_andamento, perdido, conversionRate, lossRate, newLeads, initiated, stageMoves, activeConvs },
            alerts: { pendingReplies, totalUnread, unassigned, stale },
            team: { totalOperators: operators.length, activeOperators: operators.filter(o => o.isActive).length, operators },
            pipeline: { stages: stageCount, withoutStage, initiatedTotal: totalInitiated },
            timeline: { last14days },
            connections: connections.map(c => ({ id: c.id, name: c.name, status: c.status, phoneNumberId: c.phoneNumberId })),
        };
    }
    async getDashboardOperator(userId, workspaceId, from, to) {
        const now = new Date();
        // Period boundaries
        const periodStart = from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const periodEnd = to ?? now;
        const daysDiff = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
        const inPeriod = (d) => !!d && d >= periodStart && d <= periodEnd;
        const [myLeads, myInitiatedRaw, myResponseTimeRaw] = await Promise.all([
            database_1.prisma.lead.findMany({
                where: { workspaceId, assignedToId: userId },
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    status: true,
                    unreadCount: true,
                    lastMessageAt: true,
                    stageMovedAt: true,
                    createdAt: true,
                    tags: true,
                    stageId: true,
                    stage: { select: { name: true, color: true } },
                },
                orderBy: { lastMessageAt: 'desc' },
            }),
            // Iniciados: distinct leads assigned to this operator with ≥1 outbound message in period
            database_1.prisma.$queryRaw `
        SELECT COUNT(DISTINCT l.id) AS cnt
        FROM messages m
        JOIN leads l ON l.contact_id = m.contact_id
        WHERE m.direction = 'OUTBOUND'
          AND m.sent_at >= ${periodStart}
          AND m.sent_at <= ${periodEnd}
          AND l.workspace_id = ${workspaceId}::uuid
          AND l.assigned_to_id = ${userId}::uuid
      `,
            // T. resposta: leads whose first-ever outbound message was in the period
            database_1.prisma.$queryRaw `
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (fm.first_sent - l.created_at)) / 60))::int AS avg_min
        FROM (
          SELECT contact_id, MIN(sent_at) AS first_sent
          FROM messages
          WHERE direction = 'OUTBOUND'
          GROUP BY contact_id
        ) fm
        JOIN leads l ON l.contact_id = fm.contact_id
        WHERE l.workspace_id = ${workspaceId}::uuid
          AND l.assigned_to_id = ${userId}::uuid
          AND fm.first_sent >= ${periodStart}
          AND fm.first_sent <= ${periodEnd}
          AND fm.first_sent > l.created_at
      `,
        ]);
        // ── My Stats — snapshot ───────────────────────────────────────────────────
        const total = myLeads.length;
        const disponivel = myLeads.filter(l => l.status === 'disponivel').length;
        const pego = myLeads.filter(l => l.status === 'pego').length;
        const em_andamento = myLeads.filter(l => l.status === 'em_andamento').length;
        const perdido = myLeads.filter(l => l.status === 'perdido').length;
        const unreadTotal = myLeads.reduce((acc, l) => acc + l.unreadCount, 0);
        // ── Period events ─────────────────────────────────────────────────────────
        const newLeads = myLeads.filter(l => inPeriod(l.createdAt)).length;
        const initiated = Number(myInitiatedRaw[0]?.cnt ?? 0);
        const stageMoves = myLeads.filter(l => inPeriod(l.stageMovedAt)).length;
        const activeConvs = myLeads.filter(l => inPeriod(l.lastMessageAt)).length;
        const avgResponseMinutes = myResponseTimeRaw[0]?.avg_min != null ? Number(myResponseTimeRaw[0].avg_min) : null;
        // ── Priority queue — current state ────────────────────────────────────────
        const priority = [...myLeads]
            .filter(l => l.status !== 'perdido')
            .sort((a, b) => {
            if (b.unreadCount !== a.unreadCount)
                return b.unreadCount - a.unreadCount;
            const aTime = a.lastMessageAt?.getTime() ?? 0;
            const bTime = b.lastMessageAt?.getTime() ?? 0;
            return aTime - bTime;
        })
            .slice(0, 10)
            .map(l => ({
            id: l.id,
            name: l.name,
            phone: l.phone,
            status: l.status,
            unreadCount: l.unreadCount,
            lastMessageAt: l.lastMessageAt?.toISOString() ?? null,
            minutesSinceLastMessage: l.lastMessageAt
                ? Math.floor((now.getTime() - l.lastMessageAt.getTime()) / 60000)
                : null,
            stageName: l.stage?.name ?? null,
            stageColor: l.stage?.color ?? null,
            tags: l.tags,
        }));
        // ── Timeline — activity in period ─────────────────────────────────────────
        const last14days = buildTimeline(daysDiff, periodStart).map(date => {
            const dateStart = new Date(date + 'T00:00:00.000Z');
            const dateEnd = new Date(date + 'T23:59:59.999Z');
            return {
                date,
                converted: myLeads.filter(l => l.lastMessageAt && l.lastMessageAt >= dateStart && l.lastMessageAt <= dateEnd).length,
            };
        });
        return {
            myStats: { total, disponivel, pego, em_andamento, perdido, unreadTotal, newLeads, initiated, stageMoves, activeConvs, avgResponseMinutes },
            priority,
            timeline: { last14days },
        };
    }
}
exports.LeadsService = LeadsService;
function buildTimeline(days, from) {
    const result = [];
    const start = from
        ? new Date(from.getFullYear(), from.getMonth(), from.getDate())
        : (() => {
            const today = new Date();
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            d.setDate(d.getDate() - (days - 1));
            return d;
        })();
    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        result.push(d.toISOString().slice(0, 10));
    }
    return result;
}
//# sourceMappingURL=leads.service.js.map