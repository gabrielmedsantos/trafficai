"use strict";
// uazapi.client.js — wrapper das chamadas HTTP pra uazapi.com
// Spec: https://docs.uazapi.com — base URL configurável via env UAZAPI_BASE_URL
//
// Auth:
//   - admintoken (header `admintoken`): criar/listar instâncias, admin endpoints
//   - token (header `token`): operações da instância (send, status, webhook, etc)
//
// Cada instância na uazapi tem id (formato 'rXXXXXXX') + token UUID próprio.
// Persistimos esses em `uazapi_instances` no nosso DB.

Object.defineProperty(exports, "__esModule", { value: true });
exports.UazapiClient = exports.uazapiClient = void 0;

const BASE_URL = (process.env.UAZAPI_BASE_URL || '').replace(/\/$/, '');
const ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || '';
const WEBHOOK_URL = process.env.UAZAPI_WEBHOOK_URL || '';

function _assertConfigured() {
    if (!BASE_URL) throw new Error('UAZAPI_BASE_URL não configurado');
    if (!ADMIN_TOKEN) throw new Error('UAZAPI_ADMIN_TOKEN não configurado');
}

async function _request(path, { method = 'GET', body, token, admin = false, timeoutMs = 15000 } = {}) {
    _assertConfigured();
    const headers = { 'Content-Type': 'application/json' };
    if (admin) headers['admintoken'] = ADMIN_TOKEN;
    if (token) headers['token'] = token;
    const url = `${BASE_URL}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: ctrl.signal,
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { rawText: text }; }
        if (!res.ok) {
            const err = new Error(data?.error || data?.message || data?.response || `uazapi HTTP ${res.status}`);
            err.statusCode = res.status;
            err.body = data;
            throw err;
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

class UazapiClient {
    // ─── Admin: criar instância ─────────────────────────────────────────────
    async createInstance({ name, adminField01, adminField02 }) {
        return _request('/instance/create', {
            method: 'POST',
            admin: true,
            body: {
                name,
                ...(adminField01 ? { adminField01 } : {}),
                ...(adminField02 ? { adminField02 } : {}),
            },
        });
    }

    // ─── Conectar (gera QR ou pairing code) ─────────────────────────────────
    // Sem `phone` → QR code. Com `phone` → pairing code (8 dígitos).
    async connect(token, { phone, browser, systemName } = {}) {
        return _request('/instance/connect', {
            method: 'POST',
            token,
            body: {
                ...(phone ? { phone } : {}),
                ...(browser ? { browser } : {}),
                ...(systemName ? { systemName } : {}),
            },
        });
    }

    // ─── Status da instância ────────────────────────────────────────────────
    async getStatus(token) {
        return _request('/instance/status', { token });
    }

    // ─── Desconectar instância (mantém auth pra reconectar) ─────────────────
    async disconnect(token) {
        return _request('/instance/disconnect', { method: 'POST', token });
    }

    // ─── Reset (logout, apaga auth — exige novo QR) ─────────────────────────
    async reset(token) {
        return _request('/instance/reset', { method: 'POST', token });
    }

    // ─── Enviar texto ───────────────────────────────────────────────────────
    // opts: { delay, replyid, readchat, readmessages, mentions, linkPreview, ... }
    async sendText(token, { number, text, ...opts }) {
        return _request('/send/text', {
            method: 'POST',
            token,
            body: { number, text, ...opts },
        });
    }

    // ─── Enviar mídia ───────────────────────────────────────────────────────
    // type: image | video | audio | ptt | document | sticker | ptv | videoplay | myaudio
    // file: URL pública OU base64 data URL
    async sendMedia(token, { number, type, file, text, docName, mimetype, ...opts }) {
        return _request('/send/media', {
            method: 'POST',
            token,
            body: {
                number, type, file,
                ...(text ? { text } : {}),
                ...(docName ? { docName } : {}),
                ...(mimetype ? { mimetype } : {}),
                ...opts,
            },
            timeoutMs: 60000, // mídia pode demorar
        });
    }

    // ─── Marcar mensagens como lidas (read receipt) ─────────────────────────
    // id: messageId (formato 3EBxxx) ou chatid
    async markRead(token, { id }) {
        return _request('/message/markread', { method: 'POST', token, body: { id } });
    }

    // ─── Verificar se número(s) tem WhatsApp ────────────────────────────────
    async checkNumbers(token, { numbers }) {
        return _request('/chat/check', { method: 'POST', token, body: { numbers } });
    }

    // ─── Configurar webhook da instância ────────────────────────────────────
    // events: ['connection','messages','messages_update','presence',...]
    // excludeMessages: ['fromMeYes', 'isGroupYes', ...]
    async setWebhook(token, { url = WEBHOOK_URL, events, excludeMessages, enabled = true, action = 'add', id } = {}) {
        return _request('/webhook', {
            method: 'POST',
            token,
            body: {
                action,
                ...(id ? { id } : {}),
                enabled,
                url,
                ...(events ? { events } : { events: ['connection', 'messages', 'messages_update'] }),
                ...(excludeMessages ? { excludeMessages } : { excludeMessages: ['isGroupYes'] }),
            },
        });
    }

    async getWebhooks(token) {
        return _request('/webhook', { token });
    }

    // ─── Atualiza imagem de perfil ──────────────────────────────────────────
    async setProfileImage(token, { image }) {
        return _request('/profile/image', { method: 'POST', token, body: { image } });
    }

    // ─── Listar todas instâncias (admin) ────────────────────────────────────
    async listAllInstances() {
        return _request('/instance/all', { admin: true });
    }
}

exports.UazapiClient = UazapiClient;
exports.uazapiClient = new UazapiClient();
exports.UAZAPI_WEBHOOK_URL = WEBHOOK_URL;
