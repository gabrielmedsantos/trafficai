-- ==============================
-- TrafficAI — Impede duplicatas em tracking_events
--
-- Bug histórico: crm-sync.service enviava Purchase pra Meta ANTES de checar
-- se o event_id já existia + ON CONFLICT DO NOTHING não funcionava porque
-- não havia constraint UNIQUE. Resultado: cron diário reenviava os mesmos
-- leads todos os dias, inflando Purchase 11× na Meta em 11 dias.
--
-- Fix em 2 camadas:
--   1) crm-sync.service agora faz SELECT antes de sendToMeta (fix principal)
--   2) UNIQUE constraint (source_id, event_id) como reforço no banco
-- ==============================

-- Deixa as duplicatas existentes intactas pra auditoria histórica.
-- A constraint só previne duplicatas FUTURAS via NOT VALID + validate depois.
-- Como não temos plano imediato de dedupe histórico, deixamos partial index
-- que só aceita novas rows únicas por (source_id, event_id) NÃO nulas.

-- Nota: se você quiser eventualmente eliminar duplicatas históricas:
--   DELETE FROM tracking_events a USING tracking_events b
--   WHERE a.source_id = b.source_id AND a.event_id = b.event_id
--     AND a.event_id IS NOT NULL
--     AND a.created_at > b.created_at;
-- (mantém a primeira row de cada dupe, apaga as subsequentes)

CREATE UNIQUE INDEX IF NOT EXISTS uq_tracking_events_source_event
    ON tracking_events (source_id, event_id)
    WHERE event_id IS NOT NULL;

COMMENT ON INDEX uq_tracking_events_source_event IS
    'Bloqueia duplicatas server-side de eventos CAPI. Cada event_id é único por source. Introduzido em 07/07/2026 após bug de reenvio.';
