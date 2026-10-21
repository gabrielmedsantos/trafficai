> Publicado e cadastrado em 18/10/2026 após aprovação. Os estados pendentes abaixo são o histórico de preparação.

# Biblioteca de recuperação e upsell — 18/10/2026

## Pacote preparado

19 modelos de mensagem em pt-BR, finalidade marketing: sete e-mails de recuperação; seis mensagens WhatsApp de recuperação; três e-mails de upsell e três mensagens WhatsApp de upsell. Corpos usam apenas name, product, checkout_url e unsubscribe_url. A versão HTML de e-mail usa blocos editáveis e botão. Não incorpora valores, descontos, percentuais, prazos, prova social ou garantias que dependam de um produto específico. WhatsApp usa checkout em vez de chave Pix fixa. Remover ou alterar a cadência é parte da adaptação de cada produto.

Seis fluxos MODELO, todos criados em rascunho, sem versão publicada e sem integração pré-selecionada:

1. Compra aprovada: sincronizar tags do produto e retirar a tag de recuperação.
2. Recuperação por e-mail: 7 contatos, esperas relativas planejadas para 10min, 1h, 4h, 12h, 24h, 48h e 72h desde entrada.
3. WhatsApp Pix/checkout: 6 contatos, para 10min, 20min, 2h20, 6h, 24h e 48h.
4. WhatsApp pagamento recusado: 3 contatos, para 10min, 20min e 24h.
5. Upsell por e-mail: 3 contatos, para 1min, 12h e 24h após aprovação.
6. Upsell por WhatsApp: mesma estrutura com mensagens de WhatsApp.

As esperas são incrementais, persistidas pelo motor; janela de envio, fila e horário de início podem adiar os horários reais. Os nomes não prometem hora exata de envio. Dias padrão: segunda a sábado, 08h–20h, America/Fortaleza. Nenhuma sequência foi ativada.

## Duplicar e adaptar

Duplicar um fluxo agora clona também seus modelos de mensagem na mesma transação, reutilizando uma única cópia quando o mesmo modelo aparece em múltiplos nós. A cópia é rascunho e não preserva versões publicadas. Editar suas mensagens não altera os modelos originais. Em Modelos, Duplicar abre uma nova mensagem para edição antes de salvar.

Na cópia do fluxo, selecionar produto de entrada, fonte, textos, modelos e conexão remetente. Para upsell, escolher também Produto oferecido e, se necessário, Oferta do produto. O produto oferecido determina nome, preço e checkout nas mensagens; o acesso/entrega do produto inicial permanece independente. Mapear fonte e ID externo reais do webhook. IDs da plataforma, nomes exibidos e URLs de checkout não são equivalentes por definição: conferir os pedidos recebidos antes de ativar.

Não ativar as sequências completas de recuperação por e-mail e WhatsApp simultaneamente sem coordenar as cadências; os modelos são alternativas para adaptação. Para coordenar canais, alternar nós em um único fluxo e revisar limite de mensagens e consentimento. WhatsApp Cloud ainda exige modelo aprovado no provedor; o cadastro interno não implica aprovação Meta.

## Compra, tags e interrupção

{{product_tag}} é uma tag determinística comprou:<hash> da fonte e do ID externo da oferta do pedido de entrada. {{promotion_tag}} resolve a tag equivalente da oferta recomendada. A tag recuperando:{{product_tag}} é removida pela sequência de compra aprovada ou ao terminar a recuperação. Esses tokens são exclusivos dos nós de tag e das condições has_tag, não variáveis de corpo de mensagem. Duplicar o fluxo não exige inventar nomes de tags por produto.

