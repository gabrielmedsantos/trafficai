-- Migration 028: Behavior Tracking (Heatmaps & Scroll Depth)
-- Adiciona tabelas para capturar cliques com coordenadas e profundidade de scroll
-- Permite gerar mapas de calor e análise de engajamento estilo Microsoft Clarity

-- Tabela de cliques com coordenadas (para heatmaps)
CREATE TABLE IF NOT EXISTS tracking_behavior_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    session_id VARCHAR(64) NOT NULL,
    url TEXT NOT NULL,
    x_pct SMALLINT NOT NULL CHECK (x_pct >= 0 AND x_pct <= 100),
    y_pct SMALLINT NOT NULL CHECK (y_pct >= 0 AND y_pct <= 100),
    selector VARCHAR(255),
    element_text VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para queries de heatmap (agregação por URL + tempo)
CREATE INDEX IF NOT EXISTS idx_behavior_clicks_source_url_time
    ON tracking_behavior_clicks(source_id, url, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_clicks_session
    ON tracking_behavior_clicks(session_id);

-- Tabela de profundidade de scroll (para análise de drop-off)
CREATE TABLE IF NOT EXISTS tracking_behavior_scroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    session_id VARCHAR(64) NOT NULL,
    url TEXT NOT NULL,
    max_depth SMALLINT NOT NULL CHECK (max_depth >= 0 AND max_depth <= 100),
    time_on_page INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_id, session_id, url)
);

-- Índices para queries de scroll analysis
CREATE INDEX IF NOT EXISTS idx_behavior_scroll_source_url
    ON tracking_behavior_scroll(source_id, url, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_scroll_depth
    ON tracking_behavior_scroll(source_id, url, max_depth);

-- Comentário explicativo
COMMENT ON TABLE tracking_behavior_clicks IS 'Cliques com coordenadas X/Y para geração de heatmaps';
COMMENT ON TABLE tracking_behavior_scroll IS 'Profundidade máxima de scroll por sessão/URL para análise de drop-off';