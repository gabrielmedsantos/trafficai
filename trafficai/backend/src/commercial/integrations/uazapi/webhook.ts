// ==============================
// TrafficAI — Uazapi Webhook Handler
// URL do webhook (configurada em UazapiClient.configureWebhook):
// /api/v1/commercial/webhooks/uazapi/:integrationId
//
// Reaproveita a persistência de comm_conversations/comm_messages e o cache
// de labels já construídos pra Evolution — são genéricos (chave é
// integration_id, não dependem do formato do provedor).
// ==============================

import { Router, Request, Response } from 'express';
import { queryOne } from '../../../database/connection';
import { logger } from '../../../shared/logger';
import {
    persistEvolutionMessage, updateIntegrationConnectionState, type EvolutionMessageEvent,
    upsertEvolutionLabel, getEvolutionLabelName,
} from '../evolution/persist';
import { processUazapiMessage } from '../../../tracking/whatsapp-lead.service';
import { tryDetectPurchaseMessage } from '../../../tracking/whatsapp-purchase-detector';
import { runConversionRulesForMessage, runConversionRulesForLabel } from '../../../tracking/conversion-rules/rule-runner';
import { recordDiagnosticEvent } from '../../../tracking/diagnostics.service';

const router = Router();

// ----- POST /commercial/webhooks/uazapi/:integrationId -----

router.post('/uazapi/:integrationId', async (req: Request, res: Response): Promise<void> => {
    const { integrationId } = req.params;

    try {
        const intg = await queryOne<{
            user_id: string; client_id: string | null; tracking_source_id: string | null;
        }>(
            `SELECT user_id, client_id, tracking_source_id FROM comm_integrations
             WHERE id = $1 AND type = 'whatsapp_uazapi'`,
            [integrationId]
        );
        if (!intg) {
            res.status(200).json({ success: false, error: { message: 'Integração não encontrada' } });
            return;
        }

        const body = req.body || {};
        const eventType: string = body.EventType || body.event || body.type || '';
        if (!eventType) {
            res.json({ success: true, data: { ignored: 'no event type' } });
            return;
        }

        const ctx = {
            userId: intg.user_id,
            clientId: intg.client_id,
            integrationId,
            trackingSourceId: intg.tracking_source_id,
        };

        const normalized = eventType.toLowerCase();
        switch (normalized) {
            case 'messages':
                await handleMessage(ctx, body);
                break;
            case 'connection':
                await handleConnection(integrationId, body);
                break;
            case 'labels':
                await handleLabelsEdit(integrationId, body);
                break;
            case 'chat_labels':
                await handleChatLabels(ctx, body);
                break;
            default:
                logger.debug('Uazapi webhook event ignorado', { event: eventType });
        }

        res.json({ success: true, data: { event: eventType } });
    } catch (err: any) {
        logger.error('Erro no webhook Uazapi', { integrationId, error: err.message });
        // 200 sempre — evita retry agressivo do provedor em cima de erro nosso
        res.status(200).json({ success: false, error: { message: err.message } });
    }
});

// ─── handlers ──────────────────────────────────────────────────────────────

async function handleMessage(
    ctx: { userId: string; clientId: string | null; integrationId: string; trackingSourceId: string | null },
    body: any
): Promise<void> {
    const evt = parseUazapiMessageEvent(body);
    if (!evt) return;

    try {
        await persistEvolutionMessage(ctx, evt);
    } catch (err: any) {
        logger.warn(`Uazapi: falha ao persistir msg ${evt.messageId}: ${err.message}`);
    }

    if (!ctx.trackingSourceId) return;

    try {
        const src = await queryOne<any>(
            `SELECT * FROM tracking_sources WHERE id = $1 AND is_active = TRUE`,
            [ctx.trackingSourceId]
        );
        if (!src) return;

        if (evt.direction === 'in') {
            await processUazapiMessage(src, body);
        } else {
            await tryDetectPurchaseMessage(src, evt.contactPhone, evt.content);
        }
        await runConversionRulesForMessage(
            src, evt.contactPhone, evt.content, evt.direction, evt.messageId, evt.sentAt || new Date()
        );
    } catch (err: any) {
        logger.warn('Uazapi: captura de atribuição (tracking) falhou', { error: err.message, integrationId: ctx.integrationId });
        recordDiagnosticEvent({
            userId: ctx.userId, sourceId: ctx.trackingSourceId, severity: 'warning',
            eventType: 'uazapi_attribution_failed',
            title: 'Falha ao processar mensagem do WhatsApp (Uazapi)',
            message: err.message,
        });
    }
}

