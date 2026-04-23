-- ==============================
-- TrafficAI — Board (gerenciador de demandas tipo Kanban/Trello)
-- Cards pessoais do usuário com status, prioridade, prazo e checklist.
-- Serve como lista de tarefas E board Kanban (mesma tabela, views diferentes).
-- ==============================

CREATE TABLE IF NOT EXISTS board_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'todo',   -- todo | doing | done
    priority VARCHAR(10) NOT NULL DEFAULT 'normal', -- low | normal | high
    project VARCHAR(100),                          -- tag livre (cliente/projeto)
    due_date DATE,
    position INTEGER NOT NULL DEFAULT 0,           -- ordem dentro da coluna
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{id, text, done}]
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_cards_user_status ON board_cards(user_id, status, position);
CREATE INDEX IF NOT EXISTS idx_board_cards_user_due ON board_cards(user_id, due_date) WHERE due_date IS NOT NULL;
