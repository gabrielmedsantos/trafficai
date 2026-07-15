// ==============================
// TrafficAI — Evolution Persist Logic
// Converte payload de webhook do Evolution → comm_conversations + comm_messages.
// Calcula tempo de 1ª resposta, atualiza unanswered_since, mantém contadores.
// ==============================

import { query, queryOne } from '../../../database/connection';
import { logger } from '../../../shared/logger';

export interface EvolutionMessageEvent {
    /** ID externo da mensagem no WhatsApp/Evolution */
    messageId: string;
    /** Telefone do contato (sem @s.whatsapp.net) */
    contactPhone: string;
    /** Nome do contato (do push) — opcional */
    contactName?: string | null;
    /** 'in' = recebida (cliente → nós); 'out' = enviada (nós → cliente) */
    direction: 'in' | 'out';
    /** Texto da mensagem (vazio se for mídia pura) */
    content: string | null;
    /** Tipo: text, image, audio, video, document, sticker, location */
    type: string;
    /** URL de mídia se houver */
    mediaUrl?: string | null;
    /** Timestamp em ms (epoch) */
    sentAt: Date;
    /** Payload original (debug) */
    raw: Record<string, unknown>;
}

interface PersistContext {
    userId: string;
    clientId: string | null;
    integrationId: string;
}

/**
 * Persiste 1 mensagem do WhatsApp:
 * 1. Upsert da conversation (por phone + integration)
 * 2. Insert da message (idempotente por external_id)
 * 3. Atualiza contadores e flags da conversation
 */
