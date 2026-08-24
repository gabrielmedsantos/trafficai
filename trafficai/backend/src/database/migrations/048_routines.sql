-- ==============================
-- 048_routines.sql
-- Rotina do gestor de tráfego: reuniões, checklists, envio de relatórios.
-- Pode ser GERAL (aplica a todos os clientes) ou POR CLIENTE (ligada a ad_account).
-- ==============================

CREATE TABLE IF NOT EXISTS routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Escopo: NULL = geral do gestor; preenchido = ligado a um cliente específico
    ad_account_id UUID REFERENCES ad_accounts(id) ON DELETE CASCADE,

    -- Tipo da rotina — define comportamento e integração:
    --   'meeting'          : reunião (com cliente, interna, alinhamento)
    --   'checklist_camp'   : checklist de campanhas (revisar métricas, otimizar)
    --   'checklist_client' : checklist de acompanhamento de cliente
    --   'report_send'      : envio automático de relatório WhatsApp (integrado ao worker)
    --   'custom'           : tarefa livre
    kind TEXT NOT NULL CHECK (kind IN ('meeting','checklist_camp','checklist_client','report_send','custom')),

    title TEXT NOT NULL,
    description TEXT,

    -- Frequência
    frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','custom')),

    -- Dias da semana: array de 0-6 (0=domingo, 1=segunda...). Ex: [1,3,5] = seg/qua/sex
    days_of_week INT[] DEFAULT '{}',

    -- Dia do mês (só usado quando frequency='monthly'). Ex: 5 = todo dia 5
    day_of_month INT,

    -- Hora do dia (HH:MM). Opcional — se null, considera "durante o dia"
    time_of_day TIME,

    -- Checklist items (só quando kind IN ('checklist_camp','checklist_client'))
    -- JSON array: [{"text": "Revisar CTR", "done": false}, ...]
    checklist_items JSONB DEFAULT '[]'::jsonb,

    -- Ativa? Se false, não aparece na agenda nem dispara automação
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Ordem de exibição (drag-and-drop no futuro)
    display_order INT DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routines_user_active ON routines (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_routines_ad_account ON routines (ad_account_id) WHERE ad_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_routines_kind ON routines (kind);

-- Histórico de execuções (marca "feito" pra cada dia)
CREATE TABLE IF NOT EXISTS routine_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    scheduled_for DATE NOT NULL,
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    done_at TIMESTAMPTZ,
    notes TEXT,
    -- Se for report_send, guarda referência do envio
    report_sent_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (routine_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_routine_occ_routine_date ON routine_occurrences (routine_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS idx_routine_occ_scheduled ON routine_occurrences (scheduled_for);

-- Trigger pra atualizar updated_at
CREATE OR REPLACE FUNCTION routines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS routines_updated_at_trigger ON routines;
CREATE TRIGGER routines_updated_at_trigger
    BEFORE UPDATE ON routines
    FOR EACH ROW
    EXECUTE FUNCTION routines_updated_at();
