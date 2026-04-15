-- ==============================
-- TrafficAI — Daily WhatsApp Text Report
-- ==============================

-- Adiciona flag para habilitar envio diário de texto via WhatsApp por conta
ALTER TABLE report_settings
  ADD COLUMN IF NOT EXISTS daily_whatsapp_enabled BOOLEAN DEFAULT false;
