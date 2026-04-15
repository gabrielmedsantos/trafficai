-- Migration 018: timer nas tasks de workflow + role/department nos users

-- Timer nas client_workflow_tasks
ALTER TABLE client_workflow_tasks
    ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS time_spent_seconds INT NOT NULL DEFAULT 0;

-- Role e departamento nos usuários (para gestão do time)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'member',
    -- 'admin' | 'member'
    ADD COLUMN IF NOT EXISTS department VARCHAR(100),
    -- Ex: 'Tráfego', 'Criativo', 'Comercial', 'CS'
    ADD COLUMN IF NOT EXISTS job_title VARCHAR(100),
    ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20) DEFAULT '#6366f1';

-- Índice para facilitar ranking por usuário
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_timer ON client_workflow_tasks(user_id, timer_started_at)
    WHERE timer_started_at IS NOT NULL;
