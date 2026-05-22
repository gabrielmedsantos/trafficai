"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialService = void 0;
const database_1 = require("../../config/database");
function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
class FinancialService {
    // ── Types ───────────────────────��──────────────────────────────────────────
    async listTypes(workspaceId) {
        return database_1.prisma.$queryRaw `
      SELECT id, workspace_id, name, active, created_at, updated_at
      FROM financial_types
      WHERE workspace_id = ${workspaceId}::uuid
      ORDER BY created_at ASC
    `;
    }
    async createType(workspaceId, name) {
        const rows = await database_1.prisma.$queryRaw `
      INSERT INTO financial_types (workspace_id, name, active)
      VALUES (${workspaceId}::uuid, ${name}, true)
      RETURNING *
    `;
        return rows[0];
    }
    async updateType(id, workspaceId, data) {
        const rows = await database_1.prisma.$queryRaw `
      UPDATE financial_types
      SET
        name       = COALESCE(${data.name ?? null}, name),
        active     = COALESCE(${data.active ?? null}::boolean, active),
        updated_at = now()
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid
      RETURNING *
    `;
        if (!rows[0])
            throw new Error('Tipo não encontrado');
        return rows[0];
    }
    async deleteType(id, workspaceId) {
        await database_1.prisma.$queryRaw `
      DELETE FROM financial_types WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid
    `;
    }
    // ── Commissions ────────────────────────────────────────────────────────────
    async listCommissions(workspaceId) {
        return database_1.prisma.$queryRaw `
      SELECT id, workspace_id, financial_type_id, percentage, active, created_at, updated_at
      FROM commission_configs
      WHERE workspace_id = ${workspaceId}::uuid
    `;
    }
    async upsertCommission(workspaceId, typeId, percentage, active) {
        const rows = await database_1.prisma.$queryRaw `
      INSERT INTO commission_configs (workspace_id, financial_type_id, percentage, active)
      VALUES (${workspaceId}::uuid, ${typeId}::uuid, ${percentage}, ${active})
      ON CONFLICT (workspace_id, financial_type_id)
      DO UPDATE SET percentage = ${percentage}, active = ${active}, updated_at = now()
      RETURNING *
    `;
        return rows[0];
    }
    // ── Ranking ──────────────────────────��─────────────────────────────��───────
    async getRanking(workspaceId, period) {
        return database_1.prisma.$queryRaw `
      SELECT
        r.operator_id,
        r.operator_name,
        ft.name                                                      AS type_name,
        SUM(r.amount)                                                AS total,
        SUM(r.amount * COALESCE(cc.percentage, 0) / 100)            AS commission,
        COALESCE(cc.percentage, 0)                                   AS commission_pct
      FROM financial_records r
      JOIN financial_types ft
        ON ft.id = r.financial_type_id
      LEFT JOIN commission_configs cc
        ON cc.financial_type_id = r.financial_type_id
       AND cc.workspace_id      = r.workspace_id
       AND cc.active            = true
      WHERE r.workspace_id = ${workspaceId}::uuid
        AND r.period       = ${period}
        AND r.deleted_at IS NULL
      GROUP BY r.operator_id, r.operator_name, ft.name, cc.percentage
      ORDER BY total DESC
    `;
    }
    // ── Goals ──────────────────────────────────────────────────────────���───────
    async listGoals(workspaceId, period) {
        return database_1.prisma.$queryRaw `
      SELECT
        og.id,
        og.operator_id,
        og.operator_name,
        og.financial_type_id,
        og.period,
        og.goal_amount,
        ft.name AS type_name,
        COALESCE(SUM(CASE WHEN fr.deleted_at IS NULL THEN fr.amount ELSE 0 END), 0) AS realized,
        CASE
          WHEN og.goal_amount > 0
          THEN COALESCE(SUM(CASE WHEN fr.deleted_at IS NULL THEN fr.amount ELSE 0 END), 0)
               / og.goal_amount * 100
          ELSE 0
        END AS pct
      FROM operator_goals og
      JOIN financial_types ft ON ft.id = og.financial_type_id
      LEFT JOIN financial_records fr
        ON  fr.operator_id       = og.operator_id
        AND fr.financial_type_id = og.financial_type_id
        AND fr.period            = og.period
        AND fr.workspace_id      = og.workspace_id
      WHERE og.workspace_id = ${workspaceId}::uuid
        AND og.period       = ${period}
      GROUP BY og.id, ft.name
      ORDER BY og.operator_name, ft.name
    `;
    }
    async upsertGoal(workspaceId, input) {
        const { financialTypeId, period, goalAmount, operatorId = null, operatorName = null } = input;
        const rows = await database_1.prisma.$queryRaw `
      INSERT INTO operator_goals (workspace_id, operator_id, operator_name, financial_type_id, period, goal_amount)
      VALUES (
        ${workspaceId}::uuid,
        ${operatorId}::uuid,
        ${operatorName},
        ${financialTypeId}::uuid,
        ${period},
        ${goalAmount}
      )
      ON CONFLICT (workspace_id, operator_id, financial_type_id, period)
      DO UPDATE SET goal_amount = ${goalAmount}, updated_at = now()
      RETURNING *
    `;
        return rows[0];
    }
    async deleteGoal(id, workspaceId) {
        await database_1.prisma.$queryRaw `
      DELETE FROM operator_goals WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid
    `;
    }
    // ── Audit ─────────────────────────────��────────────────────────────────────
    async getAudit(workspaceId, period) {
        return database_1.prisma.$queryRaw `
      SELECT
        r.id, r.lead_id, r.operator_id, r.operator_name,
        r.amount, r.description, r.period,
        r.created_at, r.deleted_at, r.deleted_by_name,
        ft.name AS type_name
      FROM financial_records r
      JOIN financial_types ft ON ft.id = r.financial_type_id
      WHERE r.workspace_id = ${workspaceId}::uuid
        AND r.period       = ${period}
      ORDER BY r.created_at DESC
    `;
    }
    // ── Lead records ─────────────────────────────��─────────────────────────────
    async getLeadRecords(leadId, workspaceId) {
        return database_1.prisma.$queryRaw `
      SELECT r.id, r.financial_type_id, r.amount, r.description, r.period,
             r.operator_id, r.operator_name, r.created_at,
             ft.name AS type_name
      FROM financial_records r
      JOIN financial_types ft ON ft.id = r.financial_type_id
      WHERE r.lead_id      = ${leadId}::uuid
        AND r.workspace_id = ${workspaceId}::uuid
        AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
    `;
    }
    async getLeadSummary(leadId, workspaceId) {
        return database_1.prisma.$queryRaw `
      SELECT
        ft.name AS type_name,
        SUM(r.amount)                                                AS total,
        SUM(r.amount * COALESCE(cc.percentage, 0) / 100)            AS commission
      FROM financial_records r
      JOIN financial_types ft ON ft.id = r.financial_type_id
      LEFT JOIN commission_configs cc
        ON cc.financial_type_id = r.financial_type_id
       AND cc.workspace_id      = r.workspace_id
       AND cc.active            = true
      WHERE r.lead_id      = ${leadId}::uuid
        AND r.workspace_id = ${workspaceId}::uuid
        AND r.deleted_at IS NULL
      GROUP BY ft.name
      ORDER BY total DESC
    `;
    }
    async createLeadRecord(leadId, workspaceId, userId, userName, input) {
        const period = currentPeriod();
        const rows = await database_1.prisma.$queryRaw `
      INSERT INTO financial_records
        (lead_id, workspace_id, financial_type_id, amount, description, operator_id, operator_name, period)
      VALUES
        (${leadId}::uuid, ${workspaceId}::uuid, ${input.financialTypeId}::uuid,
         ${input.amount}, ${input.description ?? null}, ${userId}::uuid, ${userName}, ${period})
      RETURNING *
    `;
        return rows[0];
    }
    async deleteLeadRecord(recId, workspaceId, userId, userName) {
        const rows = await database_1.prisma.$queryRaw `
      UPDATE financial_records
      SET deleted_at = now(), deleted_by_id = ${userId}::uuid, deleted_by_name = ${userName}
      WHERE id = ${recId}::uuid AND workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL
      RETURNING id
    `;
        if (!rows[0])
            throw new Error('Registro não encontrado');
    }
}
exports.FinancialService = FinancialService;
//# sourceMappingURL=financial.service.js.map