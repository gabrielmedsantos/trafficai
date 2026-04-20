-- ==============================
-- TrafficAI — Integração CRM em tracking_sources
-- Permite conectar Kommo / RD Station / outros CRMs a uma fonte de tracking
-- para enriquecer eventos e fazer backfill de Purchase a partir de leads ganhos.
-- ==============================

ALTER TABLE tracking_sources
  ADD COLUMN IF NOT EXISTS crm_type VARCHAR(30),           -- 'kommo', 'rdstation', 'custom'
  ADD COLUMN IF NOT EXISTS crm_subdomain VARCHAR(100),      -- para Kommo: alinemeloce
  ADD COLUMN IF NOT EXISTS crm_access_token TEXT,           -- token de longa duração
  ADD COLUMN IF NOT EXISTS crm_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_backfill_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tracking_sources_crm
  ON tracking_sources(crm_type) WHERE crm_type IS NOT NULL;
