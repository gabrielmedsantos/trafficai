-- ==============================
-- TrafficAI — Descoberta de Pixel via Cadastro Incorporado (Embedded Signup)
-- O mesmo token de Ads (ads_management/business_management) já obtido no
-- login também enxerga os Pixels do Business Manager — só não tem endpoint
-- "listar pixels do usuário" direto, precisa ir por business_id
-- (GET /{business_id}/owned_pixels). Por isso ad_accounts ganha business_id
-- (pra saber de qual Business cada conta veio) e uma tabela nova guarda os
-- pixels descobertos, também por business, pra filtrar/auto-selecionar o
-- pixel certo com base na conta de anúncio escolhida.
-- ==============================

ALTER TABLE ad_accounts
    ADD COLUMN IF NOT EXISTS business_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_ad_accounts_business ON ad_accounts(business_id) WHERE business_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS meta_pixels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id VARCHAR(255),
    business_name VARCHAR(500),
    pixel_id VARCHAR(255) NOT NULL,
    pixel_name VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pixel_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_pixels_user ON meta_pixels(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_pixels_business ON meta_pixels(business_id) WHERE business_id IS NOT NULL;
