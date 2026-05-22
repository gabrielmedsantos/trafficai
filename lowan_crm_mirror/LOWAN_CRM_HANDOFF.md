# Lowan CRM — Handoff Document
**Local do documento:** `/root/LOWAN_CRM_HANDOFF.md` na VPS
**Última atualização:** 2026-04-15

---

## 📍 Localização / Infraestrutura

**VPS:** `root@204.168.190.107` (Ubuntu, ssh direto)
**Domínio:** `lowan.site` (Cloudflare + nginx + letsencrypt)
**Stack:** Docker Compose em `/root/docker-compose.yml`
**Banco:** PostgreSQL 16 em container `wablast_postgres`
- DB: `whatsapp_blast`
- User/pwd: `postgres` / `postgres`
- Backup diário em `/root/backups/`

### Containers

| Container | Imagem | Porta | Função |
|---|---|---|---|
| `wablast_frontend` | `root-frontend` (nginx) | 127.0.0.1:8081 → 80 | SPA HTML + estáticos |
| `wablast_api` | `root-api` (node:20) | 127.0.0.1:3000 → 3000 | Fastify backend |
| `wablast_worker` | `root-worker` | - | BullMQ queue worker |
| `wablast_postgres` | `postgres:16-alpine` | 5432 interno | DB |
| `redis` | `redis:7-alpine` | 6379 interno | Queue + cache |

### Source vs Runtime (IMPORTANTE)

O código **rodando** está em `/app/dist/` **dentro do container** (compiled JS do TypeScript). Os arquivos em `/root/whatsapp-blast/src/` (TS source) estão **desatualizados** — alguém editou direto o `/app/dist` em produção. Mudanças feitas direto no container somem em `docker compose build`.

### Nginx

- `/etc/nginx/sites-enabled/lowan.site` roteia `lowan.site/*` → `127.0.0.1:8081` (frontend) e `/api/*` → `127.0.0.1:3000` (backend)
- Frontend container tem nginx interno com rotas SPA + `/api-docs/` adicionado manualmente

---

## 🧱 Módulos Backend (todos em `/app/dist/modules/`)

Padrão: cada módulo tem `*.routes.js`, `*.service.js`, `*.controller.js`, `*.middleware.js`.

Módulos existentes: `auth`, `campaigns`, `connections`, `contacts`, `dashboard`, `financial`, `kanban`, `leads`, `models`, `settings`, `super`, `telegram`, `templates`, `webhooks` (inbound Meta).

**Módulos adicionados neste chat:**
- `integrations/` — gerencia API keys + webhooks de saída (JWT admin-only)
- `public/` — endpoints públicos com autenticação por API key

### Auth patterns
- JWT middleware: `leads.middleware.js::authenticateLeadUser` → popula `req.leadUser = { id, role, workspaceId, permissions }`
- Admin only: `requireLeadAdmin`
- **API Key (novo)**: `integrations.service.js::authApiKey` → valida `Authorization: Bearer lwn_...` ou `X-API-Key: lwn_...`, popula `req.leadUser` com role=ADMIN e todas permissões

---

## 🗄️ Schema do Banco — Tabelas principais

- `lead_users` — operadores (workspace users). Campos: id, workspace_id, name, email, role (ADMIN|COLLABORATOR), is_active
- `leads` — id, workspace_id, contact_id, name, phone, email, assigned_to_id, stage_id, status, origin, notes, tags, starred, created_at, updated_at, last_message_at, unread_count
- `messages` — direction (INBOUND|OUTBOUND), contact_id, message_content, sent_at
- `contacts` — phone_normalized (canônico), name
- `stages` — kanban stages com pipeline_id, name, color, position
- `financial_types` — Venda, Deposito (por workspace, active flag)
- `financial_records` — lead_id, financial_type_id, amount, operator_id, operator_name, period (YYYY-MM), description, deleted_at
- `operator_goals` — operator_id, financial_type_id, period, goal_amount
- `type_commissions` — financial_type_id, percentage

### Tabelas novas (migração aplicada em 2026-04-15)

Arquivo: `/root/integrations_migration.sql`

- `api_keys` — id, workspace_id, name, key_hash (SHA-256), key_prefix, created_by_id, scopes jsonb, rate_limit, last_used_at, last_used_ip, revoked_at
- `outbound_webhooks` — id, workspace_id, name, url, events jsonb, secret, enabled, last_fired_at, last_success_at, last_failure_at, failure_count
- `outbound_webhook_deliveries` — webhook_id, event, payload jsonb, status_code, response_body, attempts, succeeded_at, failed_at

---

## 🎨 Frontend (HTML monolítico de ~8500 linhas)

Arquivo único: **`/root/leads_index.html`** (source) + servido de `/usr/share/nginx/html/leads/index.html` no container `wablast_frontend`.

