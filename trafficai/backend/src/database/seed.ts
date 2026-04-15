import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Usar DIRECT_URL para migrations (evita problemas com pgbouncer no Supabase)
const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

async function runSeed() {
    if (!dbUrl) {
        console.error('❌ ERRO: DATABASE_URL ou DIRECT_URL não encontrados no .env');
        process.exit(1);
    }

    const client = new Client({ connectionString: dbUrl });

    try {
        await client.connect();
        console.log('✅ Conectado ao banco de dados Supabase.');

        // 1. Rodar Migrations (já rodou antes do erro)
        // console.log('⏳ Rodando migrations...');
        // const schemaPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
        // const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        // await client.query(schemaSql);
        // console.log('✅ Migrations executadas com sucesso!');

        // 2. Criar Usuário Padrão
        console.log('⏳ Criando usuário padrão...');
        const hashedPass = await bcrypt.hash('admin123', 10);

        // Inserindo na tabela users
        const userResult = await client.query(
            `INSERT INTO users (email, password_hash, name) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, name = $3
       RETURNING id`,
            ['admin@trafficai.com', hashedPass, 'Admin TrafficAI']
        );

        const userId = userResult.rows[0].id;
        console.log('✅ Usuário padrão criado!');
        console.log('   Email: admin@trafficai.com');
        console.log('   Senha: admin123');

        // 3. Criar dados fake (conta de anúncio) se não existir
        console.log('⏳ Inserindo dados de teste (mock)...');
        const adAccountResult = await client.query(
            `INSERT INTO ad_accounts (user_id, meta_account_id, account_name, currency, status) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (user_id, meta_account_id) DO UPDATE SET account_name = $3
       RETURNING id`,
            [userId, 'act_123456789', 'Conta Exemplo Supabase', 'BRL', 'ACTIVE']
        );
        const accountId = adAccountResult.rows[0].id;

        // 4. Criar dados fake (campanhas)
        await client.query(
            `INSERT INTO campaigns (account_id, meta_campaign_id, name, status, objective, daily_budget)
       VALUES 
       ($1, $2, $3, $4, $5, $6),
       ($1, $7, $8, $9, $10, $11)
       ON CONFLICT (account_id, meta_campaign_id) DO NOTHING`,
            [
                accountId, 'camp_001', '[VENDAS] Lançamento Q3', 'ACTIVE', 'CONVERSIONS', 150.00,
                'camp_002', '[LEADS] Ebook Gratuito', 'ACTIVE', 'LEAD_GENERATION', 50.00
            ]
        );

        console.log('🎉 Tudo pronto no Supabase! Banco configurado e populado.');

    } catch (err) {
        console.error('❌ Erro no seed:', err);
    } finally {
        await client.end();
    }
}

runSeed();
