"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWebhookEvent = processWebhookEvent;
const client_1 = require("@prisma/client");
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const logger_1 = require("../../config/logger");
const kanban_service_1 = require("../../modules/kanban/kanban.service");
const phone_normalizer_1 = require("../../utils/phone.normalizer");
async function processWebhookEvent(job) {
    const { webhookEventId } = job.data;
    const event = await database_1.prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
    if (!event) {
        logger_1.logger.warn({ webhookEventId }, 'Webhook event not found');
        return;
    }
    if (event.processed) {
        logger_1.logger.debug({ webhookEventId }, 'Already processed, skipping');
        return;
    }
    try {
        const payload = event.payloadRaw;
        for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
                if (change.field === 'message_template_status_update') {
                    await processTemplateStatusUpdate(change.value, entry.id);
                    continue;
                }
                const value = change.value;
                for (const status of value.statuses ?? []) {
                    await processStatusUpdate(status);
                }
                // Build a map of waId → profile name from the contacts array
                const contactNames = {};
                for (const c of value.contacts ?? []) {
                    if (c.wa_id && c.profile?.name)
                        contactNames[c.wa_id] = c.profile.name;
                }
                for (const message of value.messages ?? []) {
                    await processIncomingMessage(message, value.metadata?.phone_number_id, contactNames[message.from]);
                }
            }
        }
        await database_1.prisma.webhookEvent.update({
            where: { id: webhookEventId },
            data: { processed: true, processedAt: new Date() },
        });
    }
    catch (err) {
        await database_1.prisma.webhookEvent.update({
            where: { id: webhookEventId },
            data: { error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
    }
}
async function processStatusUpdate(status) {
    const wamid = status.id;
    const message = await database_1.prisma.message.findUnique({ where: { wamid } });
    if (!message) {
        logger_1.logger.debug({ wamid }, 'Message not found for status update');
        return;
    }
    const statusMap = {
        sent: client_1.MessageStatus.SENT,
        delivered: client_1.MessageStatus.DELIVERED,
        read: client_1.MessageStatus.READ,
        failed: client_1.MessageStatus.FAILED,
    };
    const newStatus = statusMap[status.status];
    if (!newStatus)
        return;
    // Nunca regredir status (READ > DELIVERED > SENT)
    const statusOrder = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'REJECTED'];
    const currentIdx = statusOrder.indexOf(message.status);
    const newIdx = statusOrder.indexOf(newStatus);
    if (newIdx <= currentIdx && newStatus !== client_1.MessageStatus.FAILED)
        return;
    const now = new Date(parseInt(status.timestamp) * 1000);
    const updateData = { status: newStatus };
    if (newStatus === client_1.MessageStatus.DELIVERED)
        updateData.deliveredAt = now;
    if (newStatus === client_1.MessageStatus.READ)
        updateData.readAt = now;
    if (newStatus === client_1.MessageStatus.FAILED) {
        updateData.failedAt = now;
        const firstError = status.errors?.[0];
        if (firstError) {
            updateData.errorCode = String(firstError.code);
            updateData.errorMessage = firstError.message;
        }
    }
    await database_1.prisma.message.update({ where: { wamid }, data: updateData });
    // Decrementar contador apenas para templates (sendReply não incrementa, então não decrementa)
    // Identifica template pelo wamid: templates têm wamid real da Meta (não começa com "failed_" nem "manual_")
    const isTemplateMsg = message.wamid && !message.wamid.startsWith('failed_') && !message.wamid.startsWith('manual_');
    if (newStatus === client_1.MessageStatus.FAILED && message.direction === 'OUTBOUND' && message.connectionId && isTemplateMsg) {
        const current = await redis_1.redis.get(redis_1.RedisKeys.rateConnDay(message.connectionId));
        const val = parseInt(current ?? '0');
        if (val > 0) {
            await redis_1.redis.decr(redis_1.RedisKeys.rateConnDay(message.connectionId));
        }
        await database_1.prisma.$executeRaw `
      UPDATE whatsapp_connections
      SET messages_sent_today = GREATEST(0, messages_sent_today - 1)
      WHERE id = ${message.connectionId}
    `;
        logger_1.logger.info({ wamid, connectionId: message.connectionId }, 'Connection counter decremented due to FAILED template webhook');
    }
    // Sync campaign_contact
    if (message.campaignContactId) {
        const ccMap = {
            [client_1.MessageStatus.DELIVERED]: client_1.CampaignContactStatus.DELIVERED,
            [client_1.MessageStatus.READ]: client_1.CampaignContactStatus.READ,
            [client_1.MessageStatus.FAILED]: client_1.CampaignContactStatus.FAILED,
        };
        const ccStatus = ccMap[newStatus];
        if (ccStatus) {
            await database_1.prisma.campaignContact.update({
                where: { id: message.campaignContactId },
                data: { status: ccStatus },
            });
        }
    }
    // Incrementar contadores da campanha
    if (message.campaignId) {
        const counterMap = {
            [client_1.MessageStatus.DELIVERED]: 'deliveredCount',
            [client_1.MessageStatus.READ]: 'readCount',
            [client_1.MessageStatus.FAILED]: 'failedCount',
        };
        const counter = counterMap[newStatus];
        if (counter) {
            await database_1.prisma.campaign.update({
                where: { id: message.campaignId },
                data: { [counter]: { increment: 1 } },
            });
        }
    }
    logger_1.logger.info({ wamid, from: message.status, to: newStatus }, 'Message status updated via webhook');
}
async function processIncomingMessage(message, phoneNumberId, profileName) {
    if (!phoneNumberId)
        return;
    const connection = await database_1.prisma.whatsappConnection.findUnique({
        where: { phoneNumberId },
        select: { id: true, workspaceId: true },
    });
    if (!connection)
        return;
    const workspaceId = connection.workspaceId ?? undefined;
    // Find or auto-create contact — tenta todas as variantes do número (com/sem DDI, com/sem 9º dígito)
    const phoneVariants = (0, phone_normalizer_1.brazilianPhoneVariants)(message.from);
    let contact = await database_1.prisma.contact.findFirst({
        where: { phoneNormalized: { in: phoneVariants } },
        select: { id: true },
    });
    if (!contact) {
        try {
            contact = await database_1.prisma.contact.create({
                data: {
                    name: profileName || message.from,
                    phone: message.from,
                    phoneNormalized: message.from,
                    optIn: true,
                    optInSource: 'whatsapp_inbound',
                },
                select: { id: true },
            });
            logger_1.logger.info({ phone: message.from, name: profileName }, 'Auto-created contact from inbound message');
        }
        catch {
            contact = await database_1.prisma.contact.findFirst({
                where: { phoneNormalized: { in: phoneVariants } },
                select: { id: true },
            });
            if (!contact)
                return;
        }
    }
    const msg = message;
    let messageContent = msg.text?.body ?? null;
    if (!messageContent) {
        if (msg.image)
            messageContent = msg.image.caption ? `📷 ${msg.image.caption}` : null;
        if (msg.video)
            messageContent = msg.video.caption ? `🎥 ${msg.video.caption}` : null;
        if (msg.document)
            messageContent = msg.document.filename ? `📄 ${msg.document.filename}${msg.document.caption ? ` — ${msg.document.caption}` : ''}` : null;
        if (msg.location)
            messageContent = `📍 ${[msg.location.name, msg.location.address].filter(Boolean).join(', ') || `${msg.location.latitude}, ${msg.location.longitude}`}`;
        if (msg.reaction)
            messageContent = msg.reaction.emoji ?? null;
        if (msg.interactive) {
            const ir = msg.interactive;
            messageContent = ir.button_reply?.title ?? ir.list_reply?.title ?? ir.nfm_reply?.body ?? null;
        }
    }
    await database_1.prisma.message.create({
        data: {
            contactId: contact.id,
            connectionId: connection.id,
            direction: 'INBOUND',
            status: client_1.MessageStatus.DELIVERED,
            wamid: message.id,
            messageContent,
            metaResponse: message,
            sentAt: new Date(parseInt(message.timestamp) * 1000),
            deliveredAt: new Date(),
        },
    });
    // If we have a real name and the contact still uses the phone as name, update it
    if (profileName && contact) {
        const existingContact = await database_1.prisma.contact.findUnique({ where: { id: contact.id }, select: { name: true } });
        if (existingContact && existingContact.name === message.from) {
            await database_1.prisma.contact.update({ where: { id: contact.id }, data: { name: profileName } });
        }
    }
    // Find linked lead (by contactId) or try to auto-link by phone
    let lead = await database_1.prisma.lead.findUnique({
        where: { contactId: contact.id },
        select: { id: true },
    });
    if (!lead) {
        const phone = message.from;
        // Try to match lead by phone — tenta todas variantes (com/sem DDI 55, com/sem 9º dígito)
        const candidateLead = await database_1.prisma.lead.findFirst({
            where: {
                contactId: null,
                ...(workspaceId ? { workspaceId } : {}),
                OR: phoneVariants.map(p => ({ phone: p })),
            },
            select: { id: true },
        });
        if (candidateLead) {
            await database_1.prisma.lead.update({
                where: { id: candidateLead.id },
                data: { contactId: contact.id },
            });
            lead = candidateLead;
            logger_1.logger.info({ leadId: candidateLead.id, phone }, 'Auto-linked lead to contact via inbound message');
        }
        else {
            // No lead found by phone — auto-create a new lead for this inbound contact
            try {
                lead = await database_1.prisma.lead.create({
                    data: {
                        name: profileName || phone,
                        phone,
                        contactId: contact.id,
                        status: 'disponivel',
                        origin: 'whatsapp_inbound',
                        workspaceId: workspaceId ?? '00000000-0000-0000-0000-000000000001',
                    },
                    select: { id: true },
                });
                logger_1.logger.info({ leadId: lead.id, phone, name: profileName }, 'Auto-created lead from inbound message');
                // Fire AUTO_ASSIGN for new inbound lead (fire-and-forget)
                if (workspaceId) {
                    kanban_service_1.KanbanService.applyAutoAssignRules(workspaceId, lead.id, null).catch((err) => logger_1.logger.warn({ err, leadId: lead.id }, 'AUTO_ASSIGN rule error'));
                }
            }
            catch {
                // Lead may have been created concurrently (race condition)
                lead = await database_1.prisma.lead.findUnique({ where: { contactId: contact.id }, select: { id: true } });
            }
        }
    }
    if (lead) {
        const updatedLead = await database_1.prisma.lead.update({
            where: { id: lead.id },
            data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
            select: { stageId: true, workspaceId: true },
        });
        // Fire LEAD_REPLIED rules (fire-and-forget)
        if (updatedLead.workspaceId) {
            kanban_service_1.KanbanService.applyEventRules(updatedLead.workspaceId, lead.id, updatedLead.stageId, 'LEAD_REPLIED').catch((err) => logger_1.logger.warn({ err, leadId: lead.id }, 'LEAD_REPLIED rule error'));
        }
    }
    logger_1.logger.info({ from: message.from, wamid: message.id }, 'Incoming message stored');
}
async function processTemplateStatusUpdate(value, wabaId) {
    const statusMap = {
        APPROVED: client_1.TemplateStatus.APPROVED,
        REJECTED: client_1.TemplateStatus.REJECTED,
        DISABLED: client_1.TemplateStatus.DISABLED,
        FLAGGED: client_1.TemplateStatus.PENDING,
        REINSTATED: client_1.TemplateStatus.APPROVED,
    };
    const newStatus = statusMap[value.event];
    if (!newStatus)
        return;
    const metaTemplateIdStr = String(value.message_template_id);
    // Resolve connectionId from wabaId to find the exact template for this WABA
    let connectionId;
    if (wabaId) {
        const conn = await database_1.prisma.whatsappConnection.findFirst({
            where: { wabaId },
            select: { id: true },
        });
        connectionId = conn?.id ?? undefined;
    }
    const template = await database_1.prisma.template.findFirst({
        where: {
            OR: [
                { metaTemplateId: metaTemplateIdStr },
                {
                    name: value.message_template_name,
                    ...(connectionId ? { connectionId } : {}),
                },
            ],
        },
    });
    if (!template) {
        logger_1.logger.warn({ ...value }, 'Template not found for status update webhook');
        return;
    }
    const updateData = { status: newStatus, metaTemplateId: metaTemplateIdStr };
    if (value.new_category) {
        updateData.category = value.new_category.toUpperCase();
    }
    await database_1.prisma.template.update({
        where: { id: template.id },
        data: updateData,
    });
    logger_1.logger.info({
        templateId: template.id,
        name: value.message_template_name,
        status: newStatus,
        ...(value.new_category && { categoryChanged: `${value.previous_category} → ${value.new_category}` }),
    }, 'Template status updated via webhook');
}
//# sourceMappingURL=webhook.processor.js.map