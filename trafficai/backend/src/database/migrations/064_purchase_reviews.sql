-- Fila de revisão pra Purchase detectado por mensagem de WhatsApp.
-- Casos limpos continuam disparando na hora pra Meta (auditados aqui com
-- status='sent'); casos ambíguos ficam 'pending' até alguém aprovar/rejeitar
-- pelo dashboard — nunca manda um valor incerto pra Meta sem confirmação.

CREATE TABLE IF NOT EXISTS tracking_purchase_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    whatsapp_lead_id UUID REFERENCES tracking_whatsapp_leads(id) ON DELETE SET NULL,
    phone VARCHAR(32) NOT NULL,
    message_text TEXT,
    parsed_order_id VARCHAR(64),
    parsed_value NUMERIC(12,2),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'rejected', 'duplicate', 'failed')),
    reason_code VARCHAR(40),
    event_id VARCHAR(120),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_reviews_source_status
    ON tracking_purchase_reviews(source_id, status, created_at DESC);
