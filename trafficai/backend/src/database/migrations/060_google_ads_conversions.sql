-- ==============================
-- TrafficAI — Google Ads Conversion Upload
-- gclid já era capturado pelo pixel e gravado em tracking_clicks/tracking_events,
-- mas nunca ia pra lugar nenhum (só virava metadado informativo no custom_data
-- enviado à Meta). Essa migration prepara o schema pra realmente subir a
-- conversão pro Google Ads via Click Conversion Upload (googleads.googleapis.com).
--
-- Aditivo e opt-in: tracking_sources.google_ads_account_id fica NULL em toda
-- fonte existente — nenhuma fonte tenta enviar pro Google até alguém
-- explicitamente linkar uma conta e mapear os eventos em
-- tracking_google_conversion_actions.
-- ==============================

-- 1) Liga uma fonte de tracking a uma conta Google Ads já sincronizada.
--    Nullable de propósito — é o gate de retrocompatibilidade.
ALTER TABLE tracking_sources
    ADD COLUMN IF NOT EXISTS google_ads_account_id UUID REFERENCES google_ads_accounts(id) ON DELETE SET NULL;

-- 2) Mapa evento local -> ação de conversão do Google Ads. Um evento (ex: Lead,
--    Purchase) pode não ter mapeamento — nesse caso simplesmente não é
--    enviado pro Google (fica só no Meta).
CREATE TABLE IF NOT EXISTS tracking_google_conversion_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    conversion_action_resource_name VARCHAR(255) NOT NULL, -- customers/123/conversionActions/456
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tracking_source_id, event_name)
);

-- 3) tracking_events — status do envio pro Google, espelhando as colunas que
--    já existem pro Meta (meta_status/meta_response/meta_error/retry_count).
--    wbraid/gbraid ficam aqui (gclid já existe desde 033_tracking_reliability.sql).
ALTER TABLE tracking_events
    ADD COLUMN IF NOT EXISTS wbraid VARCHAR(255),
    ADD COLUMN IF NOT EXISTS gbraid VARCHAR(255),
    ADD COLUMN IF NOT EXISTS google_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS google_response JSONB,
    ADD COLUMN IF NOT EXISTS google_error TEXT,
    ADD COLUMN IF NOT EXISTS google_conversion_action_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS google_retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS google_last_retry_at TIMESTAMPTZ;

-- Índice pro worker de retry do Google, mesmo padrão do índice Meta existente
-- (idx_tracking_events_retry_pending).
CREATE INDEX IF NOT EXISTS idx_tracking_events_google_retry_pending
    ON tracking_events(source_id, created_at)
    WHERE google_status = 'failed' AND google_retry_count < 3;
