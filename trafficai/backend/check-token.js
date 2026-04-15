const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://postgres:%40Lorinho87058259@db.dnrymnhramnmqvqvpwim.supabase.co:5432/postgres' 
});

pool.query('SELECT email, access_token, meta_user_id, token_expiration FROM users WHERE email = $1', ['admin@trafficai.com'])
  .then(r => { 
    if (r.rows.length > 0) {
      const user = r.rows[0];
      console.log('========================================');
      console.log('Email:', user.email);
      console.log('Meta User ID:', user.meta_user_id || 'Não configurado');
      console.log('Token Expiration:', user.token_expiration || 'Não configurado');
      console.log('========================================');
      console.log('Access Token:');
      console.log(user.access_token || 'Nenhum token salvo');
      console.log('========================================');
    } else {
      console.log('Usuário não encontrado');
    }
    pool.end(); 
  })
  .catch(e => { console.error('Erro:', e.message); pool.end(); });
