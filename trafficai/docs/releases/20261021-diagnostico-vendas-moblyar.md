# Vendas MOBLYAR e recuperações — 21/10/2026

Auditoria somente leitura da produção. Nenhum pedido, vínculo ou CAPI foi alterado/reprocessado nesta preparação.

## Evidências

- A venda 4602b055-8a5a-48ec-b767-eb1b63b4f1d3, R$9,90, foi recebida no período das 14h17–14h20 de Fortaleza. UTMs e clique estão presentes. Campanha 120250092439360513 pertence unicamente à MOBLYAR. A listagem por conta e buildSummary retornaram uma aprovação e R$9,90 para MOBLYAR em 21/10. Purchase registrado como sent para CA5 e MOBLYAR. Fonte canônica do webhook continua CA5, sem duplicar pedido.
- A venda 409d1087-fe53-4362-a109-9949894f4a6a, R$9,90, recebida às 09h30, veio sem campanha/clique e com sck placeholder “Não Informado”. Permanece fora da MOBLYAR pela regra de atribuição; Purchase foi enviado apenas à fonte canônica. Não deve ser reemitido automaticamente.
- Para essa segunda venda, foi encontrada uma única sessão não vinculada dos 30 dias anteriores com telefone normalizado idêntico, sem conflito de e-mail, e campanha MOBLYAR. É evidência para proposta de atribuição financeira manual; não é identificador técnico exato de compra e não autoriza inferir a criança do pedido.
- Prévia do reparo validada sem UPDATE no banco real: pedido e produto esperados, valor/status preservados, sessão única e propriedade da campanha conferida.

## Recuperação

As duas execuções de quiz autorizado continuam waiting, com primeiro WhatsApp às 15h16 e e-mail às 17h16 de Fortaleza. Não havia mensagens enviadas na janela da conferência. As duas execuções do novo pedido foram canceladas quando o pagamento foi aprovado. Sem mensagem de recuperação antes do pagamento, essa venda não deve ser classificada artificialmente como recuperada.

## Defeito reproduzido e correção preparada

O adaptador Ticto descarta “Não Informado”, mas o fallback checkoutAttribution lia o payload original e reintroduzia o placeholder. Isso tratava ausência como sessão presente, prejudicando o diagnóstico de tracking. O normalizador comum agora ignora placeholders e pode selecionar um valor válido de outro container. Isso não recria UTMs que o checkout não enviou.

## Reparo manual proposto — depende de aprovação

Script repair-historinha-attribution-20261021.cjs executa somente preview por padrão. Aplicação exige variável explícita igual ao ID do pedido alvo. Revalida pedido, usuário, fonte, produto, valor, status, ausência de conflito, contato único e campanha; somente então altera UTMs e IDs Meta financeiros e grava auditoria. Não altera fonte canônica, valor, status, sck, raw, purchase_event_id ou order_id do quiz. Não executa webhook, notificações ou CAPI. Deve haver backup do pedido antes de aplicar.

Resultado esperado se autorizado: MOBLYAR passa de uma para duas vendas de R$9,90 nesse dia; o total geral de pedidos/receita permanece igual. É atribuição manual por evidência de contato, não prova de clique da transação.

## Validação

20 testes de regressão de normalização e plataformas aprovados; um teste com PostgreSQL isolado confirmou preview somente leitura, bloqueio por ambiguidade, atualização única/idempotente e preservação de pedido/valor/vínculo da criança. Backend compilado localmente; imagem isolada preparada para publicação após autorização. Não houve reinício da produção nesta preparação.
