// ==============================
// TrafficAI — Database Connection Pool
// ==============================

import dotenv from 'dotenv';
dotenv.config();

import { Pool, PoolConfig } from 'pg';
import { logger } from '../shared/logger';

const poolConfig: PoolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);

pool.on('connect', () => {
    logger.debug('New database connection established');
});

pool.on('error', (err) => {
    logger.error('Unexpected database pool error', { error: err.message });
});

/**
 * Execute a parameterized query with automatic connection management
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('Query executed', { text: text.substring(0, 80), duration, rows: result.rowCount });
        return result.rows as T[];
    } catch (error: any) {
        logger.error('Query failed', { text: text.substring(0, 80), error: error.message });
        throw error;
    }
}

/**
 * Execute a query and return first row or null
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Run a transaction with automatic commit/rollback
 */
export async function transaction<T>(fn: (query: (text: string, params?: any[]) => Promise<any[]>) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const txQuery = async (text: string, params?: any[]) => {
            const result = await client.query(text, params);
            return result.rows;
        };
        const result = await fn(txQuery);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export default { pool, query, queryOne, transaction };
