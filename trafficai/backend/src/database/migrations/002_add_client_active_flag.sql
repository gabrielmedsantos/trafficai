-- ==============================
-- Add Client Active Flag to Ad Accounts
-- ==============================

-- Adiciona campo para marcar se a conta é de um cliente ativo
ALTER TABLE ad_accounts
ADD COLUMN is_client_active BOOLEAN DEFAULT true;

-- Adiciona campo de observações sobre o cliente
ALTER TABLE ad_accounts
ADD COLUMN client_notes TEXT;

-- Cria índice para filtrar contas ativas
CREATE INDEX idx_ad_accounts_client_active ON ad_accounts(user_id, is_client_active) WHERE is_client_active = true;

COMMENT ON COLUMN ad_accounts.is_client_active IS 'Indica se esta conta pertence a um cliente ativo';
COMMENT ON COLUMN ad_accounts.client_notes IS 'Observações sobre o cliente (ex: motivo de inativação, data de retorno esperada, etc)';
