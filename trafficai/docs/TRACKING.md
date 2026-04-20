# Sistema de Rastreio — Pixel + Meta CAPI + CRM

Módulo de rastreamento híbrido (browser + server-side) com deduplicação automática via Meta CAPI, integração com CRM (Kommo, RD Station) e dashboard de EMQ.

## Conceitos

- **Fonte de tracking** (`tracking_sources`): uma por site de cliente. Guarda Pixel ID, Access Token CAPI, Test Event Code, domínio, token público (usado no embed) e webhook secret.
- **Evento** (`tracking_events`): toda ação enviada — browser ou webhook. Armazenamos PII hashada (auditoria) + resposta da Meta + EMQ estimado.
- **Clique** (`tracking_clicks`): primeiro toque com `fbclid` / `gclid` / UTMs para atribuição.

## Fluxo

```
Site do cliente                TrafficAI API                 Meta CAPI
     │                               │                            │
 [pixel.js]                          │                            │
     ├── PageView ────────────────►  │                            │
     │   event_id=UUID               │                            │
     │                               ├── hash PII + POST ────────►│
     │                               │                            │
     │                               │◄─── 200 + fbtrace_id ──────┤
     │                               │                            │
     │   (também dispara fbq)        │                            │
     │   mesmo event_id → Meta deduplica                          │

     CRM (Kommo, RD Station)         │                            │
           │                         │                            │
 Lead fechou venda                   │                            │
           │                         │                            │
           ├── webhook assinado ────►│                            │
           │   HMAC-SHA256            ├── hash PII + POST ──────►│
```

## Setup por conta

1. Em `/tracking`, clique em **Nova fonte**.
2. Informe:
   - **Nome** da fonte
   - **Domínio** do site
   - **Pixel ID** (Meta Events Manager)
   - **Access Token CAPI** (Events Manager → Settings → Conversions API → Generate Access Token)
   - **Test Event Code** (opcional, para validar em Test Events)
3. Copie o `<script>` do modal de detalhe e embed no `<head>` do site.

## Pixel JS — eventos automáticos

Assim que embutido, o pixel dispara sem código adicional:

| Evento           | Disparado quando                                    |
|------------------|-----------------------------------------------------|
| `PageView`       | Carregamento da página                              |
| `Scroll50`       | Usuário atinge 50% da página                        |
| `Scroll90`       | Usuário atinge 90% da página                        |
| `Contact`        | Clique em links `wa.me` / `api.whatsapp.com` / `whatsapp://` |
| `InitiateCheckout` | Submit de qualquer `<form>`                       |

## Pixel JS — eventos manuais

```html
<script>
  // Identificar o usuário (persiste na sessão)
  TrafficAI.identify({ email: 'cliente@exemplo.com', phone: '+5511999998888', first_name: 'Maria' });

  // Disparar um ViewContent em página de produto
  TrafficAI.viewContent({ value: 149.90, currency: 'BRL', custom_data: { product_id: 'SKU-42' } });

  // Purchase manual
  TrafficAI.purchase({ value: 149.90, currency: 'BRL', custom_data: { order_id: 'A1B2C3' } });

  // Evento customizado
  TrafficAI.track('NomeDoEvento', { value: 10, currency: 'BRL' });
</script>
```

Elementos também podem ser marcados declarativamente:

```html
<button data-tai-event="InitiateCheckout" data-tai-value="49.90" data-tai-currency="BRL">
  Comprar agora
</button>
```

O form é ignorado (não dispara `InitiateCheckout`) se tiver o atributo `data-tai-ignore`:

```html
<form data-tai-ignore>...</form>
```

## Deduplicação (event_id)

- Cada `track()` do nosso pixel gera um `event_id` único.
- Se o Pixel oficial da Meta (`window.fbq`) estiver presente, nosso script também faz `fbq('track', eventName, data, { eventID })` usando o MESMO `event_id`.
- A Meta deduplica pelo par (`event_name`, `event_id`) — ficamos com a melhor cópia (geralmente a CAPI server-side, que tem IP real).

## Parâmetros capturados

- **Identificadores de mídia**: `fbclid`, `gclid`, `fbp`, `fbc`
- **UTMs**: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- **Advanced Matching (hashado SHA-256)**: email (`em`), telefone (`ph`), nome (`fn`/`ln`), cidade (`ct`), estado (`st`), CEP (`zp`), país (`country`), external_id
- **Geo** (via Cloudflare): país de origem do request (`cf-ipcountry`)
- **Técnico**: IP do cliente, User-Agent, URL da página

### Normalização (antes do SHA-256)

| Campo    | Regra                                                 |
|----------|-------------------------------------------------------|
| email    | `trim` + lowercase                                    |
| phone    | só dígitos; prefixa `55` se Brasil sem DDI            |
| nome     | trim + lowercase + colapsar espaços                   |
| cidade   | trim + lowercase + remover espaços                    |
| estado   | trim + lowercase + primeiros 2 chars                  |
| CEP      | só dígitos, 8 chars                                   |
| país     | trim + lowercase + primeiros 2 chars (ex: `br`)       |

