"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduledMessagesService = void 0;
exports.startScheduledMessagesDispatcher = startScheduledMessagesDispatcher;

const database_1 = require("../../config/database");

class ScheduledMessagesService {
    // Lista mensagens agendadas de um lead
    async listForLead(workspaceId, leadId, includeDone = false) {
        const statusFilter = includeDone
            ? "AND sm.status IN ('pending','sent','failed','cancelled')"
            : "AND sm.status IN ('pending','failed')";
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT sm.id, sm.lead_id, sm.operator_id, sm.operator_name, sm.connection_id,
                    sm.content, sm.scheduled_at, sm.status, sm.sent_at, sm.error_message,
                    sm.attempts, sm.created_at,
                    lu.name AS operator_display_name
             FROM scheduled_messages sm
             LEFT JOIN lead_users lu ON lu.id = sm.operator_id
             WHERE sm.workspace_id = $1::uuid
               AND sm.lead_id = $2::uuid
               ${statusFilter}
             ORDER BY sm.scheduled_at ASC
             LIMIT 100`,
            workspaceId, leadId
        );
        return rows.map(toDto);
    }

    async listPendingForWorkspace(workspaceId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT sm.id, sm.lead_id, sm.operator_id, sm.content,
                    sm.scheduled_at, sm.status, sm.created_at,
                    l.name AS lead_name, l.phone AS lead_phone
             FROM scheduled_messages sm
             JOIN leads l ON l.id = sm.lead_id
             WHERE sm.workspace_id = $1::uuid
               AND sm.status = 'pending'
             ORDER BY sm.scheduled_at ASC
             LIMIT 200`,
            workspaceId
        );
        return rows.map(r => ({
            id: r.id, leadId: r.lead_id, leadName: r.lead_name, leadPhone: r.lead_phone,
            operatorId: r.operator_id, content: r.content,
            scheduledAt: r.scheduled_at, status: r.status, createdAt: r.created_at,
        }));
    }

    async create(workspaceId, leadId, operatorId, operatorName, content, scheduledAt, connectionId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `INSERT INTO scheduled_messages
               (workspace_id, lead_id, operator_id, operator_name, connection_id, content, scheduled_at)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::timestamptz)
             RETURNING *`,
            workspaceId, leadId, operatorId, operatorName || null,
            connectionId || null, content, scheduledAt
        );
        return toDto(rows[0]);
    }

    async update(id, workspaceId, patch) {
        const sets = [];
        const vals = [];
        let i = 1;
        if (typeof patch.content === 'string') { sets.push(`content = $${i++}`); vals.push(patch.content); }
        if (patch.scheduledAt) { sets.push(`scheduled_at = $${i++}::timestamptz`); vals.push(patch.scheduledAt); }
        if (typeof patch.connectionId !== 'undefined') { sets.push(`connection_id = $${i++}::uuid`); vals.push(patch.connectionId || null); }
        if (!sets.length) return null;
        sets.push(`updated_at = now()`);
        vals.push(id, workspaceId);
        const rows = await database_1.prisma.$queryRawUnsafe(
            `UPDATE scheduled_messages SET ${sets.join(', ')}
             WHERE id = $${i++}::uuid AND workspace_id = $${i}::uuid
               AND status = 'pending'
             RETURNING *`,
            ...vals
        );
        return rows[0] ? toDto(rows[0]) : null;
    }

    async cancel(id, workspaceId, userId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `UPDATE scheduled_messages
             SET status = 'cancelled', cancelled_by_id = $3::uuid, cancelled_at = now(), updated_at = now()
             WHERE id = $1::uuid AND workspace_id = $2::uuid
               AND status = 'pending'
             RETURNING id`,
            id, workspaceId, userId
        );
        return rows.length > 0;
    }
}

function toDto(row) {
    if (!row) return null;
    return {
        id: row.id,
        leadId: row.lead_id,
        operatorId: row.operator_id,
        operatorName: row.operator_display_name || row.operator_name || null,
        connectionId: row.connection_id || null,
        content: row.content,
        scheduledAt: row.scheduled_at,
        status: row.status,
        sentAt: row.sent_at || null,
        errorMessage: row.error_message || null,
        attempts: row.attempts || 0,
        createdAt: row.created_at,
    };
}

exports.ScheduledMessagesService = ScheduledMessagesService;

// ─── Dispatcher ─────────────────────────────────────────────────────────────
// Polling loop que varre mensagens pendentes e despacha via LeadsService.sendReply

const DEFAULT_PERMS = {
    viewAllLeads: true,
    manageLeads: true,
    sendMessages: true,
    manageFinancial: true,
};

let dispatcherInterval = null;

