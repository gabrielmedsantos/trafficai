// ==============================
// TrafficAI — Tracking Controller (autenticado)
// CRUD de tracking_sources + métricas.
// Rotas públicas (pixel/event/webhook) estão em tracking.public.ts
// ==============================

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';
import { generatePublicToken, generateWebhookSecret } from './tracking.service';

const router = Router();
router.use(authMiddleware);

// ─── GET /tracking/sources ──────────────────────────────────────────────────
router.get('/sources', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const rows = await query<any>(
            `SELECT s.id, s.name, s.public_token, s.pixel_id, s.test_event_code,
                    s.domain, s.is_active, s.account_id, s.created_at, s.updated_at,
                    a.account_name AS meta_account_name,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '24 hours') AS events_24h,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '7 days' AND e.meta_status = 'failed') AS errors_7d,
                    (SELECT AVG(emq_score) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '7 days') AS avg_emq_7d
             FROM tracking_sources s
             LEFT JOIN ad_accounts a ON s.account_id = a.id
             WHERE s.user_id = $1
             ORDER BY s.created_at DESC`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('tracking: listar fontes falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tracking/sources ─────────────────────────────────────────────────
router.post('/sources', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name, account_id, pixel_id, access_token, test_event_code, domain } = req.body;
        if (!name) return res.status(400).json({ success: false, error: { message: 'Nome é obrigatório' } });

        const rows = await query<any>(
            `INSERT INTO tracking_sources
                (user_id, account_id, name, public_token, pixel_id, access_token,
                 test_event_code, domain, webhook_secret)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [
                userId,
                account_id || null,
                name.trim(),
                generatePublicToken(),
                pixel_id || null,
                access_token || null,
                test_event_code || null,
                domain || null,
                generateWebhookSecret(),
            ]
        );
        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        logger.error('tracking: criar fonte falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id ──────────────────────────────────────────────
router.get('/sources/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const rows = await query<any>(
            `SELECT * FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── PATCH /tracking/sources/:id ────────────────────────────────────────────
router.patch('/sources/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { name, account_id, pixel_id, access_token, test_event_code, domain, is_active } = req.body;

        const fields: string[] = [];
        const params: any[] = [];
        let idx = 1;
        if (name !== undefined)             { fields.push(`name=$${idx++}`); params.push(name); }
        if (account_id !== undefined)       { fields.push(`account_id=$${idx++}`); params.push(account_id || null); }
        if (pixel_id !== undefined)         { fields.push(`pixel_id=$${idx++}`); params.push(pixel_id || null); }
        if (access_token !== undefined)     { fields.push(`access_token=$${idx++}`); params.push(access_token || null); }
        if (test_event_code !== undefined)  { fields.push(`test_event_code=$${idx++}`); params.push(test_event_code || null); }
        if (domain !== undefined)           { fields.push(`domain=$${idx++}`); params.push(domain || null); }
        if (is_active !== undefined)        { fields.push(`is_active=$${idx++}`); params.push(Boolean(is_active)); }

        if (!fields.length) return res.status(400).json({ success: false, error: { message: 'Nada para atualizar' } });

        fields.push(`updated_at = NOW()`);
        params.push(id, userId);
        const rows = await query<any>(
            `UPDATE tracking_sources SET ${fields.join(', ')}
             WHERE id = $${idx++} AND user_id = $${idx}
             RETURNING *`,
            params
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        logger.error('tracking: update fonte falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tracking/sources/:id/rotate-webhook ──────────────────────────────
// Gera novo webhook_secret
router.post('/sources/:id/rotate-webhook', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const rows = await query<any>(
            `UPDATE tracking_sources SET webhook_secret = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3 RETURNING webhook_secret`,
            [generateWebhookSecret(), id, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── DELETE /tracking/sources/:id ───────────────────────────────────────────
router.delete('/sources/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const rows = await query<any>(
            `DELETE FROM tracking_sources WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        res.json({ success: true, data: { message: 'Fonte removida' } });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/events ───────────────────────────────────────
router.get('/sources/:id/events', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { limit = '50', status, event_name } = req.query as any;

        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const params: any[] = [id];
        let sql = `SELECT id, event_name, event_id, event_time, action_source, external_id,
                          event_source_url, value, currency, emq_score, meta_status,
                          meta_error, meta_fbtrace_id, created_at,
                          city, state, country
                   FROM tracking_events WHERE source_id = $1`;
        if (status) { params.push(status); sql += ` AND meta_status = $${params.length}`; }
        if (event_name) { params.push(event_name); sql += ` AND event_name = $${params.length}`; }
        params.push(Math.min(parseInt(limit, 10) || 50, 500));
        sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

        const rows = await query<any>(sql, params);
        res.json({ success: true, data: rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/stats ────────────────────────────────────────
router.get('/sources/:id/stats', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { days = '7' } = req.query as any;
        const daysBack = Math.max(1, Math.min(parseInt(days, 10) || 7, 90));

        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        // Totais e taxa de sucesso
        const totals = await query<any>(
            `SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE meta_status = 'sent') AS sent,
                COUNT(*) FILTER (WHERE meta_status = 'failed') AS failed,
                COALESCE(AVG(emq_score), 0)::float AS avg_emq,
                COUNT(DISTINCT event_name) AS distinct_events,
                COUNT(DISTINCT external_id) AS distinct_users
             FROM tracking_events
             WHERE source_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
            [id, String(daysBack)]
        );

        // Breakdown por evento
        const byEvent = await query<any>(
            `SELECT event_name,
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE meta_status = 'sent') AS sent,
                    COUNT(*) FILTER (WHERE meta_status = 'failed') AS failed,
                    COALESCE(AVG(emq_score), 0)::float AS avg_emq
             FROM tracking_events
             WHERE source_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
             GROUP BY event_name
             ORDER BY total DESC`,
            [id, String(daysBack)]
        );

        // Série diária
        const daily = await query<any>(
            `SELECT DATE(created_at) AS date,
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE meta_status = 'sent') AS sent,
                    COUNT(*) FILTER (WHERE meta_status = 'failed') AS failed
             FROM tracking_events
             WHERE source_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
             GROUP BY DATE(created_at)
             ORDER BY date ASC`,
            [id, String(daysBack)]
        );

        // Erros recentes
        const recentErrors = await query<any>(
            `SELECT event_name, meta_error, meta_fbtrace_id, created_at
             FROM tracking_events
             WHERE source_id = $1 AND meta_status = 'failed'
             ORDER BY created_at DESC LIMIT 10`,
            [id]
        );

        res.json({
            success: true,
            data: {
                totals: totals[0],
                by_event: byEvent,
                daily,
                recent_errors: recentErrors,
                period_days: daysBack,
            },
        });
    } catch (err: any) {
        logger.error('tracking: stats falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tracking/sources/:id/test ───────────────────────────────────────
// Dispara um evento de teste server-side para validar credenciais.
router.post('/sources/:id/test', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const src = await query<any>(
            `SELECT * FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!src.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const source = src[0];

        const { trackEvent } = await import('./tracking.service');
        const result = await trackEvent(source, {
            event_name: 'PageView',
            event_id: 'test-' + crypto.randomBytes(6).toString('hex'),
            action_source: 'website',
            event_source_url: `https://${source.domain || 'trafficai.test'}/test`,
            user_data: {
                email: 'test@trafficai.app',
                phone: '+5511999999999',
                first_name: 'Teste',
                last_name: 'CAPI',
                city: 'São Paulo',
                state: 'SP',
                zip: '01310000',
                country: 'BR',
                client_ip: '200.200.200.200',
                client_user_agent: 'TrafficAI Test Agent/1.0',
                external_id: 'tai-test-user',
            },
        });
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking: test falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

export const trackingController = router;
