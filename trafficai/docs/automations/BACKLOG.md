# Critérios finais e pendências

## Concluídos no candidato

Seleção Cloud/Evolution/UazAPI por ID e padrão do fluxo; limpeza de canal incompatível; snapshots de modelos; parâmetros/descadastro; recibos autenticados e consulta pelo ID; limites de envio; remetente verificado; designer e preheader; inscrições/reentrada; segmentos e campanhas duráveis; assistente de e-mail com três objetivos; produtos/ofertas; importação/exportação/duplicação; agentes/webhooks com intent e custo máximo por chamada; analytics por moeda/canal/fluxo; intervenção segura; capacidade automations no formulário da equipe.

## Ainda exige homologação/ativação

- PostgreSQL nativo: múltiplos workers, morte do processo durante espera/despacho, overhead do outbox sob carga e restauração.
- Provedores: conexão real de cada tipo, template Cloud aprovado/parâmetros, assinatura e entrega/read, domínio Resend e bounce/complaint, Twilio e preços. Evolution/UazAPI variam por versão; resposta não reconhecida fica sem entrega confirmada, com erro de consulta quando aplicável.
- Banco e deploy concluídos após aprovação. Envios reais, ações externas e agentes pagos permanecem desligados; precisam de homologação separada.
- Original mirror /Volumes/WinInstall indisponível; sincronizar quando montado.

## Limites explícitos desta versão

- Um gatilho por fluxo; DAG sem ciclos/convergências. No máximo 100 blocos/200 conexões. Campanhas até 10 mil destinatários, processamento em lotes de 25. Listagens operacionais limitadas (não há paginação universal).
- Segmentos filtram CRM existente por canal/opt-in, tag, status, busca e compra/produto pela API; UI oferece canal/tag/busca. Nenhuma nova coleta automática de PII no quiz.
- Não há catálogo pré-existente de agentes conversacionais: o nó usa contrato externo configurado. Limite é por chamada; não há teto financeiro cumulativo multicanal. Envio/incerteza não deve ser reprocessado às cegas.
- Custos de mensagem não são estimados automaticamente. Analytics exibe apenas valor confirmado disponível; custo de agente é auditável no resultado da etapa e ainda não é agregado ao painel de mensagens.
- Atribuição depende do checkout devolver sck. Não prometer compatibilidade universal sem homologar cada plataforma.
- Arquivamento do fluxo existe na API; produtos/modelos/canais são editáveis, mas não há exclusão em massa nem gestão completa de arquivo na UI. Modelos em versões publicadas permanecem imutáveis via snapshot.
- Biblioteca guiada oferece três objetivos de e-mail. Outros fluxos e condições são montados no canvas; não há IA gerando fluxo automaticamente.

- Filtro de segmento por compra/produto usa atualmente o ID externo principal do produto; ampliar sua associação às ofertas antes de usar segmentação de compra por oferta. Recuperação e cancelamento por oferta já têm teste específico.
