import { pool } from './src/database/connection';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function resetAdminPassword() {
    console.log('🔐 Resetando senha do admin...');

    const email = 'admin@trafficai.com';
    const newPassword = 'admin123456';

    try {
        // Hash da nova senha
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Atualiza a senha do usuário
        const result = await pool.query(
            `UPDATE users
             SET password_hash = $1, updated_at = NOW()
             WHERE email = $2
             RETURNING id, email, name`,
            [passwordHash, email]
        );

        if (result.rows.length === 0) {
            console.log('❌ Usuário não encontrado!');
            await pool.end();
            return;
        }

        console.log('✅ Senha resetada com sucesso!');
        console.log('');
        console.log('📋 Novas credenciais:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email:', email);
        console.log('🔑 Senha:', newPassword);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('🌐 Acesse: http://localhost:3000');

        await pool.end();
    } catch (error: any) {
        console.error('❌ Erro ao resetar senha:', error.message);
        await pool.end();
        process.exit(1);
    }
}

resetAdminPassword();
