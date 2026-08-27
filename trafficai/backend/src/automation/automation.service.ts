// ==============================
// Automation Service — avalia regras SE/ENTÃO e executa ações
// ==============================

import { query } from '../database/connection';
import { authRepository } from '../auth/auth.repository';
import { metaService } from '../meta/meta.service';
import { logger } from '../shared/logger';
import { dailyWhatsAppService } from '../reports/daily-whatsapp.service';

export interface AutomationRule {
    id: string;
    user_id: string;
    account_id: string | null;
    name: string;
    scope: 'campaign' | 'account';
    condition_metric: 'cpa' | 'ctr' | 'roas' | 'spend' | 'cpc' | 'cpm';
    condition_operator: '>' | '<' | '>=' | '<=';
    condition_value: number;
    condition_period: 'today' | 'yesterday' | 'last_3d' | 'last_7d';
    action: 'pause_campaign' | 'enable_campaign' | 'notify_only';
    is_active: boolean;
    cooldown_hours: number;
    last_triggered_at: Date | null;
}

function periodBounds(p: AutomationRule['condition_period']): { since: string; until: string } {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (p === 'today') return { since: iso(today), until: iso(today) };
    const yesterday = new Date(today); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (p === 'yesterday') return { since: iso(yesterday), until: iso(yesterday) };
    const daysBack = p === 'last_3d' ? 3 : 7;
    const start = new Date(today); start.setUTCDate(start.getUTCDate() - daysBack);
    return { since: iso(start), until: iso(yesterday) };
}

function cmp(op: string, a: number, b: number): boolean {
    switch (op) {
        case '>': return a > b;
        case '<': return a < b;
        case '>=': return a >= b;
        case '<=': return a <= b;
        default: return false;
    }
}

async function metaCampaignAction(userId: string, campaignMetaId: string, newStatus: 'PAUSED' | 'ACTIVE'): Promise<{ ok: boolean; error?: string }> {
    const user = await authRepository.findById(userId);
    if (!user?.access_token) return { ok: false, error: 'sem access token' };
    try {
        await metaService.setCampaignStatus(userId, user.access_token, campaignMetaId, newStatus);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

/**
 * Avalia uma regra: puxa campanhas do escopo, calcula métrica no período,
 * compara com threshold, executa ação se matched E cooldown expirou.
 */
export async function evaluateRule(rule: AutomationRule): Promise<{ evaluated: number; triggered: number }> {
    const { since, until } = periodBounds(rule.condition_period);

    // Se cooldown ainda ativo, pula sem avaliar
    if (rule.last_triggered_at) {
        const hoursSince = (Date.now() - new Date(rule.last_triggered_at).getTime()) / 3600000;
        if (hoursSince < rule.cooldown_hours) return { evaluated: 0, triggered: 0 };
    }

    // Puxa campanhas do escopo com stats agregadas
    const camps = await query<any>(`
        SELECT c.id, c.name, c.meta_campaign_id, c.status, a.meta_account_id, c.account_id,
               COALESCE(SUM(ih.spend), 0)::float AS spend,
               COALESCE(SUM(ih.impressions), 0)::float AS impressions,
               COALESCE(SUM(ih.clicks), 0)::float AS clicks,
               COALESCE(SUM(ih.conversions), 0)::float AS conversions,
               COALESCE(AVG(NULLIF(ih.roas, 0)), 0)::float AS roas
        FROM campaigns c
        JOIN ad_accounts a ON c.account_id = a.id
        LEFT JOIN insights_history ih ON ih.campaign_id = c.id AND ih.date BETWEEN $2::date AND $3::date
        WHERE a.user_id = $1
          AND ($4::uuid IS NULL OR c.account_id = $4::uuid)
        GROUP BY c.id, c.name, c.meta_campaign_id, c.status, a.meta_account_id, c.account_id
        HAVING COALESCE(SUM(ih.spend), 0) > 0
    `, [rule.user_id, since, until, rule.account_id]);

    let triggered = 0;
    for (const c of camps) {
        // Calcula métrica
        let val = 0;
        switch (rule.condition_metric) {
            case 'cpa': val = c.conversions > 0 ? c.spend / c.conversions : 0; break;
            case 'ctr': val = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0; break;
            case 'cpc': val = c.clicks > 0 ? c.spend / c.clicks : 0; break;
            case 'cpm': val = c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0; break;
            case 'spend': val = c.spend; break;
            case 'roas': val = c.roas; break;
        }
        if (!cmp(rule.condition_operator, val, rule.condition_value)) continue;

        // Match! Executa ação
        let actionOk = false;
        let actionErr: string | null = null;

        if (rule.action === 'pause_campaign' && c.status === 'ACTIVE' && c.meta_campaign_id) {
            const r = await metaCampaignAction(rule.user_id, c.meta_campaign_id, 'PAUSED');
            actionOk = r.ok; actionErr = r.error || null;
            if (actionOk) await query(`UPDATE campaigns SET status='PAUSED' WHERE id=$1`, [c.id]);
        } else if (rule.action === 'enable_campaign' && c.status !== 'ACTIVE' && c.meta_campaign_id) {
            const r = await metaCampaignAction(rule.user_id, c.meta_campaign_id, 'ACTIVE');
            actionOk = r.ok; actionErr = r.error || null;
            if (actionOk) await query(`UPDATE campaigns SET status='ACTIVE' WHERE id=$1`, [c.id]);
        } else if (rule.action === 'notify_only') {
            actionOk = true; // só loga; notificação WhatsApp opcional (via daily-whatsapp)
        }

        await query(
            `INSERT INTO automation_rule_events (rule_id, campaign_id, metric_value, action_taken, action_success, action_error)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [rule.id, c.id, val, rule.action, actionOk, actionErr]
        );
        triggered++;
    }

    // Atualiza estatísticas da regra
    await query(
        `UPDATE automation_rules SET last_evaluated_at = NOW(),
            last_triggered_at = CASE WHEN $2 > 0 THEN NOW() ELSE last_triggered_at END,
            trigger_count = trigger_count + $2
         WHERE id = $1`,
        [rule.id, triggered]
    );

    if (triggered > 0) {
        logger.info(`automation: regra "${rule.name}" disparou em ${triggered} campanha(s)`);
    }
    return { evaluated: camps.length, triggered };
}

export async function evaluateAllActiveRules(): Promise<{ rules: number; total_triggered: number }> {
    const rules = await query<AutomationRule>(`SELECT * FROM automation_rules WHERE is_active = TRUE`);
    let total = 0;
    for (const r of rules) {
        try {
            const res = await evaluateRule(r);
            total += res.triggered;
        } catch (e: any) {
            logger.warn(`automation: falha ao avaliar regra ${r.id}`, { error: e.message });
        }
    }
    return { rules: rules.length, total_triggered: total };
}
