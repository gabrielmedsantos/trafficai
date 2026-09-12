// ==============================
// TrafficAI — Google Ads Conversion Upload
// Sobe conversões (Lead, Purchase, etc) pro Google Ads via Click Conversion
// Upload (gclid/gbraid/wbraid), reaproveitando credenciais/token OAuth já
// carregados por googleAds/google-ads.service.ts. Só roda quando a fonte tem
// google_ads_account_id configurado E existe um mapeamento pro nome do evento
// em tracking_google_conversion_actions — senão, sai cedo sem custo nenhum.
//
// IMPORTANTE: o payload abaixo segue o formato estável e documentado da
// ConversionUploadService.UploadClickConversions (Google Ads API REST, em uso
// desde versões antigas e ainda suportado na v20 ao lado da Data Manager API
// mais nova). Confirme contra a referência atual da API antes do primeiro
// envio real de produção — campos podem mudar entre versões major.
//
// Limitação conhecida: exige gclid/gbraid/wbraid. Leads sem nenhum clique
// Google registrado (ex: só telefone via WhatsApp) não sobem por essa via —
// isso precisaria de OfflineUserDataJobService (matching por hash), fora do
// escopo desta primeira versão.
// ==============================

import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { loadCredentials, getAccessToken } from '../googleAds/google-ads.service';
import { MetaRateLimiter } from '../shared/rate-limiter';

const API_BASE = 'https://googleads.googleapis.com/v20';

// Cota de escrita da Google Ads API não é fixa/documentada como a da Meta —
// limite conservador, ajustável conforme uso real observado.
export const googleAdsRateLimiter = new MetaRateLimiter({ maxRequests: 1000, windowMs: 60 * 60 * 1000 });

export interface GoogleConversionInput {
    gclid?: string;
    gbraid?: string;
    wbraid?: string;
    conversionActionResourceName: string;
    conversionDateTimeUnixSec: number;
    value?: number;
    currency?: string;
    orderId?: string;
}

export interface GoogleConversionResult {
    status: 'sent' | 'failed' | 'not_applicable';
    response?: any;
    error?: string;
}

