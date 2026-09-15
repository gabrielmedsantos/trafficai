-- Motor de regras de conversão configurável, por fonte de tracking.
-- Substitui lógica fixa no código por regras editáveis: quando um gatilho
-- bate (palavra-chave, frase na mensagem, label do WhatsApp, catálogo de
-- produto, automação do provedor), dispara um evento do funil.

CREATE TABLE IF NOT EXISTS tracking_conversion_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    trigger_type VARCHAR(30) NOT NULL CHECK (trigger_type IN
        ('keyword', 'whatsapp_label', 'message_phrase', 'structured_catalog', 'provider_automation')),
    match_mode VARCHAR(10) NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('contains', 'exact')),
    event_name VARCHAR(100) NOT NULL,
    trigger_value TEXT,
    trigger_phrases JSONB,
    message_author_scope VARCHAR(10) NOT NULL DEFAULT 'both'
        CHECK (message_author_scope IN ('team', 'contact', 'both')),
    value_mode VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (value_mode IN ('fixed', 'message_extracted')),
    default_value NUMERIC(12,2),
    default_currency VARCHAR(3),
    default_content_name VARCHAR(180),
    mode VARCHAR(15) NOT NULL DEFAULT 'observation' CHECK (mode IN ('observation', 'production')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversion_rules_source ON tracking_conversion_rules(source_id, active);

-- Auditoria de cada vez que uma regra é avaliada contra uma ocorrência real
-- (mensagem recebida/enviada, label aplicada). Idempotente por
-- (rule_id, external_execution_key) — a mesma mensagem/evento nunca reprocessa
-- a mesma regra duas vezes.
CREATE TABLE IF NOT EXISTS tracking_rule_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES tracking_conversion_rules(id) ON DELETE CASCADE,
    external_execution_key VARCHAR(255) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN
        ('observed', 'eligible', 'materialized', 'duplicate', 'blocked', 'failed')),
    reason_code VARCHAR(120),
    value NUMERIC(12,2),
    currency VARCHAR(3),
    lead_id UUID REFERENCES tracking_whatsapp_leads(id) ON DELETE SET NULL,
    conversion_event_id UUID REFERENCES tracking_events(id) ON DELETE SET NULL,
    attempt_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(rule_id, external_execution_key)
);

CREATE INDEX IF NOT EXISTS idx_rule_executions_source ON tracking_rule_executions(source_id, created_at DESC);
