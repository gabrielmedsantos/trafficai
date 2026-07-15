-- ==============================
-- Templates de relatório WhatsApp
-- ==============================

ALTER TABLE report_settings
    ADD COLUMN IF NOT EXISTS report_template VARCHAR(30) NOT NULL DEFAULT 'default';
-- valores possíveis: 'default'|'executive'|'detailed'|'whatsapp_focus'
