// ==============================
// TrafficAI — Orquestrador do motor de regras
// Liga avaliação de regra (conversion-decision.engine) + dedupe +
// atribuição + envio real pra Meta CAPI, com trilha de auditoria em
// tracking_rule_executions. Chamado a cada mensagem de WhatsApp recebida
// OU enviada (ver evolution/webhook.ts) pras regras 'keyword'/'message_phrase'
// ativas da fonte.
//
// Não substitui o detector fixo de Purchase por mensagem
// (whatsapp-purchase-detector.ts) — aquele continua rodando em paralelo,
// já testado em produção. Este motor cobre regras NOVAS que o cliente
// configurar (qualificação por frase, eventos customizados), sem risco pro
// que já funciona.
// ==============================

import { query } from '../../database/connection';
import { logger } from '../../shared/logger';
import { evaluateRule, ConversionRule, RuleOccurrence } from './conversion-decision.engine';
import { getActiveMessageRules } from './conversion-rules.service';
import { trackEvent, TrackingEventInput } from '../tracking.service';
import { findWhatsAppLeadByPhone } from '../whatsapp-lead.service';

export async function runConversionRulesForMessage(
    source: any, phone: string, messageText: string | null,
    direction: 'in' | 'out', externalExecutionKey: string, occurredAt: Date = new Date()
): Promise<void> {
    if (!messageText) return;
    const rules = await getActiveMessageRules(source.id);
    if (rules.length === 0) return;

    const occurrence: RuleOccurrence = { phone, messageText, direction, externalExecutionKey, occurredAt };
    for (const rule of rules) {
        try {
            await runOneRule(source, rule, occurrence);
        } catch (err: any) {
            logger.warn('conversion-rules: falha ao rodar regra', { rule: rule.id, error: err.message });
        }
    }
}

async function runOneRule(source: any, rule: ConversionRule, occurrence: RuleOccurrence): Promise<void> {
    const decision = evaluateRule(rule, occurrence);
    if (decision.outcome === 'ignored') return; // mensagem comum, sem efeito — não polui a auditoria

    // Dedupe: essa regra já processou essa mensagem/ocorrência antes?
    const existing = await query<{ id: string }>(
        `SELECT id FROM tracking_rule_executions WHERE rule_id = $1 AND external_execution_key = $2`,
        [rule.id, occurrence.externalExecutionKey]
    );
    if (existing.length > 0) return;

    const digitsOnly = occurrence.phone.replace(/\D/g, '');

    if (decision.outcome === 'review_required') {
        await recordExecution(source.id, rule.id, occurrence, {
            status: 'blocked', reason_code: decision.reasonCode, value: null,
        });
        return;
    }

    // eligible — só falta checar atribuição real antes de mandar pra Meta.
    // Mesma política já aplicada ao Purchase por mensagem: sem ctwa_clid
    // resolvido, o evento não ajuda a otimizar campanha nenhuma.
    const lead = await findWhatsAppLeadByPhone(source.id, occurrence.phone);
    if (!lead?.ctwa_clid) {
        await recordExecution(source.id, rule.id, occurrence, {
            status: 'blocked', reason_code: 'no_attribution', value: decision.value,
            lead_id: null,
        });
        return;
    }

    if (rule.mode === 'observation') {
        await recordExecution(source.id, rule.id, occurrence, {
            status: 'observed', reason_code: 'observation_mode', value: decision.value,
        });
        return;
    }

    const eventId = `rule-${rule.id}-${digitsOnly}-${occurrence.externalExecutionKey}`;
    const event: TrackingEventInput = {
        event_name: rule.event_name,
        event_id: eventId,
        event_time: Math.floor(occurrence.occurredAt.getTime() / 1000),
        action_source: 'business_messaging',
        messaging_channel: 'whatsapp',
        value: decision.value ?? undefined,
        currency: decision.value != null ? (rule.default_currency || 'BRL') : undefined,
        user_data: {
            phone: digitsOnly,
            external_id: `ctwa-${String(lead.ctwa_clid).slice(0, 20)}`,
            ctwa_clid: lead.ctwa_clid,
            page_id: lead.page_id || undefined,
        },
        custom_data: {
            source: 'conversion_rule',
            rule_id: rule.id,
            rule_name: rule.name,
            matched_trigger_phrase: decision.matchedTriggerPhrase || undefined,
            content_name: rule.default_content_name || undefined,
        },
        campaign: lead.meta_campaign_id ? {
            meta_campaign_id: lead.meta_campaign_id,
            meta_campaign_name: lead.meta_campaign_name || undefined,
            meta_adset_id: lead.meta_adset_id || undefined,
            meta_adset_name: lead.meta_adset_name || undefined,
            meta_ad_id: lead.ad_source_id || undefined,
            meta_ad_name: lead.ad_name || undefined,
        } : undefined,
    };

    const effectivePixel = source.pixel_id;
    if (!effectivePixel) {
        await recordExecution(source.id, rule.id, occurrence, {
            status: 'failed', reason_code: 'sem pixel disponível na fonte', value: decision.value,
        });
        return;
    }

    try {
        const r = await trackEvent(source, event);
        await recordExecution(source.id, rule.id, occurrence, {
            status: r.meta_status === 'sent' ? 'materialized' : 'failed',
            reason_code: r.meta_status === 'sent' ? 'sent' : 'meta_rejected',
            value: decision.value,
        });
        logger.info(`regra de conversão disparou: ${rule.name}`, {
            source: source.id, rule: rule.id, event_name: rule.event_name, phone: digitsOnly, meta_status: r.meta_status,
        });
    } catch (err: any) {
        await recordExecution(source.id, rule.id, occurrence, {
            status: 'failed', reason_code: err.message, value: decision.value,
        });
    }
}

async function recordExecution(
    sourceId: string, ruleId: string, occurrence: RuleOccurrence,
    data: { status: string; reason_code: string; value: number | null; lead_id?: string | null }
): Promise<void> {
    await query(
        `INSERT INTO tracking_rule_executions
            (source_id, rule_id, external_execution_key, occurred_at, status, reason_code, value, lead_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (rule_id, external_execution_key) DO NOTHING`,
        [sourceId, ruleId, occurrence.externalExecutionKey, occurrence.occurredAt, data.status, data.reason_code, data.value, data.lead_id ?? null]
    );
}
