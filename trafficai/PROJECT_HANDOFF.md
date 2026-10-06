# TrafficAI — Resumo Completo do Projeto

## 📋 Visão Geral
Plataforma SaaS para gestores de tráfego pago com integração Meta Ads, Google Ads, tracking avançado (pixel server-side + CAPI), relatórios estilo UTMify, funil de vendas, IA preditiva e automações.

---

## 🔗 Repositório GitHub
- **URL:** https://github.com/gabrielmedsantos/trafficai.git
- **Branch atual:** `refactor/financeiro-overhaul`
- **Status:** Arquivos modificados localmente (não commitados ainda)

---

## 🖥️ Acesso VPS (Produção)
- **Host:** `76.13.166.123`
- **Porta:** `22`
- **Usuário:** `root`
- **Chave SSH:** `~/.ssh/trafficai_vps` (local: `C:\Users\g4bri\.ssh\trafficai_vps`)
- **Caminho no servidor:** `/opt/trafficai`

### Comandos SSH
```bash
ssh -i ~/.ssh/trafficai_vps root@76.13.166.123
cd /opt/trafficai
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

---

## 🌐 Domínios (Traefik)
- **Frontend (App):** `https://app.alfamaxdigital.com.br`
- **Backend (API):** `https://api.alfamaxdigital.com.br/api/v1`

---

## 📁 Estrutura de Pastas

### Raiz
```
D:\boot\ANTIGRAVITY\trafficai\
├── backend/          # API Express + TypeScript
├── frontend/         # Next.js 16 + React 19
├── docker-compose.yml
├── package.json      # Scripts root (se houver)
└── .env              # Variáveis locais (não versionado)
```

### Backend (`backend/src/`)
```
src/
├── admin/            # Painel admin
├── ai/               # Integrações IA (Claude, OpenAI)
├── analytics/        # Métricas e dashboards
├── api/middleware/   # Middlewares Express
├── audit/            # Log de auditoria
├── auth/             # JWT, login, registro
├── automation/       # Automações e workflows
├── billing/          # Faturamento e planos
├── board/            # Kanban/board de tarefas
├── clients/          # Gestão de clientes
├── commercial/       # CRM comercial + integrações
├── database/         # Conexão PG + migrations
├── financial/        # Módulo financeiro
├── googleAds/        # Google Ads API
├── leads/            # Gestão de leads
├── meta/             # Meta Ads API (campanhas, insights)
├── notifications/    # Push, email, alertas
├── onboarding/       # Fluxo de onboarding
├── prediction/       # IA preditiva
├── reports/          # Relatórios customizados
├── routine/          # Rotina diária do gestor
├── routines-config/  # Config de rotinas
├── shared/           # Utils, logger, encryption
├── tasks/            # Sistema de tarefas
├── team/             # Gestão de equipe
├── templates/        # Templates de campanha
├── tracking/         # ⭐ Pixel, CAPI, webhooks, funil, CRM sync
│   ├── conversion-rules/
│   └── crm-adapters/
└── workers/          # Jobs em background
```

