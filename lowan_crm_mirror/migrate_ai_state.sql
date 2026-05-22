-- ─── Fase 1: Controles de IA por lead + override global ───
BEGIN;

-- 1) Estado da IA por lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_agent_state VARCHAR(30) DEFAULT 'auto';
-- valores: 'auto' (segue config do agente) | 'paused_by_operator' | 'paused_by_takeover' | 'handed_off' | 'force_active'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_agent_paused_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_agent_paused_by UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_last_replied_at TIMESTAMP;  -- última vez que IA respondeu
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_replies_count INTEGER DEFAULT 0;  -- contador anti-loop

CREATE INDEX IF NOT EXISTS leads_ai_state_idx ON leads(ai_agent_state) WHERE ai_agent_state != 'auto';

-- 2) Override global por workspace
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ai_global_override BOOLEAN DEFAULT FALSE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ai_global_override_until TIMESTAMP;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ai_global_override_reason TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ai_global_override_by UUID;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ai_global_override_set_at TIMESTAMP;

-- 3) Auditoria de mudanças de estado
CREATE TABLE IF NOT EXISTS ai_lead_state_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL,
  workspace_id UUID NOT NULL,
  agent_id    UUID,
  prev_state  VARCHAR(30),
  new_state   VARCHAR(30) NOT NULL,
  reason      TEXT,
  actor_id    UUID,        -- user que fez a mudança (NULL se automático)
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_lead_state_log_lead_idx ON ai_lead_state_log(lead_id, created_at DESC);

COMMIT;

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='leads' AND column_name LIKE 'ai_%'
ORDER BY column_name;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='workspaces' AND column_name LIKE 'ai_%'
ORDER BY column_name;
