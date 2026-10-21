# Operação do módulo

## Flags e endereços

AUTOMATION_WORKFLOWS_ENABLED=true inicia o worker persistido (padrão false).
AUTOMATION_SENDS_ENABLED=true permite mensagens reais (padrão false).
AUTOMATION_EXTERNAL_ACTIONS_ENABLED=true permite agentes/webhooks (padrão false).
AUTOMATION_PAID_AGENTS_ENABLED=true permite chamadas pagas além da aprovação/custo máximo no bloco (padrão false).
AUTOMATION_PUBLIC_BASE_URL=https://api.alfamaxdigital.com.br/api/v1 define URLs de descadastro, cliques e assinatura Twilio.

Reutiliza DATABASE_URL, JWT, ENCRYPTION_KEY e conexões/entitlements atuais. Não cadastrar credenciais no chat/arquivos. Novas credenciais são inseridas na interface e armazenadas criptografadas, nunca retornadas pela API.

Nova UI /automacoes e /automacoes/fluxos/:id. Regras de mídia /automation preservadas. API administrativa /api/v1/automation/workflows exige auth + automations. Equipe restrita precisa dessa capacidade; owner/actor existentes.

## Migrações e publicação

087 cria tabelas aw_*, versões imutáveis e outbox transacional de tracking_orders. 088 adiciona audiência/inscrições, campanhas, recibos, limites, intent externo, parâmetros e associação de ofertas. Não altera vendas históricas nem duplica contatos/pedidos, sem backfill. Eventos novos dependem da transição real do pedido.

Comparar hashes com o snapshot, verificar 087/088 livres, preservar arquivos em /opt/trafficai/.backups/20261018-automations-predeploy/. Imagens em execução devem receber tags de rollback antes do build. Subir somente arquivos do manifest FILES.json; nunca enviar o snapshot completo ou .env. Builds backend/frontend não ativam código porque não existem binds de fontes. .dockerignore exclui env/backups e testes backend.

Após build bem-sucedido, solicitar aprovação para aplicar SOMENTE 087/088 em transações e registrar _migrations; não rodar o runner de todas as migrations indiscriminadamente. Os SQL não estão na imagem runtime; aplicar através de um script Node usando conexão do backend e fonte SQL via stdin/mount somente leitura. Nunca imprimir conexão/segredos. Depois usar docker compose -f docker-compose.yml -f docker-compose.automations.yml up -d --no-build backend frontend, exclusivamente após autorização. Override é explícito e não carrega automaticamente. Primeira ativação proposta: worker true; envios/externos/pagos false.

Verificar readiness, logs sanitizados, rotas autenticadas e ausência de regressão. Não fazer envio real nem criar campanhas comerciais como teste. CRM/tag/tarefa em execução real são efeitos reais mesmo com mensagens desligadas; simulação test_mode evita todos esses efeitos.

Rollback primário: imagens/arquivos anteriores, desligar worker e restaurar o Compose original. SQL 087.rollback.sql é manual/destrutivo para TODAS as tabelas do módulo (087/088); nunca executar sem nova aprovação/backup. Não altera _migrations; reconciliar registro se houver rollback de schema. Restaurar schema não desfaz mensagens já enviadas.

## Provedores

WhatsApp reutiliza comm_integrations: whatsapp_cloud, whatsapp_evolution e whatsapp_uazapi. Seleção exata, sem fallback de número; UazAPI respeita entitlement. Conexões são gerenciadas em /comercial/integrations. Não reiniciar Evolution ou outros serviços. Cloud exige template/idioma e parâmetros compatíveis, assinatura APP_SECRET existente para recibos. Marketing requer opt-in/descadastro em todos os canais.

Resend: remetente from/reply_to, domínio verificável com credencial que permita domains.list. Callback POST /api/v1/automation-public/receipts/resend/:integrationId, corpo bruto e assinatura Svix, webhook_secret cadastrado na interface. Tipos reconhecidos: entrega, abertura, bounce/complaint e falha conforme adapter. Twilio: POST /api/v1/automation-public/receipts/twilio/:integrationId com assinatura HMAC da URL pública exata. Não usar URLs com credenciais.

Evolution consulta /chat/findMessages/:instance por key.id. UazAPI consulta /message/find pelo lookup ID retornado. Poll limitado a 5 mensagens/ciclo, no máximo uma consulta por mensagem/5min e últimos 7 dias. Somente status explícito e ID exato atualiza entrega/leitura; SERVER_ACK é aceite. Versões reais ainda precisam homologação. Recibos anteriores ao commit ficam persistidos para reconciliação.

Agente/webhook externo: HTTPS público sem query de autenticação, bearer protegido. Recebe execution_id, node_id, prompt, input {product,order_status}, max_cost, currency; Idempotency-Key estável. Espera {execution_id,status:"completed",output:{result},cost:{amount,currency}}; cost é obrigatório quando pago e deve respeitar limite. Resultado incerto exige intervenção; sem reenvio automático. Não envia PII do contato automaticamente. Custo máximo é por chamada, sem orçamento cumulativo.

## Garantias e limites

Jobs usam SKIP LOCKED/lease; esperas due_at; validação de pagamento/consentimento ocorre antes de envio. Versão, fonte, produto, recuperação e modelos são congelados. Destino/estado/conexão atuais são revalidados. Opt-out GET só mostra confirmação; POST idempotente; hashes impedem contorno por contatos duplicados. Quotas atuais: 10s por conexão e 60 mensagens/min por conta, além de máximo do fluxo.

Não há atomicidade entre provedor externo e commit SQL: falha após aceite pode ficar incerta, sem ID persistido. Retomar exige recibo confirmado; caso sem confirmação deve ser investigado/cancelado. Não há botão para repetir cegamente.

Receita atribuída exige clique + sck exato devolvido no pedido, dentro da janela e conta/fonte/produto. Valores separados por moeda. Abertura não prova leitura humana; custo não disponível não significa gratuito. Testes são excluídos dos indicadores reais.

## Validação local

Backend: npm run build; node --test tests/*.test.cjs (precisa HTTP loopback permitido). Banco PGlite temporário, mocks e credenciais efêmeras, sem produção.
Frontend: npm run build; npx eslint src/app/automacoes src/components/automations; npx tsc --noEmit.
Prévia: backend node tests/support/workflows-preview.cjs (3001 loopback, auth fictícia somente nesse harness, nunca publicar); frontend npx next start --hostname 127.0.0.1 --port 3400. Encerrar ambos ao terminar. Docker runtime não inclui testes.

FILES.json lista hashes dos fontes de deploy/testes. DEPLOYMENT.md registra backup/build/estado efetivo. BACKLOG.md separa homologações e limites pendentes.
