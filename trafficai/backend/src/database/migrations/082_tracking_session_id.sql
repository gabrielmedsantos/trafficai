-- Adiciona session_id na tabela tracking_events para agrupar eventos do mesmo lead/visitante.
-- O session_id vem do cookie sck do pixel TrafficAI e permite reconstruir o histórico
-- completo de um visitante (PageView → Scroll → AddToCart → InitiateCheckout → Purchase).
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS session_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_tracking_events_session ON tracking_events(source_id, session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_events_fbp ON tracking_events(source_id, fbp) WHERE fbp IS NOT NULL;