Cada recuperação é marcada recovery=true e verifica status do pedido original e existência de outro pedido aprovado do mesmo produto/oferta e fonte, por e-mail ou telefone normalizado. O motor consulta pedidos novamente em cada etapa, não depende somente das tags. Um pedido do produto Básico não deve interromper a recuperação de uma oferta diferente nem um upsell Premium. Para upsell, o alvo de interrupção passa a ser especificamente o produto/oferta recomendada, mesmo que stop_on_purchase antigo esteja marcado para o produto inicial. Falta de identificação do contato cancela o upsell; mapeamento de oferta ausente, removido ou arquivado impede envio. Recuperação sem mapeamento também falha sem enviar.

Templates sales_mode precisam de produto de entrada mapeado para publicar; upsell precisa de produto oferecido e gatilho pagamento aprovado; não pode estar marcado como recuperação. Campos incompletos ou conexão ausente bloqueiam a publicação. A proteção depende de o webhook registrar pedidos e identidades corretamente; não identifica uma compra que a integração ainda não recebeu. Não há migração de banco nesta mudança.

## Referências analisadas

- /Users/gabrielmedeiros/Downloads/EMAIL - Recuperação de Vendas .pdf (11 páginas)
- /Users/gabrielmedeiros/Downloads/WPP - Recuperação de Vendas.pdf (4 páginas)
- /Users/gabrielmedeiros/Downloads/WPP - Upsell.pdf (2 páginas)
- /Users/gabrielmedeiros/Downloads/pagina-upsell_downsell - Outbox/upsell.json e downsell.json (modelos de página Elementor, não fluxos TrafficAI).

A cadência e a progressão das mensagens foram adaptadas; os arquivos Elementor serviram de referência para apresentação de oferta opcional. Não foram importados como páginas nem publicados; exigem conteúdo e checkout de cada produto. Nenhuma instrução interna ou link externo dos documentos foi executado.

## Validação

Backend TypeScript, frontend TypeScript e lint passaram. 19 testes de workflows, marketing, HTTP, callbacks, links e compra passaram. Cobrem compra básica mantendo upsell, compra Premium por telefone normalizado encerrando antes do envio, comprador/fonte diferentes não encerrando, tag de compra resolvida, compra anterior encerrando recuperação de outro pedido do mesmo contato, cópia independente dos modelos e isolamento de titularidade. Nenhum envio externo foi usado: provedores de teste são funções simuladas.

Instalador executado duas vezes em base descartável: 19 mensagens, 6 fluxos, zero ativos, sem duplicações. UI local confirmou os seis rascunhos e persistência do produto oferecido após salvar/reabrir. Screenshot sales-templates-preview.png usa dados TESTE LOCAL.

## Implantação pendente de aprovação

Backup VPS /opt/trafficai/.backups/20261018-sales-template-pack-01. Código preparado sem bind mount; compilar backend e frontend antes de pedir para recriar esses dois serviços. Preservar as flags AUTOMATION_SENDS_ENABLED, AUTOMATION_EXTERNAL_ACTIONS_ENABLED e AUTOMATION_PAID_AGENTS_ENABLED false. Após aprovação explícita, cadastrar as 19 mensagens e 6 fluxos somente como rascunhos na conta, mantendo os dois modelos anteriores. Instalador transacional e idempotente em template-packs/install-sales-lifecycle.cjs, dry-run padrão; --apply somente após autorização. Nenhum fluxo ativo existente deve ser editado ou republicado automaticamente. Workspace local é a cópia sincronizada; espelho /Volumes/WinInstall indisponível.

## Build final VPS

Backend compilado: sha256:3eb3bb24fee4b8b3b855d5e54ecc9dd7c4f4422eacedf599e5c016ab5b2ca3fc.
Frontend compilado: sha256:f3bbecf4656b2529e60661aa01c6d274e62f62d01bdc5da90207c5d7e5a0ee51.
63 hashes de fontes/testes conferidos. Imagens/StartedAt dos dois serviços preservados. As três flags de ações/envios/IA paga permanecem false. Dry-run de registro na conta correta encontrou zero modelos/fluxos com os nomes do novo pacote e não gravou registros. Hashes do pacote e do instalador e imagens anteriores estão em build-result.json no backup. Fontes da VPS copiados de volta ao workspace local.

