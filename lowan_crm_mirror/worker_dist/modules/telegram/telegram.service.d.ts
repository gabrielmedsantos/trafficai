import type { CreateTelegramBotInput } from './telegram.schema';
export declare class TelegramService {
    /**
     * Constrói a URL pública do webhook para um bot específico.
     * Usa WEBHOOK_BASE_URL (ex: https://lowan.site) + /webhooks/telegram/:id
     */
    private webhookUrl;
    list(workspaceId: string): Promise<{
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        botUsername: string | null;
        botId: string | null;
        webhookUrl: string | null;
    }[]>;
    create(input: CreateTelegramBotInput, userId: string, workspaceId: string): Promise<{
        webhookUrl: string;
        status: import(".prisma/client").$Enums.ConnectionStatus;
        id: string;
        name: string;
        createdAt: Date;
        botUsername: string | null;
        botId: string | null;
    }>;
    delete(id: string, workspaceId: string): Promise<{
        ok: boolean;
    }>;
    check(id: string, workspaceId: string): Promise<{
        valid: boolean;
        webhookOk: boolean;
        status: string;
        botInfo: import("../../services/telegram/telegram-api.service").TelegramBotInfo | null;
        webhookInfo: import("../../services/telegram/telegram-api.service").TelegramWebhookInfo | null;
    }>;
    /** Retorna o token descriptografado — uso interno (webhook processor) */
    getDecryptedToken(id: string): Promise<string>;
}
//# sourceMappingURL=telegram.service.d.ts.map