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
import { trackEvent, TrackingEventInput, resolveCampaignByMetaId } from './tracking.service';
import { decryptMaybe } from '../shared/encryption';

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

export interface ResolvedAdMetadata {
    pixel: string | null;
    page: string | null;
    ad_name: string | null;
    campaign_id: string | null;
    campaign_name: string | null;
    adset_id: string | null;
    adset_name: string | null;
}

/**
 * Busca pixel_id, page_id e a hierarquia campanha/conjunto/anúncio no Meta a
 * partir do ID do anúncio ("Origem da venda") — na MESMA chamada que já
 * fazíamos só pra pixel/page, já que a Graph API devolve tudo junto via
 * field-expansion. Nunca inventa: campos ausentes ficam null.
 */
async function resolveAdMetadata(adId: string, accessToken: string): Promise<ResolvedAdMetadata> {
    try {
        const r = await axios.get(
            `https://graph.facebook.com/${META_VERSION}/${adId}`,
            {
                params: {
                    access_token: accessToken,
                    fields: 'name,tracking_specs,campaign{id,name},adset{id,name}',
                },
                timeout: 10000,
            }
        );
        const found = findDatasetAndPage(r.data);
        return {
            pixel: found.dataset[0] || null,
            page: found.page[0] || null,
            ad_name: r.data?.name || null,
            campaign_id: r.data?.campaign?.id || null,
            campaign_name: r.data?.campaign?.name || null,
            adset_id: r.data?.adset?.id || null,
            adset_name: r.data?.adset?.name || null,
        };
    } catch (err: any) {
        logger.warn('whatsapp: falha ao buscar metadados do ad', {
            ad: adId,
            status: err.response?.status,
            msg: err.response?.data?.error?.message || err.message,
        });
        return { pixel: null, page: null, ad_name: null, campaign_id: null, campaign_name: null, adset_id: null, adset_name: null };
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

    return processExtractedLead(source, {
        phone,
        name: String(body.pushName || '').trim() || null,
        ctwaClid,
        adSourceId: adReply?.sourceId || null,
        adSourceUrl: adReply?.sourceUrl || null,
        adTitle: adReply?.title || null,
        adThumbUrl: adReply?.thumbnailUrl || null,
        messageText: body.message?.conversation || body.message?.extendedTextMessage?.text || null,
        instanceName: evolutionPayload?.instance || null,
        rawPayload: evolutionPayload,
    });
}

/**
 * Processa uma mensagem do WhatsApp Cloud API oficial (ou Coexistência, que
 * usa o mesmo formato de webhook pra mensagens novas). O campo de atribuição
 * vem em `referral` dentro do objeto message do webhook padrão — bem
 * diferente do contextInfo.externalAdReply do Evolution/Baileys, mas o
 * resultado (ctwa_clid + hierarquia do anúncio) é o mesmo, então cai no
 * mesmo pipeline de dedupe/resolução/envio depois de extraído.
 *
 * `message` é UM item de `entry[].changes[].value.messages[]`.
 * `contactName` vem de `entry[].changes[].value.contacts[0].profile.name`.
 */
export async function processCloudApiMessage(
    source: any,
    message: any,
    contactName: string | null,
    rawPayload: any
): Promise<WhatsAppProcessResult> {
    if (!message) return { lead_created: false, meta_sent: false, reason: 'payload vazio' };

    const phone = String(message.from || '').replace(/\D/g, '');
    if (!phone) return { lead_created: false, meta_sent: false, reason: 'sem telefone' };

    const referral = message.referral;
    const ctwaClid = referral?.ctwa_clid;
    if (!ctwaClid) {
        return { lead_created: false, meta_sent: false, phone, reason: 'sem ctwa_clid (não veio de anúncio)' };
    }

    return processExtractedLead(source, {
        phone,
        name: contactName,
        ctwaClid,
        adSourceId: referral?.source_id || null,
        adSourceUrl: referral?.source_url || null,
        adTitle: referral?.headline || null,
        adThumbUrl: referral?.thumbnail_url || referral?.image_url || null,
        messageText: message.text?.body || null,
        instanceName: 'cloud-api',
        rawPayload,
    });
}

interface ExtractedLeadInput {
    phone: string;
    name: string | null;
    ctwaClid: string;
    adSourceId: string | null;
    adSourceUrl: string | null;
    adTitle: string | null;
    adThumbUrl: string | null;
    messageText: string | null;
    instanceName: string | null;
    rawPayload: any;
}

/**
 * Núcleo compartilhado por Evolution e Cloud API depois que cada um já
 * extraiu os campos do seu próprio formato de payload: dedupe, resolve
 * campanha/conjunto/anúncio, persiste e dispara Lead pra Meta.
 */
async function processExtractedLead(source: any, input: ExtractedLeadInput): Promise<WhatsAppProcessResult> {
    const { phone, name, ctwaClid, adSourceId, adSourceUrl, adTitle, adThumbUrl, messageText, instanceName, rawPayload } = input;

    // Deduplica — se já tem esse phone nessa fonte, retorna
    const existing = await query<any>(
        `SELECT id FROM tracking_whatsapp_leads WHERE source_id = $1 AND phone = $2`,
        [source.id, phone]
    );
    if (existing.length > 0) {
        return { lead_created: false, meta_sent: false, phone, ctwa_clid: ctwaClid, reason: 'lead já existe' };
    }

    // Resolve pixel + page + campanha/conjunto/anúncio via Meta API (se tivermos access_token da fonte)
    let pixelId: string | null = null;
    let pageId: string | null = null;
    let adName: string | null = null;
    let metaCampaignId: string | null = null;
    let metaCampaignName: string | null = null;
    let metaAdsetId: string | null = null;
    let metaAdsetName: string | null = null;
    let campaignId: string | null = null;
    if (adSourceId && source.access_token) {
        const resolved = await resolveAdMetadata(adSourceId, decryptMaybe(source.access_token)!);
        pixelId = resolved.pixel;
        pageId = resolved.page;
        adName = resolved.ad_name;
        metaCampaignId = resolved.campaign_id;
        metaCampaignName = resolved.campaign_name;
        metaAdsetId = resolved.adset_id;
        metaAdsetName = resolved.adset_name;
        if (metaCampaignId) {
            campaignId = await resolveCampaignByMetaId(source.account_id, metaCampaignId);
        }
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
            instance_name, raw_payload, lead_event_id, lead_meta_status,
            campaign_id, meta_campaign_id, meta_campaign_name, meta_adset_id, meta_adset_name, ad_name
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16,$17,$18,$19,$20)
         ON CONFLICT (source_id, phone) DO NOTHING
         RETURNING id`,
        [
            source.id, phone, name, ctwaClid, adSourceId, adSourceUrl,
            adTitle, adThumbUrl, messageText, pixelId, pageId,
            instanceName, JSON.stringify(rawPayload), leadEventId,
            campaignId, metaCampaignId, metaCampaignName, metaAdsetId, metaAdsetName, adName,
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
            campaign: metaCampaignId ? {
                meta_campaign_id: metaCampaignId,
                meta_campaign_name: metaCampaignName || undefined,
                meta_adset_id: metaAdsetId || undefined,
                meta_adset_name: metaAdsetName || undefined,
                meta_ad_id: adSourceId || undefined,
                meta_ad_name: adName || undefined,
            } : undefined,
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
): Promise<{
    ctwa_clid: string | null; pixel_id: string | null; page_id: string | null;
    campaign_id: string | null; meta_campaign_id: string | null; meta_campaign_name: string | null;
    meta_adset_id: string | null; meta_adset_name: string | null; ad_source_id: string | null; ad_name: string | null;
} | null> {
    const digitsOnly = String(phone).replace(/\D/g, '');
    // Tenta match exato primeiro, depois match com/sem DDI 55
    const candidates = [digitsOnly];
    if (digitsOnly.startsWith('55') && digitsOnly.length >= 12) candidates.push(digitsOnly.slice(2));
    if (!digitsOnly.startsWith('55') && (digitsOnly.length === 10 || digitsOnly.length === 11)) {
        candidates.push('55' + digitsOnly);
    }

    const rows = await query<any>(
        `SELECT ctwa_clid, pixel_id, page_id,
                campaign_id, meta_campaign_id, meta_campaign_name,
                meta_adset_id, meta_adset_name, ad_source_id, ad_name
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
        campaign_id: rows[0].campaign_id,
        meta_campaign_id: rows[0].meta_campaign_id,
        meta_campaign_name: rows[0].meta_campaign_name,
        meta_adset_id: rows[0].meta_adset_id,
        meta_adset_name: rows[0].meta_adset_name,
        ad_source_id: rows[0].ad_source_id,
        ad_name: rows[0].ad_name,
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
