-- Dados legais do cliente (CONTRATANTE), reaproveitados em todo contrato
-- gerado pra ele — evita digitar CNPJ/endereço de novo a cada contrato novo.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cnpj VARCHAR(30);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(120);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS zip_code VARCHAR(15);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS city_state VARCHAR(120);

-- Modelo de contrato (texto com {placeholders}) — 1 padrão por usuário,
-- editável depois sem precisar alterar código (mesmo padrão de
-- daily_whatsapp_template em report_settings).
CREATE TABLE IF NOT EXISTS contract_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL DEFAULT 'Modelo padrão',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- PDF gerado (histórico) — guarda os bytes direto no Postgres, sem precisar
-- de storage externo (contratos são pequenos, poucos KB).
CREATE TABLE IF NOT EXISTS generated_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    file_data BYTEA NOT NULL,
    vars_snapshot JSONB,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_contracts_contract ON generated_contracts(contract_id);
