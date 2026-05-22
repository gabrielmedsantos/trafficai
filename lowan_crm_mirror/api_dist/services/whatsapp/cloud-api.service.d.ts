import { ClassifiedError } from './error.classifier';
import type { MetaSendTemplatePayload, MetaSubmitTemplatePayload, MetaSubmitTemplateResponse } from '../../types/whatsapp.types';
export interface SendResult {
    success: boolean;
    wamid?: string;
    rawResponse?: unknown;
    error?: ClassifiedError;
}
export declare class CloudApiService {
    private readonly client;
    constructor();
    /**
     * Envia um template message pela Cloud API.
     * @param phoneNumberId  - ID do número (da conexão)
     * @param accessToken    - Token decriptado (nunca logado)
     * @param payload        - Payload montado pelo message.builder
     */
    sendTemplate(phoneNumberId: string, accessToken: string, payload: MetaSendTemplatePayload): Promise<SendResult>;
    /**
     * Envia uma mensagem de texto livre (reply dentro da janela de 24h).
     */
    sendText(phoneNumberId: string, accessToken: string, to: string, text: string): Promise<SendResult>;
    /**
     * Envia um cartão de contato via WhatsApp.
     */
    sendContact(phoneNumberId: string, accessToken: string, to: string, contact: {
        name: string;
        phone: string;
    }): Promise<SendResult>;
    /**
     * Submete um template para aprovação na Meta Cloud API.
     * @param wabaId       - WhatsApp Business Account ID
     * @param accessToken  - Token decriptado
     * @param payload      - Dados do template
     */
    submitTemplate(wabaId: string, accessToken: string, payload: MetaSubmitTemplatePayload): Promise<MetaSubmitTemplateResponse>;
    /**
     * Verifica se o token da conexão está válido consultando o phoneNumberId na Meta.
     * Retorna { valid: true } ou { valid: false, errorCode, errorMessage }
     */
    checkToken(phoneNumberId: string, accessToken: string): Promise<{
        valid: boolean;
        errorCode?: number;
        errorMessage?: string;
        qualityRating?: string;
        accountMode?: string;
        messagingLimit?: string;
        healthStatus?: any;
        banned?: boolean;
        blockReason?: string;
    }>;
    /**
     * Lista todos os templates de um WABA na Meta Graph API.
     */
    listTemplatesFromMeta(wabaId: string, accessToken: string): Promise<Array<{
        id: string;
        name: string;
        status: string;
        category: string;
        language: string;
        components?: Array<{
            type: string;
            text?: string;
        }>;
    }>>;
    /**
     * Busca o status atual de um template na Meta Graph API.
     */
    fetchTemplateStatus(wabaId: string, accessToken: string, templateName: string): Promise<{
        status: string;
        id: string;
    } | null>;
    /**
     * Faz upload de mídia para a Meta Media API e retorna o media_id.
     */
    uploadMedia(phoneNumberId: string, accessToken: string, buffer: Buffer, mimeType: string, filename: string): Promise<string>;
    /**
     * Envia mensagem de áudio usando um media_id já carregado.
     */
    sendAudio(phoneNumberId: string, accessToken: string, to: string, mediaId: string): Promise<SendResult>;
    /**
     * Envia mensagem de imagem usando um media_id já carregado.
     * Suporta legenda opcional (até 1024 chars).
     */
    sendImage(phoneNumberId: string, accessToken: string, to: string, mediaId: string, caption?: string): Promise<SendResult>;
    private handleError;
}
export declare const cloudApiService: CloudApiService;
//# sourceMappingURL=cloud-api.service.d.ts.map