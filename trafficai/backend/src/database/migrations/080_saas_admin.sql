-- Admin do SaaS: separar equipe de clientes, suspender conta, cortesia e último acesso.

-- Membro do time: trabalha nos dados do dono (owner_id). NULL = conta própria
-- (o dono da Alfamax ou um cliente que assina o SaaS).
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_users_owner ON users(owner_id);

-- Conta suspensa pelo admin: login responde 403 até reativar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Último acesso (atualizado no máximo a cada poucos minutos).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Plano liberado pelo admin sem passar pelo Stripe.
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS courtesy BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS courtesy_until TIMESTAMPTZ;
