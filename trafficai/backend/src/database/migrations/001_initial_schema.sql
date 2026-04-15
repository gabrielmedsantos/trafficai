-- ==============================
-- TrafficAI — Initial Database Schema
-- ==============================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================
-- USERS
-- ==============================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  meta_user_id VARCHAR(255),
  access_token TEXT,
  token_expiration TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_meta_user_id ON users(meta_user_id);

-- ==============================
-- AD ACCOUNTS
-- ==============================
CREATE TABLE ad_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meta_account_id VARCHAR(255) NOT NULL,
  account_name VARCHAR(255),
  currency VARCHAR(10) DEFAULT 'BRL',
  timezone VARCHAR(100) DEFAULT 'America/Sao_Paulo',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, meta_account_id)
);

CREATE INDEX idx_ad_accounts_user ON ad_accounts(user_id);

-- ==============================
-- CAMPAIGNS
-- ==============================
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  meta_campaign_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  objective VARCHAR(100),
  status VARCHAR(50) DEFAULT 'ACTIVE',
  daily_budget DECIMAL(12,2),
  lifetime_budget DECIMAL(12,2),
  created_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, meta_campaign_id)
);

CREATE INDEX idx_campaigns_account ON campaigns(account_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- ==============================
-- INSIGHTS HISTORY
-- ==============================
CREATE TABLE insights_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  spend DECIMAL(12,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  ctr DECIMAL(8,4) DEFAULT 0,
  cpc DECIMAL(12,4) DEFAULT 0,
  cpm DECIMAL(12,4) DEFAULT 0,
  frequency DECIMAL(8,4) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  cost_per_conversion DECIMAL(12,4) DEFAULT 0,
  roas DECIMAL(8,4) DEFAULT 0,
  actions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, date)
);

CREATE INDEX idx_insights_campaign ON insights_history(campaign_id);
CREATE INDEX idx_insights_date ON insights_history(date);
CREATE INDEX idx_insights_campaign_date ON insights_history(campaign_id, date DESC);

-- ==============================
-- AI ANALYSIS
-- ==============================
CREATE TABLE ai_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL, -- excelente, bom, alerta, critico
  analysis TEXT NOT NULL,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  recommendation TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_analysis_campaign ON ai_analysis(campaign_id);
CREATE INDEX idx_ai_analysis_created ON ai_analysis(created_at DESC);

-- ==============================
-- ALERTS
-- ==============================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  type VARCHAR(100) NOT NULL, -- cpa_spike, ctr_drop, cpm_anomaly, conversion_drop
  severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- info, warning, critical
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  metric_name VARCHAR(100),
  previous_value DECIMAL(12,4),
  current_value DECIMAL(12,4),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user ON alerts(user_id);
CREATE INDEX idx_alerts_unread ON alerts(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);

-- ==============================
-- CREATIVE ANALYSIS
-- ==============================
CREATE TABLE creative_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(500),
  file_type VARCHAR(50), -- image, video, text
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_creative_user ON creative_analysis(user_id);