**Caminho canônico:** sempre edite a versão do container + copie pra `/root/leads_index.html` via `docker cp` (pra manter sincronia).

### Arquitetura do frontend

- **Single-page app** sem framework — estado em `S = {...}` global, função `render()` que re-renderiza tudo baseado em `S.view` / `S.tab`
- Views: `leads` (principal), `inbox` (conversas), `kanban`, `estatisticas`, `conexoes`, `configuracoes`, `super`
- Sub-tabs em Configurações: `equipe`, `tags`, `modelos`, `financeiro`, `integracoes` (novo)
- Renderers: `renderLeadsPanel`, `renderInboxPanel`, `renderKanbanPanel`, `renderStatsPanel`, `renderSettingsPanel`, etc.

### Helpers globais importantes
- `api(path, opts)` → chama `/api/v1/leads{path}` com JWT
- `apiFin(path, opts)` → chama `/api/v1/financial{path}`
- `apiInt(path, opts)` → chama `/api/v1/integrations{path}` (novo)
- `getToken()` → lê JWT do localStorage
- `showToast(msg, type)` → notificação
- `esc(s)` → HTML escape
- `render()` → re-render de `S.view`

---

## 🚀 Mudanças feitas neste chat

### 1. **Correção de atribuição financeira** (crítico)
**Bug**: Admin adicionar valor no lead atribuía ao admin, não ao dono do lead.
**Fix**: `/app/dist/modules/financial/financial.routes.js` — na rota `POST /lead/:leadId`, agora busca `assigned_to_id` do lead. Body pode passar `operatorId` pra sobrescrever.
**SQL retroativo** rodado 1x:
```sql
UPDATE financial_records fr
SET operator_id = l.assigned_to_id, operator_name = lu.name
FROM leads l JOIN lead_users lu ON lu.id = l.assigned_to_id
WHERE fr.lead_id = l.id AND fr.deleted_at IS NULL
  AND l.assigned_to_id IS NOT NULL
  AND l.assigned_to_id != fr.operator_id;
```
(idempotente, pode rodar de novo se novos casos aparecerem)

### 2. **Ranking em formato pódio comercial** (estatísticas)
Substituiu a lista linear por pedestais visuais:
- 2º esq (195px) · 🥇 1º centro (230px) · 🥉 3º dir (165px)
- Gradientes ouro/prata/bronze, avatar circular acima com medalha flutuante, card branco embaixo com total + % meta + comissão
- Posições 4+ em lista compacta abaixo
**Arquivo**: bloco dentro do `renderStatsPanel` — busque `PODIUM LAYOUT` no HTML.

### 3. **Dashboard com metas financeiras**
Novas KPI cards abaixo dos 4 existentes:
- **Admin dashboard** (`renderAdminDashboard`): total agregado por tipo (META VENDA, META DEPÓSITO) com % cumprida + barra progresso
- **Operator dashboard** (`renderOperatorDashboard`): "MINHAS METAS" filtrado por `operator_id === S.me.id`
- Fetch: `fetchDashboard()` agora também chama `apiFin('/types')`, `apiFin('/ranking?period=YYYY-MM')`, `apiFin('/goals?period=YYYY-MM')` e salva em `S.dashboardFinancial`

### 4. **Dashboard admin visível pro super_admin**
Removido o guard `if (req.user.role === 'super_admin') return 403` em `/dashboard/stats` (arquivo é do Live Control porém — não confundir).

### 5. **API completa de integrações (FASE 1+2)** ⭐

#### Backend novos arquivos
- `/app/dist/modules/integrations/integrations.service.js`
  - Classe `IntegrationsService` com CRUD de keys/webhooks + deliveries
  - `authApiKey(request, reply)` middleware
  - `emitEvent(workspaceId, event, data)` dispatcher
  - `deliverWithRetry()` com HMAC-SHA256, timeout 5s, retry 1s/3s/9s
- `/app/dist/modules/integrations/integrations.routes.js`
  - `GET /integrations/keys` / `POST /keys` / `POST /keys/:id/revoke` / `DELETE /keys/:id`
  - `GET /integrations/webhooks` / `POST` / `PATCH` / `DELETE` / `POST /:id/test` / `GET /:id/deliveries`
  - `GET /integrations/events` (lista eventos permitidos)
- `/app/dist/modules/public/public.routes.js`
  - preHandler global: `authApiKey`
  - `/public/leads` GET/POST/PATCH/DELETE
  - `/public/leads/:id/messages` POST (envia WhatsApp via `leads.sendReply`)
  - `/public/leads/:id/financial` GET/POST
  - `/public/financial/types` / `records` / `ranking` / `goals`
  - `/public/stages` / `users` / `tags` / `me`