async function handleConnection(integrationId: string, body: any): Promise<void> {
    const status = body.status || {};
    const instance = body.instance || {};
    const connected = status.connected === true || instance.status === 'connected';
    const state: 'open' | 'connecting' | 'close' | 'unknown' = connected
        ? 'open'
        : instance.status === 'connecting' ? 'connecting'
            : instance.status === 'disconnected' ? 'close' : 'unknown';
    const profileName = instance.profileName || instance.name || null;
    await updateIntegrationConnectionState(integrationId, state, profileName);
    logger.info('Uazapi connection update', { integrationId, state });
}

async function handleLabelsEdit(integrationId: string, body: any): Promise<void> {
    // Evento "labels" do Uazapi manda o catálogo de etiquetas — 1 ou várias.
    const items = Array.isArray(body.labels) ? body.labels : (body.label ? [body.label] : []);
    for (const item of items) {
        const id = String(item?.id ?? item?.labelid ?? '');
        const name = String(item?.name ?? '').trim();
        if (!id || !name) continue;
        try {
            // color da Uazapi vem como colorHex (string), campo da tabela é numérico
            // (formato da Evolution) — não guardamos aqui, só id/nome importam pro motor de regras.
            await upsertEvolutionLabel(integrationId, id, name, null, !!item?.deleted);
        } catch (err: any) {
            logger.warn('Uazapi: falha ao salvar label', { integrationId, error: err.message });
        }
    }
}

async function handleChatLabels(
    ctx: { userId: string; clientId: string | null; integrationId: string; trackingSourceId: string | null },
    body: any
): Promise<void> {
    if (!ctx.trackingSourceId) return;
    const chat = body.chat && typeof body.chat === 'object' ? body.chat : null;
    const labelIds: string[] = Array.isArray(chat?.wa_label) ? chat.wa_label.map(String) : [];
    if (labelIds.length === 0) return;

    const rawPhone = body.phone || body.from || chat?.wa_chatid || '';
    const phone = String(rawPhone).split('@')[0]!.replace(/\D/g, '');
    if (!phone) return;

    try {
        const src = await queryOne<any>(
            `SELECT * FROM tracking_sources WHERE id = $1 AND is_active = TRUE`,
            [ctx.trackingSourceId]
        );
        if (!src) return;

        for (const labelId of labelIds) {
            const labelName = await getEvolutionLabelName(ctx.integrationId, labelId);
            if (!labelName) continue;
            const externalExecutionKey = `label-${labelId}-${phone}`;
            await runConversionRulesForLabel(src, phone, labelName, externalExecutionKey);
        }
    } catch (err: any) {
        logger.warn('Uazapi: falha ao processar chat_labels', { error: err.message, integrationId: ctx.integrationId });
        recordDiagnosticEvent({
            userId: ctx.userId, sourceId: ctx.trackingSourceId, severity: 'warning',
            eventType: 'uazapi_attribution_failed',
            title: 'Falha ao processar etiqueta do WhatsApp (Uazapi)',
            message: err.message,
        });
    }
}

// ─── parsing ───────────────────────────────────────────────────────────────

function parseUazapiMessageEvent(body: any): EvolutionMessageEvent | null {
    const message = body.message && typeof body.message === 'object' ? body.message : null;
    const chat = body.chat && typeof body.chat === 'object' ? body.chat : null;

    const messageId = String(body.id || body.messageid || message?.id || '');
    const rawPhone = body.phone || body.from || body.sender || chat?.wa_chatid || message?.chatid || '';
    const phone = String(rawPhone).split('@')[0]!.replace(/\D/g, '');
    if (!messageId || !phone) return null;

    const fromMe = body.fromMe === true || body.wasSentByApi === true || message?.fromMe === true;
    const direction: 'in' | 'out' = fromMe ? 'out' : 'in';

    const content: string | null =
        (typeof body.message === 'string' ? body.message : null) ||
        message?.text || message?.body || message?.conversation || body.text || null;

    const messageType: string = message?.messageType || body.messageType || 'text';
    const mediaUrl: string | null = message?.mediaUrl || message?.url || null;

    const timestampSec = Number(body.messageTimestamp || message?.messageTimestamp || Date.now() / 1000);
    const sentAt = new Date(timestampSec > 1e12 ? timestampSec : timestampSec * 1000);

    return {
        messageId,
        contactPhone: phone,
        contactName: body.name || body.contactName || body.pushName || chat?.wa_name || null,
        direction,
        content,
        type: messageType,
        mediaUrl,
        sentAt,
        raw: body,
    };
}

export const uazapiWebhookController = router;
