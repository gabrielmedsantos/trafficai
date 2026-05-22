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
exports.WebhooksController = void 0;
const common_types_1 = require("../../types/common.types");
const logger_1 = require("../../config/logger");
const queues_1 = require("../../queue/queues");
const database_1 = require("../../config/database");
class WebhooksController {
    service;
    constructor(service) {
        this.service = service;
    }
    /**
     * GET /webhooks/meta
     * Meta envia hub.mode, hub.verify_token e hub.challenge para verificar o endpoint
     */
    async verify(request, reply) {
        const mode = request.query['hub.mode'];
        const token = request.query['hub.verify_token'];
        const challenge = request.query['hub.challenge'];
        if (!mode || !token || !challenge) {
            throw common_types_1.HttpError.badRequest('Missing hub parameters');
        }
        if (mode !== 'subscribe') {
            throw common_types_1.HttpError.forbidden('Invalid hub mode');
        }
        // Verificar se o token corresponde a alguma conexão cadastrada
        // A Meta envia o verify_token que você configurou no painel
        // O sistema aceita qualquer token que bata com uma conexão ativa
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        const connection = await prisma.whatsappConnection.findFirst({
            where: { webhookVerifyToken: token, status: 'ACTIVE' },
        });
        if (!connection) {
            logger_1.logger.warn({ token }, 'Webhook verification failed: token not found');
            throw common_types_1.HttpError.forbidden('Verify token mismatch');
        }
        logger_1.logger.info({ connectionId: connection.id }, 'Webhook verified successfully');
        return reply.status(200).send(challenge);
    }
    /**
     * POST /webhooks/meta
     * Recebe todos os eventos de status e mensagens da Meta
     */
    async receive(request, reply) {
        // Validar assinatura HMAC (X-Hub-Signature-256)
        const signature = request.headers['x-hub-signature-256'];
        if (signature) {
            // Extrair phoneNumberId do payload para buscar o appSecret da conexão correta
            const payload = request.body;
            const phoneNumberId = payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
            const secret = await this.service.resolveAppSecret(phoneNumberId);
            const rawBody = request.rawBody ?? JSON.stringify(request.body);
            const valid = this.service.validateSignature(rawBody, signature, secret);
            if (!valid) {
                logger_1.logger.warn({ signature, phoneNumberId }, 'Invalid webhook signature');
                throw common_types_1.HttpError.forbidden('Invalid signature');
            }
        }
        const payload = request.body;
        if (!payload?.object || payload.object !== 'whatsapp_business_account') {
            return reply.status(200).send({ ok: true }); // ignora eventos não-WhatsApp
        }
        // Processar de forma assíncrona — responder 200 imediatamente
        // A Meta requer resposta em < 20s, então nunca processamos de forma síncrona
        this.service.receiveEvent(payload, JSON.stringify(request.body)).catch((err) => {
            logger_1.logger.error({ err }, 'Failed to queue webhook event');
        });
        return reply.status(200).send({ ok: true });
    }
    /**
     * POST /webhooks/telegram/:connectionId
     * Recebe updates do Telegram para um bot específico.
     * Telegram exige resposta 200 em < 60s; processamos de forma assíncrona.
     */
    async receiveTelegram(request, reply) {
        const { connectionId } = request.params;
        const update = request.body;
        // Verifica se a conexão existe
        const conn = await database_1.prisma.telegramConnection.findUnique({
            where: { id: connectionId },
            select: { id: true, workspaceId: true, status: true },
        });
        if (!conn) {
            // Retorna 200 de qualquer forma para o Telegram não retentar
            return reply.status(200).send({ ok: true });
        }
        // Enfileira processamento assíncrono
        await queues_1.webhookEventsQueue.add(`tg:${connectionId}:${update.update_id ?? Date.now()}`, {
            type: 'TELEGRAM',
            connectionId,
            workspaceId: conn.workspaceId,
            rawPayload: update,
            receivedAt: new Date().toISOString(),
        }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { age: 86400 },
            removeOnFail: { age: 604800 },
        });
        logger_1.logger.debug({ connectionId, updateId: update.update_id }, 'Telegram update queued');
        return reply.status(200).send({ ok: true });
    }

    async receiveUazapi(request, reply) {
        const body = request.body || {};
        const event = body.event || body.EventType || body.type;
        try {
            if (event === 'messages' || body.data?.fromMe === false || body.message) {
                await this.service.handleUazapiInbound(body);
            } else if (event === 'messages_update' || body.data?.status) {
                await this.service.handleUazapiStatus(body);
            } else if (event === 'connection' || body.data?.connection) {
                await this.service.handleUazapiConnection(body);
            } else {
                logger_1.logger.debug({ event, keys: Object.keys(body).slice(0,8) }, 'uazapi webhook: unknown event');
            }
        } catch (err) {
            logger_1.logger.error({ err: err?.message, event }, 'uazapi webhook handler failed');
        }
        return reply.status(200).send({ ok: true });
    }
}
exports.WebhooksController = WebhooksController;
//# sourceMappingURL=webhooks.controller.js.map