-- ==============================
-- TrafficAI — Cached Amount Spent & Spend Cap
-- O MetaService.syncAccountBalances() já fazia UPDATE nessas colunas,
-- mas elas não existiam no schema — fazia o UPDATE falhar silenciosamente
-- e todas as métricas de "já gastou" no mês ficavam ausentes.
-- ==============================

ALTER TABLE ad_accounts
  ADD COLUMN IF NOT EXISTS cached_amount_spent DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS cached_spend_cap DECIMAL(12,2);