- `/app/dist/app.js` modificado: registra `integrations_routes_1` com prefix `/api/v1/integrations` e `public_routes_1` com prefix `/api/v1/public`

#### Eventos disparados automaticamente (via public API hoje)
`lead.created`, `lead.updated`, `lead.deleted`, `lead.stage_changed`, `lead.assigned`, `message.sent`, `financial.recorded`

**PENDING**: hookar também em ações feitas via UI (drag-drop kanban, mensagem recebida do Meta, lançamento financeiro via UI). Hoje só dispara quando ação vem pela API pública.

#### Frontend
- Nova sub-tab `integracoes` em Configurações (admin-only)
- `renderIntegrationsPanel()` — CRUD visual de keys + webhooks, com checkbox de eventos, botão Testar, visualização de entregas
- Todas funções helper em bloco `// ── API / Integrações` (~linha 8316 no leads_index.html)
- Key raw só mostrada 1x após criação (prompt amarelo com botão Copiar)

#### Documentação
- **URL**: `https://lowan.site/api-docs/`
- Arquivo: `/usr/share/nginx/html/api-docs/index.html` no container + source em `/root/api_docs.html`
- Nginx interno do frontend: adicionado `location ^~ /api-docs/ { alias /usr/share/nginx/html/api-docs/; index index.html; }` antes do `location /api`
- Conteúdo: todos endpoints, autenticação, formato de webhook, HMAC, exemplos cURL + n8n

---

## 🔧 Como fazer deploy de mudanças

### Editar backend (arquivos em `/app/dist/`)
```bash
# 1. Copiar arquivo do container pro disco (se não for novo)
docker cp wablast_api:/app/dist/modules/X/X.js /root/X.js.bak

# 2. Editar localmente ou via scp

# 3. Copiar de volta
docker cp /root/novo.js wablast_api:/app/dist/modules/X/X.js

# 4. Restart
docker restart wablast_api

# 5. Ver logs (crash loop detector)
docker logs --tail 20 wablast_api
```

### Editar frontend HTML
```bash
# 1. Baixar versão atual DO CONTAINER (single source of truth)
docker cp wablast_frontend:/usr/share/nginx/html/leads/index.html /root/leads_index_LIVE.html

# 2. Editar

# 3. Aplicar (sem restart — nginx serve estático com no-cache)
docker cp /root/leads_index_NEW.html wablast_frontend:/usr/share/nginx/html/leads/index.html
cp /root/leads_index_NEW.html /root/leads_index.html  # manter source sync
```

### Rodar migração SQL
```bash
docker exec -i wablast_postgres psql -U postgres -d whatsapp_blast < /root/arquivo.sql
```

### ATENÇÃO
- `docker compose build` **RESETA** tudo no `/app/dist/` (volta pro que está no source TS, que está desatualizado). Nunca rodar build sem antes sincronizar source.
- Backups automáticos em `/root/backups/` (diário, frontend + DB sql.gz)

---

## 🔑 Endpoints novos — referência rápida

### Interno (JWT admin)
```
POST   /api/v1/integrations/keys              { name }       → { key, prefix, ... }  RAW KEY ONLY ONCE
GET    /api/v1/integrations/keys              → [keys]
POST   /api/v1/integrations/keys/:id/revoke
DELETE /api/v1/integrations/keys/:id

GET    /api/v1/integrations/webhooks
POST   /api/v1/integrations/webhooks          { name, url, events[], secret?, enabled }
PATCH  /api/v1/integrations/webhooks/:id
DELETE /api/v1/integrations/webhooks/:id
POST   /api/v1/integrations/webhooks/:id/test
GET    /api/v1/integrations/webhooks/:id/deliveries?limit=50
GET    /api/v1/integrations/events             → lista eventos permitidos
```

### Público (X-API-Key: lwn_... OR Authorization: Bearer lwn_...)
```
GET    /api/v1/public/me
GET    /api/v1/public/leads?limit&offset&stageId&assignedToId&status&search&since
GET    /api/v1/public/leads/:id
POST   /api/v1/public/leads                    { name, phone, email?, origin?, notes?, assignedToId? }
PATCH  /api/v1/public/leads/:id
DELETE /api/v1/public/leads/:id
POST   /api/v1/public/leads/:id/messages       { text, connectionId? }
GET    /api/v1/public/leads/:id/financial
POST   /api/v1/public/leads/:id/financial      { financialTypeId, amount, description?, operatorId? }
GET    /api/v1/public/financial/types
GET    /api/v1/public/financial/records?period&operatorId&leadId&typeId&since&limit
GET    /api/v1/public/financial/ranking?period=YYYY-MM
GET    /api/v1/public/financial/goals?period=YYYY-MM
GET    /api/v1/public/stages
GET    /api/v1/public/users
GET    /api/v1/public/tags
```

