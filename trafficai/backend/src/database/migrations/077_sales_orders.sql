-- Vendas por pedido (estilo UTMify) + IDs da Meta extraídos das UTMs.
--
-- Padrão de UTM recomendado no anúncio da Meta:
--   utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}
--   &utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}
--   &utm_term={{placement}}
-- O id depois do "|" permite casar venda com o gasto da campanha/conjunto/
-- anúncio sem depender do nome (que muda quando o gestor renomeia).

-- nome|id de conjunto/anúncio passa fácil de 100 chars
ALTER TABLE tracking_clicks ALTER COLUMN utm_source TYPE TEXT;
ALTER TABLE tracking_clicks ALTER COLUMN utm_medium TYPE TEXT;
ALTER TABLE tracking_clicks ALTER COLUMN utm_campaign TYPE TEXT;
ALTER TABLE tracking_clicks ALTER COLUMN utm_content TYPE TEXT;
ALTER TABLE tracking_clicks ALTER COLUMN utm_term TYPE TEXT;

ALTER TABLE tracking_clicks
    ADD COLUMN IF NOT EXISTS meta_campaign_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS meta_adset_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_tracking_clicks_meta_campaign ON tracking_clicks(source_id, meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;

-- Um registro por pedido da plataforma de checkout. Status muda ao longo da
-- vida do pedido (pendente → aprovado → reembolsado/chargeback) — upsert por
-- (source_id, platform, external_order_id). Só o aprovado dispara Purchase na
-- Meta; o resto alimenta o dashboard (pendentes, reembolsos, taxa de aprovação).
CREATE TABLE IF NOT EXISTS tracking_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    platform VARCHAR(30) NOT NULL,
    external_order_id VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('approved', 'pending', 'refused', 'refunded', 'chargeback', 'canceled')),
    payment_method VARCHAR(20) CHECK (payment_method IN ('pix', 'credit_card', 'boleto', 'other')),
    product_id VARCHAR(120),
    product_name VARCHAR(255),
    gross_value NUMERIC(12,2),
    net_value NUMERIC(12,2),
    currency VARCHAR(3) DEFAULT 'BRL',
    customer_name VARCHAR(255),
    customer_email_hash VARCHAR(64),
    customer_phone_hash VARCHAR(64),
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    sck VARCHAR(255),
    meta_campaign_id VARCHAR(64),
    meta_adset_id VARCHAR(64),
    meta_ad_id VARCHAR(64),
    click_id UUID REFERENCES tracking_clicks(id) ON DELETE SET NULL,
    purchase_event_id VARCHAR(255),
    order_created_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    raw JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_id, platform, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_tracking_orders_source_date ON tracking_orders(source_id, COALESCE(approved_at, order_created_at, created_at) DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_orders_campaign ON tracking_orders(source_id, meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;
