import type { MetaWebhookPayload } from '../../types/whatsapp.types';
export declare class WebhooksService {
    /**
     * Verifica o hub_challenge da Meta (GET /webhooks/meta)
     */
    verifyChallenge(mode: string, token: string, challenge: string, phoneNumberId?: string): string | null;
    /**
     * Verifica o token de uma conexão específica pelo phoneNumberId
     */
    verifyConnectionToken(phoneNumberId: string, token: string): Promise<boolean>;
    /**
     * Resolve o App Secret de uma conexão pelo phoneNumberId.
     * Retorna o secret da conexão (decriptado) ou o fallback do .env.
     */
    resolveAppSecret(phoneNumberId: string | undefined): Promise<string | null>;
    /**
     * Valida a assinatura X-Hub-Signature-256 do payload com um secret específico.
     */
    validateSignature(rawBody: string, signature: string, secret: string | null): boolean;
    /**
     * Processa o payload recebido da Meta:
     * 1. Persiste o evento bruto
     * 2. Enfileira para processamento assíncrono
     * 3. Retorna 200 imediatamente
     */
    receiveEvent(payload: MetaWebhookPayload, rawBody: string): Promise<void>;
}
//# sourceMappingURL=webhooks.service.d.ts.map