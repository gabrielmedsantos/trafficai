# Recuperações publicadas — 21/10/2026

Publicação autorizada pelo usuário, com envios desativados. PR #3 integrado à main em 86e68cf. Imagens de backend/frontend compiladas previamente em área isolada e aplicadas com docker compose up -d --no-build backend frontend. Não houve publicação de fluxos nem teste de disparo real.

## Configuração instalada

- Historinha: recuperação do quiz interrompido e recuperação de compra, cada uma por WhatsApp/e-mail.
- Clube da Pedagogia: recuperação de compra por WhatsApp/e-mail. Usuário escolheu manter a página; não foi criado formulário ou quiz da Pedagogia.
- Seis fluxos em draft, 39 modelos utilizados (seis contatos WhatsApp e sete e-mail por jornada), todos com descadastro.
- Uazapi Site Marketing — Pixel A e Resend existentes. Envios, ações externas e IA paga permanecem desativados; worker habilitado.
- Os quatro antigos rascunhos da Historinha por status foram arquivados; upsell, tags, modelos padrão e histórico preservados.
- Consentimento do CRM é reaproveitado apenas na mesma jornada/produto e canal. Telefone isolado não cria autorização. Sem importação histórica nem transferência de autorização entre produtos.

## Verificação posterior

API healthy, painel HTTP 200, seis grafos sem erros, seis rascunhos e 39 mensagens conferidos no banco. Zero execuções e zero mensagens nos seis fluxos após instalação. Todos têm stop_on_purchase=true; preservação de oferta e prevenção de repetições estão no código publicado.

Pré-publicação: 71 testes backend passaram; após a última proteção de consentimento, cinco testes de integração específicos passaram; três testes do instalador final passaram. Frontend TypeScript aprovado e builds de produção concluídos.

## Backups

/opt/trafficai/.backups/20261021-recuperacao-moblyar-publicacao/ contém código/Compose anteriores, snapshot de configuração das automações e resultado da instalação. Imagens anteriores: trafficai-backend:pre-recuperacao-moblyar-20261021 e trafficai-frontend:pre-recuperacao-moblyar-20261021. Snapshot não inclui contatos/clientes ou credenciais de integrações.

## Pendente

Validar entregas reais em destinatários autorizados e ativar explicitamente os fluxos escolhidos. Os seis fluxos ainda não recuperam automaticamente enquanto permanecerem em rascunho e com envios globais bloqueados. O histórico sem autorização não foi inscrito.
