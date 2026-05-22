-- ─── UTM tracking + intake token ────────────────────────────────────────
BEGIN;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source       VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium       VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign     VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content      VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term         VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fbclid           VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gclid            VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_url      TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_captured_at  TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS marketing_meta   JSONB;  -- campos extras (ad_id, adset_id, etc.)

CREATE INDEX IF NOT EXISTS leads_utm_source_idx   ON leads(utm_source)   WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_utm_campaign_idx ON leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_fbclid_idx       ON leads(fbclid)       WHERE fbclid IS NOT NULL;

-- Token de intake por workspace (usado pra recebimento de leads via API pública)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS intake_token VARCHAR(64);

-- Gerar token aleatório pros workspaces existentes
UPDATE workspaces
SET intake_token = encode(gen_random_bytes(32), 'hex')
WHERE intake_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_intake_token_idx ON workspaces(intake_token);

COMMIT;

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='leads' AND (column_name LIKE 'utm_%' OR column_name IN ('fbclid','gclid','landing_url','referrer','utm_captured_at','marketing_meta'))
ORDER BY column_name;

SELECT id, name, intake_token FROM workspaces;
