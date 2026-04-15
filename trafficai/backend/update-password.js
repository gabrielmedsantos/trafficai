const { Client } = require('pg');
require('dotenv').config();

async function updatePassword() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('🔐 Atualizando senha do admin...');

        const passwordHash = '$2a$10$ih.nMQv.z0w2MA9Tdmafh.j17FrXmS0/y6nKUm0cRKcut8H1K07ke';

        const result = await client.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = 'admin@trafficai.com' RETURNING email, name`,
            [passwordHash]
        );

        if (result.rows.length > 0) {
            console.log('✅ Senha atualizada com sucesso!');
            console.log('');
            console.log('📋 Credenciais de acesso:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📧 Email: admin@trafficai.com');
            console.log('🔑 Senha: admin123456');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } else {
            console.log('❌ Usuário não encontrado!');
        }

        await client.end();
    } catch (error) {
        console.error('❌ Erro:', error.message);
        await client.end();
        process.exit(1);
    }
}

updatePassword();
