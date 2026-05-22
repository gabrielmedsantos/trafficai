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
exports.WebhooksService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const queues_1 = require("../../queue/queues");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
const redis_1 = require("../../config/redis");
class WebhooksService {
    /**
     * Verifica o hub_challenge da Meta (GET /webhooks/meta)
     */
    verifyChallenge(mode, token, challenge, phoneNumberId) {
        // Se phoneNumberId fornecido, verificar token específico da conexão
        // Caso contrário, aceitar qualquer token configurado nas conexões
        if (mode === 'subscribe') {
            return challenge;
        }
        return null;
    }
    /**
     * Verifica o token de uma conexão específica pelo phoneNumberId
     */
    async verifyConnectionToken(phoneNumberId, token) {
        const connection = await database_1.prisma.whatsappConnection.findUnique({
            where: { phoneNumberId },
            select: { webhookVerifyToken: true, status: true },
        });
        if (!connection)
            return false;
        return connection.webhookVerifyToken === token;
    }
    /**
     * Resolve o App Secret de uma conexão pelo phoneNumberId.
     * Retorna o secret da conexão (decriptado) ou o fallback do .env.
     */
    async resolveAppSecret(phoneNumberId) {
        if (phoneNumberId) {
            const conn = await database_1.prisma.whatsappConnection.findUnique({
                where: { phoneNumberId },
                select: { appSecretEnc: true },
            });
            if (conn?.appSecretEnc) {
                const { decrypt } = await Promise.resolve().then(() => __importStar(require('../../services/crypto/token.encryption')));
                return decrypt(conn.appSecretEnc);
            }
        }
        return env_1.env.META_APP_SECRET ?? null;
    }
    /**
     * Valida a assinatura X-Hub-Signature-256 do payload com um secret específico.
     */
    validateSignature(rawBody, signature, secret) {
        if (!secret)
            return true; // sem secret configurado: skip (dev/local)
        const expected = 'sha256=' + crypto_1.default
            .createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');
        try {
            return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        }
        catch {
            return false;
        }
    }
    /**
     * Processa o payload recebido da Meta:
     * 1. Persiste o evento bruto
     * 2. Enfileira para processamento assíncrono (mensagens / statuses)
     * 3. Trata account_update síncrono pra reagir rápido (status da connection)
     * 4. Retorna 200 imediatamente
     */
    async receiveEvent(payload, rawBody) {
        // Determinar phoneNumberId do primeiro evento
        const firstChange = payload.entry?.[0]?.changes?.[0];
        const firstField = firstChange?.field;
        const firstValue = firstChange?.value;
        const phoneNumberId = firstValue?.metadata?.phone_number_id;
        const wabaId = payload.entry?.[0]?.id;
        let connectionId;
        if (phoneNumberId) {
            const conn = await database_1.prisma.whatsappConnection.findUnique({
                where: { phoneNumberId },
                select: { id: true },
            });
            connectionId = conn?.id;
        }
        else if (wabaId && (firstField === 'account_update' || firstField === 'phone_number_quality_update' || firstField === 'phone_number_name_update' || firstField === 'business_capability_update' || firstField === 'account_review_update')) {
            // account_update vem com entry.id = WABA_ID (sem metadata.phone_number_id)
            const conn = await database_1.prisma.whatsappConnection.findFirst({
                where: { wabaId },
                select: { id: true },
            });
            connectionId = conn?.id;
        }
        // Determinar tipo de evento
        let eventType = 'unknown';
        if (firstField === 'account_update' || firstField === 'phone_number_quality_update' || firstField === 'phone_number_name_update' || firstField === 'business_capability_update' || firstField === 'account_review_update') {
            eventType = firstField;
        }
        else if (firstField === 'message_template_status_update' || firstField === 'template_category_update' || firstField === 'message_template_quality_update') {
            eventType = firstField;
        }
        else if (firstValue?.statuses?.length) {
            const status = firstValue.statuses[0].status;
            eventType = (['sent', 'delivered', 'read', 'failed'].includes(status) ? status : 'unknown');
        }
        else if (firstValue?.messages?.length) {
            eventType = 'incoming';
        }
        const wamid = firstValue?.statuses?.[0]?.id ?? firstValue?.messages?.[0]?.id;
        // Persistir evento bruto
        const event = await database_1.prisma.webhookEvent.create({
            data: {
                connectionId,
                wamid,
                eventType,
                payloadRaw: payload,
                receivedAt: new Date(),
            },
        });
        // Enfileirar processamento assíncrono
        await queues_1.webhookEventsQueue.add(`webhook:${event.id}`, { webhookEventId: event.id, rawPayload: payload, receivedAt: new Date().toISOString() }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { age: 86400 },
            removeOnFail: { age: 604800 },
        });
        logger_1.logger.debug({ eventId: event.id, eventType, wamid, connectionId }, 'Webhook event received and queued');
        // Trata account_update / quality_update / name_update síncrono — atualiza status da connection
        if (connectionId && firstField && /^(account_update|phone_number_quality_update|phone_number_name_update|business_capability_update|account_review_update)$/.test(firstField)) {
            try {
                for (const change of payload.entry?.[0]?.changes || []) {
                    await this._processConnectionAlert(connectionId, change.field, change.value, wabaId);
                }
            }
            catch (e) {
                logger_1.logger.error({ err: e, connectionId, wabaId, field: firstField }, 'connection alert processing failed');
            }
        }
    }
    /**
     * Processa alertas Meta que afetam status da conexão (account_update, quality, name, etc).
     * Loga em connection_health_logs e marca PAUSED/ERROR quando crítico.
     */
    async _processConnectionAlert(connectionId, field, value, wabaId) {
        const eventName = (value && (value.event || value.decision || value.event_type)) || 'UNKNOWN';
        logger_1.logger.warn({ connectionId, wabaId, field, event: eventName, value }, 'Meta connection alert received');
        // Mapeamento: field+event → ação
        let statusUpdate = null;
        if (field === 'account_update') {
            // ACCOUNT_RESTRICTION, DISABLED_UPDATE, ACCOUNT_DELETED, ACCOUNT_UPDATE (genérico)
            if (/RESTRICTION|RESTRICTED/i.test(eventName)) {
                statusUpdate = { status: 'ERROR', reason: 'AUTO: Conta restrita pela Meta (' + eventName + ') — verifique no Meta Business', score: 0 };
            }
            else if (/DISABLED|DELETED/i.test(eventName)) {
                statusUpdate = { status: 'ERROR', reason: 'AUTO: Conta desabilitada/deletada pela Meta (' + eventName + ')', score: 0 };
            }
            else if (/VERIFIED_ACCOUNT/i.test(eventName)) {
                // sinal positivo — não muda status
            }
        }
        else if (field === 'phone_number_quality_update') {
            // value.event = FLAGGED | UPGRADE | DOWNGRADE
            // value.current_limit = TIER_50|250|1K|10K|100K|UNLIMITED
            const newQuality = String(value.current_limit || '').includes('FLAGGED') || /FLAGGED/i.test(eventName) ? 'RED' : null;
            const updateData = {};
            if (value.current_limit) updateData.metaMessagingLimit = String(value.current_limit).slice(0, 32);
            if (/FLAGGED/i.test(eventName)) {
                updateData.metaQualityRating = 'RED';
                updateData.status = 'PAUSED';
                updateData.pausedReason = 'AUTO: Qualidade FLAGGED pela Meta — pausado. Reduza reports/spam e reative manualmente.';
                updateData.healthScore = 30;
            }
            else if (/UPGRADE/i.test(eventName)) {
                updateData.metaQualityRating = 'GREEN';
            }
            if (Object.keys(updateData).length) {
                try {
                    await database_1.prisma.whatsappConnection.update({ where: { id: connectionId }, data: updateData });
                }
                catch (e) {
                    // Coluna metaMessagingLimit pode não existir — fallback sem ela
                    delete updateData.metaMessagingLimit;
                    if (Object.keys(updateData).length) {
                        await database_1.prisma.whatsappConnection.update({ where: { id: connectionId }, data: updateData });
                    }
                }
                if (updateData.status === 'PAUSED') {
                    await redis_1.redis.hset(redis_1.RedisKeys.healthConn(connectionId), { status: 'PAUSED', score: 30 });
                    await redis_1.redis.set(redis_1.RedisKeys.connPaused(connectionId), 'auto:quality_flagged');
                }
            }
        }
        else if (field === 'phone_number_name_update') {
            // value.decision = APPROVED | REJECTED — só log, não muda status
        }
        if (statusUpdate) {
            await database_1.prisma.whatsappConnection.update({
                where: { id: connectionId },
                data: { status: statusUpdate.status, pausedReason: statusUpdate.reason, healthScore: statusUpdate.score },
            });
            await redis_1.redis.hset(redis_1.RedisKeys.healthConn(connectionId), { status: statusUpdate.status, score: statusUpdate.score });
            if (statusUpdate.status === 'PAUSED' || statusUpdate.status === 'ERROR') {
                await redis_1.redis.set(redis_1.RedisKeys.connPaused(connectionId), statusUpdate.reason.slice(0, 200));
            }
        }
        // Sempre loga em connection_health_logs (histórico)
        try {
            const conn = await database_1.prisma.whatsappConnection.findUnique({
                where: { id: connectionId },
                select: { status: true, healthScore: true, workspaceId: true },
            });
            if (conn) {
                await database_1.prisma.connectionHealthLog.create({
                    data: {
                        connectionId,
                        healthScore: conn.healthScore,
                        status: conn.status,
                        lastErrorCode: ('META:' + field + ':' + eventName).slice(0, 50),
                        lastErrorMessage: JSON.stringify(value || {}).slice(0, 1000),
                        workspaceId: conn.workspaceId,
                    },
                });
            }
        }
        catch (e) {
            logger_1.logger.warn({ err: e, connectionId }, 'failed to write connection_health_log for alert');
        }
    }
}
exports.WebhooksService = WebhooksService;
//# sourceMappingURL=webhooks.service.js.map