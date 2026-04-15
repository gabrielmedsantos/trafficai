-- Migration 017: vincular meeting_logs ao cliente
ALTER TABLE meeting_logs
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_logs_client ON meeting_logs(client_id);
