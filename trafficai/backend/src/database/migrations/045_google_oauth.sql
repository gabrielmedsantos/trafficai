-- ==============================
-- Google OAuth Credentials (Drive + Calendar)
-- Reutiliza mesmo client_id/secret do Google Ads, adiciona escopos novos.
-- ==============================

CREATE TABLE IF NOT EXISTS google_oauth_credentials (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    google_email TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ao gerar PDF, referenciar o file_id do Drive pra reusar (não subir dupla)
ALTER TABLE report_pdf_snapshots
    ADD COLUMN IF NOT EXISTS drive_file_id TEXT,
    ADD COLUMN IF NOT EXISTS drive_uploaded_at TIMESTAMPTZ;

-- Calendar events sincronizados
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    google_event_id TEXT,             -- pra dedupe/sync com Google
    title VARCHAR(500) NOT NULL,
    description TEXT,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    meet_link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start ON calendar_events(user_id, start_at DESC);
