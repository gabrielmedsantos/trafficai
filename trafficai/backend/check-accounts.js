const { Client } = require('pg');
require('dotenv').config();

async function checkAccounts() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // Total de contas
        const total = await client.query('SELECT COUNT(*) FROM ad_accounts');
        console.log(`📊 Total de contas no banco: ${total.rows[0].count}`);

        // Contas por usuário
        const byUser = await client.query(`
            SELECT u.email, COUNT(a.id) as total_contas
            FROM users u
            LEFT JOIN ad_accounts a ON u.id = a.user_id
            GROUP BY u.id, u.email
        `);

        console.log('\n👥 Contas por usuário:');
        byUser.rows.forEach(row => {
            console.log(`  ${row.email}: ${row.total_contas} contas`);
        });

        // Contas ativas vs inativas
        const status = await client.query(`
            SELECT is_client_active, COUNT(*) as total
            FROM ad_accounts
            GROUP BY is_client_active
        `);

        console.log('\n✅ Status das contas:');
        status.rows.forEach(row => {
            const label = row.is_client_active ? 'Ativas' : 'Inativas';
            console.log(`  ${label}: ${row.total}`);
        });

        // Lista as primeiras 10 contas
        const accounts = await client.query(`
            SELECT account_name, meta_account_id, currency, is_client_active
            FROM ad_accounts
            ORDER BY account_name
            LIMIT 10
        `);

        console.log('\n📋 Primeiras 10 contas:');
        accounts.rows.forEach((acc, i) => {
            const status = acc.is_client_active ? '✅' : '❌';
            console.log(`  ${i+1}. ${status} ${acc.account_name} (${acc.meta_account_id})`);
        });

        await client.end();
    } catch (error) {
        console.error('❌ Erro:', error.message);
        await client.end();
        process.exit(1);
    }
}

checkAccounts();
