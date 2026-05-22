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
    // Rotas para Telegram MTProto (user) vs Telegram Bot vs Meta
    if (job.data.type === 'TELEGRAM_USER') {
        return processTelegramUserUpdate(job.data.rawPayload, job.data.connectionId, job.data.workspaceId ?? undefined);
    }
    if (job.data.type === 'TELEGRAM') {
        return processTelegramUpdate(job.data.rawPayload, job.data.connectionId, job.data.workspaceId ?? undefined);
    }
    const { webhookEventId } = job.data;
    if (!webhookEventId)
        return;
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
    // Normaliza para E.164 sem + (ex: 41997460062 → 5541997460062)
    const phoneNormalized = (0, phone_normalizer_1.normalizePhone)(message.from).normalized ?? message.from;
    const phoneVariants = (0, phone_normalizer_1.brazilianPhoneVariants)(phoneNormalized);
    let contact = await database_1.prisma.contact.findFirst({
        where: { phoneNormalized: { in: phoneVariants }, workspaceId: workspaceId ?? null },
        select: { id: true },
    });
    if (!contact) {
        try {
            contact = await database_1.prisma.contact.create({
                data: {
                    name: profileName || message.from,
                    phone: message.from,
                    phoneNormalized,
                    optIn: true,
                    optInSource: 'whatsapp_inbound',
                    workspaceId: workspaceId ?? null,
                },
                select: { id: true },
            });
            logger_1.logger.info({ phone: message.from, name: profileName, workspaceId }, 'Auto-created contact from inbound message');
        }
        catch {
            // Race condition: outro processo criou o contato entre o findFirst e o create
            contact = await database_1.prisma.contact.findFirst({
                where: { phoneNormalized: { in: phoneVariants }, workspaceId: workspaceId ?? null },
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
        if (msg.contacts?.length) {
            const c = msg.contacts[0];
            const name = c.name?.formatted_name ?? c.name?.first_name ?? 'Contato';
            const phone = c.phones?.[0]?.phone ?? '';
            messageContent = phone ? `👤 ${name} · ${phone}` : `👤 ${name}`;
        }
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
    // Find linked lead (by contactId + workspace) or try to auto-link by phone
    // Filtering by workspaceId ensures the same contact can have independent leads in different workspaces
    let lead = await database_1.prisma.lead.findFirst({
        where: {
            contactId: contact.id,
            ...(workspaceId ? { workspaceId } : {}),
        },
        select: { id: true },
    });
    if (!lead) {
        // Busca lead por qualquer variante do número (com/sem DDI, com/sem 9º dígito)
        // Sem filtro contactId: null — evita duplicidade quando o lead já foi vinculado com variante diferente
        const candidateLead = await database_1.prisma.lead.findFirst({
            where: {
                ...(workspaceId ? { workspaceId } : {}),
                OR: phoneVariants.map(p => ({ phone: p })),
            },
            select: { id: true, contactId: true },
        });
        if (candidateLead) {
            // Vincula ao contato atual se ainda não estiver vinculado
            if (!candidateLead.contactId) {
                await database_1.prisma.lead.update({
                    where: { id: candidateLead.id },
                    data: { contactId: contact.id },
                });
            }
            lead = { id: candidateLead.id };
            logger_1.logger.info({ leadId: candidateLead.id, phone: message.from }, 'Auto-linked lead to contact via inbound message');
        }
        else {
            // Nenhum lead encontrado — auto-cria armazenando o telefone canônico
            try {
                lead = await database_1.prisma.lead.create({
                    data: {
                        name: profileName || message.from,
                        phone: message.from,
                        contactId: contact.id,
                        status: 'disponivel',
                        origin: 'whatsapp_inbound',
                        workspaceId: workspaceId ?? '00000000-0000-0000-0000-000000000001',
                    },
                    select: { id: true },
                });
                logger_1.logger.info({ leadId: lead.id, phone: message.from, name: profileName }, 'Auto-created lead from inbound message');
                // Fire AUTO_ASSIGN for new inbound lead (fire-and-forget)
                if (workspaceId) {
                    ;
                    kanban_service_1.KanbanService.applyAutoAssignRules(workspaceId, lead.id, null).catch((err) => logger_1.logger.warn({ err, leadId: lead.id }, 'AUTO_ASSIGN rule error'));
                }
            }
            catch {
                // Race condition: lead criado concorrentemente
                lead = await database_1.prisma.lead.findFirst({ where: { contactId: contact.id }, select: { id: true } });
            }
        }
    }
    if (lead) {
        const updatedLead = await database_1.prisma.lead.update({
            where: { id: lead.id },
            data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
            select: { stageId: true, workspaceId: true },
        });
        // Reações (👍 ❤️ etc.) e mensagens de sistema NÃO contam como resposta do lead.
        // A Meta envia reações como type:"reaction" em value.messages, o que antes disparava
        // LEAD_REPLIED incorretamente — movendo o lead para "Respondeu" só por ele ter
        // reagido à mensagem (comportamento que o usuário interpreta como "leitura").
        const isActualReply = message.type !== 'reaction' && message.type !== 'system';
        if (updatedLead.workspaceId && isActualReply) {
            ;
            kanban_service_1.KanbanService.applyEventRules(updatedLead.workspaceId, lead.id, updatedLead.stageId, 'LEAD_REPLIED').catch((err) => logger_1.logger.warn({ err, leadId: lead.id }, 'LEAD_REPLIED rule error'));
        }
    }
    logger_1.logger.info({ from: message.from, wamid: message.id, type: message.type }, 'Incoming message stored');
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
// ─── Telegram ────────────────────────────────────────────────────────────────
async function processTelegramUpdate(update, connectionId, workspaceId) {
    const message = (update.message ?? update.channel_post);
    if (!message)
        return; // edited_message, inline_query, etc. — ignorar por ora
    const chatId = String(message.chat?.id);
    const telegramMessageId = String(message.message_id);
    const fromName = message.from?.first_name ??
        message.chat?.first_name ??
        message.chat?.title ??
        chatId;
    const fromUsername = message.from?.username ?? message.chat?.username;
    // Extrai conteúdo
    let messageContent = message.text ?? null;
    if (!messageContent) {
        if (message.voice || message.audio)
            messageContent = '🎤 Áudio';
        else if (message.video)
            messageContent = '🎥 Vídeo';
        else if (message.photo)
            messageContent = '📷 Foto';
        else if (message.document)
            messageContent = `📄 ${message.document.file_name ?? 'Documento'}`;
        else if (message.sticker)
            messageContent = `🏷️ Sticker: ${message.sticker.emoji ?? ''}`;
        else if (message.location) {
            const loc = message.location;
            messageContent = `📍 ${loc.latitude}, ${loc.longitude}`;
        }
        else if (message.contact) {
            const c = message.contact;
            messageContent = `👤 Contato: ${c.first_name} ${c.phone_number ?? ''}`;
        }
    }
    // Encontra ou cria Contact pelo telegramChatId (scoped por workspace)
    let contact = await database_1.prisma.contact.findFirst({
        where: { telegramChatId: chatId, workspaceId: workspaceId ?? null },
        select: { id: true, name: true },
    });
    if (!contact) {
        try {
            contact = await database_1.prisma.contact.create({
                data: {
                    name: fromName,
                    phone: `tg_${chatId}`,
                    phoneNormalized: `tg_${chatId}`,
                    telegramChatId: chatId,
                    optIn: true,
                    optInSource: 'telegram_inbound',
                    workspaceId: workspaceId ?? null,
                },
                select: { id: true, name: true },
            });
            logger_1.logger.info({ chatId, name: fromName, workspaceId }, 'Auto-created contact from Telegram');
        }
        catch {
            // Race condition
            contact = await database_1.prisma.contact.findFirst({ where: { telegramChatId: chatId, workspaceId: workspaceId ?? null }, select: { id: true, name: true } });
            if (!contact)
                return;
        }
    }
    else if (contact.name === `tg_${chatId}` && fromName !== `tg_${chatId}`) {
        // Atualiza nome se era placeholder
        await database_1.prisma.contact.update({ where: { id: contact.id }, data: { name: fromName } });
    }
    // Evita processar duplicata (Telegram pode reenviar)
    const msgIdStr = `tg_${telegramMessageId}_${chatId}`;
    const exists = await database_1.prisma.message.findFirst({ where: { telegramMessageId: msgIdStr }, select: { id: true } });
    if (exists)
        return;
    // Salva mensagem
    await database_1.prisma.message.create({
        data: {
            contactId: contact.id,
            telegramConnectionId: connectionId,
            channel: 'TELEGRAM',
            direction: 'INBOUND',
            status: client_1.MessageStatus.DELIVERED,
            telegramMessageId: msgIdStr,
            messageContent,
            metaResponse: message,
            sentAt: message.date ? new Date(Number(message.date) * 1000) : new Date(),
            deliveredAt: new Date(),
            ...(workspaceId ? {} : {}),
        },
    });
    // Encontra ou cria Lead
    let lead = await database_1.prisma.lead.findFirst({
        where: { contactId: contact.id, workspaceId: workspaceId ?? undefined },
        select: { id: true, stageId: true },
    });
    if (!lead) {
        try {
            lead = await database_1.prisma.lead.create({
                data: {
                    name: fromName,
                    phone: `tg_${chatId}`,
                    contactId: contact.id,
                    status: 'disponivel',
                    origin: 'telegram_inbound',
                    workspaceId: workspaceId ?? '00000000-0000-0000-0000-000000000001',
                },
                select: { id: true, stageId: true },
            });
            logger_1.logger.info({ leadId: lead.id, chatId, name: fromName }, 'Auto-created lead from Telegram');
            if (workspaceId) {
                ;
                kanban_service_1.KanbanService.applyAutoAssignRules(workspaceId, lead.id, null).catch((err) => logger_1.logger.warn({ err, leadId: lead.id }, 'AUTO_ASSIGN rule error'));
            }
        }
        catch {
            lead = await database_1.prisma.lead.findFirst({
                where: { contactId: contact.id },
                select: { id: true, stageId: true },
            });
        }
    }
    if (lead) {
        const updatedTgLead = await database_1.prisma.lead.update({
            where: { id: lead.id },
            data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
            select: { stageId: true },
        });
        if (workspaceId) {
            ;
            kanban_service_1.KanbanService.applyEventRules(workspaceId, lead.id, updatedTgLead.stageId, 'LEAD_REPLIED').catch((err) => logger_1.logger.warn({ err, leadId: lead.id }, 'LEAD_REPLIED rule error'));
        }
    }
    logger_1.logger.info({ chatId, telegramMessageId, connectionId }, 'Telegram message stored');
}

// ─── Telegram MTProto (user/personal) — inbound DMs ───────────────────────────
function _tgUserMediaLabel(kind) {
    switch (kind) {
        case 'photo': return '📷 Foto';
        case 'video': return '🎥 Vídeo';
        case 'voice': return '🎤 Áudio';
        case 'audio': return '🎵 Áudio';
        case 'document': return '📄 Documento';
        case 'sticker': return '🏷️ Sticker';
        case 'contact': return '👤 Contato';
        case 'location': return '📍 Localização';
        default: return null;
    }
}

async function processTelegramUserUpdate(payload, connectionId, workspaceId) {
    if (!payload || payload.type !== 'message.in') return;
    const chatId = String(payload.chatId || '');
    if (!chatId) return;
    const telegramMessageId = String(payload.messageId || '');
    const dedupId = `tgu_${chatId}_${telegramMessageId}`;
    // Dedup
    const exists = await database_1.prisma.message.findFirst({ where: { telegramMessageId: dedupId }, select: { id: true } });
    if (exists) return;

    const fromName = (payload.from && (payload.from.firstName || payload.from.username)) || `tg_${chatId}`;
    const phone = `tgu_${chatId}`;
    const messageContent = payload.text || _tgUserMediaLabel(payload.mediaKind);

    // Encontra/cria Contact (mesmo padrão do bot, mas com prefix tgu_)
    let contact = await database_1.prisma.contact.findFirst({
        where: { telegramChatId: chatId, workspaceId: workspaceId ?? null },
        select: { id: true, name: true },
    });
    if (!contact) {
        try {
            contact = await database_1.prisma.contact.create({
                data: {
                    name: fromName,
                    phone,
                    phoneNormalized: phone,
                    telegramChatId: chatId,
                    optIn: true,
                    optInSource: 'telegram_user_inbound',
                    workspaceId: workspaceId ?? null,
                },
                select: { id: true, name: true },
            });
            logger_1.logger.info({ chatId, name: fromName, workspaceId, kind: 'telegram-user' }, 'Auto-created contact from Telegram user');
        }
        catch {
            contact = await database_1.prisma.contact.findFirst({ where: { telegramChatId: chatId, workspaceId: workspaceId ?? null }, select: { id: true, name: true } });
            if (!contact) return;
        }
    }
    else if (contact.name === phone && fromName !== phone) {
        await database_1.prisma.contact.update({ where: { id: contact.id }, data: { name: fromName } });
    }

    // Salva mensagem com telegramUserConnectionId (raw — Prisma client conhece se schema gerado contém,
    // mas como adicionamos via ALTER TABLE sem migration, usa $executeRaw)
    try {
        await database_1.prisma.message.create({
            data: {
                contactId: contact.id,
                channel: 'TELEGRAM',
                direction: 'INBOUND',
                status: client_1.MessageStatus.DELIVERED,
                telegramMessageId: dedupId,
                messageContent,
                metaResponse: payload,
                sentAt: payload.date ? new Date(Number(payload.date) * 1000) : new Date(),
                deliveredAt: new Date(),
            },
        });
        // Adiciona telegram_user_connection_id via raw UPDATE (coluna não está no Prisma client)
        await database_1.prisma.$executeRaw `UPDATE messages SET telegram_user_connection_id = ${connectionId}::uuid WHERE telegram_message_id = ${dedupId}`;
    }
    catch (err) {
        logger_1.logger.error({ err: err.message, chatId, dedupId }, 'Telegram user message insert failed');
        return;
    }

    // Encontra/cria Lead (mesmo padrão do bot)
    let lead = await database_1.prisma.lead.findFirst({
        where: { contactId: contact.id, workspaceId: workspaceId ?? undefined },
        select: { id: true, stageId: true },
    });
    if (!lead) {
        try {
            lead = await database_1.prisma.lead.create({
                data: {
                    name: fromName,
                    phone,
                    contactId: contact.id,
                    status: 'disponivel',
                    origin: 'telegram_user_inbound',
                    workspaceId: workspaceId ?? '00000000-0000-0000-0000-000000000001',
                },
                select: { id: true, stageId: true },
            });
            logger_1.logger.info({ leadId: lead.id, chatId, name: fromName }, 'Auto-created lead from Telegram user');
            if (workspaceId) {
                kanban_service_1.KanbanService.applyAutoAssignRules(workspaceId, lead.id, null).catch((err) => logger_1.logger.warn({ err, leadId: lead.id }, 'AUTO_ASSIGN rule error'));
            }
        }
        catch {
            lead = await database_1.prisma.lead.findFirst({ where: { contactId: contact.id }, select: { id: true, stageId: true } });
        }
    }
    if (lead) {
        const updated = await database_1.prisma.lead.update({
            where: { id: lead.id },
            data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
            select: { stageId: true },
        });
        if (workspaceId) {
            kanban_service_1.KanbanService.applyEventRules(workspaceId, lead.id, updated.stageId, 'LEAD_REPLIED').catch((err) => logger_1.logger.warn({ err, leadId: lead.id }, 'LEAD_REPLIED rule error'));
        }
    }
    logger_1.logger.info({ chatId, dedupId, connectionId }, 'Telegram user message stored');
}
//# sourceMappingURL=webhook.processor.js.map