// ==============================
// TrafficAI — Auth Repository
// ==============================

import { query, queryOne } from '../database/connection';

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

export class AuthRepository {
    async findByEmail(email: string): Promise<User | null> {
        return queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
    }

    async findById(id: string): Promise<User | null> {
        return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
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
            [metaUserId, accessToken, tokenExpiration, userId]
        );
    }

    async getUsersWithExpiredTokens(): Promise<User[]> {
        return query<User>(
            `SELECT * FROM users 
       WHERE access_token IS NOT NULL 
       AND token_expiration < NOW() + INTERVAL '1 day'`
        );
    }

    async getAllConnectedUsers(): Promise<User[]> {
        return query<User>(
            `SELECT * FROM users WHERE access_token IS NOT NULL AND token_expiration > NOW()`
        );
    }
}

export const authRepository = new AuthRepository();
