-- ==============================
-- Toggles por conta pro tipo de relatório (padrão AdsDaily)
-- daily_whatsapp_enabled já existe. Adiciona semanal/mensal/alerta cobrança.
-- ==============================

ALTER TABLE report_settings
    ADD COLUMN IF NOT EXISTS weekly_report_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS weekly_report_day INT NOT NULL DEFAULT 1,        -- 0=domingo, 1=segunda, etc.
    ADD COLUMN IF NOT EXISTS weekly_report_last_sent DATE,
    ADD COLUMN IF NOT EXISTS monthly_report_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS monthly_report_day INT NOT NULL DEFAULT 1,       -- dia do mês (1-28)
    ADD COLUMN IF NOT EXISTS monthly_report_last_sent DATE,
    ADD COLUMN IF NOT EXISTS billing_alert_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS billing_alert_min_interval_hours INT NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS billing_alert_last_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS report_owner_phone VARCHAR(30);
