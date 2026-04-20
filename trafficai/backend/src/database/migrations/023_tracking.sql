-- ==============================
-- TrafficAI — Sistema de rastreio de eventos (CAPI + Pixel)
-- Tabelas: tracking_sources (config por site), tracking_events (eventos),
-- tracking_clicks (fbclid/gclid/UTMs do primeiro clique).
-- ==============================

CREATE TABLE IF NOT EXISTS tracking_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES ad_accounts(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    public_token VARCHAR(64) UNIQUE NOT NULL,
    pixel_id VARCHAR(100),
    access_token TEXT,
    test_event_code VARCHAR(50),
    domain VARCHAR(255),
    webhook_secret VARCHAR(64),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_sources_user ON tracking_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sources_token ON tracking_sources(public_token);

CREATE TABLE IF NOT EXISTS tracking_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    event_id VARCHAR(100),
    event_time BIGINT NOT NULL,
    action_source VARCHAR(50) DEFAULT 'website',
    external_id VARCHAR(255),
    event_source_url TEXT,
    value NUMERIC(14, 2),
    currency VARCHAR(10),
    custom_data JSONB,
    user_data_hashed JSONB,
    client_ip VARCHAR(45),
    client_user_agent TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(10),
    zip VARCHAR(20),
    fbp VARCHAR(255),
    fbc VARCHAR(255),
    emq_score INTEGER,
    meta_status VARCHAR(20),
    meta_response JSONB,
    meta_error TEXT,
    meta_fbtrace_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_source_time ON tracking_events(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_source_name ON tracking_events(source_id, event_name);
CREATE INDEX IF NOT EXISTS idx_tracking_events_external ON tracking_events(source_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_id ON tracking_events(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tracking_clicks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    fbclid VARCHAR(255),
    gclid VARCHAR(255),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(255),
    utm_content VARCHAR(255),
    utm_term VARCHAR(255),
    landing_page TEXT,
    referrer TEXT,
    client_ip VARCHAR(45),
    client_user_agent TEXT,
    country VARCHAR(10),
    city VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_clicks_source ON tracking_clicks(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_clicks_fbclid ON tracking_clicks(fbclid) WHERE fbclid IS NOT NULL;
