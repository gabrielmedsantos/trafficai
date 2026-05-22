"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const database_1 = require("../../config/database");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const telegram_api_service_1 = require("../../services/telegram/telegram-api.service");
const common_types_1 = require("../../types/common.types");
const env_1 = require("../../config/env");
class TelegramService {
    /**
     * Constrói a URL pública do webhook para um bot específico.
     * Usa WEBHOOK_BASE_URL (ex: https://lowan.site) + /webhooks/telegram/:id
     */
    webhookUrl(connectionId) {
        const base = env_1.env.WEBHOOK_BASE_URL.replace(/\/$/, '');
        return `${base}/webhooks/telegram/${connectionId}`;
    }
    async list(workspaceId) {
        const bots = await database_1.prisma.telegramConnection.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                botUsername: true,
                botId: true,
                webhookUrl: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return bots;
    }
    async create(input, userId, workspaceId) {
        // Valida o token e obtém informações do bot
        let botInfo;
        try {
            botInfo = await telegram_api_service_1.telegramApiService.getMe(input.botToken);
        }
        catch (err) {
            throw common_types_1.HttpError.badRequest(`Token inválido: ${err instanceof Error ? err.message : 'erro desconhecido'}`);
        }
        // Verifica se este bot já está cadastrado
        const botIdStr = String(botInfo.id);
        const existing = await database_1.prisma.telegramConnection.findFirst({
            where: { botId: botIdStr },
        });
        if (existing) {
            throw common_types_1.HttpError.conflict(`Bot @${botInfo.username} já está cadastrado`, 'DUPLICATE_BOT');
        }
        // Salva com token criptografado
        const botTokenEnc = (0, token_encryption_1.encrypt)(input.botToken);
        const bot = await database_1.prisma.telegramConnection.create({
            data: {
                name: input.name,
                botTokenEnc,
                botId: botIdStr,
                botUsername: botInfo.username,
                status: 'ACTIVE',
                workspaceId,
                createdById: userId,
            },
            select: { id: true, name: true, botUsername: true, botId: true, status: true, createdAt: true },
        });
        // Registra o webhook no Telegram
        const url = this.webhookUrl(bot.id);
        try {
            await telegram_api_service_1.telegramApiService.setWebhook(input.botToken, url);
            await database_1.prisma.telegramConnection.update({
                where: { id: bot.id },
                data: { webhookUrl: url },
            });
        }
        catch (err) {
            // Salva mesmo se webhook falhar — operador pode reconfigurar depois
            await database_1.prisma.telegramConnection.update({
                where: { id: bot.id },
                data: { status: 'ERROR' },
            });
        }
        return { ...bot, webhookUrl: url };
    }
    async delete(id, workspaceId) {
        const bot = await database_1.prisma.telegramConnection.findFirst({
            where: { id, workspaceId },
            select: { id: true, botTokenEnc: true },
        });
        if (!bot)
            throw common_types_1.HttpError.notFound('Bot não encontrado');
        // Remove webhook do Telegram (fire-and-forget)
        try {
            const token = (0, token_encryption_1.decrypt)(bot.botTokenEnc);
            await telegram_api_service_1.telegramApiService.deleteWebhook(token);
        }
        catch { }
        // Desvincula mensagens antes de deletar
        await database_1.prisma.message.updateMany({
            where: { telegramConnectionId: id },
            data: { telegramConnectionId: null },
        });
        await database_1.prisma.telegramConnection.delete({ where: { id } });
        return { ok: true };
    }
    async check(id, workspaceId) {
        const bot = await database_1.prisma.telegramConnection.findFirst({
            where: { id, workspaceId },
            select: { id: true, name: true, botTokenEnc: true, botUsername: true, webhookUrl: true, status: true },
        });
        if (!bot)
            throw common_types_1.HttpError.notFound('Bot não encontrado');
        const token = (0, token_encryption_1.decrypt)(bot.botTokenEnc);
        // Valida token via getMe
        let botInfo = null;
        let tokenValid = false;
        try {
            botInfo = await telegram_api_service_1.telegramApiService.getMe(token);
            tokenValid = true;
        }
        catch { }
        // Verifica webhook registrado
        let webhookInfo = null;
        let webhookOk = false;
        if (tokenValid) {
            try {
                webhookInfo = await telegram_api_service_1.telegramApiService.getWebhookInfo(token);
                const expectedUrl = this.webhookUrl(id);
                webhookOk = webhookInfo.url === expectedUrl;
                // Reconfigura webhook se URL mudou
                if (!webhookOk) {
                    await telegram_api_service_1.telegramApiService.setWebhook(token, expectedUrl);
                    await database_1.prisma.telegramConnection.update({ where: { id }, data: { webhookUrl: expectedUrl } });
                    webhookOk = true;
                    webhookInfo = { ...webhookInfo, url: expectedUrl };
                }
            }
            catch { }
        }
        // Atualiza status
        const newStatus = tokenValid ? 'ACTIVE' : 'ERROR';
        if (newStatus !== bot.status) {
            await database_1.prisma.telegramConnection.update({ where: { id }, data: { status: newStatus } });
        }
        return {
            valid: tokenValid,
            webhookOk,
            status: newStatus,
            botInfo,
            webhookInfo,
        };
    }
    /** Retorna o token descriptografado — uso interno (webhook processor) */
    async getDecryptedToken(id) {
        const bot = await database_1.prisma.telegramConnection.findUnique({
            where: { id },
            select: { botTokenEnc: true },
        });
        if (!bot)
            throw common_types_1.HttpError.notFound('Bot não encontrado');
        return (0, token_encryption_1.decrypt)(bot.botTokenEnc);
    }
}
exports.TelegramService = TelegramService;
//# sourceMappingURL=telegram.service.js.map