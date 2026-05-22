"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
/**
 * Criptografa um texto usando AES-256-GCM.
 * Retorna uma string no formato: iv:tag:ciphertext (tudo em hex)
 */
function encrypt(plaintext) {
    const key = Buffer.from(env_1.env.ENCRYPTION_KEY, 'hex');
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}
/**
 * Decriptografa uma string no formato iv:tag:ciphertext
 */
function decrypt(encryptedText) {
    const [ivHex, tagHex, ciphertextHex] = encryptedText.split(':');
    if (!ivHex || !tagHex || !ciphertextHex) {
        throw new Error('Invalid encrypted text format');
    }
    const key = Buffer.from(env_1.env.ENCRYPTION_KEY, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
}
//# sourceMappingURL=token.encryption.js.map