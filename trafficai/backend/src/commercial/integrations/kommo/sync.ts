// ==============================
// TrafficAI — Kommo Sync Logic
// Importa pipelines, stages, vendedores e deals do Kommo pro schema comm_*.
// Idempotente: usa external_id pra upsert.
// ==============================

import { query, queryOne, transaction } from '../../../database/connection';
import { logger } from '../../../shared/logger';
import { KommoClient, type KommoLead, type KommoStatus } from './client';

interface SyncContext {
    userId: string;
    clientId: string | null;
    integrationId: string;     // comm_integrations.id
    subdomain: string;
    accessToken: string;
}

interface SyncResult {
    pipelines: number;
    stages: number;
    salespeople: number;
    leads: number;
    durationMs: number;
    lastUpdatedAt: number;     // unix seconds — pra próxima sync incremental
    errors: string[];
}

/** Mapeia o "type" do status Kommo pra nosso stage_type. */
function mapStageType(kommoType: number | undefined, kommoStatusId: number): 'incoming' | 'normal' | 'won' | 'lost' {
    // IDs reservados do Kommo
    if (kommoStatusId === 142) return 'won';
    if (kommoStatusId === 143) return 'lost';
    // type 1 = "leads de entrada" (incoming)
    if (kommoType === 1) return 'incoming';
    return 'normal';
}

/** Cor padrão por tipo se Kommo não trouxer. */
function defaultColor(stageType: 'incoming' | 'normal' | 'won' | 'lost'): string {
    return {
        incoming: '#94a3b8',
        normal: '#6366f1',
        won: '#10b981',
        lost: '#ef4444',
    }[stageType];
}

// ----- Sync de pipelines + stages -----

