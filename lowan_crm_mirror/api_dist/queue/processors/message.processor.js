"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processMessage = processMessage;
const client_1 = require("@prisma/client");
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const logger_1 = require("../../config/logger");
const connection_balancer_1 = require("../../services/balancer/connection.balancer");
const health_monitor_1 = require("../../services/balancer/health.monitor");
const cloud_api_service_1 = require("../../services/whatsapp/cloud-api.service");
const message_builder_1 = require("../../services/whatsapp/message.builder");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const date_helpers_1 = require("../../utils/date.helpers");
const date_helpers_2 = require("../../utils/date.helpers");
const balancer = new connection_balancer_1.ConnectionBalancer();
async function processMessage(job) {
    const { messageId, campaignId, campaignContactId, contactId, templateId, variables, idempotencyKey, campaignRunId } = job.data;
    const logCtx = { jobId: job.id, messageId, campaignId, contactId };
    // ── Idempotência ────────────────────────────────────────────────────────
    const idemKey = redis_1.RedisKeys.idempotency(idempotencyKey);
    const alreadySent = await redis_1.redis.get(idemKey);
    if (alreadySent) {
        logger_1.logger.info({ ...logCtx, idempotencyKey }, 'Duplicate job detected, skipping');
        return;
    }
    // ── Verificar pausa da campanha ─────────────────────────────────────────
    const paused = await redis_1.redis.get(redis_1.RedisKeys.campaignPause(campaignId));
    if (paused) {
        logger_1.logger.info({ ...logCtx }, 'Campaign is paused, requeueing job');
        throw new Error('CAMPAIGN_PAUSED'); // BullMQ fará retry com backoff
    }
    // ── Buscar dados necessários ────────────────────────────────────────────
    const [contact, template, message, campaignConfig] = await Promise.all([
        database_1.prisma.contact.findUnique({ where: { id: contactId } }),
        database_1.prisma.template.findUnique({ where: { id: templateId } }),
        database_1.prisma.message.findUnique({ where: { id: messageId } }),
        database_1.prisma.campaign.findUnique({ where: { id: campaignId }, select: { allowedConnectionIds: true } }),
    ]);
    if (!contact || !template || !message) {
        logger_1.logger.error({ ...logCtx }, 'Missing contact/template/message record');
        await markFailed(messageId, campaignContactId, 'MISSING_DATA', 'PERMANENT', 'Required record not found');
        await tryFinalizeCampaign(campaignId).catch(() => { });
        return;
    }
    // ── Validações de negócio ───────────────────────────────────────────────
    if (!contact.optIn) {
        logger_1.logger.warn({ ...logCtx }, 'Contact has no opt-in, skipping');
        await markSkipped(messageId, campaignContactId, 'Contact has no opt-in');
        await tryFinalizeCampaign(campaignId).catch(() => { });
        return;
    }
    if (contact.isBlacklisted) {
        logger_1.logger.warn({ ...logCtx }, 'Contact is blacklisted, skipping');
        await markSkipped(messageId, campaignContactId, 'Contact is blacklisted');
        await tryFinalizeCampaign(campaignId).catch(() => { });
        return;
    }
    if (template.status !== 'APPROVED') {
        logger_1.logger.error({ ...logCtx }, 'Template is not approved');
        await markFailed(messageId, campaignContactId, 'TEMPLATE_NOT_APPROVED', 'PERMANENT', 'Template is not approved');
        await tryFinalizeCampaign(campaignId).catch(() => { });
        return;
    }
    // ── Buscar campanha e verificar janela de envio ─────────────────────────
    const campaign = await database_1.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (campaign?.sendWindowStart && campaign?.sendWindowEnd) {
        const inWindow = (0, date_helpers_2.isWithinSendWindow)(campaign.sendWindowStart, campaign.sendWindowEnd, campaign.timezone);
        if (!inWindow) {
            logger_1.logger.info({ ...logCtx }, 'Outside send window, requeueing');
            throw new Error('OUTSIDE_SEND_WINDOW'); // BullMQ retry com delay
        }
    }
    // ── Selecionar conexão via balancer (WABAs com template aprovado, filtrado pela campanha) ──
    const campaignAllowed = campaignConfig?.allowedConnectionIds;
    const templateConnections = await database_1.prisma.template.findMany({
        where: { name: template.name, status: 'APPROVED', connectionId: { not: null } },
        select: { connectionId: true },
    }).then((rows) => rows.map((r) => r.connectionId));
    const eligibleConnectionIds = campaignAllowed?.length
        ? templateConnections.filter((id) => campaignAllowed.includes(id))
        : templateConnections;
    const { connectionId, reason } = eligibleConnectionIds.length > 0
        ? await balancer.selectConnection(eligibleConnectionIds)
        : await balancer.selectConnection();
    if (!connectionId) {
        logger_1.logger.warn({ ...logCtx, reason }, 'No connection available, requeueing');
        // Pausar a campanha automaticamente
        await database_1.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
        await redis_1.redis.set(redis_1.RedisKeys.campaignPause(campaignId), reason ?? 'No connections available');
        throw new Error(`NO_CONNECTION: ${reason}`);
    }
    // ── Buscar token da conexão ─────────────────────────────────────────────
    const connection = await database_1.prisma.whatsappConnection.findUnique({
        where: { id: connectionId },
        select: { accessTokenEnc: true, phoneNumberId: true, rateLimitPerMinute: true, rateLimitPerDay: true, createdAt: true },
    });
    if (!connection) {
        throw new Error(`Connection ${connectionId} not found`);
    }
    // ── Warm-up: limitar envios baseado na idade da conexão ──────────────────
    const ageInDays = Math.floor((Date.now() - connection.createdAt.getTime()) / 86_400_000);
    const warmupLimit = getWarmupDailyLimit(ageInDays, connection.rateLimitPerDay);
    if (warmupLimit < connection.rateLimitPerDay) {
        const sentToday = parseInt(await redis_1.redis.get(redis_1.RedisKeys.rateConnDay(connectionId)) ?? '0');
        if (sentToday >= warmupLimit) {
            logger_1.logger.info({ ...logCtx, connectionId, ageInDays, warmupLimit, sentToday }, 'Warm-up daily limit reached, requeueing');
            throw new Error(`WARMUP_LIMIT: connection age ${ageInDays}d, limit ${warmupLimit}/day`);
        }
    }
    // ── Resolver variáveis ──────────────────────────────────────────────────
    const firstName = contact.name.trim().split(/\s+/)[0];
    const resolvedVars = (0, message_builder_1.resolveVariables)(contact.customVariables, { ...variables, nome: contact.name, primeiro_nome: firstName, phone: contact.phone });
    // ── Montar payload ──────────────────────────────────────────────────────
    const templateData = {
        name: template.name,
        language: template.language,
        headerType: template.headerType,
        headerContent: template.headerContent,
        variables: template.variables,
        variablesCount: template.variablesCount,
    };
    const payload = (0, message_builder_1.buildTemplatePayload)(contact.phoneNormalized, templateData, resolvedVars);
    // ── Intervalo aleatório ─────────────────────────────────────────────────
    if (campaign && (campaign.minIntervalSeconds > 0 || campaign.maxIntervalSeconds > 0)) {
        const delayMs = (0, date_helpers_1.randomBetween)(campaign.minIntervalSeconds, campaign.maxIntervalSeconds) * 1000;
        if (delayMs > 0)
            await sleep(delayMs);
    }
    // ── Atualizar message com connectionId antes de enviar ──────────────────
    await database_1.prisma.message.update({
        where: { id: messageId },
        data: { connectionId, payloadSent: payload },
    });
    // ── Enviar via Cloud API ────────────────────────────────────────────────
    const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
    const result = await cloud_api_service_1.cloudApiService.sendTemplate(connection.phoneNumberId, accessToken, payload);
    // ── Tratar resultado ────────────────────────────────────────────────────
    if (result.success && result.wamid) {
        // Marcar idempotência no Redis por 24h
        await redis_1.redis.setex(idemKey, 86400, '1');
        await database_1.prisma.$transaction([
            database_1.prisma.message.update({
                where: { id: messageId },
                data: {
                    status: client_1.MessageStatus.SENT,
                    wamid: result.wamid,
                    metaResponse: result.rawResponse,
                    sentAt: new Date(),
                    connectionId,
                },
            }),
            database_1.prisma.campaignContact.update({
                where: { id: campaignContactId },
                data: { status: client_1.CampaignContactStatus.SENT, lastAttemptAt: new Date() },
            }),
            database_1.prisma.campaign.update({
                where: { id: campaignId },
                data: { sentCount: { increment: 1 } },
            }),
        ]);
        await tryFinalizeCampaign(campaignId).catch(() => { });
        // Boost health on success
        const conn = await database_1.prisma.whatsappConnection.findUnique({
            where: { id: connectionId },
            select: { healthScore: true },
        });
        if (conn && conn.healthScore < 100) {
            await health_monitor_1.healthMonitor.updateHealthScore(connectionId, Math.min(100, conn.healthScore + 1));
        }
        // Update DB daily counter
        await database_1.prisma.whatsappConnection.update({
            where: { id: connectionId },
            data: { messagesSentToday: { increment: 1 } },
        });
        logger_1.logger.info({ ...logCtx, wamid: result.wamid, connectionId }, 'Message sent');
    }
    else if (result.error) {
        await handleSendError(result.error, {
            messageId,
            campaignId,
            campaignContactId,
            contactId,
            connectionId,
            payload,
        });
        // Release balancer slot
        await balancer.releaseSlot(connectionId);
        // Check if we need to pause the connection
        if (result.error.pauseConnection) {
            const { shouldPause, pauseSeconds } = await health_monitor_1.healthMonitor.recordError(connectionId, result.error.type);
            if (shouldPause) {
                await health_monitor_1.healthMonitor.autoPauseConnection(connectionId, `Auto-pause: ${result.error.type} — ${result.error.message}`, pauseSeconds);
            }
        }
        // Auto-blacklist invalid numbers
        if (result.error.blacklistContact) {
            await database_1.prisma.contact.update({
                where: { id: contactId },
                data: {
                    isBlacklisted: true,
                    blacklistedAt: new Date(),
                    blacklistReason: `Auto-blacklisted: ${result.error.message}`,
                },
            });
        }
        // Retryable errors should throw so BullMQ retries
        if (result.error.retryable) {
            throw new Error(`Retryable error: ${result.error.code} — ${result.error.message}`);
        }
        await tryFinalizeCampaign(campaignId).catch(() => { });
    }
    // Always release pending slot
    await balancer.releaseSlot(connectionId);
}
// ── Helpers ──────────────────────────────────────────────────────────────────
async function markFailed(messageId, campaignContactId, code, errorType, errorMessage) {
    await database_1.prisma.$transaction([
        database_1.prisma.message.update({
            where: { id: messageId },
            data: {
                status: client_1.MessageStatus.FAILED,
                errorCode: code,
                errorType: errorType,
                errorMessage,
                failedAt: new Date(),
            },
        }),
        database_1.prisma.campaignContact.update({
            where: { id: campaignContactId },
            data: {
                status: client_1.CampaignContactStatus.FAILED,
                attemptCount: { increment: 1 },
                lastAttemptAt: new Date(),
            },
        }),
    ]);
}
async function markSkipped(messageId, campaignContactId, reason) {
    await database_1.prisma.$transaction([
        database_1.prisma.message.update({
            where: { id: messageId },
            data: { status: client_1.MessageStatus.REJECTED, errorMessage: reason },
        }),
        database_1.prisma.campaignContact.update({
            where: { id: campaignContactId },
            data: { status: client_1.CampaignContactStatus.SKIPPED, skipReason: reason },
        }),
    ]);
}
async function handleSendError(error, ctx) {
    await database_1.prisma.$transaction([
        database_1.prisma.message.update({
            where: { id: ctx.messageId },
            data: {
                status: client_1.MessageStatus.FAILED,
                errorCode: error.code,
                errorType: error.type,
                errorMessage: error.message,
                failedAt: new Date(),
            },
        }),
        database_1.prisma.campaignContact.update({
            where: { id: ctx.campaignContactId },
            data: {
                status: client_1.CampaignContactStatus.FAILED,
                attemptCount: { increment: 1 },
                lastAttemptAt: new Date(),
            },
        }),
        database_1.prisma.campaign.update({
            where: { id: ctx.campaignId },
            data: { failedCount: { increment: 1 } },
        }),
    ]);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Retorna o limite diário efetivo baseado na idade da conexão (warm-up).
 * Protege números novos de serem banidos por volume alto inicial.
 *
 * Dia 1:          máx 10/dia
 * Dias 2-3:       máx 20/dia
 * Dias 4-7:       máx 40/dia
 * Dias 8-14:      máx 80/dia
 * Dias 15-21:     máx 200/dia
 * Dias 22-29:     máx 500/dia
 * Dias 30-59:     máx 1000/dia
 * 60+ dias:       usa o limite configurado
 */
function getWarmupDailyLimit(ageInDays, configuredLimit) {
    if (ageInDays < 1)
        return Math.min(configuredLimit, 10);
    if (ageInDays < 3)
        return Math.min(configuredLimit, 20);
    if (ageInDays < 7)
        return Math.min(configuredLimit, 40);
    if (ageInDays < 14)
        return Math.min(configuredLimit, 80);
    if (ageInDays < 21)
        return Math.min(configuredLimit, 200);
    if (ageInDays < 30)
        return Math.min(configuredLimit, 500);
    if (ageInDays < 60)
        return Math.min(configuredLimit, 1000);
    return configuredLimit;
}
async function tryFinalizeCampaign(campaignId) {
    const pendingCount = await database_1.prisma.campaignContact.count({
        where: {
            campaignId,
            status: { in: [client_1.CampaignContactStatus.PENDING, client_1.CampaignContactStatus.QUEUED] },
        },
    });
    if (pendingCount > 0)
        return;
    const campaign = await database_1.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
    });
    if (!campaign || campaign.status !== client_1.CampaignStatus.RUNNING)
        return;
    const run = await database_1.prisma.campaignRun.findFirst({
        where: { campaignId, status: 'RUNNING' },
        orderBy: { runNumber: 'desc' },
    });
    if (!run)
        return;
    await database_1.prisma.$transaction([
        database_1.prisma.campaign.update({
            where: { id: campaignId },
            data: { status: client_1.CampaignStatus.FINISHED, finishedAt: new Date() },
        }),
        database_1.prisma.campaignRun.update({
            where: { id: run.id },
            data: { status: 'FINISHED', finishedAt: new Date() },
        }),
    ]);
    logger_1.logger.info({ campaignId }, 'Campaign auto-finalized after all messages processed');
}
//# sourceMappingURL=message.processor.js.map