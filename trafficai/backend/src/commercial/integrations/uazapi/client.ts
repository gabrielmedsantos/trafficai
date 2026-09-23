// ==============================
// TrafficAI — Uazapi (uazapiGO) API Client
// WhatsApp Web alternativo à Evolution — oferecido como opção extra (paga)
// pra clientes cujos contatos já migraram muito pro @lid do WhatsApp, que a
// Evolution não resolve pra telefone. Formato confirmado contra conta real
// (aalfamaxdigitall.uazapi.com) e cruzado com o adapter de referência do
// RastrackDash (apps/api/src/integrations/uazapi/uazapi.adapter.ts).
//
// Diferença chave vs Evolution: não tem instanceName na URL — a própria
// instância é identificada pelo header `token` (retornado no /instance/init).
// Só a criação usa `admintoken` (nível conta); todo o resto usa `token`
// (nível instância).
// ==============================

import axios, { AxiosInstance, AxiosError } from 'axios';

export interface UazapiInstanceInfo {
    instanceId: string;
    token: string;
    status: 'open' | 'connecting' | 'close' | 'unknown';
    rawStatus?: string;
    qrCode: string | null;
    profileName?: string;
    ownerJid?: string;
}

export interface UazapiLabel {
    id: string;
    name: string;
    colorHex?: string | null;
}

export class UazapiClient {
    private http: AxiosInstance;
    public readonly baseUrl: string;
    public readonly adminToken: string;

    constructor(baseUrl: string, adminToken: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.adminToken = adminToken;
        this.http = axios.create({ baseURL: this.baseUrl, timeout: 25000 });
    }

    /** Cria uma instância nova. Retorna o token DA INSTÂNCIA — usar em todas as chamadas seguintes. */
    async createInstance(name: string): Promise<{ instanceId: string; token: string }> {
        const { data } = await this.http.post('/instance/init',
            { name },
            { headers: { admintoken: this.adminToken, 'Content-Type': 'application/json' } }
        );
        const instanceId = data?.instance?.id || data?.name;
        const token = data?.instance?.token || data?.token;
        if (!token) throw new Error('Uazapi não retornou token da instância');
        return { instanceId, token };
    }

    /** Inicia a conexão e devolve o QR code (base64 data: URI, já pronto pra <img>). */
    async connect(instanceToken: string): Promise<UazapiInstanceInfo> {
        const { data } = await this.http.post('/instance/connect', {}, {
            headers: { token: instanceToken, 'Content-Type': 'application/json' },
        });
        return this.toInstanceInfo(data);
    }

    async getStatus(instanceToken: string): Promise<UazapiInstanceInfo> {
        const { data } = await this.http.get('/instance/status', {
            headers: { token: instanceToken },
        });
        return this.toInstanceInfo(data);
    }

    /** Configura o webhook único da instância — mesmo padrão usado pela Evolution (byEvents=false). */
    async configureWebhook(instanceToken: string, webhookUrl: string): Promise<void> {
        await this.http.post('/webhook', {
            enabled: true,
            url: webhookUrl,
            events: ['messages', 'messages_update', 'labels', 'chat_labels', 'connection'],
            excludeMessages: ['wasSentByApi'],
            addUrlEvents: false,
            addUrlTypesMessages: false,
        }, { headers: { token: instanceToken, 'Content-Type': 'application/json' } });
    }

    async listLabels(instanceToken: string): Promise<UazapiLabel[]> {
        const { data } = await this.http.get('/labels', { headers: { token: instanceToken } });
        const arr = Array.isArray(data) ? data : [];
        return arr
            .map((l: any) => ({ id: String(l.id ?? l.labelid ?? ''), name: String(l.name ?? ''), colorHex: l.colorHex ?? null }))
            .filter((l: UazapiLabel) => l.id && l.name);
    }

    /** Lista os grupos que essa instância participa — usado pro seletor de grupo do cliente. */
    async listGroups(instanceToken: string): Promise<{ id: string; name: string; size: number }[]> {
        const { data } = await this.http.get('/group/list', {
            headers: { token: instanceToken },
            params: { noparticipants: 'true' },
        });
        const arr = Array.isArray(data?.groups) ? data.groups : [];
        return arr
            .map((g: any) => ({ id: String(g.JID ?? ''), name: String(g.Name ?? g.JID ?? ''), size: Number(g.ParticipantCount ?? 0) }))
            .filter((g: { id: string }) => g.id);
    }

    async deleteInstance(instanceToken: string): Promise<void> {
        await this.http.delete('/instance', { headers: { token: instanceToken } });
    }

    static formatError(err: unknown): string {
        const e = err as AxiosError;
        if (e.response) {
            return `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 250)}`;
        }
        return (e as Error).message ?? String(err);
    }

    private toInstanceInfo(data: any): UazapiInstanceInfo {
        const instance = data?.instance || {};
        const rawStatus: string = instance.status || data?.status?.status || 'unknown';
        const connected = data?.status?.connected === true || data?.connected === true || rawStatus === 'connected';
        return {
            instanceId: instance.id || '',
            token: instance.token || '',
            status: connected ? 'open' : mapStatus(rawStatus),
            rawStatus,
            qrCode: instance.qrcode || instance.qrCode || null,
            profileName: instance.profileName || undefined,
            ownerJid: instance.owner || data?.status?.jid?.id || undefined,
        };
    }
}

function mapStatus(raw: string): UazapiInstanceInfo['status'] {
    const s = String(raw).toLowerCase();
    if (s === 'connected' || s === 'open') return 'open';
    if (s === 'connecting') return 'connecting';
    if (s === 'disconnected' || s === 'close' || s === 'closed') return 'close';
    return 'unknown';
}
