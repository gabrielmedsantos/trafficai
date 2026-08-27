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
                    fields: 'id,name,status,daily_budget,targeting,optimization_goal,destination_type',
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
     * Pausa/ativa uma campanha no Meta. Usado pela tabela de Campanhas (toggle),
     * pela Automação (SE/ENTÃO) e pelo Agente de IA (ação sugerida aplicada).
     * Única função que muda status de campanha no Meta — não duplicar em outro arquivo.
     */
    async setCampaignStatus(userId: string, accessToken: string, metaCampaignId: string, status: 'PAUSED' | 'ACTIVE'): Promise<void> {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                await client.post(`/${metaCampaignId}`, null, { params: { status } });
            } catch (error: any) {
                this.handleMetaError(error);
            }
        });
    }

    /**
     * Ajusta o orçamento diário de uma campanha no Meta (valor em reais, convertido
     * pra centavos como a API exige). Usado pelo Agente de IA (ação sugerida aplicada).
     */
    async setCampaignDailyBudget(userId: string, accessToken: string, metaCampaignId: string, dailyBudgetReais: number): Promise<void> {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                const cents = Math.round(dailyBudgetReais * 100);
                await client.post(`/${metaCampaignId}`, null, { params: { daily_budget: cents } });
            } catch (error: any) {
                this.handleMetaError(error);
            }
        });
    }

    /**
     * Top ads da conta ordenados por spend nos últimos N dias.
     * Retorna cada ad com stats agregadas + thumbnail + video_id (se houver).
     * Usado pela análise de Top Criativos com IA.
     */
    async getTopAdsForAccount(
        userId: string,
        accessToken: string,
        metaAccountId: string,
        days: number = 30,
        limit: number = 10,
    ): Promise<any[]> {
        const acctPath = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
        return metaRateLimiter.executeWithRetry(userId, async () => {
            try {
                const client = this.createClient(accessToken);
                const preset = days <= 7 ? 'last_7d' : days <= 14 ? 'last_14d' : days <= 30 ? 'last_30d' : 'last_90d';

                // 1) insights level=ad ordenados por spend desc
                const insightsResp = await client.get(`/${acctPath}/insights`, {
                    params: {
                        level: 'ad',
                        fields: 'ad_id,ad_name,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type',
                        date_preset: preset,
                        limit,
                        sort: 'spend_descending',
                    },
                });
                const insights: any[] = insightsResp.data?.data || [];
                if (!insights.length) return [];

                // 2) buscar creative (thumbnail + video_id) pra cada top ad
                const ids = insights.map(i => i.ad_id).filter(Boolean);
                if (!ids.length) return insights;

                const creativesResp = await client.get('/', {
                    params: {
                        ids: ids.join(','),
                        fields: 'id,name,creative{id,name,object_type,thumbnail_url,image_url,video_id,instagram_permalink_url}',
                    },
                });
                const byId: Record<string, any> = creativesResp.data || {};

                return insights.map(ins => ({
                    ...ins,
                    creative: byId[ins.ad_id]?.creative || null,
                }));
            } catch (error: any) {
                this.handleMetaError(error);
                return [];
            }
        }) as Promise<any[]>;
    }

    /**
     * Sync das campanhas + insights de uma conta específica num período.
     * Usado por relatórios e pelo botão "Sincronizar" na UI.
     */
    async syncAccountForPeriod(userId: string, accessToken: string, dbAccountId: string, since: string, until: string): Promise<void> {
        const rows = await query<any>(
            `SELECT meta_account_id, account_name FROM ad_accounts WHERE id = $1`,
            [dbAccountId]
        );
        if (!rows.length) throw new Error('Conta não encontrada no banco');
        const { meta_account_id, account_name } = rows[0];

        logger.info(`sync on-demand: ${account_name}`, { dbAccountId, since, until });
        const r = await this.syncSingleAccount(userId, accessToken, dbAccountId, meta_account_id, since, until);
        logger.info(`sync on-demand: ${account_name} concluído`, r);
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
     * Busca insights com breakdowns pra segmentação (idade, gênero, plataforma, posição,
     * dispositivo, região). Retorna objeto agrupado por tipo de breakdown, pronto pra render.
     * Faz 4 chamadas paralelas — Meta não permite combinar todos os breakdowns num único query.
     */
    async getBreakdownInsights(
        userId: string,
        accessToken: string,
        metaAccountId: string,
        since: string,
        until: string
    ): Promise<{
        publisher_platform: Array<{ label: string; spend: number; impressions: number; conversions: number }>;
        platform_position: Array<{ label: string; spend: number; impressions: number; conversions: number }>;
        impression_device: Array<{ label: string; spend: number; impressions: number; conversions: number }>;
        age_gender: Array<{ label: string; spend: number; impressions: number; conversions: number; age: string; gender: string }>;
        region: Array<{ label: string; spend: number; impressions: number; conversions: number }>;
    }> {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            const client = this.createClient(accessToken);
            const acctPath = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;

            async function fetchBreakdown(breakdowns: string): Promise<any[]> {
                try {
                    const resp = await client.get(`/${acctPath}/insights`, {
                        params: {
                            level: 'account',
                            fields: 'spend,impressions,clicks,actions',
                            time_range: JSON.stringify({ since, until }),
                            breakdowns,
                            limit: 500,
                        },
                    });
                    return resp.data?.data || [];
                } catch (err: any) {
                    logger.warn(`breakdown ${breakdowns} falhou`, { error: err.message });
                    return [];
                }
            }

            function extractConversions(actions: any[] = []): number {
                const priority = [
                    'offsite_conversion.fb_pixel_purchase', 'purchase',
                    'offsite_conversion.fb_pixel_lead', 'lead',
                    'onsite_conversion.messaging_conversation_started_7d',
                    'link_click',
                ];
                for (const p of priority) {
                    const m = actions.find((a: any) => a.action_type === p);
                    if (m && parseInt(m.value, 10) > 0) return parseInt(m.value, 10);
                }
                return 0;
            }

            function normalize(rows: any[], keyFn: (r: any) => string) {
                const agg = new Map<string, { spend: number; impressions: number; conversions: number }>();
                for (const r of rows) {
                    const key = keyFn(r);
                    if (!key) continue;
                    const cur = agg.get(key) || { spend: 0, impressions: 0, conversions: 0 };
                    cur.spend += parseFloat(r.spend || '0');
                    cur.impressions += parseInt(r.impressions || '0', 10);
                    cur.conversions += extractConversions(r.actions);
                    agg.set(key, cur);
                }
                return Array.from(agg.entries())
                    .map(([label, v]) => ({ label, ...v }))
                    .sort((a, b) => b.spend - a.spend);
            }

            // 4 queries em paralelo — cada tipo de breakdown separado
            const [ppRows, positionRows, deviceRows, ageGenderRows, regionRows] = await Promise.all([
                fetchBreakdown('publisher_platform'),
                fetchBreakdown('publisher_platform,platform_position'),
                fetchBreakdown('impression_device'),
                fetchBreakdown('age,gender'),
                fetchBreakdown('region').catch(() => []),
            ]);

            // Age+gender precisa de tratamento especial (2 dims)
            const ageGender = ageGenderRows.map((r: any) => ({
                label: `${r.age} · ${r.gender === 'male' ? 'M' : r.gender === 'female' ? 'F' : 'Outros'}`,
                age: r.age,
                gender: r.gender,
                spend: parseFloat(r.spend || '0'),
                impressions: parseInt(r.impressions || '0', 10),
                conversions: extractConversions(r.actions),
            })).filter(x => x.spend > 0).sort((a, b) => b.spend - a.spend);

            return {
                publisher_platform: normalize(ppRows, r => r.publisher_platform || ''),
                platform_position: normalize(positionRows, r => r.platform_position || ''),
                impression_device: normalize(deviceRows, r => r.impression_device || ''),
                age_gender: ageGender,
                region: normalize(regionRows, r => r.region || '').slice(0, 15),
            };
        }) as any;
    }

    /**
     * Breakdowns POR CAMPANHA — retorna Map<campaign_id, breakdowns>.
     * Faz 4 chamadas paralelas (não por campanha) usando breakdowns=campaign_id + <dim>.
     */
    async getBreakdownInsightsByCampaign(
        userId: string,
        accessToken: string,
        metaAccountId: string,
        since: string,
        until: string
    ): Promise<Map<string, {
        publisher_platform: Array<{ label: string; spend: number; impressions: number; conversions: number }>;
        platform_position: Array<{ label: string; spend: number; impressions: number; conversions: number }>;
        impression_device: Array<{ label: string; spend: number; impressions: number; conversions: number }>;
        age_gender: Array<{ label: string; age: string; gender: string; spend: number; impressions: number; conversions: number }>;
        region: Array<{ label: string; spend: number; impressions: number; conversions: number }>;
    }>> {
        return metaRateLimiter.executeWithRetry(userId, async () => {
            const client = this.createClient(accessToken);
            const acctPath = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
            const map = new Map<string, any>();

            async function fetch(breakdowns: string): Promise<any[]> {
                try {
                    const resp = await client.get(`/${acctPath}/insights`, {
                        params: {
                            level: 'campaign',
                            fields: 'campaign_id,spend,impressions,actions',
                            time_range: JSON.stringify({ since, until }),
                            breakdowns,
                            limit: 500,
                        },
                    });
                    return resp.data?.data || [];
                } catch (err: any) {
                    logger.warn(`campaign breakdown ${breakdowns} falhou`, { error: err.message });
                    return [];
                }
            }
            function extractConversions(actions: any[] = []): number {
                const p = ['offsite_conversion.fb_pixel_purchase', 'purchase', 'offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.messaging_conversation_started_7d', 'link_click'];
                for (const t of p) {
                    const m = actions.find((a: any) => a.action_type === t);
                    if (m && parseInt(m.value, 10) > 0) return parseInt(m.value, 10);
                }
                return 0;
            }
            function agg(rows: any[], keyFn: (r: any) => string) {
                const byCampaign = new Map<string, Map<string, { spend: number; impressions: number; conversions: number }>>();
                for (const r of rows) {
                    const cid = r.campaign_id;
                    const k = keyFn(r);
                    if (!cid || !k) continue;
                    if (!byCampaign.has(cid)) byCampaign.set(cid, new Map());
                    const inner = byCampaign.get(cid)!;
                    const cur = inner.get(k) || { spend: 0, impressions: 0, conversions: 0 };
                    cur.spend += parseFloat(r.spend || '0');
                    cur.impressions += parseInt(r.impressions || '0', 10);
                    cur.conversions += extractConversions(r.actions);
                    inner.set(k, cur);
                }
                return byCampaign;
            }

            const [ppRows, posRows, devRows, agRows, regRows] = await Promise.all([
                fetch('publisher_platform'),
                fetch('publisher_platform,platform_position'),
                fetch('impression_device'),
                fetch('age,gender'),
                fetch('region').catch(() => []),
            ]);

            const ppByC = agg(ppRows, r => r.publisher_platform || '');
            const posByC = agg(posRows, r => r.platform_position || '');
            const devByC = agg(devRows, r => r.impression_device || '');
            const regByC = agg(regRows, r => r.region || '');

            const agByC = new Map<string, Array<any>>();
            for (const r of agRows) {
                const cid = r.campaign_id;
                if (!cid || !r.age) continue;
                if (!agByC.has(cid)) agByC.set(cid, []);
                agByC.get(cid)!.push({
                    label: `${r.age} · ${r.gender === 'male' ? 'M' : r.gender === 'female' ? 'F' : 'Outros'}`,
                    age: r.age, gender: r.gender,
                    spend: parseFloat(r.spend || '0'),
                    impressions: parseInt(r.impressions || '0', 10),
                    conversions: extractConversions(r.actions),
                });
            }

            const allCids = new Set([...ppByC.keys(), ...posByC.keys(), ...devByC.keys(), ...regByC.keys(), ...agByC.keys()]);
            for (const cid of allCids) {
                map.set(cid, {
                    publisher_platform: Array.from((ppByC.get(cid) || new Map()).entries()).map(([label, v]: any) => ({ label, ...v })).sort((a, b) => b.spend - a.spend),
                    platform_position: Array.from((posByC.get(cid) || new Map()).entries()).map(([label, v]: any) => ({ label, ...v })).sort((a, b) => b.spend - a.spend),
                    impression_device: Array.from((devByC.get(cid) || new Map()).entries()).map(([label, v]: any) => ({ label, ...v })).sort((a, b) => b.spend - a.spend),
                    age_gender: (agByC.get(cid) || []).filter(x => x.spend > 0).sort((a, b) => b.spend - a.spend),
                    region: Array.from((regByC.get(cid) || new Map()).entries()).map(([label, v]: any) => ({ label, ...v })).sort((a, b) => b.spend - a.spend).slice(0, 10),
                });
            }

            return map;
        }) as any;
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
                    // Pega múltiplas fontes de imagem — a maioria delas retorna resoluções maiores
                    // que thumbnail_url (~64px). Prioridade: full_picture > object_story > asset_feed > image_url > thumbnail.
                    const ads = await this.fetchAllPages(client, `/${acctPath}/ads`, {
                        fields: 'id,creative{thumbnail_url,image_url,object_story_spec{link_data{picture,image_hash},video_data{image_url}},asset_feed_spec{images{url}},image_hash,effective_object_story_id}',
                        filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: slice }]),
                    });
                    for (const ad of ads) {
                        const cre = ad.creative || {};
                        const oss = cre.object_story_spec || {};
                        const afs = cre.asset_feed_spec || {};
                        // Prioridade: PRIMEIRO CDN público (scontent.fbcdn.net), depois fallbacks.
                        // asset_feed_spec + object_story link_data retornam facebook.com/ads/image/?d=... que exige LOGIN,
                        // então só usa se não tiver melhor.
                        const candidates: string[] = [
                            cre.image_url,                                               // scontent CDN público
                            cre.thumbnail_url,                                           // scontent CDN público (menor res)
                            oss.video_data?.image_url,                                   // video thumbnail
                            Array.isArray(afs.images) ? afs.images[0]?.url : null,       // fallback (auth-required)
                            oss.link_data?.picture,                                      // fallback (auth-required)
                        ].filter(Boolean);
                        // Preferir scontent (público) sobre facebook.com/ads/image (privado)
                        const publicCdn = candidates.find(u => u && u.includes('scontent') && !u.includes('facebook.com/ads/image'));
                        const thumb = publicCdn || candidates[0];
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
     * Busca tipo de criativo (imagem/vídeo) + link do post original de cada anúncio.
     * Usado pro relatório público mostrar "Assistir" em anúncios de vídeo, abrindo o
     * post real no Instagram/Facebook (não dá pra embutir o vídeo direto — a CDN da
     * Meta exige assinatura/expira).
     */
    async getAdVideoInfo(
        userId: string,
        accessToken: string,
        metaAccountId: string,
        adIds: string[]
    ): Promise<Map<string, { object_type?: string; video_id?: string; permalink_url?: string }>> {
        const info = new Map<string, { object_type?: string; video_id?: string; permalink_url?: string }>();
        if (!adIds.length) return info;

        return metaRateLimiter.executeWithRetry(userId, async () => {
            const client = this.createClient(accessToken);
            const acctPath = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
            const BATCH = 50;
            for (let i = 0; i < adIds.length; i += BATCH) {
                const slice = adIds.slice(i, i + BATCH);
                try {
                    const ads = await this.fetchAllPages(client, `/${acctPath}/ads`, {
                        fields: 'id,creative{object_type,video_id,instagram_permalink_url,effective_object_story_id}',
                        filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: slice }]),
                    });
                    for (const ad of ads) {
                        const cre = ad.creative || {};
                        info.set(ad.id, {
                            object_type: cre.object_type,
                            video_id: cre.video_id,
                            permalink_url: cre.instagram_permalink_url
                                || (cre.effective_object_story_id ? `https://www.facebook.com/${cre.effective_object_story_id}` : undefined),
                        });
                    }
                } catch (err: any) {
                    logger.warn('Failed to fetch ad video info batch', { error: err.message });
                }
            }
            return info;
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
     * Sync insights de uma única conta (identificada pelo meta_account_id).
     * Usado por syncUserData e sync-account (on-demand).
     * Atualiza ad_accounts.last_insights_sync_at no final.
     */
    async syncSingleAccount(
        userId: string,
        accessToken: string,
        dbAccountId: string,
        metaAccountId: string,
        since: string,
        until: string
    ): Promise<{ campaigns: number; insights: number; errors: number }> {
        let campaignsSynced = 0;
        let insightsSynced = 0;
        let errors = 0;

        const campaigns = await this.getCampaigns(userId, accessToken, metaAccountId);
        campaignsSynced = campaigns.length;

        for (const campaign of campaigns) {
            let dbCampaign = await metaRepository.upsertCampaign(dbAccountId, {
                meta_campaign_id: campaign.id,
                name: campaign.name,
                objective: campaign.objective,
                status: campaign.status,
                daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : undefined,
                lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : undefined,
                created_time: campaign.created_time,
            });

            // Optimization goal/destination (ex: "Visitas ao perfil" numa campanha de
            // Tráfego) só existe no ad set, não na campanha — busca 1x e guarda; nos
            // próximos syncs pula essa chamada extra pra Meta (raramente muda depois
            // de criado).
            if (!dbCampaign.optimization_goal) {
                try {
                    const adSets = await this.getAdSets(userId, accessToken, campaign.id);
                    const primary = adSets?.[0];
                    if (primary?.optimization_goal || primary?.destination_type) {
                        dbCampaign = await metaRepository.upsertCampaign(dbAccountId, {
                            meta_campaign_id: campaign.id,
                            name: campaign.name,
                            objective: campaign.objective,
                            status: campaign.status,
                            optimization_goal: primary.optimization_goal,
                            destination_type: primary.destination_type,
                        });
                    }
                } catch (err: any) {
                    logger.warn(`Falha ao buscar optimization_goal (campanha ${campaign.id})`, { error: err.message });
                }
            }

            try {
                const insights = await this.getCampaignInsights(
                    userId, accessToken, campaign.id, 'last_30d', { since, until }
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
                        conversions: this.extractConversions(insight.actions, campaign.objective),
                        cost_per_conversion: this.extractCostPerConversion(insight.cost_per_action_type, campaign.objective),
                        roas: this.extractRoas(insight.purchase_roas),
                        actions: insight.actions,
                    });
                    insightsSynced++;
                }
            } catch (err: any) {
                errors++;
                logger.warn('sync: insights falharam para campanha', {
                    campaignId: campaign.id, accountId: metaAccountId, error: err.message,
                });
            }
        }

        // Atualiza last_insights_sync_at
        await query(
            `UPDATE ad_accounts SET last_insights_sync_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [dbAccountId]
        );

        return { campaigns: campaignsSynced, insights: insightsSynced, errors };
    }

    /**
     * Sync em duas fases:
     *   Fase 1 — Discovery (leve): lista contas do Meta API e faz upsert em `ad_accounts`.
     *            Mantém a lista atualizada sem baixar insights de centenas de contas.
     *   Fase 2 — Sync dirigido: baixa campanhas + insights apenas das contas marcadas
     *            como `is_client_active = true`. Isso evita estourar o rate-limit da
     *            Meta quando o admin tem acesso a centenas de contas via BM.
     *
     * O sync da Fase 2 itera sequencialmente por conta (não em paralelo) para não
     * disparar muitas requisições simultâneas.
     */
    async syncUserData(userId: string, accessToken: string, daysBack: number = 35): Promise<void> {
        const started = Date.now();
        logger.info('sync: iniciando', { userId, daysBack });

        // Janela absoluta
        const now = new Date();
        const until = now.toISOString().split('T')[0];
        const sinceDate = new Date(now);
        sinceDate.setDate(sinceDate.getDate() - (daysBack - 1));
        const since = sinceDate.toISOString().split('T')[0];

        try {
            // ── FASE 1 — Discovery: upsert todas as contas (sem campanhas) ─────
            let discovered = 0;
            try {
                const metaAccounts = await this.getAdAccounts(userId, accessToken);
                for (const account of metaAccounts) {
                    await metaRepository.upsertAdAccount(userId, {
                        meta_account_id: account.id,
                        account_name: account.name,
                        currency: account.currency || 'BRL',
                        timezone: account.timezone_name || 'America/Sao_Paulo',
                    });
                    discovered++;
                }
                logger.info(`sync: descoberta concluída`, { userId, discovered });
            } catch (err: any) {
                logger.warn('sync: falha na fase de descoberta, seguindo com contas do banco', { error: err.message });
            }

            // ── FASE 2 — Sync apenas das contas ATIVAS ────────────────────────
            const activeAccounts = await query<any>(
                `SELECT id, meta_account_id, account_name
                 FROM ad_accounts
                 WHERE user_id = $1 AND is_client_active = true
                 ORDER BY last_insights_sync_at NULLS FIRST, account_name`,
                [userId]
            );

            if (activeAccounts.length === 0) {
                logger.info('sync: nenhuma conta ativa — nada para sincronizar', { userId });
                return;
            }

            logger.info(`sync: sincronizando ${activeAccounts.length} conta(s) ativa(s)`, { userId });

            let totalCampaigns = 0;
            let totalInsights = 0;
            let accountsOk = 0;
            let accountsFailed = 0;

            for (const acc of activeAccounts) {
                try {
                    const r = await this.syncSingleAccount(
                        userId, accessToken, acc.id, acc.meta_account_id, since, until
                    );
                    totalCampaigns += r.campaigns;
                    totalInsights += r.insights;
                    accountsOk++;
                    logger.info(`sync: ${acc.account_name} OK`, {
                        accountId: acc.meta_account_id,
                        campaigns: r.campaigns,
                        insights: r.insights,
                        errors: r.errors,
                    });
                } catch (err: any) {
                    accountsFailed++;
                    logger.error(`sync: ${acc.account_name} FALHOU`, {
                        accountId: acc.meta_account_id,
                        error: err.message,
                    });
                }
            }

            const duration = Math.round((Date.now() - started) / 1000);
            logger.info('sync: concluído', {
                userId,
                duration_s: duration,
                discovered,
                accounts_ok: accountsOk,
                accounts_failed: accountsFailed,
                total_campaigns: totalCampaigns,
                total_insights: totalInsights,
            });
        } catch (error: any) {
            logger.error('sync: falhou completamente', { userId, error: error.message });
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

    /**
     * Mapeia objective da campanha → tipos de action que representam o "Resultado"
     * no Gerenciador da Meta. Ordem importa (primeiro com valor > 0 vence).
     * Campanhas de mensagem precisam priorizar messaging_conversation_started_7d
     * antes de tipos genéricos como `lead` (que o Meta retorna pra todo tipo de conversão).
     */
    private static OBJECTIVE_PRIORITY: Record<string, { type: string; label: string }[]> = {
        // Messaging (WhatsApp / Messenger) — Resultados = "Conversas iniciadas"
        OUTCOME_ENGAGEMENT: [
            { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Conversas iniciadas' },
            { type: 'onsite_conversion.total_messaging_connection',        label: 'Conexões de mensagem' },
            { type: 'onsite_conversion.messaging_first_reply',             label: 'Primeiras respostas' },
            { type: 'post_engagement',  label: 'Engajamentos' },
        ],
        MESSAGES: [
            { type: 'onsite_conversion.messaging_conversation_started_7d', label: 'Conversas iniciadas' },
            { type: 'onsite_conversion.total_messaging_connection',        label: 'Conexões de mensagem' },
        ],
        // Lead-gen
        OUTCOME_LEADS: [
            { type: 'offsite_conversion.fb_pixel_lead', label: 'Leads' },
            { type: 'lead',                             label: 'Leads' },
            { type: 'onsite_conversion.lead',           label: 'Leads' },
            { type: 'complete_registration',            label: 'Cadastros' },
        ],
        LEAD_GENERATION: [
            { type: 'offsite_conversion.fb_pixel_lead', label: 'Leads' },
            { type: 'lead',                             label: 'Leads' },
        ],
        // Sales / Conversions
        OUTCOME_SALES: [
            { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
            { type: 'purchase',                             label: 'Compras' },
            { type: 'onsite_conversion.purchase',           label: 'Compras' },
            { type: 'omni_purchase',                        label: 'Compras' },
        ],
        CONVERSIONS: [
            { type: 'offsite_conversion.fb_pixel_purchase', label: 'Compras' },
            { type: 'purchase',                             label: 'Compras' },
        ],
        // Traffic / Awareness / Video
        OUTCOME_TRAFFIC: [
            { type: 'link_click', label: 'Cliques no link' },
        ],
        OUTCOME_AWARENESS: [
            { type: 'post_engagement', label: 'Engajamentos' },
            { type: 'video_view',      label: 'Visualizações de vídeo' },
        ],
        VIDEO_VIEWS: [
            { type: 'video_view', label: 'Visualizações de vídeo' },
            { type: 'thruplay',   label: 'ThruPlays' },
        ],
    };

    /**
     * Mapeia optimization_goal do AD SET (mais específico que o objective da campanha)
     * → tipo de action + label. Ex: campanha de Tráfego (objective=OUTCOME_TRAFFIC)
     * cujo ad set otimiza pra "Visitas ao perfil" — o Meta conta isso como link_click
     * nas actions[], mas o resultado exibido no Gerenciador é "Visitas ao perfil",
     * não "Cliques no link". Checado ANTES do objective por ser mais específico.
     */
    private static OPTIMIZATION_GOAL_PRIORITY: Record<string, { type: string; label: string }[]> = {
        PROFILE_VISIT: [
            { type: 'link_click', label: 'Visitas ao perfil' },
        ],
    };

    extractPrimaryAction(actions?: any[], objective?: string, optimizationGoal?: string): { count: number; label: string; action_type: string } {
        if (!actions || actions.length === 0) return { count: 0, label: 'Conversões', action_type: '' };
        // 0) Prioridade do optimization_goal do ad set (mais específico que o objective)
        const goalList = optimizationGoal ? MetaService.OPTIMIZATION_GOAL_PRIORITY[optimizationGoal] : null;
        if (goalList) {
            for (const priority of goalList) {
                const match = actions.find((a: any) => a.action_type === priority.type);
                if (match && parseInt(match.value, 10) > 0) {
                    return { count: parseInt(match.value, 10), label: priority.label, action_type: priority.type };
                }
            }
        }
        // 1) Prioridade específica do objetivo da campanha (se conhecido)
        const objList = objective ? MetaService.OBJECTIVE_PRIORITY[objective] : null;
        if (objList) {
            for (const priority of objList) {
                const match = actions.find((a: any) => a.action_type === priority.type);
                if (match && parseInt(match.value, 10) > 0) {
                    return { count: parseInt(match.value, 10), label: priority.label, action_type: priority.type };
                }
            }
        }
        // 2) Fallback: lista global (mantém compat com objetivos não mapeados)
        for (const priority of MetaService.ACTION_PRIORITY) {
            const match = actions.find((a: any) => a.action_type === priority.type);
            if (match && parseInt(match.value, 10) > 0) {
                return { count: parseInt(match.value, 10), label: priority.label, action_type: priority.type };
            }
        }
        return { count: 0, label: 'Conversões', action_type: '' };
    }

    private extractConversions(actions?: any[], objective?: string): number {
        return this.extractPrimaryAction(actions, objective).count;
    }

    private extractRoas(purchaseRoas?: any[]): number {
        if (!purchaseRoas || purchaseRoas.length === 0) return 0;
        return parseFloat(purchaseRoas[0].value || '0');
    }

    private extractCostPerConversion(costPerActionType?: any[], objective?: string): number {
        if (!costPerActionType) return 0;
        const objList = objective ? MetaService.OBJECTIVE_PRIORITY[objective] : null;
        if (objList) {
            for (const priority of objList) {
                const match = costPerActionType.find((a: any) => a.action_type === priority.type);
                if (match && parseFloat(match.value) > 0) return parseFloat(match.value);
            }
        }
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
