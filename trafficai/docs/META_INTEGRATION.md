# Integração com Meta Graph API

Versão fixada: **v19.0** (constante em `meta.service.ts`).

Base URL: `https://graph.facebook.com/v19.0`

## Regras de ouro da integração

1. **Paginar sempre até o fim.** A Meta retorna `paging.next` nos payloads. Chamar só a primeira página causa dados faltantes (motivo pelo qual, antes, R$5k aparecia quando o real era R$14k). O helper `fetchAllPages()` em `meta.service.ts` segue `paging.next` até esgotar, com cap de segurança de 200 páginas.
2. **Preferir `time_range` absoluto a `date_preset` relativo.** `last_30d` é relativo ao momento da chamada — dois syncs diferentes cobrem janelas diferentes e geram buracos. O `syncUserData()` agora calcula `{ since, until }` absolutos.
3. **Puxar insights com `time_increment: 1`.** Uma linha por dia = granularidade máxima; agregações são feitas no DB.
4. **Não confiar no `date_preset` de consultas on-demand.** O endpoint `/meta/insights` aceita `since/until` e, se presentes, monta `time_range`.
5. **Rate limit Meta é real.** `shared/rate-limiter.ts` faz backoff exponencial em 4, 17, 80, 613 (códigos de erro transitórios). Nunca chame a Meta sem envelopar com `metaRateLimiter.executeWithRetry`.

## Endpoints Meta utilizados

### Descoberta de contas (três fontes)

| Endpoint | Origem | Chamador |
|----------|--------|----------|
| `/me/adaccounts` | Contas pessoais do usuário | `getAdAccounts` |
| `/me/businesses` | Business Managers do usuário | idem |
| `/{biz}/owned_ad_accounts` | Contas que o BM possui | idem |
| `/{biz}/client_ad_accounts` | Contas de clientes geridas pelo BM (agência) | idem |

As três são deduplicadas por `meta_account_id` normalizado sem o prefixo `act_`.

### Campanhas / AdSets / Ads

| Endpoint | Retorna | Método |
|----------|---------|--------|
| `/{act_id}/campaigns` | Todas as campanhas da conta | `getCampaigns` |
| `/{campaign_id}/adsets` | Todos os ad sets | `getAdSets` |
| `/{campaign_id}/ads` | Todos os anúncios | `getAds` |

### Insights

| Endpoint | Nível | Método |
|----------|-------|--------|
| `/{campaign_id}/insights` (level default=campaign) | Campanha | `getCampaignInsights` |
| `/{act_id}/insights?level=ad` | Anúncio | `getAdInsightsForReport` |
| `/{act_id}/insights?level=account` | Conta (total) | `getAccountLevelSpend` — usado para validação |

Campos pedidos em insights:
```
impressions, reach, clicks, ctr, cpc, cpm, spend, frequency,
actions, cost_per_action_type, purchase_roas,
video_play_actions (só em level=ad para hook rate)
```

### Saldo e status da conta

`GET /{act_id}?fields=balance,spend_cap,amount_spent,account_status,funding_source_details`

Trato especial para Brasil: contas PIX/boleto aparecem com `funding_source_details.display_string = "Saldo disponível (R$1.605,85 BRL)"`. O `getAccountBalance` parseia essa string com regex quando o campo `balance` está vazio. Para contas internacionais, `balance` vem em centavos — dividimos por 100.

`account_status`:
- 1: active
- 2: disabled
- 3: unsettled
- 7: grace period
- 9: pending closure

## Extração de "ação primária" (`extractPrimaryAction`)

O campo `actions[]` da Meta pode vir com dezenas de tipos. Escolhemos a "ação principal" da campanha com base em prioridade fixa:

```
1. offsite_conversion.fb_pixel_purchase  → "Compras"
2. purchase                               → "Compras"
3. offsite_conversion.fb_pixel_lead       → "Leads"
4. lead                                   → "Leads"
5. complete_registration                  → "Cadastros"
6. onsite_conversion.messaging_conversation_started_7d → "Conversas iniciadas"
7. onsite_conversion.total_messaging_connection         → "Conexões de mensagem"
8. onsite_conversion.messaging_first_reply              → "Primeiras respostas"
9. post_engagement / page_engagement / post_reaction    → "Engajamentos"
10. link_click                              → "Cliques no link"
11. video_view / thruplay                   → "Visualizações"
```

Na agregação de relatórios (`report.service.ts`), usamos **tiers**: dentro do tier mais alto que tem dados, escolhemos a ação de maior volume. Isso evita, por exemplo, reportar "cliques no link" quando existem leads no mesmo período.

## Autenticação OAuth

1. Usuário clica em "Conectar Meta" → backend chama `/auth/meta/connect` → retorna URL do Facebook com state token.
2. Callback em `/auth/meta/callback` troca `code` por long-lived token (60 dias).
3. Token é salvo em `users.access_token`, expiração em `users.token_expiration`.
4. `token-refresh.worker.ts` renova antes de vencer.

Redirect URIs precisam estar cadastradas no **Meta App Dashboard**:
- Local: `http://localhost:3001/api/v1/auth/meta/callback`
- Prod: `https://api.alfamaxdigital.com.br/api/v1/auth/meta/callback`

## Validação de consistência (novo)

Endpoint `GET /meta/validate/:accountId?since=&until=` compara:

- Spend acumulado na tabela `insights_history` para a conta no período;
- Spend retornado direto em `level=account` na Meta API.

Se divergirem mais que 1%, o endpoint retorna `is_accurate: false` e recomenda rodar `POST /meta/validate/:accountId/fix` (que chama `syncAccountForPeriod`). Útil para bater os números antes de gerar relatório para o cliente.

## Falhas comuns

| Sintoma | Causa provável | Ação |
|---------|---------------|------|
| Spend no TrafficAI < Spend no Meta Ads Manager | Faltava paginação em `getCampaigns` ou `getCampaignInsights`; ou limite do frontend a 10 campanhas | Corrigido — rodar sync forçado |
| Saldo nunca aparece | Coluna `cached_amount_spent` / `cached_spend_cap` ausente | Corrigido pela migration `019` |
| OAuth falha em prod | Redirect URI não registrada no Meta App | Atualizar no Meta App Dashboard |
| Sync "sem erro" mas sem dados novos | Token expirado silenciosamente | Ver `token-refresh.worker.ts` e `users.token_expiration` |
