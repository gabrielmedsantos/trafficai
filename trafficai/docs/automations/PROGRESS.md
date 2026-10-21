# Progresso — 18/10/2026

## Estado

Módulo publicado na VPS após aprovação explícita. Migrations 087/088 aplicadas; backend/frontend ativados nas imagens compiladas. Worker habilitado, mensagens reais/ações externas/IA paga desligadas. Nenhum envio real, campanha ou chamada paga. Backup e rollback preservados em /opt/trafficai/.backups/20261018-automations-predeploy-01. A VPS continua a fonte da verdade; workspace local atualizado. O espelho /Volumes/WinInstall/boot/ANTIGRAVITY/trafficai continua indisponível.

## Implementado

- Central integrada à Sidebar e capacidade automations, autenticação/owner/actor existentes, APIs isoladas e auditoria. Preserva /automation para regras de mídia e usa /automacoes para o módulo novo.
- Canvas React Flow: tipos de bloco, handles Sim/Não, zoom/pan/minimapa, inspeção/configuração, validação DAG, revisão otimista, desfazer/refazer, versões publicadas imutáveis, snapshots de modelos, duplicação/importação/exportação JSON e simulação persistida.
- Motor persistido no PostgreSQL com eventos/outbox de pedidos existentes, fila, leases, esperas, retries seguros, cancelamento após pagamento/descadastro, intervenção para resultado incerto, histórico e retomada somente após confirmação do provedor. Arquivar um fluxo cancela os jobs pendentes.
- WhatsApp oficial Cloud e não oficial Evolution/UazAPI reutilizam conexões do CRM. Seleção por ação ou padrão do fluxo congelado na publicação; sem troca silenciosa de número. Template Cloud/parâmetros/idioma e descadastro marketing; respeita entitlement UazAPI.
- E-mail Resend: verificação de domínio, remetente/reply-to, assunto/preheader, texto e designer estruturado com preview sanitizado. Assistente cria boas-vindas/nutrição, recuperação de pedido/Pix e pós-compra/entrega; editáveis no canvas. Recuperação espera 30 minutos antes da primeira mensagem. SMS por Twilio configurável.
- Contatos reutilizam CRM; consentimento explícito por canal, supressão por destino, inscrição única/reentrada confirmada, tags, atualização de campos e tarefas. Não mudou a coleta do quiz.
- Segmentos com preview e campanhas com versão/audiência congeladas, confirmação/agendamento, lotes persistidos, pausa/cancelamento e contagem de falhas. Produtos e ofertas estruturadas editáveis; associação exige fonte/ID externo inequívoco.
- Recibos autenticados Resend/Twilio, status Cloud via webhook já existente com assinatura, reconciliação de recibos antecipados; consulta autenticada Evolution/UazAPI pelo ID exato. Aceite não equivale a entrega, abertura é apenas sinal.
- Limites por conexão e por conta; endpoints externos protegidos por HTTPS/DNS público fixado, sem redirecionamento. Agentes/webhooks configuráveis com intent persistido, idempotência, timeout, custo máximo por chamada e flags separados. Sem agente fictício.
- Analytics reais por período/produto/fluxo/canal e valores separados por moeda. Atribuição exige clique e sck exato devolvido no pedido. Custo ausente é indisponível; não é zero.

## Verificação

Backend compila; suíte completa 45/45 passou (inclui tracking/quiz/pagamentos existentes). Último ajuste da prévia de campanhas: regressão direcionada 6/6 passou. Frontend build e TypeScript passaram; lint e TypeScript finais das rotas/componentes novos passaram.

Testes com PGlite descartável, JWT real e HTTP somente local, provedores simulados e chaves fictícias efêmeras. Cobrem isolamento, consentimento, versões/modelos, inscrições, campanhas, assinaturas, recibos, SSRF/DNS, retries/incerteza, esperas e ofertas. Não equivalem a teste concorrente multiworker em PostgreSQL nativo.

Navegador local: assistente criou sequência, publicação v1 e simulação completaram; troca para WhatsApp limpou modelo/conexão anteriores e permitiu selecionar Evolution Linha B; segmento foi calculado/salvo; campanha foi criada e audiência revisada sem disparo. Screenshots contêm exclusivamente fixtures identificadas TESTE LOCAL.

## Pendências de lançamento

1. Backup, 54 fontes, builds, migrations e ativação concluídos e registrados em DEPLOYMENT.md.
2. Aprovação recebida e executada; validar o uso autenticado pelo navegador da conta, pois a sessão de inspeção estava sem login.
3. Homologar concorrência e retomada em PostgreSQL nativo de staging, impacto do trigger e recuperação do backup.
4. Homologar versões reais dos provedores e recibos com conexão/remetente/destinatário de teste definidos e autorização de envio. Custos reais dependem dos provedores; não foram inventados.
5. Ativar envios/ações externas separadamente após aprovação; nenhuma campanha ou sequência comercial foi criada em produção.

Ver BACKLOG.md e OPERATIONS.md para limites restantes. Não afirmar que homologação externa ou lançamento já ocorreu.
