"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastsService = void 0;

const database_1 = require("../../config/database");

function toDto(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        status: row.status,
        content: row.content,
        messageType: row.message_type || 'text',
        templateId: row.template_id || null,
        templateVars: row.template_vars || {},
        documentUrl: row.document_url || null,
        documentFilename: row.document_filename || null,
        filters: {
            tagsAny: row.filter_tags_any || [],
            tagsAll: row.filter_tags_all || [],
            stageIds: row.filter_stage_ids || [],
            assignedIds: row.filter_assigned_ids || [],
            status: row.filter_status || [],
            onlyWithContact: row.filter_only_with_contact,
        },
        connectionIds: row.connection_ids || [],
        onReplyFlowId: row.on_reply_flow_id || null,
        telegramConnectionIds: row.telegram_connection_ids || [],
        channelType: row.channel_type,
        scheduledAt: row.scheduled_at,
        sendWindow: { start: row.send_window_start, end: row.send_window_end },
        intervalSeconds: { min: row.interval_min_seconds, max: row.interval_max_seconds },
        counts: {
            total: row.total_contacts,
            sent: row.sent_count,
            failed: row.failed_count,
            cancelled: row.cancelled_count,
            pending: Math.max(0, row.total_contacts - row.sent_count - row.failed_count - row.cancelled_count),
        },
        createdAt: row.created_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
    };
}

