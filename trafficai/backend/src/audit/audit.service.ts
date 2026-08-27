// ==============================
// TrafficAI — Log de auditoria básico
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';

export interface AuditEntry {
    userId: string;
    userName?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    details?: Record<string, any>;
}

/**
 * Grava uma entrada no log de auditoria. Nunca lança — uma falha ao registrar
 * não pode derrubar a ação real que está sendo auditada.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
    try {
        let userName = entry.userName;
        if (!userName) {
            const rows = await query<{ name: string | null; email: string }>(
                `SELECT name, email FROM users WHERE id = $1`,
                [entry.userId]
            );
            userName = rows[0]?.name || rows[0]?.email || null;
        }

        await query(
            `INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, entity_label, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                entry.userId,
                userName || null,
                entry.action,
                entry.entityType,
                entry.entityId || null,
                entry.entityLabel || null,
                entry.details ? JSON.stringify(entry.details) : null,
            ]
        );
    } catch (error: any) {
        logger.error('Falha ao gravar audit_log', { error: error.message, action: entry.action });
    }
}
