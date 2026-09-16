-- Central de Diagnóstico — trilha unificada de falhas/avisos do Tracking
-- (envio Meta, sync de CRM, motor de regras, webhooks) que hoje só existiam
-- espalhadas em logger.warn. Dá visibilidade operacional: "o que deu errado
-- hoje" numa tela só, em vez de precisar vasculhar log de servidor.

CREATE TABLE IF NOT EXISTS tracking_diagnostic_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_id UUID REFERENCES tracking_sources(id) ON DELETE CASCADE,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    event_type VARCHAR(80) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    error_code VARCHAR(120),
    summary_payload JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diag_events_user ON tracking_diagnostic_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_diag_events_source ON tracking_diagnostic_events(source_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_diag_events_severity ON tracking_diagnostic_events(user_id, severity, occurred_at DESC);
