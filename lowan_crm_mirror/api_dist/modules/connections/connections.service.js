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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionsService = void 0;
const client_1 = require("@prisma/client");
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const common_types_1 = require("../../types/common.types");
const pagination_1 = require("../../utils/pagination");
class ConnectionsService {
    async list(input, workspaceId) {
        const { page, limit, skip } = (0, pagination_1.getPaginationParams)(input);
        const where = {
            ...(input.status ? { status: input.status } : {}),
            ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}),
        };
        const [data, total] = await Promise.all([
            database_1.prisma.whatsappConnection.findMany({
                where,
                skip,
                take: limit,
                orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
                select: {
                    id: true,
                    name: true,
                    phoneNumberId: true,
                    wabaId: true,
                    status: true,
                    healthScore: true,
                    priority: true,
                    rateLimitPerMinute: true,
                    rateLimitPerDay: true,
                    messagesSentToday: true,
                    pausedUntil: true,
                    pausedReason: true,
                    metaDisplayName: true,
                    metaQualityRating: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: { select: { messages: true } },
                },
            }),
            database_1.prisma.whatsappConnection.count({ where }),
        ]);
        const mapped = data.map((c) => ({ ...c, totalMessagesSent: c._count.messages }));
        return (0, pagination_1.paginate)(mapped, total, page, limit);
    }
    async getById(id, workspaceId) {
        const connection = await database_1.prisma.whatsappConnection.findFirst({
            where: { id, ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}) },
            select: {
                id: true,
                name: true,
                phoneNumberId: true,
                wabaId: true,
                webhookVerifyToken: true,
                status: true,
                healthScore: true,
                priority: true,
                rateLimitPerMinute: true,
                rateLimitPerDay: true,
                messagesSentToday: true,
                pausedUntil: true,
                pausedReason: true,
                metaDisplayName: true,
                metaQualityRating: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!connection)
            throw common_types_1.HttpError.notFound('Connection not found');
        return connection;
    }
    async create(input, userId, workspaceId) {
        const existing = await database_1.prisma.whatsappConnection.findUnique({
            where: { phoneNumberId: input.phoneNumberId },
        });
        if (existing) {
            throw common_types_1.HttpError.conflict('A connection with this phone_number_id already exists', 'DUPLICATE_CONNECTION');
        }
        const accessTokenEnc = (0, token_encryption_1.encrypt)(input.accessToken);
        const appSecretEnc = input.appSecret ? (0, token_encryption_1.encrypt)(input.appSecret) : undefined;
        const connection = await database_1.prisma.whatsappConnection.create({
            data: {
                name: input.name,
                phoneNumberId: input.phoneNumberId,
                wabaId: input.wabaId,
                accessTokenEnc,
                ...(appSecretEnc !== undefined && { appSecretEnc }),
                webhookVerifyToken: input.webhookVerifyToken ?? require('crypto').randomBytes(16).toString('hex'),
                priority: input.priority,
                rateLimitPerMinute: input.rateLimitPerMinute,
                rateLimitPerDay: input.rateLimitPerDay,
                createdById: userId,
                status: client_1.ConnectionStatus.ACTIVE,
                ...(workspaceId ? { workspaceId } : {}),
            },
            select: {
                id: true,
                name: true,
                phoneNumberId: true,
                wabaId: true,
                status: true,
                priority: true,
                rateLimitPerMinute: true,
                rateLimitPerDay: true,
                createdAt: true,
            },
        });
        // Initialize Redis health
        await redis_1.redis.hset(redis_1.RedisKeys.healthConn(connection.id), {
            score: 100,
            status: client_1.ConnectionStatus.ACTIVE,
            last_check: new Date().toISOString(),
        });
        return connection;
    }
    async update(id, input, userId, workspaceId) {
        await this.getById(id, workspaceId);
        const data = {
            ...(input.name && { name: input.name }),
            ...(input.phoneNumberId && { phoneNumberId: input.phoneNumberId }),
            ...(input.wabaId && { wabaId: input.wabaId }),
            ...(input.priority !== undefined && { priority: input.priority }),
            ...(input.rateLimitPerMinute !== undefined && { rateLimitPerMinute: input.rateLimitPerMinute }),
            ...(input.rateLimitPerDay !== undefined && { rateLimitPerDay: input.rateLimitPerDay }),
            ...(input.webhookVerifyToken && { webhookVerifyToken: input.webhookVerifyToken }),
        };
        if (input.accessToken) {
            data.accessTokenEnc = (0, token_encryption_1.encrypt)(input.accessToken);
            // Novo token = resetar status e health
            data.status = client_1.ConnectionStatus.ACTIVE;
            data.healthScore = 100;
            data.pausedUntil = null;
            data.pausedReason = null;
        }
        if (input.appSecret === null) {
            data.appSecretEnc = null;
        }
        else if (input.appSecret) {
            data.appSecretEnc = (0, token_encryption_1.encrypt)(input.appSecret);
        }
        const updated = await database_1.prisma.whatsappConnection.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                phoneNumberId: true,
                status: true,
                priority: true,
                rateLimitPerMinute: true,
                rateLimitPerDay: true,
                updatedAt: true,
            },
        });
        return updated;
    }
    async updateStatus(id, input, workspaceId) {
        await this.getById(id, workspaceId);
        const data = { status: input.status };
        if (input.status === client_1.ConnectionStatus.PAUSED) {
            data.pausedReason = input.reason ?? 'Manual pause';
        }
        else if (input.status === client_1.ConnectionStatus.ACTIVE) {
            data.pausedUntil = null;
            data.pausedReason = null;
            data.healthScore = 100;
        }
        const updated = await database_1.prisma.whatsappConnection.update({
            where: { id },
            data,
            select: { id: true, status: true, pausedReason: true, updatedAt: true },
        });
        // Sync Redis
        await redis_1.redis.hset(redis_1.RedisKeys.healthConn(id), { status: input.status });
        if (input.status === client_1.ConnectionStatus.ACTIVE) {
            await redis_1.redis.del(redis_1.RedisKeys.connPaused(id));
        }
        else if (input.status === client_1.ConnectionStatus.PAUSED) {
            await redis_1.redis.set(redis_1.RedisKeys.connPaused(id), input.reason ?? 'Manual pause');
        }
        return updated;
    }
    async delete(id, workspaceId, force = false) {
        // Support legacy call: delete(id, force) where force is boolean
        if (typeof workspaceId === 'boolean') {
            force = workspaceId;
            workspaceId = undefined;
        }
        const connection = await this.getById(id, workspaceId);
        // Desvincula mensagens da conexão (mantém histórico no CRM)
        await database_1.prisma.message.updateMany({ where: { connectionId: id }, data: { connectionId: null } });
        // Sempre limpar registros com FK opcional antes de deletar a conexão
        await database_1.prisma.template.updateMany({ where: { connectionId: id }, data: { connectionId: null } });
        await database_1.prisma.webhookEvent.deleteMany({ where: { connectionId: id } });
        await database_1.prisma.connectionHealthLog.deleteMany({ where: { connectionId: id } });
        await database_1.prisma.whatsappConnection.delete({ where: { id } });
        // Clean up Redis keys
        await redis_1.redis.del(redis_1.RedisKeys.healthConn(id), redis_1.RedisKeys.rateConnMin(id), redis_1.RedisKeys.rateConnDay(id), redis_1.RedisKeys.queuePending(id), redis_1.RedisKeys.connPaused(id));
        return connection;
    }
    async checkToken(id, workspaceId) {
        const connection = await database_1.prisma.whatsappConnection.findFirst({
            where: { id, ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}) },
            select: { id: true, phoneNumberId: true, accessTokenEnc: true, status: true },
        });
        if (!connection)
            throw common_types_1.HttpError.notFound('Connection not found');
        const { cloudApiService } = await Promise.resolve().then(() => __importStar(require('../../services/whatsapp/cloud-api.service')));
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const check = await cloudApiService.checkToken(connection.phoneNumberId, accessToken);
        const blockReason = check.blockReason;
        // Persiste healthStatus da Meta no Redis para exibição no painel
        if (check.healthStatus) {
            await redis_1.redis.hset(redis_1.RedisKeys.healthConn(id), { meta_health: JSON.stringify(check.healthStatus) });
        }
        const syncRedisError = async () => {
            await redis_1.redis.hset(redis_1.RedisKeys.healthConn(id), { status: 'ERROR', score: 0 });
        };
        const syncRedisActive = async () => {
            await redis_1.redis.hset(redis_1.RedisKeys.healthConn(id), { status: 'ACTIVE', score: 100 });
            await redis_1.redis.del(redis_1.RedisKeys.connPaused(id));
        };
        if (check.valid) {
            if (check.banned) {
                // WABA realmente banida
                await database_1.prisma.whatsappConnection.update({
                    where: { id },
                    data: { status: 'ERROR', pausedReason: 'WABA banida pela Meta', healthScore: 0 },
                });
                await syncRedisError();
                return { valid: true, banned: true, blockReason, qualityRating: check.qualityRating, accountMode: check.accountMode, messagingLimit: check.messagingLimit, healthStatus: check.healthStatus, status: 'ERROR' };
            }
            if (blockReason === 'PAYMENT_ISSUE') {
                await database_1.prisma.whatsappConnection.update({
                    where: { id },
                    data: { status: 'ERROR', pausedReason: 'Pagamento pendente no WABA — adicione método de pagamento válido no Meta Business', healthScore: 0 },
                });
                await syncRedisError();
                return { valid: true, banned: false, blockReason, qualityRating: check.qualityRating, accountMode: check.accountMode, messagingLimit: check.messagingLimit, healthStatus: check.healthStatus, status: 'ERROR' };
            }
            if (blockReason === 'RESTRICTED') {
                await database_1.prisma.whatsappConnection.update({
                    where: { id },
                    data: { status: 'ERROR', pausedReason: 'Ecossistema restrito pela Meta — verifique o status no Meta Business', healthScore: 0 },
                });
                await syncRedisError();
                return { valid: true, banned: false, blockReason, qualityRating: check.qualityRating, accountMode: check.accountMode, messagingLimit: check.messagingLimit, healthStatus: check.healthStatus, status: 'ERROR' };
            }
            if (connection.status === 'ERROR') {
                await database_1.prisma.whatsappConnection.update({
                    where: { id },
                    data: { status: 'ACTIVE', pausedReason: null, healthScore: 100 },
                });
                await syncRedisActive();
            }
            return { valid: true, banned: false, blockReason, qualityRating: check.qualityRating, accountMode: check.accountMode, messagingLimit: check.messagingLimit, healthStatus: check.healthStatus, status: connection.status };
        }
        else {
            if (check.banned) {
                await database_1.prisma.whatsappConnection.update({
                    where: { id },
                    data: { status: 'ERROR', pausedReason: 'Número banido ou restrito pela Meta', healthScore: 0 },
                });
            }
            else if (check.errorCode === 190) {
                await database_1.prisma.whatsappConnection.update({
                    where: { id },
                    data: { status: 'ERROR', pausedReason: `Token inválido: ${check.errorMessage}`, healthScore: 0 },
                });
            }
            return { valid: false, banned: check.banned, errorCode: check.errorCode, errorMessage: check.errorMessage };
        }
    }
    async getHealth(id, workspaceId) {
        await this.getById(id, workspaceId);
        const [healthData, recentLogs, sentToday, sentThisMinute] = await Promise.all([
            redis_1.redis.hgetall(redis_1.RedisKeys.healthConn(id)),
            database_1.prisma.connectionHealthLog.findMany({
                where: { connectionId: id },
                orderBy: { checkedAt: 'desc' },
                take: 20,
            }),
            redis_1.redis.get(redis_1.RedisKeys.rateConnDay(id)),
            redis_1.redis.get(redis_1.RedisKeys.rateConnMin(id)),
        ]);
        let metaHealth = null;
        try {
            metaHealth = healthData?.meta_health ? JSON.parse(healthData.meta_health) : null;
        }
        catch { }
        return {
            healthScore: parseInt(healthData?.score ?? '100'),
            status: healthData?.status ?? 'UNKNOWN',
            lastCheck: healthData?.last_check,
            sentToday: parseInt(sentToday ?? '0'),
            sentThisMinute: parseInt(sentThisMinute ?? '0'),
            recentLogs,
            metaHealth,
        };
    }
    /** Decrypts the access token — only call inside worker/service context, never expose via API */
    async getDecryptedToken(id) {
        const connection = await database_1.prisma.whatsappConnection.findUnique({
            where: { id },
            select: { accessTokenEnc: true },
        });
        if (!connection)
            throw common_types_1.HttpError.notFound('Connection not found');
        return (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
    }
    // ─── Permissões por conexão (collaborator x connection) ─────────────────
    // Tabela connection_user_access(conn_id, user_id) — raw SQL pq não está no
    // Prisma schema. Default backfill: todos colaboradores ativos do workspace
    // recebem acesso a todas as conexões do mesmo workspace.
    /** Admin: lista todos os usuários do workspace + flag hasAccess pra esta conn */
    async listAccess(connectionId, workspaceId) {
        const conn = await database_1.prisma.whatsappConnection.findFirst({
            where: { id: connectionId, ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}) },
            select: { id: true, workspaceId: true },
        });
        if (!conn)
            throw common_types_1.HttpError.notFound('Connection not found');
        // Resolve qual workspace usar p/ buscar users — se conexão é global (null),
        // usa o workspace do admin que chamou.
        const ws = conn.workspaceId || workspaceId;
        const users = await database_1.prisma.leadUser.findMany({
            where: { workspaceId: ws, isActive: true },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: 'asc' },
        });
        const granted = await database_1.prisma.$queryRaw `
      SELECT user_id FROM connection_user_access WHERE connection_id = ${connectionId}::uuid
    `;
        const grantedSet = new Set(granted.map(r => r.user_id));
        return {
            connectionId,
            users: users.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                // Admins implicitamente têm acesso (sempre); flag em rows é informativa
                hasAccess: u.role === 'ADMIN' ? true : grantedSet.has(u.id),
            })),
        };
    }
    /** Admin: substitui o set de userIds liberados pra esta conexão */
    async setAccess(connectionId, userIds, workspaceId) {
        const conn = await database_1.prisma.whatsappConnection.findFirst({
            where: { id: connectionId, ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}) },
            select: { id: true, workspaceId: true },
        });
        if (!conn)
            throw common_types_1.HttpError.notFound('Connection not found');
        const ws = conn.workspaceId || workspaceId;
        // Valida: cada userId tem que ser COLLABORATOR ativo do workspace
        // (admins são auto-acesso e não devem ser inseridos)
        const validUsers = await database_1.prisma.leadUser.findMany({
            where: { id: { in: userIds }, workspaceId: ws, isActive: true, role: 'COLLABORATOR' },
            select: { id: true },
        });
        const validIds = validUsers.map(u => u.id);
        // Transaction: limpa + reinsere
        await database_1.prisma.$transaction([
            database_1.prisma.$executeRaw `DELETE FROM connection_user_access WHERE connection_id = ${connectionId}::uuid`,
            ...(validIds.length > 0
                ? [database_1.prisma.$executeRawUnsafe(
                    `INSERT INTO connection_user_access (connection_id, user_id) SELECT $1::uuid, unnest($2::uuid[])`,
                    connectionId, validIds
                )]
                : []),
        ]);
        return { connectionId, grantedUserIds: validIds };
    }
    /** Helper interno: usado por sendReply/sendImageReply/sendAudioReply.
     *  Retorna true se o user pode enviar pela conexão. ADMIN sempre true. */
    async userCanUseConnection(connectionId, userId, role) {
        if (role === 'ADMIN') return true;
        const rows = await database_1.prisma.$queryRaw `
      SELECT 1 FROM connection_user_access
      WHERE connection_id = ${connectionId}::uuid AND user_id = ${userId}::uuid
      LIMIT 1
    `;
        return rows.length > 0;
    }

    /** ADMIN-ONLY: retorna as credenciais da conexão com token descriptografado.
     *  Rota associada (GET /connections/:id/credentials) deve estar atrás de
     *  requireLeadAdmin — nunca expor pra colaboradores com manageConnections. */
    async getCredentials(id, workspaceId) {
        const connection = await database_1.prisma.whatsappConnection.findFirst({
            where: { id, ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}) },
            select: {
                id: true,
                name: true,
                phoneNumberId: true,
                wabaId: true,
                accessTokenEnc: true,
                webhookVerifyToken: true,
            },
        });
        if (!connection)
            throw common_types_1.HttpError.notFound('Connection not found');
        // phone_number existe no DB mas não está mapeado no Prisma schema —
        // mesmo padrão das colunas proxy_*. Raw SQL pra resgatar.
        let phoneNumber = null;
        try {
            const rows = await database_1.prisma.$queryRaw `SELECT phone_number FROM whatsapp_connections WHERE id = ${id}::uuid LIMIT 1`;
            phoneNumber = rows && rows[0] ? rows[0].phone_number : null;
        }
        catch (e) { /* coluna pode não existir em ambientes antigos */ }
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        return {
            id: connection.id,
            name: connection.name,
            phoneNumberId: connection.phoneNumberId,
            phoneNumber,
            wabaId: connection.wabaId,
            webhookVerifyToken: connection.webhookVerifyToken,
            accessToken,
        };
    }
}
exports.ConnectionsService = ConnectionsService;
//# sourceMappingURL=connections.service.js.map