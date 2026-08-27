// ==============================
// Google Ads Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { query } from '../database/connection';
import { ValidationError } from '../shared/errors';
import { listAccessibleCustomers, syncAccount, setCampaignStatus } from './google-ads.service';
import { requireCapability } from '../team/capabilities';

const router = Router();
router.use(authMiddleware);

// GET /google-ads/credentials — mostra se está configurado (sem devolver secrets)
router.get('/credentials', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const r = await query<any>(
            `SELECT (developer_token IS NOT NULL) AS has_dev_token,
                    (refresh_token IS NOT NULL) AS has_refresh,
                    (client_id IS NOT NULL) AS has_client_id,
                    (client_secret IS NOT NULL) AS has_client_secret,
                    login_customer_id, updated_at
             FROM google_ads_credentials WHERE user_id = $1`,
            [req.user!.userId]
        );
        res.json({ success: true, data: r[0] || null });
    } catch (err) { next(err); }
});

// POST /google-ads/credentials — cria/atualiza
router.post('/credentials', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { developer_token, login_customer_id, refresh_token, client_id, client_secret } = req.body;
        if (!developer_token || !login_customer_id || !refresh_token || !client_id || !client_secret) {
            throw new ValidationError('Todos os 5 campos são obrigatórios');
        }
        const cleanMcc = String(login_customer_id).replace(/-/g, '');
        await query(`
            INSERT INTO google_ads_credentials (user_id, developer_token, login_customer_id, refresh_token, client_id, client_secret, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                developer_token = EXCLUDED.developer_token,
                login_customer_id = EXCLUDED.login_customer_id,
                refresh_token = EXCLUDED.refresh_token,
                client_id = EXCLUDED.client_id,
                client_secret = EXCLUDED.client_secret,
                updated_at = NOW()
        `, [req.user!.userId, developer_token, cleanMcc, refresh_token, client_id, client_secret]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// GET /google-ads/accessible-customers — descobre contas via API
router.get('/accessible-customers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const list = await listAccessibleCustomers(req.user!.userId);
        res.json({ success: true, data: list });
    } catch (err) { next(err); }
});

// POST /google-ads/accounts — importa uma conta do Google Ads pro banco local
router.post('/accounts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { customer_id, account_name, currency, time_zone } = req.body;
        if (!customer_id || !account_name) throw new ValidationError('customer_id e account_name obrigatórios');
        const cleanId = String(customer_id).replace(/-/g, '');
        const r = await query<any>(`
            INSERT INTO google_ads_accounts (user_id, customer_id, account_name, currency, time_zone)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, customer_id) DO UPDATE SET account_name = EXCLUDED.account_name
            RETURNING *
        `, [req.user!.userId, cleanId, account_name, currency || 'BRL', time_zone || 'America/Sao_Paulo']);
        res.json({ success: true, data: r[0] });
    } catch (err) { next(err); }
});

// GET /google-ads/accounts — lista contas já importadas
router.get('/accounts', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const list = await query<any>(
            `SELECT * FROM google_ads_accounts WHERE user_id = $1 ORDER BY account_name`,
            [req.user!.userId]
        );
        res.json({ success: true, data: list });
    } catch (err) { next(err); }
});

// POST /google-ads/accounts/:id/sync — força sync
router.post('/accounts/:id/sync', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const days = Number(req.query.days) || 30;
        const r = await syncAccount(req.user!.userId, req.params.id, days);
        res.json({ success: true, data: r });
    } catch (err) { next(err); }
});

// GET /google-ads/accounts/:id/campaigns — lista campanhas
router.get('/accounts/:id/campaigns', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await query<any>(`
            SELECT c.*,
                COALESCE(SUM(i.impressions), 0)::bigint AS impressions,
                COALESCE(SUM(i.clicks), 0)::bigint AS clicks,
                COALESCE(SUM(i.cost_micros), 0)::bigint AS cost_micros,
                COALESCE(SUM(i.conversions), 0) AS conversions,
                COALESCE(SUM(i.conversion_value), 0) AS conversion_value
            FROM google_ads_campaigns c
            LEFT JOIN google_ads_insights i ON i.campaign_id = c.id
                AND i.date >= CURRENT_DATE - INTERVAL '30 days'
            WHERE c.account_id = $1
            GROUP BY c.id
            ORDER BY cost_micros DESC
        `, [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (err) { next(err); }
});

// PATCH /google-ads/campaigns/:googleId/status — pausa/ativa via API
router.patch('/campaigns/:googleId/status', requireCapability('google_campaigns'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { account_id, status } = req.body;
        if (!['ENABLED', 'PAUSED'].includes(status)) throw new ValidationError('status inválido');
        await setCampaignStatus(req.user!.userId, account_id, req.params.googleId, status);
        res.json({ success: true });
    } catch (err) { next(err); }
});

export const googleAdsController = router;
