# Fluxo de dados

```
┌──────────────────┐                                                  ┌───────────────┐
│  Meta Graph API  │                                                  │   OpenAI API  │
└────────┬─────────┘                                                  └───────┬───────┘
         │ (1) sync periódico + on-demand                                       │
         ▼                                                                      │
┌──────────────────────────────────────┐                                        │
│          backend/workers              │                                        │
│  sync.worker ─ a cada hora 8h-20h     │                                        │
│  alerts.worker ─ 1x/dia 9h            │                                        │
│  token-refresh ─ diário               │                                        │
│  report.worker ─ daily/weekly/monthly │───────────────(3) IA ─────────────────►│
└──────────┬───────────────────────────┘                                        │
           │ (2) upsert                                                          │
           ▼                                                                     │
┌──────────────────────────────────┐                                             │
│          PostgreSQL               │                                            │
│  users, ad_accounts, campaigns,   │                                            │
│  insights_history, alerts,        │                                            │
│  client_reports, …                │                                            │
└──────────┬───────────────────────┘                                             │
           │ (4) query                                                           │
           ▼                                                                     │
┌──────────────────────────────────┐     (5) email    ┌────────────────┐        │
│          backend/api              │────────────────►│  Resend        │        │
│  REST JSON (Express)              │                 └────────────────┘        │
│                                   │     (6) WhatsApp ┌────────────────┐       │
│                                   │────────────────► │ UazAPI/Evol/ZAPI│      │
└──────────┬───────────────────────┘                  └────────────────┘        │
           │ (7) JSON                                                            │
           ▼                                                                     │
┌──────────────────────────────────┐                                             │
│  frontend (Next.js)               │◄────────────(3) streaming recomendações ──┘
│  Dashboard, relatórios, alertas   │
└──────────────────────────────────┘
```

## Passo a passo: métrica de gasto mensal de uma conta

1. `sync.worker.ts` dispara a cada hora (8h–20h America/Sao_Paulo) e chama `authRepository.getAllConnectedUsers()`.
2. Para cada usuário, chama `metaService.syncUserData(userId, token, daysBack=35)`.
3. O service:
   - monta janela absoluta `{ since = hoje - 34 dias, until = hoje }`
   - busca todas as contas Meta (`getAdAccounts` — paginado, 3 fontes dedupadas)
   - para cada conta, chama `getCampaigns` (paginado, todas as campanhas)
   - para cada campanha, chama `getCampaignInsights(..., timeRange={since, until})` (paginado, `time_increment: 1`)
   - faz `upsertInsight` em `insights_history` (uma linha por campanha × data)
4. O dashboard do frontend faz `GET /meta/campaigns?account_id=X` + N `GET /meta/local/insights?campaign_id=Y&since=A&until=B` (em lotes paralelos de 8).
5. A agregação final acontece **no cliente**: soma todos os `spend` das linhas do período.
6. O total é exibido no card "Investimento".

### Onde podem surgir discrepâncias

| Origem | Causa | Mitigação |
|--------|-------|-----------|
| Faltando campanhas no sync | Paginação Meta não respeitada | Corrigido em `fetchAllPages` |
| Faltando dias no sync | `date_preset` relativo | Corrigido usando `time_range` absoluto |
| Frontend cortava campanhas | `campaignsData.slice(0, 10)` | Corrigido — sem limite |
| Linhas de insight zeradas | Dia sem veiculação — dado correto, nada a fazer |
| Conversões contadas 2× | Alguns action_types se sobrepõem (ex: `purchase` vs `offsite_conversion.fb_pixel_purchase`) | `extractPrimaryAction` pega só a 1ª match |

## Passo a passo: relatório mensal gerado automaticamente

1. `report.worker.ts` roda em cron: 1º dia do mês às 7h.
2. Chama `reportService.generateAutoReports('monthly')`.
3. O service pega todas as `ad_accounts` com `is_client_active = true` e `report_settings.monthly_enabled = true`.
4. Para cada conta:
   - calcula período (`getPeriodDates('monthly')` = mês inteiro anterior)
   - chama `metaService.syncAccountForPeriod()` para pegar dados frescos
   - `aggregateMetrics()` compõe totais, top campanhas, daily breakdown
   - `getAdInsightsForReport()` + `getAdThumbnails()` trazem criativos
   - Gera análise com OpenAI
   - Salva em `client_reports`
   - Se `auto_send_email = true`, envia via Resend
5. Se WhatsApp estiver configurado (`whatsapp_enabled`, `auto_send_whatsapp`), envia link público do relatório.
