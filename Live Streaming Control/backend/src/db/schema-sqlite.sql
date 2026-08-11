-- Live Streaming Control — Database Schema (SQLite)
-- SQLite 3.35+ (no FOREIGN KEYS: PRAGMA foreign_keys = ON required)

-- ─── Tenants ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT         PRIMARY KEY,
  name       TEXT         NOT NULL,
  slug       TEXT         UNIQUE NOT NULL,
  plan       TEXT         NOT NULL DEFAULT 'free',  -- free | starter | pro | business
  status     TEXT         NOT NULL DEFAULT 'active', -- active | suspended | deleted
  created_at TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO tenants (id, name, slug, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default', 'pro', 'active');

-- ─── Plans ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id           TEXT         PRIMARY KEY,
  name         TEXT         UNIQUE NOT NULL,
  max_lives    INTEGER      NOT NULL DEFAULT 5,    -- -1 = unlimited
  max_viewers  INTEGER      NOT NULL DEFAULT 200,
  max_leads    INTEGER      NOT NULL DEFAULT 1000,
  price_brl    REAL         NOT NULL DEFAULT 0,
  created_at   TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO plans (id, name, max_lives, max_viewers, max_leads, price_brl) VALUES
  (lower(hex(randomblob(16))), 'free',     3,   100,    500,   0),
  (lower(hex(randomblob(16))), 'starter',  10,  500,   5000,  97),
  (lower(hex(randomblob(16))), 'pro',      50,  2000, 50000, 297),
  (lower(hex(randomblob(16))), 'business', -1,   -1,     -1, 797);

-- ─── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  avatar_url    TEXT,
  role          TEXT        NOT NULL DEFAULT 'user',  -- user | admin | super_admin
  plan          TEXT        NOT NULL DEFAULT 'free',  -- free | starter | pro | business
  tenant_id     TEXT        REFERENCES tenants(id) ON DELETE CASCADE,
  created_at    TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Lives ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lives (
  id                    TEXT        PRIMARY KEY,
  user_id               TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id             TEXT        REFERENCES tenants(id) ON DELETE CASCADE,
  short_id              TEXT        UNIQUE,
  title                 TEXT        NOT NULL,
  description           TEXT,
  stream_key            TEXT        UNIQUE NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'waiting', -- waiting | live | ended
  mode                  TEXT        NOT NULL DEFAULT 'obs',     -- obs | replay
  replay_url            TEXT,
  -- Viewer simulation
  fake_viewers_min      INTEGER     NOT NULL DEFAULT 0,
  fake_viewers_max      INTEGER     NOT NULL DEFAULT 0,
  fake_viewers_interval INTEGER     NOT NULL DEFAULT 5,  -- seconds
  fake_viewers_current  INTEGER     NOT NULL DEFAULT 0,
  -- CTA
  cta_message           TEXT,
  cta_url               TEXT,
  cta_triggered_at      TEXT,
  -- Co-streaming support
  mode_broadcast        TEXT        NOT NULL DEFAULT 'single',  -- single | costream
  costream_trader_a_id  TEXT        REFERENCES users(id) ON DELETE SET NULL,
  costream_trader_b_id  TEXT        REFERENCES users(id) ON DELETE SET NULL,
  hls_composition_url   TEXT,
  composition_status    TEXT        NOT NULL DEFAULT 'idle',     -- idle | composing | error
  -- Timestamps
  scheduled_at          TEXT,
  started_at            TEXT,
  ended_at              TEXT,
  created_at            TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Personas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personas (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   TEXT        REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  avatar_url  TEXT,
  is_favorite BOOLEAN     NOT NULL DEFAULT 0,
  created_at  TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Messages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT        PRIMARY KEY,
  live_id     TEXT        NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  tenant_id   TEXT        REFERENCES tenants(id),
  user_id     TEXT        REFERENCES users(id) ON DELETE SET NULL,
  persona_id  TEXT        REFERENCES personas(id) ON DELETE SET NULL,
  sender_name TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'real', -- real | fake | admin | flash
  shadow_banned BOOLEAN   NOT NULL DEFAULT 0,
  ip_address  TEXT,
  session_id  TEXT,
  created_at  TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Leads ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                      TEXT        PRIMARY KEY,
  live_id                 TEXT        NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  tenant_id               TEXT        REFERENCES tenants(id),
  name                    TEXT        NOT NULL,
  email                   TEXT        NOT NULL,
  phone                   TEXT,
  ip_address              TEXT,
  session_id              TEXT,
  lead_score              INTEGER     NOT NULL DEFAULT 0,
  total_sessions          INTEGER     NOT NULL DEFAULT 0,
  total_watch_time_seconds INTEGER    NOT NULL DEFAULT 0,
  total_messages          INTEGER     NOT NULL DEFAULT 0,
  total_cta_clicks        INTEGER     NOT NULL DEFAULT 0,
  last_live_id            TEXT        REFERENCES lives(id) ON DELETE SET NULL,
  intent_high             BOOLEAN     NOT NULL DEFAULT 0,
  converted_at            TEXT,
  status                  TEXT        NOT NULL DEFAULT 'cold',
  created_at              TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Message Queues ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_queues (
  id              TEXT        PRIMARY KEY,
  user_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id       TEXT        REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL DEFAULT 'normal', -- normal | flash
  default_delay_ms INTEGER     NOT NULL DEFAULT 3000,
  messages        TEXT        NOT NULL DEFAULT '[]',  -- JSON array as TEXT
  created_at      TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── CTA Events ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cta_events (
  id          TEXT        PRIMARY KEY,
  live_id     TEXT        NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL, -- triggered | clicked
  ip_address  TEXT,
  session_id  TEXT,
  created_at  TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Banned Words ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banned_words (
  id          INTEGER     PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   TEXT        REFERENCES tenants(id) ON DELETE CASCADE,
  word        TEXT        NOT NULL,
  UNIQUE(user_id, word)
);

-- ─── Banned Sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banned_sessions (
  id          TEXT        PRIMARY KEY,
  live_id     TEXT        NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  identifier  TEXT        NOT NULL, -- IP or session_id
  ban_type    TEXT        NOT NULL DEFAULT 'hard', -- hard | shadow
  created_at  TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(live_id, identifier)
);

-- ─── Analytics Events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id          TEXT        PRIMARY KEY,
  live_id     TEXT        NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL, -- join | leave | message | cta_click
  session_id  TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    TEXT,  -- JSON object as TEXT
  created_at  TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Costream Sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS costream_sessions (
  id TEXT PRIMARY KEY,
  live_id TEXT NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  trader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trader_position TEXT NOT NULL,  -- 'A' | 'B'
  access_token TEXT NOT NULL,
  livekit_identity TEXT NOT NULL,  -- "trader-A-{liveId}" | "trader-B-{liveId}"
  status TEXT NOT NULL DEFAULT 'active',  -- active | paused | ended
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  mic_enabled BOOLEAN NOT NULL DEFAULT 1,
  cam_enabled BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Costream Compositions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS costream_compositions (
  id TEXT PRIMARY KEY,
  live_id TEXT NOT NULL UNIQUE REFERENCES lives(id) ON DELETE CASCADE,
  layout_type TEXT NOT NULL DEFAULT 'split-50-50',  -- split-50-50 | pbp-main-pip | pip-main-pip
  trader_a_position TEXT DEFAULT 'left',  -- left | top | main
  trader_b_position TEXT DEFAULT 'right',  -- right | bottom | pip
  pip_corner TEXT,  -- top-right | bottom-left etc (if PiP)
  pip_scale REAL NOT NULL DEFAULT 0.25,  -- 0.1..1.0
  bg_color TEXT DEFAULT '#000000',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Webhooks (n8n integration) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_webhooks (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  events      TEXT        NOT NULL DEFAULT '[]',  -- JSON array as TEXT
  enabled     BOOLEAN     NOT NULL DEFAULT 1,
  secret      TEXT,
  created_at  TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_slug      ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status    ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_users_tenant      ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lives_user_id     ON lives(user_id);
CREATE INDEX IF NOT EXISTS idx_lives_tenant      ON lives(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lives_stream_key  ON lives(stream_key);
CREATE INDEX IF NOT EXISTS idx_lives_status      ON lives(status);
CREATE INDEX IF NOT EXISTS idx_lives_mode_broadcast ON lives(mode_broadcast);
CREATE INDEX IF NOT EXISTS idx_lives_costream_trader_a ON lives(costream_trader_a_id);
CREATE INDEX IF NOT EXISTS idx_lives_costream_trader_b ON lives(costream_trader_b_id);
CREATE INDEX IF NOT EXISTS idx_messages_live_id  ON messages(live_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant   ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_created  ON messages(live_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_live_id     ON leads(live_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant      ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_score       ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);
CREATE INDEX IF NOT EXISTS idx_personas_tenant   ON personas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mq_tenant         ON message_queues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_banned_words_tenant ON banned_words(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_live    ON analytics_events(live_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_banned_live       ON banned_sessions(live_id, identifier);
CREATE INDEX IF NOT EXISTS idx_costream_sessions_live_id ON costream_sessions(live_id);
CREATE INDEX IF NOT EXISTS idx_costream_sessions_trader ON costream_sessions(live_id, trader_user_id);
CREATE INDEX IF NOT EXISTS idx_costream_comp_live ON costream_compositions(live_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON lead_webhooks(user_id);
