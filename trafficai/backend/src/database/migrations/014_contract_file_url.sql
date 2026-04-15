-- ==============================
-- TrafficAI — Contract File URL
-- ==============================

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_file_url TEXT;
