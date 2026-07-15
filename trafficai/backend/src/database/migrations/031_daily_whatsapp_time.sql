-- ==============================
-- Daily WhatsApp report — horário configurável por conta (HH:MM em UTC)
-- ==============================

ALTER TABLE report_settings
  ADD COLUMN IF NOT EXISTS daily_whatsapp_time VARCHAR(5) NOT NULL DEFAULT '11:15',
  ADD COLUMN IF NOT EXISTS daily_whatsapp_last_sent_date DATE;

-- 11:15 UTC ≈ 08:15 BRT (UTC-3)

CREATE INDEX IF NOT EXISTS idx_report_settings_daily_time
  ON report_settings (daily_whatsapp_time)
  WHERE daily_whatsapp_enabled = true;
