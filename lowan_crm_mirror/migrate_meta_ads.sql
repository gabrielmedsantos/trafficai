-- ─── Meta Ads (tráfego pago) ─────────────────────────────────────────────
BEGIN;

-- 1) Conexões da conta de ads (per workspace)
CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id   VARCHAR(50) NOT NULL,        -- formato "act_123456789"
  account_name    VARCHAR(255),                -- nome amigável
  business_id     VARCHAR(50),
  currency        VARCHAR(10) DEFAULT 'BRL',
  timezone_name   VARCHAR(50),
  access_token_enc TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_sync_at    TIMESTAMP,
  last_sync_status VARCHAR(20),                 -- success | failed | running
  last_sync_error TEXT,
  created_by_id   UUID,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_ad_accounts_ws_acc_idx
  ON meta_ad_accounts(workspace_id, ad_account_id);
CREATE INDEX IF NOT EXISTS meta_ad_accounts_ws_idx
  ON meta_ad_accounts(workspace_id);

-- 2) Cache de campanhas
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL,
  meta_campaign_id  VARCHAR(50) NOT NULL,
  name              VARCHAR(500) NOT NULL,
  objective         VARCHAR(100),
  status            VARCHAR(50),
  daily_budget_cents BIGINT,
  lifetime_budget_cents BIGINT,
  start_time        TIMESTAMP,
  stop_time         TIMESTAMP,
  raw               JSONB,
  fetched_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_campaigns_acc_meta_idx
  ON meta_campaigns(account_id, meta_campaign_id);
CREATE INDEX IF NOT EXISTS meta_campaigns_workspace_idx
  ON meta_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS meta_campaigns_name_idx
  ON meta_campaigns(workspace_id, lower(name));

-- 3) Insights diários (campaign-level)
CREATE TABLE IF NOT EXISTS meta_insights_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL,
  meta_campaign_id VARCHAR(50),
  campaign_name   VARCHAR(500),
  date_start      DATE NOT NULL,
  spend_cents     BIGINT NOT NULL DEFAULT 0,
  impressions     BIGINT NOT NULL DEFAULT 0,
  clicks          BIGINT NOT NULL DEFAULT 0,
  reach           BIGINT,
  ctr             NUMERIC(8,4),
  cpc_cents       BIGINT,
  cpm_cents       BIGINT,
  meta_leads      INTEGER,             -- leads via custom event "Lead" da Meta
  conversions     INTEGER,
  raw             JSONB,
  fetched_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_insights_unique_idx
  ON meta_insights_daily(account_id, meta_campaign_id, date_start);
CREATE INDEX IF NOT EXISTS meta_insights_ws_date_idx
  ON meta_insights_daily(workspace_id, date_start DESC);

COMMIT;

-- Verificação
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'meta_%' ORDER BY table_name;
