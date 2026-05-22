-- scheduled_messages: mensagens de chat agendadas para envio futuro
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  lead_id           UUID NOT NULL,
  operator_id       UUID NOT NULL,
  operator_name     TEXT,
  connection_id     UUID,
  content           TEXT NOT NULL,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  sent_at           TIMESTAMPTZ,
  sent_message_id   UUID,
  error_message     TEXT,
  attempts          INT NOT NULL DEFAULT 0,
  cancelled_by_id   UUID,
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_dispatch
  ON scheduled_messages (scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_lead
  ON scheduled_messages (lead_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_workspace
  ON scheduled_messages (workspace_id, status);
