-- ==============================
-- TrafficAI — Configurações do módulo Financeiro
-- Por enquanto só controla o liga/desliga dos lembretes automáticos de
-- fatura (WhatsApp). Um registro por user.
-- ==============================

CREATE TABLE IF NOT EXISTS financial_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  invoice_reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
