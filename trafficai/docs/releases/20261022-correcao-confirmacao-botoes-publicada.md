# Correção da confirmação de compra e botões de recuperação — 22/10/2026

Publicação, atualização dos fluxos e liberação dos envios expressamente autorizadas pelo usuário após compilação e prévia do reparo. Reiniciado somente o backend. API healthy e painel HTTP 200.

## Causa e correção

A confirmação transacional tinha parâmetros de template Cloud, incluindo unsubscribe_url, embora não usasse template Cloud nem criasse link de descadastro. O motor tentava renderizar esse parâmetro vazio antes de chamar o provedor. Como o sinal externalAttempted era marcado antes da montagem do objeto da requisição, o erro local era tratado incorretamente como SEND_RESULT_UNKNOWN.

O motor agora só renderiza parâmetros Cloud quando há provider_template e só marca a tentativa externa depois de montar e validar o objeto de envio. O gerador de pós-compra não inclui parâmetros de marketing na confirmação transacional. Regressão cobre a confirmação comum com parâmetros antigos e falha de montagem sem chamada ao provedor, classificada como EXECUTION_ERROR em vez de envio incerto.

## Recuperação com botão

As seis recuperações ativas estavam publicadas sem buttonText; os e-mails não tinham bloco visual de botão. Publicadas novas versões 2 com 39 nós de mensagem com botão: Uazapi usa /send/menu e e-mail usa bloco visual com checkout rastreado. Os links e regras de compra/consentimento/janela foram preservados.

Duas versões de pós-compra também foram atualizadas para corrigir os modelos de confirmação. Modelos anteriores e versões históricas foram preservados; foram criadas cópias dos modelos alterados. O gerador padrão de recuperação também passou a configurar o botão.

## Reparo autorizado

O script repair-confirmation-buttons-20261022.cjs é somente prévia por padrão, exige flag explícita para aplicar, recusa rascunhos não publicados e valida que os envios a retomar têm a causa transacional específica e nenhum ID do provedor. Não repete casos de erro externo genuinamente incerto.

- 8 versões de fluxo publicadas em versão 2.
- 14 execuções aguardando próximas etapas migradas para as versões com botões.
- 8 confirmações liberadas: quatro compradores, WhatsApp e e-mail.
- Conferência inicial: quatro WhatsApps e quatro e-mails com status sent e sem error_code, aceitos pelos provedores. Isso ainda não equivale a confirmação de entrega ao destinatário.
- Mensagens já entregues não foram repetidas. O WhatsApp antigo em PROVIDER_SERVER_ERROR continua em revisão.
- Pedidos financeiros e eventos Purchase da Meta não foram alterados.

## Validação e rollback

Build backend concluído antes de reiniciar. Doze testes de fluxo, pós-compra, recuperação e destino de compra aprovados; verificação adicional de marketing testa o payload /send/menu com botão URL sem envio externo. Testes usam fixtures locais e provedores simulados.

Backup: /opt/trafficai/.backups/20261022-correcao-confirmacao-botoes/ — fontes, versões, fila e estado anterior. O engine compilado da instância anterior foi preservado em engine-live.js e em trafficai-backend:pre-correcao-confirmacao-20261022. Nenhuma credencial foi copiada. Aplicação registrada em audit_log como repair_confirmation_buttons.
