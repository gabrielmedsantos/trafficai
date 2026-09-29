-- Custos e regras de venda por fonte de tracking (paridade UTMify):
--   sales_settings = {
--     tax_rate: number            -- % de imposto sobre o faturamento líquido
--     product_costs: { [produto]: number }  -- custo unitário por produto (R$)
--     purchase_value: 'gross' | 'net'       -- valor enviado no Purchase da Meta
--     purchase_products: string[]           -- vazio = todos; senão só esses geram Purchase
--   }
ALTER TABLE tracking_sources ADD COLUMN IF NOT EXISTS sales_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Despesas adicionais (ferramentas, equipe, criativos…) que entram no lucro.
CREATE TABLE IF NOT EXISTS tracking_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES tracking_sources(id) ON DELETE CASCADE,
    expense_date DATE NOT NULL,
    description VARCHAR(200) NOT NULL,
    category VARCHAR(60),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tracking_expenses_source_date ON tracking_expenses(source_id, expense_date);
