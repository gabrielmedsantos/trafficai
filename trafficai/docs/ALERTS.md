# Alertas Inteligentes

Engine em `backend/src/analytics/smart-alerts.service.ts`.

## Tipos de alerta

| Tipo interno | Gatilho | Severidade |
|--------------|---------|-----------|
| `cpa_spike` | CPA hoje > 1.5× CPA médio 7 dias | warning |
| `cpa_spike_critical` | CPA hoje > 2× CPA médio | critical |
| `ctr_drop` | CTR hoje < 0.5× CTR médio | warning |
| `roas_drop` | ROAS caiu > 30% vs média | warning |
| `conversion_drop` | Conversões caíram > 50% vs dia anterior com spend estável | critical |
| `no_conversions_despite_spend` | > R$50 gastos e 0 conversões hoje | critical |
| `high_frequency` | Frequência > 3 com ROAS caindo | warning |
| `budget_exhaustion_fast` | Projeção estoura budget em < 2h | warning |
| `balance_low` | Saldo cached < threshold configurado | critical |
| `account_status_issue` | account_status = 3/7/9 | critical |

## Frequência

Worker `alerts.worker.ts` roda **1× por dia às 9h** (cron `0 9 * * *`).

Chamada: `smartAlertsService.analyzeActiveAccounts()` → percorre todas as contas com `is_client_active = true`.

## Deduplicação

Antes de criar um alerta novo, o engine checa se já existe alerta do mesmo tipo para a mesma campanha nas **últimas 48 horas**. Se sim, suprime. Evita notificar o mesmo problema todo dia.

Query:
```sql
SELECT id FROM alerts
WHERE user_id = $1 AND campaign_id = $2 AND type = $3
  AND created_at > NOW() - INTERVAL '48 hours'
LIMIT 1
```

## Notificação

Ao criar um alerta, `notificationService.sendAlertNotification(userId, alert)` é chamado. Regras:

1. Respeita severidade configurada do usuário (`notify_critical`, `notify_warning`, `notify_info`)
2. Respeita horário silencioso (`quiet_start` → `quiet_end`)
3. **WhatsApp apenas para `critical`** — evita spam
4. Email para qualquer severidade habilitada

Ver [NOTIFICATIONS.md](./NOTIFICATIONS.md) para detalhes dos canais.

## Estrutura de um alerta

```typescript
{
  id: UUID,
  user_id: UUID,
  campaign_id: UUID | null,
  type: string,
  severity: 'info' | 'warning' | 'critical',
  title: string,            // ex: "CPA disparou em 120%"
  message: string,          // explicação e contexto
  metric_name: string,      // "cpa", "ctr", "roas"…
  previous_value: number,   // ex: 25.00
  current_value: number,    // ex: 55.00
  is_read: boolean,
  created_at: timestamp
}
```

Exibido no dashboard em "Alertas Recentes" (últimos 5), e na rota `/alerts` em lista completa.

## Ajustes de sensibilidade

Thresholds são constantes em `smart-alerts.service.ts`. Para subir/baixar a sensibilidade, editar as constantes no topo da service (ex: `CPA_SPIKE_MULTIPLIER = 1.5`).

## Extensibilidade

Adicionar um tipo novo:

1. Criar método `checkNovoAlerta(accountId, campaignId, metrics, …)` no service
2. Chamar em `analyzeAccount()` junto com os existentes
3. Se tem severidade crítica e deve ir pro WhatsApp, garantir que `notification.service.ts` não filtra
4. Documentar aqui
