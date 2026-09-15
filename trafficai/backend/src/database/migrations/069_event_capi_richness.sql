-- Payload Meta CAPI mais rico (order_id/contents/content_type/num_items,
-- igual ao RastrackDash) + marcação local first_purchase/repurchase.
-- purchase_kind NUNCA vai no payload da Meta — é só pra relatório interno
-- (separar receita de cliente novo vs recorrente).

ALTER TABLE tracking_events
    ADD COLUMN IF NOT EXISTS order_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS content_type VARCHAR(40),
    ADD COLUMN IF NOT EXISTS contents JSONB,
    ADD COLUMN IF NOT EXISTS num_items INT,
    ADD COLUMN IF NOT EXISTS purchase_kind VARCHAR(20) CHECK (purchase_kind IN ('first_purchase', 'repurchase'));
