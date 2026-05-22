"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaGraphClient = void 0;

/**
 * Cliente leve da Meta Marketing API (Graph API).
 * Usa fetch nativo. Versão pinada em v19.0.
 *
 * Docs:
 *  - https://developers.facebook.com/docs/marketing-api/insights
 *  - https://developers.facebook.com/docs/graph-api/reference/ad-account
 */

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

class MetaGraphClient {
    constructor(accessToken) {
        if (!accessToken) throw new Error('Access token obrigatório');
        this.accessToken = accessToken;
    }

    async _get(path, params = {}) {
        const qs = new URLSearchParams({ access_token: this.accessToken, ...params });
        const url = `${GRAPH_BASE}${path}?${qs.toString()}`;
        let res;
        try {
            res = await fetch(url, { method: 'GET' });
        } catch (e) {
            throw new Error(`Falha ao conectar Meta: ${e.message}`);
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.error) {
            const msg = json?.error?.message || `HTTP ${res.status}`;
            const code = json?.error?.code || res.status;
            throw new Error(`Meta API ${code}: ${msg}`);
        }
        return json;
    }

    /**
     * Lista contas de anúncio acessíveis pelo token (pra validação inicial).
     */
    async listAdAccounts() {
        const data = await this._get('/me/adaccounts', {
            fields: 'id,name,account_id,account_status,currency,timezone_name,business',
            limit: 100,
        });
        return Array.isArray(data?.data) ? data.data : [];
    }

    /**
     * Detalhes de uma conta específica.
     */
    async getAdAccount(adAccountId) {
        const acc = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
        return await this._get(`/${acc}`, {
            fields: 'id,name,account_id,account_status,currency,timezone_name,business',
        });
    }

    /**
     * Lista campanhas da conta. `effective_status` = ['ACTIVE','PAUSED'] etc filtra.
     */
    async listCampaigns(adAccountId, opts = {}) {
        const acc = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
        const params = {
            fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time',
            limit: opts.limit || 200,
        };
        if (opts.effectiveStatus) {
            params.effective_status = JSON.stringify(opts.effectiveStatus);
        }
        const data = await this._get(`/${acc}/campaigns`, params);
        return Array.isArray(data?.data) ? data.data : [];
    }

    /**
     * Insights por campanha em um intervalo de datas.
     * @param {string} adAccountId
     * @param {object} opts
     * @param {string} opts.since - YYYY-MM-DD
     * @param {string} opts.until - YYYY-MM-DD
     * @param {string} [opts.timeIncrement='1'] - '1' (diário) | 'monthly'
     * @param {string} [opts.level='campaign'] - 'campaign' | 'adset' | 'ad'
     */
    async getInsights(adAccountId, opts = {}) {
        const acc = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
        const since = opts.since;
        const until = opts.until;
        if (!since || !until) throw new Error('since/until obrigatórios');

        const params = {
            level: opts.level || 'campaign',
            time_range: JSON.stringify({ since, until }),
            time_increment: opts.timeIncrement || '1',
            fields: [
                'campaign_id', 'campaign_name',
                'date_start', 'date_stop',
                'spend', 'impressions', 'clicks', 'reach',
                'ctr', 'cpc', 'cpm',
                'actions', 'action_values',
            ].join(','),
            limit: 500,
        };

        const all = [];
        let url = `${GRAPH_BASE}/${acc}/insights?${new URLSearchParams({ access_token: this.accessToken, ...params })}`;
        // Paginação simples
        for (let page = 0; page < 50; page++) {
            const res = await fetch(url, { method: 'GET' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.error) {
                const msg = json?.error?.message || `HTTP ${res.status}`;
                throw new Error(`Meta insights: ${msg}`);
            }
            if (Array.isArray(json.data)) all.push(...json.data);
            if (json.paging?.next) {
                url = json.paging.next;
            } else {
                break;
            }
        }
        return all;
    }
}

exports.MetaGraphClient = MetaGraphClient;
