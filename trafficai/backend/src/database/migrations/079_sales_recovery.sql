-- Recuperação de vendas: carrinho abandonado + Pix/boleto gerado não pago.
-- Contato em texto (não só hash) porque a equipe precisa chamar o cliente.
ALTER TABLE tracking_orders DROP CONSTRAINT IF EXISTS tracking_orders_status_check;
ALTER TABLE tracking_orders ADD CONSTRAINT tracking_orders_status_check
    CHECK (status IN ('approved', 'pending', 'refused', 'refunded', 'chargeback', 'canceled', 'abandoned'));

ALTER TABLE tracking_orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE tracking_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE tracking_orders ADD COLUMN IF NOT EXISTS checkout_url TEXT;
-- Quando a equipe marcou que chamou o cliente
ALTER TABLE tracking_orders ADD COLUMN IF NOT EXISTS recovery_contacted_at TIMESTAMPTZ;
-- Pedido aprovado do mesmo cliente que "recuperou" este carrinho/pix/recusa
ALTER TABLE tracking_orders ADD COLUMN IF NOT EXISTS recovered_order_id UUID REFERENCES tracking_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_orders_recovery
    ON tracking_orders(source_id, status, created_at)
    WHERE status IN ('abandoned', 'pending', 'refused');
CREATE INDEX IF NOT EXISTS idx_tracking_orders_email_hash ON tracking_orders(source_id, customer_email_hash);
CREATE INDEX IF NOT EXISTS idx_tracking_orders_phone_hash ON tracking_orders(source_id, customer_phone_hash);
