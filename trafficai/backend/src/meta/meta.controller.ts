// ==============================
// TrafficAI — Meta Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { metaService } from './meta.service';
import { metaRepository } from './meta.repository';
import { authRepository } from '../auth/auth.repository';
import { AppError } from '../shared/errors';
import { query } from '../database/connection';
import { requireCapability } from '../team/capabilities';
import { recordAudit } from '../audit/audit.service';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * Helper: get user's access token or throw
 */
async function getAccessToken(userId: string): Promise<string> {
    const user = await authRepository.findById(userId);
    if (!user?.access_token) {
        throw new AppError('Meta account not connected. Please connect your Meta account first.', 400);
    }
    if (user.token_expiration && new Date(user.token_expiration) < new Date()) {
        throw new AppError('Meta token expired. Please reconnect your Meta account.', 401);
    }
    return user.access_token;
}

/**
 * GET /meta/ad-accounts
 */
router.get('/ad-accounts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const accessToken = await getAccessToken(userId);
        const accounts = await metaService.getAdAccounts(userId, accessToken);
        res.json({ success: true, data: accounts });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/campaigns?account_id=xxx&live=true
 */
router.get('/campaigns', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { account_id, live, since, until } = req.query;

        // Force fetch from Meta (live)
        if (account_id && live === 'true') {
            const accessToken = await getAccessToken(userId);
            const campaigns = await metaService.getCampaigns(userId, accessToken, account_id as string);
            return res.json({ success: true, data: campaigns });
        }

        // Com período: campanhas + métricas agregadas (tabela de Campanhas)
        if (since && until) {
            const rows = account_id
                ? await metaRepository.getCampaignsByAccountWithMetrics(account_id as string, since as string, until as string)
                : await metaRepository.getCampaignsByUserWithMetrics(userId, since as string, until as string);

            const campaigns = rows.map((c: any) => {
                const mergedActions = new Map<string, number>();
                for (const dayActions of (c.actions_by_day || [])) {
                    const acts: any[] = Array.isArray(dayActions) ? dayActions : [];
                    for (const a of acts) {
                        const v = parseInt(a.value || '0', 10);
                        mergedActions.set(a.action_type, (mergedActions.get(a.action_type) || 0) + v);
                    }
                }
                const actionsArr = Array.from(mergedActions.entries()).map(([action_type, value]) => ({ action_type, value: String(value) }));
                const { count, label } = metaService.extractPrimaryAction(actionsArr, c.objective, c.optimization_goal);
                const spend = Number(c.spend) || 0;
                return {
                    ...c,
                    spend,
                    impressions: Number(c.impressions) || 0,
                    clicks: Number(c.clicks) || 0,
                    roas: c.roas != null ? Number(c.roas) : 0,
                    results: count,
                    result_label: label,
                    cost_per_result: count > 0 ? spend / count : 0,
                    actions_by_day: undefined,
                };
            });

            return res.json({ success: true, data: campaigns });
        }

        // Return locally stored campaigns (filtered by account or all for user)
        let campaigns;
        if (account_id) {
            campaigns = await metaRepository.getCampaignsByAccount(account_id as string);
        } else {
            campaigns = await metaRepository.getCampaignsByUser(userId);
        }

        res.json({ success: true, data: campaigns });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /meta/campaigns/:id/status — pausa/ativa uma campanha no Meta.
 * Usado pelo toggle na tabela de Campanhas, pela Automação e pelo Agente de IA.
 */
router.patch('/campaigns/:id/status', requireCapability('meta_campaigns'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;
        const { status } = req.body as { status: 'ACTIVE' | 'PAUSED' };
        if (status !== 'ACTIVE' && status !== 'PAUSED') {
            throw new AppError('status deve ser ACTIVE ou PAUSED', 400);
        }

        const campaign = await metaRepository.getCampaignById(id);
        if (!campaign) throw new AppError('Campanha não encontrada', 404);

        const accessToken = await getAccessToken(userId);
        await metaService.setCampaignStatus(userId, accessToken, campaign.meta_campaign_id, status);
        await query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

        recordAudit({
            userId,
            action: 'campaign.status_changed',
            entityType: 'meta_campaign',
            entityId: id,
            entityLabel: campaign.name,
            details: { status, previous_status: campaign.status },
        });

        res.json({ success: true, data: { id, status } });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/adsets?campaign_id=xxx
 */
router.get('/adsets', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { campaign_id } = req.query;
        if (!campaign_id) {
            throw new AppError('campaign_id is required', 400);
        }
        const accessToken = await getAccessToken(userId);
        const adsets = await metaService.getAdSets(userId, accessToken, campaign_id as string);
        res.json({ success: true, data: adsets });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/ads?campaign_id=xxx
 */
router.get('/ads', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { campaign_id } = req.query;
        if (!campaign_id) {
            throw new AppError('campaign_id is required', 400);
        }
        const accessToken = await getAccessToken(userId);
        const ads = await metaService.getAds(userId, accessToken, campaign_id as string);
        res.json({ success: true, data: ads });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/insights?campaign_id=xxx&date_preset=last_30d
 * Ou:     /meta/insights?campaign_id=xxx&since=YYYY-MM-DD&until=YYYY-MM-DD
 */
router.get('/insights', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { campaign_id, date_preset, since, until } = req.query;
        if (!campaign_id) {
            throw new AppError('campaign_id is required', 400);
        }
        const accessToken = await getAccessToken(userId);
        const timeRange = (since && until) ? { since: since as string, until: until as string } : undefined;
        const insights = await metaService.getCampaignInsights(
            userId,
            accessToken,
            campaign_id as string,
            (date_preset as string) || 'last_30d',
            timeRange
        );
        res.json({ success: true, data: insights });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/local/accounts — stored accounts from DB
 */
router.get('/local/accounts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accounts = await metaRepository.getAdAccountsByUser(req.user!.userId);
        res.json({ success: true, data: accounts });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/local/insights?campaign_id=xxx&since=YYYY-MM-DD&until=YYYY-MM-DD
 * Se since/until forem enviados, retorna TODAS as linhas do intervalo — sem limite.
 * Se não, o limit padrão é alto (10000) para cobrir até ~27 anos de dados diários.
 */
router.get('/local/insights', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { campaign_id, limit, since, until } = req.query;
        if (!campaign_id) {
            throw new AppError('campaign_id is required', 400);
        }
        const insights = await metaRepository.getInsightsByCampaign(
            campaign_id as string,
            parseInt(limit as string, 10) || 10000,
            since as string | undefined,
            until as string | undefined
        );
        res.json({ success: true, data: insights });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /meta/sync — trigger manual sync (janela absoluta de days_back dias)
 */
router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { days_back = 35 } = req.body;
        const accessToken = await getAccessToken(userId);
        await metaService.syncUserData(userId, accessToken, parseInt(days_back, 10));
        res.json({ success: true, message: 'Sync completed successfully' });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /meta/sync-account — sincroniza uma conta específica para um período
 */
router.post('/sync-account', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { account_id, since, until } = req.body;
        if (!account_id || !since || !until) {
            return res.status(400).json({ success: false, error: { message: 'account_id, since e until são obrigatórios' } });
        }
        const accessToken = await getAccessToken(userId);
        await metaService.syncAccountForPeriod(userId, accessToken, account_id, since, until);
        res.json({ success: true, message: 'Sincronização concluída' });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /meta/accounts/:accountId/client-status
 * Atualiza o status de cliente ativo de uma conta
 */
router.patch('/accounts/:accountId/client-status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { accountId } = req.params;
        const { is_client_active, client_notes } = req.body;

        if (typeof is_client_active !== 'boolean') {
            throw new AppError('is_client_active deve ser true ou false', 400);
        }

        await metaRepository.updateClientStatus(accountId, userId, is_client_active, client_notes);
        res.json({
            success: true,
            message: is_client_active ? 'Conta marcada como cliente ativo' : 'Conta marcada como cliente inativo'
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /meta/accounts/deactivate-all — desativa todas as contas do usuário
 */
router.post('/accounts/deactivate-all', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        await query(
            `UPDATE ad_accounts SET is_client_active = false, updated_at = NOW() WHERE user_id = $1`,
            [userId]
        );
        res.json({ success: true, message: 'Todas as contas foram desativadas' });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /meta/accounts/add-manual — adiciona conta manualmente pelo ID do Meta
 */
router.post('/accounts/add-manual', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { meta_account_id, account_name } = req.body;

        // Hard-block: verifica limite de clientes do plano
        const { canAddClient } = await import('../billing/stripe.service');
        const check = await canAddClient(userId);
        if (!check.ok) {
            return res.status(402).json({
                success: false,
                error: { message: check.reason, code: 402, upgrade_plan: check.upgrade_plan },
            });
        }

        if (!meta_account_id || !account_name) {
            throw new AppError('meta_account_id e account_name são obrigatórios', 400);
        }

        // Normaliza o ID para sempre ter o prefixo "act_" (igual ao auto-sync)
        const rawId = String(meta_account_id).replace(/^act_/, '').trim();
        const normalizedId = `act_${rawId}`;

        // Verifica se já existe (com ou sem prefixo)
        const existing = await query<any>(
            `SELECT id FROM ad_accounts WHERE user_id = $1 AND (meta_account_id = $2 OR meta_account_id = $3)`,
            [userId, normalizedId, rawId]
        );
        if (existing.length > 0) {
            return res.status(409).json({ success: false, error: { message: 'Conta já cadastrada' } });
        }

        const rows = await query<any>(
            `INSERT INTO ad_accounts (user_id, meta_account_id, account_name, currency, is_client_active)
             VALUES ($1, $2, $3, 'BRL', true)
             RETURNING *`,
            [userId, normalizedId, account_name.trim()]
        );

        res.json({ success: true, data: rows[0], message: 'Conta adicionada com sucesso' });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /meta/accounts/:accountId/billing
 * Atualiza o tipo de pagamento e threshold de alerta de saldo de uma conta
 */
router.patch('/accounts/:accountId/billing', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { accountId } = req.params;
        const { payment_type, balance_alert_threshold } = req.body;

        if (payment_type !== undefined && payment_type !== 'pix' && payment_type !== 'card') {
            throw new AppError("payment_type deve ser 'pix' ou 'card'", 400);
        }

        if (balance_alert_threshold !== undefined && (typeof balance_alert_threshold !== 'number' || balance_alert_threshold < 0)) {
            throw new AppError('balance_alert_threshold deve ser um número não negativo', 400);
        }

        await query(
            `UPDATE ad_accounts
             SET payment_type = COALESCE($1, payment_type),
                 balance_alert_threshold = COALESCE($2::decimal, balance_alert_threshold),
                 updated_at = NOW()
             WHERE id = $3 AND user_id = $4`,
            [
                payment_type ?? null,
                balance_alert_threshold != null ? balance_alert_threshold : null,
                accountId,
                userId,
            ]
        );

        res.json({ success: true, message: 'Configurações de cobrança atualizadas' });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /meta/accounts/sync-balances
 * Busca saldo atualizado da API do Meta para todas as contas ativas do usuário
 */
router.post('/accounts/sync-balances', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const accessToken = await getAccessToken(userId);

        const accounts = await query<{ id: string; meta_account_id: string }>(
            `SELECT id, meta_account_id FROM ad_accounts WHERE user_id = $1 AND is_client_active = true`,
            [userId]
        );

        if (accounts.length === 0) {
            return res.json({ success: true, data: { message: 'Nenhuma conta ativa encontrada', synced: 0 } });
        }

        await metaService.syncAccountBalances(userId, accessToken, accounts);

        res.json({
            success: true,
            data: {
                message: `Saldo sincronizado para ${accounts.length} conta(s)`,
                synced: accounts.length,
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/debug/accounts — diagnóstico: retorna o que a API do Meta retorna diretamente
 */
router.get('/debug/accounts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const user = await authRepository.findById(userId);
        if (!user?.access_token) {
            return res.json({ success: false, error: 'Token não encontrado' });
        }
        const axios = require('axios');
        const token = user.access_token;
        const BASE = 'https://graph.facebook.com/v19.0';
        const result: any = { personal: [], businesses: [], owned: {}, client: {}, errors: [] };

        try {
            const r = await axios.get(`${BASE}/me/adaccounts`, { params: { access_token: token, fields: 'id,name,account_status', limit: 500 } });
            result.personal = r.data.data || [];
        } catch (e: any) {
            result.errors.push({ source: 'personal', error: e.response?.data || e.message });
        }

        try {
            const r = await axios.get(`${BASE}/me/businesses`, { params: { access_token: token, fields: 'id,name', limit: 100 } });
            result.businesses = r.data.data || [];
        } catch (e: any) {
            result.errors.push({ source: 'businesses', error: e.response?.data || e.message });
        }

        for (const biz of result.businesses) {
            try {
                const r = await axios.get(`${BASE}/${biz.id}/owned_ad_accounts`, { params: { access_token: token, fields: 'id,name,account_status', limit: 500 } });
                result.owned[biz.name] = r.data.data || [];
            } catch (e: any) {
                result.errors.push({ source: `owned:${biz.name}`, error: e.response?.data || e.message });
            }
            try {
                const r = await axios.get(`${BASE}/${biz.id}/client_ad_accounts`, { params: { access_token: token, fields: 'id,name,account_status', limit: 500 } });
                result.client[biz.name] = r.data.data || [];
            } catch (e: any) {
                result.errors.push({ source: `client:${biz.name}`, error: e.response?.data || e.message });
            }
        }

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/validate/:accountId?since=YYYY-MM-DD&until=YYYY-MM-DD
 * Compara o spend agregado do DB (soma de insights_history) com o spend
 * retornado diretamente no nível da conta pela Meta API. Se divergirem
 * muito, provavelmente há campanhas não sincronizadas ou insights faltando.
 */
router.get('/validate/:accountId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { accountId } = req.params;
        const { since, until } = req.query as any;
        if (!since || !until) {
            throw new AppError('since e until (YYYY-MM-DD) são obrigatórios', 400);
        }

        const rows = await query<any>(
            `SELECT id, meta_account_id, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2`,
            [accountId, userId]
        );
        if (!rows.length) throw new AppError('Conta não encontrada', 404);
        const account = rows[0];

        const dbAgg = await query<any>(
            `SELECT COALESCE(SUM(ih.spend), 0) as spend,
                    COALESCE(SUM(ih.impressions), 0) as impressions,
                    COALESCE(SUM(ih.clicks), 0) as clicks,
                    COUNT(DISTINCT c.id) as campaigns_with_data,
                    COUNT(*) as insight_rows
             FROM insights_history ih
             JOIN campaigns c ON ih.campaign_id = c.id
             WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3`,
            [accountId, since, until]
        );
        const db = dbAgg[0];
        const dbSpend = parseFloat(db.spend) || 0;

        const accessToken = await getAccessToken(userId);
        const meta = await metaService.getAccountLevelSpend(userId, accessToken, account.meta_account_id, since, until);

        const delta = meta.spend - dbSpend;
        const deltaPct = meta.spend > 0 ? (delta / meta.spend) * 100 : 0;
        const isAccurate = Math.abs(deltaPct) <= 1; // tolerância de 1%

        res.json({
            success: true,
            data: {
                account: { id: account.id, meta_account_id: account.meta_account_id, name: account.account_name },
                period: { since, until },
                db: {
                    spend: dbSpend,
                    impressions: parseInt(db.impressions) || 0,
                    clicks: parseInt(db.clicks) || 0,
                    campaigns_with_data: parseInt(db.campaigns_with_data) || 0,
                    insight_rows: parseInt(db.insight_rows) || 0,
                },
                meta_account_level: meta,
                delta: {
                    spend_absolute: Number(delta.toFixed(2)),
                    spend_pct: Number(deltaPct.toFixed(2)),
                },
                is_accurate: isAccurate,
                recommendation: isAccurate
                    ? 'Dados consistentes com a Meta.'
                    : 'Divergência detectada — rode POST /meta/sync-account para esse período.',
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /meta/validate/:accountId/fix — re-sincroniza e valida novamente
 */
router.post('/validate/:accountId/fix', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { accountId } = req.params;
        const { since, until } = req.body;
        if (!since || !until) {
            throw new AppError('since e until (YYYY-MM-DD) são obrigatórios', 400);
        }
        const accessToken = await getAccessToken(userId);
        await metaService.syncAccountForPeriod(userId, accessToken, accountId, since, until);
        res.json({ success: true, message: 'Sincronização forçada concluída. Valide novamente em GET /meta/validate.' });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/debug/account/:accountId — diagnóstico completo de uma conta
 */
router.get('/debug/account/:accountId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { accountId } = req.params;
        const { since = '2026-03-01', until = '2026-03-30' } = req.query as any;

        // 1. Conta no banco
        const accountRows = await query<any>(
            `SELECT id, meta_account_id, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2`,
            [accountId, userId]
        );
        if (!accountRows.length) return res.json({ success: false, error: 'Conta não encontrada no banco' });
        const account = accountRows[0];

        // 2. Campanhas no banco
        const campaigns = await query<any>(
            `SELECT id, meta_campaign_id, name, status FROM campaigns WHERE account_id = $1`,
            [accountId]
        );

        // 3. Insights no banco para o período
        const insightsCount = await query<any>(
            `SELECT COUNT(*) as total, SUM(spend) as total_spend
             FROM insights_history ih
             JOIN campaigns c ON ih.campaign_id = c.id
             WHERE c.account_id = $1 AND ih.date >= $2 AND ih.date <= $3`,
            [accountId, since, until]
        );

        // 4. Live Meta — campanhas diretamente da API
        let liveCampaigns: any[] = [];
        let liveError: string | null = null;
        try {
            const accessToken = await getAccessToken(userId);
            liveCampaigns = await metaService.getCampaigns(userId, accessToken, account.meta_account_id) as any[];
        } catch (e: any) {
            liveError = e.message;
        }

        res.json({
            success: true,
            data: {
                account,
                db_campaigns_count: campaigns.length,
                db_campaigns: campaigns.slice(0, 5),
                db_insights: insightsCount[0],
                live_campaigns_count: liveCampaigns?.length ?? 0,
                live_campaigns: liveCampaigns?.slice(0, 3) ?? [],
                live_error: liveError,
                period: { since, until },
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /meta/local/accounts/active — apenas contas de clientes ativos
 */
router.get('/local/accounts/active', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accounts = await metaRepository.getActiveAdAccountsByUser(req.user!.userId);
        res.json({ success: true, data: accounts });
    } catch (err) {
        next(err);
    }
});

export const metaController = router;
