-- ==============================
-- TrafficAI — Liga uma integração WhatsApp (Evolution) da aba Comercial a
-- uma fonte de Tracking, pra capturar atribuição de anúncio (ctwa_clid) na
-- MESMA conexão que já atende o inbox do CRM — sem exigir um segundo número/
-- instância só pra tracking. O webhook Evolution (commercial/integrations/
-- evolution/webhook.ts) passa a também chamar processWhatsAppMessage()
-- quando essa coluna está preenchida, além do que já fazia (persistir a
-- mensagem no inbox).
-- ==============================

ALTER TABLE comm_integrations
    ADD COLUMN IF NOT EXISTS tracking_source_id UUID REFERENCES tracking_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comm_integrations_tracking_source
    ON comm_integrations(tracking_source_id) WHERE tracking_source_id IS NOT NULL;