### Frontend (`frontend/src/`)
```
src/
├── app/              # Next.js App Router
│   ├── accounts/     # Contas Meta/Google
│   ├── admin/        # Admin panel
│   ├── agenda/       # Agenda/calendário
│   ├── agent/        # Assistente IA
│   ├── alerts/       # Alertas e notificações
│   ├── audit-log/    # Log de auditoria
│   ├── automation/   # Automações
│   ├── billing/      # Faturamento
│   ├── board/        # Kanban
│   ├── calendar/     # Calendário
│   ├── campaigns/    # Gestão de campanhas
│   ├── clientes/     # Lista de clientes
│   ├── comercial/    # CRM comercial
│   ├── creative/     # Criativos/anúncios
│   ├── dashboard/    # Dashboard principal
│   ├── financeiro/   # Módulo financeiro
│   ├── google-ads/   # Google Ads
│   ├── insights/     # Insights e métricas
│   ├── integrations/ # Integrações externas
│   ├── marketing/    # Marketing tools
│   ├── onboarding/   # Onboarding
│   ├── otimizacoes/  # Sugestões de otimização
│   ├── predictions/  # Previsões IA
│   ├── report/       # Relatórios
│   ├── reports/      # Relatórios (legacy?)
│   ├── rotina/       # Rotina diária
│   ├── settings/     # Configurações
│   ├── team/         # Equipe
│   ├── templates/    # Templates
│   ├── tracking/     # Tracking sources, pixels
│   └── vendas/       # ⭐ Relatório de vendas (estilo UTMify)
│       ├── campanhas/
│       └── insights/
├── components/       # Componentes reutilizáveis
│   ├── panels/
│   └── vendas/       # Componentes do relatório de vendas
└── lib/              # Utils, API client, hooks
```

---

## 🐳 Docker Compose

### Serviços
```yaml
services:
  backend:
    build: ./backend
    container_name: trafficai-backend
    restart: unless-stopped
    env_file: ./backend/.env.production
    networks: [traefik_net, ipv6_net]
    labels:
      - traefik.http.routers.trafficai-api.rule=Host(`api.alfamaxdigital.com.br`)
      - traefik.http.services.trafficai-api.loadbalancer.server.port=3001

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: https://api.alfamaxdigital.com.br/api/v1
    container_name: trafficai-frontend
    restart: unless-stopped
    networks: [traefik_net]
    labels:
      - traefik.http.routers.trafficai-app.rule=Host(`app.alfamaxdigital.com.br`)
      - traefik.http.services.trafficai-app.loadbalancer.server.port=3002

networks:
  traefik_net:
    external: true
    name: n8n_default
  ipv6_net:
    external: true
    name: trafficai_ipv6
```

### Ports Internos
- **Backend:** `3001`
- **Frontend:** `3002`

---

## 🔑 Variáveis de Ambiente

### Backend (`backend/.env.production`)
```env
AGENCY_NAME=
CLAUDE_API_KEY=
CLAUDE_MODEL=
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
FRONTEND_URL=https://app.alfamaxdigital.com.br
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
JWT_EXPIRES_IN=
JWT_SECRET=
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=
NODE_ENV=production
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_ORG_ID=
PORT=3001
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=https://api.alfamaxdigital.com.br/api/v1
```

---

## 📦 Scripts npm

### Backend
```json
{
  "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "migrate": "ts-node -r dotenv/config src/database/run-migrations.ts",
  "seed:commercial": "ts-node -r dotenv/config src/commercial/seed.ts"
}
```