### Formato webhook outbound
```json
POST <configured URL>
Headers:
  Content-Type: application/json
  X-Event: lead.created
  X-Delivery-Id: <uuid>
  X-Signature: sha256=<hmac>  (se secret configurado)

Body:
{
  "event": "lead.created",
  "version": 1,
  "workspaceId": "51325f8a-...",
  "ts": "2026-04-15T23:00:00.000Z",
  "data": { ... }
}
```

Retry: 1s, 3s, 9s (total 3 tentativas além da inicial). Timeout 5s. 4xx (exceto 408/429) não retry.

---

## ⚠️ Pendências / melhorias futuras

1. **Hookar emissão de webhooks em ações UI** — hoje só dispara via public API. Precisa adicionar `emitEvent()` em:
   - `leads.service.js` após `update()` → `lead.updated`, `lead.stage_changed`, `lead.assigned`
   - `leads.service.js` após `sendReply()` → `message.sent`
   - `webhooks.routes.js` (inbound Meta) após processar mensagem → `message.received`
   - `financial.routes.js` após `createRecord` via UI → `financial.recorded`
   - `leads.service.js` após `create()` via UI → `lead.created`

2. **Sincronizar source TS** (`/root/whatsapp-blast/src/modules/integrations/`, `public/`) com o que está no `/app/dist/`. Senão `docker compose build` quebra tudo.

3. **Rate limit por API key** — hoje só tem rate limit global do Fastify (1000/min). Implementar em middleware `authApiKey` usando Redis.

4. **Scopes granulares** — hoje toda key tem scope `["*"]` (admin-equivalente). Adicionar `leads:read`, `leads:write`, `financial:read`, `financial:write`, etc.

5. **Kanban CRUD via API pública** — hoje só `GET /public/stages`. Adicionar POST/PATCH/DELETE para automações criarem/reordenarem pipeline.

6. **Campanhas WhatsApp via API** — disparar campanhas (broadcast) via endpoint público.

7. **Swagger/OpenAPI gerado** automaticamente.

---

## 🧪 Como testar rapidamente

```bash
# Criar key de teste direto no DB
ssh root@204.168.190.107
node -e "
  const c = require('crypto');
  const key = 'lwn_' + c.randomBytes(32).toString('base64url');
  const hash = c.createHash('sha256').update(key).digest('hex');
  console.log('KEY:', key, '\nHASH:', hash);
"
# Use o hash no INSERT abaixo:
docker exec wablast_postgres psql -U postgres -d whatsapp_blast -c "INSERT INTO api_keys(workspace_id, name, key_hash, key_prefix) VALUES ('<WORKSPACE_UUID>', 'test', '<HASH>', 'lwn_xxxxxxx') RETURNING id;"

# Chamar API
export K='lwn_...'
curl -H "X-API-Key: $K" https://lowan.site/api/v1/public/me
curl -H "X-API-Key: $K" https://lowan.site/api/v1/public/leads?limit=5
```

---

## 📂 Arquivos criados / modificados (referência)

### Source files no `/root/` da VPS
- `/root/integrations_migration.sql` (novo — aplicado no DB)
- `/root/integrations.service.js` (novo — copiado pro container)
- `/root/integrations.routes.js` (novo)
- `/root/public.routes.js` (novo)
- `/root/app.js.new` (app.js atualizado — copiado pro container)
- `/root/financial.routes.js.bak` (backup do original antes do fix)
- `/root/api_docs.html` (novo — fonte da docs)
- `/root/leads_index.html` (sincronizado com versão viva do container)

### Arquivos NO container
- `/app/dist/modules/integrations/integrations.service.js`
- `/app/dist/modules/integrations/integrations.routes.js`
- `/app/dist/modules/public/public.routes.js`
- `/app/dist/modules/financial/financial.routes.js` (modificado — attribution fix)
- `/app/dist/app.js` (modificado — registra novas rotas)
- `/usr/share/nginx/html/leads/index.html` (UI + pódio + metas + integrações tab)
- `/usr/share/nginx/html/api-docs/index.html` (nova)
- `/etc/nginx/conf.d/default.conf` (nginx interno frontend — adicionado `location ^~ /api-docs/`)

---

## 🆘 Rollback rápido

Se uma mudança quebrar produção:
```bash
# Backend: restore do último backup .bak
docker cp /root/<arquivo>.bak wablast_api:/app/dist/modules/.../arquivo.js
docker restart wablast_api

# Frontend: restore de /root/backups/
ls /root/backups/frontend_*.html | tail -1
docker cp /root/backups/frontend_20260415_XXX.html wablast_frontend:/usr/share/nginx/html/leads/index.html
```
