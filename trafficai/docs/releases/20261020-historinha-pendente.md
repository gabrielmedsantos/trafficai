# Historinha — configuração pronta para revisão

Estado: preparada, ainda não publicada. Nenhum contato real importado ou mensagem enviada.

## Integração
- Um funil canônico da Historinha, visível em CA5 e MOBLYAR; não duplica sessões ou pedidos.
- Pedidos e recuperação mostram a jornada compartilhada, sem atribuir campanhas ausentes por suposição.
- Quiz interrompido tem lista própria; pedidos pendentes permanecem separados.
- E-mail opcional e autorização explícita, desmarcada inicialmente. Não autorizar não bloqueia o quiz.
- Compra do produto interrompe a recuperação mesmo quando registrada na outra fonte. Não usa nome ou valor para adivinhar vínculos.
- Upsell: Combo 4 historinhas por R$ 19,90, checkout https://payment.ticto.app/O97B9CEC1, oferta 179702. Compra básica não interrompe este upsell; compra aprovada do combo interrompe.

## Cadastro no banco (somente após autorização de publicação)
- 2 produtos: livro básico e combo. Um pipeline dedicado de contatos.
- 10 fluxos em rascunho: 6 de recuperação, 2 de upsell e 2 de marcação de compra.
- 24 modelos: cada sequência abaixo existe nos canais e-mail e WhatsApp.
- Nenhum pedido é criado pelo instalador, nenhum contato antigo é inscrito e nenhum fluxo é publicado.
- E-mail: Alfamax — Resend; respostas para atendimento@alfamaxdigital.com.br.
- WhatsApp: conexão Uazapi já vinculada à fonte CA5. Configuração e disponibilidade no plano verificadas, sem envio de teste.

## Cadência preparada
- Quiz interrompido: elegível após 30 min sem atividade; primeiro contato 1 h após entrada no fluxo.
- Pagamento pendente/recusado: primeiro contato 1 h após o evento.
- Contatos seguintes: 24 h de intervalo, máximo de 3 mensagens por sequência.
- Upsell: primeiro contato após 24 h, até 3 contatos.
- Janela de envio: 09h–19h, America/Fortaleza. Descadastro em todas as mensagens.
- Antes de cada envio: verificar autorização, supressões e compras do produto/oferta.

## Mensagens para revisão (mesmo texto nos dois canais)

### Upsell do combo

1. Olá, {{name}}! Obrigado pela compra da sua historinha. Quer conhecer outras aventuras? Temos o combo de 4 historinhas por R$ 19,90: {{checkout_url}}. É uma compra adicional e opcional. Para não receber mais: {{unsubscribe_url}}

2. Oi, {{name}}! No combo, a criança pode viver aventuras na floresta, no reino encantado, na fazendinha e no fundo do mar. Conheça as 4 historinhas por R$ 19,90: {{checkout_url}}. Para não receber mais: {{unsubscribe_url}}

3. Olá, {{name}}! Este é nosso último convite para conhecer o combo de 4 historinhas por R$ 19,90: {{checkout_url}}. Sua compra anterior continua normalmente, mesmo sem o combo. Para não receber mais: {{unsubscribe_url}}

### Quiz interrompido

1. Olá, {{name}}! Você pediu ajuda para criar o livro personalizado. Ficou alguma dúvida? Você pode continuar a personalização aqui: {{checkout_url}} Para não receber mais: {{unsubscribe_url}}

2. Oi, {{name}}! O livro é personalizado com o nome e as características da criança. Se quiser continuar, acesse {{checkout_url}}. Se precisar de ajuda, responda esta mensagem. Para não receber mais: {{unsubscribe_url}}

3. Olá, {{name}}! Este é nosso último lembrete para continuar sua historinha: {{checkout_url}}. Se agora não for o momento, tudo bem. Para não receber mais: {{unsubscribe_url}}

### Pagamento recusado

1. Olá, {{name}}! O pagamento do seu pedido de {{product}} não foi aprovado. Se quiser tentar novamente, confira as opções disponíveis: {{checkout_url}}. Podemos ajudar por aqui. Para não receber mais: {{unsubscribe_url}}

2. Oi, {{name}}! Quer ajuda para concluir o pagamento de {{product}}? Confira seu pedido e as formas disponíveis aqui: {{checkout_url}}. Para não receber mais: {{unsubscribe_url}}

3. Olá, {{name}}! Se ainda quiser concluir seu pedido, acesse {{checkout_url}}. Se já pagou, desconsidere este lembrete e fale conosco para conferirmos. Para não receber mais: {{unsubscribe_url}}

### Pagamento pendente

1. Olá, {{name}}! Seu pedido de {{product}} está aguardando pagamento. Ficou alguma dúvida para concluir? Confira o checkout: {{checkout_url}}. Para não receber mais: {{unsubscribe_url}}

2. Oi, {{name}}! Passando para saber se você precisa de ajuda com seu pedido de {{product}}. Acesse {{checkout_url}} para consultar as opções de pagamento. Para não receber mais: {{unsubscribe_url}}

3. Olá, {{name}}! Este é nosso último lembrete do pedido de {{product}}: {{checkout_url}}. Se agora não for o momento, não precisa fazer nada. Para não receber mais: {{unsubscribe_url}}

## Publicação prevista

1. Aplicar flags no Compose principal: worker=true, envios=false, ações externas=false, IA paga=false e URL pública dos links.
2. Subir somente backend e frontend com as imagens já compiladas.
3. Rodar o instalador de produtos/modelos/rascunhos e adicionar recoveryConsent às chaves aceitas do funil, preservando respostas antigas.
4. Fazer backup do site e publicar apenas index.html, app.js e model.js preparados.
5. Verificar saúde da API, funil compartilhado, lista de recuperação, produtos e rascunhos; não reenviar eventos históricos nem mensagens.
6. Ativação de envios é separada: revisar sequências e destinatários, validar testes reais de e-mail/WhatsApp, então publicar os fluxos selecionados com autorização explícita.

## Arquivos e rollback

- Backup: /opt/trafficai/.backups/20261020-historinha-lifecycle/.
- Imagens anteriores preservadas: trafficai-backend:pre-historinha-lifecycle-20261020 e trafficai-frontend:pre-historinha-lifecycle-20261020.
- Site preparado em /opt/trafficai/stage-historinha-lifecycle/site/, ainda fora do diretório servido.
- A cópia local usada é automation-work/. O volume externo antigo continua indisponível.

## Validação final

- Backend e frontend compilados sem reiniciar a produção.
- Suíte selecionada: 34 testes aprovados; verificações adicionais de recuperação aprovadas; 16 testes de runtime aprovados na imagem final.
- Prévia isolada: e-mail opcional validado, endereço inválido bloqueado e consentimento preservado marcado/desmarcado.
- Uazapi conectada. Resend verificado; entrega real de e-mail ainda depende de teste autorizado.
- Upsell interrompido se a compra original deixar de estar aprovada ou se o combo já tiver sido comprado.
- Nenhum cadastro de produção aplicado, mensagem enviada ou evento histórico reenviado nesta preparação.