## EMQ (Event Match Quality) estimado

Calculamos uma nota 0-10 por evento, espelhando a lógica da Meta:

| Sinal                      | Pontos |
|----------------------------|--------|
| email hashado              | 2      |
| telefone hashado           | 2      |
| external_id                | 1.5    |
| first_name / last_name     | 0.5 cada |
| city / state / zip / country | 0.3-0.5 cada |
| client_ip                  | 0.8    |
| client_user_agent          | 0.5    |
| fbp / fbc                  | 0.6 cada |
| event_id único             | 0.5    |

Valores >= 7 são excelentes (verde). 4-6 razoáveis (amarelo). <4 ruim (vermelho).

## Integração com CRM (Kommo)

### Endpoint

```
POST https://api.alfamaxdigital.com.br/api/v1/track/webhook/{PUBLIC_TOKEN}
Headers:
  Content-Type: application/json
  X-TAI-Signature: <hex HMAC-SHA256 do body usando o webhook secret>
```

### Mapeamento de eventos

| Estágio no Kommo                  | event name     | Observações |
|-----------------------------------|----------------|-------------|
| Lead criado                       | `Lead`         | Envie email/telefone no `user` |
| Lead → Qualificado                | `Contact`      | Dispare quando marcar status "qualificado" |
| Reunião agendada                  | `Schedule`     | Envie `custom_data.scheduled_at` |
| Negócio ganho                     | `Purchase`     | Envie `value` e `currency` |
| Lead desqualificado               | `Lead_Desqualificado` | Para exclusão de público |

### Payload

```json
{
  "event": "Purchase",
  "event_id": "kommo-deal-987654",
  "external_id": "kommo-lead-12345",
  "value": 2400,
  "currency": "BRL",
  "user": {
    "email": "cliente@exemplo.com",
    "phone": "+5511999998888",
    "first_name": "Maria",
    "last_name": "Silva",
    "city": "Fortaleza",
    "state": "CE",
    "zip": "60000000",
    "country": "BR"
  },
  "custom_data": {
    "pipeline": "Tráfego pago",
    "source": "instagram"
  }
}
```

### Assinatura HMAC

No Kommo (ou qualquer middleware):
1. Concatene o JSON do body como string.
2. `signature = HMAC_SHA256(body, webhook_secret).hex()`
3. Envie no header `X-TAI-Signature`.

Exemplo Node.js:
```js
const crypto = require('crypto');
const body = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-TAI-Signature': signature },
  body,
});
```

O secret pode ser rotacionado a qualquer momento no modal de detalhe da fonte.

## Tabelas criadas (migration 023)

### `tracking_sources`
Configuração por site. Chaves: `public_token` (usado no embed), `webhook_secret` (assina webhooks CRM), `pixel_id` + `access_token` (credenciais Meta).

### `tracking_events`
Log de TODO evento (browser + webhook). Campos importantes:
- `event_name`, `event_id` (dedup), `event_time`
- `action_source` (`website` / `system_generated`)
- `value`, `currency`, `custom_data` JSONB
- `user_data_hashed` — PII hashada para auditoria
- `emq_score` — 0-10
- `meta_status` (`sent` / `failed`), `meta_response`, `meta_error`, `meta_fbtrace_id`

### `tracking_clicks`
Primeiro toque de cada usuário com identificador de tráfego pago:
- `fbclid`, `gclid`, todas as UTMs
- `landing_page`, `referrer`
- `client_ip`, `client_user_agent`, `country`

## Endpoints da API

### Público (sem auth)
- `GET /api/v1/track/pixel/:token.js` — serve o pixel JS
- `POST /api/v1/track/event/:token` — ingest de evento
- `POST /api/v1/track/click/:token` — ingest de clique
- `POST /api/v1/track/webhook/:token` — ingest de CRM (com HMAC)

### Autenticado (JWT)
- `GET /api/v1/tracking/sources`
- `POST /api/v1/tracking/sources`
- `GET /api/v1/tracking/sources/:id`
- `PATCH /api/v1/tracking/sources/:id`
- `DELETE /api/v1/tracking/sources/:id`
- `POST /api/v1/tracking/sources/:id/rotate-webhook`
- `GET /api/v1/tracking/sources/:id/events?limit=&status=&event_name=`
- `GET /api/v1/tracking/sources/:id/stats?days=7`
- `POST /api/v1/tracking/sources/:id/test` — dispara evento PageView de teste para validar credenciais

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| EMQ 1-2 em todos os eventos | PII não está sendo enviada (identify) — faça `TrafficAI.identify({ email, phone })` antes |
| `meta_error: "Invalid OAuth access token"` | Access token expirou ou foi gerado sem escopo `ads_management` |
| `meta_status: failed` com `(#100) Invalid parameter` | Pixel ID não pertence à conta de anúncios do token |
| Evento aparece em Test Events mas não nos Eventos | Test Event Code configurado — remova em prod |
| Eventos chegam mas não somam em métricas | Verifique domínio verificado e agregação de 8 eventos da Meta |
