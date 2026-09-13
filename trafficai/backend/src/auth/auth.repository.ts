// ==============================
// TrafficAI — Auth Repository
// ==============================

import { query, queryOne } from '../database/connection';
import { encrypt, decryptMaybe } from '../shared/encryption';

export interface User {
    id: string;
    email: string;
    password_hash: string;
    name?: string;
    meta_user_id?: string;
    access_token?: string;
    token_expiration?: Date;
    created_at: Date;
    updated_at: Date;
}

// access_token fica criptografado em repouso (AES-256-GCM — ver
// shared/encryption.ts). decryptMaybe() também aceita valores em texto puro
// salvos antes dessa mudança, sem exigir migração one-shot.
function withDecryptedToken<T extends { access_token?: string }>(user: T | null): T | null {
    if (!user) return user;
    return { ...user, access_token: decryptMaybe(user.access_token) as string | undefined };
}

export class AuthRepository {
    async findByEmail(email: string): Promise<User | null> {
        const user = await queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
        return withDecryptedToken(user);
    }

    async findById(id: string): Promise<User | null> {
        const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
        return withDecryptedToken(user);
    }

    async create(email: string, passwordHash: string, name?: string): Promise<User> {
        const rows = await query<User>(
            `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [email, passwordHash, name || null]
        );
        return rows[0];
    }

    async updateMetaToken(
        userId: string,
        metaUserId: string,
        accessToken: string,
        tokenExpiration: Date
    ): Promise<void> {
        await query(
            `UPDATE users
       SET meta_user_id = $1, access_token = $2, token_expiration = $3, updated_at = NOW()
       WHERE id = $4`,
            [metaUserId, accessToken ? encrypt(accessToken) : accessToken, tokenExpiration, userId]
        );
    }

    async getUsersWithExpiredTokens(): Promise<User[]> {
        const users = await query<User>(
            `SELECT * FROM users
       WHERE access_token IS NOT NULL
       AND token_expiration < NOW() + INTERVAL '1 day'`
        );
        return users.map(u => withDecryptedToken(u)!);
    }

    async getAllConnectedUsers(): Promise<User[]> {
        const users = await query<User>(
            `SELECT * FROM users WHERE access_token IS NOT NULL AND token_expiration > NOW()`
        );
        return users.map(u => withDecryptedToken(u)!);
    }
}

export const authRepository = new AuthRepository();
