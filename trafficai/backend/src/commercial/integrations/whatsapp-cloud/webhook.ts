// ==============================
// TrafficAI — WhatsApp Cloud API (oficial) Webhook
// URL única pro App inteiro (configurada 1x no Meta Developer Console,
// diferente do Evolution que é 1 URL por instância): Meta manda TODAS as
// mensagens de TODOS os números conectados nesse App pra cá, identificando
// o número por metadata.phone_number_id — por isso o roteamento pra
// comm_integrations acontece aqui dentro, não na URL.
//
// Cobre tanto API Oficial quanto Coexistência pra mensagens novas (o
// `referral` chega igual nos dois — ver whatsapp-lead.service.ts). Os 3
// webhooks extras de Coexistência (history, smb_app_state_sync,
// smb_message_echoes) ainda não têm handler dedicado — ver nota abaixo.
// ==============================

import { Router, Request, Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import { query, queryOne } from '../../../database/connection';
import { logger } from '../../../shared/logger';
import { persistEvolutionMessage, type EvolutionMessageEvent } from '../evolution/persist';
import { processCloudApiMessage } from '../../../tracking/whatsapp-lead.service';

const router = Router();

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
const APP_SECRET = process.env.META_APP_SECRET || '';

// ----- GET /commercial/webhooks/whatsapp-cloud — handshake de verificação -----
// Configurar no Meta Developer Console → seu App → WhatsApp → Configuration →
// Webhook, com essa URL e o mesmo valor de META_WEBHOOK_VERIFY_TOKEN.
router.get('/whatsapp-cloud', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        logger.warn('whatsapp-cloud webhook: handshake de verificação falhou', { mode });
        res.sendStatus(403);
    }
});

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!APP_SECRET) {
        logger.warn('whatsapp-cloud webhook: META_APP_SECRET não configurado — assinatura não verificada');
        return true;
    }
    if (!signatureHeader) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
        return false;
    }
}

// ----- POST /commercial/webhooks/whatsapp-cloud — eventos -----
// Body cru (Buffer) — precisa dos bytes originais pra validar a assinatura
// HMAC antes de fazer JSON.parse. Responde 200 sempre e rápido: a Meta
// reenvia agressivamente em erro/timeout, e falha de processamento aqui
// nunca deve virar um retry storm.
router.post('/whatsapp-cloud', express.raw({ type: 'application/json', limit: '5mb' }), async (req: Request, res: Response) => {
    res.sendStatus(200);

    try {
        const rawBody = req.body as Buffer;
        if (!verifySignature(rawBody, req.header('x-hub-signature-256'))) {
            logger.warn('whatsapp-cloud webhook: assinatura inválida, descartando');
            return;
        }
        const payload = JSON.parse(rawBody.toString('utf8'));
        const entries = Array.isArray(payload?.entry) ? payload.entry : [];
        for (const entry of entries) {
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
                if (change?.field === 'messages') {
                    await handleMessagesValue(change.value);
                } else {
                    // history / smb_app_state_sync / smb_message_echoes (Coexistência) e
                    // outros campos futuros — ainda sem handler dedicado. Loga pra dar
                    // visibilidade em vez de descartar silenciosamente.
                    logger.info('whatsapp-cloud webhook: campo sem handler dedicado', { field: change?.field });
                }
            }
        }
    } catch (err: any) {
        logger.error('whatsapp-cloud webhook: falhou', { error: err.message });
    }
});

async function handleMessagesValue(value: any): Promise<void> {
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    const intg = await queryOne<{
        id: string; user_id: string; client_id: string | null; tracking_source_id: string | null;
    }>(
        `SELECT id, user_id, client_id, tracking_source_id FROM comm_integrations
         WHERE type = 'whatsapp_cloud' AND config->>'phone_number_id' = $1`,
        [phoneNumberId]
    );
    if (!intg) {
        logger.debug('whatsapp-cloud webhook: phone_number_id não conectado nesse App', { phoneNumberId });
        return;
    }

    const contactsByWaId = new Map<string, string | null>();
    for (const c of value.contacts || []) {
        if (c?.wa_id) contactsByWaId.set(c.wa_id, c.profile?.name || null);
    }

    for (const msg of value.messages || []) {
        const contactName = contactsByWaId.get(msg.from) ?? null;

        // 1) Inbox do CRM — mesmo pipeline de persistência usado pelo Evolution.
        try {
            const evt: EvolutionMessageEvent = {
                messageId: msg.id,
                contactPhone: String(msg.from || '').replace(/\D/g, ''),
                contactName,
                direction: 'in',
                content: msg.text?.body ?? null,
                type: msg.type || 'text',
                mediaUrl: null,
                sentAt: new Date(Number(msg.timestamp) * 1000),
                raw: msg,
            };
            await persistEvolutionMessage({ userId: intg.user_id, clientId: intg.client_id, integrationId: intg.id }, evt);
        } catch (err: any) {
            logger.warn('whatsapp-cloud: falha ao persistir msg no inbox', { error: err.message });
        }

        // 2) Atribuição de anúncio — só quando essa integração está linkada a
        // uma fonte de Tracking (ver comm_integrations.tracking_source_id).
        if (intg.tracking_source_id) {
            try {
                const src = await queryOne<any>(
                    `SELECT * FROM tracking_sources WHERE id = $1 AND is_active = TRUE`,
                    [intg.tracking_source_id]
                );
                if (src) await processCloudApiMessage(src, msg, contactName, value);
            } catch (err: any) {
                logger.warn('whatsapp-cloud: captura de atribuição falhou', { error: err.message });
            }
        }
    }

    await query(`UPDATE comm_integrations SET last_event_at = NOW() WHERE id = $1`, [intg.id]);
}

export const whatsappCloudWebhookController = router;
