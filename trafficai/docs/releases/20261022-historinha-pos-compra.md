# Historinha — compra aprovada e escada ativadas

Publicação e ativação autorizadas pelo usuário. Backend e frontend compilados antes de reiniciar somente os dois contêineres do TrafficAI. API healthy e painel HTTP 200. Data local: 22/10/2026, America/Fortaleza.

## Fluxos ativos (versão 1)

- WhatsApp: f7c91fd3-8561-4989-a0dd-e5926f8560e1.
- E-mail: cc88dd87-76dd-4cc8-9204-28f5c2b4e6a0.
- Fonte canônica CA5 / jornada compartilhada MOBLYAR. Produto de entrada Historinha.
- Seis recuperações existentes continuam ativas. Upsells e confirmações antigos permanecem em rascunho.

## Sequência

Janela diária de 9h às 19h, Fortaleza; somente canais com dados e autorização válida. Confirmar a compra com parabéns em mensagem transacional separada das ofertas. Aguardar 10 minutos e consultar compras aprovadas, incluindo adicionais do webhook.

- Prioridade + colorir: Missão Família.
- Somente colorir: Missão Família; não há oferta individual de prioridade nesta versão.
- Somente prioridade: colorir individual; Missão Família 24h depois.
- Nenhum adicional: combo colorir + prioridade; após 24h, combo de quatro histórias se ainda não adquiriu adicionais nem o combo de quatro; após outras 24h, Missão Família.
- Reconsultar antes de cada oferta e pular produtos já adquiridos sem interromper o restante da escada. Ausência de compra depois da espera não é registrada como recusa explícita.
- Não oferecer combo com prioridade se o pedido já foi entregue ou tem mais de 2h. Nesse caso, o bloco é pulado e os demais seguem as esperas; não prometer prioridade sem possibilidade de antecipação.
- Sem reprocessamento histórico. Reentrada no mesmo fluxo/produto/contato em sete dias é deduplicada. Reembolso ou cancelamento do pedido de entrada interrompe a sequência.

## Ofertas e identificação

- Colorir: 121026 e alias histórico, R$ 7,50, O63D7C194.
- Prioridade: 121025 e alias histórico; usada para identificar compra, sem checkout individual.
- Combo adicionais: ODDC26E96, R$ 13,00; produto principal 121025, oferta identificada pelo código. Copy informa taxas no checkout.
- Quatro histórias: O97B9CEC1, R$ 19,90; 121023, com distinção por offer_code.
- Missão Família: 121137, O264C610F, R$ 19,90.

IDs confirmados em dados públicos dos checkouts e adicionais reais já recebidos; nenhuma compra inferida apenas pelo valor. Consultas por titular e produto mantêm isolamento da conta e fonte. Não reenviado Purchase à Meta.

## Botões e editor

E-mails usam o editor visual existente e bloco de botão com URL rastreada. WhatsApp Uazapi usa /send/menu, type button e choices com URL conforme documentação oficial: https://docs.uazapi.com/endpoint/post/send~menu . O corpo também mantém o link clicável. Não repetir automaticamente uma tentativa de resultado incerto.

No editor, cada mensagem permite configurar produto oferecido e texto do botão; condições consultam compra do produto. Modelo, checkout, prévia e tempo acumulado permanecem disponíveis.

## Validação e estado final

19 testes de automações, compras, links, API, marketing e jornada aprovados. Teste adicional no mesmo cenário confirmou simulação sem pedido real e sem chamar o provedor. TypeScript local e builds de produção aprovados. Duas versões publicadas e 14 nós de oferta com botão conferidos no banco.

Na conferência final ainda não havia execuções reais desses novos fluxos. Entrega efetiva dos novos botões dependerá da próxima compra elegível; não houve disparo de teste para clientes.

Backup: /opt/trafficai/.backups/20261022-historinha-pos-compra/ (fontes e configuração anterior, sem segredos). Imagens de rollback: trafficai-backend:pre-pos-compra-20261022 e trafficai-frontend:pre-pos-compra-20261022. Ativação registrada em audit_log.
