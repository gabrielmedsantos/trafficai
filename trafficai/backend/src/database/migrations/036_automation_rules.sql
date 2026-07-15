-- ==============================
-- Automação de status por regra (SE/ENTÃO)
-- ==============================

CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES ad_accounts(id) ON DELETE CASCADE, -- NULL = todas as contas do user
    name VARCHAR(255) NOT NULL,
    scope VARCHAR(20) NOT NULL DEFAULT 'campaign', -- 'campaign' | 'account'
    condition_metric VARCHAR(50) NOT NULL,          -- 'cpa'|'ctr'|'roas'|'spend'|'cpc'|'cpm'
    condition_operator VARCHAR(5) NOT NULL,         -- '>'|'<'|'>='|'<='
    condition_value NUMERIC(14, 4) NOT NULL,
    condition_period VARCHAR(20) NOT NULL DEFAULT 'yesterday', -- 'today'|'yesterday'|'last_3d'|'last_7d'
    action VARCHAR(30) NOT NULL,                    -- 'pause_campaign'|'enable_campaign'|'notify_only'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_hours INT NOT NULL DEFAULT 24,
    last_triggered_at TIMESTAMPTZ,
    last_evaluated_at TIMESTAMPTZ,
    trigger_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_user_active
    ON automation_rules(user_id, is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS automation_rule_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    metric_value NUMERIC(14, 4),
    action_taken VARCHAR(30),
    action_success BOOLEAN,
    action_error TEXT,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rule_events_rule
    ON automation_rule_events(rule_id, triggered_at DESC);
