-- ==============================
-- TrafficAI — Campos de edição do relatório
-- Permite customizar quais campanhas aparecem e adicionar notas
-- ==============================

ALTER TABLE client_reports
ADD COLUMN selected_campaign_ids JSONB,        -- null = todas; array de campaign IDs = filtradas
ADD COLUMN custom_note TEXT,                    -- nota personalizada exibida no relatório
ADD COLUMN edited_analysis TEXT,               -- análise editada manualmente (sobrescreve ai_analysis)
ADD COLUMN edited_recommendations JSONB,        -- recomendações editadas manualmente
ADD COLUMN show_campaign_table BOOLEAN DEFAULT true,  -- mostrar ou ocultar tabela de campanhas
ADD COLUMN show_ai_analysis BOOLEAN DEFAULT true;     -- mostrar ou ocultar seção de análise IA
