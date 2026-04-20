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

async function postToMeta(
    pixelId: string,
    accessToken: string,
    payload: any,
    testEventCode?: string | null
): Promise<{ status: 'sent' | 'failed'; response?: MetaCapiResponse; error?: string; fbtrace_id?: string }> {
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
        return {
            status: 'sent',
            response: res.data,
            fbtrace_id: res.data?.fbtrace_id,
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
    const eventId = event.event_id || crypto.randomUUID();
    const actionSource = event.action_source || 'website';

    const userData = buildUserData(event.user_data);
    const emq = computeEmqScore(event.user_data, !!event.event_id);

    const customData: Record<string, any> = { ...(event.custom_data || {}) };
    if (event.value !== undefined) customData.value = event.value;
    if (event.currency) customData.currency = event.currency;

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

    let metaResult: { status: 'sent' | 'failed'; response?: any; error?: string; fbtrace_id?: string } = {
        status: 'failed', error: 'Credenciais Meta não configuradas',
    };

    if (source.pixel_id && source.access_token && source.is_active) {
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
                emq_score, meta_status, meta_response, meta_error, meta_fbtrace_id
            ) VALUES (
                $1,$2,$3,$4,$5,$6,
                $7,$8,$9,$10,
                $11,$12,
                $13,$14,$15,$16,$17,$18,$19,$20,$21,
                $22,$23,$24,$25,$26
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
}

export async function recordClick(sourceId: string, c: ClickRecordInput): Promise<void> {
    // Só grava se tiver ao menos 1 identificador de tráfego.
    if (!c.fbclid && !c.gclid && !c.utm_source && !c.utm_campaign) return;
    try {
        await query(
            `INSERT INTO tracking_clicks (
                source_id, fbclid, gclid, utm_source, utm_medium, utm_campaign,
                utm_content, utm_term, landing_page, referrer,
                client_ip, client_user_agent, country, city
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
                sourceId,
                c.fbclid || null, c.gclid || null,
                c.utm_source || null, c.utm_medium || null, c.utm_campaign || null,
                c.utm_content || null, c.utm_term || null,
                c.landing_page || null, c.referrer || null,
                c.client_ip || null, c.client_user_agent || null,
                c.country || null, c.city || null,
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
} {
    const h = req.headers || {};
    // Preferência: Cloudflare > X-Forwarded-For > req.ip
    const ip =
        (h['cf-connecting-ip'] as string) ||
        (String(h['x-forwarded-for'] || '').split(',')[0].trim()) ||
        req.ip || null;
    const country = (h['cf-ipcountry'] as string) || null;
    const ua = (h['user-agent'] as string) || null;
    return { ip: ip || null, user_agent: ua, country };
}

// ─── Geração de tokens ──────────────────────────────────────────────────────

export function generatePublicToken(): string {
    return crypto.randomBytes(20).toString('hex'); // 40 chars
}

export function generateWebhookSecret(): string {
    return crypto.randomBytes(24).toString('hex'); // 48 chars
}
