-- Fluxos de automação
CREATE TABLE IF NOT EXISTS flows (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'DRAFT',
  trigger_type      TEXT,
  trigger_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
  nodes             JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges             JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_id     UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flows_workspace     ON flows (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_flows_trigger_active ON flows (workspace_id, trigger_type) WHERE status = 'ACTIVE';

-- Execuções em andamento / histórico
CREATE TABLE IF NOT EXISTS flow_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  flow_id           UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  lead_id           UUID,
  contact_id        UUID,
  status            TEXT NOT NULL DEFAULT 'running',
  current_node_id   TEXT,
  resume_at         TIMESTAMPTZ,
  context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_runs_resume    ON flow_runs (resume_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_flow_runs_lead      ON flow_runs (lead_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_runs_flow      ON flow_runs (flow_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_runs_workspace ON flow_runs (workspace_id, status);
