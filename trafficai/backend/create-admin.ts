import { pool } from './src/database/connection';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function createAdminUser() {
    console.log('🔐 Criando usuário admin...');

    const email = 'admin@trafficai.com';
    const password = 'admin123456';
    const name = 'Admin TrafficAI';

    try {
        // Hash da senha
        const passwordHash = await bcrypt.hash(password, 10);

        // Verifica se o usuário já existe
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            console.log('⚠️  Usuário admin já existe!');
            console.log('📧 Email:', email);
            console.log('🔑 Senha:', password);
            await pool.end();
            return;
        }

        // Insere o novo usuário
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, name, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             RETURNING id, email, name`,
            [email, passwordHash, name]
        );

        console.log('✅ Usuário admin criado com sucesso!');
        console.log('');
        console.log('📋 Credenciais de acesso:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email:', email);
        console.log('🔑 Senha:', password);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('🌐 Acesse: http://localhost:3000');

        await pool.end();
    } catch (error: any) {
        console.error('❌ Erro ao criar usuário:', error.message);
        await pool.end();
        process.exit(1);
    }
}

createAdminUser();
