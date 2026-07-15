-- ==============================
-- Sistema de créditos IA
-- 1 crédito = 1 análise IA. Consumo controlado por endpoint.
-- ==============================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ai_credits INT NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS ai_credits_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
    ADD COLUMN IF NOT EXISTS ai_credits_monthly_limit INT NOT NULL DEFAULT 100;

CREATE TABLE IF NOT EXISTS ai_credit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,     -- 'analyze-creative', 'top-creatives', 'analyze-campaign', 'chat'
    credits_consumed INT NOT NULL DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_events_user_date
    ON ai_credit_events(user_id, created_at DESC);
