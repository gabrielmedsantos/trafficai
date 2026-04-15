-- ==============================
-- TrafficAI — Client Reports
-- Relatórios automáticos por cliente (diário/semanal/mensal)
-- ==============================

CREATE TABLE client_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,

  -- Tipo e período
  type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Conteúdo do relatório (gerado pela IA)
  title VARCHAR(500) NOT NULL,
  summary TEXT,                    -- resumo executivo em texto
  metrics JSONB NOT NULL,          -- métricas agregadas do período
  ai_analysis TEXT,                -- análise gerada pelo Claude
  recommendations JSONB,           -- lista de recomendações
  raw_insights JSONB,              -- dados brutos dos insights

  -- Compartilhamento público (link para o cliente)
  public_token UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
  public_title VARCHAR(500),       -- título customizável para o cliente
  client_name VARCHAR(255),        -- nome do cliente para personalização
  client_email VARCHAR(255),       -- email do cliente para envio

  -- Status de envio
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed')),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  viewed_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_user ON client_reports(user_id);
CREATE INDEX idx_reports_account ON client_reports(account_id);
CREATE INDEX idx_reports_type ON client_reports(type, period_start DESC);
CREATE INDEX idx_reports_token ON client_reports(public_token);

-- Configurações de relatório por conta (quando e para quem enviar)
CREATE TABLE report_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE UNIQUE,

  client_name VARCHAR(255),
  client_email VARCHAR(255),

  -- Quais relatórios gerar/enviar
  daily_enabled BOOLEAN DEFAULT false,
  weekly_enabled BOOLEAN DEFAULT true,
  monthly_enabled BOOLEAN DEFAULT true,

  -- Auto-envio por email
  auto_send_email BOOLEAN DEFAULT false,

  -- Personalização
  agency_name VARCHAR(255) DEFAULT 'TrafficAI',
  agency_logo_url TEXT,
  custom_message TEXT,             -- mensagem personalizada no relatório

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_settings_user ON report_settings(user_id);
