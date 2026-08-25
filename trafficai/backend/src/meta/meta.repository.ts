// ==============================
// TrafficAI — Meta Ads Repository
// ==============================

import { query, queryOne } from '../database/connection';

export interface AdAccount {
    id: string;
    user_id: string;
    meta_account_id: string;
    account_name: string;
    currency: string;
    timezone: string;
    status: string;
    is_client_active: boolean;
    client_notes?: string;
    created_at: Date;
    // billing / sync metadata
    cached_balance?: number | null;
    cached_amount_spent?: number | null;
    cached_spend_cap?: number | null;
    cached_account_status?: number | null;
    balance_updated_at?: Date | null;
    last_insights_sync_at?: Date | null;
    payment_type?: 'pix' | 'card' | null;
    balance_alert_threshold?: number | null;
}

export interface Campaign {
    id: string;
    account_id: string;
    meta_campaign_id: string;
    name: string;
    objective?: string;
    status: string;
    daily_budget?: number;
    lifetime_budget?: number;
    created_time?: Date;
    optimization_goal?: string;
    destination_type?: string;
    // joined
    account_name?: string;
    meta_account_id?: string;
}

export interface InsightRecord {
    campaign_id: string;
    date: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    conversions: number;
    cost_per_conversion: number;
    roas: number;
    actions?: any;
}

export class MetaRepository {
    // ---- Ad Accounts ----

    async upsertAdAccount(userId: string, account: {
        meta_account_id: string;
        account_name: string;
        currency: string;
        timezone: string;
    }): Promise<AdAccount> {
        const rows = await query<AdAccount>(
            `INSERT INTO ad_accounts (user_id, meta_account_id, account_name, currency, timezone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, meta_account_id) 
       DO UPDATE SET account_name = $3, currency = $4, timezone = $5, updated_at = NOW()
       RETURNING *`,
            [userId, account.meta_account_id, account.account_name, account.currency, account.timezone]
        );
        return rows[0];
    }

    async getAdAccountsByUser(userId: string): Promise<AdAccount[]> {
        return query<AdAccount>(
            'SELECT * FROM ad_accounts WHERE user_id = $1 ORDER BY account_name',
            [userId]
        );
    }

    async getActiveAdAccountsByUser(userId: string): Promise<AdAccount[]> {
        return query<AdAccount>(
            'SELECT * FROM ad_accounts WHERE user_id = $1 AND is_client_active = true ORDER BY account_name',
            [userId]
        );
    }

    async updateClientStatus(accountId: string, userId: string, isClientActive: boolean, clientNotes?: string): Promise<void> {
        await query(
            `UPDATE ad_accounts
             SET is_client_active = $1, client_notes = $2, updated_at = NOW()
             WHERE id = $3 AND user_id = $4`,
            [isClientActive, clientNotes || null, accountId, userId]
        );
    }

    // ---- Campaigns ----

    async upsertCampaign(accountId: string, campaign: {
        meta_campaign_id: string;
        name: string;
        objective?: string;
        status: string;
        daily_budget?: number;
        lifetime_budget?: number;
        created_time?: string;
        optimization_goal?: string;
        destination_type?: string;
    }): Promise<Campaign> {
        const rows = await query<Campaign>(
            `INSERT INTO campaigns (account_id, meta_campaign_id, name, objective, status, daily_budget, lifetime_budget, created_time, optimization_goal, destination_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (account_id, meta_campaign_id)
       DO UPDATE SET name = $3, objective = $4, status = $5, daily_budget = $6, lifetime_budget = $7,
                      optimization_goal = COALESCE($9, campaigns.optimization_goal),
                      destination_type = COALESCE($10, campaigns.destination_type),
                      updated_at = NOW()
       RETURNING *`,
            [
                accountId,
                campaign.meta_campaign_id,
                campaign.name,
                campaign.objective || null,
                campaign.status,
                campaign.daily_budget || null,
                campaign.lifetime_budget || null,
                campaign.created_time || null,
                campaign.optimization_goal || null,
                campaign.destination_type || null,
            ]
        );
        return rows[0];
    }

    async getCampaignsByAccount(accountId: string): Promise<Campaign[]> {
        return query<Campaign>(
            `SELECT c.*, a.account_name, a.meta_account_id
             FROM campaigns c
             JOIN ad_accounts a ON c.account_id = a.id
             WHERE c.account_id = $1 ORDER BY c.name`,
            [accountId]
        );
    }

    async getCampaignsByUser(userId: string): Promise<Campaign[]> {
        return query<Campaign>(
            `SELECT c.*, a.account_name, a.meta_account_id
             FROM campaigns c
             JOIN ad_accounts a ON c.account_id = a.id
             WHERE a.user_id = $1 AND a.is_client_active = true
             ORDER BY a.account_name, c.name`,
            [userId]
        );
    }

    async getCampaignById(campaignId: string): Promise<Campaign | null> {
        return queryOne<Campaign>('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
    }

    // ---- Insights ----

    async upsertInsight(insight: InsightRecord): Promise<void> {
        await query(
            `INSERT INTO insights_history 
       (campaign_id, date, spend, impressions, reach, clicks, ctr, cpc, cpm, frequency, conversions, cost_per_conversion, roas, actions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (campaign_id, date) 
       DO UPDATE SET 
         spend = $3, impressions = $4, reach = $5, clicks = $6, ctr = $7, 
         cpc = $8, cpm = $9, frequency = $10, conversions = $11, 
         cost_per_conversion = $12, roas = $13, actions = $14`,
            [
                insight.campaign_id,
                insight.date,
                insight.spend,
                insight.impressions,
                insight.reach,
                insight.clicks,
                insight.ctr,
                insight.cpc,
                insight.cpm,
                insight.frequency,
                insight.conversions,
                insight.cost_per_conversion,
                insight.roas,
                JSON.stringify(insight.actions || []),
            ]
        );
    }

    async getInsightsByCampaign(campaignId: string, limit = 30, since?: string, until?: string): Promise<InsightRecord[]> {
        if (since && until) {
            return query<InsightRecord>(
                `SELECT * FROM insights_history
         WHERE campaign_id = $1 AND date >= $2 AND date <= $3
         ORDER BY date ASC`,
                [campaignId, since, until]
            );
        }
        return query<InsightRecord>(
            `SELECT * FROM insights_history
       WHERE campaign_id = $1
       ORDER BY date DESC
       LIMIT $2`,
            [campaignId, limit]
        );
    }

    async getLatestInsight(campaignId: string): Promise<InsightRecord | null> {
        return queryOne<InsightRecord>(
            `SELECT * FROM insights_history 
       WHERE campaign_id = $1 
       ORDER BY date DESC 
       LIMIT 1`,
            [campaignId]
        );
    }

    async getInsightsByDateRange(campaignId: string, startDate: string, endDate: string): Promise<InsightRecord[]> {
        return query<InsightRecord>(
            `SELECT * FROM insights_history 
       WHERE campaign_id = $1 AND date BETWEEN $2 AND $3 
       ORDER BY date ASC`,
            [campaignId, startDate, endDate]
        );
    }
}

export const metaRepository = new MetaRepository();
