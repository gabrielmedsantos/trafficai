export declare const PROXY_REDIS_KEY = "system:config:proxy";
export interface ProxyTestResult {
    ok: boolean;
    latencyMs?: number;
    proxyIp?: string;
    serverIp?: string;
    error?: string;
}
export declare class SettingsService {
    getProxyUrl(): Promise<string | null>;
    setProxyUrl(url: string | null): Promise<void>;
    testProxy(proxyUrl: string): Promise<ProxyTestResult>;
}
//# sourceMappingURL=settings.service.d.ts.map