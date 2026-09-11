-- ==============================
-- TrafficAI — Click-to-Lead Attribution Resolver
-- Hoje um lead vindo de /track/webhook/:token só é atribuído a um clique
-- quando o CRM ecoa de volta um click ID explícito (fbc/fbp/gclid/ctwa_clid).
-- Pra CRMs que não fazem isso, tracking_clicks é gravado mas nunca consultado.
-- Essa migration adiciona os campos pra permitir resolver o lead até um
-- clique já registrado, por ordem de confiança: session_id > hash de
-- telefone/email > IP+janela de tempo (mais fraco, documentado como tal).
-- ==============================

-- 1) tracking_clicks — hashes opcionais de contato, preenchidos de forma
--    oportunista quando o pixel identifica o mesmo session_id depois (ex:
--    identify() ou submit de formulário). Nunca guarda PII em texto puro.
--    Adiciona também gbraid/wbraid aqui (não só gclid) — o resolver já
--    devolve os três quando encontra um clique; a captura desses dois no
--    pixel e o envio pra Google Ads ficam pra uma etapa seguinte.
ALTER TABLE tracking_clicks
    ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS gbraid VARCHAR(255),
    ADD COLUMN IF NOT EXISTS wbraid VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_tracking_clicks_email_hash
    ON tracking_clicks(source_id, email_hash) WHERE email_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_clicks_phone_hash
    ON tracking_clicks(source_id, phone_hash) WHERE phone_hash IS NOT NULL;

-- Suporta a busca por IP + janela de tempo (heurística de menor confiança).
CREATE INDEX IF NOT EXISTS idx_tracking_clicks_ip_time
    ON tracking_clicks(source_id, client_ip, created_at DESC) WHERE client_ip IS NOT NULL;

-- 2) tracking_events — registra COMO (e com que confiança) o evento foi
--    atribuído a um clique, pra nunca misturar atribuição forte (ctwa_clid,
--    fbc/fbp explícito) com uma heurística fraca nos relatórios.
ALTER TABLE tracking_events
    ADD COLUMN IF NOT EXISTS attribution_confidence VARCHAR(20),
    ADD COLUMN IF NOT EXISTS attribution_reason TEXT,
    ADD COLUMN IF NOT EXISTS attribution_click_id UUID REFERENCES tracking_clicks(id) ON DELETE SET NULL;
