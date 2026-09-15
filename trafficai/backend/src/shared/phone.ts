// ==============================
// TrafficAI — Normalização de telefone BR pra matching entre sistemas
// O mesmo contato aparece com formatos diferentes dependendo de onde veio:
// WhatsApp (JID sempre com DDI 55 e o 9º dígito), CRM digitado à mão (às
// vezes sem DDI, às vezes sem o 9º dígito — número antigo cadastrado antes
// da mudança pra 9 dígitos). Gera todas as variações plausíveis pra usar
// num `phone = ANY(candidates)`.
// ==============================

/**
 * Gera candidatos de telefone BR a partir de qualquer formato de entrada
 * (com parênteses, espaço, traço, +, etc. — tudo que não é dígito é
 * descartado antes de gerar as variações).
 */
export function buildPhoneCandidates(phone: string): string[] {
    const digitsOnly = String(phone || '').replace(/\D/g, '');
    if (!digitsOnly) return [];

    const candidates = new Set<string>([digitsOnly]);

    // DDI 55 presente/ausente
    const withoutDDI = digitsOnly.startsWith('55') && digitsOnly.length >= 12
        ? digitsOnly.slice(2)
        : (!digitsOnly.startsWith('55') && (digitsOnly.length === 10 || digitsOnly.length === 11))
            ? digitsOnly
            : null;
    if (withoutDDI) {
        candidates.add(withoutDDI);
        candidates.add('55' + withoutDDI);
    }

    // 9º dígito do celular presente/ausente (DDD com 2 dígitos + número) —
    // cadastros antigos no CRM às vezes não têm o 9 que o WhatsApp sempre tem.
    for (const base of [...candidates]) {
        const local = base.startsWith('55') ? base.slice(2) : base;
        const ddi = base.startsWith('55') ? '55' : '';
        if (local.length === 11 && local[2] === '9') {
            // remove o 9 (11 dígitos -> 10)
            const without9 = local.slice(0, 2) + local.slice(3);
            candidates.add(ddi + without9);
            if (!ddi) candidates.add('55' + without9);
        }
        if (local.length === 10) {
            // adiciona o 9 (10 dígitos -> 11)
            const with9 = local.slice(0, 2) + '9' + local.slice(2);
            candidates.add(ddi + with9);
            if (!ddi) candidates.add('55' + with9);
        }
    }

    return [...candidates];
}
