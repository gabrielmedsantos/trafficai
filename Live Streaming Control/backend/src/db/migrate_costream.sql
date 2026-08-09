-- Migrate: Co-streaming support
-- Enables two traders to broadcast simultaneously with synchronized video composition

-- ─── ALTER TABLE lives ──────────────────────────────────────────────────────────

ALTER TABLE lives
  ADD COLUMN IF NOT EXISTS mode_broadcast VARCHAR(50) DEFAULT 'single',  -- single | costream
  ADD COLUMN IF NOT EXISTS costream_trader_a_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS costream_trader_b_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hls_composition_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS composition_status VARCHAR(50) DEFAULT 'idle';  -- idle | composing | error

CREATE INDEX IF NOT EXISTS idx_lives_mode_broadcast ON lives(mode_broadcast);
CREATE INDEX IF NOT EXISTS idx_lives_costream_trader_a ON lives(costream_trader_a_id);
CREATE INDEX IF NOT EXISTS idx_lives_costream_trader_b ON lives(costream_trader_b_id);

-- ─── CREATE TABLE costream_sessions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS costream_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id UUID NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  trader_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trader_position VARCHAR(10) NOT NULL,  -- 'A' | 'B'
  access_token VARCHAR(512) NOT NULL,
  livekit_identity VARCHAR(100) NOT NULL,  -- "trader-A-{liveId}" | "trader-B-{liveId}"
  status VARCHAR(50) NOT NULL DEFAULT 'active',  -- active | paused | ended
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  mic_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cam_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_costream_sessions_live_id ON costream_sessions(live_id);
CREATE INDEX IF NOT EXISTS idx_costream_sessions_trader ON costream_sessions(live_id, trader_user_id);
CREATE INDEX IF NOT EXISTS idx_costream_sessions_active ON costream_sessions(live_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_costream_sessions_unique_trader_per_live
  ON costream_sessions(live_id, trader_user_id) WHERE status = 'active';

-- ─── CREATE TABLE costream_compositions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS costream_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id UUID NOT NULL UNIQUE REFERENCES lives(id) ON DELETE CASCADE,
  layout_type VARCHAR(50) NOT NULL DEFAULT 'split-50-50',  -- split-50-50 | pbp-main-pip | pip-main-pip
  trader_a_position VARCHAR(50) DEFAULT 'left',  -- left | top | main
  trader_b_position VARCHAR(50) DEFAULT 'right',  -- right | bottom | pip
  pip_corner VARCHAR(20),  -- top-right | bottom-left etc (if PiP)
  pip_scale FLOAT NOT NULL DEFAULT 0.25,  -- 0.1..1.0
  bg_color VARCHAR(7) DEFAULT '#000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_costream_comp_live ON costream_compositions(live_id);
