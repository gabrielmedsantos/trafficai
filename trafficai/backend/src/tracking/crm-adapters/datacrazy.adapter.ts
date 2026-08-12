// ==============================
// TrafficAI — DataCrazy CRM Adapter
// API v1: https://docs.datacrazy.io/
// Auth: Bearer <api_token> (Settings → API)
// Base: https://api.g1.datacrazy.io/api/v1
// ==============================

import axios, { AxiosInstance } from 'axios';

export interface DataCrazyPipeline {
    id: string;
    name: string;
    stages?: Array<{ id: string; name: string }>;
}

export interface WonStatus {
    stage_id: string;
    stage_name: string;
}

export interface DataCrazyAccount {
    id: string;
    name: string;
}

export interface ExtractedUserData {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    external_id: string;
}

/**
 * DataCrazy retorna leads com estrutura diferente do Kommo.
 * Os campos de contato (email, phone, name) vêm diretamente no objeto lead.
 */
export interface DataCrazyLead {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    stageId?: string;
    stageName?: string;
    createdAt?: string;
    updatedAt?: string;
    address?: {
        zip?: string;
        street?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        country?: string;
        building?: string;
    };
    contacts?: Array<{
        type: string; // 'EMAIL', 'WHATSAPP', etc
        value: string;
        status?: string;
    }>;
    tags?: Array<{ id: string; name: string }>;
}

export class DataCrazyAdapter {
    private client: AxiosInstance;
    private apiKey: string;

    constructor(apiKey: string) {
        if (!apiKey || !apiKey.trim()) {
            throw new Error('DataCrazy API key é obrigatório.');
        }
        this.apiKey = apiKey.trim();
        this.client = axios.create({
            baseURL: 'https://api.g1.datacrazy.io/api/v1',
            headers: { Authorization: `Bearer ${this.apiKey}` },
            timeout: 30000,
        });

        // Retry simples em timeouts e 5xx
        this.client.interceptors.response.use(
            (r) => r,
            async (err) => {
                const cfg: any = err.config;
                if (!cfg || cfg.__isRetry) throw err;
                const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '');
                const status = err.response?.status;
                const shouldRetry = isTimeout || (typeof status === 'number' && status >= 500 && status <= 599);
                if (!shouldRetry) throw err;
                cfg.__isRetry = true;
                await new Promise(r => setTimeout(r, 2000));
                return this.client(cfg);
            }
        );
    }

    /** Valida as credenciais retornando info da conta. */
    async validate(): Promise<DataCrazyAccount> {
        try {
            const r = await this.client.get('/me');
            return {
                id: r.data.id || 'unknown',
                name: r.data.name || 'DataCrazy Account',
            };
        } catch (e: any) {
            // Se /me não existe, tenta um endpoint de leads pra validar
            try {
                await this.client.get('/leads', { params: { limit: 1 } });
                return {
                    id: 'datacrazy',
                    name: 'DataCrazy Account',
                };
            } catch {
                throw e;
            }
        }
    }

    /**
     * Lista leads por stage (fase/estágio).
     * DataCrazy usa filtros via query params.
     */
    async listLeadsByStage(stageName: string, maxPages = 10): Promise<DataCrazyLead[]> {
        const all: DataCrazyLead[] = [];
        const PAGE_SIZE = 50;

        for (let page = 1; page <= maxPages; page++) {
            try {
                const r = await this.client.get('/leads', {
                    params: {
                        'filter[stageName]': stageName,
                        limit: PAGE_SIZE,
                        page: page,
                    },
                });

                const leads = r.data.data || [];
                all.push(...leads);

                if (leads.length < PAGE_SIZE) break;
                await sleep(300); // Rate limiting: 60 req/min = 1 req/sec, esperar mais
            } catch (e: any) {
                if (e.response?.status === 404 || e.response?.status === 204) break;
                throw new Error(
                    `DataCrazy listLeadsByStage (stage="${stageName}", page=${page}): ${e.message}`
                );
            }
        }
        return all;
    }

    /**
     * Busca 1 lead pelo ID.
     */
    async fetchLead(leadId: string): Promise<DataCrazyLead | null> {
        try {
            const r = await this.client.get(`/leads/${leadId}`);
            return r.data.data || r.data;
        } catch (e: any) {
            if (e.response?.status === 404) return null;
            throw new Error(`DataCrazy fetchLead (${leadId}): ${e.message}`);
        }
    }

    /**
     * Extrai dados do lead DataCrazy pra Meta CAPI.
     * Diferente do Kommo: campos de contato vêm direto no lead (não em custom_fields).
     */
    extractUserData(lead: DataCrazyLead | null): ExtractedUserData {
        const result: ExtractedUserData = {
            external_id: lead ? `datacrazy-${lead.id}` : 'datacrazy-unknown',
        };

        if (!lead) return result;

        // Email: tenta campo direto e depois em contacts array
        result.email = this.normalizeEmail(lead.email) || this.findContactByType(lead, 'EMAIL');

        // Phone: tenta campo direto e depois em contacts array
        result.phone = this.normalizePhone(lead.phone) || this.findContactByType(lead, 'WHATSAPP');
        if (!result.phone) {
            result.phone = this.findContactByType(lead, 'PHONE');
        }

        // Nome: split em primeiro e último
        if (lead.name) {
            const parts = lead.name.trim().split(/\s+/);
            result.first_name = parts[0];
            result.last_name = parts.slice(1).join(' ') || undefined;
        }

        return result;
    }

    /** Encontra tipo de contato no array (EMAIL, WHATSAPP, PHONE). */
    private findContactByType(lead: DataCrazyLead, type: string): string | undefined {
        if (!Array.isArray(lead.contacts)) return undefined;
        const contact = lead.contacts.find(
            (c) => c.type && c.type.toUpperCase() === type.toUpperCase()
        );
        if (contact?.value) {
            return type === 'WHATSAPP' || type === 'PHONE'
                ? this.normalizePhone(contact.value)
                : this.normalizeEmail(contact.value);
        }
        return undefined;
    }

    private normalizeEmail(email: string | undefined): string | undefined {
        if (!email) return undefined;
        const trimmed = email.trim().toLowerCase();
        return trimmed && trimmed.includes('@') ? trimmed : undefined;
    }

    private normalizePhone(phone: string | undefined): string | undefined {
        if (!phone) return undefined;
        // Remove tudo que não é dígito
        let digits = phone.replace(/\D/g, '');
        // Se não tem código do país, assume 55 (Brasil)
        if (digits.length >= 10 && digits.length <= 11) digits = '55' + digits;
        return digits && digits.length >= 10 ? digits : undefined;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Detecta stages automáticamente fazendo uma chamada de exploração.
 * Retorna array com nomes únicos de stages encontrados.
 * Útil pra UI mostrar ao user quais stages existem.
 */
export async function discoverDataCrazyStages(apiKey: string): Promise<string[]> {
    const adapter = new DataCrazyAdapter(apiKey);
    const stages = new Set<string>();

    try {
        // Tenta buscar alguns leads pra ver quais stages existem
        const r = await adapter['client'].get('/leads', {
            params: { limit: 100, page: 1 },
        });

        const leads = r.data.data || [];
        for (const lead of leads) {
            if (lead.stageName) {
                stages.add(lead.stageName);
            }
        }
    } catch {
        // Se falhar, retorna vazio — user vai configurar manualmente
    }

    return Array.from(stages).sort();
}
