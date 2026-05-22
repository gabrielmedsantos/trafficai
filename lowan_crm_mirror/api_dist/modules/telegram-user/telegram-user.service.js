"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramUserService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const common_types_1 = require("../../types/common.types");
const telegram_user_client_1 = require("./telegram-user.client");

const AUTH_TTL_SEC = 600;  // 10min pro user digitar SMS code

function authKey(workspaceId, tempId) {
    return `tg_user_auth:${workspaceId}:${tempId}`;
}

function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

function isConfigured() {
    return !!(env_1.env.TELEGRAM_USER_API_ID && env_1.env.TELEGRAM_USER_API_HASH && env_1.env.INTERNAL_SHARED_SECRET);
}

class TelegramUserService {
    constructor() {
        this.client = new telegram_user_client_1.TelegramUserClient();
    }

    async list(workspaceId) {
        const rows = await database_1.prisma.$queryRaw `
            SELECT id, name, phone, telegram_user_id AS "telegramUserId",
                   me_username AS "meUsername", me_first_name AS "meFirstName",
                   status, paused_reason AS "pausedReason", last_seen_at AS "lastSeenAt",
                   messages_sent_today AS "messagesSentToday", created_at AS "createdAt"
            FROM telegram_user_connections
            WHERE workspace_id = ${workspaceId}::uuid
            ORDER BY created_at DESC
        `;
        return rows || [];
    }

    /**
     * Etapa 1: solicita SMS code pro phone do user.
     * Guarda { phone, phoneCodeHash } em Redis com TTL 10min.
     */
    async startAuth(input, leadUser) {
        if (!isConfigured()) {
            throw new common_types_1.HttpError(503, 'Telegram MTProto não está configurado neste servidor.', 'SIGNUP_NOT_CONFIGURED');
        }
        const { name, phone } = input;
        const phoneNormalized = normalizePhone(phone);
        const workspaceId = leadUser.workspaceId;

        // Phone já está em uso neste workspace?
        const existing = await database_1.prisma.$queryRaw `
            SELECT id, status FROM telegram_user_connections
            WHERE workspace_id = ${workspaceId}::uuid AND phone_normalized = ${phoneNormalized}
            LIMIT 1
        `;
        if (existing && existing[0]) {
            throw common_types_1.HttpError.conflict('Esse número já está conectado neste workspace.', 'PHONE_TAKEN');
        }

        // Chama container
        let phoneCodeHash;
        try {
            const r = await this.client.startAuth(phone);
            phoneCodeHash = r.phoneCodeHash;
        }
        catch (err) {
            const status = err.statusCode || 502;
            const code = err.code || 'CONTAINER_ERROR';
            throw new common_types_1.HttpError(status, `Falha ao iniciar auth no Telegram: ${err.message}`, code);
        }

        const sessionTempId = crypto_1.default.randomBytes(16).toString('hex');
        const payload = { name, phone, phoneNormalized, phoneCodeHash, workspaceId, leadUserId: leadUser.id, createdAt: Date.now() };
        await redis_1.redis.set(authKey(workspaceId, sessionTempId), JSON.stringify(payload), 'EX', AUTH_TTL_SEC);

        logger_1.logger.info({ workspaceId, phone, sessionTempId: sessionTempId.slice(0, 8) + '…' }, 'tg-user: auth started');
        return { sessionTempId, expiresInSeconds: AUTH_TTL_SEC };
    }

