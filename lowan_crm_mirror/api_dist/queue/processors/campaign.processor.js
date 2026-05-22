"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCampaign = processCampaign;
const client_1 = require("@prisma/client");
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const logger_1 = require("../../config/logger");
const queues_1 = require("../../queue/queues");
async function processCampaign(job) {
    const { campaignId, campaignRunId, page, pageSize } = job.data;
    const logCtx = { jobId: job.id, campaignId, campaignRunId, page };
    // Verificar se a campanha ainda está running (pode ter sido pausada)
    const campaign = await database_1.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { template: true },
    });
    if (!campaign) {
        logger_1.logger.error({ ...logCtx }, 'Campaign not found');
        return;
    }
    if (campaign.status !== client_1.CampaignStatus.RUNNING) {
        logger_1.logger.info({ ...logCtx, status: campaign.status }, 'Campaign is not running, stopping processor');
        return;
    }
    // Verificar flag de pausa no Redis
    const paused = await redis_1.redis.get(redis_1.RedisKeys.campaignPause(campaignId));
    if (paused) {
        logger_1.logger.info({ ...logCtx }, 'Campaign paused flag detected, stopping page processing');
        return;
    }
    // Buscar contatos elegíveis desta página
    const tags = campaign.contactTags;
    const contactFilter = {
        optIn: true,
        isBlacklisted: false,
    };
    if (tags && tags.length > 0) {
        contactFilter.tags = { some: { tag: { in: tags } } };
    }
    const skip = page * pageSize;
    const contacts = await database_1.prisma.contact.findMany({
        where: contactFilter,
        skip,
        take: pageSize,
        select: { id: true, phoneNormalized: true, customVariables: true },
        orderBy: { createdAt: 'asc' },
    });
    if (contacts.length === 0) {
        // Sem mais contatos — campanha concluída
        logger_1.logger.info({ ...logCtx }, 'No more contacts, finalizing campaign');
        await finalizeCampaign(campaignId, campaignRunId);
        return;
    }
    // Criar jobs de mensagem para cada contato desta página
    const run = await database_1.prisma.campaignRun.findUnique({ where: { id: campaignRunId } });
    if (!run) {
        logger_1.logger.error({ ...logCtx }, 'Campaign run not found');
        return;
    }
    const messageJobs = [];
    for (const contact of contacts) {
        // Verificar se já existe campaign_contact com status != PENDING para este contato
        const existing = await database_1.prisma.campaignContact.findUnique({
            where: { campaignId_contactId: { campaignId, contactId: contact.id } },
        });
        // Pular apenas contatos já finalizados com sucesso ou explicitamente ignorados
        const terminalStatuses = ['SENT', 'DELIVERED', 'READ', 'SKIPPED'];
        if (existing && terminalStatuses.includes(existing.status)) {
            continue;
        }
        // Verificar limite de mensagens por contato nesta campanha
        if (existing && existing.attemptCount >= campaign.maxMessagesPerContact) {
            continue;
        }
        // Criar ou reutilizar campaign_contact
        let campaignContact = existing;
        if (!campaignContact) {
            campaignContact = await database_1.prisma.campaignContact.create({
                data: {
                    campaignId,
                    contactId: contact.id,
                    status: client_1.CampaignContactStatus.QUEUED,
                },
            });
        }
        else {
            await database_1.prisma.campaignContact.update({
                where: { id: existing.id },
                data: { status: client_1.CampaignContactStatus.QUEUED },
            });
        }
        // Criar registro de mensagem e vincular ao campaignContact
        const message = await database_1.prisma.message.create({
            data: {
                campaignId,
                campaignContactId: campaignContact.id,
                contactId: contact.id,
                connectionId: (await getAnyActiveConnectionId(campaign.allowedConnectionIds)) ?? '',
                templateId: campaign.templateId,
                status: client_1.MessageStatus.PENDING,
            },
        });
        await database_1.prisma.campaignContact.update({
            where: { id: campaignContact.id },
            data: { messageId: message.id },
        });
        const idempotencyKey = `${campaignId}:${contact.id}:${run.runNumber}`;
        messageJobs.push({
            name: `msg-${campaignId}-${contact.id}`,
            data: {
                messageId: message.id,
                campaignId,
                campaignRunId,
                campaignContactId: campaignContact.id,
                contactId: contact.id,
                templateId: campaign.templateId,
                variables: {},
                idempotencyKey,
                attempt: 0,
            },
            opts: {
                jobId: `msg-${campaignId}-${contact.id}-run-${run.runNumber}`,
                attempts: 5,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: { age: 86400 },
                removeOnFail: { age: 604800 },
            },
        });
    }
    // Adicionar jobs em batch para a fila de mensagens
    if (messageJobs.length > 0) {
        await queues_1.messageSendQueue.addBulk(messageJobs);
        await database_1.prisma.campaignRun.update({
            where: { id: campaignRunId },
            data: { totalJobs: { increment: messageJobs.length } },
        });
        logger_1.logger.info({ ...logCtx, jobsCreated: messageJobs.length }, 'Message jobs enqueued');
    }
    // Enfileirar próxima página (se havia contatos nesta)
    if (contacts.length === pageSize) {
        const nextPage = page + 1;
        await queues_1.campaignRunnerQueue.add(`campaign-${campaignId}-run-${run.runNumber}-page-${nextPage}`, { campaignId, campaignRunId, page: nextPage, pageSize }, {
            jobId: `campaign-${campaignId}-run-${run.runNumber}-page-${nextPage}`,
            delay: 500,
        });
        logger_1.logger.debug({ ...logCtx, nextPage }, 'Next page enqueued');
    }
    else {
        // Última página de contatos
        logger_1.logger.info({ ...logCtx }, 'Last page processed, waiting for messages to complete');
    }
}
async function finalizeCampaign(campaignId, campaignRunId) {
    // Verificar se ainda há mensagens pendentes
    const pendingCount = await database_1.prisma.campaignContact.count({
        where: {
            campaignId,
            status: { in: [client_1.CampaignContactStatus.PENDING, client_1.CampaignContactStatus.QUEUED] },
        },
    });
    if (pendingCount > 0) {
        // Ainda tem mensagens em processamento, verificar depois
        logger_1.logger.info({ campaignId, pendingCount }, 'Waiting for pending messages before finalizing');
        return;
    }
    await database_1.prisma.$transaction([
        database_1.prisma.campaign.update({
            where: { id: campaignId },
            data: { status: client_1.CampaignStatus.FINISHED, finishedAt: new Date() },
        }),
        database_1.prisma.campaignRun.update({
            where: { id: campaignRunId },
            data: { status: 'FINISHED', finishedAt: new Date() },
        }),
    ]);
    logger_1.logger.info({ campaignId }, 'Campaign finished');
}
async function getAnyActiveConnectionId(allowedIds = []) {
    const where = { status: 'ACTIVE' };
    if (allowedIds.length > 0)
        where.id = { in: allowedIds };
    const conn = await database_1.prisma.whatsappConnection.findFirst({
        where,
        select: { id: true },
    });
    return conn?.id ?? null;
}
//# sourceMappingURL=campaign.processor.js.map