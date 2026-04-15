const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('🚀 Executando migration 003...');

        // Verifica se já foi executada
        const check = await client.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'account_id'"
        );

        if (check.rows.length > 0) {
            console.log('⏭️  Migration já foi executada!');
            await client.end();
            return;
        }

        // Lê o arquivo SQL
        const sql = fs.readFileSync(
            path.join(__dirname, 'src/database/migrations/003_enhance_alerts_system.sql'),
            'utf-8'
        );

        // Executa a migration
        await client.query('BEGIN');
        await client.query(sql);

        // Registra na tabela de migrations
        await client.query(
            "INSERT INTO _migrations (name) VALUES ('003_enhance_alerts_system.sql')"
        );

        await client.query('COMMIT');
        console.log('✅ Migration 003 executada com sucesso!');
        console.log('');
        console.log('📋 Sistema de alertas aprimorado:');
        console.log('  - Alertas por conta de anúncio');
        console.log('  - Alertas automáticos');
        console.log('  - Reconhecimento e resolução de alertas');

        await client.end();
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro:', error.message);
        await client.end();
        process.exit(1);
    }
}

runMigration();
