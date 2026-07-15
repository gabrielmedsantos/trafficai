-- ==============================
-- Alertas de saldo baixo por conta
-- ==============================

ALTER TABLE ad_accounts
    ADD COLUMN IF NOT EXISTS balance_alert_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS balance_alert_threshold NUMERIC(12, 2), -- disparar quando saldo <= threshold
    ADD COLUMN IF NOT EXISTS balance_alert_phone VARCHAR(30),         -- WhatsApp destino do alerta
    ADD COLUMN IF NOT EXISTS balance_alert_last_sent_at TIMESTAMPTZ;  -- pra dedup diário

CREATE INDEX IF NOT EXISTS idx_ad_accounts_balance_alert_active
    ON ad_accounts(user_id) WHERE balance_alert_enabled = TRUE;
