-- ==============================
-- TrafficAI — Cobrança Mensal de Contratos
-- ==============================

CREATE TABLE IF NOT EXISTS contract_billing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  reference_month DATE NOT NULL, -- primeiro dia do mês: ex. 2026-03-01
  fixed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  percentage_amount NUMERIC(12,2) DEFAULT 0, -- valor calculado da porcentagem (input manual)
  total_amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, paid, overdue
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_contract_billing_user ON contract_billing(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_billing_client ON contract_billing(client_id);
CREATE INDEX IF NOT EXISTS idx_contract_billing_month ON contract_billing(reference_month);
CREATE INDEX IF NOT EXISTS idx_contract_billing_status ON contract_billing(status);
