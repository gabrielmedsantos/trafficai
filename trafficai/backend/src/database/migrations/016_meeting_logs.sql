-- Meeting logs: marcar reuniões da agenda como concluídas + resumo
CREATE TABLE IF NOT EXISTS meeting_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    google_event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    event_date DATE NOT NULL,
    summary TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_logs_user ON meeting_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_logs_date ON meeting_logs(event_date);
