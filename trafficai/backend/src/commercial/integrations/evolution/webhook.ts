// ==============================
// TrafficAI — Evolution Webhook Handler
// Recebe eventos do Evolution API e persiste em comm_messages/conversations.
// URL do webhook (configurar no Evolution): /api/v1/commercial/webhooks/evolution/:integrationId
// ==============================

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { queryOne } from '../../../database/connection';
import { logger } from '../../../shared/logger';
import { persistEvolutionMessage, updateIntegrationConnectionState, type EvolutionMessageEvent } from './persist';

const router = Router();

interface EvolutionWebhookEvent {
    event?: string;       // 'messages.upsert' | 'connection.update' | etc
    instance?: string;
    data?: any;
    sender?: string;
}

// ----- POST /commercial/webhooks/evolution/:integrationId -----

router.post('/evolution/:integrationId', async (req: Request, res: Response): Promise<void> => {
    const { integrationId } = req.params;

    try {
        const intg = await queryOne<{
            user_id: string;
            client_id: string | null;
            credentials: { webhook_secret?: string };
        }>(
            `SELECT user_id, client_id, credentials FROM comm_integrations
             WHERE id = $1 AND type = 'whatsapp_evolution'`,
            [integrationId]
        );
        if (!intg) {
            res.status(200).json({ success: false, error: { message: 'Integração não encontrada' } });
            return;
        }

        // Validação de secret (opcional — Evolution pode ou não enviar header)
        const secret = intg.credentials?.webhook_secret;
        if (secret) {
            const provided = req.header('x-webhook-secret') || req.header('apikey') || '';
            if (!constantTimeEq(provided, secret)) {
                logger.warn('Evolution webhook: secret invalido', { integrationId });
                res.status(401).json({ success: false, error: { message: 'unauthorized' } });
                return;
            }
        }

        const payload = req.body as EvolutionWebhookEvent;
        const eventType = payload.event || (req.body as any)?.event_name;

        if (!eventType) {
            res.json({ success: true, data: { ignored: 'no event type' } });
            return;
        }

        const ctx = {
            userId: intg.user_id,
            clientId: intg.client_id,
            integrationId,
        };

        switch (eventType) {
            case 'messages.upsert':
            case 'MESSAGES_UPSERT':
                await handleMessagesUpsert(ctx, payload.data);
                break;
            case 'connection.update':
            case 'CONNECTION_UPDATE':
                await handleConnectionUpdate(integrationId, payload.data);
                break;
            case 'contacts.upsert':
            case 'CONTACTS_UPSERT':
                // No-op por enquanto (já capturamos nome do push da mensagem)
                break;
            default:
                logger.debug('Evolution webhook event ignorado', { event: eventType });
        }

        res.json({ success: true, data: { event: eventType } });
    } catch (err: any) {
        logger.error('Erro no webhook Evolution', { integrationId, error: err.message });
        // 200 sempre — Evolution faz retry agressivo em 4xx/5xx
        res.status(200).json({ success: false, error: { message: err.message } });
    }
});

// ─── handlers ──────────────────────────────────────────────────────────────

async function handleMessagesUpsert(ctx: { userId: string; clientId: string | null; integrationId: string }, data: any): Promise<void> {
    if (!data) return;

    // Evolution v2 envia 1 mensagem em data.key/data.message
    // Algumas versões mandam array em data.messages
    const messages: any[] = Array.isArray(data?.messages) ? data.messages
        : Array.isArray(data) ? data
            : [data];

    for (const msg of messages) {
        const evt = parseMessage(msg);
        if (!evt) continue;
        try {
            await persistEvolutionMessage(ctx, evt);
        } catch (err: any) {
            logger.warn(`Evolution: falha ao persistir msg ${evt.messageId}: ${err.message}`);
        }
    }
}

async function handleConnectionUpdate(integrationId: string, data: any): Promise<void> {
    const state: string = data?.state || data?.connection || 'unknown';
    const profileName = data?.profileName || data?.user?.name || null;
    await updateIntegrationConnectionState(integrationId, mapState(state), profileName);
    logger.info('Evolution connection update', { integrationId, state, profileName });
}

// ─── parsing ───────────────────────────────────────────────────────────────

function parseMessage(msg: any): EvolutionMessageEvent | null {
    if (!msg) return null;

    // Estrutura típica do Baileys (Evolution usa por baixo):
    // { key: { id, remoteJid, fromMe }, message: { conversation, ... }, pushName, messageTimestamp }
    const key = msg.key || msg;
    if (!key?.id || !key?.remoteJid) return null;

    // Filtra grupos e broadcasts
    const remoteJid: string = key.remoteJid;
    if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@c.us')) return null;

    const phone = remoteJid.split('@')[0]!.split(':')[0]!;     // remove sufixo @ e prefixo de device
    const fromMe: boolean = !!key.fromMe;
    const direction: 'in' | 'out' = fromMe ? 'out' : 'in';

    const m = msg.message || {};
    let content: string | null = null;
    let type = 'text';
    let mediaUrl: string | null = null;

    if (m.conversation) {
        content = m.conversation;
    } else if (m.extendedTextMessage?.text) {
        content = m.extendedTextMessage.text;
    } else if (m.imageMessage) {
        type = 'image';
        content = m.imageMessage.caption || null;
        mediaUrl = m.imageMessage.url || null;
    } else if (m.audioMessage) {
        type = 'audio';
        mediaUrl = m.audioMessage.url || null;
    } else if (m.videoMessage) {
        type = 'video';
        content = m.videoMessage.caption || null;
        mediaUrl = m.videoMessage.url || null;
    } else if (m.documentMessage) {
        type = 'document';
        content = m.documentMessage.fileName || null;
        mediaUrl = m.documentMessage.url || null;
    } else if (m.stickerMessage) {
        type = 'sticker';
    } else if (m.locationMessage) {
        type = 'location';
        content = `${m.locationMessage.degreesLatitude},${m.locationMessage.degreesLongitude}`;
    }

    const timestampSec = Number(msg.messageTimestamp || msg.timestamp || Date.now() / 1000);
    const sentAt = new Date(timestampSec * 1000);

    return {
        messageId: key.id,
        contactPhone: phone,
        contactName: msg.pushName || msg.notifyName || null,
        direction,
        content,
        type,
        mediaUrl,
        sentAt,
        raw: msg,
    };
}

function mapState(s: string): 'open' | 'connecting' | 'close' | 'unknown' {
    const x = String(s).toLowerCase();
    if (x === 'open' || x === 'connected') return 'open';
    if (x === 'connecting' || x === 'qr') return 'connecting';
    if (x === 'close' || x === 'closed' || x === 'disconnected') return 'close';
    return 'unknown';
}

function constantTimeEq(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

export const evolutionWebhookController = router;
