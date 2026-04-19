-- ==============================
-- TrafficAI — Data de vencimento em cobranças
-- Adiciona due_date em contract_billing + backfill baseado no
-- billing_day do contrato.
-- ==============================

ALTER TABLE contract_billing
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Backfill: due_date = reference_month + (billing_day - 1) dias.
-- Trava em no máximo o último dia do mês (ex: billing_day=31 em fevereiro).
UPDATE contract_billing cb
SET due_date = LEAST(
    (cb.reference_month + (COALESCE(c.billing_day, 1) - 1) * INTERVAL '1 day')::date,
    (DATE_TRUNC('month', cb.reference_month) + INTERVAL '1 month' - INTERVAL '1 day')::date
)
FROM contracts c
WHERE cb.contract_id = c.id AND cb.due_date IS NULL;

-- Para registros sem contrato válido (orfãos), usa o 1º do mês de referência.
UPDATE contract_billing SET due_date = reference_month WHERE due_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_contract_billing_due_date
  ON contract_billing(user_id, due_date)
  WHERE status IN ('pending', 'overdue');
