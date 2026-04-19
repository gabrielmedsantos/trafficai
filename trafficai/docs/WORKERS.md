# Background Workers

Todos os workers usam `node-cron` e são iniciados em `server.ts` logo após o `app.listen`.

```ts
if (process.env.NODE_ENV !== 'test') {
    startSyncWorker();
    startTokenRefreshWorker();
    startAlertsWorker();
    startReportWorker();
}
```

Não há fila externa (sem Bull/BullMQ). Os workers rodam **no mesmo processo** do backend. Para escalar horizontalmente será preciso:

1. Separar os workers em um processo dedicado OU
2. Coordenar via lock no Postgres (ex.: `SELECT pg_try_advisory_lock`)

Hoje, no VPS da Hostinger com um único container, isso está ok.

## 1. `sync.worker.ts` — sincronização Meta Ads

- Cron: `0 8-20 * * *` — **toda hora cheia entre 8h e 20h**
- Chama `metaService.syncUserData(userId, token, daysBack=35)` para cada usuário com `access_token`
- Em seguida chama `smartAlertsService.analyzeActiveAccountsByUser(userId)` — análise de alertas por usuário

> Antes rodava `*/5 * * * *` (a cada 5 min) e pesava a API da Meta à toa. Foi reduzido para cobrir o horário comercial.

## 2. `alerts.worker.ts` — alertas em varredura global

- Cron: `0 9 * * *` — **1× por dia às 9h**
- Chama `smartAlertsService.analyzeActiveAccounts()` (todas as contas ativas, todos os usuários)
- Cobre detecções que dependem de comparação de longo prazo (saldo, status da conta)

## 3. `token-refresh.worker.ts` — renovação do token Meta

- Cron: diário (ver código para horário exato)
- Varre `users` onde `token_expiration` está a < 7 dias de vencer
- Chama endpoint Meta para estender long-lived token
- Atualiza `users.access_token` e `users.token_expiration`

Se o token não puder ser renovado (ex.: usuário revogou permissão), o worker apenas loga o erro. O sync seguinte falhará com 401 e o usuário precisará reconectar no frontend.

## 4. `report.worker.ts` — relatórios automáticos

- Dispara:
  - Daily: cedo da manhã (ex.: 7h)
  - Weekly: segunda de manhã
  - Monthly: dia 1º do mês às 7h

Para cada tipo, chama `reportService.generateAutoReports(type)` que percorre contas habilitadas e gera+envia.

Tempo por conta: ~10–30s (sync Meta + aggregate + OpenAI + email). Para agência com 50 clientes, o job inteiro roda em poucos minutos.

## Operacional

### Para forçar sync de um usuário específico

```bash
# no container do backend
docker exec -it trafficai-backend sh

# dentro do container, use o endpoint autenticado:
curl -X POST https://api.alfamaxdigital.com.br/api/v1/meta/sync \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"days_back": 45}'
```

### Para forçar uma análise de alertas

```bash
curl -X POST https://api.alfamaxdigital.com.br/api/v1/alerts/analyze \
  -H "Authorization: Bearer <JWT>"
```

### Para forçar um relatório mensal hoje

Use `POST /reports/generate` com `type: 'monthly'` e o `account_id` desejado.

## Logs

Logger central em `shared/logger.ts` (winston). Níveis usados:
- `debug` — request logs (cada request HTTP)
- `info` — fluxos esperados (sync completou, email enviado)
- `warn` — falhas não críticas (um criativo não trouxe insight)
- `error` — falhas que merecem atenção (sync de usuário quebrou)

Em produção (Docker), acesse com:

```bash
docker logs -f trafficai-backend --tail 200
```

## Cuidados ao mexer nos crons

1. Não remova o `process.env.NODE_ENV !== 'test'` — tests iriam disparar workers.
2. Se rodar múltiplas instâncias do backend, os crons vão disparar duplicados. Use lock ou separe em processo dedicado.
3. `node-cron` usa o timezone do processo (atualmente UTC no container). Para horários em "horário de Brasília", defina `TZ=America/Sao_Paulo` no `.env.production`. Ainda não setado — conferir antes de confiar em "9h da manhã".