/** Google exige "yyyy-MM-dd HH:mm:ss+HH:MM" — usa sempre UTC (+00:00). */
function formatConversionDateTime(unixSec: number): string {
    const d = new Date(unixSec * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
        + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

export async function sendGoogleConversion(
    userId: string,
    customerId: string,
    input: GoogleConversionInput
): Promise<GoogleConversionResult> {
    if (!input.gclid && !input.gbraid && !input.wbraid) {
        return { status: 'not_applicable', error: 'Sem gclid/gbraid/wbraid — upload de clique exige um deles' };
    }
    try {
        const creds = await loadCredentials(userId);
        const accessToken = await getAccessToken(userId, creds);
        const cleanCustomerId = customerId.replace(/-/g, '');

        const conversion: Record<string, any> = {
            conversionAction: input.conversionActionResourceName,
            conversionDateTime: formatConversionDateTime(input.conversionDateTimeUnixSec),
        };
        if (input.gclid) conversion.gclid = input.gclid;
        else if (input.gbraid) conversion.gbraid = input.gbraid;
        else if (input.wbraid) conversion.wbraid = input.wbraid;
        if (input.value !== undefined) conversion.conversionValue = input.value;
        if (input.currency) conversion.currencyCode = input.currency;
        if (input.orderId) conversion.orderId = input.orderId;

        const body = { conversions: [conversion], partialFailure: true };

        const resp = await googleAdsRateLimiter.executeWithRetry(userId, () =>
            axios.post(`${API_BASE}/customers/${cleanCustomerId}:uploadClickConversions`, body, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'developer-token': creds.developer_token,
                    'login-customer-id': creds.login_customer_id,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            })
        );

        const data = resp.data || {};
        // uploadClickConversions com partialFailure=true retorna 200 mesmo quando
        // a conversão individual falha — o erro vem em partialFailureError, não
        // como HTTP error. Trata isso como falha real.
        if (data.partialFailureError) {
            return { status: 'failed', response: data, error: data.partialFailureError.message || 'partial failure' };
        }
        return { status: 'sent', response: data };
    } catch (err: any) {
        const data = err?.response?.data;
        const detail = data?.error?.message || err.message;
        return { status: 'failed', response: data, error: detail };
    }
}

/**
 * Mapeamento ativo de evento local -> ação de conversão do Google Ads pra
 * essa fonte, se existir. Sem mapeamento, o evento simplesmente não sobe.
 */
export async function getConversionActionMapping(
    trackingSourceId: string,
    eventName: string
): Promise<{ id: string; conversion_action_resource_name: string } | null> {
    const rows = await query<any>(
        `SELECT id, conversion_action_resource_name FROM tracking_google_conversion_actions
         WHERE tracking_source_id = $1 AND event_name = $2 AND is_active = TRUE
         LIMIT 1`,
        [trackingSourceId, eventName]
    );
    return rows[0] || null;
}

/** customer_id da conta Google Ads linkada a uma fonte, se houver. */
export async function getLinkedGoogleAdsCustomerId(googleAdsAccountId: string): Promise<string | null> {
    const rows = await query<{ customer_id: string }>(
        `SELECT customer_id FROM google_ads_accounts WHERE id = $1`,
        [googleAdsAccountId]
    );
    return rows[0]?.customer_id || null;
}

/**
 * Reenvia 1 evento com falha no envio pro Google usando os dados já
 * persistidos em tracking_events. Espelha retryEvent() do tracking.service.ts
 * (Meta), mas isolado nas colunas google_*.
 */
export async function retryGoogleEvent(eventId: string): Promise<{ ok: boolean; status: string; error?: string; retry_count: number }> {
    const rows = await query<any>(
        `SELECT e.*, s.google_ads_account_id, s.user_id
         FROM tracking_events e
         JOIN tracking_sources s ON e.source_id = s.id
         WHERE e.id = $1`,
        [eventId]
    );
    if (!rows.length) return { ok: false, status: 'failed', error: 'Evento não encontrado', retry_count: 0 };
    const ev = rows[0];
    const newRetryCount = (Number(ev.google_retry_count) || 0) + 1;

    if (!ev.google_ads_account_id) {
        return { ok: false, status: 'not_applicable', error: 'Fonte sem conta Google Ads linkada', retry_count: newRetryCount };
    }

    const mapping = await getConversionActionMapping(ev.source_id, ev.event_name);
    const customerId = await getLinkedGoogleAdsCustomerId(ev.google_ads_account_id);
    if (!mapping || !customerId) {
        return { ok: false, status: 'not_applicable', error: 'Sem mapeamento de conversion action', retry_count: newRetryCount };
    }

    const result = await sendGoogleConversion(ev.user_id, customerId, {
        gclid: ev.gclid || undefined,
        gbraid: ev.gbraid || undefined,
        wbraid: ev.wbraid || undefined,
        conversionActionResourceName: mapping.conversion_action_resource_name,
        conversionDateTimeUnixSec: Number(ev.event_time),
        value: ev.value != null ? Number(ev.value) : undefined,
        currency: ev.currency || undefined,
        orderId: ev.external_id || undefined,
    });

    try {
        await query(
            `UPDATE tracking_events SET
                google_status = $1, google_response = $2, google_error = $3,
                google_conversion_action_id = $4, google_retry_count = $5, google_last_retry_at = NOW()
             WHERE id = $6`,
            [
                result.status,
                result.response ? JSON.stringify(result.response) : null,
                result.error || null,
                mapping.id,
                newRetryCount,
                eventId,
            ]
        );
    } catch (err: any) {
        logger.warn('google retry: falha ao atualizar status', { error: err.message });
    }

    return { ok: result.status === 'sent', status: result.status, error: result.error, retry_count: newRetryCount };
}

/**
 * Retenta em batch eventos com falha no envio pro Google, mesmo padrão do
 * retryFailedBatch() do tracking.service.ts (Meta).
 */
export async function retryFailedGoogleBatch(opts: {
    sourceId?: string;
    maxAgeHours?: number;
    maxRetries?: number;
    minSinceLastRetryMs?: number;
    limit?: number;
}): Promise<{ attempted: number; succeeded: number; still_failed: number }> {
    const maxAge = opts.maxAgeHours ?? 24;
    const maxRetries = opts.maxRetries ?? 3;
    const minSince = opts.minSinceLastRetryMs ?? 5 * 60 * 1000;
    const limit = opts.limit ?? 100;

    const params: any[] = [maxAge, maxRetries, minSince, limit];
    let sql = `
        SELECT id FROM tracking_events
        WHERE google_status = 'failed'
          AND google_retry_count < $2
          AND created_at >= NOW() - ($1 || ' hours')::INTERVAL
          AND (google_last_retry_at IS NULL OR google_last_retry_at < NOW() - ($3 || ' milliseconds')::INTERVAL)`;
    if (opts.sourceId) {
        params.push(opts.sourceId);
        sql += ` AND source_id = $${params.length}`;
    }
    sql += ` ORDER BY created_at ASC LIMIT $4`;

    const eventIds = await query<{ id: string }>(sql, params);

    let succeeded = 0;
    let stillFailed = 0;
    for (const row of eventIds) {
        const r = await retryGoogleEvent(row.id);
        if (r.ok) succeeded++; else stillFailed++;
    }
    return { attempted: eventIds.length, succeeded, still_failed: stillFailed };
}
