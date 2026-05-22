/**
 * Criptografa um texto usando AES-256-GCM.
 * Retorna uma string no formato: iv:tag:ciphertext (tudo em hex)
 */
export declare function encrypt(plaintext: string): string;
/**
 * Decriptografa uma string no formato iv:tag:ciphertext
 */
export declare function decrypt(encryptedText: string): string;
//# sourceMappingURL=token.encryption.d.ts.map