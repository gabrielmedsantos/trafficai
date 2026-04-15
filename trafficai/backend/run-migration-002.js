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
        console.log('🚀 Executando migration 002...');

        // Lê o arquivo SQL
        const sql = fs.readFileSync(
            path.join(__dirname, 'src/database/migrations/002_add_client_active_flag.sql'),
            'utf-8'
        );

        // Verifica se já foi executada
        const check = await client.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'ad_accounts' AND column_name = 'is_client_active'"
        );

        if (check.rows.length > 0) {
            console.log('⏭️  Migration já foi executada!');
            await client.end();
            return;
        }

        // Executa a migration
        await client.query('BEGIN');
        await client.query(sql);

        // Registra na tabela de migrations
        await client.query(
            "INSERT INTO _migrations (name) VALUES ('002_add_client_active_flag.sql')"
        );

        await client.query('COMMIT');
        console.log('✅ Migration 002 executada com sucesso!');
        console.log('');
        console.log('📋 Novos campos adicionados:');
        console.log('  - is_client_active: marca se a conta é de cliente ativo');
        console.log('  - client_notes: observações sobre o cliente');

        await client.end();
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro:', error.message);
        await client.end();
        process.exit(1);
    }
}

runMigration();
