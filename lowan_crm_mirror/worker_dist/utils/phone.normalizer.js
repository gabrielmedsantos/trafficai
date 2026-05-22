"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
exports.brazilianPhoneVariants = brazilianPhoneVariants;
exports.normalizePhoneBatch = normalizePhoneBatch;
const libphonenumber_js_1 = require("libphonenumber-js");
/**
 * Normaliza um número de telefone para o formato E.164.
 * Remove o + e retorna apenas os dígitos.
 *
 * @param raw     - Número como veio do usuário
 * @param country - País padrão para números sem DDI (ex: 'BR')
 */
function normalizePhone(raw, country = 'BR') {
    const trimmed = raw.trim().replace(/\s+/g, '');
    if (!trimmed) {
        return { original: raw, normalized: null, e164: null, valid: false, error: 'Empty phone' };
    }
    try {
        // Tenta parsear com o país padrão como fallback
        const phone = (0, libphonenumber_js_1.parsePhoneNumber)(trimmed, country);
        if (!phone || !(0, libphonenumber_js_1.isValidPhoneNumber)(trimmed, country)) {
            return {
                original: raw,
                normalized: null,
                e164: null,
                valid: false,
                error: 'Invalid phone number',
            };
        }
        const e164 = phone.format('E.164'); // ex: +5511999999999
        const normalized = e164.replace('+', ''); // ex: 5511999999999
        return { original: raw, normalized, e164, valid: true };
    }
    catch (err) {
        return {
            original: raw,
            normalized: null,
            e164: null,
            valid: false,
            error: err instanceof Error ? err.message : 'Parse error',
        };
    }
}
/**
 * Gera variantes do número para lidar com o 9º dígito brasileiro.
 * Ex: 558186339905 → também tenta 5581986339905 (com 9) e vice-versa.
 */
function brazilianPhoneVariants(phone) {
    const variants = new Set([phone]);
    const without55 = phone.startsWith('55') ? phone.slice(2) : null;
    if (without55)
        variants.add(without55);
    const with55 = !phone.startsWith('55') ? `55${phone}` : null;
    if (with55)
        variants.add(with55);
    const base = without55 ?? phone;
    if (base.length === 10 && /^\d{2}[2-9]/.test(base)) {
        // 10 dígitos sem 9 → adiciona 9 após DDD
        const with9 = base.slice(0, 2) + '9' + base.slice(2);
        variants.add(with9);
        variants.add(`55${with9}`);
    }
    else if (base.length === 11 && base[2] === '9') {
        // 11 dígitos com 9 → remove o 9
        const without9 = base.slice(0, 2) + base.slice(3);
        variants.add(without9);
        variants.add(`55${without9}`);
    }
    return Array.from(variants);
}
/**
 * Normaliza em lote e retorna separados os válidos e inválidos.
 */
function normalizePhoneBatch(phones, country = 'BR') {
    const valid = [];
    const invalid = [];
    for (const phone of phones) {
        const result = normalizePhone(phone, country);
        if (result.valid && result.normalized && result.e164) {
            valid.push({ original: result.original, normalized: result.normalized, e164: result.e164 });
        }
        else {
            invalid.push({ original: result.original, error: result.error ?? 'Invalid' });
        }
    }
    return { valid, invalid };
}
//# sourceMappingURL=phone.normalizer.js.map