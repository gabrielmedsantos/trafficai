# TrafficAI — Documentação Técnica

Plataforma de gestão inteligente de tráfego pago Meta Ads, com análise via IA, alertas automáticos, relatórios para clientes e workflow completo de agência.

Operado pela **Alfamax Digital** em produção:
- API: `https://api.alfamaxdigital.com.br`
- App: `https://app.alfamaxdigital.com.br`

## Índice

1. [ARCHITECTURE.md](./ARCHITECTURE.md) — Stack, estrutura de pastas, infraestrutura
2. [DATABASE.md](./DATABASE.md) — Schema completo, tabelas, migrations
3. [META_INTEGRATION.md](./META_INTEGRATION.md) — Integração com Meta Graph API
4. [DATA_FLOW.md](./DATA_FLOW.md) — Como os dados circulam do Meta → DB → UI
5. [METRICS.md](./METRICS.md) — Cálculo exato de cada métrica (CPA, ROAS, CTR…)
6. [REPORTS.md](./REPORTS.md) — Sistema de relatórios automáticos por cliente
7. [ALERTS.md](./ALERTS.md) — Engine de alertas inteligentes
8. [NOTIFICATIONS.md](./NOTIFICATIONS.md) — Email (Resend) e WhatsApp (UazAPI/Evolution/Z-API)
9. [WORKERS.md](./WORKERS.md) — Background jobs (sync, alerts, tokens)
10. [API.md](./API.md) — Endpoints REST disponíveis
11. [FRONTEND.md](./FRONTEND.md) — Estrutura do Next.js 16 app router
12. [DEPLOYMENT.md](./DEPLOYMENT.md) — Docker, Traefik, Supabase, IPv6
13. [OPERATIONS.md](./OPERATIONS.md) — Runbook: como operar, diagnosticar, reparar
14. [IMPROVEMENTS.md](./IMPROVEMENTS.md) — Backlog de melhorias possíveis
15. [TRACKING.md](./TRACKING.md) — Pixel proprietário + Meta CAPI + webhook CRM

## Stack rápida

| Camada      | Tecnologia                                               |
|-------------|----------------------------------------------------------|
| Frontend    | Next.js 16 (App Router), React, TypeScript, Recharts     |
| Backend     | Node 20, Express, TypeScript                             |
| Banco       | PostgreSQL (Supabase, IPv6 direct connection)            |
| IA          | OpenAI GPT-4o (análise, relatórios, otimizações)         |
| Email       | Resend                                                   |
| WhatsApp    | UazAPI (default) / Evolution API / Z-API                 |
| Reverse proxy | Traefik + Let's Encrypt                                |
| Infra       | Docker Compose, Hostinger VPS (Ubuntu 24.04)             |
| DNS         | Cloudflare (DNS-only, SSL do Traefik)                    |

## Contas Meta em três níveis

A sincronização cobre as três origens em que um usuário pode ter contas de anúncio:

1. **Pessoais** — `/me/adaccounts`
2. **Owned ad accounts** do Business Manager — `/{biz}/owned_ad_accounts`
3. **Client ad accounts** do BM (agência) — `/{biz}/client_ad_accounts`

As três fontes são deduplicadas por `meta_account_id`.

## Como rodar localmente

```bash
# Backend
cd backend
cp .env.example .env      # configurar
npm install
npm run migrate            # rodar migrations
npm run dev                # porta 3001

# Frontend
cd frontend
npm install
npm run dev                # porta 3000 (ou 3002 em prod)
```

## Variáveis de ambiente críticas

Ver [DEPLOYMENT.md](./DEPLOYMENT.md) para a lista completa. Essenciais:

- `DATABASE_URL` — Postgres (direct Supabase em prod)
- `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` — OAuth Meta
- `JWT_SECRET`
- `OPENAI_API_KEY`, `OPENAI_MODEL` (default: `gpt-4o`)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (`relatorios@alfamaxdigital.com.br`)
- `AGENCY_NAME` — usado como remetente em emails (default: `Alfamax Digital`)
- `FRONTEND_URL` — `https://app.alfamaxdigital.com.br` em prod
