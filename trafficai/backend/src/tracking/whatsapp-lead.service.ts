// ==============================
// TrafficAI — WhatsApp Click-to-Message Lead Tracking
// Processa webhook do Evolution API (messages.upsert). Quando a mensagem
// traz externalAdReply.ctwaClid (usuário veio de anúncio WhatsApp), captura
// phone + ctwa_clid + ad_source_id, busca o pixel/page associado ao anúncio
// via Meta Graph API e dispara Lead com action_source=business_messaging.
// ==============================

import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { trackEvent, TrackingEventInput } from './tracking.service';

const META_VERSION = 'v20.0';

export interface WhatsAppProcessResult {
    lead_created: boolean;
    meta_sent: boolean;
    phone?: string;
    ctwa_clid?: string;
    pixel_id?: string;
    page_id?: string;
    reason?: string;
}

/** Anda recursivamente no payload do Meta /ads/{id}?fields=tracking_specs
    buscando arrays `dataset` (pixel IDs) e `page`. */
function findDatasetAndPage(obj: any): { dataset: string[]; page: string[] } {
    const result = { dataset: [] as string[], page: [] as string[] };
    function walk(o: any) {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o.dataset)) result.dataset.push(...o.dataset);
        if (Array.isArray(o.fb_pixel)) result.dataset.push(...o.fb_pixel);
        if (Array.isArray(o.page)) result.page.push(...o.page);
        for (const k in o) {
            if (typeof o[k] === 'object' && o[k] !== null) walk(o[k]);
        }
    }
    walk(obj);
    return result;
}

/** Busca pixel_id + page_id no Meta a partir do ID do anúncio. */
async function resolveAdPixelPage(adId: string, accessToken: string): Promise<{ pixel: string | null; page: string | null }> {
    try {
        const r = await axios.get(
            `https://graph.facebook.com/${META_VERSION}/${adId}`,
            {
                params: { access_token: accessToken, fields: 'tracking_specs' },
                timeout: 10000,
            }
        );
        const found = findDatasetAndPage(r.data);
        return {
            pixel: found.dataset[0] || null,
            page: found.page[0] || null,
        };
    } catch (err: any) {
        logger.warn('whatsapp: falha ao buscar pixel/page do ad', {
            ad: adId,
            status: err.response?.status,
            msg: err.response?.data?.error?.message || err.message,
        });
        return { pixel: null, page: null };
    }
}

/**
 * Processa uma mensagem do Evolution API.
 * - Só dispara quando fromMe=false e há ctwaClid (= veio de ad WhatsApp)
 * - Deduplica por (source_id, phone) — só processa 1ª mensagem
 */
