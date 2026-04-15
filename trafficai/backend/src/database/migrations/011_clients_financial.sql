-- ==============================
-- TrafficAI — Clientes & Financeiro
-- ==============================

-- ==============================
-- CLIENTS
-- ==============================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  status VARCHAR(50) DEFAULT 'ativo',  -- ativo, inativo, prospecto, churned
  plan VARCHAR(100),
  monthly_value NUMERIC(12,2) DEFAULT 0,
  contract_start DATE,
  contract_end DATE,
  notes TEXT,
  avatar_color VARCHAR(20) DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- Link clients to ad_accounts (optional)
CREATE TABLE IF NOT EXISTS client_ad_accounts (
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES ad_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, ad_account_id)
);

-- ==============================
-- FINANCIAL ACCOUNTS
-- ==============================
CREATE TABLE IF NOT EXISTS financial_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'checking', -- checking, savings, cash
  balance NUMERIC(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'BRL',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_user ON financial_accounts(user_id);

-- ==============================
-- TRANSACTIONS
-- ==============================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL, -- income, expense
  category VARCHAR(100),
  description VARCHAR(500) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, pending, cancelled
  payment_method VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- ==============================
-- RECURRING TRANSACTIONS
-- ==============================
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL, -- income, expense
  category VARCHAR(100),
  description VARCHAR(500) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  frequency VARCHAR(50) NOT NULL, -- monthly, weekly, yearly, quarterly
  day_of_month INTEGER, -- 1-31 for monthly
  next_due DATE,
  active BOOLEAN DEFAULT true,
  payment_method VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_transactions(user_id);