function startScheduledMessagesDispatcher(logger) {
    if (dispatcherInterval) return;
    const log = logger || console;
    const POLL_INTERVAL_MS = 20000; // 20s
    const BATCH_SIZE = 20;

    const tick = async () => {
        try {
            // Seleciona e trava linhas pendentes vencidas
            const due = await database_1.prisma.$queryRawUnsafe(
                `UPDATE scheduled_messages
                 SET status = 'processing', attempts = attempts + 1, updated_at = now()
                 WHERE id IN (
                   SELECT id FROM scheduled_messages
                   WHERE status = 'pending' AND scheduled_at <= now()
                   ORDER BY scheduled_at ASC
                   LIMIT ${BATCH_SIZE}
                   FOR UPDATE SKIP LOCKED
                 )
                 RETURNING id, workspace_id, lead_id, operator_id, content, connection_id, telegram_connection_id, attempts,
                           message_type, template_id, template_vars, document_url, document_filename`
            );

            if (!due.length) return;

            // Lazy import do LeadsService pra evitar ciclo
            const { LeadsService } = require("../leads/leads.service");
            const service = new LeadsService();

            for (const row of due) {
                try {
                    // Busca role do operador
                    const op = await database_1.prisma.$queryRawUnsafe(
                        `SELECT id, role FROM lead_users WHERE id = $1::uuid AND workspace_id = $2::uuid`,
                        row.operator_id, row.workspace_id
                    );
                    if (!op.length) throw new Error('Operador removido');

                    const mtype = row.message_type || 'text';
                    let msg;
                    if (mtype === 'document' && row.document_url) {
                        msg = await service.sendDocumentReply(
                            row.lead_id,
                            row.document_url,
                            row.document_filename || 'documento.pdf',
                            row.content || '',
                            row.operator_id, op[0].role, row.workspace_id,
                            DEFAULT_PERMS, row.connection_id || undefined
                        );
                    } else if (mtype === 'template' && row.template_id) {
                        msg = await service.sendTemplateReply(
                            row.lead_id,
                            row.template_id,
                            row.template_vars || {},
                            row.operator_id, op[0].role, row.workspace_id,
                            DEFAULT_PERMS, row.connection_id || undefined
                        );
                    } else {
                        msg = await service.sendReply(
                            row.lead_id,
                            row.content,
                            row.operator_id,
                            op[0].role,
                            row.workspace_id,
                            DEFAULT_PERMS,
                            row.connection_id || undefined
                        );
                    }

                    await database_1.prisma.$queryRawUnsafe(
                        `UPDATE scheduled_messages
                         SET status = 'sent', sent_at = now(), sent_message_id = $2::uuid, updated_at = now()
                         WHERE id = $1::uuid`,
                        row.id, msg?.id || null
                    );
                    log.info({ id: row.id, leadId: row.lead_id }, 'scheduled-message sent');
                } catch (err) {
                    const errMsg = (err && err.message ? err.message : String(err)).slice(0, 500);
                    // Após 3 tentativas, marca como failed; senão volta para pending com backoff
                    const finalFail = row.attempts >= 3;
                    if (finalFail) {
                        await database_1.prisma.$queryRawUnsafe(
                            `UPDATE scheduled_messages
                             SET status = 'failed', error_message = $2, updated_at = now()
                             WHERE id = $1::uuid`,
                            row.id, errMsg
                        );
                    } else {
                        await database_1.prisma.$queryRawUnsafe(
                            `UPDATE scheduled_messages
                             SET status = 'pending', error_message = $2,
                                 scheduled_at = now() + interval '60 seconds', updated_at = now()
                             WHERE id = $1::uuid`,
                            row.id, errMsg
                        );
                    }
                    log.warn({ id: row.id, err: errMsg, attempts: row.attempts }, 'scheduled-message send failed');
                }
            }
        } catch (err) {
            log.error({ err }, 'scheduled-messages dispatcher tick failed');
        }
    
        // ── auto-complete broadcasts quando todas mensagens processadas ──
        try {
            await database_1.prisma.$queryRawUnsafe(
                `UPDATE broadcasts b
                 SET status = 'COMPLETED',
                     sent_count = COALESCE((SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = b.id AND status = 'sent'), 0),
                     failed_count = COALESCE((SELECT COUNT(*) FROM scheduled_messages WHERE broadcast_id = b.id AND status = 'failed'), 0),
                     finished_at = COALESCE(b.finished_at, now()),
                     updated_at = now()
                 WHERE b.status = 'RUNNING'
                   AND NOT EXISTS (
                     SELECT 1 FROM scheduled_messages sm
                     WHERE sm.broadcast_id = b.id AND sm.status = 'pending'
                   )
                   AND EXISTS (
                     SELECT 1 FROM scheduled_messages sm WHERE sm.broadcast_id = b.id
                   )`
            );
        } catch {}
    };

    // Roda 1x logo no start depois entra no interval
    setTimeout(() => { tick().catch(() => {}); }, 5000);
    dispatcherInterval = setInterval(() => { tick().catch(() => {}); }, POLL_INTERVAL_MS);
    log.info('scheduled-messages dispatcher started (interval=' + POLL_INTERVAL_MS + 'ms)');
}
