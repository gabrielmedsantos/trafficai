# DataCrazy CRM Integration Setup

## Overview

TrafficAI now supports **DataCrazy CRM** alongside Kommo. DataCrazy is a Brazilian CRM platform with WhatsApp-native features and AI automation.

**Key Differences vs Kommo:**
- API endpoint is fixed: `https://api.g1.datacrazy.io/api/v1` (no subdomain needed)
- Contact fields (email, phone, name) are **direct on the lead object** (not custom_fields)
- Pipeline model uses "Stages" (simpler structure than Kommo's nested pipelines)
- Rate limit: 60 requests/min per route
- Token is generated once and must be copied immediately

---

## Setup Steps

### 1. Get DataCrazy API Key

1. Login to **https://crm.datacrazy.io**
2. Go to **Settings → API** (or **Configurações → API**)
3. Click **"Generate Token"** (or **"Gerar Token"**)
4. **Copy the token immediately** — it only displays once!
5. Save it securely (you'll paste it into TrafficAI next)

### 2. Configure in TrafficAI

When creating a new **Tracking Source**, fill in:

| Field | Value |
|-------|-------|
| **CRM Type** | `datacrazy` |
| **API Key** | [paste the token from step 1] |
| **New Lead Stage** | e.g., `"Novo Lead"` (configure after testing) |
| **Won Stage** | e.g., `"Venda Ganha"` (configure after testing) |
| **Lost Stage** | e.g., `"Perdido"` (configure after testing) |

### 3. Test Connection

Click **"Testar CRM"** button. If successful, you'll see:

```json
{
  "account": {
    "id": "...",
    "name": "Your DataCrazy Account"
  },
  "discovered_stages": [
    "Novo Lead",
    "Conversando",
    "Venda Ganha",
    "Perdido"
  ]
}
```

Use the discovered stages to configure your tracking backfill.

---

## Backfill Configuration

Once tested, you can enable **Backfill** to:

1. **Enrich Existing Events** — Find leads in DataCrazy and attach email/phone to past events
2. **Sync Won Purchases** — Send `Purchase` events to Meta for leads in "Venda Ganha" stage
3. **Sync Lead Events** — Send `Lead` events to Meta for leads in early stages

### Example Backfill Call

```bash
curl -X POST http://localhost:3000/api/tracking/sources/{SOURCE_ID}/backfill \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enrich_existing": true,
    "sync_won_purchases": true,
    "sync_leads": true
  }'
```

### Backend Configuration (crm_config JSONB)

Store stage names in `tracking_sources.crm_config`:

```json
{
  "newLeadStage": "Novo Lead",
  "wonStage": "Venda Ganha",
  "lostStage": "Perdido"
}
```

---

## Data Extraction

### Email & Phone

DataCrazy returns contacts in two ways:

1. **Direct fields** on lead:
   ```json
   {
     "id": "123",
     "name": "João Silva",
     "email": "joao@example.com",
     "phone": "+55 11 99999-9999"
   }
   ```

2. **Contacts array** (platform-specific):
   ```json
   {
     "contacts": [
       { "type": "EMAIL", "value": "joao@example.com" },
       { "type": "WHATSAPP", "value": "+55 11 99999-9999" }
     ]
   }
   ```

The adapter checks both and normalizes phone numbers to international format (e.g., `5511999999999`).

### Name Extraction

Names are split into first/last:
- Input: `"João da Silva"`
- Output: `first_name: "João"`, `last_name: "da Silva"`

---

## Rate Limits & Performance

**DataCrazy Rate Limit:** 60 requests/minute per route

The adapter implements:
- **Retry logic** on 5xx and timeouts (1x retry with 2s backoff)
- **Throttling** between pagination (300ms between pages)
- **Batch size** of 50 leads per page

For large accounts (>10k leads), backfill may take 1-2 hours.

---

## Monitoring & Debugging

### Logs

Check backend logs for:

```
crm-backfill: DataCrazy discovered N leads in stage "X"
crm-backfill: N events enriched, M purchases synced
crm-backfill: N leads failed (check meta_error in tracking_events)
```

### Check Event Status

```sql
-- Events sent to Meta from DataCrazy backfill
SELECT id, event_name, emq_score, meta_status, meta_error, created_at
FROM tracking_events
WHERE source_id = $1 AND custom_data->>'source' LIKE '%datacrazy%'
ORDER BY created_at DESC
LIMIT 50;
```

### Retry Failed Events

If sync fails:

```bash
curl -X POST http://localhost:3000/api/tracking/sources/{SOURCE_ID}/retry-failed \
  -H "Authorization: Bearer $YOUR_TOKEN"
```

---

## Common Issues

### ❌ "Invalid API Key"

- Verify token was copied **exactly** from DataCrazy (no spaces)
- Tokens expire if set with an expiration date — regenerate if needed
- Check that the token has **read access to Leads**

### ❌ "Stage not found"

- Run the **"Testar CRM"** test to see discovered stages
- Confirm the stage name matches exactly (case-sensitive in some cases)
- DataCrazy may use different terminology (e.g., `"Leads"` vs `"Novo Lead"`)

### ❌ "Rate limit exceeded"

- Backfill throttles automatically (300ms between requests)
- If you see 429 errors, wait 1+ minute before retrying
- Check `X-RateLimit-Remaining` header in logs

### ❌ Emails/phones not syncing

- Confirm leads have email/phone filled in DataCrazy UI
- Check the `extractUserData()` logs to debug field mapping
- Verify the extraction found at least one identifier (email or phone required)

---

## Code Reference

### Main Adapter

**File:** `src/tracking/crm-adapters/datacrazy.adapter.ts`

**Key Methods:**
- `constructor(apiKey)` — Create adapter with Bearer token
- `validate()` — Test credentials, return account info
- `listLeadsByStage(stageName)` — Paginated lead fetch by stage
- `fetchLead(leadId)` — Get single lead by ID
- `extractUserData(lead)` — Extract email/phone/name for Meta CAPI

### Integration Layer

**File:** `src/tracking/crm-sync.service.ts`

**Factory:**
```typescript
getAdapter(source) {
  if (source.crm_type === 'datacrazy') {
    return new DataCrazyAdapter(source.crm_access_token);
  }
  // ...
}
```

**Backfill** automatically handles both Kommo and DataCrazy — just pass the source.

---

## What's NOT Supported (Yet)

- ❌ Custom field mapping (DataCrazy fields are fixed: email, phone, name, company)
- ❌ Two-way sync (only CRM → Meta, no Meta → CRM writes)
- ❌ Deal/Business sync (only Leads for now)
- ❌ Webhook listeners (push notifications from DataCrazy)

**Future:** Can be added via enhancement requests.

---

## API Documentation

- **DataCrazy API Docs:** https://docs.datacrazy.io/
- **Rate Limit Docs:** https://docs.datacrazy.io/essencials/rate-limit
- **Lead Endpoints:** https://docs.datacrazy.io/api-reference/leads

---

## Support

For issues:
1. Check logs in `backend.log`
2. Verify API key and stage names via **"Testar CRM"**
3. Enable debug logging: `DEBUG=datacrazy* npm start`
4. Open an issue with logs attached
