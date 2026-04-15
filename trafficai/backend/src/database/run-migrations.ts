// ==============================
// TrafficAI — Migration Runner
// ==============================

import fs from 'fs';
import path from 'path';
import { pool } from './connection';
import dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
    console.log('🚀 Running database migrations...');

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    const client = await pool.connect();

    try {
        // Create migrations tracking table
        await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

        for (const file of files) {
            const { rows } = await client.query(
                'SELECT id FROM _migrations WHERE name = $1',
                [file]
            );

            if (rows.length > 0) {
                console.log(`  ⏭️  Skipping ${file} (already executed)`);
                continue;
            }

            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`  ✅ Executed ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  ❌ Failed ${file}:`, err);
                throw err;
            }
        }

        console.log('✅ All migrations complete!');
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
