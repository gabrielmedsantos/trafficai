// ==============================
// TrafficAI — Evolution Webhook Handler
// Recebe eventos do Evolution API e persiste em comm_messages/conversations.
// URL do webhook (configurar no Evolution): /api/v1/commercial/webhooks/evolution/:integrationId
// ==============================

import { Router, Request, Response } from 'express';
import { queryOne } from '../../../database/connection';
import { logger } from '../../../shared/logger';
import {
    persistEvolutionMessage, updateIntegrationConnectionState, type EvolutionMessageEvent,
    upsertEvolutionLabel, upsertLidPhoneMapping, resolveChatIdToPhone, getEvolutionLabelName,
} from './persist';
import { processWhatsAppMessage } from '../../../tracking/whatsapp-lead.service';
import { tryDetectPurchaseMessage } from '../../../tracking/whatsapp-purchase-detector';
import { runConversionRulesForMessage, runConversionRulesForLabel } from '../../../tracking/conversion-rules/rule-runner';
import { recordDiagnosticEvent } from '../../../tracking/diagnostics.service';

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
            tracking_source_id: string | null;
        }>(
            `SELECT user_id, client_id, credentials, tracking_source_id FROM comm_integrations
             WHERE id = $1 AND type = 'whatsapp_evolution'`,
            [integrationId]
        );
        if (!intg) {
            res.status(200).json({ success: false, error: { message: 'Integração não encontrada' } });
            return;
        }

        // Sem validação de secret por header: a Evolution self-hosted (v2, OSS) não
        // suporta enviar header customizado no webhook — isso só existe na versão
        // paga "Cloud". A própria URL (com integrationId em UUID, imprevisível) já
        // é o limite de segurança aqui, igual outros provedores fazem com webhooks.

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
            trackingSourceId: intg.tracking_source_id,
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
            case 'labels.edit':
            case 'LABELS_EDIT':
                await handleLabelsEdit(integrationId, payload.data);
                break;
            case 'labels.association':
            case 'LABELS_ASSOCIATION':
                await handleLabelsAssociation(ctx, payload.data);
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

async function handleMessagesUpsert(
    ctx: { userId: string; clientId: string | null; integrationId: string; trackingSourceId: string | null },
    data: any
): Promise<void> {
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

        if (evt.resolvedFromLid) {
            upsertLidPhoneMapping(ctx.integrationId, evt.resolvedFromLid, evt.contactPhone)
                .catch((err: any) => logger.warn('Evolution: falha ao salvar mapeamento lid->telefone', { error: err.message }));
        }

        // Atribuição de anúncio (ctwa_clid) e detecção de venda por mensagem —
        // mesma conexão Evolution que já atende o inbox do CRM também
        // alimenta o Tracking, quando essa integração está linkada a uma
        // fonte. processWhatsAppMessage() já ignora mensagens fromMe e sem
        // ctwa_clid internamente; nunca bloqueia nem derruba o fluxo do
        // inbox acima em caso de falha.
        if (ctx.trackingSourceId) {
            try {
                const src = await queryOne<any>(
                    `SELECT * FROM tracking_sources WHERE id = $1 AND is_active = TRUE`,
                    [ctx.trackingSourceId]
                );
                if (src) {
                    if (evt.direction === 'in') {
                        await processWhatsAppMessage(src, { data: msg });
                    } else {
                        // Mensagem do próprio atendente — só interessa se bater
                        // com o template de confirmação de compra ("Pedido:" +
                        // "Valor:"); qualquer outro texto passa direto sem efeito.
                        await tryDetectPurchaseMessage(src, evt.contactPhone, evt.content);
                    }
                    // Motor de regras configurável (fase 2) — roda em paralelo ao
                    // detector fixo acima, pras regras que o cliente cadastrar
                    // (qualificação por frase, eventos customizados). Nunca
                    // interfere no fluxo de Lead/Purchase já existente.
                    await runConversionRulesForMessage(
                        src, evt.contactPhone, evt.content, evt.direction, evt.messageId,
                        evt.sentAt || new Date()
                    );
                }
            } catch (err: any) {
                logger.warn('Evolution: captura de atribuição (tracking) falhou', { error: err.message, integrationId: ctx.integrationId });
                recordDiagnosticEvent({
                    userId: ctx.userId, sourceId: ctx.trackingSourceId, severity: 'warning',
                    eventType: 'evolution_attribution_failed',
                    title: 'Falha ao processar mensagem do WhatsApp (Evolution)',
                    message: err.message,
                });
            }
        }
    }
}

