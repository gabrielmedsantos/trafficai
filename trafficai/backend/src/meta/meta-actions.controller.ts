// ==============================
// Meta Actions Controller — operações de ESCRITA no Meta Ads
// (pausar/ativar campanha, editar orçamento, duplicar)
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { authMiddleware } from '../auth/auth.middleware';
import { authRepository } from '../auth/auth.repository';
import { query } from '../database/connection';
import { AppError, ValidationError } from '../shared/errors';
import { logger } from '../shared/logger';

const router = Router();
router.use(authMiddleware);

const META_URL = (path: string) => `https://graph.facebook.com/v21.0/${path}`;

async function getToken(userId: string): Promise<string> {
    const u = await authRepository.findById(userId);
    if (!u?.access_token) throw new AppError('Meta token não configurado', 401);
    return u.access_token;
}

// PATCH /meta-actions/campaigns/:id/status  { status: 'ACTIVE' | 'PAUSED' }
router.patch('/campaigns/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        if (!['ACTIVE', 'PAUSED'].includes(status)) throw new ValidationError('status inválido');
        const c = await query<any>(`SELECT c.* FROM campaigns c JOIN ad_accounts a ON c.account_id = a.id WHERE c.id = $1 AND a.user_id = $2`, [req.params.id, req.user!.userId]);
        if (!c.length) throw new AppError('Campanha não encontrada', 404);
        const token = await getToken(req.user!.userId);

        await axios.post(META_URL(c[0].meta_campaign_id), null, {
            params: { status, access_token: token },
            timeout: 20000,
        });
        await query(`UPDATE campaigns SET status = $1 WHERE id = $2`, [status, req.params.id]);
        logger.info(`meta-actions: campaign ${c[0].name} → ${status}`);
        res.json({ success: true, data: { id: req.params.id, status } });
    } catch (err: any) {
        if (err?.response?.data) return next(new AppError(err.response.data.error?.message || 'Meta error', 502));
        next(err);
    }
});

// PATCH /meta-actions/campaigns/:id/budget  { daily_budget?: number, lifetime_budget?: number } (em R$)
router.patch('/campaigns/:id/budget', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { daily_budget, lifetime_budget } = req.body;
        if (!daily_budget && !lifetime_budget) throw new ValidationError('daily_budget ou lifetime_budget obrigatório');
        const c = await query<any>(`SELECT c.* FROM campaigns c JOIN ad_accounts a ON c.account_id = a.id WHERE c.id = $1 AND a.user_id = $2`, [req.params.id, req.user!.userId]);
        if (!c.length) throw new AppError('Campanha não encontrada', 404);
        const token = await getToken(req.user!.userId);

        // Meta espera valor em CENTAVOS
        const params: any = { access_token: token };
        if (daily_budget) params.daily_budget = Math.round(Number(daily_budget) * 100);
        if (lifetime_budget) params.lifetime_budget = Math.round(Number(lifetime_budget) * 100);

        await axios.post(META_URL(c[0].meta_campaign_id), null, { params, timeout: 20000 });
        logger.info(`meta-actions: budget ${c[0].name} → daily=R$${daily_budget || '-'} lifetime=R$${lifetime_budget || '-'}`);
        res.json({ success: true });
    } catch (err: any) {
        if (err?.response?.data) return next(new AppError(err.response.data.error?.message || 'Meta error', 502));
        next(err);
    }
});

// POST /meta-actions/ads/:adId/status  (por meta ad id, mais direto)
router.post('/ads/:adId/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        if (!['ACTIVE', 'PAUSED'].includes(status)) throw new ValidationError('status inválido');
        const token = await getToken(req.user!.userId);
        await axios.post(META_URL(req.params.adId), null, {
            params: { status, access_token: token },
            timeout: 20000,
        });
        res.json({ success: true, data: { id: req.params.adId, status } });
    } catch (err: any) {
        if (err?.response?.data) return next(new AppError(err.response.data.error?.message || 'Meta error', 502));
        next(err);
    }
});

// POST /meta-actions/campaigns/:id/duplicate  { new_name?: string }
router.post('/campaigns/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { new_name } = req.body;
        const c = await query<any>(`SELECT c.*, a.meta_account_id FROM campaigns c JOIN ad_accounts a ON c.account_id = a.id WHERE c.id = $1 AND a.user_id = $2`, [req.params.id, req.user!.userId]);
        if (!c.length) throw new AppError('Campanha não encontrada', 404);
        const token = await getToken(req.user!.userId);

        // Copia campanha via endpoint /copies (Meta suporta copy nativo)
        const resp = await axios.post(META_URL(`${c[0].meta_campaign_id}/copies`), null, {
            params: {
                deep_copy: true,   // copia adsets + ads
                status_option: 'PAUSED',
                rename_options: JSON.stringify({ rename_suffix: ' (Cópia)' }),
                access_token: token,
            },
            timeout: 60000,
        });
        const copiedId = resp.data?.copied_campaign_id || resp.data?.id;
        logger.info(`meta-actions: campaign ${c[0].name} duplicada → ${copiedId}`);
        res.json({ success: true, data: { new_campaign_id: copiedId } });
    } catch (err: any) {
        if (err?.response?.data) return next(new AppError(err.response.data.error?.message || 'Meta error', 502));
        next(err);
    }
});

export const metaActionsController = router;
