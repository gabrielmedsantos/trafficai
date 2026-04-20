-- ==============================
-- TrafficAI — WhatsApp Click-to-Message Lead Tracking
-- Captura o ctwa_clid (Click-to-WhatsApp Click ID) quando o lead chega via
-- anúncio WhatsApp. Esse ID é o equivalente do fbclid pra Meta atribuir
-- a conversação (e posterior venda) ao clique específico do anúncio.
-- ==============================

CREATE TABLE IF NOT EXISTS tracking_whatsapp_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,

    -- Identificação do lead
    phone VARCHAR(30) NOT NULL,
    name VARCHAR(255),

    -- Atribuição do anúncio
    ctwa_clid TEXT,            -- Click-to-WhatsApp Click ID (chave mestra)
    ad_source_id VARCHAR(50),   -- ID do anúncio Meta
    ad_source_url TEXT,         -- URL da landing/post
    ad_title TEXT,              -- Título do anúncio (CTA)
    ad_thumbnail_url TEXT,

    -- Conteúdo da primeira mensagem
    message_text TEXT,

    -- Metadados Meta (resolvidos via /v20.0/{ad_id}?fields=tracking_specs)
    pixel_id VARCHAR(50),
    page_id VARCHAR(50),

    -- Conexão com Evolution API
    instance_name VARCHAR(100),
    raw_payload JSONB,

    -- Evento enviado pra Meta
    lead_event_id VARCHAR(100),
    lead_meta_status VARCHAR(20),
    lead_meta_error TEXT,

    -- Conversão posterior (via Kommo)
    purchase_event_id VARCHAR(100),
    purchase_value NUMERIC(12, 2),
    purchase_at TIMESTAMPTZ,
    kommo_lead_id VARCHAR(50),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(source_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_leads_source ON tracking_whatsapp_leads(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_leads_phone ON tracking_whatsapp_leads(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_leads_ctwa ON tracking_whatsapp_leads(ctwa_clid) WHERE ctwa_clid IS NOT NULL;

-- Adiciona ctwa_clid em tracking_events pra correlação rápida no histórico
ALTER TABLE tracking_events
    ADD COLUMN IF NOT EXISTS ctwa_clid TEXT,
    ADD COLUMN IF NOT EXISTS messaging_channel VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_tracking_events_ctwa
    ON tracking_events(ctwa_clid) WHERE ctwa_clid IS NOT NULL;
