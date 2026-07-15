// ==============================
// TrafficAI — Evolution API Client
// Wrapper da Evolution API (https://github.com/EvolutionAPI/evolution-api)
// Cada workspace tem 1 instância nomeada `comm-<integrationId>`.
// ==============================

import axios, { AxiosInstance, AxiosError } from 'axios';

export interface EvolutionInstanceInfo {
    instanceName: string;
    status: 'open' | 'connecting' | 'close' | 'unknown';
    state?: string;
    profileName?: string;
    profilePictureUrl?: string;
    ownerJid?: string;
}

export interface EvolutionQrResponse {
    code: string;            // base64 image data URL
    pairingCode?: string;    // alternativo: código curto pra emparelhar
}

export class EvolutionClient {
    private http: AxiosInstance;
    public readonly baseUrl: string;
    public readonly globalApiKey: string;

    constructor(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.globalApiKey = apiKey;
        this.http = axios.create({
            baseURL: this.baseUrl,
            headers: { apikey: apiKey, 'Content-Type': 'application/json' },
            timeout: 25000,
        });
    }

    /**
     * Cria uma instância nova. Se já existir, lança erro 409.
     * O webhook é configurado direto no create — toda mensagem chega no callback.
     */
    async createInstance(opts: {
        instanceName: string;
        webhookUrl: string;
        webhookEvents?: string[];
    }): Promise<{ qrCode: string | null; instanceName: string }> {
        const events = opts.webhookEvents ?? [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
            'CONTACTS_UPSERT',
            'CHATS_UPSERT',
        ];

        const { data } = await this.http.post('/instance/create', {
            instanceName: opts.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
                url: opts.webhookUrl,
                byEvents: false,    // single endpoint, all events
                base64: true,
                events,
            },
        });
        // Resposta varia entre versões: pode trazer qrcode.base64 ou nada (precisa pollar /instance/connect)
        const qr = data?.qrcode?.base64 || data?.instance?.qrcode || null;
        const instanceName = data?.instance?.instanceName || opts.instanceName;
        return { qrCode: qr, instanceName };
    }

    /** Solicita o QR code (caso o create não tenha trazido OU pra renovar). */
    async getQrCode(instanceName: string): Promise<EvolutionQrResponse | null> {
        try {
            const { data } = await this.http.get(`/instance/connect/${instanceName}`);
            const code = data?.base64 || data?.code || data?.qrcode?.base64;
            const pairingCode = data?.pairingCode || data?.code;
            if (!code && !pairingCode) return null;
            return { code: code ?? '', pairingCode };
        } catch (e: any) {
            if (e.response?.status === 404) return null;
            throw e;
        }
    }

    async getInstanceStatus(instanceName: string): Promise<EvolutionInstanceInfo> {
        const { data } = await this.http.get(`/instance/connectionState/${instanceName}`);
        const state = data?.instance?.state || data?.state || 'unknown';
        return {
            instanceName,
            status: mapState(state),
            state,
        };
    }

    async fetchInstance(instanceName: string): Promise<EvolutionInstanceInfo | null> {
        try {
            const { data } = await this.http.get(`/instance/fetchInstances`, { params: { instanceName } });
            const arr = Array.isArray(data) ? data : [data];
            const inst = arr[0]?.instance || arr[0];
            if (!inst) return null;
            return {
                instanceName: inst.instanceName ?? instanceName,
                status: mapState(inst.state || inst.connectionStatus || 'unknown'),
                state: inst.state,
                profileName: inst.profileName,
                profilePictureUrl: inst.profilePictureUrl,
                ownerJid: inst.ownerJid,
            };
        } catch (e: any) {
            if (e.response?.status === 404) return null;
            throw e;
        }
    }

    /** Desconecta WhatsApp mas mantém instância. */
    async logoutInstance(instanceName: string): Promise<void> {
        await this.http.delete(`/instance/logout/${instanceName}`);
    }

    /** Remove instância completamente. */
    async deleteInstance(instanceName: string): Promise<void> {
        await this.http.delete(`/instance/delete/${instanceName}`);
    }

    /** Envio de mensagem (não usado na v1 do dashboard, mas exposto pra futuro). */
    async sendText(instanceName: string, to: string, text: string): Promise<{ id: string }> {
        const { data } = await this.http.post(`/message/sendText/${instanceName}`, {
            number: normalizeNumber(to),
            text,
        });
        return { id: data?.key?.id ?? '' };
    }

    static formatError(err: unknown): string {
        const e = err as AxiosError;
        if (e.response) {
            return `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 250)}`;
        }
        return (e as Error).message ?? String(err);
    }
}

function mapState(state: string): EvolutionInstanceInfo['status'] {
    const s = String(state).toLowerCase();
    if (s === 'open' || s === 'connected') return 'open';
    if (s === 'connecting' || s === 'qr') return 'connecting';
    if (s === 'close' || s === 'closed' || s === 'disconnected') return 'close';
    return 'unknown';
}

function normalizeNumber(raw: string): string {
    // remove non-digits, garante DDI Brasil (55) se faltar
    let n = raw.replace(/\D/g, '');
    if (n.length === 11 && !n.startsWith('55')) n = '55' + n;
    if (n.length === 10) n = '55' + n;
    return n;
}
