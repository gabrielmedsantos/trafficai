// ==============================
// TrafficAI — CRUD de regras de conversão por fonte de tracking
// ==============================

import { query } from '../../database/connection';
import { ConversionRule } from './conversion-decision.engine';

export interface ConversionRuleInput {
    name: string;
    trigger_type: ConversionRule['trigger_type'];
    match_mode?: 'contains' | 'exact';
    event_name: string;
    trigger_value?: string | null;
    trigger_phrases?: string[] | null;
    message_author_scope?: 'team' | 'contact' | 'both';
    value_mode?: 'fixed' | 'message_extracted';
    default_value?: number | null;
    default_currency?: string | null;
    default_content_name?: string | null;
    mode?: 'observation' | 'production';
    active?: boolean;
}

export async function listConversionRules(sourceId: string): Promise<ConversionRule[]> {
    return query<ConversionRule>(
        `SELECT * FROM tracking_conversion_rules WHERE source_id = $1 ORDER BY created_at DESC`,
        [sourceId]
    );
}

export async function getActiveMessageRules(sourceId: string): Promise<ConversionRule[]> {
    return query<ConversionRule>(
        `SELECT * FROM tracking_conversion_rules
         WHERE source_id = $1 AND active = TRUE AND trigger_type IN ('keyword', 'message_phrase')`,
        [sourceId]
    );
}

export async function getActiveLabelRules(sourceId: string): Promise<ConversionRule[]> {
    return query<ConversionRule>(
        `SELECT * FROM tracking_conversion_rules
         WHERE source_id = $1 AND active = TRUE AND trigger_type = 'whatsapp_label'`,
        [sourceId]
    );
}

export async function createConversionRule(sourceId: string, input: ConversionRuleInput): Promise<ConversionRule> {
    const rows = await query<ConversionRule>(
        `INSERT INTO tracking_conversion_rules
            (source_id, name, trigger_type, match_mode, event_name, trigger_value, trigger_phrases,
             message_author_scope, value_mode, default_value, default_currency, default_content_name, mode, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
            sourceId, input.name, input.trigger_type, input.match_mode || 'contains', input.event_name,
            input.trigger_value || null, input.trigger_phrases ? JSON.stringify(input.trigger_phrases) : null,
            input.message_author_scope || 'both', input.value_mode || 'fixed',
            input.default_value ?? null, input.default_currency ?? null, input.default_content_name ?? null,
            input.mode || 'observation', input.active ?? true,
        ]
    );
    return rows[0]!;
}

export async function updateConversionRule(
    sourceId: string, ruleId: string, input: Partial<ConversionRuleInput>
): Promise<ConversionRule | null> {
    const fields: string[] = [];
    const params: any[] = [];
    const set = (col: string, value: any) => { params.push(value); fields.push(`${col} = $${params.length}`); };

    if (input.name !== undefined) set('name', input.name);
    if (input.trigger_type !== undefined) set('trigger_type', input.trigger_type);
    if (input.match_mode !== undefined) set('match_mode', input.match_mode);
    if (input.event_name !== undefined) set('event_name', input.event_name);
    if (input.trigger_value !== undefined) set('trigger_value', input.trigger_value);
    if (input.trigger_phrases !== undefined) set('trigger_phrases', input.trigger_phrases ? JSON.stringify(input.trigger_phrases) : null);
    if (input.message_author_scope !== undefined) set('message_author_scope', input.message_author_scope);
    if (input.value_mode !== undefined) set('value_mode', input.value_mode);
    if (input.default_value !== undefined) set('default_value', input.default_value);
    if (input.default_currency !== undefined) set('default_currency', input.default_currency);
    if (input.default_content_name !== undefined) set('default_content_name', input.default_content_name);
    if (input.mode !== undefined) set('mode', input.mode);
    if (input.active !== undefined) set('active', input.active);
    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    params.push(sourceId, ruleId);
    const rows = await query<ConversionRule>(
        `UPDATE tracking_conversion_rules SET ${fields.join(', ')}
         WHERE source_id = $${params.length - 1} AND id = $${params.length}
         RETURNING *`,
        params
    );
    return rows[0] || null;
}

export async function deleteConversionRule(sourceId: string, ruleId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
        `DELETE FROM tracking_conversion_rules WHERE source_id = $1 AND id = $2 RETURNING id`,
        [sourceId, ruleId]
    );
    return rows.length > 0;
}

export async function listRuleExecutions(sourceId: string, ruleId?: string): Promise<any[]> {
    const params: any[] = [sourceId];
    let where = `source_id = $1`;
    if (ruleId) { params.push(ruleId); where += ` AND rule_id = $${params.length}`; }
    return query<any>(
        `SELECT * FROM tracking_rule_executions WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
        params
    );
}