class BroadcastsService {
    async list(workspaceId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT * FROM broadcasts WHERE workspace_id = $1::uuid ORDER BY created_at DESC LIMIT 200`,
            workspaceId);
        return rows.map(toDto);
    }

    async get(workspaceId, id) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT * FROM broadcasts WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
            id, workspaceId);
        return rows[0] ? toDto(rows[0]) : null;
    }

    async create(workspaceId, userId, input) {
        const rows = await database_1.prisma.$queryRawUnsafe(
`INSERT INTO broadcasts (
                workspace_id, name, description, content, message_type, template_id, template_vars, document_url, document_filename,
                filter_tags_any, filter_tags_all, filter_stage_ids, filter_assigned_ids, filter_status, filter_only_with_contact,
                connection_ids, telegram_connection_ids, on_reply_flow_id, channel_type,
                scheduled_at, send_window_start, send_window_end, interval_min_seconds, interval_max_seconds,
                created_by_id
            ) VALUES (
                $1::uuid, $2, $3, $4, $5, $6::uuid, $7::jsonb, $8, $9,
                $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15,
                $16::jsonb, $17::jsonb, $18::uuid, $19,
                $20::timestamptz, $21, $22, $23, $24,
                $25::uuid
            ) RETURNING *`,
            workspaceId,
            input.name, input.description || null,
            input.content, input.messageType || 'text', input.templateId || null,
            JSON.stringify(input.templateVars || {}),
            input.documentUrl || null, input.documentFilename || null,
            JSON.stringify(input.filters?.tagsAny || []),
            JSON.stringify(input.filters?.tagsAll || []),
            JSON.stringify(input.filters?.stageIds || []),
            JSON.stringify(input.filters?.assignedIds || []),
            JSON.stringify(input.filters?.status || []),
            input.filters?.onlyWithContact !== false,
            JSON.stringify(input.connectionIds || []),
            JSON.stringify(input.telegramConnectionIds || []),
            input.onReplyFlowId || null,
            input.channelType || 'whatsapp',
            input.scheduledAt || null,
            input.sendWindow?.start || null, input.sendWindow?.end || null,
            input.intervalSeconds?.min || 3, input.intervalSeconds?.max || 8,
            userId || null
        );
        return toDto(rows[0]);
    }

    async update(workspaceId, id, input) {
        const current = await this.get(workspaceId, id);
        if (!current) return null;
        if (!['DRAFT', 'PAUSED'].includes(current.status)) {
            throw new Error('Só é possível editar broadcasts em rascunho ou pausados');
        }
        const sets = [];
        const vals = [];
        let i = 1;
        const push = (col, v, cast = '') => { sets.push(`${col} = $${i++}${cast}`); vals.push(v); };
        if (typeof input.name === 'string')        push('name', input.name);
        if (typeof input.description === 'string' || input.description === null) push('description', input.description);
        if (typeof input.content === 'string')     push('content', input.content);
        if (typeof input.messageType === 'string') push('message_type', input.messageType);
        if (typeof input.templateId !== 'undefined') push('template_id', input.templateId || null, '::uuid');
        if (typeof input.templateVars !== 'undefined') push('template_vars', JSON.stringify(input.templateVars || {}), '::jsonb');
        if (typeof input.documentUrl !== 'undefined') push('document_url', input.documentUrl || null);
        if (typeof input.documentFilename !== 'undefined') push('document_filename', input.documentFilename || null);
        if (input.filters) {
            const f = input.filters;
            if (f.tagsAny)      push('filter_tags_any',      JSON.stringify(f.tagsAny),    '::jsonb');
            if (f.tagsAll)      push('filter_tags_all',      JSON.stringify(f.tagsAll),    '::jsonb');
            if (f.stageIds)     push('filter_stage_ids',     JSON.stringify(f.stageIds),   '::jsonb');
            if (f.assignedIds)  push('filter_assigned_ids',  JSON.stringify(f.assignedIds),'::jsonb');
            if (f.status)       push('filter_status',        JSON.stringify(f.status),     '::jsonb');
            if (typeof f.onlyWithContact === 'boolean') push('filter_only_with_contact', f.onlyWithContact);
        }
        if (input.connectionIds)  push('connection_ids', JSON.stringify(input.connectionIds), '::jsonb');
        if (input.telegramConnectionIds) push('telegram_connection_ids', JSON.stringify(input.telegramConnectionIds), '::jsonb');
        if (typeof input.onReplyFlowId !== 'undefined') push('on_reply_flow_id', input.onReplyFlowId || null, '::uuid');
        if (input.channelType)    push('channel_type', input.channelType);
        if (typeof input.scheduledAt !== 'undefined') push('scheduled_at', input.scheduledAt || null, '::timestamptz');
        if (input.sendWindow) {
            push('send_window_start', input.sendWindow.start || null);
            push('send_window_end',   input.sendWindow.end || null);
        }
        if (input.intervalSeconds) {
            push('interval_min_seconds', input.intervalSeconds.min || 3);
            push('interval_max_seconds', input.intervalSeconds.max || 8);
        }
        if (!sets.length) return current;
        sets.push('updated_at = now()');
        vals.push(id, workspaceId);
        const rows = await database_1.prisma.$queryRawUnsafe(
            `UPDATE broadcasts SET ${sets.join(', ')} WHERE id = $${i++}::uuid AND workspace_id = $${i}::uuid RETURNING *`,
            ...vals);
        return rows[0] ? toDto(rows[0]) : null;
    }

    async remove(workspaceId, id) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `DELETE FROM broadcasts WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING id`,
            id, workspaceId);
        return rows.length > 0;
    }

    /** Calcula quantos leads batem com os filtros (pra mostrar estimate antes de iniciar) */
    async previewCount(workspaceId, filters) {
        const { sql, params } = this._buildFilterSQL(workspaceId, filters || {});
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS n FROM leads l WHERE ${sql}`, ...params);
        return rows[0]?.n || 0;
    }

    _buildFilterSQL(workspaceId, f) {
        const clauses = [`l.workspace_id = $1::uuid`];
        const params = [workspaceId];
        let i = 2;

        if (f.onlyWithContact !== false) clauses.push(`l.contact_id IS NOT NULL`);
        if (Array.isArray(f.tagsAny) && f.tagsAny.length) {
            clauses.push(`l.tags && $${i++}::text[]`);
            params.push(f.tagsAny);
        }
        if (Array.isArray(f.tagsAll) && f.tagsAll.length) {
            clauses.push(`l.tags @> $${i++}::text[]`);
            params.push(f.tagsAll);
        }
        if (Array.isArray(f.stageIds) && f.stageIds.length) {
            clauses.push(`l.stage_id = ANY($${i++}::uuid[])`);
            params.push(f.stageIds);
        }
        if (Array.isArray(f.assignedIds) && f.assignedIds.length) {
            clauses.push(`l.assigned_to_id = ANY($${i++}::uuid[])`);
            params.push(f.assignedIds);
        }
        if (Array.isArray(f.status) && f.status.length) {
            clauses.push(`l.status::text = ANY($${i++}::text[])`);
            params.push(f.status);
        }
        return { sql: clauses.join(' AND '), params };
    }

    /** Enfileira envios no scheduled_messages respeitando janela + intervalo */
    async start(workspaceId, id) {
        const bc = await this.get(workspaceId, id);
        if (!bc) throw new Error('Broadcast não encontrado');
        if (!['DRAFT','PAUSED'].includes(bc.status)) throw new Error('Broadcast já iniciado');

        // Limpa envios anteriores pendentes/cancelados (idempotente — se reiniciar um PAUSED)
        await database_1.prisma.$queryRawUnsafe(
            `DELETE FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status IN ('pending','cancelled','processing')`,
            id);

        // Resolve leads alvo
        const { sql, params } = this._buildFilterSQL(workspaceId, bc.filters);
        const leads = await database_1.prisma.$queryRawUnsafe(
            `SELECT l.id, l.assigned_to_id, c.telegram_chat_id, c.phone_normalized
             FROM leads l LEFT JOIN contacts c ON c.id = l.contact_id
             WHERE ${sql}`, ...params);
        if (!leads.length) throw new Error('Nenhum lead corresponde aos filtros');

        // Pega admin como fallback de operador
        const adm = await database_1.prisma.$queryRawUnsafe(
            `SELECT id FROM lead_users WHERE workspace_id = $1::uuid AND role = 'ADMIN' AND is_active = true LIMIT 1`,
            workspaceId);
        const adminId = adm[0]?.id;
        if (!adminId) throw new Error('Sem operador admin disponível para disparar');

        // Agenda escalonado respeitando janela e intervalo
        const now = new Date();
        const startAt = bc.scheduledAt ? new Date(bc.scheduledAt) : now;
        const intMin = Math.max(1, bc.intervalSeconds.min || 3);
        const intMax = Math.max(intMin, bc.intervalSeconds.max || 8);
        const windowStart = bc.sendWindow.start || null;  // "09:00"
        const windowEnd = bc.sendWindow.end || null;      // "20:00"

        // Janela em BRT (America/Sao_Paulo = UTC-3). Container roda UTC.
        const TZ_OFFSET_MIN = -180; // BRT = UTC - 3h
        const localHM = (d) => {
            const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
            let local = utcMin + TZ_OFFSET_MIN;
            while (local < 0) local += 1440;
            while (local >= 1440) local -= 1440;
            return local;
        };
        const withinWindow = (d) => {
            if (!windowStart || !windowEnd) return true;
            const hm = localHM(d);
            const [sH, sM] = windowStart.split(':').map(Number);
            const [eH, eM] = windowEnd.split(':').map(Number);
            return hm >= (sH * 60 + sM) && hm <= (eH * 60 + eM);
        };
        const nextInWindow = (d) => {
            if (!windowStart || !windowEnd) return d;
            let guard = 10;
            while (!withinWindow(d) && guard-- > 0) {
                // Ajusta pra início da janela no próximo BRT-day
                const [sH, sM] = windowStart.split(':').map(Number);
                // Começa do UTC equivalente ao início da janela BRT
                const brtStartUtcH = (sH + Math.abs(TZ_OFFSET_MIN/60) + 24) % 24;
                const cur = new Date(d);
                cur.setUTCHours(brtStartUtcH, sM, 0, 0);
                // Se cur ainda for antes de d, avança 1 dia
                if (cur.getTime() <= d.getTime()) cur.setUTCDate(cur.getUTCDate() + 1);
                d = cur;
            }
            return d;
        };

        let cursor = new Date(Math.max(now.getTime(), startAt.getTime()));
        cursor = nextInWindow(cursor);

        let waConnIds = Array.isArray(bc.connectionIds) ? bc.connectionIds : [];
        const tgConnIds = Array.isArray(bc.telegramConnectionIds) ? bc.telegramConnectionIds : [];

        // FIX routing: se for template, restringe waConnIds APENAS às conexões que têm o template
        // (evita rotear pra um número que não tem aquele template → erro #132001 da Meta)
        if (bc.messageType === 'template' && bc.templateId && waConnIds.length > 0) {
            const tplCheck = await database_1.prisma.$queryRawUnsafe(
                `SELECT DISTINCT t2.connection_id FROM templates t1
                 JOIN templates t2 ON t2.name = t1.name AND t2.language = t1.language AND t2.status = 'APPROVED'
                 WHERE t1.id = $1::uuid
                   AND t2.connection_id::text = ANY($2::text[])`,
                bc.templateId, waConnIds
            );
            const validConnIds = tplCheck.map(r => r.connection_id);
            if (validConnIds.length === 0) {
                throw new Error('Nenhuma das conexões selecionadas possui este template aprovado. Sincronize templates ou escolha outro número.');
            }
            const removed = waConnIds.filter(id => !validConnIds.includes(id));
            if (removed.length > 0) {
                logger_1?.logger?.info?.({ broadcastId: id, removed, kept: validConnIds }, 'Connections sem template removidas do routing');
            }
            waConnIds = validConnIds;
        }
        let waIdx = 0, tgIdx = 0;
        const pickChannelConn = (lead) => {
            const isTg = !!lead.telegram_chat_id;
            if (isTg && tgConnIds.length) { const v = tgConnIds[tgIdx % tgConnIds.length]; tgIdx++; return { channel: 'telegram', connId: v }; }
            if (!isTg && waConnIds.length) { const v = waConnIds[waIdx % waConnIds.length]; waIdx++; return { channel: 'whatsapp', connId: v }; }
            if (isTg) return { channel: 'telegram', connId: null };  // vai usar primeira conn TG disponível no sendReply
            return { channel: 'whatsapp', connId: null };
        };

        // INSERT em batches
        const BATCH = 200;
        let total = 0;
        for (let i0 = 0; i0 < leads.length; i0 += BATCH) {
            const chunk = leads.slice(i0, i0 + BATCH);
            const vals = chunk.map((l, j) => {
                const delta = intMin + Math.random() * (intMax - intMin);
                cursor = new Date(cursor.getTime() + delta * 1000);
                cursor = nextInWindow(cursor);
                const picked = pickChannelConn(l);
                const waConnSql = (picked.channel === 'whatsapp' && picked.connId) ? `'${picked.connId}'::uuid` : 'NULL';
                const tgConnSql = (picked.channel === 'telegram' && picked.connId) ? `'${picked.connId}'::uuid` : 'NULL';
                const opId = l.assigned_to_id || adminId;
                const mtype = bc.messageType || 'text';
                const tplId = bc.templateId ? `'${bc.templateId}'::uuid` : 'NULL';
                const tplVars = `'${JSON.stringify(bc.templateVars || {}).replace(/'/g, "''")}'::jsonb`;
                const docUrl = bc.documentUrl ? `'${bc.documentUrl.replace(/'/g, "''")}'` : 'NULL';
                const docName = bc.documentFilename ? `'${bc.documentFilename.replace(/'/g, "''")}'` : 'NULL';
                return `(gen_random_uuid(), '${workspaceId}'::uuid, '${l.id}'::uuid, '${opId}'::uuid, ${waConnSql}, ${tgConnSql}, '${(bc.content || '').replace(/'/g, "''")}', '${cursor.toISOString()}'::timestamptz, 'pending', '${id}'::uuid, '${mtype}', ${tplId}, ${tplVars}, ${docUrl}, ${docName})`;
            }).join(',');
            await database_1.prisma.$queryRawUnsafe(
                `INSERT INTO scheduled_messages (id, workspace_id, lead_id, operator_id, connection_id, telegram_connection_id, content, scheduled_at, status, broadcast_id,
                    message_type, template_id, template_vars, document_url, document_filename)
                 VALUES ${vals}`);
            total += chunk.length;
        }

        // Registra recipients (pra saber quem recebeu broadcast — usado no hook de reply → flow)
        for (let i0 = 0; i0 < leads.length; i0 += 500) {
            const chunk = leads.slice(i0, i0 + 500);
            const vals = chunk.map(l => `(gen_random_uuid(), '${id}'::uuid, '${l.id}'::uuid, '${workspaceId}'::uuid)`).join(',');
            await database_1.prisma.$queryRawUnsafe(
                `INSERT INTO broadcast_recipients (id, broadcast_id, lead_id, workspace_id)
                 VALUES ${vals} ON CONFLICT DO NOTHING`);
        }
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE broadcasts SET status = 'RUNNING', total_contacts = $2, started_at = now(), updated_at = now() WHERE id = $1::uuid`,
            id, total);
        return { queued: total, firstAt: startAt.toISOString() };
    }

    async pause(workspaceId, id) {
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE scheduled_messages SET status = 'cancelled', cancelled_at = now()
             WHERE broadcast_id = $1::uuid AND status = 'pending' AND workspace_id = $2::uuid`,
            id, workspaceId);
        const rows = await database_1.prisma.$queryRawUnsafe(
            `UPDATE broadcasts SET status = 'PAUSED', updated_at = now()
             WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING *`,
            id, workspaceId);
        return rows[0] ? toDto(rows[0]) : null;
    }

    async detailedStats(workspaceId, id) {
        // Contagens das mensagens enviadas por este broadcast
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid)::int AS enqueued,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'pending')::int AS pending,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'sent')::int AS sent,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'failed')::int AS failed,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'cancelled')::int AS cancelled,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'processing')::int AS processing`,
            id);
        const s = rows[0] || {};

        // Delivered/Read via messages (sent_message_id)
        const delivRows = await database_1.prisma.$queryRawUnsafe(
            `SELECT
                COUNT(*) FILTER (WHERE m.status = 'DELIVERED')::int AS delivered,
                COUNT(*) FILTER (WHERE m.status = 'READ')::int AS read_count,
                COUNT(*) FILTER (WHERE m.status = 'FAILED')::int AS meta_failed
             FROM scheduled_messages sm JOIN messages m ON m.id = sm.sent_message_id
             WHERE sm.broadcast_id = $1::uuid`, id);
        const d = delivRows[0] || {};

        // Falhas por código/razão
        const errors = await database_1.prisma.$queryRawUnsafe(
            `SELECT COALESCE(m.error_code, sm.error_message, 'desconhecido') AS reason, COUNT(*)::int AS n
             FROM scheduled_messages sm
             LEFT JOIN messages m ON m.id = sm.sent_message_id
             WHERE sm.broadcast_id = $1::uuid AND sm.status = 'failed'
             GROUP BY reason ORDER BY n DESC LIMIT 10`, id);

        // Replies: broadcast_recipients.replied_at IS NOT NULL
        const repliesRows = await database_1.prisma.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS replied FROM broadcast_recipients WHERE broadcast_id = $1::uuid AND replied_at IS NOT NULL`, id);
        const replies = repliesRows[0]?.replied || 0;

        // Sample de sends por hora (últimas 24h de atividade)
        const timeline = await database_1.prisma.$queryRawUnsafe(
            `SELECT date_trunc('hour', sm.sent_at) AS hour, COUNT(*)::int AS n
             FROM scheduled_messages sm
             WHERE sm.broadcast_id = $1::uuid AND sm.sent_at IS NOT NULL
             GROUP BY hour ORDER BY hour ASC LIMIT 100`, id);

        return {
            counts: {
                enqueued: s.enqueued || 0,
                pending: s.pending || 0,
                processing: s.processing || 0,
                sent: s.sent || 0,
                failed: s.failed || 0,
                cancelled: s.cancelled || 0,
                delivered: d.delivered || 0,
                read: d.read_count || 0,
                metaFailed: d.meta_failed || 0,
                replied: replies,
            },
            rates: {
                deliveryRate: s.sent > 0 ? Math.round((d.delivered / s.sent) * 100) : 0,
                readRate: d.delivered > 0 ? Math.round((d.read_count / d.delivered) * 100) : 0,
                replyRate: s.sent > 0 ? Math.round((replies / s.sent) * 100) : 0,
                failRate: s.enqueued > 0 ? Math.round((s.failed / s.enqueued) * 100) : 0,
            },
            errors,
            timeline,
        };
    }

    async stats(workspaceId, id) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'sent')::int AS sent,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'failed')::int AS failed,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'cancelled')::int AS cancelled,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'pending')::int AS pending,
                (SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = $1::uuid AND status = 'processing')::int AS processing
             `, id);
        const s = rows[0] || {};
        // Atualiza counts no broadcast
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE broadcasts SET sent_count = $2, failed_count = $3, cancelled_count = $4,
                status = CASE WHEN $5::int = 0 AND $6::int = 0 AND status = 'RUNNING' THEN 'COMPLETED' ELSE status END,
                finished_at = CASE WHEN $5::int = 0 AND $6::int = 0 AND status = 'RUNNING' THEN now() ELSE finished_at END,
                updated_at = now()
             WHERE id = $1::uuid`,
            id, s.sent, s.failed, s.cancelled, s.pending, s.processing);
        return s;
    }
}

exports.BroadcastsService = BroadcastsService;
