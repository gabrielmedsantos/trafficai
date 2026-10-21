# Recuperações ativadas — 21/10/2026

Ativação explicitamente autorizada pelo usuário após a consulta de elegibilidade. Seis fluxos publicados por publishFlow(), com validação de produtos, referências, canais e snapshot dos templates. Upsell, tags automáticas e demais modelos não ativados.

## Canais e configuração

- Uazapi Site Marketing — Pixel A respondeu HTTP 200 / connected em consulta real.
- Resend: a consulta de domínios retornou HTTP 401 / restricted_api_key. A chave é restrita ao envio de e-mails; isso não é chave inválida. Nenhuma credencial foi trocada ou gravada nesta etapa. Consulta de domínio não é confirmação de entrega de e-mail.
- AUTOMATION_SENDS_ENABLED=true persistido no Compose principal e no override. Worker ativo. Ações externas e IA paga continuam desabilitados.
- Build backend concluído antes de reiniciar somente backend. Frontend não reiniciado nesta ativação.

## Fila inicial conferida

Um evento recente da Historinha ainda autorizado, inativo e sem compra foi reencaminhado uma única vez. Não foi feito reenvio de histórico geral. Geradas duas execuções, ambas waiting, no primeiro bloco de mensagem:

- WhatsApp: 21/10 às 15h16, America/Fortaleza.
- E-mail: 21/10 às 17h16, America/Fortaleza.

As esperas normais de uma e três horas foram preservadas. Os horários são previsão da fila, sujeitos à janela e à verificação de compra/descadastro. Até a conferência inicial, nenhuma mensagem havia sido enviada; aceite/entrega pelo provedor ainda não confirmados.

## Proteções mantidas

Compra antes do envio interrompe recuperação. Produto e canal isolados. Sem opt-in presumido de telefone, sem autorização transferida entre produtos e sem captação nova na Pedagogia. Somente as seis recuperações autorizadas foram ativadas. A consulta anterior não encontrou outras campanhas, jobs ou execuções que fossem liberados incidentalmente.

## Verificação e backup

API healthy e painel HTTP 200 após reinício. Backup Compose e configuração das automações em /opt/trafficai/.backups/20261021-ativacao-recuperacao-moblyar/. Imagem anterior preservada como trafficai-backend:pre-ativacao-recuperacao-20261021. A confirmação dos envios dependerá da execução dos horários programados e dos recibos dos provedores.
