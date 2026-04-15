// ==============================
// TrafficAI — Alerts Repository
// ==============================

import { query, queryOne } from '../database/connection';

export interface Alert {
    id: string;
    user_id: string;
    account_id?: string;
    campaign_id?: string;
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    metric_name?: string;
    previous_value?: number;
    current_value?: number;
    metric_threshold?: number;
    auto_generated?: boolean;
    is_read: boolean;
    created_at: Date;
    // joined fields
    campaign_name?: string;
    account_name?: string;
}

export class AlertsRepository {
    async create(alert: Omit<Alert, 'id' | 'is_read' | 'created_at' | 'campaign_name' | 'account_name'>): Promise<Alert> {
        const rows = await query<Alert>(
            `INSERT INTO alerts (user_id, account_id, campaign_id, type, severity, title, message, metric_name, previous_value, current_value, metric_threshold, auto_generated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
            [
                alert.user_id,
                alert.account_id || null,
                alert.campaign_id || null,
                alert.type,
                alert.severity,
                alert.title,
                alert.message,
                alert.metric_name || null,
                alert.previous_value || null,
                alert.current_value || null,
                alert.metric_threshold || null,
                alert.auto_generated ?? false,
            ]
        );
        return rows[0];
    }

    async getByUser(userId: string, limit = 50): Promise<Alert[]> {
        return query<Alert>(
            `SELECT a.*, c.name as campaign_name, acc.account_name FROM alerts a
       LEFT JOIN campaigns c ON a.campaign_id = c.id
       LEFT JOIN ad_accounts acc ON c.account_id = acc.id
       WHERE a.user_id = $1
         AND (acc.id IS NULL OR acc.is_client_active = true)
       ORDER BY a.created_at DESC
       LIMIT $2`,
            [userId, limit]
        );
    }

    async getUnread(userId: string): Promise<Alert[]> {
        return query<Alert>(
            `SELECT a.*, c.name as campaign_name, acc.account_name FROM alerts a
       LEFT JOIN campaigns c ON a.campaign_id = c.id
       LEFT JOIN ad_accounts acc ON c.account_id = acc.id
       WHERE a.user_id = $1 AND a.is_read = FALSE
         AND (acc.id IS NULL OR acc.is_client_active = true)
       ORDER BY a.created_at DESC`,
            [userId]
        );
    }

    async markAsRead(alertId: string, userId: string): Promise<void> {
        await query('UPDATE alerts SET is_read = TRUE WHERE id = $1 AND user_id = $2', [alertId, userId]);
    }

    async markAllAsRead(userId: string): Promise<void> {
        await query('UPDATE alerts SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [userId]);
    }

    async getUnreadCount(userId: string): Promise<number> {
        const row = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM alerts a
             LEFT JOIN campaigns c ON a.campaign_id = c.id
             LEFT JOIN ad_accounts acc ON c.account_id = acc.id
             WHERE a.user_id = $1 AND a.is_read = FALSE
               AND (acc.id IS NULL OR acc.is_client_active = true)`,
            [userId]
        );
        return parseInt(row?.count || '0', 10);
    }
}

export const alertsRepository = new AlertsRepository();
