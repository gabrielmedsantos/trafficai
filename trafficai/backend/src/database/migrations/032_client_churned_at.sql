-- ==============================
-- TrafficAI — Churn tracking
-- Marca a data em que o cliente foi para status='churned' pra calcular churn rate.
-- ==============================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS churned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clients_churned_at
  ON clients(churned_at)
  WHERE churned_at IS NOT NULL;

-- Backfill: clientes já churned ficam com churned_at = updated_at como aproximação.
UPDATE clients
   SET churned_at = updated_at
 WHERE status = 'churned'
   AND churned_at IS NULL;
