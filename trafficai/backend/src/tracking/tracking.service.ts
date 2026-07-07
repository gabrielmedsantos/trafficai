// ==============================
// TrafficAI — Tracking Service
// Responsável por:
//  - Normalização e hashing SHA-256 de PII (Advanced Matching)
//  - Forward server-side para Meta CAPI
//  - Cálculo de EMQ score estimado (0-10)
//  - Persistência em tracking_events
// ==============================

import axios from 'axios';
import crypto from 'crypto';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

const META_VERSION = 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

// Eventos Meta padrão — qualquer outro é aceito como custom.
export const STANDARD_EVENTS = [
    'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
    'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead',
    'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate',
    'FindLocation', 'Schedule', 'StartTrial', 'SubmitApplication', 'Subscribe',
] as const;

// ─── Normalização + Hash ────────────────────────────────────────────────────

function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function normEmail(email: string): string {
    return email.trim().toLowerCase();
}

function normPhone(phone: string): string {
    // Remove tudo que não é dígito. Se não tem código do país, assume 55 (Brasil).
    let digits = phone.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11) digits = '55' + digits;
    return digits;
}

function normName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normCountry(country: string): string {
    return country.trim().toLowerCase().slice(0, 2);
}

function normZip(zip: string): string {
    return zip.replace(/\D/g, '').slice(0, 8);
}

function normCity(city: string): string {
    return city.trim().toLowerCase().replace(/\s+/g, '');
}

function normState(state: string): string {
    return state.trim().toLowerCase().replace(/\s+/g, '').slice(0, 2);
}

function hashArray(value: string | undefined | null, normalizer: (v: string) => string): string[] | undefined {
    if (!value) return undefined;
    const normalized = normalizer(value);
    if (!normalized) return undefined;
    return [sha256(normalized)];
}

export interface TrackingUserInput {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    external_id?: string;
    fbp?: string;
    fbc?: string;
    gclid?: string;         // Google Ads Click ID (vai como custom_data + persistido)
    client_ip?: string;
    client_user_agent?: string;
    // WhatsApp Click-to-Message attribution
    ctwa_clid?: string;     // Click-to-WhatsApp Click ID
    page_id?: string;       // Facebook page associada
}

export interface TrackingEventInput {
    event_name: string;
    event_id?: string;
    event_time?: number;   // unix seconds
    action_source?: 'website' | 'system_generated' | 'phone_call' | 'chat' | 'email' | 'other' | 'business_messaging';
    messaging_channel?: 'whatsapp' | 'messenger' | 'instagram';
    event_source_url?: string;
    value?: number;
    currency?: string;
    custom_data?: Record<string, any>;
    user_data?: TrackingUserInput;
    session_id?: string;   // sessão do visitante (gerado pelo pixel)
}

/**
 * Monta o objeto user_data com PII hashado, no formato esperado pela Meta CAPI.
 */
function buildUserData(u: TrackingUserInput | undefined): Record<string, any> {
    if (!u) return {};
    const ud: Record<string, any> = {};
    if (u.email)        ud.em = hashArray(u.email, normEmail);
    if (u.phone)        ud.ph = hashArray(u.phone, normPhone);
    if (u.first_name)   ud.fn = hashArray(u.first_name, normName);
    if (u.last_name)    ud.ln = hashArray(u.last_name, normName);
    if (u.city)         ud.ct = hashArray(u.city, normCity);
    if (u.state)        ud.st = hashArray(u.state, normState);
    if (u.zip)          ud.zp = hashArray(u.zip, normZip);
    if (u.country)      ud.country = hashArray(u.country, normCountry);
    if (u.external_id)  ud.external_id = hashArray(u.external_id, v => v.trim().toLowerCase());

    // Esses campos NÃO são hashados — Meta exige plain-text.
    if (u.fbp)                 ud.fbp = u.fbp;
    if (u.fbc)                 ud.fbc = u.fbc;
    if (u.client_ip)           ud.client_ip_address = u.client_ip;
    if (u.client_user_agent)   ud.client_user_agent = u.client_user_agent;
    // WhatsApp Click-to-Message
    if (u.ctwa_clid)           ud.ctwa_clid = u.ctwa_clid;
    if (u.page_id)             ud.page_id = u.page_id;

    return ud;
}

