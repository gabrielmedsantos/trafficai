-- Assinatura eletrônica dos contratos gerados, via ZapSign.
-- Token da API fica no usuário (cada agência tem sua própria conta ZapSign);
-- criptografado em repouso, mesmo padrão de users.access_token (ver
-- shared/encryption.ts).
ALTER TABLE users ADD COLUMN IF NOT EXISTS zapsign_api_token TEXT;

-- zapsign_token é único globalmente (UUID da ZapSign) — o webhook (compartilhado
-- entre todos os usuários) usa ele pra encontrar a linha certa, sem precisar
-- de segredo por usuário: o segredo do header já garante que só nós geramos
-- esse webhook (ver ZAPSIGN_WEBHOOK_SECRET).
CREATE TABLE IF NOT EXISTS contract_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    generated_contract_id UUID NOT NULL REFERENCES generated_contracts(id) ON DELETE CASCADE,
    zapsign_token VARCHAR(100) NOT NULL UNIQUE,
    sign_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'refused', 'expired')),
    signed_file_data BYTEA,
    signer_name VARCHAR(255),
    signer_email VARCHAR(255),
    signer_phone VARCHAR(30),
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_generated_contract ON contract_signatures(generated_contract_id);
