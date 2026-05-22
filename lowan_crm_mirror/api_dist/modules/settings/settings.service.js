"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = exports.PROXY_REDIS_KEY = void 0;
const axios_1 = __importDefault(require("axios"));
const https_proxy_agent_1 = require("https-proxy-agent");
const redis_1 = require("../../config/redis");
exports.PROXY_REDIS_KEY = 'system:config:proxy';
class SettingsService {
    async getProxyUrl() {
        return redis_1.redis.get(exports.PROXY_REDIS_KEY);
    }
    async setProxyUrl(url) {
        if (url && url.trim()) {
            await redis_1.redis.set(exports.PROXY_REDIS_KEY, url.trim());
        }
        else {
            await redis_1.redis.del(exports.PROXY_REDIS_KEY);
        }
    }
    async testProxy(proxyUrl) {
        const agent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
        const IP_API = 'https://api.ipify.org?format=json';
        const start = Date.now();
        try {
            // Run both requests in parallel: proxy IP + server's real IP
            const [proxyRes, realRes] = await Promise.allSettled([
                axios_1.default.get(IP_API, {
                    httpsAgent: agent,
                    proxy: false,
                    timeout: 8000,
                }),
                axios_1.default.get(IP_API, { timeout: 5000 }),
            ]);
            const proxyIp = proxyRes.status === 'fulfilled' ? proxyRes.value.data.ip : undefined;
            const serverIp = realRes.status === 'fulfilled' ? realRes.value.data.ip : undefined;
            if (!proxyIp) {
                return {
                    ok: false,
                    latencyMs: Date.now() - start,
                    serverIp,
                    error: proxyRes.status === 'rejected'
                        ? (proxyRes.reason?.message ?? 'Proxy inacessível')
                        : 'Sem resposta do proxy',
                };
            }
            return {
                ok: true,
                latencyMs: Date.now() - start,
                proxyIp,
                serverIp,
            };
        }
        catch (err) {
            return {
                ok: false,
                latencyMs: Date.now() - start,
                error: err?.message ?? 'Falha na conexão',
            };
        }
    }
}
exports.SettingsService = SettingsService;
//# sourceMappingURL=settings.service.js.map