# Banco de dados

PostgreSQL (atualmente Supabase, projeto `dnrymnhramnmqvqvpwim`). Conexão direta via IPv6 — o pooler do Supabase não é usado porque esse projeto específico não estava disponibilizando o endpoint do pooler e o backend precisou de rede IPv6 dedicada (ver [DEPLOYMENT.md](./DEPLOYMENT.md)).

## Migrations

Ficam em `backend/src/database/migrations/` e são executadas em ordem alfabética pelo `run-migrations.ts`. A tabela `_migrations` registra o que já rodou.

| Arquivo | O que cria |
|---------|------------|
| `001_initial_schema.sql` | Schema base: `users`, `ad_accounts`, `campaigns`, `insights_history`, `ai_analysis`, `alerts`, `creative_analysis` |
| `002_add_client_active_flag.sql` | Coluna `is_client_active` em `ad_accounts` — separa contas que o gestor gerencia ativamente de contas só visíveis no Meta |
| `003_enhance_alerts_system.sql` | Colunas extras de alerta, severidade, dedup |
| `004_notification_settings.sql` | Tabela `notification_settings` (email/WhatsApp por usuário) |
| `005_add_uazapi.sql` | Colunas `uazapi_url`, `uazapi_token` |
| `006_reports.sql` | `client_reports`, `report_settings` |
| `007_billing.sql` | `cached_balance`, `cached_account_status`, `balance_updated_at`, `payment_type`, `balance_alert_threshold` em `ad_accounts` |
| `007_report_edit_fields.sql` | Campos de edição de relatório |
| `008_routine.sql` | Rotina do gestor (`daily_tasks`, Google Calendar) |
| `009_report_whatsapp.sql` | `report_sends` (histórico) |
| `010_daily_whatsapp.sql` | Daily WhatsApp opt-in |
| `011_clients_financial.sql` | `clients` |
| `012_contracts.sql` | `contracts` |
| `013_contract_billing.sql` | Cobranças de contrato |
| `014_contract_file_url.sql` | URL de arquivo de contrato |
| `015_client_workflow_tasks.sql` | Tasks do workflow de cliente |
| `016_meeting_logs.sql` | Logs de reuniões |
| `017_meeting_client_link.sql` | Link entre reunião e cliente |
| `018_timer_and_team.sql` | Timer + time/equipe |
| `019_cached_amount_spent.sql` | **NOVA** — `cached_amount_spent`, `cached_spend_cap` (estavam ausentes; o código já escrevia nessas colunas e falhava silenciosamente) |

## Tabelas-chave para a parte de tráfego

### `users`
```sql
id UUID PK
email TEXT UNIQUE
password_hash TEXT
name TEXT
meta_user_id TEXT          -- ID do usuário na Meta
access_token TEXT          -- long-lived Meta token
token_expiration TIMESTAMPTZ
```

### `ad_accounts`
```sql
id UUID PK
user_id UUID FK users
meta_account_id TEXT          -- ex: "act_123456789"
account_name TEXT
currency TEXT                  -- "BRL"
timezone TEXT                  -- "America/Sao_Paulo"
status TEXT
is_client_active BOOL          -- filtro de "contas que gerencio"
client_notes TEXT
payment_type TEXT              -- "pix" | "card"
balance_alert_threshold NUMERIC
cached_balance NUMERIC          -- saldo atual
cached_account_status INT       -- 1=active, 2=disabled, 3=unsettled, 7=grace, 9=closure
cached_amount_spent NUMERIC     -- total gasto histórico da conta
cached_spend_cap NUMERIC        -- teto de gasto configurado
balance_updated_at TIMESTAMPTZ
UNIQUE (user_id, meta_account_id)
```

### `campaigns`
```sql
id UUID PK
account_id UUID FK ad_accounts
meta_campaign_id TEXT
name TEXT
objective TEXT                  -- MESSAGES, OUTCOME_LEADS, CONVERSIONS…
status TEXT                     -- ACTIVE, PAUSED, DELETED…
daily_budget NUMERIC             -- em R$, já dividido por 100 do valor em centavos da Meta
lifetime_budget NUMERIC
created_time TIMESTAMPTZ
UNIQUE (account_id, meta_campaign_id)
```

### `insights_history` — coração das métricas
```sql
id UUID PK
campaign_id UUID FK campaigns
date DATE                       -- 1 linha por campanha por dia
spend NUMERIC
impressions BIGINT
reach BIGINT
clicks BIGINT
ctr NUMERIC                     -- salvo como reportado pela Meta (0-100 em %)
cpc NUMERIC
cpm NUMERIC
frequency NUMERIC
conversions INT                 -- extraído de actions[] com prioridade (ver metaService.extractPrimaryAction)
cost_per_conversion NUMERIC
roas NUMERIC
actions JSONB                   -- payload bruto da Meta
UNIQUE (campaign_id, date)
```

⚠️ **Calcular métricas agregadas sempre a partir dos TOTAIS**, não média das linhas. Ver [METRICS.md](./METRICS.md).

### `alerts`
```sql
id UUID PK
user_id UUID FK users
campaign_id UUID FK campaigns (nullable)
type TEXT                       -- cpa_spike, ctr_drop, conversion_drop, balance_low…
severity TEXT                   -- info | warning | critical
title TEXT
message TEXT
metric_name TEXT
previous_value NUMERIC
current_value NUMERIC
is_read BOOL
created_at TIMESTAMPTZ
```

### `notification_settings`
```sql
user_id UUID PK
email_enabled BOOL
notification_email TEXT
resend_api_key TEXT             -- opcional, override do env
whatsapp_enabled BOOL
whatsapp_number TEXT
whatsapp_provider TEXT          -- uazapi | evolution | zapi
uazapi_url TEXT                 uazapi_token TEXT
evolution_api_url TEXT          evolution_api_key TEXT   evolution_instance TEXT
zapi_instance_id TEXT           zapi_token TEXT          zapi_client_token TEXT
notify_critical BOOL            notify_warning BOOL        notify_info BOOL
quiet_hours_enabled BOOL
quiet_start TIME                quiet_end TIME
```

### `client_reports` / `report_settings`
Armazenam relatórios gerados (JSON de `metrics`, texto da IA, recomendações) e configurações de envio por cliente. Ver [REPORTS.md](./REPORTS.md).

## Índices importantes

- `idx_insights_campaign_date (campaign_id, date DESC)` — acelera agregações por período
- `idx_campaigns_account (account_id)` e `idx_campaigns_status`
- `idx_alerts_unread (user_id, is_read) WHERE is_read = FALSE`
- `idx_ad_accounts_balance_alert` para jobs que varrem contas com threshold
