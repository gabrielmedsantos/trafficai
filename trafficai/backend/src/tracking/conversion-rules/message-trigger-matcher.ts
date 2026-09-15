// ==============================
// TrafficAI — Casamento de frase-gatilho em mensagem
// Portado de structured-catalog-message.parser.ts do RastrackDash
// (normalizeStructuredCatalogText / matchProviderMessageTrigger): normaliza
// acento/caixa e verifica se alguma frase configurada é substring da
// mensagem. Usado pelas regras message_phrase e whatsapp_label.
// ==============================

export function normalizeTriggerText(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLocaleLowerCase('pt-BR')
        .replace(/\s+/g, ' ');
}

/** Retorna a primeira frase-gatilho que bate (case/acento-insensível), ou null. */
export function matchTriggerPhrase(messageText: string, triggerPhrases: string[]): string | null {
    if (!triggerPhrases || triggerPhrases.length === 0) return null;
    const normalizedMessage = normalizeTriggerText(messageText);
    return (
        triggerPhrases.find(phrase => {
            const normalizedPhrase = normalizeTriggerText(phrase);
            return normalizedPhrase.length > 0 && normalizedMessage.includes(normalizedPhrase);
        }) ?? null
    );
}

export type MessageAuthorScope = 'team' | 'contact' | 'both';
export type MessageDirection = 'in' | 'out';

/** 'in' = mensagem do contato (cliente); 'out' = mensagem do time (atendente/bot). */
export function authorAllowedForScope(scope: MessageAuthorScope, direction: MessageDirection): boolean {
    if (scope === 'both') return true;
    if (scope === 'contact') return direction === 'in';
    return direction === 'out';
}

// Mesmo padrão de extração de valor único já usado em whatsapp-purchase-detector.ts —
// reexportado aqui pra regras message_phrase com valueMode='message_extracted'
// sem exigir o template fixo "Pedido:"/"Valor:".
const GENERIC_MONEY_RE = /r?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+)/gi;

function parseBRLValue(raw: string): number | null {
    const cleaned = raw.trim();
    const normalized = cleaned.includes(',')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/\./g, '');
    const n = parseFloat(normalized);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extrai um valor monetário da mensagem inteira, só quando existe exatamente
 * UM valor distinto reconhecível — mesma cautela do RastrackDash
 * (extractSingleMoneyValueCents): não adivinha entre valores conflitantes.
 */
export function extractSingleMoneyValue(messageText: string): number | null {
    const matches = [...messageText.matchAll(GENERIC_MONEY_RE)]
        .map(m => parseBRLValue(m[1]!))
        .filter((v): v is number => v !== null);
    const distinct = [...new Set(matches)];
    return distinct.length === 1 ? distinct[0]! : null;
}
