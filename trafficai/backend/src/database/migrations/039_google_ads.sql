-- ==============================
-- Google Ads Integration
-- Estrutura preparada. Ativação depende de Developer Token Basic Access
-- aprovado + OAuth2 refresh_token (ver google ads/mcp/README.md).
-- ==============================

CREATE TABLE IF NOT EXISTS google_ads_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id VARCHAR(20) NOT NULL,               -- ID da conta Google Ads (sem hífens)
    account_name VARCHAR(255) NOT NULL,
    manager_customer_id VARCHAR(20),                -- ID MCC (opcional)
    currency VARCHAR(10) DEFAULT 'BRL',
    time_zone VARCHAR(50),
    is_client_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, customer_id)
);

CREATE TABLE IF NOT EXISTS google_ads_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES google_ads_accounts(id) ON DELETE CASCADE,
    google_campaign_id VARCHAR(30) NOT NULL,
    name VARCHAR(500) NOT NULL,
    status VARCHAR(30),                             -- ENABLED|PAUSED|REMOVED
    advertising_channel_type VARCHAR(30),           -- SEARCH|DISPLAY|VIDEO|SHOPPING|PERFORMANCE_MAX
    daily_budget_micros BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, google_campaign_id)
);

CREATE TABLE IF NOT EXISTS google_ads_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES google_ads_campaigns(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    impressions BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    cost_micros BIGINT NOT NULL DEFAULT 0,
    conversions NUMERIC(12, 2) NOT NULL DEFAULT 0,
    conversion_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    UNIQUE(campaign_id, date)
);

-- Credenciais OAuth por user (armazenadas fora de env pra suportar multi-tenant)
CREATE TABLE IF NOT EXISTS google_ads_credentials (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    developer_token TEXT,
    login_customer_id VARCHAR(20),
    refresh_token TEXT,
    client_id TEXT,
    client_secret TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
