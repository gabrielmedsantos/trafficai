export interface TelegramBotInfo {
    id: number;
    username: string;
    first_name: string;
    can_join_groups: boolean;
    can_read_all_group_messages: boolean;
}
export interface TelegramWebhookInfo {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
}
export interface TelegramSendResult {
    ok: boolean;
    message_id?: number;
    error?: string;
}
export declare class TelegramApiService {
    private url;
    private call;
    getMe(token: string): Promise<TelegramBotInfo>;
    setWebhook(token: string, webhookUrl: string, secretToken?: string): Promise<boolean>;
    deleteWebhook(token: string): Promise<boolean>;
    getWebhookInfo(token: string): Promise<TelegramWebhookInfo>;
    sendMessage(token: string, chatId: string, text: string): Promise<TelegramSendResult>;
    sendVoice(token: string, chatId: string, audioBuffer: Buffer, mimeType: string): Promise<TelegramSendResult>;
}
export declare const telegramApiService: TelegramApiService;
//# sourceMappingURL=telegram-api.service.d.ts.map