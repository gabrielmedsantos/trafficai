import { CountryCode } from 'libphonenumber-js';
export interface NormalizeResult {
    original: string;
    normalized: string | null;
    e164: string | null;
    valid: boolean;
    error?: string;
}
/**
 * Normaliza um número de telefone para o formato E.164.
 * Remove o + e retorna apenas os dígitos.
 *
 * @param raw     - Número como veio do usuário
 * @param country - País padrão para números sem DDI (ex: 'BR')
 */
export declare function normalizePhone(raw: string, country?: CountryCode): NormalizeResult;
/**
 * Gera variantes do número para lidar com o 9º dígito brasileiro.
 * Ex: 558186339905 → também tenta 5581986339905 (com 9) e vice-versa.
 */
export declare function brazilianPhoneVariants(phone: string): string[];
/**
 * Normaliza em lote e retorna separados os válidos e inválidos.
 */
export declare function normalizePhoneBatch(phones: string[], country?: CountryCode): {
    valid: Array<{
        original: string;
        normalized: string;
        e164: string;
    }>;
    invalid: Array<{
        original: string;
        error: string;
    }>;
};
//# sourceMappingURL=phone.normalizer.d.ts.map