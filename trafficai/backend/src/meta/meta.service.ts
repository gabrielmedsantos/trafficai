// ==============================
// TrafficAI — Meta Ads API Service
// ==============================
// Regras de ouro:
//  - Todas as chamadas à Meta Graph API devem paginar até o fim (paging.next)
//  - Nada de LIMIT artificial — puxar TUDO que a Meta retornar
//  - Sempre que possível validar total de spend contra o nível de conta

import axios, { AxiosInstance } from 'axios';
import { metaRepository, InsightRecord } from './meta.repository';
import { metaRateLimiter } from '../shared/rate-limiter';
import { MetaApiError } from '../shared/errors';
import { logger } from '../shared/logger';
import { query } from '../database/connection';

const META_API_VERSION = 'v19.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const PAGE_SIZE = 500; // apenas dimensionamento de página da Meta — NÃO é teto

export class MetaService {
    private createClient(accessToken: string): AxiosInstance {
        return axios.create({
            baseURL: META_BASE_URL,
            params: { access_token: accessToken },
            timeout: 45000,
        });
    }

    /**
     * Segue todas as páginas de um endpoint da Meta Graph API.
     * Retorna TODOS os resultados — nunca corta.
     */
    private async fetchAllPages(
        client: AxiosInstance,
        path: string,
        params: any
    ): Promise<any[]> {
        const results: any[] = [];
        let nextUrl: string | null = path;
        let nextParams: any = { ...params, limit: params.limit || PAGE_SIZE };
        let pageCount = 0;
        const MAX_PAGES = 200; // proteção contra loop infinito (100k+ itens)

        while (nextUrl && pageCount < MAX_PAGES) {
            const response: any = await client.get(nextUrl, { params: nextParams });
            results.push(...(response.data?.data || []));
            const next = response.data?.paging?.next;
            if (!next) break;
            // A URL `next` já contém query string completa (inclui access_token).
            // Usamos a URL absoluta e não reenviamos params.
            nextUrl = next;
            nextParams = undefined;
            pageCount++;
        }

        if (pageCount >= MAX_PAGES) {
            logger.warn(`Meta pagination hit safety cap at ${MAX_PAGES} pages on ${path}`);
        }
        return results;
    }

