-- Conta Comercial do WhatsApp (WABA) + dataset de CAPI dela, por fonte de
-- tracking. Eventos business_messaging (Click-to-WhatsApp) devem ir pro
-- dataset da PRÓPRIA conta do WhatsApp (obtido via POST /{waba_id}/dataset),
-- não pro pixel genérico de anúncios — e o user_data deve levar
-- whatsapp_business_account_id, NUNCA page_id junto (confirmado ao vivo:
-- a Meta rejeita com error_subcode 2804131 "nenhuma Página associada ao
-- conjunto de dados" quando page_id vem junto, mesmo o dataset sendo o certo
-- e a Página estando no mesmo Business Manager da conta do WhatsApp).
ALTER TABLE tracking_sources
    ADD COLUMN IF NOT EXISTS whatsapp_business_account_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS whatsapp_dataset_id VARCHAR(50);