/**
 * EMQ (Event Match Quality) estimado — 0 a 10.
 * Cada pedaço de PII e sinal técnico pontua. É uma aproximação da nota que
 * a Meta dá no Events Manager.
 */
export function computeEmqScore(u: TrackingUserInput | undefined, hasEventId: boolean): number {
    if (!u) return hasEventId ? 2 : 1;
    let score = 0;
    // Identificadores fortes (cada um vale 2 pontos)
    if (u.email) score += 2;
    if (u.phone) score += 2;
    if (u.external_id) score += 1.5;
    // Nome completo
    if (u.first_name) score += 0.5;
    if (u.last_name) score += 0.5;
    // Geo
    if (u.city) score += 0.4;
    if (u.state) score += 0.3;
    if (u.zip) score += 0.5;
    if (u.country) score += 0.3;
    // Sinais técnicos
    if (u.client_ip) score += 0.8;
    if (u.client_user_agent) score += 0.5;
    if (u.fbp) score += 0.6;
    if (u.fbc) score += 0.6;
    if (hasEventId) score += 0.5;
    return Math.min(10, Math.round(score));
}

// ─── Forward para Meta CAPI ─────────────────────────────────────────────────

interface MetaCapiResponse {
    events_received?: number;
    fbtrace_id?: string;
    error?: any;
}

export async function postToMeta(
    pixelId: string,
    accessToken: string,
    payload: any,
    testEventCode?: string | null
): Promise<{ status: 'sent' | 'failed' | 'test_only'; response?: MetaCapiResponse; error?: string; fbtrace_id?: string }> {
    try {
        const body: any = { data: [payload] };
        if (testEventCode) body.test_event_code = testEventCode;

        const res = await axios.post(
            `${META_BASE}/${pixelId}/events`,
            body,
            {
                params: { access_token: accessToken },
                timeout: 15000,
                headers: { 'Content-Type': 'application/json' },
            }
        );

        const data: any = res.data || {};
        const received = Number(data.events_received ?? 0);
        const messages: string[] = Array.isArray(data.messages) ? data.messages.map(String) : [];

        // Caso A: a Meta confirmou recebimento (events_received >= 1) e não usamos test_event_code.
        if (received >= 1 && !testEventCode) {
            return {
                status: 'sent',
                response: data,
                fbtrace_id: data.fbtrace_id,
            };
        }

        // Caso B: test_event_code ATIVO. Evento vai pra "Eventos de teste" no Events Manager
        // e NÃO conta em "Visão geral" / atribuição real. Marca como test_only pra ficar claro.
        if (testEventCode) {
            return {
                status: 'test_only',
                response: data,
                error: `test_event_code="${testEventCode}" ativo — evento só aparece na aba "Eventos de teste" do Events Manager`,
                fbtrace_id: data.fbtrace_id,
            };
        }

        // Caso C: Meta respondeu 200 mas events_received=0. Aceitou o JSON mas rejeitou
        // o evento (faltou PII, action_source inválido, pixel inativo, etc).
        return {
            status: 'failed',
            response: data,
            error: messages.length > 0
                ? `Meta aceitou request mas events_received=0 · ${messages.join(' / ')}`
                : 'Meta respondeu 200 mas events_received=0 (evento rejeitado silenciosamente)',
            fbtrace_id: data.fbtrace_id,
        };
    } catch (err: any) {
        const data = err?.response?.data;
        return {
            status: 'failed',
            response: data,
            error: data?.error?.message || err.message,
            fbtrace_id: data?.fbtrace_id,
        };
    }
}

// ─── Track principal ────────────────────────────────────────────────────────

export interface TrackingSource {
    id: string;
    user_id: string;
    pixel_id: string | null;
    access_token: string | null;
    test_event_code: string | null;
    is_active: boolean;
}

