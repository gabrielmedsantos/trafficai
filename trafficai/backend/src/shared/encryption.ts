// ==============================
// TrafficAI — Criptografia de tokens em repouso
// AES-256-GCM, formato "iv:tag:ciphertext" (hex, separado por ":").
// ENCRYPTION_KEY é exclusiva do Traffic AI (64 chars hex = 32 bytes
// aleatórios, gerada com `openssl rand -hex 32`) — nunca reaproveitar a
// chave de outro sistema: se uma vazar, só compromete um dos dois.
// ==============================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) throw new Error('ENCRYPTION_KEY não configurada no servidor');
    const key = Buffer.from(hex, 'hex');
    if (key.length !== 32) throw new Error('ENCRYPTION_KEY inválida — precisa ser 64 caracteres hex (32 bytes)');
    return key;
}

export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decrypt(encryptedText: string): string {
    const [ivHex, tagHex, ciphertextHex] = encryptedText.split(':');
    if (!ivHex || !tagHex || !ciphertextHex) throw new Error('Invalid encrypted text format');
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
}

// Formato esperado: 32 hex (iv) : 32 hex (tag) : N hex (ciphertext, par).
const ENCRYPTED_FORMAT = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;

/**
 * Descriptografa se o valor estiver no formato criptografado; senão, devolve
 * como veio. Cobre a transição: tokens salvos ANTES dessa mudança continuam
 * em texto puro no banco até serem regravados (próxima reconexão/refresh) —
 * não exige migração one-shot arriscada nem quebra contas já conectadas.
 */
export function decryptMaybe(value: string | null | undefined): string | null | undefined {
    if (!value) return value;
    if (!ENCRYPTED_FORMAT.test(value)) return value;
    try {
        return decrypt(value);
    } catch {
        // Formato bateu por coincidência mas não é realmente criptografado
        // (ou a chave mudou) — devolve como veio em vez de quebrar o caller.
        return value;
    }
}