    /**
     * Fetch all ad accounts for a user.
     * Combina três fontes:
     *  1. /me/adaccounts — contas pessoais
     *  2. /{biz}/owned_ad_accounts — contas que o Business Manager possui
     *  3. /{biz}/client_ad_accounts — contas de clientes gerenciadas pelo BM
     */
    async getAdAccounts(userId: string, accessToken: string) {
        const client = this.createClient(accessToken);
        const seen = new Set<string>();
        const allAccounts: any[] = [];
        const FIELDS = 'id,name,currency,timezone_name,account_status';

        const merge = (accounts: any[]) => {
            for (const acc of accounts) {
                const rawId = String(acc.id).replace(/^act_/, '');
                if (!seen.has(rawId)) {
                    seen.add(rawId);
                    allAccounts.push({ ...acc, id: `act_${rawId}` });
                }
            }
        };

        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                // 1. Contas pessoais
                const personal = await this.fetchAllPages(client, '/me/adaccounts', { fields: FIELDS });
                merge(personal);
                logger.info(`Meta sync — contas pessoais: ${personal.length}`);

                // 2. Business Managers do usuário
                let businesses: any[] = [];
                try {
                    businesses = await this.fetchAllPages(client, '/me/businesses', { fields: 'id,name' });
                    logger.info(`Meta sync — Business Managers: ${businesses.length}`);
                } catch (e: any) {
                    logger.warn('Falha ao buscar Business Managers (permissão insuficiente)', { error: e.message });
                }

                for (const biz of businesses) {
                    // Owned ad accounts
                    try {
                        const owned = await this.fetchAllPages(client, `/${biz.id}/owned_ad_accounts`, { fields: FIELDS });
                        merge(owned);
                        logger.info(`BM ${biz.name} — owned accounts: ${owned.length}`);
                    } catch (e: any) {
                        logger.warn(`Falha em owned_ad_accounts do BM ${biz.id}`, { error: e.message });
                    }

                    // Client ad accounts
                    try {
                        const client_accs = await this.fetchAllPages(client, `/${biz.id}/client_ad_accounts`, { fields: FIELDS });
                        merge(client_accs);
                        logger.info(`BM ${biz.name} — client accounts: ${client_accs.length}`);
                    } catch (e: any) {
                        logger.warn(`Falha em client_ad_accounts do BM ${biz.id}`, { error: e.message });
                    }
                }

                logger.info(`✅ Total de contas Meta encontradas: ${allAccounts.length}`);
                return allAccounts;
            } catch (error: any) {
                this.handleMetaError(error);
            }
        });
    }

    /**
     * Fetch ALL campaigns for an ad account (paginado, sem limite)
     */
    async getCampaigns(userId: string, accessToken: string, adAccountId: string) {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                const campaigns = await this.fetchAllPages(client, `/${adAccountId}/campaigns`, {
                    fields: 'id,name,objective,status,daily_budget,lifetime_budget,created_time',
                });
                logger.info(`Conta ${adAccountId}: ${campaigns.length} campanhas`);
                return campaigns;
            } catch (error: any) {
                this.handleMetaError(error);
            }
        });
    }

    /**
     * Fetch ALL ad sets for a campaign (paginado)
     */
    async getAdSets(userId: string, accessToken: string, campaignId: string) {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                return await this.fetchAllPages(client, `/${campaignId}/adsets`, {
                    fields: 'id,name,status,daily_budget,targeting,optimization_goal',
                });
            } catch (error: any) {
                this.handleMetaError(error);
            }
        });
    }

    /**
     * Fetch ALL ads for a campaign (paginado)
     */
    async getAds(userId: string, accessToken: string, campaignId: string) {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                return await this.fetchAllPages(client, `/${campaignId}/ads`, {
                    fields: 'id,name,status,creative{id,name,thumbnail_url}',
                });
            } catch (error: any) {
                this.handleMetaError(error);
            }
        });
    }

    /**
     * Sync a single account's campaigns + insights for a specific date range (since/until)
     * Used by report generation to pull fresh data from Meta before aggregating
     */
    async syncAccountForPeriod(userId: string, accessToken: string, dbAccountId: string, since: string, until: string): Promise<void> {
        logger.info('Syncing account for report period', { dbAccountId, since, until });

        // Get meta_account_id from DB
        const rows = await query<any>(`SELECT meta_account_id FROM ad_accounts WHERE id = $1`, [dbAccountId]);
        if (!rows.length) throw new Error('Conta não encontrada no banco');
        const metaAccountId = rows[0].meta_account_id;

        const campaigns = await this.getCampaigns(userId, accessToken, metaAccountId);

        for (const campaign of campaigns) {
            const dbCampaign = await metaRepository.upsertCampaign(dbAccountId, {
                meta_campaign_id: campaign.id,
                name: campaign.name,
                objective: campaign.objective,
                status: campaign.status,
                daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : undefined,
                lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : undefined,
                created_time: campaign.created_time,
            });

            try {
                const insights = await metaRateLimiter.executeWithRetry(userId, async () => {
                    const client = this.createClient(accessToken);
                    return await this.fetchAllPages(client, `/${campaign.id}/insights`, {
                        fields: ['impressions','reach','clicks','ctr','cpc','cpm','spend','frequency','actions','cost_per_action_type','purchase_roas'].join(','),
                        time_range: JSON.stringify({ since, until }),
                        time_increment: 1,
                    });
                });

                for (const insight of insights) {
                    const conversions = this.extractConversions(insight.actions);
                    const roas = this.extractRoas(insight.purchase_roas);
                    const costPerConversion = this.extractCostPerConversion(insight.cost_per_action_type);
                    await metaRepository.upsertInsight({
                        campaign_id: dbCampaign.id,
                        date: insight.date_start,
                        spend: parseFloat(insight.spend || '0'),
                        impressions: parseInt(insight.impressions || '0', 10),
                        reach: parseInt(insight.reach || '0', 10),
                        clicks: parseInt(insight.clicks || '0', 10),
                        ctr: parseFloat(insight.ctr || '0'),
                        cpc: parseFloat(insight.cpc || '0'),
                        cpm: parseFloat(insight.cpm || '0'),
                        frequency: parseFloat(insight.frequency || '0'),
                        conversions,
                        cost_per_conversion: costPerConversion,
                        roas,
                        actions: insight.actions,
                    });
                }
            } catch (err: any) {
                logger.warn('Failed to sync insights for campaign during report', { campaignId: campaign.id, error: err.message });
            }
        }

        logger.info('Account sync for report completed', { dbAccountId, since, until });
    }

    /**
     * Fetch ad-level insights for a report period — returns ALL ads with their metrics.
     * Paginado, sem limite artificial.
     */
    async getAdInsightsForReport(
        userId: string,
        accessToken: string,
        metaAccountId: string,
        since: string,
        until: string
    ): Promise<any[]> {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                const acctPath = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
                return await this.fetchAllPages(client, `/${acctPath}/insights`, {
                    level: 'ad',
                    fields: [
                        'ad_id', 'ad_name',
                        'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'spend', 'frequency',
                        'actions', 'cost_per_action_type', 'purchase_roas',
                        'video_play_actions',
                    ].join(','),
                    time_range: JSON.stringify({ since, until }),
                });
            } catch (err: any) {
                logger.warn('Failed to fetch ad-level insights for report', { error: err.message });
                return [];
            }
        });
    }

    /**
     * Fetch ad thumbnails for a Meta account — retorna mapa completo de ad_id → thumbnail_url.
     * Faz múltiplas chamadas em batches para atender qualquer número de adIds.
     */
    async getAdThumbnails(
        userId: string,
        accessToken: string,
        metaAccountId: string,
        adIds: string[]
    ): Promise<Map<string, string>> {
        const thumbnails = new Map<string, string>();
        if (!adIds.length) return thumbnails;

        return metaRateLimiter.executeWithRetry(userId, async () => {
            const client = this.createClient(accessToken);
            const acctPath = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
            const BATCH = 50; // filtro IN da Meta tem limite prático por request
            for (let i = 0; i < adIds.length; i += BATCH) {
                const slice = adIds.slice(i, i + BATCH);
                try {
                    const ads = await this.fetchAllPages(client, `/${acctPath}/ads`, {
                        fields: 'id,creative{thumbnail_url,image_url}',
                        filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: slice }]),
                    });
                    for (const ad of ads) {
                        const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url;
                        if (thumb) thumbnails.set(ad.id, thumb);
                    }
                } catch (err: any) {
                    logger.warn('Failed to fetch ad thumbnails batch', { error: err.message });
                }
            }
            return thumbnails;
        });
    }

    /**
     * Fetch insights for a campaign with specified date range (paginado).
     * Preferir time_range quando possível — date_preset é relativo ao momento da chamada.
     */
    async getCampaignInsights(
        userId: string,
        accessToken: string,
        campaignId: string,
        datePreset: string = 'last_30d',
        timeRange?: { since: string; until: string }
    ) {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                const params: any = {
                    fields: [
                        'campaign_name',
                        'objective',
                        'impressions',
                        'reach',
                        'clicks',
                        'ctr',
                        'cpc',
                        'cpm',
                        'spend',
                        'frequency',
                        'actions',
                        'cost_per_action_type',
                        'purchase_roas',
                    ].join(','),
                    time_increment: 1,
                };
                if (timeRange) {
                    params.time_range = JSON.stringify(timeRange);
                } else {
                    params.date_preset = datePreset;
                }
                return await this.fetchAllPages(client, `/${campaignId}/insights`, params);
            } catch (error: any) {
                this.handleMetaError(error);
            }
        });
    }

    /**
     * Busca o total de spend DIRETAMENTE no nível da conta (act_XXX/insights)
     * para um período. Usado como VALIDAÇÃO contra a soma de campanhas no DB.
     * Se houver divergência significativa → alerta para re-sync.
     */
    async getAccountLevelSpend(
        userId: string,
        accessToken: string,
        metaAccountId: string,
        since: string,
        until: string
    ): Promise<{ spend: number; impressions: number; clicks: number; reach: number }> {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                const acctPath = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
                const rows = await this.fetchAllPages(client, `/${acctPath}/insights`, {
                    level: 'account',
                    fields: 'spend,impressions,clicks,reach',
                    time_range: JSON.stringify({ since, until }),
                });
                // Mesmo em level=account pode vir uma única linha, mas somamos por garantia.
                let spend = 0, impressions = 0, clicks = 0, reach = 0;
                for (const r of rows) {
                    spend += parseFloat(r.spend || '0');
                    impressions += parseInt(r.impressions || '0', 10);
                    clicks += parseInt(r.clicks || '0', 10);
                    reach += parseInt(r.reach || '0', 10);
                }
                return { spend, impressions, clicks, reach };
            } catch (error: any) {
                logger.warn('Falha ao buscar spend de nível conta', { error: error.message });
                return { spend: 0, impressions: 0, clicks: 0, reach: 0 };
            }
        });
    }

    /**
     * Sync all data for a user — called by background workers.
     * Usa time_range absoluto dos últimos N dias para evitar drift do `date_preset`.
     */
    async syncUserData(userId: string, accessToken: string, daysBack: number = 35): Promise<void> {
        logger.info('Starting data sync', { userId, daysBack });

        // Janela absoluta = hoje (inclusive) menos N-1 dias
        const now = new Date();
        const until = now.toISOString().split('T')[0];
        const sinceDate = new Date(now);
        sinceDate.setDate(sinceDate.getDate() - (daysBack - 1));
        const since = sinceDate.toISOString().split('T')[0];

        try {
            // 1. Sync ad accounts
            const metaAccounts = await this.getAdAccounts(userId, accessToken);
            for (const account of metaAccounts) {
                const dbAccount = await metaRepository.upsertAdAccount(userId, {
                    meta_account_id: account.id,
                    account_name: account.name,
                    currency: account.currency || 'BRL',
                    timezone: account.timezone_name || 'America/Sao_Paulo',
                });

                // 2. Sync campaigns per account (paginado — todas)
                const campaigns = await this.getCampaigns(userId, accessToken, account.id);
                for (const campaign of campaigns) {
                    const dbCampaign = await metaRepository.upsertCampaign(dbAccount.id, {
                        meta_campaign_id: campaign.id,
                        name: campaign.name,
                        objective: campaign.objective,
                        status: campaign.status,
                        daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : undefined,
                        lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : undefined,
                        created_time: campaign.created_time,
                    });

                    // 3. Sync insights per campaign (time_range absoluto, paginado)
                    try {
                        const insights = await this.getCampaignInsights(
                            userId, accessToken, campaign.id, 'last_30d',
                            { since, until }
                        );
                        for (const insight of insights) {
                            const conversions = this.extractConversions(insight.actions);
                            const roas = this.extractRoas(insight.purchase_roas);
                            const costPerConversion = this.extractCostPerConversion(insight.cost_per_action_type);

                            await metaRepository.upsertInsight({
                                campaign_id: dbCampaign.id,
                                date: insight.date_start,
                                spend: parseFloat(insight.spend || '0'),
                                impressions: parseInt(insight.impressions || '0', 10),
                                reach: parseInt(insight.reach || '0', 10),
                                clicks: parseInt(insight.clicks || '0', 10),
                                ctr: parseFloat(insight.ctr || '0'),
                                cpc: parseFloat(insight.cpc || '0'),
                                cpm: parseFloat(insight.cpm || '0'),
                                frequency: parseFloat(insight.frequency || '0'),
                                conversions,
                                cost_per_conversion: costPerConversion,
                                roas,
                                actions: insight.actions,
                            });
                        }
                    } catch (err: any) {
                        logger.warn('Failed to sync insights for campaign', {
                            campaignId: campaign.id,
                            error: err.message,
                        });
                    }
                }
            }

            // Also sync manually-added accounts not returned by Meta API
            const allDbAccounts = await query<any>(
                `SELECT id, meta_account_id FROM ad_accounts WHERE user_id = $1 AND is_client_active = true`,
                [userId]
            );
            const syncedMetaIds = new Set(metaAccounts.map((a: any) => String(a.id).replace(/^act_/, '')));
            for (const dbAcc of allDbAccounts) {
                const rawId = String(dbAcc.meta_account_id).replace(/^act_/, '');
                if (syncedMetaIds.has(rawId)) continue; // já sincronizado acima
                try {
                    logger.info(`Syncing manually-added account not in Meta API list: ${dbAcc.meta_account_id}`);
                    const campaigns = await this.getCampaigns(userId, accessToken, dbAcc.meta_account_id);
                    for (const campaign of campaigns) {
                        const dbCampaign = await metaRepository.upsertCampaign(dbAcc.id, {
                            meta_campaign_id: campaign.id,
                            name: campaign.name,
                            objective: campaign.objective,
                            status: campaign.status,
                            daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : undefined,
                            lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : undefined,
                            created_time: campaign.created_time,
                        });
                        try {
                            const insights = await this.getCampaignInsights(
                                userId, accessToken, campaign.id, 'last_30d',
                                { since, until }
                            );
                            for (const insight of insights) {
                                await metaRepository.upsertInsight({
                                    campaign_id: dbCampaign.id,
                                    date: insight.date_start,
                                    spend: parseFloat(insight.spend || '0'),
                                    impressions: parseInt(insight.impressions || '0', 10),
                                    reach: parseInt(insight.reach || '0', 10),
                                    clicks: parseInt(insight.clicks || '0', 10),
                                    ctr: parseFloat(insight.ctr || '0'),
                                    cpc: parseFloat(insight.cpc || '0'),
                                    cpm: parseFloat(insight.cpm || '0'),
                                    frequency: parseFloat(insight.frequency || '0'),
                                    conversions: this.extractConversions(insight.actions),
                                    cost_per_conversion: this.extractCostPerConversion(insight.cost_per_action_type),
                                    roas: this.extractRoas(insight.purchase_roas),
                                    actions: insight.actions,
                                });
                            }
                        } catch { /* skip campaign insights */ }
                    }
                } catch (e: any) {
                    logger.warn(`Failed to sync manually-added account ${dbAcc.meta_account_id}`, { error: e.message });
                }
            }

            logger.info('Data sync completed', { userId });
        } catch (error: any) {
            logger.error('Data sync failed', { userId, error: error.message });
            throw error;
        }
    }

    // ---- Helper Methods ----

    // Priority order for "primary conversion" — picks the first non-zero match
    private static ACTION_PRIORITY = [
        // Ecommerce
        { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
        { type: 'purchase',                             label: 'Compras' },
        // Lead gen
        { type: 'offsite_conversion.fb_pixel_lead',     label: 'Leads' },
        { type: 'lead',                                 label: 'Leads' },
        { type: 'complete_registration',                label: 'Cadastros' },
        // Messaging (WhatsApp / Messenger)
        { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Conversas iniciadas' },
        { type: 'onsite_conversion.total_messaging_connection',        label: 'Conexões de mensagem' },
        { type: 'onsite_conversion.messaging_first_reply',             label: 'Primeiras respostas' },
        // Engagement
        { type: 'post_engagement',  label: 'Engajamentos' },
        { type: 'page_engagement',  label: 'Engajamentos' },
        { type: 'post_reaction',    label: 'Reações' },
        // Traffic / Video
        { type: 'link_click',       label: 'Cliques no link' },
        { type: 'video_view',       label: 'Visualizações de vídeo' },
        { type: 'thruplay',         label: 'ThruPlays' },
    ];

    extractPrimaryAction(actions?: any[]): { count: number; label: string; action_type: string } {
        if (!actions || actions.length === 0) return { count: 0, label: 'Conversões', action_type: '' };
        for (const priority of MetaService.ACTION_PRIORITY) {
            const match = actions.find((a: any) => a.action_type === priority.type);
            if (match && parseInt(match.value, 10) > 0) {
                return { count: parseInt(match.value, 10), label: priority.label, action_type: priority.type };
            }
        }
        return { count: 0, label: 'Conversões', action_type: '' };
    }

    private extractConversions(actions?: any[]): number {
        return this.extractPrimaryAction(actions).count;
    }

    private extractRoas(purchaseRoas?: any[]): number {
        if (!purchaseRoas || purchaseRoas.length === 0) return 0;
        return parseFloat(purchaseRoas[0].value || '0');
    }

    private extractCostPerConversion(costPerActionType?: any[]): number {
        if (!costPerActionType) return 0;
        for (const priority of MetaService.ACTION_PRIORITY) {
            const match = costPerActionType.find((a: any) => a.action_type === priority.type);
            if (match && parseFloat(match.value) > 0) return parseFloat(match.value);
        }
        return 0;
    }

    /**
     * Fetch account-level balance and status from Meta API.
     * Meta returns balance in cents for BRL — divide by 100.
     * account_status codes: 1=active, 2=disabled, 3=unsettled, 7=grace period, 9=pending closure
     */
    async getAccountBalance(
        userId: string,
        accessToken: string,
        metaAccountId: string
    ): Promise<{ balance: number; amount_spent: number; spend_cap: number; account_status: number; funding_source_details: any }> {
        const accountPath = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                const response = await client.get(`/${accountPath}`, {
                    params: {
                        fields: 'balance,spend_cap,amount_spent,account_status,funding_source_details',
                    },
                });
                const data = response.data;
                // Para contas com "Saldo disponível" (PIX/boleto BR, funding type=20),
                // o saldo real está em funding_source_details.display_string
                // Ex: "Saldo disponível (R$1.605,85 BRL)"
                let balance = 0;
                const displayString: string = data.funding_source_details?.display_string || '';
                const match = displayString.match(/R\$\s*([\d.]+,\d{2})/);
                if (match) {
                    // Converte formato BR "1.605,85" → 1605.85
                    balance = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                } else if (data.balance) {
                    // Fallback: campo balance em centavos (contas internacionais)
                    balance = parseFloat(data.balance) / 100;
                }
                const amountSpent = data.amount_spent ? parseFloat(data.amount_spent) / 100 : 0;
                const spendCap = data.spend_cap ? parseFloat(data.spend_cap) / 100 : 0;
                return {
                    balance,
                    amount_spent: amountSpent,
                    spend_cap: spendCap,
                    account_status: data.account_status ?? 1,
                    funding_source_details: data.funding_source_details ?? null,
                };
            } catch (error: any) {
                this.handleMetaError(error);
            }
        });
    }

    /**
     * Sync balances for a list of ad accounts and persist to the DB.
     * Called by the sync-balances endpoint and background workers.
     */
    async syncAccountBalances(
        userId: string,
        accessToken: string,
        accountIds: Array<{ id: string; meta_account_id: string }>
    ): Promise<void> {
        logger.info(`Syncing balances for ${accountIds.length} accounts`, { userId });

        for (const account of accountIds) {
            try {
                const result = await this.getAccountBalance(userId, accessToken, account.meta_account_id);
                await query(
                    `UPDATE ad_accounts
                     SET cached_balance = $1,
                         cached_account_status = $2,
                         cached_amount_spent = $3,
                         cached_spend_cap = $4,
                         balance_updated_at = NOW(),
                         updated_at = NOW()
                     WHERE id = $5 AND user_id = $6`,
                    [result.balance, result.account_status, result.amount_spent, result.spend_cap, account.id, userId]
                );
                logger.info(`Balance synced for account ${account.meta_account_id}`, {
                    balance: result.balance,
                    status: result.account_status,
                });
            } catch (err: any) {
                logger.warn(`Failed to sync balance for account ${account.meta_account_id}`, {
                    error: err.message,
                });
            }
        }

        logger.info('Balance sync completed', { userId });
    }

    private handleMetaError(error: any): never {
        const metaError = error?.response?.data?.error;
        if (metaError) {
            throw new MetaApiError(metaError.message, metaError.code);
        }
        throw new MetaApiError(error.message || 'Unknown Meta API error');
    }
}

export const metaService = new MetaService();
