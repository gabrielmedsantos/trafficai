-- ==============================
-- TrafficAI — Template editável da mensagem WhatsApp diária
-- NULL = usa o template default hardcoded no service (retrocompat).
-- Quando preenchido, o service renderiza substituindo placeholders
-- tipo {client_name}, {today_spend}, {month_leads} etc.
-- ==============================

ALTER TABLE report_settings
  ADD COLUMN IF NOT EXISTS daily_whatsapp_template TEXT;

-- Comentário pra ficar visível em pgAdmin/quem olhar schema
COMMENT ON COLUMN report_settings.daily_whatsapp_template IS
  'Template customizável da mensagem WhatsApp diária. NULL = template default. Suporta placeholders: {client_name}, {greeting}, {today_label}, {today_spend}, {today_impressions}, {today_leads}, {today_cpl}, {today_action_label}, {last7_label}, {last7_spend}, {last7_impressions}, {last7_leads}, {last7_cpl}, {last7_action_label}, {month_label}, {month_spend}, {month_impressions}, {month_leads}, {month_cpl}, {month_action_label}, {active_ads}';
