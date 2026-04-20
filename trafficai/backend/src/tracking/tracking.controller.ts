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
import { getAdapter, backfillSource } from './crm-sync.service';

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
        const {
            name, account_id, pixel_id, access_token, test_event_code, domain, is_active,
            crm_type, crm_subdomain, crm_access_token, crm_config,
        } = req.body;

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
        if (crm_type !== undefined)         { fields.push(`crm_type=$${idx++}`); params.push(crm_type || null); }
        if (crm_subdomain !== undefined)    { fields.push(`crm_subdomain=$${idx++}`); params.push(crm_subdomain || null); }
        if (crm_access_token !== undefined) { fields.push(`crm_access_token=$${idx++}`); params.push(crm_access_token || null); }
        if (crm_config !== undefined)       { fields.push(`crm_config=$${idx++}::jsonb`); params.push(JSON.stringify(crm_config || {})); }

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

// ─── POST /tracking/sources/:id/crm/test ────────────────────────────────────
// Valida credenciais CRM e retorna info da conta
router.post('/sources/:id/crm/test', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const rows = await query<any>(
            `SELECT * FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const src = rows[0];
        if (req.body?.crm_subdomain) src.crm_subdomain = req.body.crm_subdomain;
        if (req.body?.crm_access_token) src.crm_access_token = req.body.crm_access_token;
        if (req.body?.crm_type) src.crm_type = req.body.crm_type;

        const adapter: any = getAdapter(src);
        const account = await adapter.validate();
        let wonStatuses: any[] = [];
        try { wonStatuses = await adapter.findWonStatuses(); } catch { /* opcional */ }

        res.json({
            success: true,
            data: {
                account,
                won_statuses: wonStatuses,
            },
        });
    } catch (err: any) {
        logger.error('tracking: test CRM falhou', { error: err.message });
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// ─── POST /tracking/sources/:id/backfill ────────────────────────────────────
// Executa backfill. Body:
//   { enrich_existing: bool, sync_won_purchases: bool, time_strategy: 'clamp_7d' | 'now' | 'original' }
router.post('/sources/:id/backfill', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const rows = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const opts = {
            enrich_existing: Boolean(req.body?.enrich_existing),
            sync_won_purchases: Boolean(req.body?.sync_won_purchases),
            time_strategy: (req.body?.time_strategy || 'clamp_7d') as 'clamp_7d' | 'now' | 'original',
        };
        if (!opts.enrich_existing && !opts.sync_won_purchases) {
            return res.status(400).json({
                success: false,
                error: { message: 'Selecione ao menos enrich_existing ou sync_won_purchases' },
            });
        }

        const result = await backfillSource(id, opts);
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking: backfill falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: err.message } });
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

// ─── GET /tracking/events/:eventId ──────────────────────────────────────────
// Detalhe completo de um evento: reconstrói o payload Meta exato que foi
// enviado e mostra a resposta. Para auditoria.
router.get('/events/:eventId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { eventId } = req.params;

        const rows = await query<any>(
            `SELECT e.*, s.name AS source_name, s.pixel_id, s.test_event_code,
                    s.user_id
             FROM tracking_events e
             JOIN tracking_sources s ON e.source_id = s.id
             WHERE e.id = $1 AND s.user_id = $2`,
            [eventId, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Evento não encontrado' } });
        const ev = rows[0];

        // Reconstrói o payload enviado para Meta CAPI
        const sentPayload: any = {
            event_name: ev.event_name,
            event_time: Number(ev.event_time),
            event_id: ev.event_id,
            action_source: ev.action_source,
        };
        if (ev.event_source_url) sentPayload.event_source_url = ev.event_source_url;
        if (ev.user_data_hashed && Object.keys(ev.user_data_hashed).length > 0) {
            sentPayload.user_data = ev.user_data_hashed;
        }
        if (ev.custom_data && Object.keys(ev.custom_data).length > 0) {
            sentPayload.custom_data = ev.custom_data;
        }

        const metaRequest: any = {
            method: 'POST',
            url: `https://graph.facebook.com/v19.0/${ev.pixel_id || 'PIXEL_ID'}/events`,
            query: { access_token: '***redacted***' },
            body: { data: [sentPayload] },
        };
        if (ev.test_event_code) {
            metaRequest.body.test_event_code = ev.test_event_code;
        }

        res.json({
            success: true,
            data: {
                // Metadados
                id: ev.id,
                source_id: ev.source_id,
                source_name: ev.source_name,
                created_at: ev.created_at,
                // Identificação do evento
                event_name: ev.event_name,
                event_id: ev.event_id,
                event_time: Number(ev.event_time),
                event_time_iso: new Date(Number(ev.event_time) * 1000).toISOString(),
                action_source: ev.action_source,
                event_source_url: ev.event_source_url,
                external_id: ev.external_id,
                // Valor
                value: ev.value,
                currency: ev.currency,
                // Custom data
                custom_data: ev.custom_data,
                // PII (já hashada)
                user_data_hashed: ev.user_data_hashed,
                // Contexto técnico
                client_ip: ev.client_ip,
                client_user_agent: ev.client_user_agent,
                city: ev.city,
                state: ev.state,
                country: ev.country,
                zip: ev.zip,
                fbp: ev.fbp,
                fbc: ev.fbc,
                // Resultado
                emq_score: ev.emq_score,
                meta_status: ev.meta_status,
                meta_response: ev.meta_response,
                meta_error: ev.meta_error,
                meta_fbtrace_id: ev.meta_fbtrace_id,
                // O que saiu pra Meta
                meta_request: metaRequest,
            },
        });
    } catch (err: any) {
        logger.error('tracking: event detail falhou', { error: err.message });
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
