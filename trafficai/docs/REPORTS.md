# Sistema de Relatórios

Geração automática de relatórios para clientes com análise feita por IA e entrega por email/WhatsApp.

## Tipos de relatório

- **Diário** (`daily`): dia de ontem. Cron 1x/dia de manhã.
- **Semanal** (`weekly`): últimos 7 dias terminando ontem.
- **Mensal** (`monthly`): mês civil completo anterior. Gerado no 1º dia do mês seguinte.

Cada tipo pode ser ligado/desligado por cliente em `report_settings`:
```sql
daily_enabled, weekly_enabled, monthly_enabled
auto_send_email, auto_send_whatsapp
```

## Fluxo

1. **Cron** (em `report.worker.ts`) dispara `reportService.generateAutoReports(type)`.
2. Busca todas as contas ativas com o flag correspondente ligado.
3. Para cada conta:
   - Sincroniza dados da Meta para o período exato (`metaService.syncAccountForPeriod`)
   - Agrega métricas em `aggregateMetrics` — ver [METRICS.md](./METRICS.md)
   - Pega insights no nível de **anúncio** (criativos) via `getAdInsightsForReport`
   - Enriquece com thumbnails de criativos
   - Calcula variação percentual vs período anterior
   - Gera análise textual via OpenAI (resumo executivo + análise detalhada + recomendações)
   - Salva em `client_reports`
4. Se `auto_send_email`, chama `sendReportByEmail` com um HTML caprichado da marca.
5. Se `auto_send_whatsapp`, envia mensagem curta com link público.

## Prompt da IA

O prompt inclui:

- Tipo e período do relatório
- Nome do cliente
- **Ação principal detectada** (para que a IA não critique "ausência de ROAS" em campanhas de mensagem)
- Totais do período
- Variações vs período anterior
- Top campanhas

A IA responde em JSON:
```json
{
  "resumo": "3-4 frases para o cliente",
  "analise": "markdown detalhado",
  "recomendacoes": ["...", "...", "..."]
}
```

Modelo usado: `OPENAI_MODEL` (default `gpt-4o`). Fallback em caso de erro: resumo genérico.

## Email

Usa **Resend** via HTTP. Template inline com gradiente Alfamax e cards de métrica.

Campos obrigatórios:
- `RESEND_API_KEY` (env ou por-usuário em `notification_settings.resend_api_key`)
- `RESEND_FROM_EMAIL` — ex.: `relatorios@alfamaxdigital.com.br` (precisa estar verificado no Resend)
- `AGENCY_NAME` — usado como nome do remetente. Default: `Alfamax Digital`

Formato `From`: `${AGENCY_NAME} <${RESEND_FROM_EMAIL}>`.

Registro de envio em `report_sends` (tabela do migration `009`).

## Relatório público (sem login)

Cada relatório tem um `public_token` gerado no insert. A URL é:

```
https://app.alfamaxdigital.com.br/report/{token}
```

A rota `app/report/[token]/page.tsx` no frontend busca `GET /reports/public/{token}` no backend — que retorna o JSON sem autenticação.

Use para enviar por WhatsApp ou copiar para o cliente sem expor nada privado.

## Top criativos (ads)

Em relatórios, processamos ads em `processAdInsights`:

- Filtro: `spend > 0` (ignora ads sem veiculação)
- Ordenação: por spend desc
- **Sem limite** de quantidade (estava cortando em 12)
- Para cada ad:
  - Ação principal (mesma lógica por tier de `aggregateMetrics`)
  - Hook rate: 3s video plays / impressions
  - Thumbnail do criativo

## Comparação com período anterior

```
Se o relatório cobre 2026-04-01..2026-04-30 (30 dias)
→ período anterior = 2026-03-02..2026-03-31
```

A lógica faz `prevStart = periodStart - periodDays`. Pode, em meses de comprimentos diferentes, cobrir um pouco além de um mês — aceitável para efeito de tendência.
