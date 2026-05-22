"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappSignupService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
const redis_1 = require("../../config/redis");
const cloud_api_service_1 = require("../../services/whatsapp/cloud-api.service");
const connections_service_1 = require("../connections/connections.service");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const meta_error_mapper_1 = require("./meta-error.mapper");
const common_types_1 = require("../../types/common.types");

const DEFAULT_PRIORITY = 1;
const DEFAULT_RATE_PER_MIN = 10;
const DEFAULT_RATE_PER_DAY = 1000;
const SESSION_TTL_SEC = 600;  // 10min — usuário tem que clicar "Criar Canal" dentro disso

function sessionKey(workspaceId, sessionId) {
    return `signup:session:${workspaceId}:${sessionId}`;
}

function assertConfigured() {
    if (!env_1.env.META_APP_ID || !env_1.env.META_EMBEDDED_SIGNUP_CONFIG_ID) {
        throw new common_types_1.HttpError(503, 'Embedded Signup não está configurado neste servidor.', 'SIGNUP_NOT_CONFIGURED');
    }
}

class WhatsappSignupService {
    constructor() {
        this.connectionsService = new connections_service_1.ConnectionsService();
    }
    /**
     * Config pública para o frontend popular FB.init/FB.login. NUNCA retorna META_APP_SECRET.
     */
    getPublicConfig() {
        assertConfigured();
        return {
            appId: env_1.env.META_APP_ID,
            configId: env_1.env.META_EMBEDDED_SIGNUP_CONFIG_ID,
            graphApiVersion: env_1.env.META_API_VERSION,
        };
    }
    /**
     * Etapa 1: troca code → business_token, busca metadados do número e WABA, e guarda
     * sessão criptografada no Redis (TTL 10min) para o /complete consumir depois.
     * Retorna o preview que a UI mostra na tela "Token exchanged".
     */
    async startSignup(input, leadUser) {
        assertConfigured();
        const { code, phoneNumberId, wabaId, businessId } = input;
        const workspaceId = leadUser.workspaceId;
        const correlationId = crypto_1.default.randomBytes(8).toString('hex');

        // Idempotência cross-workspace: rejeita se número já está em outro workspace
        const existing = await database_1.prisma.whatsappConnection.findUnique({
            where: { phoneNumberId },
            select: { id: true, workspaceId: true, name: true },
        });
        if (existing && existing.workspaceId && existing.workspaceId !== workspaceId) {
            logger_1.logger.warn({ correlationId, workspaceId, phoneNumberId, owningWorkspace: existing.workspaceId }, 'embedded signup: phone taken');
            throw common_types_1.HttpError.conflict('Esse número WhatsApp já está conectado em outro workspace.', 'PHONE_TAKEN');
        }

        logger_1.logger.info({ correlationId, workspaceId, phoneNumberId, wabaId, hasBusinessId: !!businessId, isUpdate: !!existing, step: 'start' }, 'embedded signup: start');

        // Exchange code → business token (60d)
        let businessToken;
        try {
            businessToken = await cloud_api_service_1.cloudApiService.exchangeCodeForToken(code);
        }
        catch (err) {
            const mapped = (0, meta_error_mapper_1.mapMetaError)(err, 'EXCHANGE_FAILED', 'Não foi possível validar o cadastro. O código expirou (válido por apenas 30s) — refaça o flow.');
            logger_1.logger.warn({ correlationId, workspaceId, phoneNumberId, step: 'exchange', metaCode: mapped.metaCode, metaMessage: mapped.metaMessage }, 'embedded signup: exchange failed');
            throw common_types_1.HttpError.badRequest(mapped.userMessage, mapped.appCode);
        }
        logger_1.logger.info({ correlationId, workspaceId, phoneNumberId, step: 'exchange', tokenPreview: businessToken.slice(0, 6) + '…', tokenLen: businessToken.length }, 'embedded signup: token exchanged');

        // Busca metadados em paralelo. Se algum falhar, segue com partial info — não bloqueia preview.
        const [phoneInfo, wabaInfo] = await Promise.all([
            cloud_api_service_1.cloudApiService.getPhoneNumberInfo(phoneNumberId, businessToken).catch((err) => {
                logger_1.logger.warn({ correlationId, phoneNumberId, err: err && err.message }, 'embedded signup: getPhoneNumberInfo failed (continuing)');
                return {};
            }),
            cloud_api_service_1.cloudApiService.getWabaInfo(wabaId, businessToken).catch((err) => {
                logger_1.logger.warn({ correlationId, wabaId, err: err && err.message }, 'embedded signup: getWabaInfo failed (continuing)');
                return {};
            }),
        ]);

        // businessId vem do postMessage WA_EMBEDDED_SIGNUP. Se temos, busca o name via Graph API.
        const effectiveBusinessId = businessId || null;
        let effectiveBusinessName = null;
        if (effectiveBusinessId) {
            try {
                const bizInfo = await cloud_api_service_1.cloudApiService.getBusinessInfo(effectiveBusinessId, businessToken);
                effectiveBusinessName = bizInfo.name || null;
            }
            catch (e) {
                logger_1.logger.warn({ correlationId, businessId: effectiveBusinessId, err: e && e.message }, 'getBusinessInfo failed (continuing)');
            }
        }

        // Guarda sessão no Redis (token criptografado)
        const sessionId = crypto_1.default.randomBytes(24).toString('hex');
        const sessionPayload = {
            businessTokenEnc: (0, token_encryption_1.encrypt)(businessToken),
            phoneNumberId,
            wabaId,
            businessId: effectiveBusinessId,
            businessName: effectiveBusinessName,
            wabaName: wabaInfo.name || null,
            workspaceId,
            createdAt: Date.now(),
        };
        await redis_1.redis.set(sessionKey(workspaceId, sessionId), JSON.stringify(sessionPayload), 'EX', SESSION_TTL_SEC);

        logger_1.logger.info({ correlationId, workspaceId, sessionId: sessionId.slice(0, 8) + '…', phoneNumberId }, 'embedded signup: session stored');

        // Sugestão de nome pra UI pré-preencher (verified_name > display_phone_number > existente > vazio)
        const suggestedName = phoneInfo.verified_name || phoneInfo.display_phone_number || (existing && existing.name) || '';

        return {
            sessionId,
            expiresInSeconds: SESSION_TTL_SEC,
            isUpdate: !!existing,
            existingConnectionId: existing ? existing.id : null,
            suggestedName,
            preview: {
                wabaId,
                wabaName: wabaInfo.name || null,
                phoneNumberId,
                displayPhoneNumber: phoneInfo.display_phone_number || null,
                verifiedName: phoneInfo.verified_name || null,
                codeVerificationStatus: phoneInfo.code_verification_status || null,
                qualityRating: phoneInfo.quality_rating || null,
                messagingLimitTier: phoneInfo.messaging_limit_tier || null,
                platformType: phoneInfo.platform_type || null,
                accountMode: phoneInfo.account_mode || null,
                businessId: effectiveBusinessId,
                businessName: effectiveBusinessName,
                businessVerificationStatus: wabaInfo.business_verification_status || null,
            },
        };
    }
    /**
     * Etapa 2: usuário confirmou preview e clicou "Criar Canal".
     * Recupera sessão do Redis, faz subscribe + register + cria/atualiza WhatsappConnection.
     */
    async completeSignup(input, leadUser) {
        assertConfigured();
        const { sessionId, name, pin } = input;
        const workspaceId = leadUser.workspaceId;
        const correlationId = crypto_1.default.randomBytes(8).toString('hex');

        // Recupera sessão (e consome — single-use)
        const raw = await redis_1.redis.get(sessionKey(workspaceId, sessionId));
        if (!raw) {
            throw common_types_1.HttpError.badRequest('Sessão expirada ou inválida. Refaça o cadastro.', 'SESSION_EXPIRED');
        }
        let session;
        try { session = JSON.parse(raw); }
        catch { throw common_types_1.HttpError.badRequest('Sessão corrompida. Refaça o cadastro.', 'SESSION_CORRUPTED'); }

        if (session.workspaceId !== workspaceId) {
            // Não deveria acontecer (key inclui workspaceId) mas guard extra
            throw common_types_1.HttpError.forbidden('Sessão pertence a outro workspace.', 'SESSION_WRONG_WORKSPACE');
        }

        const { phoneNumberId, wabaId, businessId, businessName, wabaName } = session;
        let businessToken;
        try { businessToken = (0, token_encryption_1.decrypt)(session.businessTokenEnc); }
        catch { throw new common_types_1.HttpError(500, 'Falha ao descriptografar sessão.', 'SESSION_DECRYPT_FAILED'); }

        logger_1.logger.info({ correlationId, workspaceId, phoneNumberId, wabaId, step: 'complete:start' }, 'embedded signup complete: start');

        // Subscribe app à WABA
        try {
            await cloud_api_service_1.cloudApiService.subscribeAppToWaba(wabaId, businessToken);
        }
        catch (err) {
            const mapped = (0, meta_error_mapper_1.mapMetaError)(err, 'SUBSCRIBE_FAILED', 'Falha ao inscrever o app na conta WhatsApp Business. Verifique permissões e tente novamente.');
            logger_1.logger.warn({ correlationId, workspaceId, phoneNumberId, wabaId, step: 'subscribe', metaCode: mapped.metaCode, metaMessage: mapped.metaMessage }, 'embedded signup: subscribe failed');
            throw common_types_1.HttpError.badRequest(mapped.userMessage, mapped.appCode);
        }
        logger_1.logger.info({ correlationId, workspaceId, wabaId, step: 'subscribe' }, 'embedded signup: app subscribed to waba');

        // Register phone com PIN — falha NÃO bloqueia (cria como PAUSED com mensagem clara)
        let initialStatus = 'ACTIVE';
        let registerWarning;
        try {
            await cloud_api_service_1.cloudApiService.registerPhoneNumber(phoneNumberId, businessToken, pin);
            logger_1.logger.info({ correlationId, workspaceId, phoneNumberId, step: 'register' }, 'embedded signup: phone registered');
        }
        catch (err) {
            const mapped = (0, meta_error_mapper_1.mapMetaError)(err, 'REGISTER_FAILED', null);
            initialStatus = 'PAUSED';
            registerWarning = mapped.userMessage;
            logger_1.logger.warn({ correlationId, workspaceId, phoneNumberId, step: 'register', metaCode: mapped.metaCode, metaMessage: mapped.metaMessage }, 'embedded signup: register failed, creating connection paused');
        }

        // Create OU update WhatsappConnection (reusa connectionsService — encripta token, gera webhook verify, sync Redis)
        const existing = await database_1.prisma.whatsappConnection.findUnique({
            where: { phoneNumberId },
            select: { id: true, workspaceId: true },
        });
        if (existing && existing.workspaceId && existing.workspaceId !== workspaceId) {
            // Race: outro workspace cadastrou entre /start e /complete. Aborta.
            await redis_1.redis.del(sessionKey(workspaceId, sessionId));
            throw common_types_1.HttpError.conflict('Esse número foi conectado em outro workspace enquanto você confirmava. Refaça o cadastro.', 'PHONE_TAKEN_RACE');
        }

        let connectionId;
        if (existing) {
            await this.connectionsService.update(existing.id, {
                name,
                accessToken: businessToken,
                wabaId,
                phoneNumberId,
            }, leadUser.id, workspaceId);
            if (initialStatus === 'PAUSED') {
                await this.connectionsService.updateStatus(existing.id, { status: 'PAUSED', reason: registerWarning || 'Phone register failed' }, workspaceId);
            }
            connectionId = existing.id;
            if (businessId || businessName) {
                try {
                    await database_1.prisma.$executeRaw `UPDATE whatsapp_connections SET business_id = ${businessId || null}, business_name = ${businessName || null} WHERE id = ${connectionId}::uuid`;
                }
                catch (e) {
                    logger_1.logger.warn({ err: e.message, connectionId }, 'embedded signup: persist business info (update) failed');
                }
            }
            logger_1.logger.info({ correlationId, workspaceId, connectionId, step: 'updated' }, 'embedded signup: existing connection updated');
        }
        else {
            const sysAdmin = await database_1.prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
            if (!sysAdmin) {
                throw new common_types_1.HttpError(500, 'Não há usuário sistema disponível para registrar a conexão.', 'NO_SYS_ADMIN');
            }
            const created = await this.connectionsService.create({
                name,
                phoneNumberId,
                wabaId,
                accessToken: businessToken,
                webhookVerifyToken: crypto_1.default.randomBytes(16).toString('hex'),
                priority: DEFAULT_PRIORITY,
                rateLimitPerMinute: DEFAULT_RATE_PER_MIN,
                rateLimitPerDay: DEFAULT_RATE_PER_DAY,
            }, sysAdmin.id, workspaceId);
            connectionId = created.id;
            if (initialStatus === 'PAUSED') {
                await this.connectionsService.updateStatus(connectionId, { status: 'PAUSED', reason: registerWarning || 'Phone register failed' }, workspaceId);
            }
            // Persiste business_id + business_name (colunas raw — Prisma client não conhece)
            if (businessId || businessName) {
                try {
                    await database_1.prisma.$executeRaw `UPDATE whatsapp_connections SET business_id = ${businessId || null}, business_name = ${businessName || null} WHERE id = ${connectionId}::uuid`;
                }
                catch (e) {
                    logger_1.logger.warn({ err: e.message, connectionId }, 'embedded signup: persist business info failed');
                }
            }
            logger_1.logger.info({ correlationId, workspaceId, connectionId, businessId: businessId || null, step: 'created' }, 'embedded signup: new connection created');
        }

        // Consome sessão (single-use)
        await redis_1.redis.del(sessionKey(workspaceId, sessionId));

        return {
            connectionId,
            phoneNumberId,
            wabaId,
            status: initialStatus,
            businessId: businessId || null,
            businessName: businessName || null,
            registerWarning: registerWarning || undefined,
        };
    }
    /**
     * Lista business_id/name de TODAS as conexões do workspace (lê só do DB — rápido).
     * Front usa pra renderizar a coluna "BM" nos cards sem chamar Meta API.
     */
    async getBusinessMap(workspaceId) {
        const rows = await database_1.prisma.$queryRaw `
            SELECT id, business_id AS "businessId", business_name AS "businessName", waba_id AS "wabaId"
            FROM whatsapp_connections
            WHERE workspace_id = ${workspaceId}::uuid OR workspace_id IS NULL
        `;
        const map = {};
        for (const r of (rows || [])) {
            map[r.id] = { businessId: r.businessId || null, businessName: r.businessName || null, wabaId: r.wabaId };
        }
        return map;
    }
    /**
     * Força refresh do business_id/name de uma conexão consultando a Meta Graph API.
     * Usado pra conexões antigas (cadastro manual ou pré-fix do persist) que estão sem business info.
     */
    async refreshBusinessInfo(connectionId, leadUser, businessIdOverride = null) {
        const conn = await database_1.prisma.whatsappConnection.findFirst({
            where: { id: connectionId, ...(leadUser.workspaceId ? { OR: [{ workspaceId: leadUser.workspaceId }, { workspaceId: null }] } : {}) },
            select: { id: true, wabaId: true, accessTokenEnc: true },
        });
        if (!conn) {
            throw common_types_1.HttpError.notFound('Conexão não encontrada neste workspace.', 'CONNECTION_NOT_FOUND');
        }
        let businessToken;
        try { businessToken = (0, token_encryption_1.decrypt)(conn.accessTokenEnc); }
        catch { throw new common_types_1.HttpError(500, 'Falha ao decifrar token da conexão.', 'TOKEN_DECRYPT_FAILED'); }
        // Pega businessId atual do DB (se persistido) ou usa override fornecido
        let currentBusinessId = businessIdOverride;
        if (!currentBusinessId) {
            try {
                const rows = await database_1.prisma.$queryRaw `SELECT business_id AS "businessId" FROM whatsapp_connections WHERE id = ${connectionId}::uuid LIMIT 1`;
                currentBusinessId = (rows && rows[0] && rows[0].businessId) || null;
            }
            catch { }
        }
        let businessId = currentBusinessId || null;
        let businessName = null;
        let wabaName = null;
        // Tenta pegar o nome do business se temos o ID
        if (businessId) {
            try {
                const bizInfo = await cloud_api_service_1.cloudApiService.getBusinessInfo(businessId, businessToken);
                businessName = bizInfo.name || null;
            }
            catch (err) {
                logger_1.logger.warn({ connectionId, businessId, err: err && err.message }, 'refreshBusinessInfo: getBusinessInfo failed');
            }
        }
        // Também atualiza nome da WABA (basics)
        try {
            const wabaInfo = await cloud_api_service_1.cloudApiService.getWabaInfo(conn.wabaId, businessToken);
            wabaName = wabaInfo.name || null;
        }
        catch (err) {
            logger_1.logger.warn({ connectionId, wabaId: conn.wabaId, err: err && err.message }, 'refreshBusinessInfo: getWabaInfo failed');
        }
        if (businessId || businessName) {
            try {
                await database_1.prisma.$executeRaw `UPDATE whatsapp_connections SET business_id = ${businessId}, business_name = ${businessName} WHERE id = ${connectionId}::uuid`;
            }
            catch (e) {
                logger_1.logger.warn({ err: e.message, connectionId }, 'refreshBusinessInfo: persist failed');
            }
        }
        return { connectionId, businessId, businessName, wabaName, wabaId: conn.wabaId, needsBusinessId: !businessId };
    }
}
exports.WhatsappSignupService = WhatsappSignupService;
//# sourceMappingURL=whatsapp-signup.service.js.map
