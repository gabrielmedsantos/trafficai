"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramUserClient = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");

const BASE = process.env.TELEGRAM_USER_URL || 'http://telegram-user:3003';
const TIMEOUT_MS = 30000;  // verifyAuth pode demorar — Telegram pode dormir 5-10s

// JWT HS256 manual (api usa @fastify/jwt, container usa jsonwebtoken — assinamos cru pra evitar dep extra)
function b64url(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signServiceToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = { service: 'telegram-user-api', iat: now, exp: now + 60 };
    const data = b64url(header) + '.' + b64url(payload);
    const sig = crypto_1.default.createHmac('sha256', env_1.env.JWT_SECRET).update(data).digest('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return data + '.' + sig;
}

async function callContainer(method, path, body) {
    const url = `${BASE}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${signServiceToken()}`,
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        if (!res.ok) {
            const err = new Error(data.message || data.error || `container ${res.status}`);
            err.statusCode = res.status;
            err.code = data.error || 'CONTAINER_ERROR';
            throw err;
        }
        return data;
    }
    catch (err) {
        if (err.name === 'AbortError') {
            const e = new Error(`Container timeout após ${TIMEOUT_MS}ms`);
            e.statusCode = 504;
            e.code = 'CONTAINER_TIMEOUT';
            throw e;
        }
        if (err.statusCode) throw err;
        // Connection refused, DNS, etc
        const e = new Error(`Telegram MTProto container indisponível: ${err.message}`);
        e.statusCode = 502;
        e.code = 'TELEGRAM_USER_UNAVAILABLE';
        throw e;
    }
    finally { clearTimeout(timer); }
}

class TelegramUserClient {
    startAuth(phone) { return callContainer('POST', '/sessions/start', { phone }); }
    verifyAuth({ phone, phoneCodeHash, code, password }) {
        return callContainer('POST', '/sessions/verify', { phone, phoneCodeHash, code, password });
    }
    loadSession(connectionId, sessionString, opts = {}) {
        return callContainer('POST', `/sessions/${connectionId}/load`, { sessionString, workspaceId: opts.workspaceId });
    }
    sendText(connectionId, peerId, text) {
        return callContainer('POST', `/sessions/${connectionId}/send-text`, { peerId, text });
    }
    logout(connectionId) {
        return callContainer('POST', `/sessions/${connectionId}/logout`);
    }
    health(connectionId) {
        return callContainer('GET', `/sessions/${connectionId}/health`);
    }
}
exports.TelegramUserClient = TelegramUserClient;
