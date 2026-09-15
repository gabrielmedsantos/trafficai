-- Liga tracking_purchase_reviews a uma regra de conversão, quando a revisão
-- foi gerada pelo motor de regras (fase 2) em vez do detector fixo antigo.
-- Nullable: linhas já existentes (detector fixo de Purchase por mensagem)
-- continuam com rule_id NULL — nenhuma regressão.

ALTER TABLE tracking_purchase_reviews
    ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES tracking_conversion_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_reviews_rule ON tracking_purchase_reviews(rule_id);
