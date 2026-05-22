-- ─── AI Agents tables ──────────────────────────────────────────────────────
BEGIN;

-- 1) Tabela principal de agentes
CREATE TABLE IF NOT EXISTS ai_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'inactive',  -- active | inactive
  attendance_type VARCHAR(20) NOT NULL DEFAULT 'client',    -- client | internal | both
  channels        JSONB NOT NULL DEFAULT '["whatsapp"]'::jsonb,  -- ["whatsapp","telegram","chat","email"]
  system_prompt   TEXT NOT NULL,
  tone            VARCHAR(20) DEFAULT 'friendly',           -- formal | friendly | technical | custom
  max_words       INTEGER DEFAULT 150,
  guidelines      TEXT,                                     -- diretrizes (vendas / suporte / info)
  model           VARCHAR(50) NOT NULL DEFAULT 'claude-haiku-4-5',
  temperature     NUMERIC(3,2) DEFAULT 0.70,
  mode            VARCHAR(20) NOT NULL DEFAULT 'suggested', -- auto | suggested
  trigger_config  JSONB DEFAULT '{}'::jsonb,                -- {"only_when_no_operator": true, "outside_hours_only": false, ...}
  fallback_action VARCHAR(20) DEFAULT 'forward_human',      -- forward_human | send_default
  fallback_message TEXT,
  stage_filter_ids JSONB DEFAULT '[]'::jsonb,               -- só atende leads em certas etapas (vazio = todas)
  tag_filter      JSONB DEFAULT '[]'::jsonb,                -- só atende leads com certas tags
  context_messages_limit INT DEFAULT 10,                    -- quantas msgs do histórico mandar pro modelo
  total_runs      INT NOT NULL DEFAULT 0,
  total_tokens    BIGINT NOT NULL DEFAULT 0,
  created_by_id   UUID,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_agents_workspace_id_idx ON ai_agents(workspace_id);
CREATE INDEX IF NOT EXISTS ai_agents_status_idx ON ai_agents(status) WHERE status = 'active';

-- 2) Histórico de execuções (pra métricas, debug e custo)
CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL,
  lead_id         UUID,
  contact_id      UUID,
  trigger_message_id UUID,                                  -- mensagem que disparou a execução
  reply_message_id   UUID,                                  -- mensagem gerada (se enviou)
  user_text       TEXT,                                     -- texto recebido
  reply_text      TEXT,                                     -- resposta gerada
  status          VARCHAR(20) NOT NULL,                     -- success | failed | suggested | sent | discarded
  mode            VARCHAR(20) NOT NULL,                     -- auto | suggested
  prompt_tokens   INT,
  completion_tokens INT,
  total_tokens    INT,
  latency_ms      INT,
  model           VARCHAR(50),
  error_message   TEXT,
  approved_by_user_id UUID,                                 -- quem aprovou (se modo suggested)
  approved_at     TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_agent_runs_agent_id_idx ON ai_agent_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_agent_runs_workspace_idx ON ai_agent_runs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_agent_runs_lead_idx ON ai_agent_runs(lead_id, created_at DESC) WHERE lead_id IS NOT NULL;

-- 3) API key Anthropic por workspace (criptografada)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS anthropic_api_key_enc TEXT;

-- 4) Marcação em messages: qual agente gerou/sugeriu
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_ai_agent_idx ON messages(ai_agent_id) WHERE ai_agent_id IS NOT NULL;

COMMIT;

-- Verificação
SELECT 'ai_agents' AS table_name, COUNT(*) AS rows FROM ai_agents
UNION ALL SELECT 'ai_agent_runs', COUNT(*) FROM ai_agent_runs;
