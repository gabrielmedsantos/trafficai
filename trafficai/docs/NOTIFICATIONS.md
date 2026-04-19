# Notificações: Email + WhatsApp

Serviço em `backend/src/notifications/notification.service.ts`.

## Canais

### Email (via Resend)

- Provider: [Resend](https://resend.com)
- API key: `settings.resend_api_key` (por usuário, override) ou `RESEND_API_KEY` (env)
- Remetente: `${AGENCY_NAME || 'Alfamax Digital'} Alertas <${RESEND_FROM_EMAIL}>`
- O domínio de envio precisa estar **verificado** no Resend. Em produção usamos `relatorios@alfamaxdigital.com.br` no domínio `alfamaxdigital.com.br` (DNS com SPF + DKIM).

Log de envio em `notification_log` (não bloqueante — se falhar, o fluxo principal segue).

### WhatsApp (multi-provider)

O usuário escolhe um provedor em `notification_settings.whatsapp_provider`:

| Provider  | Campos necessários                                    | Endpoint              |
|-----------|-------------------------------------------------------|-----------------------|
| `uazapi`  | `uazapi_url`, `uazapi_token`                           | `{url}/send/text`     |
| `evolution` | `evolution_api_url`, `evolution_api_key`, `evolution_instance` | `{url}/message/sendText/{instance}` |
| `zapi`    | `zapi_instance_id`, `zapi_token`, `zapi_client_token`  | `https://api.z-api.io/instances/{id}/token/{token}/send-text` |

Default: `uazapi` (é o que a Alfamax usa).

Telefone é normalizado para só dígitos em `normalizePhone()`.

## Fluxo de `sendAlertNotification(userId, alert)`

```ts
1. Carrega settings do usuário
2. Se alert.severity desabilitada → return
3. Se está em quiet_hours → return + log
4. Dispara email SE email_enabled && notification_email
5. Dispara WhatsApp SE whatsapp_enabled && whatsapp_number && severity === 'critical'
6. Promise.allSettled (não bloqueia — logs de falha separados)
```

## Horário silencioso (`quiet_hours`)

Campos:
- `quiet_hours_enabled BOOL`
- `quiet_start TIME`
- `quiet_end TIME`

Suporta janelas cruzando meia-noite (ex: 22:00 → 08:00). Implementado em `isQuietTime()` com comparação em minutos absolutos do dia.

## Anti-spam de WhatsApp

Três camadas:

1. **Severity-only**: WhatsApp só para `critical`
2. **Dedup 48h**: alertas do mesmo tipo+campanha não se repetem em 48h
3. **Frequência do worker**: alerts.worker roda 1x/dia

Se ainda estiver enchendo o WhatsApp, as alternativas são: subir thresholds em `smart-alerts.service.ts`, desligar tipos específicos em `notification_settings.notify_*`, ou ampliar a janela de dedup.

## Template de email

HTML inline com branding Alfamax (gradiente roxo/azul `#6366f1 → #8b5cf6`). Mostra:
- Badge colorido por severidade
- Título e mensagem
- Comparação ANTES → AGORA (se `previous_value` e `current_value` estiverem presentes)
- CTA para `FRONTEND_URL/alerts`
- Footer com link para Configurações

## Template de WhatsApp

Markdown-ish da Meta (`*negrito*`, `_itálico_`):

```
🚨 *CRÍTICO* — TrafficAI

*Título do alerta*

Mensagem do alerta

📊 CPA: 25.00 → *42.50*

🔗 Ver alertas: https://app.alfamaxdigital.com.br/alerts
```

## Teste manual

Endpoint: `POST /notifications/test-send` com body `{ channel: 'email' | 'whatsapp' }`.

Payload de teste é hardcoded em `sendTestNotification` (CPA 25 → 42.50). Útil para validar credenciais sem precisar esperar um alerta real.
