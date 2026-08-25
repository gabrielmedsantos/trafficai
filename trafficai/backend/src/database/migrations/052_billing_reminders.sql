-- ==============================
-- TrafficAI — Lembretes de vencimento de fatura (estilo Asaas)
-- Log de envios pra não duplicar aviso (before/due) e controlar o
-- intervalo de repetição do aviso de atraso (overdue).
-- ==============================

CREATE TABLE IF NOT EXISTS billing_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_id UUID NOT NULL REFERENCES contract_billing(id) ON DELETE CASCADE,
  reminder_type VARCHAR(20) NOT NULL, -- 'before' (D-3), 'due' (D0), 'overdue' (repete a cada N dias)
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_reminders_billing ON billing_reminders(billing_id, reminder_type, sent_at);
