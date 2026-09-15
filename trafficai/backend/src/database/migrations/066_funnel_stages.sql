-- Funil configurável por fonte de tracking — antes os 5 estágios
-- (Lead/Contact/Schedule/Purchase/Lead_Desqualificado) eram fixos no frontend
-- (tracking/page.tsx, tab CRM). Agora viram dados editáveis: label, ordem,
-- visibilidade e valor/moeda padrão por estágio.

CREATE TABLE IF NOT EXISTS tracking_funnel_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    label VARCHAR(120) NOT NULL,
    position INT NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    default_value NUMERIC(12,2),
    default_currency VARCHAR(3),
    default_content_name VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_id, event_name)
);

CREATE INDEX IF NOT EXISTS idx_funnel_stages_source ON tracking_funnel_stages(source_id, position);
