# Cálculo de métricas

Esta é a parte do sistema mais sensível a bugs — uma fórmula errada faz os números divergirem do Gerenciador de Anúncios da Meta. Documentamos aqui como cada métrica **deve** ser calculada.

## Princípio fundamental

> Métricas derivadas (CTR, CPC, CPM, ROAS, frequência) **nunca** são a média de linhas diárias. Elas são reconstruídas a partir dos **totais** do período.

A Meta entrega um CTR por dia. Se somarmos R$10/1000impr e R$10/100impr e fizermos a média dos CTRs, obtemos algo diferente de calcular CTR = total_clicks / total_impressions. O Gerenciador da Meta faz a última forma; nós devemos fazer igual.

## Fórmulas corretas

Dado um período (start…end) e uma conta/campanha:

```
total_spend       = Σ spend
total_impressions = Σ impressions
total_reach       = Σ reach            (nota: reach é único por dia, mas
                                         somar dá "exposições únicas por dia")
total_clicks      = Σ clicks
total_conversions = Σ conversions

CTR           = (total_clicks / total_impressions) × 100
CPC           =  total_spend / total_clicks
CPM           = (total_spend / total_impressions) × 1000
CPA           =  total_spend / total_conversions

frequency     = Σ(frequency × reach) / Σ reach     (ponderado pelo alcance)
ROAS          = Σ(roas × spend)     / Σ spend      (ponderado pelo gasto)
```

**Por quê ponderado?** Frequência de um dia com 10k de reach e 1.5x pesa muito mais na percepção do usuário do que um dia com 100 de reach e 5x. A média simples trataria os dois como iguais.

## Onde estão as fórmulas no código

| Arquivo | Função | O que calcula |
|---------|--------|---------------|
| `backend/src/reports/report.service.ts` | `aggregateMetrics` | Agrega por conta via SQL; usa SUMs e divide no código |
| `frontend/src/app/dashboard/page.tsx` | `loadDashboard` | Agrega no cliente somando todas as linhas |
| `backend/src/analytics/smart-alerts.service.ts` | várias | Compara janelas (hoje vs 7 dias atrás) |

SQL de exemplo (já está em `aggregateMetrics`):

```sql
SELECT
    COALESCE(SUM(spend), 0)                   AS total_spend,
    COALESCE(SUM(impressions), 0)             AS total_impressions,
    COALESCE(SUM(reach), 0)                   AS total_reach,
    COALESCE(SUM(clicks), 0)                  AS total_clicks,
    COALESCE(SUM(conversions), 0)             AS total_conversions,
    COALESCE(SUM(frequency * reach), 0)       AS weighted_freq_sum,
    COALESCE(SUM(roas * spend), 0)            AS weighted_roas_sum
FROM insights_history ih
JOIN campaigns c ON ih.campaign_id = c.id
WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3;
```

Depois no código:

```ts
const ctr  = imp > 0 ? (clk / imp) * 100 : 0;
const cpc  = clk > 0 ?  spend / clk      : 0;
const cpm  = imp > 0 ? (spend / imp) * 1000 : 0;
const freq = reach > 0 ? weightedFreqSum / reach : 0;
const roas = spend > 0 ? weightedRoasSum / spend : 0;
```

## "Ação principal" / conversões

Campanhas têm objetivos diferentes (compras, leads, mensagens, engajamento…). Para cada uma, o campo `actions[]` traz vários tipos — às vezes sobrepostos. Escolhemos 1 (uma) ação principal com tiers:

```
Tier 1 (conversão de negócio):
  offsite_conversion.fb_pixel_purchase / purchase  → Compras
  offsite_conversion.fb_pixel_lead / lead          → Leads
  complete_registration                             → Cadastros
  onsite_conversion.messaging_*                     → Mensagens

Tier 2 (engajamento):
  post_engagement                                   → Engajamentos
  link_click                                        → Cliques no link

Tier 3 (vídeo):
  video_view / thruplay                             → Visualizações / ThruPlays
```

Regra: **dentro do tier mais alto com dados**, escolhemos a ação de **maior volume**. Se Tier 1 tem zero, descemos para Tier 2. Se Tier 2 tem zero, Tier 3. Isso evita que uma campanha de compras apareça como "cliques no link" só porque cliques é sempre maior.

Implementado em:
- `extractPrimaryAction` (`meta.service.ts`) — para insights ao vivo
- `aggregateMetrics` (`report.service.ts`) — para relatórios

## Comparações percentuais (vs período anterior)

`calcChange(prev, curr)`:

```ts
if (!prev || prev === 0) return null;   // sem base de comparação
return ((curr - prev) / prev) * 100;
```

Exibido com seta ↑ verde ou ↓ vermelha nos emails e no dashboard.

## Armadilhas conhecidas

- **ROAS médio = 0**: tipicamente quer dizer "campanha não é de conversão de venda". O relatório omite a linha de ROAS quando a ação principal não envolve receita.
- **Frequência pode aparecer como `0.5x`**: significa que alcance > impressões no período, o que só acontece quando há gaps de sync. Corrigir via `/meta/validate` + sync forçado.
- **Spend em centavos**: orçamentos (`daily_budget`, `lifetime_budget`) vêm da Meta em centavos; o código divide por 100 antes de salvar. Valores de `spend` em insights já vêm em reais.
- **Timezone**: a Meta reporta no timezone da **conta**. Uma conta Sao_Paulo e outra UTC podem ter cutoffs diferentes para "hoje". Por segurança, não confiar em "hoje mesmo" — usar D-1.
