-- ==============================
-- Board cards vinculadas a campanha (Meta ou Google Ads)
-- Segue o padrão do AdsDaily: "Campanha vinculada" no modal de nova tarefa
-- ==============================

ALTER TABLE board_cards
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS google_campaign_id UUID REFERENCES google_ads_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_cards_campaign ON board_cards(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_board_cards_google_campaign ON board_cards(google_campaign_id) WHERE google_campaign_id IS NOT NULL;
