# API REST

Todas as rotas ficam sob `/api/v1/`. Autenticação via `Authorization: Bearer <JWT>` exceto onde indicado.

Response format padrão:
```json
{ "success": true, "data": ... }
{ "success": false, "error": { "message": "...", "code": 400 } }
```

## Autenticação (`/auth`)

| Método | Path | Body | Descrição |
|--------|------|------|-----------|
| POST | `/auth/register` | `{ email, password, name }` | Cria usuário |
| POST | `/auth/login` | `{ email, password }` | Retorna `{ token, user }` |
| GET | `/auth/me` | — | Info do usuário autenticado |
| GET | `/auth/meta/connect` | — | URL OAuth Meta para redirecionar |
| GET | `/auth/meta/callback` | `?code=&state=` | Callback OAuth (público) |
| POST | `/auth/logout` | — | Invalida sessão local |

## Meta Ads (`/meta`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/meta/ad-accounts` | Lista contas direto da Meta (paginado, 3 fontes) |
| GET | `/meta/local/accounts` | Contas salvas no DB |
| GET | `/meta/local/accounts/active` | Contas marcadas como cliente ativo |
| POST | `/meta/accounts/add-manual` | Adiciona manualmente `{ meta_account_id, account_name }` |
| PATCH | `/meta/accounts/:id/client-status` | `{ is_client_active, client_notes }` |
| PATCH | `/meta/accounts/:id/billing` | `{ payment_type, balance_alert_threshold }` |
| POST | `/meta/accounts/sync-balances` | Atualiza saldos das contas ativas |
| POST | `/meta/accounts/deactivate-all` | Desativa todas |
| GET | `/meta/campaigns?account_id=&live=true?` | Campanhas (DB ou live se `live=true`) |
| GET | `/meta/adsets?campaign_id=` | AdSets de uma campanha |
| GET | `/meta/ads?campaign_id=` | Ads de uma campanha |
| GET | `/meta/insights?campaign_id=&date_preset=` | Insights live (paginado) |
| GET | `/meta/insights?campaign_id=&since=&until=` | Variante com time_range absoluto |
| GET | `/meta/local/insights?campaign_id=&since=&until=` | Insights do DB |
| POST | `/meta/sync` | `{ days_back: 35 }` — sync completo do usuário |
| POST | `/meta/sync-account` | `{ account_id, since, until }` — sync pontual |
| GET | `/meta/validate/:id?since=&until=` | **NOVO** — compara DB vs Meta level=account |
| POST | `/meta/validate/:id/fix` | **NOVO** — re-sincroniza o período |
| GET | `/meta/debug/accounts` | Diagnóstico bruto das 3 fontes |
| GET | `/meta/debug/account/:id?since=&until=` | Diagnóstico completo de uma conta |

## IA (`/ai`)

| Método | Path | Descrição |
|--------|------|-----------|
| POST | `/ai/analyze-campaign` | `{ campaign_id }` — análise textual + score de risco |
| GET | `/ai/analyses?campaign_id=?` | Histórico de análises |
| POST | `/ai/analyze-creative` | `{ type: 'text', text_content, context }` |

## Predições (`/prediction`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/prediction/campaign/:id` | Projeção 30 dias baseada em histórico |

## Alertas (`/alerts`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/alerts?unread_only=&limit=` | Lista alertas |
| POST | `/alerts/:id/read` | Marca como lido |
| POST | `/alerts/read-all` | Marca todos como lidos |
| POST | `/alerts/analyze` | Força análise de alertas agora |

## Notificações (`/settings/notifications`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/settings/notifications` | Retorna config do usuário |
| PATCH | `/settings/notifications` | Atualiza configs |
| POST | `/settings/notifications/test` | `{ channel: 'email' | 'whatsapp' }` |

## Relatórios (`/reports`)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/reports` | Lista relatórios do usuário |
| GET | `/reports/:id` | Detalhe de um relatório (auth) |
| GET | `/reports/public/:token` | Relatório público (sem auth) |
| POST | `/reports/generate` | `{ account_id, type, period_start, period_end? }` |
| POST | `/reports/:id/send-email` | `{ to_email? }` |
| POST | `/reports/:id/send-whatsapp` | `{ to_phone? }` |
| GET | `/reports/settings?account_id=` | Config de envio |
| PATCH | `/reports/settings/:account_id` | Atualiza config |

## Rotina do gestor (`/routine`)

Tarefas diárias, agenda, Google Calendar.

## Clientes (`/clients`)

Ficha, contratos, workflow de onboarding, tasks.

## Financeiro (`/financial`)

Receitas, pagamentos, billing de contratos.

## Tasks (`/tasks`)

Kanban genérico.

## Health

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/v1/health` | `{ service, version, status, timestamp }` — público |

## Erros comuns

| Status | Significado |
|--------|-------------|
| 400 | Parâmetros inválidos |
| 401 | Token ausente/expirado (Meta ou JWT) |
| 403 | Sem permissão (inclusive Resend rejeita envio de domínio não verificado com 403) |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex.: conta já cadastrada manualmente) |
| 429 | Rate limit (Express ou Meta) |
| 500 | Bug — reportar nos logs |
