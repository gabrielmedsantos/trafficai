-- ==============================
-- TrafficAI — Contratos de Clientes
-- ==============================

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'fixed', -- fixed, percentage, mixed
  fixed_amount NUMERIC(12,2) DEFAULT 0,
  percentage NUMERIC(5,2) DEFAULT 0,
  percentage_base VARCHAR(200) DEFAULT 'Investimento em anúncios',
  billing_day INTEGER DEFAULT 1,
  start_date DATE,
  end_date DATE,
  status VARCHAR(50) DEFAULT 'active', -- active, paused, ended
  payment_method VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_user ON contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- Link transactions to contracts (optional)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL;
