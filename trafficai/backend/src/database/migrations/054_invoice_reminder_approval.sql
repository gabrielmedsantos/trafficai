-- ==============================
-- TrafficAI — Modo de lembrete de fatura (aprovação vs automático)
-- Por padrão, todo lembrete fica pendente de aprovação do usuário da agência
-- antes de sair pro cliente. Dá pra ligar automático pra todos (financial_settings)
-- ou por cliente específico (clients.reminder_mode, sobrescreve o padrão geral).
-- ==============================

ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS default_reminder_mode VARCHAR(20) NOT NULL DEFAULT 'approval'
    CHECK (default_reminder_mode IN ('approval', 'automatic'));

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS reminder_mode VARCHAR(20)
    CHECK (reminder_mode IS NULL OR reminder_mode IN ('approval', 'automatic'));
-- NULL = usa o padrão geral (financial_settings.default_reminder_mode)

CREATE TABLE IF NOT EXISTS pending_invoice_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_id UUID NOT NULL REFERENCES contract_billing(id) ON DELETE CASCADE,
  reminder_type VARCHAR(20) NOT NULL, -- before, due, overdue
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, dismissed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_reminders_user ON pending_invoice_reminders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_reminders_billing ON pending_invoice_reminders(billing_id, reminder_type);
