-- ==============================
-- TrafficAI — Board: vincular cards a clientes
-- Troca a tag livre "project" por FK real pra clients. Mantém "project" como
-- fallback para cards internos/gerais sem cliente associado.
-- ==============================

ALTER TABLE board_cards
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_cards_client ON board_cards(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_board_cards_user_client ON board_cards(user_id, client_id, status);
