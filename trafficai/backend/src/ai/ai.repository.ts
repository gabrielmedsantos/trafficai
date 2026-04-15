// ==============================
// TrafficAI — AI Analysis Repository
// ==============================

import { query, queryOne } from '../database/connection';

export interface AiAnalysisRecord {
    id: string;
    campaign_id: string;
    status: string;
    analysis: string;
    risk_score: number;
    recommendation?: string;
    raw_response?: any;
    created_at: Date;
}

export class AiRepository {
    async save(record: Omit<AiAnalysisRecord, 'id' | 'created_at'>): Promise<AiAnalysisRecord> {
        const rows = await query<AiAnalysisRecord>(
            `INSERT INTO ai_analysis (campaign_id, status, analysis, risk_score, recommendation, raw_response)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [
                record.campaign_id,
                record.status,
                record.analysis,
                record.risk_score,
                record.recommendation || null,
                record.raw_response ? JSON.stringify(record.raw_response) : null,
            ]
        );
        return rows[0];
    }

    async getByCampaign(campaignId: string, limit = 10): Promise<AiAnalysisRecord[]> {
        return query<AiAnalysisRecord>(
            `SELECT * FROM ai_analysis 
       WHERE campaign_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
            [campaignId, limit]
        );
    }

    async getLatest(campaignId: string): Promise<AiAnalysisRecord | null> {
        return queryOne<AiAnalysisRecord>(
            `SELECT * FROM ai_analysis 
       WHERE campaign_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
            [campaignId]
        );
    }

    async getRecentByUser(userId: string, limit = 20): Promise<(AiAnalysisRecord & { campaign_name: string; campaign_objective: string; account_name: string })[]> {
        return query(
            `SELECT a.*, c.name as campaign_name, c.objective as campaign_objective, acc.account_name FROM ai_analysis a
       JOIN campaigns c ON a.campaign_id = c.id
       JOIN ad_accounts acc ON c.account_id = acc.id
       WHERE acc.user_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
            [userId, limit]
        );
    }
}

export const aiRepository = new AiRepository();