Próxima ação somente após aprovação: recriar exclusivamente backend e frontend usando Compose original + docker-compose.automations.yml, --no-build --no-deps; verificar saúde e flags; fazer backup dos registros relevantes e instalar 19 mensagens + 6 fluxos em uma transação com instalador --apply. Verificar todos os novos fluxos em draft, published_version nulo e nenhuma mensagem enviada. Não ativar sequências nem inscrever contatos.

## Pasta Templates — ajuste solicitado e autorizado

Em 18/10/2026 o usuário aprovou a publicação/cadastro e pediu uma pasta Templates. Os seis fluxos-base passam a usar settings.folder=templates, sem migração de esquema. Fluxos tem Meus fluxos (padrão), Templates e Todos; a API filtra por conta e pasta. Usar template cria uma cópia em Meus fluxos, incluindo cópias independentes das mensagens. O editor permite mover entre as duas pastas. Os padrões na biblioteca não podem ser publicados diretamente: a publicação pede duplicação primeiro.

Verificação local: seis padrões em Templates, Usar template abriu uma cópia em rascunho, Meus fluxos mostrou só essa cópia. Teste de pasta valida isolamento por conta, parâmetro inválido rejeitado, originais separados e bloqueio de publicação do padrão. O instalador executado duas vezes deixou 19 mensagens, 6 padrões na biblioteca, zero em Meus fluxos e zero ativos. Screenshot templates-folder-preview.png é a fixture local, sem dados de produção.

A aprovação abrange o cadastro dos 19 modelos e 6 rascunhos e a publicação de backend/frontend, mantendo envios/ações externas/IA paga desligados. Não precisa repetir a aprovação para o ajuste de organização solicitado na mesma mensagem. Imagens finais com pasta serão registradas em .backups/20261018-sales-template-folder-01; rollback usa as imagens em execução registradas no backup anterior do pacote.

## Publicação e cadastro concluídos

Backend/frontend recriados em 2026-10-18T22:25:43Z; nenhum serviço adjacente reiniciado. Imagens finais backend sha256:7754e24be5035294f39e52cc066f1588f6998d712733fd814275d6b8c23167c3 e frontend sha256:e36fede6b2e1989bc963c911ab4e6f2966e08bbbf67c942519fbb235a24f8ed0. API health e página HTTP 200, zero reinícios adicionais e flags de envios/ações externas/IA paga false. Sem migração de banco.

Instalador criou 19 mensagens e 6 fluxos em uma transação. Verificação posterior: 6 na pasta Templates, todos draft e published_version nulo; zero novas execuções e zero mensagens desses fluxos. Um fluxo anterior e os dois modelos anteriores foram preservados. Meus fluxos continua com o fluxo anterior. Backup dos registros antes do cadastro, IDs criados e verificações: records-before.json, install-result.json e verification-result.json em .backups/20261018-sales-template-folder-01.

Acesso direto: https://app.alfamaxdigital.com.br/automacoes?tab=flows&folder=templates . As 19 mensagens também aparecem em Modelos. Usar template cria cópia em Meus fluxos e clona suas mensagens. Conferência visual interativa foi feita na fixture; o navegador publicado disponível está sem sessão autenticada e exibiu solicitação de login. Screenshot da conferência publicada: screenshots/templates-folder-published.png; prévia local da pasta: screenshots/templates-folder-preview.png.

Pendências operacionais: adaptar cada cópia ao produto, mapear fonte/IDs externos e produto ofertado, selecionar modelos/conexões, revisar cadência e consentimento, homologar provedores e então decidir a ativação. Os padrões não iniciam envios. Páginas Elementor não foram publicadas; seus arquivos eram referência de estrutura. Fontes da VPS sincronizados de volta ao workspace local; espelho /Volumes/WinInstall segue indisponível.
