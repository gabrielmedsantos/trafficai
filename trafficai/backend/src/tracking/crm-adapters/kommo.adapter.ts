// ==============================
// TrafficAI — Kommo CRM Adapter
// API v4: https://developers.kommo.com/reference
// Auth: Bearer <long_lived_access_token> (Settings → Integrations → Private)
// Endpoint: https://<subdomain>.kommo.com/api/v4/...
// ==============================

import axios, { AxiosInstance } from 'axios';

export interface KommoPipeline {
    id: number;
    name: string;
    statuses: Array<{ id: number; name: string; type?: number; color?: string }>;
}

export interface WonStatus {
    pipeline_id: number;
    pipeline_name: string;
    status_id: number;
    status_name: string;
}

export interface KommoAccount {
    id: number;
    name: string;
    subdomain: string;
    currency: string;
}

export interface ExtractedUserData {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    external_id: string;
}

export class KommoAdapter {
    private client: AxiosInstance;
    private subdomain: string;

    constructor(subdomain: string, accessToken: string) {
        // Normaliza — usuário às vezes cola URL inteira ("https://mapscar.kommo.com")
        // ou domínio completo ("mapscar.kommo.com"). Extraímos só o subdomínio.
        this.subdomain = normalizeKommoSubdomain(subdomain);
        if (!this.subdomain) {
            throw new Error('Subdomínio Kommo inválido. Ex: se você acessa "mapscar.kommo.com", cole apenas "mapscar".');
        }
        this.client = axios.create({
            baseURL: `https://${this.subdomain}.kommo.com/api/v4`,
            headers: { Authorization: `Bearer ${accessToken}` },
            // Kommo às vezes leva 30-45s pra listar em contas grandes.
            // Timeout generoso + retry lida com isso; retry interceptor abaixo.
            timeout: 60000,
        });

        // Retry 1x em timeouts e 5xx (não em 4xx). Backoff simples de 1.5s.
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
                await new Promise(r => setTimeout(r, 1500));
                return this.client(cfg);
            }
        );
    }

    /** Valida as credenciais retornando info da conta. */
    async validate(): Promise<KommoAccount> {
        const r = await this.client.get('/account');
        return {
            id: r.data.id,
            name: r.data.name,
            subdomain: r.data.subdomain,
            currency: r.data.currency || 'BRL',
        };
    }

    /** Lista pipelines com seus status. */
    async listPipelines(): Promise<KommoPipeline[]> {
        const r = await this.client.get('/leads/pipelines');
        const pipelines = r.data._embedded?.pipelines || [];
        return pipelines.map((p: any) => ({
            id: p.id,
            name: p.name,
            statuses: (p._embedded?.statuses || []).map((s: any) => ({
                id: s.id, name: s.name, type: s.type, color: s.color,
            })),
        }));
    }

    /**
     * Encontra automaticamente os status de "Venda ganha" em todos os pipelines.
     * O Kommo tem 142 como status padrão won, mas também aceita nomes customizados.
     */
    async findWonStatuses(): Promise<WonStatus[]> {
        const pipelines = await this.listPipelines();
        const won: WonStatus[] = [];
        const re = /venda|fechad|vendid|ganho|won|sold|success|sucesso/i;
        for (const p of pipelines) {
            for (const s of p.statuses) {
                if (s.id === 142 || re.test(s.name)) {
                    won.push({
                        pipeline_id: p.id,
                        pipeline_name: p.name,
                        status_id: s.id,
                        status_name: s.name,
                    });
                }
            }
        }
        return won;
    }

    /**
     * Encontra estágios de "Qualificação/Lead" em todos os pipelines.
     * Se o user passar stage_ids explícitos, filtra só esses. Senão, detecta por regex.
     */
    async findLeadStages(explicitStageIds?: number[]): Promise<WonStatus[]> {
        const pipelines = await this.listPipelines();
        const stages: WonStatus[] = [];
        // Regex mais preciso: só nomes que indicam a CAPTURA INICIAL do lead.
        // Evita pegar estágios de "engajamento" como "Contato inicial" (que é
        // depois que o vendedor JÁ conversou — não é o momento de Lead pra Meta).
        // Aceita: "leads de entrada", "lead qualificado", "novo lead", "prospect".
        const re = /(^|\s|_)(qualif|leads?\s*(de\s*)?entrada|leads?\s*novo|novo\s*lead|prospec)/i;
        // Estágios "padrão" do Kommo: 142=won, 143=lost. Nunca considerar como Lead.
        const excludedIds = new Set([142, 143]);
        for (const p of pipelines) {
            for (const s of p.statuses) {
                if (excludedIds.has(s.id)) continue;
                const matchExplicit = explicitStageIds && explicitStageIds.length > 0
                    ? explicitStageIds.includes(s.id)
                    : false;
                const matchAuto = !explicitStageIds || explicitStageIds.length === 0
                    ? re.test(s.name)
                    : false;
                if (matchExplicit || matchAuto) {
                    stages.push({
                        pipeline_id: p.id,
                        pipeline_name: p.name,
                        status_id: s.id,
                        status_name: s.name,
                    });
                }
            }
        }
        return stages;
    }

    /** Lista leads de um status específico (paginado). Page size reduzido pra
     *  suportar contas com muitos custom_fields sem timeout. */
    async listLeadsByStatus(pipelineId: number, statusId: number, maxPages = 100): Promise<any[]> {
        const all: any[] = [];
        const PAGE_SIZE = 100;
        for (let page = 1; page <= maxPages; page++) {
            try {
                const r = await this.client.get('/leads', {
                    params: {
                        'filter[statuses][0][pipeline_id]': pipelineId,
                        'filter[statuses][0][status_id]': statusId,
                        'with': 'contacts',
                        'limit': PAGE_SIZE,
                        'page': page,
                    },
                });
                const leads = r.data._embedded?.leads || [];
                all.push(...leads);
                if (leads.length < PAGE_SIZE) break;
                await sleep(200);
            } catch (e: any) {
                if (e.response?.status === 204) break;
                throw new Error(`Kommo listLeadsByStatus (pipeline=${pipelineId}, status=${statusId}, page=${page}): ${e.message}`);
            }
        }
        return all;
    }

    /** Busca 1 lead + contato com custom_fields completos. */
    async fetchLeadWithContact(leadId: string | number): Promise<{
        lead: any; contact: any | null;
    }> {
        const leadRes = await this.client.get(`/leads/${leadId}?with=contacts`);
        const lead = leadRes.data;
        const contactLink = lead._embedded?.contacts?.[0];
        let contact: any = null;
        if (contactLink) {
            try {
                const cr = await this.client.get(`/contacts/${contactLink.id}`);
                contact = cr.data;
            } catch { /* contato inexistente */ }
        }
        return { lead, contact };
    }

    /** Busca contato por ID (com cache opcional). */
    async fetchContact(contactId: number): Promise<any | null> {
        try {
            const r = await this.client.get(`/contacts/${contactId}`);
            return r.data;
        } catch {
            return null;
        }
    }

    /**
     * Extrai dados pro Meta CAPI de um lead+contato Kommo.
     * Busca custom_fields pelo nome (email, telefone, whatsapp, celular).
     * Também detecta first_name/last_name separados OU splitta o name completo.
     */
    extractUserData(lead: any, contact: any | null): ExtractedUserData {
        const result: ExtractedUserData = {
            external_id: `kommo-${lead.id}`,
        };
        if (!contact) return result;

        // 1. Busca por field_code (PHONE, EMAIL são códigos padrão do Kommo)
        result.email = this.findCustomField(contact.custom_fields_values, ['email', 'e-mail'], ['EMAIL']);
        result.phone = this.findCustomField(contact.custom_fields_values, ['telefone', 'phone', 'celular', 'whatsapp', 'móvel', 'movel'], ['PHONE', 'MOB', 'WORK_PHONE']);

        // 2. Se ainda não achou telefone, tenta em campos alternativos do contato
        if (!result.phone) {
            // Kommo às vezes retorna em "phones" como array
            if (Array.isArray((contact as any).phones)) {
                const ph = (contact as any).phones[0];
                if (ph) result.phone = String(typeof ph === 'string' ? ph : ph.value || '').trim() || undefined;
            }
        }

        let firstName = String(contact.first_name || '').trim() || undefined;
        let lastName = String(contact.last_name || '').trim() || undefined;
        if (!firstName && contact.name) {
            const parts = String(contact.name).trim().split(/\s+/);
            firstName = parts[0];
            lastName = parts.slice(1).join(' ') || undefined;
        }
        result.first_name = firstName;
        result.last_name = lastName;
        return result;
    }

    // needles = match por nome (field_name), codes = match por código (field_code)
    private findCustomField(
        fields: any[] | undefined,
        needles: string[],
        codes: string[] = []
    ): string | undefined {
        if (!Array.isArray(fields)) return undefined;
        // 1ª passada: match por código (mais confiável, ignora idioma)
        for (const f of fields) {
            const code = String(f.field_code || f.code || '').toUpperCase();
            if (!codes.includes(code)) continue;
            const vals = f.values;
            if (Array.isArray(vals) && vals.length > 0) {
                const v = String(vals[0]?.value || '').trim();
                if (v) return v;
            }
        }
        // 2ª passada: match por nome do campo
        for (const f of fields) {
            const name = String(f.field_name || f.name || '').toLowerCase();
            if (!needles.some(n => name.includes(n))) continue;
            const vals = f.values;
            if (Array.isArray(vals) && vals.length > 0) {
                const v = String(vals[0]?.value || '').trim();
                if (v) return v;
            }
        }
        return undefined;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Extrai o subdomínio Kommo de várias formas de input que o usuário pode colar.
 *   "mapscar"                      → "mapscar"
 *   "mapscar.kommo.com"            → "mapscar"
 *   "https://mapscar.kommo.com"    → "mapscar"
 *   "https://mapscar.kommo.com/"   → "mapscar"
 *   "mapscar.kommo.com/leads/list" → "mapscar"
 *   " MapsCar "                    → "mapscar"  (lowercase + trim)
 *   ""                             → ""         (chamador valida)
 */
export function normalizeKommoSubdomain(input: string | null | undefined): string {
    if (!input) return '';
    let s = String(input).trim().toLowerCase();
    // Remove protocolo se veio URL completa
    s = s.replace(/^https?:\/\//, '');
    // Se contém .kommo.com, pega tudo até esse ponto
    const kommoIdx = s.indexOf('.kommo.com');
    if (kommoIdx > 0) {
        s = s.slice(0, kommoIdx);
    }
    // Remove qualquer path/query/hash restante
    s = s.split('/')[0].split('?')[0].split('#')[0];
    // Só letras/números/hífen/underscore
    s = s.replace(/[^a-z0-9_-]/g, '');
    return s;
}
