-- ==============================
-- 049_client_onboardings.sql
-- Onboarding do cliente: checklist de setup inicial pós-contrato.
-- 1 por ad_account. Template default aplicado ao "iniciar onboarding".
-- ==============================

CREATE TABLE IF NOT EXISTS client_onboardings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ad_account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE UNIQUE,

    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'paused')),

    -- Checklist: JSON array de items.
    -- Cada item: { id, phase, title, description, owner ('agency'|'client'), done, done_at, done_by, notes, order }
    items JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Config
    threshold_percent INT NOT NULL DEFAULT 100
        CHECK (threshold_percent >= 0 AND threshold_percent <= 100),

    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboardings_user ON client_onboardings (user_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_status ON client_onboardings (status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION onboardings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    -- Auto marca completed_at ao mudar status
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onboardings_updated_at_trigger ON client_onboardings;
CREATE TRIGGER onboardings_updated_at_trigger
    BEFORE UPDATE ON client_onboardings
    FOR EACH ROW
    EXECUTE FUNCTION onboardings_updated_at();