export async function processWhatsAppMessage(
    source: any,
    evolutionPayload: any
): Promise<WhatsAppProcessResult> {
    const body = evolutionPayload?.data || evolutionPayload;
    if (!body) return { lead_created: false, meta_sent: false, reason: 'payload vazio' };

    // Ignora mensagens do próprio atendente
    if (body.key?.fromMe === true) {
        return { lead_created: false, meta_sent: false, reason: 'fromMe' };
    }

    const remoteJid = String(body.key?.remoteJid || '');
    const phone = remoteJid.split('@')[0];
    if (!phone) return { lead_created: false, meta_sent: false, reason: 'sem telefone' };

    const adReply = body.contextInfo?.externalAdReply;
    const ctwaClid = adReply?.ctwaClid;
    if (!ctwaClid) {
        return { lead_created: false, meta_sent: false, phone, reason: 'sem ctwa_clid (não veio de anúncio)' };
    }

    // Deduplica — se já tem esse phone nessa fonte, retorna
    const existing = await query<any>(
        `SELECT id FROM tracking_whatsapp_leads WHERE source_id = $1 AND phone = $2`,
        [source.id, phone]
    );
    if (existing.length > 0) {
        return { lead_created: false, meta_sent: false, phone, ctwa_clid: ctwaClid, reason: 'lead já existe' };
    }

    const name = String(body.pushName || '').trim() || null;
    const adSourceId = adReply?.sourceId || null;
    const adSourceUrl = adReply?.sourceUrl || null;
    const adTitle = adReply?.title || null;
    const adThumbUrl = adReply?.thumbnailUrl || null;
    const messageText = body.message?.conversation
        || body.message?.extendedTextMessage?.text
        || null;
    const instanceName = evolutionPayload?.instance || null;

    // Resolve pixel + page via Meta API (se tivermos access_token da fonte)
    let pixelId: string | null = null;
    let pageId: string | null = null;
    if (adSourceId && source.access_token) {
        const resolved = await resolveAdPixelPage(adSourceId, source.access_token);
        pixelId = resolved.pixel;
        pageId = resolved.page;
    }

    // event_id estável (sem Date.now()) — se 2 webhooks disparam pro mesmo
    // phone/source, ambos geram o MESMO event_id e a proteção de dedupe do
    // trackEvent bloqueia o segundo antes de chamar Meta.
    const leadEventId = `ctwa-${phone}-Lead`;

    // Salva no banco — RETURNING id detecta se o INSERT foi bloqueado por
    // race condition (2 webhooks simultâneos passando pelo SELECT check anterior).
    const inserted = await query<{ id: string }>(
        `INSERT INTO tracking_whatsapp_leads (
            source_id, phone, name, ctwa_clid, ad_source_id, ad_source_url,
            ad_title, ad_thumbnail_url, message_text, pixel_id, page_id,
            instance_name, raw_payload, lead_event_id, lead_meta_status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending')
         ON CONFLICT (source_id, phone) DO NOTHING
         RETURNING id`,
        [
            source.id, phone, name, ctwaClid, adSourceId, adSourceUrl,
            adTitle, adThumbUrl, messageText, pixelId, pageId,
            instanceName, JSON.stringify(evolutionPayload), leadEventId,
        ]
    );
    // Se ON CONFLICT bloqueou (race), outro processo já criou o lead e disparou
    // o Lead na Meta — não repete.
    if (inserted.length === 0) {
        return { lead_created: false, meta_sent: false, phone, ctwa_clid: ctwaClid, reason: 'race: lead já criado por outro processo' };
    }

    // Envia Lead pra Meta (event standard — substitui o antigo LeadSubmitted custom)
    let metaSent = false;
    let metaError: string | null = null;

    // Usa o pixel resolvido do anúncio OU o pixel configurado na fonte como fallback
    const effectivePixel = pixelId || source.pixel_id;

    if (effectivePixel && source.access_token) {
        const event: TrackingEventInput = {
            event_name: 'Lead',
            event_id: leadEventId,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'business_messaging',
            messaging_channel: 'whatsapp',
            user_data: {
                phone,
                first_name: name?.split(' ')[0],
                last_name: name?.split(' ').slice(1).join(' ') || undefined,
                external_id: `ctwa-${ctwaClid.slice(0, 20)}`,
                ctwa_clid: ctwaClid,
                page_id: pageId || undefined,
            },
            custom_data: {
                source: 'whatsapp_ad',
                ad_source_id: adSourceId || undefined,
                ad_source_url: adSourceUrl || undefined,
                ad_title: adTitle || undefined,
                message_preview: messageText ? messageText.slice(0, 200) : undefined,
            },
        };

        // Se o pixel resolvido do anúncio for diferente do pixel da fonte, usamos o do anúncio.
        const sourceForEvent = { ...source, pixel_id: effectivePixel };
        try {
            const r = await trackEvent(sourceForEvent, event);
            metaSent = r.meta_status === 'sent';
        } catch (err: any) {
            metaError = err.message;
        }
    } else {
        metaError = 'Pixel não resolvido (acesso ao ad negado ou fonte sem pixel fallback)';
    }

    await query(
        `UPDATE tracking_whatsapp_leads
         SET lead_meta_status = $1, lead_meta_error = $2, updated_at = NOW()
         WHERE source_id = $3 AND phone = $4`,
        [metaSent ? 'sent' : 'failed', metaError, source.id, phone]
    );

    logger.info(`whatsapp lead: ${phone}`, {
        source: source.id, ctwa: ctwaClid.slice(0, 20), ad: adSourceId,
        pixel: effectivePixel, meta_sent: metaSent, error: metaError,
    });

    return {
        lead_created: true, meta_sent: metaSent,
        phone, ctwa_clid: ctwaClid,
        pixel_id: effectivePixel || undefined,
        page_id: pageId || undefined,
    };
}

/**
 * Busca dados de WhatsApp lead associado a um phone (pra enriquecer
 * eventos posteriores do Kommo com ctwa_clid).
 */
export async function findWhatsAppLeadByPhone(
    sourceId: string, phone: string
): Promise<{ ctwa_clid: string | null; pixel_id: string | null; page_id: string | null } | null> {
    const digitsOnly = String(phone).replace(/\D/g, '');
    // Tenta match exato primeiro, depois match com/sem DDI 55
    const candidates = [digitsOnly];
    if (digitsOnly.startsWith('55') && digitsOnly.length >= 12) candidates.push(digitsOnly.slice(2));
    if (!digitsOnly.startsWith('55') && (digitsOnly.length === 10 || digitsOnly.length === 11)) {
        candidates.push('55' + digitsOnly);
    }

    const rows = await query<any>(
        `SELECT ctwa_clid, pixel_id, page_id
         FROM tracking_whatsapp_leads
         WHERE source_id = $1 AND phone = ANY($2)
         ORDER BY created_at DESC LIMIT 1`,
        [sourceId, candidates]
    );
    if (!rows.length) return null;
    return {
        ctwa_clid: rows[0].ctwa_clid,
        pixel_id: rows[0].pixel_id,
        page_id: rows[0].page_id,
    };
}

/** Marca no whatsapp_lead que houve Purchase (pra auditoria). */
export async function recordPurchaseForWhatsAppLead(
    sourceId: string, phone: string, value: number, kommoLeadId: string | null, purchaseEventId: string
): Promise<void> {
    const digitsOnly = String(phone).replace(/\D/g, '');
    const candidates = [digitsOnly];
    if (digitsOnly.startsWith('55') && digitsOnly.length >= 12) candidates.push(digitsOnly.slice(2));
    if (!digitsOnly.startsWith('55') && (digitsOnly.length === 10 || digitsOnly.length === 11)) {
        candidates.push('55' + digitsOnly);
    }
    await query(
        `UPDATE tracking_whatsapp_leads
         SET purchase_event_id = $1, purchase_value = $2, purchase_at = NOW(),
             kommo_lead_id = $3, updated_at = NOW()
         WHERE source_id = $4 AND phone = ANY($5) AND purchase_event_id IS NULL`,
        [purchaseEventId, value, kommoLeadId, sourceId, candidates]
    );
}