### Frontend
```json
{
  "dev": "next dev -p 3002",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

---

## 🛠️ Stack Tecnológica

### Backend
- **Runtime:** Node.js + TypeScript
- **Framework:** Express 4
- **Database:** PostgreSQL (pg driver)
- **ORM/Query:** Raw SQL com `pg` Pool
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **APIs Externas:** Meta Graph API v19.0, Google Ads API, Anthropic SDK, OpenAI SDK
- **Email:** Resend
- **Rate Limiting:** express-rate-limit
- **Security:** helmet, CORS
- **File Upload:** multer
- **PDF:** pdfkit
- **Cron Jobs:** node-cron

### Frontend
- **Framework:** Next.js 16.1.6 (App Router)
- **UI:** React 19.2.3
- **Styling:** Tailwind CSS 4
- **Charts:** Recharts 3.7.0
- **Icons:** Lucide React
- **Build:** Turbopack (Next.js 16 default)

### Infra
- **Containerização:** Docker + Docker Compose
- **Reverse Proxy:** Traefik (TLS automático via Let's Encrypt)
- **Networks:** `n8n_default` (Traefik), `trafficai_ipv6`
- **Deploy:** Manual via SSH + `docker compose build/up`

---

## 🚀 Deploy (Produção)

### Build e Deploy Backend
```bash
ssh -i ~/.ssh/trafficai_vps root@76.13.166.123
cd /opt/trafficai
# Upload do arquivo modificado (exemplo)
# scp -i ~/.ssh/trafficai_vps backend/src/tracking/sales-report.service.ts root@76.13.166.123:/opt/trafficai/backend/src/tracking/
docker compose build --no-cache backend
docker compose up -d --force-recreate backend
docker compose logs -f backend
```

### Build e Deploy Frontend
```bash
ssh -i ~/.ssh/trafficai_vps root@76.13.166.123
cd /opt/trafficai
# Upload do arquivo modificado
# scp -i ~/.ssh/trafficai_vps frontend/src/components/vendas/shared.tsx root@76.13.166.123:/opt/trafficai/frontend/src/components/vendas/
docker compose build --no-cache frontend
docker compose up -d --force-recreate frontend
docker compose logs -f frontend
```

### Deploy Automatizado (Node.js script local)
O projeto usa scripts Node.js com `ssh2` para automatizar upload + rebuild:
```javascript
const { Client } = require('ssh2');
const conn = new Client();
conn.connect({
  host: '76.13.166.123',
  port: 22,
  username: 'root',
  privateKey: require('fs').readFileSync(require('os').homedir() + '/.ssh/trafficai_vps'),
});
```

---

## ⭐ Funcionalidades Principais

### 1. Tracking Avançado (Pixel Server-Side + CAPI)
- **Arquivo:** `backend/src/tracking/tracking.public.ts`
- Pixel JS customizado servido via `/api/v1/track/pixel/:token.js`
- Detecção automática de cliques (AddToCart, InitiateCheckout) por texto do botão
- Advanced Matching (email, phone, nome, cidade, estado, CEP, país, gênero, data de nascimento)
- Forward server-side para Meta CAPI (Conversions API)
- Webhooks para CRM (Kommo, RD Station, DataCrazy)
- Tracking de WhatsApp (Evolution API)
- Heatmaps e scroll depth
- SPA navigation tracking (pushState/popstate)

### 2. Relatório de Vendas (Estilo UTMify)
- **Arquivos:**
  - Backend: `backend/src/tracking/sales-report.service.ts`
  - Frontend: `frontend/src/app/vendas/campanhas/page.tsx`, `frontend/src/components/vendas/shared.tsx`
- Métricas: Vendas, CPA, Gastos, Faturamento, Lucro, ROAS, Margem, ROI, Hook Rate, Retenção, CTR, CPM, CPC, Visualizações de Página, Conversões
- Coluna "Últ. Atualização" (last_sync): mostra snapshot da última sync (gasto, vendas, ROI) com data/hora
- Agrupamento por: campanha, conjunto, anúncio, UTM source/campaign/medium/content/term, dia, produto
- Edição inline de orçamento e status (pausar/ativar) com sync Meta API
- Presets de colunas: Vendas, Criativos, Funil

### 3. Meta Ads Integration
- **Arquivos:** `backend/src/meta/`
- Sync de campanhas, conjuntos, anúncios, insights
- Atualização de orçamento e status via API
- Cache de dados Meta para performance

### 4. Google Ads Integration
- **Arquivos:** `backend/src/googleAds/`
- Sync de campanhas e métricas
- Conversion tracking via Google Ads API

### 5. IA Preditiva e Automações
- **Arquivos:** `backend/src/ai/`, `backend/src/prediction/`, `backend/src/automation/`
- Integrações com Claude (Anthropic) e OpenAI
- Sugestões de otimização de campanhas
- Previsões de performance

### 6. Funil de Vendas e Tracking de Etapas
- **Arquivo:** `backend/src/tracking/funnel-configuration.service.ts`
- Configuração de etapas do funil por fonte (tracking source)
- **EM DESENVOLVIMENTO:** Tracking de funil de quiz com etapas mapeadas por nomes de botões
  - Cada etapa do quiz dispara evento customizado (QuizStep1, QuizStep2, etc.)
  - Padrões de texto configuráveis por etapa
  - Análise de conversão entre etapas

### 7. CRM Sync
- **Arquivos:** `backend/src/tracking/crm-sync.service.ts`, `backend/src/tracking/crm-adapters/`
- Adapters para Kommo, DataCrazy
- Sync bidirecional de leads e contatos

### 8. Módulo Financeiro
- **Arquivos:** `backend/src/financial/`, `frontend/src/app/financeiro/`
- Faturamento, custos, margem de lucro
- Relatórios financeiros por cliente/campanha

### 9. Rotina Diária do Gestor
- **Arquivos:** `backend/src/routine/`, `frontend/src/app/rotina/`
- Checklist diário de otimizações
- Alertas de campanhas com problemas

### 10. Sistema de Alertas e Notificações
- **Arquivos:** `backend/src/notifications/`, `frontend/src/app/alerts/`
- Push notifications (Service Worker)
- Email via Resend
- Alertas de vendas, erros de tracking, campanhas pausadas

---

## 🐛 Problemas Conhecidos / Em Andamento

### 1. Coluna "Últ. Atualização" não aparece para alguns usuários
- **Causa:** Service Worker antigo (v4) cacheando bundles JS antigos
- **Solução aplicada:**
  - SW atualizado para v5 com estratégia network-first para `/_next/static/`
  - Script de auto-unregister no `layout.tsx` que detecta SW desatualizado e força reload
  - Usuários precisam fazer Hard Refresh (Ctrl+Shift+R) ou limpar cache do navegador
- **Status:** Resolvido no servidor, mas alguns navegadores ainda servem cache antigo

### 2. Alteração de orçamento não reflete imediatamente na coluna "Últ. Atualização"
- **Causa:** `updateMetaObject()` não atualizava `last_sync_at` ao alterar orçamento/status
- **Solução aplicada:**
  - Backend: `sales-report.service.ts` agora atualiza `last_sync_at = NOW()` em alterações manuais
  - Frontend: `campanhas/page.tsx` atualiza `last_sync_at` no override local após alteração bem-sucedida
- **Status:** Resolvido e deployado

### 3. Tracking de Funil de Quiz (EM DESENVOLVIMENTO)
- **Objetivo:** Mapear etapas de quiz baseadas em nomes de botões, permitindo capturar e analisar cada etapa de quizzes diferentes
- **Arquitetura planejada:**
  1. Configuração por fonte: definir padrões de texto para cada etapa do quiz
  2. Detecção automática no pixel: capturar cliques em botões que matcham os padrões
  3. Eventos customizados: disparar `QuizStep1`, `QuizStep2`, etc. com metadata do botão
  4. Análise no dashboard: visualizar conversão entre etapas
- **Progresso:**
  - ✅ Interface `FunnelStageInput` e `FunnelStage` atualizadas com campo `button_patterns`
  - ⏳ Pendente: migration para adicionar coluna `button_patterns` na tabela `tracking_funnel_stages`
  - ⏳ Pendente: atualizar queries INSERT/SELECT no `funnel-configuration.service.ts`
  - ⏳ Pendente: modificar `buildPixelScript()` para injetar padrões de quiz e detectar cliques
  - ⏳ Pendente: endpoint de API para configurar etapas de quiz por fonte
  - ⏳ Pendente: UI no frontend para configurar padrões de botões por etapa

---

## 📝 Próximos Passos Sugeridos

1. **Completar implementação do tracking de funil de quiz**
   - Migration para `button_patterns`
   - Atualizar service de configuração
   - Modificar pixel JS para detectar cliques em botões de quiz
   - Criar UI de configuração no frontend

2. **Resolver cache do Service Worker definitivamente**
   - Considerar remover SW completamente se problemas persistirem
   - Ou adicionar versão hash no nome do SW para forçar atualização

3. **Commit e push das alterações locais**
   - Arquivos modificados: tracking, vendas, SW, layout, etc.
   - Branch: `refactor/financeiro-overhaul`

4. **Testes end-to-end**
   - Verificar se coluna "Últ. Atualização" aparece para todos os usuários
   - Testar alteração de orçamento e reflexo imediato na UI
   - Validar tracking de quiz funnel quando implementado

---

## 🔐 Segurança

- **JWT:** Tokens assinados com `JWT_SECRET`, expiração configurável
- **Rate Limiting:** 600 req/min por token (eventos), 120 req/min (cliques), 200 req/min (WhatsApp), 300 req/min (webhooks)
- **HMAC:** Webhooks CRM assinados com `webhook_secret` (SHA-256)
- **Encryption:** Campos sensíveis criptografados no banco (AES-256)
- **CORS:** Configurado para permitir apenas origens conhecidas
- **Helmet:** Headers de segurança HTTP

---

## 📊 Banco de Dados (PostgreSQL)

### Tabelas Principais
- `users` — Usuários do sistema
- `ad_accounts` — Contas Meta/Google Ads
- `campaigns` — Campanhas sincronizadas da Meta
- `tracking_sources` — Fontes de tracking (pixels)
- `tracking_events` — Eventos capturados pelo pixel
- `tracking_clicks` — Cliques registrados (fbclid, gclid, UTMs)
- `tracking_orders` — Pedidos de checkout (Kiwify, Hotmart, etc.)
- `tracking_funnel_stages` — Configuração de etapas do funil por fonte
- `tracking_funnel_config` — Config geral do funil
- `conversion_rules` — Regras de conversão customizadas
- `sales_settings` — Configurações de relatório de vendas por fonte

### Migrações
- Local: `backend/src/database/migrations/`
- Runner: `npm run migrate` (executa `run-migrations.ts`)

---

## 🧪 Desenvolvimento Local

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+
- Docker + Docker Compose (opcional, para infra completa)

### Setup Backend
```bash
cd backend
cp .env.example .env
# Editar .env com credenciais locais
npm install
npm run migrate
npm run dev
# API roda em http://localhost:3001
```

### Setup Frontend
```bash
cd frontend
cp .env.local.example .env.local  # Se existir
# Editar .env.local: NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
npm install
npm run dev
# App roda em http://localhost:3002
```

---

## 📞 Contato / Contexto do Projeto

- **Dono do projeto:** Gabriel Medeiros Santos
- **Agência:** Alfa Max Digital
- **Objetivo:** Plataforma SaaS para gestores de tráfego pago concorrer com UTMify, Hyros, TripleWhale
- **Diferencial:** IA preditiva, automações, tracking server-side avançado, módulo financeiro integrado

---

## 🔄 Estado Atual do Git

```bash
Branch: refactor/financeiro-overhaul
Arquivos modificados (não commitados):
  M backend/src/meta/meta.repository.ts
  M backend/src/meta/meta.service.ts
  M backend/src/tracking/funnel-configuration.service.ts
  M backend/src/tracking/sales-report.service.ts
  M backend/src/tracking/tracking.controller.ts
  M backend/src/tracking/tracking.public.ts
  M backend/src/tracking/tracking.service.ts
  M frontend/public/sw.js
  M frontend/src/app/Providers.tsx
  M frontend/src/app/campaigns/page.tsx
  M frontend/src/app/layout.tsx
  M frontend/src/app/vendas/campanhas/page.tsx
  M frontend/src/app/vendas/insights/page.tsx
  M frontend/src/components/BrazilMap.tsx
  M frontend/src/components/vendas/shared.tsx
```

---

**Fim do resumo.** Este documento contém todas as informações necessárias para um novo desenvolvedor (ou IA) entender, acessar e continuar o desenvolvimento do projeto TrafficAI.