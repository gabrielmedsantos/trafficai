# Backlog de melhorias

Lista viva de coisas que valem a pena encarar depois que o core está estável. Ordenado por valor/custo.

## Alto impacto

### 1. Validação cron-scheduled de consistência

Rodar `GET /meta/validate` para todas as contas ativas 1× por dia e:
- Se delta > 1%, criar um alerta do tipo `data_inconsistency`
- Incluir link para o fix automático

Benefício: gestor não descobre o bug pelo cliente. Custo: 2-3h.

### 2. Timezone explícito no container

Setar `TZ=America/Sao_Paulo` no `.env.production` e no Dockerfile. Hoje os crons disparam em UTC mesmo quando os comentários dizem "9h". Atualmente funciona por coincidência porque a diferença de UTC-3 faz o cron das 9h UTC bater "6h BRT", que é aceitável para o sync, mas o "9h" do alerts.worker está rodando às 6h. Custo: 10 min.

### 3. Guardar previsão de gasto diário

Calcular "pace" (ritmo de gasto nas últimas horas) para projetar se a campanha vai estourar orçamento. Dados estão todos em `insights_history`. Já tem o alerta `budget_exhaustion_fast` mas a projeção é simplista. Custo: 3-5h.

### 4. Dashboard conta-agregado

Hoje o dashboard mostra uma conta por vez. Para gestor com 30 clientes, precisa ter visão de "todas as minhas contas, total investido hoje, alertas críticos abertos". Custo: 1-2 dias (nova rota `/overview`).

### 5. Histórico de relatórios enviados

Tabela `report_sends` já existe mas a UI ainda não mostra "este cliente recebeu X relatórios em Y meses". Útil para justificar valor da agência. Custo: 4h.

## Médio impacto

### 6. Granularidade por ad set

Hoje sincronizamos só campanhas e ads (para relatórios). Ad sets (nível intermediário) ficam ausentes. Impacto: análise de budget por ad set, A/B de audiências. Custo: 1 dia (criar tabela, sync, UI).

### 7. Breakdowns (idade/gênero/placement)

A Meta suporta `breakdowns=age,gender,publisher_platform`. Dashboard hoje só mostra total. Análise de "qual idade converte melhor" seria útil. Custo: 1-2 dias.

### 8. Comparar períodos customizados no dashboard

Hoje compara automaticamente "período selecionado vs anterior de mesmo tamanho". Permitir usuário escolher os dois lados seria poderoso. Custo: 1 dia.

### 9. Webhooks de alerta

Disparar um webhook HTTP configurável quando um alerta critical for criado (para Slack, n8n, etc.). Custo: 3h.

### 10. Rate limiter por usuário na Meta

Hoje o rate limiter é global (classe singleton). Se 10 clientes da Alfamax sincronizarem ao mesmo tempo, disputam o mesmo bucket. Idealmente por `userId`. Custo: 2-3h.

### 11. Cache Redis para insights de leitura

Dashboard recarrega insights do DB toda vez. Em picos, pode pesar. Colocar Redis (Upstash ou local) com TTL de 5 min para `GET /meta/local/insights` reduz 80% das queries. Custo: 1 dia.

## Baixo impacto

### 12. Testes automatizados

Zero testes hoje. Primeiros candidatos:
- `extractPrimaryAction` (função pura — testes unit rápidos)
- `aggregateMetrics` (integration test com DB)
- `getPeriodDates('monthly')` (bug recente foi aqui)

Custo: 2-3 dias para uma suíte mínima útil.

### 13. Observabilidade (Prometheus + Grafana)

Contar métricas: requests/s, erros Meta, p95 de sync. Hostinger VPS tem espaço. Custo: 1 dia para setup + 1 dia para dashboards úteis.

### 14. i18n

Hoje tudo em pt-BR hardcoded. Se quiser vender para agências fora do Brasil, extrair strings. Custo: grande (3+ dias). Provavelmente não vale até ter clientes internacionais.

### 15. Workers isolados em processo dedicado

Se rodar múltiplas instâncias do backend, os crons vão disparar duplicados. Separar em `worker.ts` process garante uma única fonte de truth. Custo: 1 dia.

### 16. Atribuição multi-touch

Hoje contamos conversão onde a Meta atribui (normalmente 7d click). Para cliente com ciclo longo, última interação diverge. Integrar com Google Analytics ou Kommo CRM para attribution cross-channel. Custo: semana+.

## Dívida técnica identificada

- `tmp_*.py` e `tmp_*.js` espalhados no diretório pai — scripts ad-hoc de deploy. Mover para `scripts/` versionado ou deletar. (Hoje: ~50 arquivos no working tree do usuário.)
- `.env.production` está no VPS mas não no repo (correto). Porém não há `.env.example` no backend para guiar o setup. Criar.
- `any` espalhado em muitos services (axios responses). Definir tipos para ao menos as respostas da Meta.
- `backend/src/meta/meta.service.ts` tem ~600 linhas. Começa a pedir split em `meta-insights.service.ts`, `meta-accounts.service.ts` etc.

## Observações de UX

- Botão "Sincronizar" no dashboard sem feedback de progresso real. Para conta com 50 campanhas, leva 30s+ e o usuário pensa que travou. Mostrar "sincronizando X de Y campanhas…" seria bom.
- Quando o usuário muda o período, o dashboard refaz N requests. Em conta com 200 campanhas isso é 200+ requests sequenciais (parcialmente paralelizados agora). Endpoint agregado (`GET /meta/dashboard?account_id=&since=&until=`) resolveria.