export async function trackEvent(
    source: TrackingSource,
    event: TrackingEventInput
): Promise<{ event_id: string; emq_score: number; meta_status: string }> {
    const eventTime = event.event_time || Math.floor(Date.now() / 1000);
    const eventIdProvided = !!event.event_id;
    const eventId = event.event_id || crypto.randomUUID();
    const actionSource = event.action_source || 'website';

    // Dedupe: se o caller passou event_id explícito (browser reenviando por retry
    // ou webhook idempotente), verifica se já foi enviado. Se sim, retorna o
    // resultado do original sem chamar Meta de novo — evita inflar métricas.
    // Se event_id foi gerado aqui (UUID novo), não tem risco de duplicar.
    if (eventIdProvided) {
        const existing = await query<{ event_id: string; emq_score: number; meta_status: string }>(
            `SELECT event_id, emq_score, meta_status FROM tracking_events
             WHERE source_id = $1 AND event_id = $2 LIMIT 1`,
            [source.id, eventId]
        );
        if (existing.length > 0) {
            return {
                event_id: existing[0].event_id,
                emq_score: existing[0].emq_score,
                meta_status: existing[0].meta_status,
            };
        }
    }

    const userData = buildUserData(event.user_data);
    const emq = computeEmqScore(event.user_data, !!event.event_id);

    const customData: Record<string, any> = { ...(event.custom_data || {}) };
    if (event.value !== undefined) customData.value = event.value;
    if (event.currency) customData.currency = event.currency;
    // Google Ads attribution — Meta não tem campo dedicado, vai em custom_data
    // pra ficar disponível em conversões offline e relatórios.
    if (event.user_data?.gclid) customData.gclid = event.user_data.gclid;

    const payload: Record<string, any> = {
        event_name: event.event_name,
        event_time: eventTime,
        event_id: eventId,
        action_source: actionSource,
    };
    if (event.messaging_channel) payload.messaging_channel = event.messaging_channel;
    if (event.event_source_url) payload.event_source_url = event.event_source_url;
    if (Object.keys(userData).length > 0) payload.user_data = userData;
    if (Object.keys(customData).length > 0) payload.custom_data = customData;

    let metaResult: { status: 'sent' | 'failed' | 'test_only'; response?: any; error?: string; fbtrace_id?: string };

    // Mensagem específica conforme o que tá faltando — antes era genérica
    // ("Credenciais Meta não configuradas") e induzia a usuária a procurar
    // problema na config errada.
    if (!source.is_active) {
        metaResult = { status: 'failed', error: 'Fonte desativada (is_active=false) — ative em Editar credenciais' };
    } else if (!source.pixel_id) {
        metaResult = { status: 'failed', error: 'Pixel ID não configurado — cole o Pixel ID em Editar credenciais' };
    } else if (!source.access_token) {
        metaResult = { status: 'failed', error: 'Access Token não configurado — cole o token de acesso da Meta em Editar credenciais' };
    } else {
        metaResult = await postToMeta(
            source.pixel_id,
            source.access_token,
            payload,
            source.test_event_code
        );
    }

    // Persiste — JSONB recebe objeto diretamente
    try {
        await query(
            `INSERT INTO tracking_events (
                source_id, event_name, event_id, event_time, action_source, messaging_channel,
                external_id, event_source_url, value, currency,
                custom_data, user_data_hashed,
                client_ip, client_user_agent, city, state, country, zip, fbp, fbc, ctwa_clid,
                gclid, session_id,
                emq_score, meta_status, meta_response, meta_error, meta_fbtrace_id
            ) VALUES (
                $1,$2,$3,$4,$5,$6,
                $7,$8,$9,$10,
                $11,$12,
                $13,$14,$15,$16,$17,$18,$19,$20,$21,
                $22,$23,
                $24,$25,$26,$27,$28
            )`,
            [
                source.id,
                event.event_name,
                eventId,
                eventTime,
                actionSource,
                event.messaging_channel || null,
                event.user_data?.external_id || null,
                event.event_source_url || null,
                event.value ?? null,
                event.currency || null,
                JSON.stringify(customData),
                JSON.stringify(userData),
                event.user_data?.client_ip || null,
                event.user_data?.client_user_agent || null,
                event.user_data?.city || null,
                event.user_data?.state || null,
                event.user_data?.country || null,
                event.user_data?.zip || null,
                event.user_data?.fbp || null,
                event.user_data?.fbc || null,
                event.user_data?.ctwa_clid || null,
                event.user_data?.gclid || null,
                event.session_id || null,
                emq,
                metaResult.status,
                metaResult.response ? JSON.stringify(metaResult.response) : null,
                metaResult.error || null,
                metaResult.fbtrace_id || null,
            ]
        );
    } catch (dbErr: any) {
        logger.warn('tracking: falha ao persistir evento', { error: dbErr.message });
    }

    if (metaResult.status === 'failed') {
        logger.warn('tracking: envio para Meta falhou', {
            source: source.id,
            event: event.event_name,
            error: metaResult.error,
        });
    }

    return {
        event_id: eventId,
        emq_score: emq,
        meta_status: metaResult.status,
    };
}

