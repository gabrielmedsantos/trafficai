-- Adiciona status 'skipped': venda detectada por mensagem mas SEM atribuição
-- de anúncio (lead não veio de clique rastreado, ou é anterior à conexão do
-- WhatsApp nativo). Decisão de produto: só mandamos Purchase pra Meta quando
-- dá pra atribuir a um clique real — sem isso, o valor não ajuda a otimizar
-- a campanha certa e só polui a métrica. Diferente de 'pending' (que exige
-- revisão humana) — aqui não há nada pra corrigir, é só política.

ALTER TABLE tracking_purchase_reviews DROP CONSTRAINT tracking_purchase_reviews_status_check;
ALTER TABLE tracking_purchase_reviews ADD CONSTRAINT tracking_purchase_reviews_status_check
    CHECK (status IN ('pending', 'sent', 'rejected', 'duplicate', 'failed', 'skipped'));
