-- ==============================
-- 050_onboarding_templates.sql
-- Permite ao usuário customizar o template de onboarding.
-- Se o usuário não tem template salvo, o sistema usa o default embarcado.
-- ==============================

CREATE TABLE IF NOT EXISTS user_onboarding_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    -- Array de items no mesmo formato do checklist:
    -- [{ phase, title, description, owner }, ...]
    items JSONB NOT NULL DEFAULT '[]'::jsonb,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_templates_user ON user_onboarding_templates (user_id);
