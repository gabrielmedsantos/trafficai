"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudApiService = exports.CloudApiService = void 0;
const axios_1 = __importStar(require("axios"));
const axios_retry_1 = __importDefault(require("axios-retry"));
const https_proxy_agent_1 = require("https-proxy-agent");
const env_1 = require("../../config/env");
const logger_1 = require("../../config/logger");
const redis_1 = require("../../config/redis");
const error_classifier_1 = require("./error.classifier");
const PROXY_REDIS_KEY = 'system:config:proxy';
const PROXY_CACHE_TTL_MS = 60_000;
let _cachedProxy = undefined;
let _cacheExpiry = 0;
async function resolveProxyUrl(override) {
    // Override per-connection tem prioridade — permite cada WABA sair por proxy próprio.
    if (override && typeof override === 'string' && override.trim()) {
        return override.trim();
    }
    const now = Date.now();
    if (_cachedProxy !== undefined && now < _cacheExpiry) {
        return _cachedProxy;
    }
    const redisProxy = await redis_1.redis.get(PROXY_REDIS_KEY).catch(() => null);
    const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || null;
    _cachedProxy = redisProxy || envProxy || null;
    _cacheExpiry = now + PROXY_CACHE_TTL_MS;
    return _cachedProxy;
}
class CloudApiService {
    client;
    constructor() {
        this.client = axios_1.default.create({
            baseURL: env_1.env.META_API_BASE_URL,
            timeout: env_1.env.META_REQUEST_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json' },
        });
        // Retries managed by BullMQ, not here
        (0, axios_retry_1.default)(this.client, {
            retries: 0,
            retryCondition: () => false,
        });
    }
    /**
     * Envia um template message pela Cloud API.
     * @param phoneNumberId  - ID do número (da conexão)
     * @param accessToken    - Token decriptado (nunca logado)
     * @param payload        - Payload montado pelo message.builder
     */
    async sendTemplate(phoneNumberId, accessToken, payload, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        if (proxyUrl) {
            logger_1.logger.debug({ proxy: proxyUrl.replace(/:\/\/.*@/, '://***@') }, 'Meta API request via proxy');
        }
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to: payload.to, wamid, template: payload.template.name }, 'Message sent successfully');
            return {
                success: true,
                wamid,
                rawResponse: response.data,
            };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, payload.to);
        }
    }
    /**
     * Envia uma mensagem de texto livre (reply dentro da janela de 24h).
     */
    async sendText(phoneNumberId, accessToken, to, text, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { body: text },
        };
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to, wamid }, 'Text message sent successfully');
            return { success: true, wamid, rawResponse: response.data };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, to);
        }
    }
    /**
     * Marca mensagem como lida com indicador de digitação.
     * Mostra "digitando..." por até 25s no WhatsApp do lead. Auto-dismiss
     * quando enviamos a próxima mensagem.
     * @param phoneNumberId  - ID do número da conexão
     * @param accessToken    - Token decriptado
     * @param wamid          - ID da última mensagem inbound do lead
     */
    async sendTypingIndicator(phoneNumberId, accessToken, wamid, proxyOverride) {
        if (!wamid) return { success: false, error: 'no_wamid' };
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const payload = {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: wamid,
            typing_indicator: { type: 'text' },
        };
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            return { success: true };
        }
        catch (err) {
            // Não loga erro pra não poluir — é best-effort
            return { success: false, error: err?.response?.data?.error?.message || err?.message };
        }
    }
    /**
     * Envia um cartão de contato via WhatsApp.
     */
    async sendContact(phoneNumberId, accessToken, to, contact, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'contacts',
            contacts: [
                {
                    name: { formatted_name: contact.name, first_name: contact.name },
                    phones: [{
                            phone: contact.phone,
                            type: 'CELL',
                            // wa_id tells WhatsApp this number is on WhatsApp (prevents "Invite to WhatsApp")
                            wa_id: contact.phone.replace(/\D/g, ''),
                        }],
                },
            ],
        };
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to, wamid }, 'Contact message sent successfully');
            return { success: true, wamid, rawResponse: response.data };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, to);
        }
    }
    /**
     * Submete um template para aprovação na Meta Cloud API.
     * @param wabaId       - WhatsApp Business Account ID
     * @param accessToken  - Token decriptado
     * @param payload      - Dados do template
     */
    async submitTemplate(wabaId, accessToken, payload, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${wabaId}/message_templates`;
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        logger_1.logger.info({ wabaId, name: payload.name, usingProxy: !!proxyUrl, proxy: proxyUrl ? proxyUrl.replace(/:\/\/.*@/, '://***@') : null }, 'Submitting template to Meta');
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            logger_1.logger.info({ wabaId, name: payload.name, id: response.data.id }, 'Template submitted to Meta');
            return response.data;
        }
        catch (err) {
            if (err instanceof axios_1.AxiosError) {
                const metaError = err.response?.data?.error;
                const metaMsg = metaError?.error_user_msg || metaError?.message || err.message;
                logger_1.logger.warn({ wabaId, name: payload.name, status: err.response?.status, error: err.response?.data }, 'Failed to submit template to Meta');
                throw new Error(`Meta: ${metaMsg}`);
            }
            logger_1.logger.error({ wabaId, name: payload.name, err }, 'Network error submitting template');
            throw err;
        }
    }
    /**
     * Verifica se o token da conexão está válido consultando o phoneNumberId na Meta.
     * Retorna { valid: true } ou { valid: false, errorCode, errorMessage }
     */
    async checkToken(phoneNumberId, accessToken, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}`;
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { fields: 'quality_rating,account_mode,display_phone_number,code_verification_status,messaging_limit_tier,platform_type,health_status' },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const data = response.data ?? {};
            const qualityRating = data.quality_rating ?? 'UNKNOWN';
            const accountMode = data.account_mode ?? 'UNKNOWN';
            const messagingLimit = data.messaging_limit_tier ?? 'UNKNOWN';
            const healthStatus = data.health_status ?? null;
            // Detectar causa raiz via entities do health_status
            const wabaEntity = healthStatus?.entities?.find((e) => e.entity_type === 'WABA');
            const wabaErrorCodes = wabaEntity?.errors?.map((e) => e.error_code) ?? [];
            // 141014 = WABA banida; 141006 = problema de pagamento
            // Sanity: só considera banida se a WABA está com can_send_message != AVAILABLE.
            // Sem isso, instabilidade momentânea da Meta API pode falsa-positivar conexões
            // saudáveis (visto em prod: 3 WABAs flagadas como banidas com can_send=AVAILABLE).
            const wabaCanSend = wabaEntity?.can_send_message;
            const wabaHas141014 = wabaErrorCodes.includes(141014);
            const wabaHas141006 = wabaErrorCodes.includes(141006);
            const isBanned = wabaHas141014 && wabaCanSend !== 'AVAILABLE';
            const hasPaymentIssue = wabaHas141006 && wabaCanSend !== 'AVAILABLE';
            // Debug log — se a Meta retornou 141014/141006 mas o sanity bloqueou, registra
            // pra ver inconsistências. Se confirmou banido, registra com healthStatus inteiro.
            if (wabaHas141014 || wabaHas141006 || isBanned) {
                try {
                    const { logger } = require('../../config/logger');
                    logger.warn({
                        phoneNumberId,
                        wabaCanSend,
                        wabaErrorCodes,
                        isBanned,
                        hasPaymentIssue,
                        healthStatus,
                    }, 'checkToken: WABA error codes detected');
                } catch {}
            }
            // Detectar restrição via can_send_message em qualquer entidade
            const entities = healthStatus?.entities ?? [];
            const isRestricted = !isBanned && !hasPaymentIssue && entities.some((e) => e.can_send_message === 'BLOCKED');
            let blockReason;
            if (isBanned)
                blockReason = 'WABA_BANNED';
            else if (hasPaymentIssue)
                blockReason = 'PAYMENT_ISSUE';
            else if (isRestricted)
                blockReason = 'RESTRICTED';
            const banned = isBanned;
            return { valid: true, qualityRating, accountMode, messagingLimit, healthStatus, banned, blockReason };
        }
        catch (err) {
            if (err instanceof axios_1.AxiosError) {
                const code = err.response?.data?.error?.code;
                const message = err.response?.data?.error?.message ?? err.message;
                // Código 131031 = número banido/restrito pela Meta
                const banned = code === 131031 || code === 368;
                return { valid: false, errorCode: code, errorMessage: message, banned };
            }
            return { valid: false, errorMessage: String(err) };
        }
    }
    /**
     * Lista todos os templates de um WABA na Meta Graph API.
     */
    async listTemplatesFromMeta(wabaId, accessToken, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${wabaId}/message_templates`;
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { fields: 'id,name,status,category,language,components', limit: 200, access_token: accessToken },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            return response.data?.data ?? [];
        }
        catch (err) {
            if (err instanceof axios_1.AxiosError) {
                logger_1.logger.warn({ wabaId, error: err.response?.data }, 'Failed to list templates from Meta');
            }
            return [];
        }
    }
    /**
     * Busca o status atual de um template na Meta Graph API.
     */
    async fetchTemplateStatus(wabaId, accessToken, templateName, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${wabaId}/message_templates`;
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { name: templateName, fields: 'id,name,status' },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const templates = response.data?.data ?? [];
            if (templates.length === 0)
                return null;
            return { status: templates[0].status, id: templates[0].id };
        }
        catch (err) {
            if (err instanceof axios_1.AxiosError) {
                logger_1.logger.warn({ wabaId, templateName, error: err.response?.data }, 'Failed to fetch template status from Meta');
            }
            return null;
        }
    }
    /**
     * Faz upload de mídia para a Meta Media API e retorna o media_id.
     */
    async uploadMedia(phoneNumberId, accessToken, buffer, mimeType, filename, proxyOverride) {
        const uploadUrl = `${env_1.env.META_API_BASE_URL}/${env_1.env.META_API_VERSION}/${phoneNumberId}/media`;
        // Usa fetch nativo (Node 20+) + FormData nativo para garantir
        // multipart/form-data compatível com a Meta Graph API
        const form = new globalThis.FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('type', mimeType);
        form.append('file', new Blob([buffer], { type: mimeType }), filename);
        logger_1.logger.debug({ uploadUrl, mimeType, filename, bytes: buffer.length }, 'uploadMedia: sending to Meta');
        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
        });
        const data = await res.json();
        logger_1.logger.info({ status: res.status, mediaId: data.id, error: data.error }, 'uploadMedia: Meta response');
        if (!res.ok || !data.id) {
            const msg = data.error?.message ?? `HTTP ${res.status}`;
            throw new Error(`Meta upload error: ${msg}`);
        }
        return data.id;
    }
    /**
     * Envia mensagem de áudio usando um media_id já carregado.
     */
    async sendAudio(phoneNumberId, accessToken, to, mediaId, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const isUrl = mediaId.startsWith('http');
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'audio',
            audio: isUrl ? { link: mediaId } : { id: mediaId, voice: true },
        };
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to, wamid }, 'Audio message sent successfully');
            return { success: true, wamid, rawResponse: response.data };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, to);
        }
    }
    /**
     * Envia mensagem de imagem usando um media_id já carregado.
     * Suporta legenda opcional (até 1024 chars).
     */
    async sendImage(phoneNumberId, accessToken, to, mediaId, caption, proxyOverride) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'image',
            image: {
                id: mediaId,
                ...(caption?.trim() && { caption: caption.trim().slice(0, 1024) }),
            },
        };
        const proxyUrl = await resolveProxyUrl(proxyOverride);
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to, wamid }, 'Image message sent successfully');
            return { success: true, wamid, rawResponse: response.data };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, to);
        }
    }
    /**
     * Envia vídeo via media_id (já uploadado) ou link público.
     * Suporta caption (até 1024 chars).
     */
    async sendVideo(phoneNumberId, accessToken, to, mediaIdOrLink, caption) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const isUrl = String(mediaIdOrLink || '').startsWith('http');
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'video',
            video: {
                ...(isUrl ? { link: mediaIdOrLink } : { id: mediaIdOrLink }),
                ...(caption?.trim() && { caption: caption.trim().slice(0, 1024) }),
            },
        };
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to, wamid }, 'Video message sent successfully');
            return { success: true, wamid, rawResponse: response.data };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, to);
        }
    }
    /**
     * Envia documento (PDF, DOC, XLS, etc) via media_id ou link público.
     * filename obrigatório (Meta usa pra mostrar no cliente).
     */
    async sendDocument(phoneNumberId, accessToken, to, mediaIdOrLink, filename, caption) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const isUrl = String(mediaIdOrLink || '').startsWith('http');
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'document',
            document: {
                ...(isUrl ? { link: mediaIdOrLink } : { id: mediaIdOrLink }),
                ...(filename && { filename }),
                ...(caption?.trim() && { caption: caption.trim().slice(0, 1024) }),
            },
        };
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to, wamid, filename }, 'Document message sent successfully');
            return { success: true, wamid, rawResponse: response.data };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, to);
        }
    }
    /**
     * Envia localização via lat/lon. Suporta nome e endereço (mostrados no card).
     */
    async sendLocation(phoneNumberId, accessToken, to, latitude, longitude, name, address) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'location',
            location: {
                latitude: Number(latitude),
                longitude: Number(longitude),
                ...(name && { name: String(name).slice(0, 1000) }),
                ...(address && { address: String(address).slice(0, 1000) }),
            },
        };
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to, wamid }, 'Location message sent successfully');
            return { success: true, wamid, rawResponse: response.data };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, to);
        }
    }
    /**
     * Envia sticker (.webp) via media_id ou link público.
     */
    async sendSticker(phoneNumberId, accessToken, to, mediaIdOrLink) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/messages`;
        const isUrl = String(mediaIdOrLink || '').startsWith('http');
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'sticker',
            sticker: isUrl ? { link: mediaIdOrLink } : { id: mediaIdOrLink },
        };
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        try {
            const response = await this.client.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(httpsAgent && { httpsAgent, proxy: false }),
            });
            const wamid = response.data?.messages?.[0]?.id;
            logger_1.logger.debug({ phoneNumberId, to, wamid }, 'Sticker message sent successfully');
            return { success: true, wamid, rawResponse: response.data };
        }
        catch (err) {
            return this.handleError(err, phoneNumberId, to);
        }
    }
    handleError(err, phoneNumberId, to) {
        if (err instanceof axios_1.AxiosError) {
            const status = err.response?.status ?? 0;
            const errorData = err.response?.data?.error ?? {};
            const classified = (0, error_classifier_1.classifyMetaError)({
                code: errorData.code,
                message: errorData.message ?? err.message,
                type: errorData.type,
                error_data: errorData.error_data,
            });
            logger_1.logger.warn({
                phoneNumberId,
                to,
                status,
                errorCode: classified.code,
                errorType: classified.type,
                errorMessage: classified.message,
            }, 'Meta API error');
            return {
                success: false,
                rawResponse: err.response?.data,
                error: classified,
            };
        }
        // Network / timeout error
        const classified = (0, error_classifier_1.classifyMetaError)({ code: 2, message: String(err) });
        logger_1.logger.error({ phoneNumberId, to, err }, 'Network error sending message');
        return { success: false, error: classified };
    }
    /**
     * Embedded Signup: troca o `code` (válido 30s) por um business access token de 60 dias.
     * Lança AxiosError em caso de falha — caller deve mapear via meta-error.mapper.
     */
    async exchangeCodeForToken(code) {
        const url = `/${env_1.env.META_API_VERSION}/oauth/access_token`;
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        const response = await this.client.get(url, {
            params: {
                client_id: env_1.env.META_APP_ID,
                client_secret: env_1.env.META_APP_SECRET,
                code,
            },
            ...(httpsAgent && { httpsAgent, proxy: false }),
        });
        const token = response.data && response.data.access_token;
        if (!token || typeof token !== 'string') {
            throw new Error('Meta did not return an access_token');
        }
        return token;
    }
    /**
     * Embedded Signup: inscreve este app nos webhooks da WABA do cliente.
     */
    async subscribeAppToWaba(wabaId, businessToken) {
        const url = `/${env_1.env.META_API_VERSION}/${wabaId}/subscribed_apps`;
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        const response = await this.client.post(url, undefined, {
            headers: { Authorization: `Bearer ${businessToken}` },
            ...(httpsAgent && { httpsAgent, proxy: false }),
        });
        if (!response.data || response.data.success !== true) {
            throw new Error(`subscribed_apps unexpected response: ${JSON.stringify(response.data)}`);
        }
    }
    /**
     * Embedded Signup: registra o número na Cloud API com PIN 2FA.
     * Falha comum: 133006 (número já em outro provider — precisa Migrate Number).
     */
    async registerPhoneNumber(phoneNumberId, businessToken, pin) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}/register`;
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        // Register pode demorar (Meta processa internamente) — timeout maior que o default de 10s.
        const response = await this.client.post(url, { messaging_product: 'whatsapp', pin }, {
            headers: { Authorization: `Bearer ${businessToken}` },
            timeout: 45000,
            ...(httpsAgent && { httpsAgent, proxy: false }),
        });
        if (!response.data || response.data.success !== true) {
            throw new Error(`register unexpected response: ${JSON.stringify(response.data)}`);
        }
    }
    /**
     * Embedded Signup preview: busca metadados do número (verified_name, display_phone_number, status).
     */
    async getPhoneNumberInfo(phoneNumberId, businessToken) {
        const url = `/${env_1.env.META_API_VERSION}/${phoneNumberId}`;
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        const response = await this.client.get(url, {
            headers: { Authorization: `Bearer ${businessToken}` },
            params: { fields: 'verified_name,display_phone_number,code_verification_status,quality_rating,messaging_limit_tier,name_status,platform_type,account_mode' },
            ...(httpsAgent && { httpsAgent, proxy: false }),
        });
        return response.data || {};
    }
    /**
     * Embedded Signup preview: busca metadados da WABA (name, timezone, currency).
     */
    async getWabaInfo(wabaId, businessToken) {
        const url = `/${env_1.env.META_API_VERSION}/${wabaId}`;
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        // owner_business_info / ownership_type / primary_funding_id são restritos a Solution Partner.
        // Como Tech Provider, só pegamos fields básicos da WABA.
        const response = await this.client.get(url, {
            headers: { Authorization: `Bearer ${businessToken}` },
            params: { fields: 'id,name,timezone_id,currency,account_review_status,business_verification_status' },
            ...(httpsAgent && { httpsAgent, proxy: false }),
        });
        return response.data || {};
    }
    /**
     * Busca info do Business Portfolio (BM) por ID. Tech Provider tem acesso aos basics.
     */
    async getBusinessInfo(businessId, businessToken) {
        const url = `/${env_1.env.META_API_VERSION}/${businessId}`;
        const proxyUrl = await resolveProxyUrl();
        const httpsAgent = proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined;
        // Apenas fields públicos — verification_status/primary_page exigem business_management permission.
        const response = await this.client.get(url, {
            headers: { Authorization: `Bearer ${businessToken}` },
            params: { fields: 'id,name' },
            ...(httpsAgent && { httpsAgent, proxy: false }),
        });
        return response.data || {};
    }
}
exports.CloudApiService = CloudApiService;
exports.cloudApiService = new CloudApiService();
//# sourceMappingURL=cloud-api.service.js.map