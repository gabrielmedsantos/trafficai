// ==============================
// TrafficAI — Central de Diagnóstico
// Trilha unificada de falhas/avisos do Tracking (envio Meta, sync de CRM,
// motor de regras, webhooks). Nunca deve derrubar o fluxo que a está
// registrando — toda chamada é best-effort, silenciosamente ignorada se o
// próprio registro falhar.
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';

export type DiagnosticSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface DiagnosticEventInput {
    userId: string;
    sourceId?: string | null;
    severity: DiagnosticSeverity;
    eventType: string;
    title: string;
    message?: string | null;
    errorCode?: string | null;
    summaryPayload?: Record<string, any> | null;
}

const SENSITIVE_KEY_RE = /(authorization|cookie|secret|token|api.?key|password|access_token)/i;

function redactSensitive(value: any): any {
    if (Array.isArray(value)) return value.map(redactSensitive);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY_RE.test(k) ? '[redacted]' : redactSensitive(v)])
        );
    }
    return value;
}

/** Nunca lança — uma falha ao registrar diagnóstico não pode derrubar o
 *  fluxo real (envio Meta, webhook, etc.) que está tentando se auditar. */
export async function recordDiagnosticEvent(input: DiagnosticEventInput): Promise<void> {
    try {
        await query(
            `INSERT INTO tracking_diagnostic_events
                (user_id, source_id, severity, event_type, title, message, error_code, summary_payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
                input.userId, input.sourceId || null, input.severity, input.eventType,
                input.title, input.message || null, input.errorCode || null,
                input.summaryPayload ? JSON.stringify(redactSensitive(input.summaryPayload)) : null,
            ]
        );
    } catch (err: any) {
        logger.warn('diagnostics: falha ao registrar evento', { error: err.message, eventType: input.eventType });
    }
}

export interface DiagnosticSummary {
    status: 'healthy' | 'warning' | 'critical';
    total: number;
    critical: number;
    errors: number;
    warnings: number;
    by_type: { event_type: string; count: number }[];
}

export async function getDiagnosticsSummary(
    userId: string, since: Date, until: Date
): Promise<DiagnosticSummary> {
    const totals = await query<any>(
        `SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
            COUNT(*) FILTER (WHERE severity = 'error') AS errors,
            COUNT(*) FILTER (WHERE severity = 'warning') AS warnings
         FROM tracking_diagnostic_events
         WHERE user_id = $1 AND occurred_at BETWEEN $2 AND $3`,
        [userId, since.toISOString(), until.toISOString()]
    );
    const t = totals[0] || {};
    const critical = Number(t.critical) || 0;
    const errors = Number(t.errors) || 0;
    const warnings = Number(t.warnings) || 0;

    const byType = await query<any>(
        `SELECT event_type, COUNT(*)::int AS count
         FROM tracking_diagnostic_events
         WHERE user_id = $1 AND occurred_at BETWEEN $2 AND $3
         GROUP BY event_type ORDER BY count DESC LIMIT 10`,
        [userId, since.toISOString(), until.toISOString()]
    );

    return {
        status: critical > 0 ? 'critical' : (errors > 0 || warnings > 0) ? 'warning' : 'healthy',
        total: Number(t.total) || 0,
        critical, errors, warnings,
        by_type: byType,
    };
}

export interface DiagnosticListFilters {
    sourceId?: string;
    severity?: DiagnosticSeverity;
    eventType?: string;
    search?: string;
    since?: Date;
    until?: Date;
    limit?: number;
}

export async function listDiagnosticEvents(userId: string, filters: DiagnosticListFilters): Promise<any[]> {
    const where: string[] = ['user_id = $1'];
    const params: any[] = [userId];

    if (filters.sourceId) { params.push(filters.sourceId); where.push(`source_id = $${params.length}`); }
    if (filters.severity) { params.push(filters.severity); where.push(`severity = $${params.length}`); }
    if (filters.eventType) { params.push(filters.eventType); where.push(`event_type = $${params.length}`); }
    if (filters.since) { params.push(filters.since.toISOString()); where.push(`occurred_at >= $${params.length}`); }
    if (filters.until) { params.push(filters.until.toISOString()); where.push(`occurred_at <= $${params.length}`); }
    if (filters.search) {
        params.push(`%${filters.search}%`);
        where.push(`(title ILIKE $${params.length} OR message ILIKE $${params.length} OR error_code ILIKE $${params.length})`);
    }

    const lim = Math.min(filters.limit || 100, 500);
    return query<any>(
        `SELECT d.*, s.name AS source_name
         FROM tracking_diagnostic_events d
         LEFT JOIN tracking_sources s ON s.id = d.source_id
         WHERE ${where.join(' AND ')}
         ORDER BY occurred_at DESC LIMIT ${lim}`,
        params
    );
}
