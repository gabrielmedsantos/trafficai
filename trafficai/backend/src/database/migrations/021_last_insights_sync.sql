-- ==============================
-- TrafficAI — last_insights_sync_at em ad_accounts
-- Permite mostrar "sincronizado há X" na UI de contas e filtrar
-- contas que precisam de re-sync.
-- ==============================

ALTER TABLE ad_accounts
  ADD COLUMN IF NOT EXISTS last_insights_sync_at TIMESTAMPTZ;

-- Inicializa com o MAX(insights_history.created_at) já existente por conta.
UPDATE ad_accounts a
SET last_insights_sync_at = sub.last_sync
FROM (
  SELECT c.account_id, MAX(ih.created_at) AS last_sync
  FROM campaigns c
  JOIN insights_history ih ON ih.campaign_id = c.id
  GROUP BY c.account_id
) sub
WHERE a.id = sub.account_id
  AND a.last_insights_sync_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ad_accounts_last_sync
  ON ad_accounts(user_id, last_insights_sync_at)
  WHERE is_client_active = true;