    /**
     * Etapa 2: usuário recebe SMS code, envia aqui.
     * Container faz signIn, retorna sessionString. Cifra e persiste.
     */
    async verifyAuth(input, leadUser) {
        if (!isConfigured()) {
            throw new common_types_1.HttpError(503, 'Telegram MTProto não está configurado neste servidor.', 'SIGNUP_NOT_CONFIGURED');
        }
        const { sessionTempId, code, password } = input;
        const workspaceId = leadUser.workspaceId;

        const raw = await redis_1.redis.get(authKey(workspaceId, sessionTempId));
        if (!raw) throw common_types_1.HttpError.badRequest('Sessão expirada. Recomece pelo /start.', 'AUTH_EXPIRED');
        let session;
        try { session = JSON.parse(raw); } catch { throw common_types_1.HttpError.badRequest('Sessão corrompida.', 'AUTH_CORRUPTED'); }

        const { name, phone, phoneNormalized, phoneCodeHash, leadUserId } = session;

        // Chama container pra verify
        let verifyResp;
        try {
            verifyResp = await this.client.verifyAuth({ phone, phoneCodeHash, code, password });
        }
        catch (err) {
            const status = err.statusCode || 502;
            const code2 = err.code || 'VERIFY_FAILED';
            if (code2 === '2FA_REQUIRED') {
                // NÃO consome session — user precisa repostar com password
                throw new common_types_1.HttpError(428, 'Senha de 2 etapas necessária — envie { password } no body.', '2FA_REQUIRED');
            }
            throw new common_types_1.HttpError(status, err.message || 'Falha no verify.', code2);
        }

        const { sessionString, telegramUserId, username, firstName } = verifyResp;
        const sessionStringEnc = (0, token_encryption_1.encrypt)(sessionString);

        // Cria connection no DB
        const newConnectionId = crypto_1.default.randomUUID();
        await database_1.prisma.$executeRaw `
            INSERT INTO telegram_user_connections
              (id, name, phone, phone_normalized, telegram_user_id, me_username, me_first_name,
               session_string_enc, status, workspace_id, created_by_id, last_seen_at)
            VALUES (${newConnectionId}::uuid, ${name}, ${phone}, ${phoneNormalized},
                    ${telegramUserId || null}, ${username || null}, ${firstName || null},
                    ${sessionStringEnc}, 'ACTIVE', ${workspaceId}::uuid, ${leadUserId}::uuid, now())
        `;

        // Carrega sessão no container (com connectionId real)
        try {
            await this.client.loadSession(newConnectionId, sessionString, { workspaceId });
        }
        catch (err) {
            logger_1.logger.warn({ connectionId: newConnectionId, err: err.message }, 'load after verify failed (will retry via restore)');
        }

        await redis_1.redis.del(authKey(workspaceId, sessionTempId));
        logger_1.logger.info({ workspaceId, connectionId: newConnectionId, meUsername: username }, 'tg-user: connection created');

        return {
            connectionId: newConnectionId,
            phone,
            meUsername: username || null,
            meFirstName: firstName || null,
            status: 'ACTIVE',
        };
    }

    async check(id, workspaceId) {
        const rows = await database_1.prisma.$queryRaw `
            SELECT id, status, last_seen_at AS "lastSeenAt"
            FROM telegram_user_connections
            WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid
            LIMIT 1
        `;
        const row = rows && rows[0];
        if (!row) throw common_types_1.HttpError.notFound('Conexão não encontrada.', 'NOT_FOUND');

        let containerHealth = null;
        try {
            containerHealth = await this.client.health(id);
        }
        catch (err) {
            logger_1.logger.warn({ id, err: err.message }, 'container health failed');
        }
        return { ...row, container: containerHealth };
    }

    async setStatus(id, workspaceId, status, reason = null) {
        await database_1.prisma.$executeRaw `
            UPDATE telegram_user_connections
            SET status = ${status}, paused_reason = ${reason}, updated_at = now()
            WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid
        `;
        return { id, status, pausedReason: reason };
    }

    async remove(id, workspaceId) {
        const rows = await database_1.prisma.$queryRaw `
            SELECT id FROM telegram_user_connections
            WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid LIMIT 1
        `;
        if (!rows || !rows[0]) throw common_types_1.HttpError.notFound('Conexão não encontrada.', 'NOT_FOUND');

        // Logout no container (não-bloqueante)
        try { await this.client.logout(id); } catch (err) { logger_1.logger.warn({ id, err: err.message }, 'container logout failed (continuing)'); }

        await database_1.prisma.$executeRaw `DELETE FROM telegram_user_connections WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid`;
        logger_1.logger.info({ id, workspaceId }, 'tg-user: connection removed');
        return { removed: true };
    }
}
exports.TelegramUserService = TelegramUserService;

// ─── Internal Service (sem auth de leadUser, para o container chamar) ────────
class TelegramUserInternalService {
    async restoreList() {
        const rows = await database_1.prisma.$queryRaw `
            SELECT id, session_string_enc AS "sessionStringEnc", workspace_id AS "workspaceId"
            FROM telegram_user_connections
            WHERE status = 'ACTIVE' AND session_string_enc IS NOT NULL
        `;
        return (rows || []).map((r) => {
            try {
                return { id: r.id, sessionString: (0, token_encryption_1.decrypt)(r.sessionStringEnc), workspaceId: r.workspaceId };
            }
            catch (err) {
                logger_1.logger.warn({ id: r.id, err: err.message }, 'failed to decrypt sessionString for restore');
                return null;
            }
        }).filter(Boolean);
    }

    async heartbeat(id, status) {
        const allowed = ['ACTIVE', 'PAUSED', 'REAUTH_REQUIRED', 'ERROR', 'DISCONNECTED'];
        const s = allowed.includes(status) ? status : 'ACTIVE';
        await database_1.prisma.$executeRaw `
            UPDATE telegram_user_connections
            SET last_seen_at = now(), status = ${s}, updated_at = now()
            WHERE id = ${id}::uuid
        `;
        return { ok: true };
    }
}
exports.TelegramUserInternalService = TelegramUserInternalService;
