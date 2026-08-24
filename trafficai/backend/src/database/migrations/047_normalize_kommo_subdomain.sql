-- ==============================
-- TrafficAI — Normalize crm_subdomain values already saved wrong
-- Usuários colavam URL completa ("https://mapscar.kommo.com" ou "mapscar.kommo.com")
-- no campo de subdomínio; o adapter montava a URL final quebrada e o DNS falhava.
-- Esta migration extrai só o subdomínio dos registros já salvos.
-- ==============================

UPDATE tracking_sources
SET crm_subdomain = LOWER(
    REGEXP_REPLACE(
        REGEXP_REPLACE(
            REGEXP_REPLACE(TRIM(crm_subdomain), '^https?://', ''),
            '\.kommo\.com.*$', ''
        ),
        '/.*$', ''
    )
)
WHERE crm_type = 'kommo'
  AND crm_subdomain IS NOT NULL
  AND crm_subdomain <> ''
  AND (
      crm_subdomain ~* '^https?://'
      OR crm_subdomain ~* '\.kommo\.com'
      OR crm_subdomain LIKE '%/%'
  );
