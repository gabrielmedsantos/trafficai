-- ==============================
-- TrafficAI — Atribuição de campanha/conjunto/anúncio por evento
-- Hoje nenhum lead/venda rastreado fica ligado a uma campanha específica no
-- banco do Traffic AI: o ROAS/CPL/CAC calculados em tracking.controller.ts
-- somam TODO o spend da conta ad_accounts vs TODOS os leads/vendas da fonte,
-- sem granularidade por campanha ("Origem da venda"). Isso adiciona a coluna
-- campaign_id (FK real, quando a campanha já foi sincronizada) + colunas
-- meta_* (raw, sempre preenchidas quando disponíveis, mesmo sem match local)
-- em tracking_events e tracking_whatsapp_leads.
-- ==============================

ALTER TABLE tracking_events
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS meta_campaign_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_campaign_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS meta_adset_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_adset_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_ad_name VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign
    ON tracking_events(campaign_id) WHERE campaign_id IS NOT NULL;

ALTER TABLE tracking_whatsapp_leads
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS meta_campaign_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_campaign_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS meta_adset_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_adset_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS ad_name VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_whatsapp_leads_campaign
    ON tracking_whatsapp_leads(campaign_id) WHERE campaign_id IS NOT NULL;
