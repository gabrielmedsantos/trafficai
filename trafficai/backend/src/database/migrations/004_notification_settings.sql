-- ==============================
-- TrafficAI — Notification Settings
-- Configurações de notificações por email e WhatsApp
-- ==============================

-- Tabela de configurações de notificação por usuário
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,

  -- Email
  email_enabled BOOLEAN DEFAULT true,
  notification_email VARCHAR(255), -- pode ser diferente do email de login
  resend_api_key TEXT, -- chave Resend do usuário (opcional, usa chave do sistema se vazio)

  -- WhatsApp (Evolution API ou Z-API)
  whatsapp_enabled BOOLEAN DEFAULT false,
  whatsapp_number VARCHAR(30), -- ex: 5511999999999
  whatsapp_provider VARCHAR(20) DEFAULT 'evolution', -- evolution | zapi
  evolution_api_url TEXT,       -- ex: https://minha-evolution.com
  evolution_api_key TEXT,
  evolution_instance VARCHAR(100),
  zapi_instance_id VARCHAR(100),
  zapi_token TEXT,
  zapi_client_token TEXT,

  -- Quais severidades notificar
  notify_critical BOOLEAN DEFAULT true,
  notify_warning BOOLEAN DEFAULT true,
  notify_info BOOLEAN DEFAULT false,

  -- Horário silencioso (não envia fora do horário comercial)
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_start TIME DEFAULT '22:00',
  quiet_end TIME DEFAULT '08:00',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_settings_user ON notification_settings(user_id);

-- Log de notificações enviadas
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL, -- email | whatsapp
  status VARCHAR(20) NOT NULL,  -- sent | failed | skipped
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_log_user ON notification_log(user_id, sent_at DESC);