// ─── Retry de eventos falhos ────────────────────────────────────────────────

/**
 * Reenvia 1 evento falho pra Meta usando o payload original já persistido.
 * Mantém o mesmo event_id → Meta deduplica caso o original tenha chegado mas
 * tenha respondido com erro (raro, mas seguro).
 * Atualiza retry_count, last_retry_at, meta_status, meta_response, meta_error.
 */
export async function retryEvent(eventId: string): Promise<{
    ok: boolean;
    status: 'sent' | 'failed' | 'test_only';
    error?: string;
    retry_count: number;
}> {
    const rows = await query<any>(
        `SELECT e.*, s.pixel_id, s.access_token, s.test_event_code, s.is_active
         FROM tracking_events e
         JOIN tracking_sources s ON e.source_id = s.id
         WHERE e.id = $1`,
        [eventId]
    );
    if (!rows.length) {
        return { ok: false, status: 'failed', error: 'Evento não encontrado', retry_count: 0 };
    }
    const ev = rows[0];
    const newRetryCount = (Number(ev.retry_count) || 0) + 1;

    if (!ev.is_active) {
        return { ok: false, status: 'failed', error: 'Source desativada', retry_count: newRetryCount };
    }
    if (!ev.pixel_id || !ev.access_token) {
        await query(
            `UPDATE tracking_events SET retry_count = $1, last_retry_at = NOW(),
                meta_error = $2, updated_at = NOW()
             WHERE id = $3`,
            [newRetryCount, 'Credenciais Meta não configuradas', eventId]
        ).catch(() => { /* ignore */ });
        return { ok: false, status: 'failed', error: 'Credenciais Meta não configuradas', retry_count: newRetryCount };
    }

    // Reconstrói o payload exato salvo
    const payload: any = {
        event_name: ev.event_name,
        event_time: Number(ev.event_time),
        event_id: ev.event_id,
        action_source: ev.action_source,
    };
    if (ev.event_source_url) payload.event_source_url = ev.event_source_url;
    if (ev.messaging_channel) payload.messaging_channel = ev.messaging_channel;
    if (ev.user_data_hashed && Object.keys(ev.user_data_hashed).length > 0) {
        payload.user_data = ev.user_data_hashed;
    }
    if (ev.custom_data && Object.keys(ev.custom_data).length > 0) {
        payload.custom_data = ev.custom_data;
    }

    const result = await postToMeta(ev.pixel_id, ev.access_token, payload, ev.test_event_code);

    try {
        await query(
            `UPDATE tracking_events SET
                meta_status = $1,
                meta_response = $2,
                meta_error = $3,
                meta_fbtrace_id = $4,
                retry_count = $5,
                last_retry_at = NOW()
             WHERE id = $6`,
            [
                result.status,
                result.response ? JSON.stringify(result.response) : null,
                result.error || null,
                result.fbtrace_id || null,
                newRetryCount,
                eventId,
            ]
        );
    } catch (err: any) {
        logger.warn('retry: falha ao atualizar status', { error: err.message });
    }

    return {
        // test_only conta como ok pra retry (foi entregue, só que como test event)
        ok: result.status === 'sent' || result.status === 'test_only',
        status: result.status,
        error: result.error,
        retry_count: newRetryCount,
    };
}

/**
 * Retenta em batch: pega eventos failed elegíveis (last_retry_at NULL ou
 * mais antigo que `minSinceMs`) com retry_count < maxRetries.
 * Retorna contagens.
 */
