// ==============================
// TrafficAI — Kommo API Client (Commercial)
// Wrapper completo da API v4 do Kommo focado em sync comercial.
// Ortogonal ao adapter de tracking (que extrai user_data pra Meta CAPI).
// ==============================

import axios, { AxiosInstance, AxiosError } from 'axios';

export interface KommoAccount {
    id: number;
    name: string;
    subdomain: string;
    currency: string;
}

export interface KommoStatus {
    id: number;
    name: string;
    sort: number;
    color?: string;
    type?: number;       // 0=normal, 1=leads-in, 142=won, 143=lost
}

export interface KommoPipeline {
    id: number;
    name: string;
    sort: number;
    is_main: boolean;
    is_archive: boolean;
    statuses: KommoStatus[];
}

export interface KommoUser {
    id: number;
    name: string;
    email: string;
    rights?: { is_active: boolean };
}

export interface KommoLead {
    id: number;
    name: string;
    price: number;
    pipeline_id: number;
    status_id: number;
    responsible_user_id: number;
    created_at: number;     // unix seconds
    updated_at: number;
    closed_at: number | null;
    loss_reason_id: number | null;
    custom_fields_values: any[] | null;
    _embedded?: {
        contacts?: Array<{ id: number; is_main?: boolean }>;
        tags?: Array<{ id: number; name: string }>;
    };
}

export interface KommoContact {
    id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
    custom_fields_values: any[] | null;
}

export interface KommoLossReason {
    id: number;
    name: string;
}

export class KommoClient {
    private http: AxiosInstance;
    public readonly subdomain: string;

    constructor(subdomain: string, accessToken: string) {
        // Normaliza: aceita "ana", "ana.kommo.com" ou "https://ana.kommo.com"
        const clean = subdomain
            .trim()
            .replace(/^https?:\/\//, '')
            .replace(/\.kommo\.com\/?$/, '')
            .replace(/\/+$/, '');
        this.subdomain = clean;
        this.http = axios.create({
            baseURL: `https://${clean}.kommo.com/api/v4`,
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 25000,
        });
    }

    /** Valida o token e retorna info da conta. */
    async getAccount(): Promise<KommoAccount> {
        const { data } = await this.http.get('/account');
        return {
            id: data.id,
            name: data.name,
            subdomain: data.subdomain,
            currency: data.currency || 'BRL',
        };
    }

    async listPipelines(): Promise<KommoPipeline[]> {
        const { data } = await this.http.get('/leads/pipelines');
        const pipes = data._embedded?.pipelines || [];
        return pipes.map((p: any) => ({
            id: p.id,
            name: p.name,
            sort: p.sort,
            is_main: !!p.is_main,
            is_archive: !!p.is_archive,
            statuses: (p._embedded?.statuses || []).map((s: any) => ({
                id: s.id, name: s.name, sort: s.sort, color: s.color, type: s.type,
            })),
        }));
    }

    async listUsers(): Promise<KommoUser[]> {
        const all: KommoUser[] = [];
        for (let page = 1; page <= 5; page++) {
            try {
                const { data } = await this.http.get('/users', { params: { page, limit: 250 } });
                const users = data._embedded?.users || [];
                all.push(...users.map((u: any) => ({
                    id: u.id, name: u.name, email: u.email,
                    rights: { is_active: u.rights?.is_active !== false },
                })));
                if (users.length < 250) break;
            } catch (e: any) {
                if (e.response?.status === 204) break;
                throw e;
            }
        }
        return all;
    }

    async listLossReasons(): Promise<KommoLossReason[]> {
        try {
            const { data } = await this.http.get('/leads/loss_reasons', { params: { limit: 250 } });
            const items = data._embedded?.loss_reasons || [];
            return items.map((r: any) => ({ id: r.id, name: r.name }));
        } catch (e: any) {
            if (e.response?.status === 204) return [];
            throw e;
        }
    }

    /**
     * Lista leads paginado, com filtros opcionais.
     * @param updatedSince Unix seconds — se passado, filtra updated_at >= valor
     */
    async listLeads(opts: {
        updatedSince?: number;
        page?: number;
        limit?: number;
    } = {}): Promise<KommoLead[]> {
        const params: Record<string, unknown> = {
            'with': 'contacts',
            'limit': Math.min(250, opts.limit ?? 250),
            'page': opts.page ?? 1,
        };
        if (opts.updatedSince) {
            params['filter[updated_at][from]'] = opts.updatedSince;
        }
        try {
            const { data } = await this.http.get('/leads', { params });
            return (data._embedded?.leads || []) as KommoLead[];
        } catch (e: any) {
            if (e.response?.status === 204) return [];
            throw e;
        }
    }

    /** Itera todas as paginas chamando o callback por batch. */
    async paginateLeads(opts: { updatedSince?: number; maxPages?: number },
        onBatch: (leads: KommoLead[], page: number) => Promise<void>
    ): Promise<number> {
        let total = 0;
        const max = opts.maxPages ?? 30;
        for (let page = 1; page <= max; page++) {
            const batch = await this.listLeads({ updatedSince: opts.updatedSince, page, limit: 250 });
            if (batch.length === 0) break;
            await onBatch(batch, page);
            total += batch.length;
            if (batch.length < 250) break;
            await sleep(150);  // rate-limit safety
        }
        return total;
    }

    async getContact(id: number): Promise<KommoContact | null> {
        try {
            const { data } = await this.http.get(`/contacts/${id}`);
            return data as KommoContact;
        } catch {
            return null;
        }
    }

    /** Helper pra extrair erro readable (logs). */
    static formatError(err: unknown): string {
        const e = err as AxiosError;
        if (e.response) {
            return `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 200)}`;
        }
        return (e as Error).message ?? String(err);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}
