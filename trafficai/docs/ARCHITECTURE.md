# Arquitetura

## Visão geral

```
┌─────────────────────────┐
│  Navegador (cliente)    │
└─────────────┬───────────┘
              │ HTTPS (Cloudflare DNS → Traefik)
              ▼
 ┌─────────────────────────────────────────────┐
 │              Traefik (443)                   │
 │  app.alfamaxdigital.com.br  →  frontend:3002 │
 │  api.alfamaxdigital.com.br  →  backend:3001  │
 └────────────────┬────────────────────────────┘
                  │
     ┌────────────┴────────────┐
     │                         │
     ▼                         ▼
┌──────────────┐       ┌──────────────────────┐
│  Next.js 16  │──API─>│  Express + TS         │
│  frontend    │       │  backend              │
└──────────────┘       └──────────┬───────────┘
                                  │
                 ┌────────────────┼───────────────┬──────────────┐
                 ▼                ▼               ▼              ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────────┐
          │ Meta Graph   │ │ PostgreSQL   │ │ OpenAI   │ │ Resend /     │
          │ API (v19.0)  │ │ (Supabase)   │ │ GPT-4o   │ │ UazAPI / ZAPI│
          └──────────────┘ └──────────────┘ └──────────┘ └──────────────┘
```

## Estrutura de pastas

### Backend (`backend/src/`)

| Pasta            | Responsabilidade                                                  |
|------------------|-------------------------------------------------------------------|
| `ai/`            | Análise de campanhas e criativos via OpenAI                       |
| `analytics/`     | Engine de alertas (`smart-alerts.service.ts`, `alerts.*`)         |
| `api/`           | Router central (`routes.ts`) + middlewares                        |
| `auth/`          | Login, registro, OAuth Meta, middleware JWT                       |
| `clients/`       | Módulo de gestão de clientes e workflow de agência                |
| `database/`      | `connection.ts` (pool pg), `migrations/*.sql`, `run-migrations.ts` |
| `financial/`     | Receitas, pagamentos, contratos                                   |
| `meta/`          | Integração Meta Ads (`service`, `controller`, `repository`)       |
| `notifications/` | Email e WhatsApp (sends + logs)                                   |
| `prediction/`    | Previsão de desempenho baseada em histórico                       |
| `reports/`       | Geração e envio de relatórios para clientes                       |
| `routine/`       | Rotina diária do gestor (tarefas, Google Calendar)                |
| `shared/`        | Logger, errors, rate limiter Meta                                 |
| `tasks/`         | Tasks do workflow de clientes                                     |
| `workers/`       | Cron jobs (sync, alerts, token refresh)                           |

### Frontend (`frontend/src/`)

| Pasta                | Responsabilidade                                      |
|----------------------|-------------------------------------------------------|
| `app/`               | Next.js App Router — uma pasta por rota               |
| `app/dashboard/`     | Painel principal com KPIs e charts                    |
| `app/campaigns/`     | Lista + detalhe de campanhas                          |
| `app/insights/`      | Métricas detalhadas                                   |
| `app/alerts/`        | Gerenciamento de alertas                              |
| `app/predictions/`   | Análise preditiva                                     |
| `app/reports/`       | Geração e envio de relatórios                         |
| `app/report/[token]/`| Relatório público (sem login)                         |
| `app/financeiro/`    | Financeiro / contratos / cobrança                     |
| `app/clientes/`      | Ficha dos clientes                                    |
| `app/rotina/`        | Rotina diária do gestor                               |
| `app/settings/`      | Configurações (notificações, IA, Meta)                |
| `app/agent/`         | Agente IA conversacional                              |
| `app/creative/`      | Análise de criativos                                  |
| `app/otimizacoes/`   | Sugestões de otimização                               |
| `components/`        | Componentes reutilizáveis (`Sidebar`, `AccountSelect`)|
| `lib/`               | Cliente HTTP (`api.ts`), utilitários                  |

## Camadas do backend (padrão 3 arquivos por módulo)

Cada módulo de domínio segue:

- **`X.controller.ts`** — Router Express. Faz validação básica + chama service. Exporta um `Router` que é montado em `api/routes.ts`.
- **`X.service.ts`** — Regras de negócio e integrações externas (Meta, OpenAI, Resend…). Nunca conhece Request/Response.
- **`X.repository.ts`** — Acesso ao banco. Exporta funções que retornam DTOs tipados. Nunca conhece Express nem Axios.

Essa separação permite reuso: os workers (`workers/sync.worker.ts`) chamam `metaService.syncUserData()` sem precisar simular requisição HTTP.

## Autenticação

- Login clássico via email + senha, hash bcrypt.
- JWT assinado no backend, armazenado em `localStorage` no frontend (`trafficai_token`).
- Meta: OAuth 2.0 — redirect `…/api/v1/auth/meta/callback`. O `access_token` long-lived é salvo em `users.access_token` com `users.token_expiration`.
- `token-refresh.worker.ts` renova tokens próximos do vencimento.

## Rate limiting

- Express-level: 1000 req / 15 min por IP (em `server.ts`)
- Meta API-level: `shared/rate-limiter.ts` com retry/backoff exponencial em erros 429 / transitórios. Toda chamada Meta passa por `metaRateLimiter.executeWithRetry(userId, fn)`.
