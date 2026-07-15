-- ==============================
-- TrafficAI — Tracking Reliability
-- Suporte a:
--   - retry de eventos falhos (retry_count, last_retry_at)
--   - persistência de gclid no evento (Google Ads attribution)
--   - session_id pra ligar clicks ↔ events do mesmo visitante
-- ==============================

-- 1) Retry em tracking_events
ALTER TABLE tracking_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gclid VARCHAR(255),
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(64);

-- Índice pro worker de retry: pega rapidamente os "failed" elegiveis.
-- meta_status='failed' AND retry_count < 3 AND created_at no último 24h
CREATE INDEX IF NOT EXISTS idx_tracking_events_retry_pending
  ON tracking_events(source_id, created_at)
  WHERE meta_status = 'failed' AND retry_count < 3;

-- Índice opcional pra consultas por sessão
CREATE INDEX IF NOT EXISTS idx_tracking_events_session
  ON tracking_events(session_id)
  WHERE session_id IS NOT NULL;

-- 2) Session em tracking_clicks pra atribuição lead↔clique
ALTER TABLE tracking_clicks
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_tracking_clicks_session
  ON tracking_clicks(session_id)
  WHERE session_id IS NOT NULL;
