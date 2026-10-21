CREATE TABLE IF NOT EXISTS tracking_quiz_funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    slug VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    origin TEXT NOT NULL,
    steps JSONB NOT NULL,
    answer_keys JSONB NOT NULL,
    completed_step VARCHAR(80),
    checkout_step VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_id, slug)
);
CREATE TABLE IF NOT EXISTS tracking_quiz_sessions (
    id UUID PRIMARY KEY,
    funnel_id UUID NOT NULL REFERENCES tracking_quiz_funnels(id) ON DELETE CASCADE,
    write_key_hash CHAR(64) NOT NULL,
    tracking_session_id VARCHAR(100),
    attribution JSONB NOT NULL DEFAULT '{}',
    answers_encrypted TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    current_step VARCHAR(80),
    completed_at TIMESTAMPTZ,
    checkout_at TIMESTAMPTZ,
    order_id UUID REFERENCES tracking_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_sessions_funnel_date ON tracking_quiz_sessions(funnel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_sessions_tracking_id ON tracking_quiz_sessions(tracking_session_id);
CREATE TABLE IF NOT EXISTS tracking_quiz_events (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES tracking_quiz_sessions(id) ON DELETE CASCADE,
    event_id UUID NOT NULL,
    step VARCHAR(80) NOT NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('view', 'complete', 'save')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, event_id)
);
CREATE INDEX IF NOT EXISTS quiz_events_session_step ON tracking_quiz_events(session_id, step, kind);
