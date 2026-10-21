# Auditoria — TrafficAI Automations — 17/10/2026

## Fontes e infraestrutura

A VPS /opt/trafficai é a fonte da verdade e não é um repositório Git. Snapshot de código em automation-work, sem .env, tokens ou banco. Next.js 16.1.6/React 19.2.3/TypeScript; Express 4/TypeScript; pg/PostgreSQL; Docker Compose e Traefik. API cliente compartilhada, JWT com owner/actor e guard de assinatura. CSS global usa Inter, superfícies grafite e azul #0ea5e9. Lucide e Recharts já instalados; React Flow não estava instalado.

## Interface auditada e referências

/automation hoje tem regras de mídia SE/ENTÃO, sem workflows de marketing. Preservar página e endpoints de regras em /automation/rules. As referências Behance foram visualizadas no navegador (o fetch HTTP retornou 403). Ref 1: resumo com KPI destacado, hierarquia de cards e navegação discreta. Ref 2: canvas pontilhado, categorias de nós, resumo de contexto e logs. Dribbble: biblioteca esquerda, canvas central e inspetor lateral, ações salvar/publicar fixas. Aproveitar padrões, sem copiar marca, imagens ou composição integral.

Referências:
- https://www.behance.net/gallery/234623943/AI-Automation-SaaS-Dashboard-UIUX-Case-Study
- https://www.behance.net/gallery/252820161/Agentic-AI-Workflow-Automation-Dashboard-UI-UX-Design
- https://dribbble.com/shots/26897171-Automation-Workflow-Builder-Dashboard-UI-UX-Design-SaaS-Platform

## Reutilização

- auth/auth.middleware.ts resolve tenant userId e actorId. team/capabilities.ts permite controle por módulo; adicionar automations sem ignorar capacidades explícitas. Filtrar todos os recursos por dono e validar conta/fonte.
- database/connection.ts: query/queryOne/transaction. Migrations SQL numeradas; nunca executar automaticamente na subida do módulo.
- tracking_orders: fonte única de pedidos/pagamentos. sales-orders.service.ts normaliza e faz upsert idempotente. Webhooks públicos já validam autenticação.
- comm_deals é a base atual de leads/contatos; comm_tasks, comm_pipeline_stages e comm_messages fornecem atividades e histórico. Não existe tabela de contatos separada. Não vincular por nome. Associação exata por identificador do CRM ou contato inequívoco; ambiguidade fica explícita.
- comm_integrations: WhatsApp Cloud, Evolution e UazAPI já têm configurações. Reutilizar referência em vez de copiar credenciais.
- Resend já é dependência para e-mail. Não há provedor de SMS pronto.
- Existe Gestor IA de tráfego, mas nenhum cadastro de agentes de conversa WhatsApp nos fontes ou tabelas auditados. Não apresentar o Gestor IA como agente de atendimento. A conexão de agentes depende de um adaptador com fonte real.
- Workers usam node-cron. Não há fila durável do módulo. Criar fila PostgreSQL com bloqueio e lease, sem Redis.
- Criptografia AES-256-GCM já existe em shared/encryption.ts. Audit log em audit/audit.service.ts.
- Testes node:test/PGlite e npm run build; frontend npm run build e ESLint.

## Decisões

1. Submódulo separado sob /automation/workflows e API /automation/workflows, mantendo regras antigas. Navegação /automacoes para central visual para não quebrar /automation existente.
2. Versões publicadas imutáveis, grafo schemaVersion=1 validado no backend. Fluxos sem ciclo por padrão; repetições só quando implementadas com limite.
3. Eventos internos e jobs persistidos no PostgreSQL, idempotência por tenant/origem/external_id, versão congelada por execução, atrasos em due_at, SKIP LOCKED e leases.
4. Pagamento reconsultado imediatamente antes de recuperação. Envios com resultado incerto vão para intervenção; não repetir automaticamente um envio que pode ter sido aceito.
5. Worker novo desabilitado até configuração explícita; nenhuma campanha real é iniciada nesta implementação. Provedores sem credenciais retornam indisponível, não enviado.
6. Métricas de entrega/custo são null/indisponível até confirmação do provedor. Receita só recebe atribuição por clique rastreado e pedido exato, sem causalidade inferida por proximidade temporal.

## Plano por etapas e arquivos

1. Fundação: migration 087_automation_workflows.sql; backend/src/automation/workflows/{types,validation,repository,controller}.ts; capabilities e API routes; preservação de regras existentes.
2. Editor: frontend/src/app/automacoes/* e components/automations/*; @xyflow/react para canvas, handles, minimapa, seleção e zoom; CSS usa tokens globais.
3. Execução: engine.ts, worker.ts, events.ts, providers.ts; outbox transacional no banco de pedidos; retomada durável, logs de etapas e cancelamento.
4. Produtos/ofertas/recuperação: CRUD escopado, referências para fonte/order/CRM, mensagens e elegibilidade.
5. Canais/modelos/campanhas: adaptadores explícitos, credenciais criptografadas quando necessárias, conteúdo sanitizado, supressões/consentimentos, confirmação de campanhas.
6. CRM/agentes: referências existentes e capabilities reais. Sem agente fictício ou chamada paga de teste.
7. Analytics, testes unitários e HTTP/PGlite, UI desktop/mobile, docs e progresso. Build antes de pedir autorização para migrations/reinícios/publicação.

## Variáveis / dependências

Reutilizar DATABASE_URL, ENCRYPTION_KEY, configuração de JWT e provedores já existentes. Novas: AUTOMATION_WORKFLOWS_ENABLED, AUTOMATION_SENDS_ENABLED (false até ativação) e AUTOMATION_PUBLIC_BASE_URL (base HTTPS da API para links públicos). Nada de chaves pagas em testes. @xyflow/react é a única dependência proposta para o editor. Credenciais de providers devem ser configuradas na aplicação, nunca em chat ou arquivo.
