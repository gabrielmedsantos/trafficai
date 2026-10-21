# Correção de atribuição — publicação de 21/10/2026

Publicação autorizada pelo usuário e concluída. Somente o backend foi reiniciado.

- Normalizador ignora placeholders como “Não Informado”, sem recriar UTMs ausentes.
- Uma venda aprovada de Historinha foi atribuída financeiramente à campanha MOBLYAR após correspondência única de telefone com quiz anterior, sem conflito de e-mail. Essa revisão manual não comprova o clique exato da compra.
- Pedido, valor, origem canônica e associação do quiz preservados. Nenhum Purchase foi reenviado à Meta e nenhuma mensagem foi disparada pela correção.
- Verificação às 14h38 de Fortaleza: MOBLYAR com 2 vendas aprovadas em 21/10, receita bruta de R$ 19,80; uma auditoria da correção e um evento Purchase para o pedido ajustado. API healthy.
- Recuperações de quiz continuam em waiting, previstas para 15h16 (WhatsApp) e 17h16 (e-mail). Não houve confirmação de entrega nesta verificação.
- Validação anterior à publicação: compilação e 21 testes aprovados. Outros 169 arquivos JavaScript compilados coincidem com a versão anterior.

Backup: `/opt/trafficai/.backups/20261021-correcao-atribuicao-ticto-publicacao/`.
Imagem anterior: `trafficai-backend:pre-correcao-atribuicao-20261021`.
Implementação: PR #6, commit `24f922d85a8aa170f29c187c0c664b8a121aca72`.
