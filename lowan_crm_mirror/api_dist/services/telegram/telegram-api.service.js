"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramApiService = exports.TelegramApiService = void 0;
const logger_1 = require("../../config/logger");
const TELEGRAM_API = 'https://api.telegram.org/bot';
class TelegramApiService {
    url(token, method) {
        return `${TELEGRAM_API}${token}/${method}`;
    }
    async call(token, method, body) {
        const res = await fetch(this.url(token, method), {
            method: body ? 'POST' : 'GET',
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(10_000),
        });
        const data = await res.json();
        if (!data.ok)
            throw new Error(data.description ?? `Telegram API error on ${method}`);
        return data.result;
    }
    async getMe(token) {
        return this.call(token, 'getMe');
    }
    async setWebhook(token, webhookUrl, secretToken) {
        const body = { url: webhookUrl, allowed_updates: ['message'] };
        if (secretToken)
            body.secret_token = secretToken;
        const result = await this.call(token, 'setWebhook', body);
        logger_1.logger.info({ webhookUrl }, 'Telegram webhook set');
        return result;
    }
    async deleteWebhook(token) {
        return this.call(token, 'deleteWebhook', { drop_pending_updates: false });
    }
    async getWebhookInfo(token) {
        return this.call(token, 'getWebhookInfo');
    }
    async sendMessage(token, chatId, text) {
        try {
            const result = await this.call(token, 'sendMessage', {
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
            });
            return { ok: true, message_id: result.message_id };
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            logger_1.logger.error({ chatId, error }, 'Telegram sendMessage failed');
            return { ok: false, error };
        }
    }
    async getFile(token, fileId) {
        return this.call(token, 'getFile', { file_id: fileId });
    }
    async downloadFile(token, filePath) {
        const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok)
            throw new Error(`Telegram file download ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    }
    async sendVoice(token, chatId, audioBuffer, mimeType) {
        try {
            const form = new FormData();
            form.append('chat_id', chatId);
            form.append('voice', new Blob([audioBuffer], { type: mimeType }), 'voice.ogg');
            const res = await fetch(this.url(token, 'sendVoice'), { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
            const data = await res.json();
            if (!data.ok)
                return { ok: false, error: data.description };
            return { ok: true, message_id: data.result?.message_id };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
}
exports.TelegramApiService = TelegramApiService;
exports.telegramApiService = new TelegramApiService();
//# sourceMappingURL=telegram-api.service.js.map