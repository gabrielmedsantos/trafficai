-- ==============================
-- TrafficAI — WhatsApp Reports & Send History
-- ==============================

-- Add phone field to report_settings
ALTER TABLE report_settings
  ADD COLUMN IF NOT EXISTS client_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS auto_send_whatsapp BOOLEAN DEFAULT false;

-- Add phone field to client_reports
ALTER TABLE client_reports
  ADD COLUMN IF NOT EXISTS client_phone VARCHAR(50);

-- Tabela de histórico de envios (email + whatsapp)
CREATE TABLE IF NOT EXISTS report_sends (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id   UUID NOT NULL REFERENCES client_reports(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  recipient   VARCHAR(500) NOT NULL,   -- email ou telefone
  sent_at     TIMESTAMPTZ DEFAULT NOW(),
  status      VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_report_sends_report ON report_sends(report_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_sends_user   ON report_sends(user_id, sent_at DESC);
