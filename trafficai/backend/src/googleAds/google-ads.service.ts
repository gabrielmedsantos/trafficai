// ==============================
// Google Ads Service
// Fluxo: refresh access_token (1h) via OAuth → GAQL queries via REST v20
// Credenciais por user vêm da tabela google_ads_credentials.
// ==============================

import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { AppError } from '../shared/errors';

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://googleads.googleapis.com/v20';

interface Credentials {
    developer_token: string;
    login_customer_id: string;
    refresh_token: string;
    client_id: string;
    client_secret: string;
}

async function loadCredentials(userId: string): Promise<Credentials> {
    const r = await query<any>(
        `SELECT developer_token, login_customer_id, refresh_token, client_id, client_secret
         FROM google_ads_credentials WHERE user_id = $1`,
        [userId]
    );
    if (!r.length) throw new AppError('Credenciais Google Ads não configuradas', 400);
    const c = r[0];
    for (const k of ['developer_token', 'login_customer_id', 'refresh_token', 'client_id', 'client_secret'] as const) {
        if (!c[k]) throw new AppError(`Google Ads: ${k} não configurado`, 400);
    }
    return c;
}

// Cache do access_token em memória (1h)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(userId: string, creds: Credentials): Promise<string> {
    const cached = tokenCache.get(userId);
    if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

    const resp = await axios.post(OAUTH_URL, null, {
        params: {
            grant_type: 'refresh_token',
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            refresh_token: creds.refresh_token,
        },
        timeout: 15000,
    });
    const { access_token, expires_in } = resp.data;
    if (!access_token) throw new AppError('OAuth refresh falhou', 502);

    const expiresAt = Date.now() + (Number(expires_in) || 3600) * 1000;
    tokenCache.set(userId, { token: access_token, expiresAt });
    return access_token;
}

async function gaqlSearch(userId: string, customerId: string, gaqlQuery: string): Promise<any[]> {
    const creds = await loadCredentials(userId);
    const accessToken = await getAccessToken(userId, creds);
    const cleanCustomerId = customerId.replace(/-/g, '');
    const url = `${API_BASE}/customers/${cleanCustomerId}/googleAds:search`;

    const results: any[] = [];
    let pageToken: string | undefined;

    do {
        const body: any = { query: gaqlQuery, pageSize: 1000 };
        if (pageToken) body.pageToken = pageToken;

        try {
            const resp = await axios.post(url, body, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'developer-token': creds.developer_token,
                    'login-customer-id': creds.login_customer_id,
                    'Content-Type': 'application/json',
                },
                timeout: 60000,
            });
            results.push(...(resp.data.results || []));
            pageToken = resp.data.nextPageToken;
        } catch (err: any) {
            const detail = err.response?.data?.error?.message || err.message;
            throw new AppError(`Google Ads API: ${detail}`, 502);
        }
    } while (pageToken);

    return results;
}

/**
 * Lista contas acessíveis pelo MCC.
 */
export async function listAccessibleCustomers(userId: string): Promise<Array<{ id: string; name: string; currency: string; timeZone: string; manager: boolean }>> {
    const creds = await loadCredentials(userId);
    const accessToken = await getAccessToken(userId, creds);

    // 1) listAccessibleCustomers retorna nomes de recurso
    const listResp = await axios.get(`${API_BASE}/customers:listAccessibleCustomers`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': creds.developer_token,
        },
        timeout: 30000,
    });
    const resourceNames: string[] = listResp.data.resourceNames || [];

    // 2) Pra cada, GAQL query pegando dados básicos
    const out: any[] = [];
    for (const rn of resourceNames) {
        const custId = rn.split('/')[1];
        try {
            const rows = await gaqlSearch(userId, custId,
                `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1`
            );
            if (rows.length) {
                const c = rows[0].customer;
                out.push({
                    id: String(c.id),
                    name: c.descriptiveName || `Conta ${c.id}`,
                    currency: c.currencyCode || 'BRL',
                    timeZone: c.timeZone || 'America/Sao_Paulo',
                    manager: !!c.manager,
                });
            }
        } catch (e: any) {
            logger.warn(`google-ads: falha ao carregar ${custId}`, { error: e.message });
        }
    }
    return out;
}

/**
 * Sincroniza campanhas + insights (últimos N dias) pra uma conta.
 */
