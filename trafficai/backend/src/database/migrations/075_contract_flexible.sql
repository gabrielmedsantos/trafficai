-- Prazo do contrato como campo explícito (antes só existia implícito via
-- start_date/end_date) + flag de contrato flexível, que remove as cláusulas
-- de multa rescisória do PDF gerado.
ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS term_months INT,
    ADD COLUMN IF NOT EXISTS is_flexible BOOLEAN NOT NULL DEFAULT FALSE;
