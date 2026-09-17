// ==============================
// TrafficAI — Motor de decisão de regras de conversão
// Porta a lógica central de provider-conversion-decision.engine.ts do
// RastrackDash, simplificada pro nosso modelo (regra escopada direto por
// tracking_source, sem indireção de workspace/canal).
//
// Cobre trigger_type 'keyword' e 'message_phrase'. 'whatsapp_label' e
// 'structured_catalog' entram em fases futuras (ver plano) — uma regra
// desses tipos aqui só é ignorada (not_supported), nunca quebra o fluxo.
// ==============================

import {
    normalizeTriggerText, matchTriggerPhrase, extractSingleMoneyValue,
    authorAllowedForScope, MessageDirection,
} from './message-trigger-matcher';

export interface ConversionRule {
    id: string;
    source_id: string;
    name: string;
    trigger_type: 'keyword' | 'whatsapp_label' | 'message_phrase' | 'structured_catalog' | 'provider_automation';
    match_mode: 'contains' | 'exact';
    event_name: string;
    trigger_value: string | null;
    trigger_phrases: string[] | null;
    message_author_scope: 'team' | 'contact' | 'both';
    value_mode: 'fixed' | 'message_extracted';
    default_value: number | null;
    default_currency: string | null;
    default_content_name: string | null;
    mode: 'observation' | 'production';
    active: boolean;
}

export interface RuleOccurrence {
    phone: string;
    messageText: string | null;
    direction: MessageDirection;
    externalExecutionKey: string;
    occurredAt: Date;
    labelName?: string | null; // presente só em ocorrências de trigger_type='whatsapp_label'
}

export interface RuleDecision {
    outcome: 'ignored' | 'eligible' | 'review_required';
    rule: ConversionRule;
    matchedTriggerPhrase: string | null;
    value: number | null;
    reasonCode: string;
}

export function evaluateRule(rule: ConversionRule, occurrence: RuleOccurrence): RuleDecision {
    const ignore = (reasonCode: string): RuleDecision =>
        ({ outcome: 'ignored', rule, matchedTriggerPhrase: null, value: null, reasonCode });

    if (!rule.active) return ignore('rule_inactive');
    if (rule.trigger_type === 'whatsapp_label') {
        return evaluateLabelRule(rule, occurrence, ignore);
    }
    if (rule.trigger_type !== 'keyword' && rule.trigger_type !== 'message_phrase') {
        return ignore('trigger_type_not_supported_yet');
    }
    if (!authorAllowedForScope(rule.message_author_scope, occurrence.direction)) {
        return ignore('author_scope_mismatch');
    }
    if (!occurrence.messageText) return ignore('empty_message');

    let matchedTriggerPhrase: string | null = null;
    if (rule.trigger_type === 'keyword') {
        const text = normalizeTriggerText(occurrence.messageText);
        const trigger = normalizeTriggerText(rule.trigger_value || '');
        if (!trigger) return ignore('rule_missing_trigger_value');
        const matched = rule.match_mode === 'exact' ? text === trigger : text.includes(trigger);
        if (!matched) return ignore('trigger_missing');
        matchedTriggerPhrase = rule.trigger_value;
    } else {
        const phrases = rule.trigger_phrases || [];
        if (phrases.length === 0) return ignore('rule_missing_trigger_phrases');
        matchedTriggerPhrase = matchTriggerPhrase(occurrence.messageText, phrases);
        if (!matchedTriggerPhrase) return ignore('trigger_missing');
    }

    let value: number | null = rule.default_value ?? null;
    if (rule.value_mode === 'message_extracted') {
        const extracted = extractSingleMoneyValue(occurrence.messageText);
        if (extracted === null) {
            return {
                outcome: 'review_required', rule, matchedTriggerPhrase, value: null,
                reasonCode: 'value_unparseable_or_ambiguous',
            };
        }
        value = extracted;
    }

    return { outcome: 'eligible', rule, matchedTriggerPhrase, value, reasonCode: 'matched' };
}

// Gatilho por label do WhatsApp/CRM: compara o nome da etiqueta aplicada
// contra as etiquetas configuradas na regra (trigger_phrases). Não depende
// de texto de mensagem nem de author_scope — é um evento de etiquetagem,
// não uma mensagem. value_mode='message_extracted' não se aplica aqui
// (não existe mensagem pra extrair valor) — sempre usa default_value.
function evaluateLabelRule(
    rule: ConversionRule, occurrence: RuleOccurrence, ignore: (reasonCode: string) => RuleDecision
): RuleDecision {
    if (!occurrence.labelName) return ignore('empty_label');
    const phrases = rule.trigger_phrases || [];
    if (phrases.length === 0) return ignore('rule_missing_trigger_phrases');

    const label = normalizeTriggerText(occurrence.labelName);
    const matched = phrases.find(p => {
        const norm = normalizeTriggerText(p);
        return rule.match_mode === 'exact' ? label === norm : label.includes(norm);
    });
    if (!matched) return ignore('trigger_missing');

    return {
        outcome: 'eligible', rule, matchedTriggerPhrase: matched,
        value: rule.default_value ?? null, reasonCode: 'matched',
    };
}
