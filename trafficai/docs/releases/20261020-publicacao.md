# Publicação — 20/10/2026

Publicação autorizada pelo usuário após integração do PR #1. Backend e frontend compilados na VPS antes de `docker compose up -d --no-build backend frontend`. Nenhum outro serviço reiniciado.

## Estado publicado

- Código integrado à main no merge 2b8a251.
- Compose principal: worker habilitado, envios/ações externas/IA paga desabilitados e base pública de links configurada.
- Instalador executado: dois produtos, dez fluxos novos em rascunho, 24 modelos (12 de e-mail e 12 de WhatsApp). Combo de quatro historinhas por R$19,90.
- Quiz: e-mail opcional e autorização opcional de recuperação, inicialmente desmarcada; answer_key adicionada ao funil canônico.
- Três arquivos do quiz publicados após backup. Nesta árvore Git estão em sites/historinha; os demais assets permanecem no site existente.

## Verificação

API healthy; painel HTTP 200; HTML e JavaScript públicos com os novos campos e versão 20261020-lifecycle1. Configuração compartilhada retorna um funil Historinha para MOBLYAR. Dez grafos validados sem erros. Novos fluxos com zero execuções e zero mensagens. Dezessete fluxos totais, todos em rascunho. Nenhum erro de inicialização observado na janela conferida.

Pré-publicação: 68 testes de backend aprovados e TypeScript do frontend aprovado na sincronização anterior. Builds de produção backend/frontend concluídos nesta publicação. Nenhum teste de pagamento, compra artificial, reenvio histórico ou disparo para clientes foi realizado.

## Backup e retorno

- Código/Compose anterior: /opt/trafficai/.backups/20261020-main-2b8a251-publicacao/.
- Imagens anteriores: trafficai-backend:pre-main-2b8a251 e trafficai-frontend:pre-main-2b8a251.
- Site anterior: /docker/quiz-historinha/bak-20261020-historinha-lifecycle-publicacao/.
- Cadastros são aditivos e idempotentes; não excluir histórico para reverter. Os novos fluxos permanecem em rascunho e podem ser revisados individualmente.

## Pendente

Revisar e testar entregas reais em destinatários autorizados e, depois, ativar explicitamente os fluxos escolhidos. Resend e Uazapi não tiveram envio real de teste nesta publicação. O worker ativo não significa que envios estejam liberados.
