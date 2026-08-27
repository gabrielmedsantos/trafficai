-- Seletor explícito "Nível de Conta" vs "Nível de Campanha" no relatório
-- diário WhatsApp. 'auto' (default) preserva o comportamento atual — mostra
-- detalhamento por objetivo só quando a conta tem mais de um no período.
ALTER TABLE report_settings
    ADD COLUMN IF NOT EXISTS report_level VARCHAR(10) NOT NULL DEFAULT 'auto'
    CHECK (report_level IN ('auto', 'account', 'campaign'));
