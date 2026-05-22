"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapMetaError = mapMetaError;
const axios_1 = require("axios");

const FRIENDLY = {
    1: 'App Secret da Meta está incorreto no servidor — admin precisa atualizar META_APP_SECRET no .env do CRM.',
    190: 'Token Meta inválido — refaça o cadastro.',
    100: 'Dados inválidos enviados à Meta. Tente novamente.',
    200: 'Sem permissão para acessar essa conta. Refaça o cadastro com as permissões necessárias.',
    368: 'Sem permissão para acessar essa conta. Refaça o cadastro com as permissões necessárias.',
    133005: 'PIN do número está incorreto.',
    133006: 'Esse número está registrado em outro provedor. Faça "Migrate Number" no Meta Business Manager primeiro.',
    133010: 'Esse número já está registrado na Cloud API.',
    133016: 'Verificação em duas etapas obrigatória — defina um PIN para o número antes de registrá-lo.',
};

function mapMetaError(err, fallbackCode = 'META_ERROR', fallbackMsg = null) {
    let metaCode;
    let metaMessage;
    let metaSubcode;
    let httpStatus;
    let isTimeout = false;
    if (err && err.isAxiosError) {
        const data = err.response && err.response.data;
        const e = data && data.error;
        if (e) {
            metaCode = e.code;
            metaSubcode = e.error_subcode;
            metaMessage = e.error_user_msg || e.message;
        }
        httpStatus = err.response && err.response.status;
        // Timeout / network error sem response
        if (!err.response && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message || ''))) {
            isTimeout = true;
            metaMessage = `timeout após ${err.config && err.config.timeout || 'default'}ms (${err.code || 'unknown'})`;
        }
        else if (!err.response) {
            metaMessage = `network error: ${err.code || err.message}`;
        }
    }
    else if (err instanceof Error) {
        metaMessage = err.message;
    }
    else {
        metaMessage = String(err);
    }
    if (isTimeout && !fallbackMsg) {
        fallbackMsg = 'Meta demorou pra responder — pode ter dado certo mesmo assim. Tente reativar a conexão na lista (verifica token).';
    }
    const userMessage = (metaCode && FRIENDLY[metaCode])
        || (metaSubcode && FRIENDLY[metaSubcode])
        || fallbackMsg
        || (metaMessage ? `Erro Meta: ${metaMessage}` : 'Erro inesperado ao falar com a Meta.');
    return {
        userMessage,
        metaCode: metaCode || null,
        metaSubcode: metaSubcode || null,
        metaMessage: metaMessage || null,
        httpStatus: httpStatus || null,
        appCode: fallbackCode,
    };
}

// Re-export AxiosError so callers can use instanceof checks via this module.
exports.AxiosError = axios_1.AxiosError;
//# sourceMappingURL=meta-error.mapper.js.map
