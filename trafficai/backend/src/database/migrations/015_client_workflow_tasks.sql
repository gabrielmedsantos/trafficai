-- ==============================
-- TrafficAI — Client Workflow Tasks
-- ==============================

CREATE TABLE IF NOT EXISTS client_workflow_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  -- types: 'analysis' | 'report' | 'checkin_wed' | 'checkin_fri'
  scheduled_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  -- status: 'pending' | 'done' | 'skipped'
  -- Analysis fields
  campaign_changes TEXT,
  -- Report fields
  report_sent BOOLEAN DEFAULT false,
  report_data TEXT,
  -- Message/checkin fields
  message_text TEXT,
  message_sent BOOLEAN DEFAULT false,
  -- General
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, type, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_user ON client_workflow_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_client ON client_workflow_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_date ON client_workflow_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON client_workflow_tasks(status);
