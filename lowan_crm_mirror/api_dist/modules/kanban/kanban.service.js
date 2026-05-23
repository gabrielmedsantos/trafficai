"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KanbanService = void 0;
const database_1 = require("../../config/database");
const common_types_1 = require("../../types/common.types");
const redis_1 = require("../../config/redis");
class KanbanService {
    // ─── Pipeline ─────────────────────────────────────────────────────────────
    async getOrCreatePipeline(workspaceId) {
        let pipeline = await database_1.prisma.pipeline.findFirst({ where: { workspaceId } });
        if (!pipeline) {
            pipeline = await database_1.prisma.pipeline.create({
                data: { name: 'Pipeline Principal', workspaceId },
            });
        }
        return pipeline;
    }
    async getBoard(workspaceId) {
        const pipeline = await this.getOrCreatePipeline(workspaceId);
        const stages = await database_1.prisma.stage.findMany({
            where: { pipelineId: pipeline.id },
            orderBy: { position: 'asc' },
        });
        const leads = await database_1.prisma.lead.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                name: true,
                phone: true,
                origin: true,
                status: true,
                tags: true,
                unreadCount: true,
                stageId: true,
                assignedToId: true,
                lastMessageAt: true,
                createdAt: true,
                assignedTo: { select: { id: true, name: true } },
            },
        });
        const rules = await database_1.prisma.$queryRawUnsafe(`SELECT * FROM pipeline_rules WHERE pipeline_id = $1::uuid ORDER BY created_at ASC`, pipeline.id);
        const stageColumns = stages.map((stage) => ({
            ...stage,
            leads: leads.filter((l) => l.stageId === stage.id),
        }));
        return {
            pipeline: { id: pipeline.id, name: pipeline.name },
            stages: stageColumns,
            rules,
            unstagedLeads: leads.filter((l) => !l.stageId),
        };
    }
    async invalidateCache(workspaceId) {
        await redis_1.redis.del(redis_1.RedisKeys.kanbanCache(workspaceId)).catch(() => { });
    }
    // ─── Summary (Data-Lite) ──────────────────────────────────────────────────
    // Contadores agregados pro Kanban — total por etapa, sem etapa, sem operador,
    // aguardando resposta. Não retorna leads, só counts.
    async getSummary(workspaceId, userId, role, permissions = { viewAllLeads: false }) {
        const baseWhere = (role === 'ADMIN' || permissions.viewAllLeads)
            ? { workspaceId }
            : { workspaceId, assignedToId: userId };
        const [total, semEtapa, semOperador, aguardandoResposta, byStageRaw, unreadByStageRaw] = await Promise.all([
            database_1.prisma.lead.count({ where: baseWhere }),
            database_1.prisma.lead.count({ where: { ...baseWhere, stageId: null } }),
            database_1.prisma.lead.count({ where: { ...baseWhere, assignedToId: null } }),
            database_1.prisma.lead.count({ where: { ...baseWhere, unreadCount: { gt: 0 } } }),
            database_1.prisma.lead.groupBy({ by: ['stageId'], where: baseWhere, _count: { _all: true } }),
            database_1.prisma.lead.groupBy({ by: ['stageId'], where: { ...baseWhere, unreadCount: { gt: 0 } }, _count: { _all: true } }),
        ]);
        const byStage = {};
        for (const r of byStageRaw) {
            if (r.stageId != null) byStage[r.stageId] = { total: r._count._all, unread: 0 };
        }
        for (const r of unreadByStageRaw) {
            if (r.stageId != null && byStage[r.stageId]) byStage[r.stageId].unread = r._count._all;
        }
        return { total, semEtapa, semOperador, aguardandoResposta, byStage };
    }
    // ─── Stages ───────────────────────────────────────────────────────────────
    async createStage(workspaceId, input) {
        const pipeline = await this.getOrCreatePipeline(workspaceId);
        const maxPos = await database_1.prisma.stage.aggregate({
            where: { pipelineId: pipeline.id },
            _max: { position: true },
        });
        const position = (maxPos._max.position ?? -1) + 1;
        const stage = await database_1.prisma.stage.create({
            data: {
                name: input.name,
                color: input.color ?? '#94a3b8',
                position,
                pipelineId: pipeline.id,
            },
        });
        this.invalidateCache(workspaceId).catch(() => { });
        return stage;
    }
    async updateStage(workspaceId, stageId, input) {
        const stage = await this.findStageForWorkspace(workspaceId, stageId);
        const updated = await database_1.prisma.stage.update({ where: { id: stage.id }, data: input });
        this.invalidateCache(workspaceId).catch(() => { });
        return updated;
    }
    async deleteStage(workspaceId, stageId) {
        const stage = await this.findStageForWorkspace(workspaceId, stageId);
        await database_1.prisma.lead.updateMany({ where: { stageId: stage.id }, data: { stageId: null } });
        await database_1.prisma.stage.delete({ where: { id: stage.id } });
        this.invalidateCache(workspaceId).catch(() => { });
    }
    async reorderStages(workspaceId, input) {
        const pipeline = await this.getOrCreatePipeline(workspaceId);
        const stages = await database_1.prisma.stage.findMany({ where: { pipelineId: pipeline.id } });
        const stageIds = stages.map((s) => s.id);
        for (const id of input.stageIds) {
            if (!stageIds.includes(id))
                throw common_types_1.HttpError.badRequest(`Stage ${id} não pertence a este pipeline`);
        }
        await Promise.all(input.stageIds.map((id, index) => database_1.prisma.stage.update({ where: { id }, data: { position: index } })));
        this.invalidateCache(workspaceId).catch(() => { });
    }
    // ─── Rules / Gatilhos ─────────────────────────────────────────────────────
    async createRule(workspaceId, body) {
        const pipeline = await this.getOrCreatePipeline(workspaceId);
        const { name, trigger, triggerHours, fromStageId, toStageId, fromNullStage, assignStrategy, assignPool } = body;
        const rows = await database_1.prisma.$queryRawUnsafe(`INSERT INTO pipeline_rules
        (pipeline_id, workspace_id, name, trigger, trigger_hours, from_stage_id, to_stage_id, from_null_stage, assign_strategy, assign_pool)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING *`, pipeline.id, workspaceId, name, trigger, triggerHours ?? null, fromStageId ?? null, toStageId ?? null, fromNullStage ?? false, assignStrategy ?? null, assignPool ? JSON.stringify(assignPool) : null);
        return rows[0];
    }
    async updateRule(workspaceId, ruleId, body) {
        const { name, trigger, triggerHours, fromStageId, toStageId, fromNullStage, isActive, assignStrategy, assignPool } = body;
        const rows = await database_1.prisma.$queryRawUnsafe(`UPDATE pipeline_rules SET
        name = COALESCE($3, name),
        trigger = COALESCE($4, trigger),
        trigger_hours = $5,
        from_stage_id = $6,
        to_stage_id = $7,
        from_null_stage = COALESCE($8, from_null_stage),
        is_active = COALESCE($9, is_active),
        assign_strategy = $10,
        assign_pool = $11::jsonb,
        updated_at = now()
       WHERE id = $1 AND workspace_id = $2
       RETURNING *`, ruleId, workspaceId, name ?? null, trigger ?? null, triggerHours ?? null, fromStageId ?? null, toStageId ?? null, fromNullStage ?? null, isActive ?? null, assignStrategy ?? null, assignPool ? JSON.stringify(assignPool) : null);
        if (!rows[0])
            throw common_types_1.HttpError.notFound('Gatilho não encontrado');
        return rows[0];
    }
    async deleteRule(workspaceId, ruleId) {
        await database_1.prisma.$executeRawUnsafe(`DELETE FROM pipeline_rules WHERE id = $1 AND workspace_id = $2`, ruleId, workspaceId);
    }
    // ─── Event Rules ──────────────────────────────────────────────────────────
    static async applyEventRules(workspaceId, leadId, currentStageId, trigger) {
        const pipeline = await database_1.prisma.pipeline.findFirst({ where: { workspaceId } });
        if (!pipeline)
            return;
        const rules = await database_1.prisma.$queryRawUnsafe(`SELECT * FROM pipeline_rules
       WHERE pipeline_id = $1::uuid AND workspace_id = $2::uuid AND trigger = $3 AND is_active = true
       ORDER BY created_at ASC`, pipeline.id, workspaceId, trigger);
        for (const rule of rules) {
            const matchesStage = (rule.from_stage_id === null && !rule.from_null_stage) || // any stage
                (rule.from_null_stage && currentStageId === null) || // from null stage
                (rule.from_stage_id !== null && rule.from_stage_id === currentStageId); // specific stage
            if (!matchesStage)
                continue;
            const updates = {};
            if (rule.to_stage_id) {
                updates.stageId = rule.to_stage_id;
            }
            if (rule.assign_strategy && Array.isArray(rule.assign_pool) && rule.assign_pool.length > 0) {
                const pool = rule.assign_pool;
                if (rule.assign_strategy === 'random') {
                    updates.assignedToId = pool[Math.floor(Math.random() * pool.length)];
                }
                else if (rule.assign_strategy === 'round_robin') {
                    const counts = await Promise.all(pool.map(async (userId) => ({
                        userId,
                        count: await database_1.prisma.lead.count({ where: { workspaceId, assignedToId: userId } }),
                    })));
                    counts.sort((a, b) => a.count - b.count);
                    updates.assignedToId = counts[0].userId;
                }
            }
            if (Object.keys(updates).length > 0) {
                await database_1.prisma.lead.update({ where: { id: leadId }, data: updates });
            }
        }
    }
    static async applyAutoAssignRules(workspaceId, leadId, currentStageId) {
        const pipeline = await database_1.prisma.pipeline.findFirst({ where: { workspaceId } });
        if (!pipeline)
            return;
        const rules = await database_1.prisma.$queryRawUnsafe(`SELECT * FROM pipeline_rules
       WHERE pipeline_id = $1::uuid AND workspace_id = $2::uuid AND trigger = 'AUTO_ASSIGN' AND is_active = true
       ORDER BY created_at ASC`, pipeline.id, workspaceId);
        for (const rule of rules) {
            const matchesStage = (rule.from_stage_id === null && !rule.from_null_stage) ||
                (rule.from_null_stage && currentStageId === null) ||
                (rule.from_stage_id !== null && rule.from_stage_id === currentStageId);
            if (!matchesStage)
                continue;
            if (!rule.assign_strategy || !Array.isArray(rule.assign_pool) || rule.assign_pool.length === 0)
                continue;
            const pool = rule.assign_pool;
            let assignedToId;
            if (rule.assign_strategy === 'random') {
                assignedToId = pool[Math.floor(Math.random() * pool.length)];
            }
            else if (rule.assign_strategy === 'round_robin') {
                const counts = await Promise.all(pool.map(async (userId) => ({
                    userId,
                    count: await database_1.prisma.lead.count({ where: { workspaceId, assignedToId: userId } }),
                })));
                counts.sort((a, b) => a.count - b.count);
                assignedToId = counts[0].userId;
            }
            if (assignedToId) {
                await database_1.prisma.lead.update({ where: { id: leadId }, data: { assignedToId } });
                break; // only apply the first matching auto-assign rule
            }
        }
    }
    // ─── NO_RESPONSE dispatcher ───────────────────────────────────────────────
    static startNoResponseDispatcher(logger) {
        const log = logger ?? console;
        const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 min
        const WINDOW_SECS = Math.ceil(POLL_INTERVAL_MS / 1000) + 90; // buffer de 90s
        const tick = async () => {
            try {
                // Busca todas as regras NO_RESPONSE ativas com trigger_hours definido
                const rules = await database_1.prisma.$queryRawUnsafe(`SELECT pr.*, p.workspace_id AS workspace_id
           FROM pipeline_rules pr
           JOIN pipelines p ON p.id = pr.pipeline_id
           WHERE pr.trigger = 'NO_RESPONSE'
             AND pr.is_active = true
             AND pr.trigger_hours IS NOT NULL
             AND pr.trigger_hours > 0`);
                if (!rules.length)
                    return;
                for (const rule of rules) {
                    const hours = Number(rule.trigger_hours);
                    if (!hours)
                        continue;
                    // Leads cuja última mensagem cruzou o limiar nesta janela de polling
                    const leads = await database_1.prisma.$queryRawUnsafe(`SELECT l.id, l.stage_id, l.workspace_id, l.assigned_to_id
             FROM leads l
             WHERE l.workspace_id = $1::uuid
               AND l.last_message_at IS NOT NULL
               AND l.last_message_at <= now() - make_interval(hours => $2::int)
               AND l.last_message_at >  now() - make_interval(hours => $2::int) - make_interval(secs => $3::int)
               AND l.is_blocked = false`, rule.workspace_id, hours, WINDOW_SECS);
                    for (const lead of leads) {
                        const matchesStage = (rule.from_stage_id === null && !rule.from_null_stage) ||
                            (rule.from_null_stage && lead.stage_id === null) ||
                            (rule.from_stage_id !== null && String(rule.from_stage_id) === String(lead.stage_id));
                        if (!matchesStage)
                            continue;
                        const updates = {};
                        if (rule.to_stage_id)
                            updates.stageId = String(rule.to_stage_id);
                        if (rule.assign_strategy && Array.isArray(rule.assign_pool) && rule.assign_pool.length > 0) {
                            const pool = rule.assign_pool;
                            if (rule.assign_strategy === 'random') {
                                updates.assignedToId = pool[Math.floor(Math.random() * pool.length)];
                            }
                            else if (rule.assign_strategy === 'round_robin') {
                                const counts = await Promise.all(pool.map(async (userId) => ({
                                    userId,
                                    count: await database_1.prisma.lead.count({ where: { workspaceId: String(lead.workspace_id), assignedToId: userId } }),
                                })));
                                counts.sort((a, b) => a.count - b.count);
                                updates.assignedToId = counts[0].userId;
                            }
                        }
                        if (Object.keys(updates).length > 0) {
                            await database_1.prisma.lead.update({ where: { id: String(lead.id) }, data: updates }).catch(() => { });
                        }
                    }
                }
            }
            catch (err) {
                log.error?.({ err }, 'no-response dispatcher error');
            }
        };
        tick();
        setInterval(tick, POLL_INTERVAL_MS);
        log.info?.({ intervalMs: POLL_INTERVAL_MS }, 'no-response dispatcher started');
    }
    // ─── Helpers ──────────────────────────────────────────────────────────────
    async findStageForWorkspace(workspaceId, stageId) {
        const pipeline = await database_1.prisma.pipeline.findFirst({ where: { workspaceId } });
        if (!pipeline)
            throw common_types_1.HttpError.notFound('Pipeline não encontrado');
        const stage = await database_1.prisma.stage.findFirst({
            where: { id: stageId, pipelineId: pipeline.id },
        });
        if (!stage)
            throw common_types_1.HttpError.notFound('Etapa não encontrada');
        return stage;
    }
}
exports.KanbanService = KanbanService;
//# sourceMappingURL=kanban.service.js.map