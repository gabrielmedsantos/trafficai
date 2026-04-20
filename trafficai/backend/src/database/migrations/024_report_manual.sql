-- ==============================
-- TrafficAI — Relatórios manuais (CSV/texto)
-- Permite gerar relatório para cliente sem conta Meta conectada:
--   - account_id vira nullable
--   - raw_insights armazena o input bruto (CSV/texto) para auditoria
-- ==============================

ALTER TABLE client_reports
  ALTER COLUMN account_id DROP NOT NULL;

-- source do relatório: 'meta_sync' (padrão) ou 'manual_csv' / 'manual_text'
ALTER TABLE client_reports
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'meta_sync';