async function syncPipelines(ctx: SyncContext, kommo: KommoClient): Promise<{ pipelines: number; stages: number; stageMap: Map<number, string> }> {
    const kommoPipes = await kommo.listPipelines();
    let pipelinesCount = 0, stagesCount = 0;
    const stageMap = new Map<number, string>();   // kommo status_id -> internal stage_id

    for (const kp of kommoPipes) {
        if (kp.is_archive) continue;

        // Upsert pipeline
        const existing = await queryOne<{ id: string }>(
            `SELECT id FROM comm_pipelines
             WHERE user_id = $1 AND external_source = 'kommo' AND external_id = $2`,
            [ctx.userId, String(kp.id)]
        );

        let pipelineId: string;
        if (existing) {
            pipelineId = existing.id;
            await query(
                `UPDATE comm_pipelines
                 SET name = $1, is_main = $2, position = $3, updated_at = NOW()
                 WHERE id = $4`,
                [kp.name, kp.is_main, kp.sort, pipelineId]
            );
        } else {
            const ins = await query<{ id: string }>(
                `INSERT INTO comm_pipelines (user_id, client_id, external_source, external_id, name, is_main, position)
                 VALUES ($1, $2, 'kommo', $3, $4, $5, $6) RETURNING id`,
                [ctx.userId, ctx.clientId, String(kp.id), kp.name, kp.is_main, kp.sort]
            );
            pipelineId = ins[0]!.id;
            pipelinesCount++;
        }

        // Upsert stages
        for (const ks of kp.statuses) {
            const stageType = mapStageType(ks.type, ks.id);
            const color = ks.color ?? defaultColor(stageType);

            const stageExisting = await queryOne<{ id: string }>(
                `SELECT id FROM comm_pipeline_stages
                 WHERE pipeline_id = $1 AND external_id = $2`,
                [pipelineId, String(ks.id)]
            );

            let stageId: string;
            if (stageExisting) {
                stageId = stageExisting.id;
                await query(
                    `UPDATE comm_pipeline_stages
                     SET name = $1, position = $2, color = $3, stage_type = $4, updated_at = NOW()
                     WHERE id = $5`,
                    [ks.name, ks.sort, color, stageType, stageId]
                );
            } else {
                const ins = await query<{ id: string }>(
                    `INSERT INTO comm_pipeline_stages (pipeline_id, external_id, name, position, color, stage_type)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                    [pipelineId, String(ks.id), ks.name, ks.sort, color, stageType]
                );
                stageId = ins[0]!.id;
                stagesCount++;
            }
            stageMap.set(ks.id, stageId);
        }
    }
    return { pipelines: pipelinesCount, stages: stagesCount, stageMap };
}

// ----- Sync de salespeople -----

async function syncSalespeople(ctx: SyncContext, kommo: KommoClient): Promise<{ count: number; userMap: Map<number, string> }> {
    const users = await kommo.listUsers();
    const userMap = new Map<number, string>();   // kommo user_id -> internal salesperson_id
    let count = 0;

    for (const u of users) {
        if (!u.id) continue;

        const existing = await queryOne<{ id: string }>(
            `SELECT id FROM comm_salespeople
             WHERE user_id = $1 AND external_source = 'kommo' AND external_id = $2`,
            [ctx.userId, String(u.id)]
        );

        if (existing) {
            userMap.set(u.id, existing.id);
            await query(
                `UPDATE comm_salespeople
                 SET name = $1, email = $2, active = $3, updated_at = NOW()
                 WHERE id = $4`,
                [u.name, u.email, u.rights?.is_active !== false, existing.id]
            );
        } else {
            const color = pickColor(u.id);
            const ins = await query<{ id: string }>(
                `INSERT INTO comm_salespeople (user_id, client_id, external_source, external_id, name, email, avatar_color, active)
                 VALUES ($1, $2, 'kommo', $3, $4, $5, $6, $7) RETURNING id`,
                [ctx.userId, ctx.clientId, String(u.id), u.name, u.email, color, u.rights?.is_active !== false]
            );
            userMap.set(u.id, ins[0]!.id);
            count++;
        }
    }
    return { count, userMap };
}

function pickColor(seed: number): string {
    const colors = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#3b82f6', '#f97316', '#14b8a6'];
    return colors[seed % colors.length]!;
}

// ----- Sync de deals (leads do Kommo) -----

async function syncDeals(
    ctx: SyncContext,
    kommo: KommoClient,
    stageMap: Map<number, string>,
    userMap: Map<number, string>,
    updatedSince?: number,
): Promise<{ count: number; lastUpdatedAt: number }> {
    let leadsCount = 0;
    let maxUpdatedAt = updatedSince ?? 0;

    // Cache pipeline_id por kommo_pipeline_id (evita query repetida)
    const pipeMap = new Map<number, string>();
    const pipeRows = await query<{ id: string; external_id: string }>(
        `SELECT id, external_id FROM comm_pipelines
         WHERE user_id = $1 AND external_source = 'kommo' AND external_id IS NOT NULL`,
        [ctx.userId]
    );
    pipeRows.forEach(r => pipeMap.set(Number(r.external_id), r.id));

    // Cache loss_reasons (id_kommo -> name)
    const lossReasons = await kommo.listLossReasons();
    const lossMap = new Map<number, string>();
    lossReasons.forEach(r => lossMap.set(r.id, r.name));

    await kommo.paginateLeads({ updatedSince, maxPages: 30 }, async (leads, page) => {
        logger.debug(`Kommo sync: page ${page}, ${leads.length} leads`);
        for (const lead of leads) {
            try {
                await upsertDeal(ctx, lead, stageMap, userMap, pipeMap, lossMap);
                leadsCount++;
                if (lead.updated_at > maxUpdatedAt) maxUpdatedAt = lead.updated_at;
            } catch (e: any) {
                logger.warn(`Falha ao importar lead Kommo ${lead.id}: ${e.message}`);
            }
        }
    });

    return { count: leadsCount, lastUpdatedAt: maxUpdatedAt };
}

async function upsertDeal(
    ctx: SyncContext,
    lead: KommoLead,
    stageMap: Map<number, string>,
    userMap: Map<number, string>,
    pipeMap: Map<number, string>,
    lossMap: Map<number, string>,
): Promise<void> {
    const stageId = stageMap.get(lead.status_id);
    const pipelineId = pipeMap.get(lead.pipeline_id);
    if (!stageId || !pipelineId) return;   // stage/pipeline arquivado

    const salespersonId = lead.responsible_user_id ? userMap.get(lead.responsible_user_id) ?? null : null;
    const status: 'won' | 'lost' | 'open' =
        lead.status_id === 142 ? 'won' :
            lead.status_id === 143 ? 'lost' : 'open';

    const lossReason = lead.loss_reason_id ? lossMap.get(lead.loss_reason_id) ?? null : null;
    const createdAt = new Date(lead.created_at * 1000);
    const updatedAt = new Date(lead.updated_at * 1000);
    const closedAt = lead.closed_at ? new Date(lead.closed_at * 1000) : null;

    // contact name preliminar (do lead.name; refinaremos com fetchContact se necessario depois)
    const contactName = lead.name && !lead.name.startsWith('Lead #') ? lead.name : null;

    const existing = await queryOne<{ id: string; stage_id: string; status: string }>(
        `SELECT id, stage_id, status FROM comm_deals
         WHERE user_id = $1 AND external_source = 'kommo' AND external_id = $2`,
        [ctx.userId, String(lead.id)]
    );

    if (existing) {
        // Update + registrar movimento se mudou de stage
        if (existing.stage_id !== stageId) {
            await query(
                `INSERT INTO comm_deal_stage_history
                 (deal_id, user_id, from_stage_id, to_stage_id, moved_at, reason, deal_value_snapshot, moved_by_salesperson_id)
                 VALUES ($1, $2, $3, $4, $5, 'webhook', $6, $7)`,
                [existing.id, ctx.userId, existing.stage_id, stageId, updatedAt,
                    lead.price ?? 0, salespersonId]
            );
        }
        await query(
            `UPDATE comm_deals SET
                pipeline_id = $1, stage_id = $2, salesperson_id = $3,
                contact_name = COALESCE($4, contact_name), value = $5, status = $6,
                loss_reason = $7, last_stage_change_at = $8, last_activity_at = $9,
                closed_at = $10, updated_at = NOW()
             WHERE id = $11`,
            [pipelineId, stageId, salespersonId, contactName, lead.price ?? 0,
                status, lossReason, updatedAt, updatedAt, closedAt, existing.id]
        );
    } else {
        // Insert + registrar 'created'
        const ins = await query<{ id: string }>(
            `INSERT INTO comm_deals (
                user_id, client_id, external_source, external_id, pipeline_id, stage_id, salesperson_id,
                contact_name, title, value, status, loss_reason,
                created_at, last_stage_change_at, last_activity_at, closed_at
             ) VALUES ($1, $2, 'kommo', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id`,
            [ctx.userId, ctx.clientId, String(lead.id), pipelineId, stageId, salespersonId,
                contactName, contactName ?? `Lead #${lead.id}`, lead.price ?? 0, status, lossReason,
                createdAt, updatedAt, updatedAt, closedAt]
        );
        const dealId = ins[0]!.id;
        await query(
            `INSERT INTO comm_deal_stage_history
             (deal_id, user_id, from_stage_id, to_stage_id, moved_at, reason, deal_value_snapshot, moved_by_salesperson_id)
             VALUES ($1, $2, NULL, $3, $4, 'created', $5, $6)`,
            [dealId, ctx.userId, stageId, createdAt, lead.price ?? 0, salespersonId]
        );
    }
}

// ----- ENTRY POINT -----

export async function syncKommoIntegration(integrationId: string, opts: { incremental?: boolean } = {}): Promise<SyncResult> {
    const start = Date.now();
    const errors: string[] = [];

    // Carrega config da integração
    const intg = await queryOne<{
        user_id: string; client_id: string | null;
        config: { subdomain: string };
        credentials: { access_token: string };
        last_event_at: Date | null;
    }>(
        `SELECT user_id, client_id, config, credentials, last_event_at
         FROM comm_integrations WHERE id = $1 AND type = 'kommo'`,
        [integrationId]
    );
    if (!intg) throw new Error(`Integração Kommo ${integrationId} não encontrada`);

    const ctx: SyncContext = {
        userId: intg.user_id,
        clientId: intg.client_id,
        integrationId,
        subdomain: intg.config.subdomain,
        accessToken: intg.credentials.access_token,
    };

    // Marca como conectando
    await query(`UPDATE comm_integrations SET status = 'connecting', updated_at = NOW() WHERE id = $1`, [integrationId]);

    try {
        const kommo = new KommoClient(ctx.subdomain, ctx.accessToken);

        // Valida credenciais
        await kommo.getAccount();

        // Sync em ordem: pipelines -> stages -> salespeople -> deals
        const { pipelines, stages, stageMap } = await syncPipelines(ctx, kommo);
        const { count: salespeopleCount, userMap } = await syncSalespeople(ctx, kommo);

        const updatedSince = opts.incremental && intg.last_event_at
            ? Math.floor(intg.last_event_at.getTime() / 1000)
            : Math.floor((Date.now() - 90 * 86400 * 1000) / 1000);   // 90 dias

        const { count: leadsCount, lastUpdatedAt } = await syncDeals(
            ctx, kommo, stageMap, userMap, updatedSince
        );

        // Marca sucesso
        await query(
            `UPDATE comm_integrations
             SET status = 'connected', last_event_at = NOW(), last_error = NULL, updated_at = NOW()
             WHERE id = $1`,
            [integrationId]
        );

        return {
            pipelines, stages, salespeople: salespeopleCount, leads: leadsCount,
            durationMs: Date.now() - start,
            lastUpdatedAt,
            errors,
        };
    } catch (err: any) {
        const msg = KommoClient.formatError(err);
        logger.error(`Kommo sync falhou (${integrationId}): ${msg}`);
        await query(
            `UPDATE comm_integrations SET status = 'error', last_error = $1, updated_at = NOW() WHERE id = $2`,
            [msg, integrationId]
        );
        throw err;
    }
}
