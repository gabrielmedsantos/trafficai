-- Lowan CRM: API Keys + Outbound Webhooks
-- PostgreSQL 16+. Additive / idempotent.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── API Keys ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL,
  name           VARCHAR(120) NOT NULL,
  key_hash       VARCHAR(128) NOT NULL,
  key_prefix     VARCHAR(16)  NOT NULL,
  created_by_id  UUID,
  created_by_name VARCHAR(120),
  scopes         JSONB       NOT NULL DEFAULT '["*"]'::jsonb,
  rate_limit     INTEGER     NOT NULL DEFAULT 500,
  last_used_at   TIMESTAMPTZ,
  last_used_ip   VARCHAR(45),
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash  ON api_keys(key_hash);
CREATE INDEX        IF NOT EXISTS idx_api_keys_ws    ON api_keys(workspace_id) WHERE revoked_at IS NULL;

-- ─── Outbound Webhooks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL,
  name            VARCHAR(120) NOT NULL,
  url             TEXT        NOT NULL,
  events          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  secret          VARCHAR(128),
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  last_fired_at   TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count   INTEGER     NOT NULL DEFAULT 0,
  created_by_id   UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_ws ON outbound_webhooks(workspace_id) WHERE enabled = TRUE;

-- ─── Webhook delivery log (audit trail for debugging integrations) ──────────
CREATE TABLE IF NOT EXISTS outbound_webhook_deliveries (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id     UUID        NOT NULL REFERENCES outbound_webhooks(id) ON DELETE CASCADE,
  event          VARCHAR(80) NOT NULL,
  payload        JSONB       NOT NULL,
  status_code    INTEGER,
  response_body  TEXT,
  attempts       INTEGER     NOT NULL DEFAULT 0,
  succeeded_at   TIMESTAMPTZ,
  failed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_wh ON outbound_webhook_deliveries(webhook_id, created_at DESC);