async function handleConnectionUpdate(integrationId: string, data: any): Promise<void> {
    const state: string = data?.state || data?.connection || 'unknown';
    const profileName = data?.profileName || data?.user?.name || null;
    await updateIntegrationConnectionState(integrationId, mapState(state), profileName);
    logger.info('Evolution connection update', { integrationId, state, profileName });
}

async function handleLabelsEdit(integrationId: string, data: any): Promise<void> {
    if (!data?.id || !data?.name) return;
    // A Evolution manda o nome com marcas invisíveis LRM/RLM (‎/‏) — limpa
    // antes de salvar, senão o nome exibido/comparado no motor de regras vem sujo.
    const cleanName = String(data.name).replace(/[‎‏]/g, '').trim();
    try {
        await upsertEvolutionLabel(integrationId, String(data.id), cleanName, data.color ?? null, !!data.deleted);
    } catch (err: any) {
        logger.warn('Evolution: falha ao salvar label', { integrationId, error: err.message });
    }
}

async function handleLabelsAssociation(
    ctx: { userId: string; clientId: string | null; integrationId: string; trackingSourceId: string | null },
    data: any
): Promise<void> {
    if (!data?.chatId || !data?.labelId || data.type !== 'add') return;
    if (!ctx.trackingSourceId) return;

    const phone = await resolveChatIdToPhone(ctx.integrationId, data.chatId);
    if (!phone) {
        // @lid sem mapeamento conhecido — o WhatsApp não expôs o JID
        // alternativo pra esse contato ainda; limitação de plataforma, não bug
        // nosso (ver evolution_lid_phone_map/resolveChatIdToPhone em persist.ts).
        recordDiagnosticEvent({
            userId: ctx.userId, sourceId: ctx.trackingSourceId, severity: 'info',
            eventType: 'evolution_lid_unresolved',
            title: 'Etiqueta aplicada em contato não resolvível (@lid)',
            message: `chatId ${data.chatId} sem telefone mapeado — o WhatsApp ainda não expôs o número real desse contato.`,
        });
        return;
    }

    const labelName = await getEvolutionLabelName(ctx.integrationId, String(data.labelId));
    if (!labelName) return; // ainda não recebemos o labels.edit correspondente — ignora

    try {
        const src = await queryOne<any>(
            `SELECT * FROM tracking_sources WHERE id = $1 AND is_active = TRUE`,
            [ctx.trackingSourceId]
        );
        if (!src) return;
        // Sem timestamp na chave — a Evolution reenvia a mesma associação várias
        // vezes num resync; o dedupe de tracking_rule_executions (UNIQUE em
        // rule_id+external_execution_key) cuida de não duplicar o disparo.
        const externalExecutionKey = `label-${data.labelId}-${data.chatId}`;
        await runConversionRulesForLabel(src, phone, labelName, externalExecutionKey);
    } catch (err: any) {
        logger.warn('Evolution: falha ao processar label association', { error: err.message, integrationId: ctx.integrationId });
        recordDiagnosticEvent({
            userId: ctx.userId, sourceId: ctx.trackingSourceId, severity: 'warning',
            eventType: 'evolution_attribution_failed',
            title: 'Falha ao processar etiqueta do WhatsApp (Evolution)',
            message: err.message,
        });
    }
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
    let resolvedFromLid: string | undefined;
    let phone: string;
    if (remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@c.us')) {
        phone = remoteJid.split('@')[0]!.split(':')[0]!;     // remove sufixo @ e prefixo de device
    } else if (remoteJid.endsWith('@lid')) {
        // Contato já migrado pra Linked Identity — só dá pra capturar quando o
        // WhatsApp expõe o JID alternativo (nem sempre acontece, ver
        // remoteJidAlt/participantAlt). Sem isso, a mensagem é ignorada
        // (comportamento anterior) mas registrada como diagnóstico.
        const alt: string | undefined = key.remoteJidAlt || key.participantAlt || msg.remoteJidAlt;
        if (alt && alt.endsWith('@s.whatsapp.net')) {
            phone = alt.split('@')[0]!.split(':')[0]!;
            resolvedFromLid = remoteJid.split('@')[0]!;
        } else {
            return null;
        }
    } else {
        return null;
    }

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
        resolvedFromLid,
    };
}

function mapState(s: string): 'open' | 'connecting' | 'close' | 'unknown' {
    const x = String(s).toLowerCase();
    if (x === 'open' || x === 'connected') return 'open';
    if (x === 'connecting' || x === 'qr') return 'connecting';
    if (x === 'close' || x === 'closed' || x === 'disconnected') return 'close';
    return 'unknown';
}

export const evolutionWebhookController = router;
