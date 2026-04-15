-- ==============================
-- TrafficAI — Adiciona suporte a UazAPI
-- ==============================

ALTER TABLE notification_settings
ADD COLUMN uazapi_url TEXT,
ADD COLUMN uazapi_token TEXT;

-- Atualiza o default do provider para uazapi
ALTER TABLE notification_settings
ALTER COLUMN whatsapp_provider SET DEFAULT 'uazapi';
