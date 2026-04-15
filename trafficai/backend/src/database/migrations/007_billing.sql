-- ==============================
-- TrafficAI — Billing & Balance Alerts
-- Adiciona campos de pagamento e saldo às contas de anúncios
-- ==============================

ALTER TABLE ad_accounts
  ADD COLUMN IF NOT EXISTS payment_type VARCHAR(10) CHECK (payment_type IN ('pix', 'card')),
  ADD COLUMN IF NOT EXISTS balance_alert_threshold DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS cached_balance DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS cached_account_status INTEGER,
  ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ;

-- Índice para busca eficiente de contas com alertas de saldo configurados
CREATE INDEX IF NOT EXISTS idx_ad_accounts_payment_type ON ad_accounts(user_id, payment_type)
  WHERE payment_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ad_accounts_balance_alert ON ad_accounts(user_id, balance_alert_threshold)
  WHERE balance_alert_threshold IS NOT NULL AND balance_alert_threshold > 0;