export async function retryFailedBatch(opts: {
    sourceId?: string;
    maxAgeHours?: number;       // janela máxima de retry (default 24h)
    maxRetries?: number;        // tentativas máximas (default 3)
    minSinceLastRetryMs?: number; // espera mínima entre retries (default 5min)
    limit?: number;
}): Promise<{ attempted: number; succeeded: number; still_failed: number }> {
    const maxAge = opts.maxAgeHours ?? 24;
    const maxRetries = opts.maxRetries ?? 3;
    const minSince = opts.minSinceLastRetryMs ?? 5 * 60 * 1000;
    const limit = opts.limit ?? 100;

    const params: any[] = [maxAge, maxRetries, minSince, limit];
    let sql = `
        SELECT id FROM tracking_events
        WHERE meta_status = 'failed'
          AND retry_count < $2
          AND created_at >= NOW() - ($1 || ' hours')::INTERVAL
          AND (last_retry_at IS NULL OR last_retry_at < NOW() - ($3 || ' milliseconds')::INTERVAL)`;
    if (opts.sourceId) {
        params.push(opts.sourceId);
        sql += ` AND source_id = $${params.length}`;
    }
    sql += ` ORDER BY created_at ASC LIMIT $4`;

    const eventIds = await query<{ id: string }>(sql, params);

    let succeeded = 0;
    let stillFailed = 0;
    for (const row of eventIds) {
        const r = await retryEvent(row.id);
        if (r.ok) succeeded++; else stillFailed++;
    }
    return {
        attempted: eventIds.length,
        succeeded,
        still_failed: stillFailed,
    };
}

// ─── Click tracking (primeiro contato: fbclid, gclid, UTMs) ─────────────────

export interface ClickRecordInput {
    fbclid?: string;
    gclid?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    landing_page?: string;
    referrer?: string;
    client_ip?: string;
    client_user_agent?: string;
    country?: string;
    city?: string;
    session_id?: string;
}

export async function recordClick(sourceId: string, c: ClickRecordInput): Promise<void> {
    // Só grava se tiver ao menos 1 identificador de tráfego.
    if (!c.fbclid && !c.gclid && !c.utm_source && !c.utm_campaign) return;
    try {
        await query(
            `INSERT INTO tracking_clicks (
                source_id, fbclid, gclid, utm_source, utm_medium, utm_campaign,
                utm_content, utm_term, landing_page, referrer,
                client_ip, client_user_agent, country, city, session_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
                sourceId,
                c.fbclid || null, c.gclid || null,
                c.utm_source || null, c.utm_medium || null, c.utm_campaign || null,
                c.utm_content || null, c.utm_term || null,
                c.landing_page || null, c.referrer || null,
                c.client_ip || null, c.client_user_agent || null,
                c.country || null, c.city || null,
                c.session_id || null,
            ]
        );
    } catch (err: any) {
        logger.warn('tracking: falha ao persistir clique', { error: err.message });
    }
}

// ─── Helpers para extrair IP + Geo do request ────────────────────────────────

export function extractClientContext(req: any): {
    ip: string | null;
    user_agent: string | null;
    country: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
} {
    const h = req.headers || {};
    // Preferência: Cloudflare > X-Forwarded-For > req.ip
    const ip =
        (h['cf-connecting-ip'] as string) ||
        (String(h['x-forwarded-for'] || '').split(',')[0].trim()) ||
        req.ip || null;
    const country = (h['cf-ipcountry'] as string) || null;
    // Cloudflare enterprise/business mandam city + region (estado).
    // Em planos free, esses headers podem vir vazios — tratamos como fallback opcional.
    const city = (h['cf-ipcity'] as string) || null;
    // cf-region: nome do estado; cf-region-code: sigla (ex: SP). Preferimos a sigla.
    const state = (h['cf-region-code'] as string) || (h['cf-region'] as string) || null;
    const zip = (h['cf-postal-code'] as string) || null;
    const ua = (h['user-agent'] as string) || null;
    return {
        ip: ip || null,
        user_agent: ua,
        country: country || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
    };
}

// ─── Geração de tokens ──────────────────────────────────────────────────────

export function generatePublicToken(): string {
    return crypto.randomBytes(20).toString('hex'); // 40 chars
}

export function generateWebhookSecret(): string {
    return crypto.randomBytes(24).toString('hex'); // 48 chars
}
