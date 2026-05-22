"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaAdsService = void 0;

const database_1 = require("../../config/database");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const meta_graph_client_1 = require("./meta-graph-client");

function rowToAccount(row) {
    if (!row) return null;
    return {
        id: row.id,
        workspaceId: row.workspace_id,
        adAccountId: row.ad_account_id,
        accountName: row.account_name,
        businessId: row.business_id,
        currency: row.currency,
        timezoneName: row.timezone_name,
        isActive: row.is_active,
        lastSyncAt: row.last_sync_at,
        lastSyncStatus: row.last_sync_status,
        lastSyncError: row.last_sync_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function actNorm(adAccountId) {
    const s = String(adAccountId || '').trim();
    return s.startsWith('act_') ? s : `act_${s}`;
}

function dateYMD(d) {
    if (!d) return null;
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x.getTime())) return null;
    const y = x.getFullYear(), m = String(x.getMonth() + 1).padStart(2, '0'), day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

class MetaAdsService {

    // ── CRUD de contas conectadas ───────────────────────────────────────
    async listAccounts(workspaceId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT * FROM meta_ad_accounts WHERE workspace_id = $1::uuid ORDER BY created_at DESC`,
            workspaceId);
        return rows.map(rowToAccount);
    }

    async getAccount(workspaceId, id) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT * FROM meta_ad_accounts WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
            id, workspaceId);
        return rowToAccount(rows[0]);
    }

    async getDecryptedToken(accountId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT access_token_enc FROM meta_ad_accounts WHERE id = $1::uuid LIMIT 1`,
            accountId);
        if (!rows.length) throw new Error('Conta não encontrada');
        return token_encryption_1.decrypt(rows[0].access_token_enc);
    }

    /**
     * Valida o token + ad account id, busca dados básicos, salva criptografado.
     */
    async connect(workspaceId, userId, input) {
        const accessToken = (input.accessToken || '').trim();
        const adAccountIdRaw = (input.adAccountId || '').trim();
        if (!accessToken) throw new Error('Access token obrigatório');
        if (!adAccountIdRaw) throw new Error('Ad Account ID obrigatório');

        const adAccountId = actNorm(adAccountIdRaw);

        // Valida via Graph API
        const client = new meta_graph_client_1.MetaGraphClient(accessToken);
        let info;
        try {
            info = await client.getAdAccount(adAccountId);
        } catch (e) {
            throw new Error('Falha ao validar com a Meta: ' + e.message);
        }

        // Upsert
        const existing = await database_1.prisma.$queryRawUnsafe(
            `SELECT id FROM meta_ad_accounts WHERE workspace_id = $1::uuid AND ad_account_id = $2 LIMIT 1`,
            workspaceId, adAccountId);

        const enc = token_encryption_1.encrypt(accessToken);
        if (existing.length) {
            const rows = await database_1.prisma.$queryRawUnsafe(
                `UPDATE meta_ad_accounts SET
                    account_name = $1, business_id = $2, currency = $3, timezone_name = $4,
                    access_token_enc = $5, is_active = true, updated_at = now()
                 WHERE id = $6::uuid RETURNING *`,
                info.name || null,
                info.business?.id || null,
                info.currency || 'BRL',
                info.timezone_name || null,
                enc,
                existing[0].id);
            return rowToAccount(rows[0]);
        } else {
            const rows = await database_1.prisma.$queryRawUnsafe(
                `INSERT INTO meta_ad_accounts (
                    workspace_id, ad_account_id, account_name, business_id, currency, timezone_name,
                    access_token_enc, is_active, created_by_id
                 ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, true, $8::uuid)
                 RETURNING *`,
                workspaceId, adAccountId,
                info.name || null,
                info.business?.id || null,
                info.currency || 'BRL',
                info.timezone_name || null,
                enc,
                userId || null);
            return rowToAccount(rows[0]);
        }
    }

    async disconnect(workspaceId, id) {
        await database_1.prisma.$queryRawUnsafe(
            `DELETE FROM meta_ad_accounts WHERE id = $1::uuid AND workspace_id = $2::uuid`,
            id, workspaceId);
        return { ok: true };
    }

    // ── Sincronização ────────────────────────────────────────────────────

    /**
     * Sincroniza campanhas + insights dos últimos 30 dias para uma conta.
     */
    async sync(workspaceId, accountId, opts = {}) {
        const account = await this.getAccount(workspaceId, accountId);
        if (!account) throw new Error('Conta não encontrada');
        if (!account.isActive) throw new Error('Conta inativa');

        // Marca status running
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE meta_ad_accounts SET last_sync_status = 'running', updated_at = now() WHERE id = $1::uuid`,
            accountId);

        const token = await this.getDecryptedToken(accountId);
        const client = new meta_graph_client_1.MetaGraphClient(token);

        try {
            // 1) Campanhas
            const campaigns = await client.listCampaigns(account.adAccountId, { limit: 200 });
            for (const c of campaigns) {
                const dailyBudget = c.daily_budget ? parseInt(c.daily_budget, 10) : null;
                const lifetimeBudget = c.lifetime_budget ? parseInt(c.lifetime_budget, 10) : null;
                await database_1.prisma.$queryRawUnsafe(
                    `INSERT INTO meta_campaigns (
                        account_id, workspace_id, meta_campaign_id, name, objective, status,
                        daily_budget_cents, lifetime_budget_cents, start_time, stop_time, raw, fetched_at
                    ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::jsonb, now())
                    ON CONFLICT (account_id, meta_campaign_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        objective = EXCLUDED.objective,
                        status = EXCLUDED.status,
                        daily_budget_cents = EXCLUDED.daily_budget_cents,
                        lifetime_budget_cents = EXCLUDED.lifetime_budget_cents,
                        start_time = EXCLUDED.start_time,
                        stop_time = EXCLUDED.stop_time,
                        raw = EXCLUDED.raw,
                        fetched_at = now()`,
                    accountId, workspaceId, c.id, c.name || '(sem nome)',
                    c.objective || null, c.effective_status || c.status || null,
                    dailyBudget, lifetimeBudget,
                    c.start_time || null, c.stop_time || null,
                    JSON.stringify(c));
            }

            // 2) Insights (últimos 30 dias por padrão, ou range customizado)
            const today = new Date();
            const sinceDate = opts.since ? new Date(opts.since) : (() => { const d = new Date(today); d.setDate(d.getDate() - 30); return d; })();
            const untilDate = opts.until ? new Date(opts.until) : today;
            const since = dateYMD(sinceDate);
            const until = dateYMD(untilDate);

            const insights = await client.getInsights(account.adAccountId, { since, until, level: 'campaign', timeIncrement: '1' });

            for (const r of insights) {
                const spend = parseFloat(r.spend || '0');
                const spendCents = Math.round(spend * 100);
                const impressions = parseInt(r.impressions || '0', 10);
                const clicks = parseInt(r.clicks || '0', 10);
                const reach = r.reach ? parseInt(r.reach, 10) : null;
                const ctr = r.ctr ? parseFloat(r.ctr) : null;
                const cpc = r.cpc ? Math.round(parseFloat(r.cpc) * 100) : null;
                const cpm = r.cpm ? Math.round(parseFloat(r.cpm) * 100) : null;

                // leads do meta (custom event "Lead")
                let metaLeads = 0;
                if (Array.isArray(r.actions)) {
                    for (const a of r.actions) {
                        if (a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped' || a.action_type === 'leadgen.other') {
                            metaLeads += parseInt(a.value || '0', 10) || 0;
                        }
                    }
                }

                await database_1.prisma.$queryRawUnsafe(
                    `INSERT INTO meta_insights_daily (
                        account_id, workspace_id, meta_campaign_id, campaign_name, date_start,
                        spend_cents, impressions, clicks, reach, ctr, cpc_cents, cpm_cents,
                        meta_leads, raw, fetched_at
                    ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::date, $6, $7, $8, $9, $10::numeric, $11, $12, $13, $14::jsonb, now())
                    ON CONFLICT (account_id, meta_campaign_id, date_start) DO UPDATE SET
                        campaign_name = EXCLUDED.campaign_name,
                        spend_cents = EXCLUDED.spend_cents,
                        impressions = EXCLUDED.impressions,
                        clicks = EXCLUDED.clicks,
                        reach = EXCLUDED.reach,
                        ctr = EXCLUDED.ctr,
                        cpc_cents = EXCLUDED.cpc_cents,
                        cpm_cents = EXCLUDED.cpm_cents,
                        meta_leads = EXCLUDED.meta_leads,
                        raw = EXCLUDED.raw,
                        fetched_at = now()`,
                    accountId, workspaceId, r.campaign_id, r.campaign_name || null, r.date_start,
                    spendCents, impressions, clicks, reach, ctr, cpc, cpm,
                    metaLeads, JSON.stringify(r));
            }

            await database_1.prisma.$queryRawUnsafe(
                `UPDATE meta_ad_accounts SET last_sync_at = now(), last_sync_status = 'success',
                    last_sync_error = NULL, updated_at = now() WHERE id = $1::uuid`,
                accountId);

            return { ok: true, campaigns: campaigns.length, insights: insights.length };
        } catch (e) {
            await database_1.prisma.$queryRawUnsafe(
                `UPDATE meta_ad_accounts SET last_sync_status = 'failed',
                    last_sync_error = $1, updated_at = now() WHERE id = $2::uuid`,
                e.message || 'erro', accountId);
            throw e;
        }
    }

    // ── Dashboard agregado ───────────────────────────────────────────────

    /**
     * Métricas agregadas + por campanha + cruzamento com leads do CRM.
     */
    async getDashboard(workspaceId, opts = {}) {
        const since = opts.since || (() => { const d = new Date(); d.setDate(d.getDate() - 30); return dateYMD(d); })();
        const until = opts.until || dateYMD(new Date());
        const accountIdFilter = opts.accountId || null;

        // Totais
        const totalsRows = await database_1.prisma.$queryRawUnsafe(
            `SELECT
                COALESCE(SUM(spend_cents),0)::bigint AS spend_cents,
                COALESCE(SUM(impressions),0)::bigint AS impressions,
                COALESCE(SUM(clicks),0)::bigint AS clicks,
                COALESCE(SUM(meta_leads),0)::bigint AS meta_leads,
                COALESCE(SUM(reach),0)::bigint AS reach
             FROM meta_insights_daily
             WHERE workspace_id = $1::uuid
               AND date_start >= $2::date AND date_start <= $3::date
               ${accountIdFilter ? 'AND account_id = $4::uuid' : ''}`,
            ...(accountIdFilter ? [workspaceId, since, until, accountIdFilter] : [workspaceId, since, until]));
        const tRaw = totalsRows[0] || {};
        const t = {
            spend_cents: Number(tRaw.spend_cents || 0),
            impressions: Number(tRaw.impressions || 0),
            clicks: Number(tRaw.clicks || 0),
            meta_leads: Number(tRaw.meta_leads || 0),
            reach: Number(tRaw.reach || 0),
        };

        // Por campanha (agregado no período)
        const byCampaign = await database_1.prisma.$queryRawUnsafe(
            `SELECT
                meta_campaign_id,
                COALESCE(MAX(campaign_name), '(sem nome)') AS campaign_name,
                COALESCE(SUM(spend_cents),0)::bigint AS spend_cents,
                COALESCE(SUM(impressions),0)::bigint AS impressions,
                COALESCE(SUM(clicks),0)::bigint AS clicks,
                COALESCE(SUM(meta_leads),0)::bigint AS meta_leads
             FROM meta_insights_daily
             WHERE workspace_id = $1::uuid
               AND date_start >= $2::date AND date_start <= $3::date
               ${accountIdFilter ? 'AND account_id = $4::uuid' : ''}
             GROUP BY meta_campaign_id
             ORDER BY spend_cents DESC`,
            ...(accountIdFilter ? [workspaceId, since, until, accountIdFilter] : [workspaceId, since, until]));

        // Reconciliação UTM → leads do CRM por nome de campanha
        const campaignNames = byCampaign.map(c => c.campaign_name).filter(Boolean);
        const campaignIds = byCampaign.map(c => c.meta_campaign_id).filter(Boolean);
        let crmLeadsByCampaign = {};   // por nome (lowercase)
        let crmLeadsByCampaignId = {}; // por meta_campaign_id (caso UTM seja o ID numérico)
        if (campaignNames.length || campaignIds.length) {
            const crmRows = await database_1.prisma.$queryRawUnsafe(
                `SELECT utm_campaign, COUNT(*)::int AS cnt
                 FROM leads
                 WHERE workspace_id = $1::uuid
                   AND utm_campaign IS NOT NULL
                   AND utm_captured_at >= $2::timestamptz
                   AND utm_captured_at <= ($3::date + interval '1 day')::timestamptz
                 GROUP BY utm_campaign`,
                workspaceId, since, until);
            for (const r of crmRows) {
                const raw = String(r.utm_campaign).trim();
                crmLeadsByCampaign[raw.toLowerCase()] = (crmLeadsByCampaign[raw.toLowerCase()] || 0) + r.cnt;
                // Se for ID numérico, indexa também por ID
                if (/^\d{10,}$/.test(raw)) {
                    crmLeadsByCampaignId[raw] = (crmLeadsByCampaignId[raw] || 0) + r.cnt;
                }
            }
        }

        // Soma total de CRM leads atribuíveis (que batem com alguma campanha)
        let totalCrmLeads = 0;
        const campaigns = byCampaign.map(c => {
            const key = String(c.campaign_name || '').trim().toLowerCase();
            const idKey = String(c.meta_campaign_id || '').trim();
            const crmLeads = (crmLeadsByCampaign[key] || 0) + (crmLeadsByCampaignId[idKey] || 0);
            totalCrmLeads += crmLeads;
            const spend = Number(c.spend_cents) / 100;
            const cpl = c.meta_leads > 0 ? spend / Number(c.meta_leads) : null;
            const cplCrm = crmLeads > 0 ? spend / crmLeads : null;
            const matchRate = c.meta_leads > 0 ? (crmLeads / Number(c.meta_leads)) * 100 : null;
            const impressionsN = Number(c.impressions);
            const clicksN = Number(c.clicks);
            const cpm = impressionsN > 0 ? (spend / impressionsN) * 1000 : null;
            const ctr = impressionsN > 0 ? (clicksN / impressionsN) * 100 : null;
            return {
                metaCampaignId: c.meta_campaign_id,
                campaignName: c.campaign_name,
                spend,
                impressions: Number(c.impressions),
                clicks: Number(c.clicks),
                metaLeads: Number(c.meta_leads || 0),
                crmLeads,
                cpl,
                cpm,
                ctr,
            };
        });

        // Série temporal diária (spend + leads)
        const dailyRows = await database_1.prisma.$queryRawUnsafe(
            `SELECT date_start::text AS date,
                    COALESCE(SUM(spend_cents),0)::bigint AS spend_cents,
                    COALESCE(SUM(impressions),0)::bigint AS impressions,
                    COALESCE(SUM(clicks),0)::bigint AS clicks,
                    COALESCE(SUM(meta_leads),0)::bigint AS meta_leads
             FROM meta_insights_daily
             WHERE workspace_id = $1::uuid
               AND date_start >= $2::date AND date_start <= $3::date
               ${accountIdFilter ? 'AND account_id = $4::uuid' : ''}
             GROUP BY date_start ORDER BY date_start`,
            ...(accountIdFilter ? [workspaceId, since, until, accountIdFilter] : [workspaceId, since, until]));

        // Leads CRM por dia
        const crmDailyRows = await database_1.prisma.$queryRawUnsafe(
            `SELECT date_trunc('day', utm_captured_at)::date::text AS date,
                    COUNT(*)::int AS cnt
             FROM leads
             WHERE workspace_id = $1::uuid
               AND utm_captured_at IS NOT NULL
               AND utm_captured_at >= $2::timestamptz
               AND utm_captured_at <= ($3::date + interval '1 day')::timestamptz
             GROUP BY 1 ORDER BY 1`,
            workspaceId, since, until);

        const crmDailyMap = {};
        for (const r of crmDailyRows) crmDailyMap[r.date] = r.cnt;

        const daily = dailyRows.map(d => ({
            date: d.date,
            spend: Number(d.spend_cents) / 100,
            impressions: Number(d.impressions),
            clicks: Number(d.clicks),
            metaLeads: Number(d.meta_leads),
            crmLeads: crmDailyMap[d.date] || 0,
        }));

        const totalSpend = Number(t.spend_cents || 0) / 100;
        const totalImpressions = Number(t.impressions || 0);
        const totalClicks = Number(t.clicks || 0);
        const totalMetaLeads = Number(t.meta_leads || 0);

        return {
            range: { since, until },
            totals: {
                spend: totalSpend,
                impressions: totalImpressions,
                clicks: totalClicks,
                metaLeads: totalMetaLeads,
                crmLeads: totalCrmLeads,
                cpl: totalMetaLeads > 0 ? totalSpend / totalMetaLeads : null,
                cplCrm: totalCrmLeads > 0 ? totalSpend / totalCrmLeads : null,
                matchRate: totalMetaLeads > 0 ? (totalCrmLeads / totalMetaLeads) * 100 : null,
                cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null,
                ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
            },
            campaigns,
            daily,
        };
    }
}

exports.MetaAdsService = MetaAdsService;
