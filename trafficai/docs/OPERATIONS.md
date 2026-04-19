# Runbook — Operações

Guia prático para operar, diagnosticar e reparar o sistema em produção.

## Acessar o VPS

```bash
ssh root@76.13.166.123
# senha: no gerenciador de senhas da Alfamax
```

```bash
cd /root/trafficai
docker ps
docker logs -f trafficai-backend --tail 100
docker logs -f trafficai-frontend --tail 100
```

## Checklist diário (opcional)

1. `docker ps` — todos os containers UP?
2. `docker logs trafficai-backend --since 24h | grep -i error` — erros novos?
3. Conferir `/api/v1/health` no `api.alfamaxdigital.com.br`
4. Conferir dashboard em `app.alfamaxdigital.com.br`

## Problema: números divergem do Gerenciador de Anúncios

Sintoma: cliente reclama que o relatório mostra R$X mas o Gerenciador mostra R$Y.

### Passo 1 — Validar

Chamar o endpoint novo:

```bash
curl "https://api.alfamaxdigital.com.br/api/v1/meta/validate/{account_id}?since=2026-04-01&until=2026-04-19" \
  -H "Authorization: Bearer $JWT"
```

Resposta mostra `db.spend` vs `meta_account_level.spend` e `delta.spend_pct`.

### Passo 2 — Se divergente, forçar sync

```bash
curl -X POST "https://api.alfamaxdigital.com.br/api/v1/meta/validate/{account_id}/fix" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"since":"2026-04-01","until":"2026-04-19"}'
```

Isso chama `syncAccountForPeriod` — baixa todas as campanhas e insights do período diretamente da Meta.

### Passo 3 — Validar de novo

Repetir passo 1. Deve estar dentro de 1%.

### Se ainda divergir

- Ver `GET /meta/debug/account/{id}?since=&until=` — compara `db_campaigns_count` vs `live_campaigns_count`
- Se `live < db`, talvez exista campanha arquivada (a Meta pode esconder)
- Se `live > db`, sync não está salvando — conferir logs

## Problema: sync não roda

1. `docker logs trafficai-backend | grep "Sync worker triggered"`
2. Se não aparece nada, conferir timezone do container:
   ```bash
   docker exec trafficai-backend date
   ```
3. Conferir que `NODE_ENV=production` no `.env.production` (se for `test`, o worker não inicia)

## Problema: token Meta expirado

Sintoma: logs mostram `Meta token expired. Please reconnect your Meta account.`

Solução:
1. Usuário precisa ir em `app.alfamaxdigital.com.br/settings` → "Conectar Meta"
2. Fazer o OAuth de novo
3. O token novo será salvo automaticamente

Prevenção: `token-refresh.worker.ts` tenta renovar. Se está falhando sistematicamente, verificar se o app Meta ainda tem as permissões corretas.

## Problema: email não envia (403 Resend)

Causa mais comum: tentando enviar de um domínio não verificado.

Solução:
1. Entrar no Resend → Domains
2. Verificar `alfamaxdigital.com.br` (SPF + DKIM)
3. `RESEND_FROM_EMAIL` deve estar nesse domínio
4. Recriar container: `docker compose up -d --no-build`

Diagnóstico:
```bash
docker logs trafficai-backend | grep "Resend error"
```

Mostra `status` e `detail` da Resend — geralmente explica exatamente o problema.

## Problema: WhatsApp não chega

Testar:

```bash
curl -X POST "https://api.alfamaxdigital.com.br/api/v1/settings/notifications/test" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"channel":"whatsapp"}'
```

Retorna `{ success: true/false, message: ... }`. Se falhar, a `message` tem a razão (token inválido, número errado, instância desconectada no UazAPI…).

## Problema: Traefik não emite certificado

Logs do Traefik:
```bash
docker logs traefik -f | grep -i acme
```

Checklist:
- Cloudflare em modo DNS-only (sem proxy laranja)
- Porta 80 e 443 abertas no firewall
- Domínio resolvendo pro IP correto: `dig api.alfamaxdigital.com.br`
- `certresolver` bate com o nome no Traefik (no nosso caso é `mytlschallenge`)

## Restart total

```bash
cd /root/trafficai
docker compose down
docker compose up -d --build
```

Enquanto as imagens reconstroem (~3-5 min), o serviço fica off. Para deploy sem downtime:

```bash
docker compose up -d --build --no-deps backend
# aguarda ficar healthy
docker compose up -d --build --no-deps frontend
```

## Rollback

Se uma release quebrou algo:

```bash
cd /root/trafficai
git log --oneline -10
git checkout <commit-anterior>
docker compose up -d --build
```

Se migrou banco em uma release que quebrou, reverter migration manualmente — não há rollback automático no `run-migrations.ts`.

## Snapshot preventivo (Hostinger)

Antes de mudanças grandes:

1. Painel Hostinger → VPS → Snapshots → "Create Snapshot"
2. Aguardar ~5 min
3. Fazer mudança
4. Se algo quebrou, restaurar o snapshot

## Monitoramento

Sem Grafana/Prometheus instalados ainda. Hoje o monitoramento é reativo via:

- Alertas do próprio TrafficAI (ironicamente 🙂)
- Logs via `docker logs`
- Resend: dashboard mostra bounces/deliverability
- Supabase: dashboard mostra conexões, slow queries

Próximo passo razoável: adicionar Uptime Robot apontando para `/health`.

## Contatos úteis

- **Resend**: support@resend.com (responde em 24h)
- **Meta Support**: via Business Help Center (lento — preferir Stack Overflow e docs)
- **Hostinger**: chat no painel (rápido para questões de VPS)
- **Supabase**: suporte Pro no plano atual

## Dois devs editando em paralelo

Combinar antes:
- Snapshot git + snapshot VPS antes de qualquer alteração
- Patches devem ficar em `/root/trafficai` (raiz do repo), não em `/app/dist/` dentro do container. Patches em `/app/dist/` somem no próximo rebuild.
