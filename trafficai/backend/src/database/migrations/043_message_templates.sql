-- ==============================
-- Biblioteca de Templates de mensagens
-- Categorias: daily_report | weekly_report | monthly_report | billing_alert
-- Canais: meta | google | generic
-- ==============================

CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL DEFAULT 'meta',      -- 'meta' | 'google' | 'generic'
    category VARCHAR(30) NOT NULL,                    -- 'daily_report' | 'weekly_report' | 'monthly_report' | 'billing_alert'
    name VARCHAR(120) NOT NULL,
    description TEXT,
    body TEXT NOT NULL,                               -- template com {{vars}}
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_user_cat ON message_templates(user_id, category);
