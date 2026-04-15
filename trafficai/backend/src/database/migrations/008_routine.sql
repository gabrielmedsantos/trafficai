-- ==============================
-- TrafficAI — Routine & Google Calendar
-- ==============================

-- Tokens do Google Calendar por usuário
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  google_email TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Agenda de revisão: quais contas revisar, em quais dias da semana
CREATE TABLE IF NOT EXISTS review_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES ad_accounts(id) ON DELETE CASCADE,
  days_of_week INTEGER[] NOT NULL DEFAULT '{2,5}', -- 1=Dom,2=Seg,3=Ter,4=Qua,5=Qui,6=Sex,7=Sab
  review_time TIME DEFAULT '09:00',
  active BOOLEAN DEFAULT true,
  sync_to_google BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tarefas de revisão individuais (instâncias geradas do schedule)
CREATE TABLE IF NOT EXISTS review_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES ad_accounts(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES review_schedule(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  google_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_user_date ON review_tasks(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_review_schedule_user ON review_schedule(user_id, active);
