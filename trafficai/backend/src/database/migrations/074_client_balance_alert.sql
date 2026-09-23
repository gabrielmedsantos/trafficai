-- Aviso automático de saldo baixo pro CLIENTE (além do alerta interno que já
-- chega pra equipe/usuário do TrafficAI via Configurações → Notificações).
-- Reaproveita client_phone (já existente em report_settings, já aceita ID de
-- grupo xxx@g.us) como destino — não precisa de campo de telefone novo.
ALTER TABLE report_settings
    ADD COLUMN IF NOT EXISTS client_balance_alert_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS client_balance_alert_mention_all BOOLEAN NOT NULL DEFAULT FALSE;
