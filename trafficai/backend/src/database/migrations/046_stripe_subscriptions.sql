-- ==============================
-- TrafficAI SaaS — assinaturas Stripe
-- 4 planos: starter, pro, agency, elite
-- ==============================

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    -- Stripe references
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_price_id TEXT,

    -- Plan + status
    plan VARCHAR(20) NOT NULL DEFAULT 'trial'
        CHECK (plan IN ('trial', 'starter', 'pro', 'agency', 'elite')),
    status VARCHAR(30) NOT NULL DEFAULT 'trialing'
        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')),

    -- Períodos
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,

    -- Limites cachados (do plano) — atualiza no webhook
    max_clients INT NOT NULL DEFAULT 3,           -- trial default: 3 clientes
    max_seats INT NOT NULL DEFAULT 1,
    monthly_ai_credits INT NOT NULL DEFAULT 20,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subs_customer ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON user_subscriptions(status);

-- Uso de créditos IA por mês (reseta mensalmente conforme current_period_start)
CREATE TABLE IF NOT EXISTS ai_credit_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,       -- primeiro dia do ciclo de billing
    credits_used INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_user ON ai_credit_usage(user_id, period_start DESC);

-- Webhook events (idempotência — evita processar mesmo evento 2x)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id TEXT PRIMARY KEY,               -- evt.id da Stripe
    type VARCHAR(80) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_webhook_events(type, processed_at DESC);

-- Cria assinatura trial pra todos os users existentes (retroativo)
INSERT INTO user_subscriptions (user_id, plan, status, trial_ends_at, max_clients, max_seats, monthly_ai_credits)
SELECT u.id, 'trial', 'trialing', NOW() + INTERVAL '7 days', 3, 1, 20
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions s WHERE s.user_id = u.id);