export async function persistEvolutionMessage(ctx: PersistContext, evt: EvolutionMessageEvent): Promise<void> {
    if (!evt.contactPhone) {
        logger.warn('Evolution: mensagem sem contactPhone, ignorada', { messageId: evt.messageId });
        return;
    }

    // ----- 1) Upsert conversation -----
    const conv = await getOrCreateConversation(ctx, evt);

    // ----- 2) Insert message (idempotente) -----
    const existing = await queryOne<{ id: string }>(
        `SELECT id FROM comm_messages WHERE conversation_id = $1 AND external_id = $2`,
        [conv.id, evt.messageId]
    );
    if (existing) return;   // já registrada (duplicata de webhook)

    await query(
        `INSERT INTO comm_messages (
            conversation_id, user_id, external_id, direction, content,
            media_url, type, sent_at, sender_salesperson_id, raw_payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
            conv.id, ctx.userId, evt.messageId, evt.direction, evt.content,
            evt.mediaUrl ?? null, evt.type, evt.sentAt,
            evt.direction === 'out' ? conv.salespersonId : null,
            JSON.stringify(evt.raw),
        ]
    );

    // ----- 3) Atualiza estado da conversation -----
    await updateConversationState(conv, evt);
}

interface ConversationRow {
    id: string;
    salespersonId: string | null;
    firstInboundAt: Date | null;
    firstResponseAt: Date | null;
    unansweredSince: Date | null;
    lastMessageAt: Date;
    lastMessageDirection: 'in' | 'out' | null;
}

async function getOrCreateConversation(ctx: PersistContext, evt: EvolutionMessageEvent): Promise<ConversationRow> {
    // Busca por (integration_id, contact_phone) — chave natural
    const existing = await queryOne<{
        id: string;
        salesperson_id: string | null;
        first_inbound_at: Date | null;
        first_response_at: Date | null;
        unanswered_since: Date | null;
        last_message_at: Date;
        last_message_direction: 'in' | 'out' | null;
    }>(
        `SELECT id, salesperson_id, first_inbound_at, first_response_at,
                unanswered_since, last_message_at, last_message_direction
         FROM comm_conversations
         WHERE user_id = $1 AND integration_id = $2 AND contact_phone = $3`,
        [ctx.userId, ctx.integrationId, evt.contactPhone]
    );

    if (existing) {
        // Atualiza nome se chegou agora
        if (evt.contactName) {
            await query(
                `UPDATE comm_conversations SET contact_name = COALESCE(contact_name, $1)
                 WHERE id = $2`,
                [evt.contactName, existing.id]
            );
        }
        return {
            id: existing.id,
            salespersonId: existing.salesperson_id,
            firstInboundAt: existing.first_inbound_at,
            firstResponseAt: existing.first_response_at,
            unansweredSince: existing.unanswered_since,
            lastMessageAt: existing.last_message_at,
            lastMessageDirection: existing.last_message_direction,
        };
    }

    // Cria conversation nova
    const initialUnansweredSince = evt.direction === 'in' ? evt.sentAt : null;
    const ins = await query<{ id: string }>(
        `INSERT INTO comm_conversations (
            user_id, client_id, integration_id, channel, contact_phone, contact_name,
            status, message_count, incoming_count, outgoing_count,
            first_inbound_at, last_message_at, last_message_direction, unanswered_since
         ) VALUES ($1,$2,$3,'whatsapp',$4,$5,'open',0,0,0,$6,$7,$8,$9)
         RETURNING id`,
        [
            ctx.userId, ctx.clientId, ctx.integrationId,
            evt.contactPhone, evt.contactName ?? null,
            evt.direction === 'in' ? evt.sentAt : null,
            evt.sentAt, evt.direction, initialUnansweredSince,
        ]
    );
    return {
        id: ins[0]!.id,
        salespersonId: null,
        firstInboundAt: evt.direction === 'in' ? evt.sentAt : null,
        firstResponseAt: null,
        unansweredSince: initialUnansweredSince,
        lastMessageAt: evt.sentAt,
        lastMessageDirection: evt.direction,
    };
}

async function updateConversationState(conv: ConversationRow, evt: EvolutionMessageEvent): Promise<void> {
    // Calcula nova primeira resposta?
    let firstResponseSeconds: number | null = null;
    let setFirstResponseAt = false;

    if (evt.direction === 'out' && conv.firstInboundAt && !conv.firstResponseAt) {
        firstResponseSeconds = Math.max(0, Math.floor((evt.sentAt.getTime() - conv.firstInboundAt.getTime()) / 1000));
        setFirstResponseAt = true;
    }

    // Calcula nova unanswered_since
    let newUnansweredSince: Date | null;
    if (evt.direction === 'in') {
        // Se a última msg foi 'in' já estava esperando — mantém
        // Se a última foi 'out' ou null, começa contagem agora
        newUnansweredSince = conv.unansweredSince ?? evt.sentAt;
    } else {
        // Out: respondemos, zera o esperando
        newUnansweredSince = null;
    }

    // Calcula primeiro inbound (se nunca houve)
    const firstInboundAt = conv.firstInboundAt ?? (evt.direction === 'in' ? evt.sentAt : null);

    await query(
        `UPDATE comm_conversations SET
            message_count = message_count + 1,
            incoming_count = incoming_count + ${evt.direction === 'in' ? 1 : 0},
            outgoing_count = outgoing_count + ${evt.direction === 'out' ? 1 : 0},
            last_message_at = CASE WHEN $1 > last_message_at THEN $1 ELSE last_message_at END,
            last_message_direction = CASE WHEN $1 >= last_message_at THEN $2 ELSE last_message_direction END,
            unanswered_since = $3,
            first_inbound_at = COALESCE(first_inbound_at, $4),
            first_response_at = ${setFirstResponseAt ? '$5' : 'first_response_at'},
            first_response_seconds = ${setFirstResponseAt ? '$6' : 'first_response_seconds'},
            status = CASE
                WHEN status = 'closed' THEN 'open'  -- mensagem nova reabre conversa
                ELSE status
            END,
            updated_at = NOW()
         WHERE id = $${setFirstResponseAt ? '7' : '5'}`,
        setFirstResponseAt
            ? [evt.sentAt, evt.direction, newUnansweredSince, firstInboundAt, evt.sentAt, firstResponseSeconds, conv.id]
            : [evt.sentAt, evt.direction, newUnansweredSince, firstInboundAt, conv.id]
    );
}

// ----- Connection update helpers -----

export async function updateIntegrationConnectionState(
    integrationId: string,
    state: 'open' | 'connecting' | 'close' | 'unknown',
    profileName?: string | null
): Promise<void> {
    const status = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';
    await query(
        `UPDATE comm_integrations
         SET status = $1, connected_at = CASE WHEN $1 = 'connected' THEN NOW() ELSE connected_at END,
             last_event_at = NOW(),
             config = config || $2::jsonb,
             updated_at = NOW()
         WHERE id = $3`,
        [status, JSON.stringify(profileName ? { profileName } : {}), integrationId]
    );
}
