"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyMetaError = classifyMetaError;
exports.isRetryableHttpStatus = isRetryableHttpStatus;
const client_1 = require("@prisma/client");
/**
 * Classifica erros da Meta Cloud API.
 * Referência: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
function classifyMetaError(error) {
    const code = error.code ?? 0;
    const message = error.message ?? 'Unknown error';
    // ── Autenticação ──────────────────────────────────────────────
    if (code === 190 || code === 102 || code === 10) {
        return {
            type: client_1.MessageErrorType.AUTH,
            code: String(code),
            message,
            retryable: false,
            blacklistContact: false,
            pauseConnection: true,
        };
    }
    // ── Rate Limit ────────────────────────────────────────────────
    if (code === 130429 || code === 4 || code === 80007) {
        return {
            type: client_1.MessageErrorType.RATE_LIMIT,
            code: String(code),
            message,
            retryable: true,
            blacklistContact: false,
            pauseConnection: true,
            pauseDurationSeconds: 300, // 5 min
        };
    }
    // ── Template inválido / não aprovado ─────────────────────────
    if (code === 132000 || // Template not found
        code === 132001 || // Template hydration error
        code === 132005 || // Template format mismatch
        code === 132007 || // Template paused
        code === 132008 || // Template disabled
        code === 132012 || // Template required variable missing
        code === 132015 // Template not approved
    ) {
        return {
            type: client_1.MessageErrorType.TEMPLATE,
            code: String(code),
            message,
            retryable: false,
            blacklistContact: false,
            pauseConnection: false,
        };
    }
    // ── Número inválido / não existe no WhatsApp ──────────────────
    if (code === 131026 || // Message undeliverable — invalid number
        code === 131030 || // Recipient phone number not in allowed list (sandbox)
        code === 131047 || // Re-engagement message
        code === 131051 || // Unsupported message type
        code === 131052 || // Media download error
        code === 100 // Invalid parameter (often phone format)
    ) {
        return {
            type: client_1.MessageErrorType.INVALID_NUMBER,
            code: String(code),
            message,
            retryable: false,
            blacklistContact: true, // auto-blacklist
            pauseConnection: false,
        };
    }
    // ── Pagamento / conta bloqueada ───────────────────────────────
    if (code === 131042) {
        return {
            type: client_1.MessageErrorType.PERMANENT,
            code: String(code),
            message: 'Problema de pagamento no WABA — adicione um método de pagamento válido',
            retryable: false,
            blacklistContact: false,
            pauseConnection: true,
            pauseDurationSeconds: 0, // pausa manual até resolver pagamento
        };
    }
    // ── Spam / qualidade ─────────────────────────────────────────
    if (code === 131048) {
        return {
            type: client_1.MessageErrorType.PERMANENT,
            code: String(code),
            message: 'Spam rate limit hit — connection flagged',
            retryable: false,
            blacklistContact: false,
            pauseConnection: true,
            pauseDurationSeconds: 0, // manual recovery
        };
    }
    // ── Temporários (servidor Meta com problemas) ─────────────────
    if (code === 1 || // Unknown error
        code === 2 || // Service temporarily unavailable
        code === 131000 || // Generic error
        code === 131005 || // Cloud API timeout
        code === 131006 || // Resource not found (temporary)
        code === 500 ||
        code === 503) {
        return {
            type: client_1.MessageErrorType.TEMPORARY,
            code: String(code),
            message,
            retryable: true,
            blacklistContact: false,
            pauseConnection: false,
        };
    }
    // ── Permanente (padrão para desconhecidos) ────────────────────
    return {
        type: client_1.MessageErrorType.PERMANENT,
        code: String(code),
        message,
        retryable: false,
        blacklistContact: false,
        pauseConnection: false,
    };
}
function isRetryableHttpStatus(status) {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
//# sourceMappingURL=error.classifier.js.map