export async function syncAccount(userId: string, accountId: string, daysBack: number = 30): Promise<{ campaigns: number; insights: number }> {
    const acc = await query<any>(
        `SELECT * FROM google_ads_accounts WHERE id = $1 AND user_id = $2`,
        [accountId, userId]
    );
    if (!acc.length) throw new AppError('Conta Google Ads não encontrada', 404);
    const custId = acc[0].customer_id;

    // Campanhas
    const campaignRows = await gaqlSearch(userId, custId, `
        SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
               campaign_budget.amount_micros
        FROM campaign
        WHERE campaign.status IN ('ENABLED', 'PAUSED')
    `);

    let campaignsSaved = 0;
    for (const row of campaignRows) {
        const c = row.campaign;
        const budget = row.campaignBudget?.amountMicros ? BigInt(row.campaignBudget.amountMicros) : null;
        await query(`
            INSERT INTO google_ads_campaigns (account_id, google_campaign_id, name, status, advertising_channel_type, daily_budget_micros, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (account_id, google_campaign_id) DO UPDATE SET
                name = EXCLUDED.name, status = EXCLUDED.status,
                daily_budget_micros = EXCLUDED.daily_budget_micros, updated_at = NOW()
        `, [accountId, String(c.id), c.name, c.status, c.advertisingChannelType, budget]);
        campaignsSaved++;
    }

    // Insights por dia
    const insightRows = await gaqlSearch(userId, custId, `
        SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks,
               metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM campaign
        WHERE segments.date DURING LAST_${daysBack === 7 ? '7' : daysBack === 14 ? '14' : daysBack === 90 ? '90' : '30'}_DAYS
    `);

    let insightsSaved = 0;
    for (const row of insightRows) {
        const cId = String(row.campaign.id);
        const date = row.segments.date;
        const m = row.metrics || {};
        // Get campaign UUID
        const camp = await query<any>(
            `SELECT id FROM google_ads_campaigns WHERE account_id = $1 AND google_campaign_id = $2`,
            [accountId, cId]
        );
        if (!camp.length) continue;
        await query(`
            INSERT INTO google_ads_insights (campaign_id, date, impressions, clicks, cost_micros, conversions, conversion_value)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (campaign_id, date) DO UPDATE SET
                impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
                cost_micros = EXCLUDED.cost_micros, conversions = EXCLUDED.conversions,
                conversion_value = EXCLUDED.conversion_value
        `, [
            camp[0].id, date,
            BigInt(m.impressions || 0), BigInt(m.clicks || 0),
            BigInt(m.costMicros || 0), Number(m.conversions || 0),
            Number(m.conversionsValue || 0),
        ]);
        insightsSaved++;
    }

    await query(`UPDATE google_ads_accounts SET last_sync_at = NOW() WHERE id = $1`, [accountId]);
    logger.info(`google-ads sync: ${acc[0].account_name} → ${campaignsSaved} campanhas, ${insightsSaved} insights`);
    return { campaigns: campaignsSaved, insights: insightsSaved };
}

/**
 * Muta status de campanha (ENABLED / PAUSED).
 */
export async function setCampaignStatus(userId: string, accountId: string, googleCampaignId: string, newStatus: 'ENABLED' | 'PAUSED'): Promise<void> {
    const acc = await query<any>(`SELECT customer_id FROM google_ads_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
    if (!acc.length) throw new AppError('Conta não encontrada', 404);

    const creds = await loadCredentials(userId);
    const accessToken = await getAccessToken(userId, creds);
    const custId = acc[0].customer_id.replace(/-/g, '');

    const body = {
        operations: [{
            update: {
                resourceName: `customers/${custId}/campaigns/${googleCampaignId}`,
                status: newStatus,
            },
            updateMask: 'status',
        }],
    };

    try {
        await axios.post(`${API_BASE}/customers/${custId}/campaigns:mutate`, body, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'developer-token': creds.developer_token,
                'login-customer-id': creds.login_customer_id,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        await query(`UPDATE google_ads_campaigns SET status = $1 WHERE account_id = $2 AND google_campaign_id = $3`, [newStatus, accountId, googleCampaignId]);
    } catch (err: any) {
        const detail = err.response?.data?.error?.message || err.message;
        throw new AppError(`Google Ads mutate falhou: ${detail}`, 502);
    }
}
