> Publicado em 18/10/2026 após aprovação do usuário. As menções a aprovação pendente abaixo descrevem o estado anterior.

# Criar próxima etapa ao soltar a linha — 18/10/2026

A revisão inclui o modo tela cheia anterior, ainda não publicado. Ao arrastar uma saída do canvas e soltar em área vazia, onConnectEnd abre um seletor de etapas. Mensagem, espera, condição e as demais ações existentes criam um bloco na posição convertida por screenToFlowPosition e conectam automaticamente a saída de origem. O painel de configuração abre para o novo bloco. Gatilho e nota não são destinos válidos e não aparecem no menu. Soltar sobre outro bloco conserva o comportamento anterior de conexão.

Uma única operação de histórico engloba criação e conexão. Saídas Sim/Não conservam identificador, rótulo e cor. Substituir uma saída ocupada exibe aviso; o destino antigo permanece no canvas, com ligação removida conforme regra existente. Cancelar ou Esc não altera o grafo. Não inclui novo tipo de bloco sequência: reutiliza os tipos existentes do mecanismo de execução.

Verificação local isolada sem dados de produção: gesto real de arrastar abriu menu, Mensagem foi criada/conectada; Desfazer recuperou os dois blocos e a conexão original; Condição criada e saída Não conectada automaticamente a Espera com rótulo Não; cancelamento de menu da saída Sim preservou quatro blocos e duas conexões, sem sair de tela cheia. Lint e TypeScript passaram; quatro testes das regras de conexão passaram. Screenshot: screenshots/connect-menu-preview.png.

Backup dos fontes preparados anteriormente: /opt/trafficai/.backups/20261018-flow-connect-menu. Backup da versão em produção e rollback de imagem: /opt/trafficai/.backups/20261018-flow-fullscreen e trafficai-frontend:pre-fullscreen-20261018. Ainda não houve reinício de serviços ou alterações no banco de produção. Os envios continuam desligados. Compilar antes de solicitar aprovação para recriar somente frontend. Espelho /Volumes/WinInstall indisponível; sincronização usa o workspace local.

Build VPS concluído com sucesso. Candidata final: sha256:34b66fd821fa7c417e03d01b6da5d5818d48e8616d5983b9db4cca690bc87877, substitui candidata anterior do modo tela cheia. 61 hashes conferidos; backend e frontend mantêm imagens e horários de início da versão publicada. Aguardando aprovação para docker compose -f docker-compose.yml -f docker-compose.automations.yml up -d --no-build --no-deps frontend.

## Publicação verificada

Frontend recriado com imagem sha256:34b66fd821fa7c417e03d01b6da5d5818d48e8616d5983b9db4cca690bc87877 em 2026-10-18T18:03:09Z. Somente frontend reiniciado. Backend preservou imagem e StartedAt, sem alteração de dados ou envios. Flags de envios, ações externas e IA paga continuam false. Página do editor e API health HTTP 200; os bundles públicos contêm as duas melhorias. Evidência operacional em .backups/20261018-flow-connect-menu/publication-result.json.

Navegador de verificação sem sessão autenticada: página carregou com solicitação de login. Teste interativo completo foi feito na fixture local isolada antes da publicação; não foram criados fluxos de teste na conta de produção. Screenshot publicado: screenshots/editor-published-20261018.png.
