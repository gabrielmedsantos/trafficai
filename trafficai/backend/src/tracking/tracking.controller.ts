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
import { generatePublicToken, generateWebhookSecret, retryEvent, retryFailedBatch } from './tracking.service';
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
                    s.crm_type, s.crm_subdomain, s.last_backfill_at,
                    a.account_name AS meta_account_name,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '24 hours'
                       AND e.meta_status = 'test_only') AS test_only_24h,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '24 hours') AS events_24h,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '7 days' AND e.meta_status = 'failed') AS errors_7d,
                    (SELECT AVG(emq_score) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '7 days') AS avg_emq_7d,
                    (SELECT COUNT(*) FROM tracking_whatsapp_leads w WHERE w.source_id = s.id) AS whatsapp_leads_total,
                    -- Health signals
                    (SELECT MAX(created_at) FROM tracking_events e WHERE e.source_id = s.id) AS last_event_at,
                    -- Último evento vindo do pixel browser (não webhook/sistema) — detecta pixel instalado
                    (SELECT MAX(created_at) FROM tracking_events e
                       WHERE e.source_id = s.id AND e.action_source = 'website') AS last_pixel_event_at,
                    -- Eventos failed ainda elegíveis pra retry automático
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.meta_status = 'failed' AND e.retry_count < 3
                       AND e.created_at >= NOW() - INTERVAL '24 hours') AS pending_retries
             FROM tracking_sources s
             LEFT JOIN ad_accounts a ON s.account_id = a.id
             WHERE s.user_id = $1
             ORDER BY s.created_at DESC`,
            [userId]
        );

        // Computa status por fonte com base nos sinais
        const data = rows.map((s: any) => ({
            ...s,
            status: computeSourceStatus(s),
        }));
        res.json({ success: true, data });
    } catch (err: any) {
        logger.error('tracking: listar fontes falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── Status calculator ────────────────────────────────────────────────────
//   test_mode      test_event_code ativo — eventos vão SÓ pra "Eventos de teste" da Meta
//   healthy        evento nas últimas 1h, sem alto índice de falha
//   active         evento últimas 24h, sem alto índice de falha
//   idle           último evento entre 24h e 7d
//   dead           sem evento há mais de 7d (ou nunca)
//   pixel_missing  fonte tem credenciais mas SEM evento 'website' há > 24h (pixel pode estar fora do site)
//   error_rate     >5% dos eventos 24h falharam
//   inactive       fonte com is_active=false ou sem pixel_id configurado
function computeSourceStatus(s: any): {
    state: 'healthy' | 'active' | 'idle' | 'dead' | 'pixel_missing' | 'error_rate' | 'inactive' | 'test_mode';
    detail: string;
    severity: 'ok' | 'info' | 'warn' | 'error';
} {
    if (!s.is_active) return { state: 'inactive', detail: 'Fonte desativada', severity: 'info' };
    if (!s.pixel_id) return { state: 'inactive', detail: 'Pixel ID não configurado', severity: 'warn' };

    // Test mode tem prioridade — explica por que "sent" não aparece em produção
    if (s.test_event_code) {
        return {
            state: 'test_mode',
            detail: `test_event_code="${s.test_event_code}" — eventos só na aba Eventos de Teste da Meta`,
            severity: 'warn',
        };
    }

    const events24h = Number(s.events_24h) || 0;
    const errors7d = Number(s.errors_7d) || 0;
    const lastEvent = s.last_event_at ? new Date(s.last_event_at).getTime() : 0;
    const lastPixel = s.last_pixel_event_at ? new Date(s.last_pixel_event_at).getTime() : 0;
    const now = Date.now();
    const hoursSinceLast = lastEvent ? (now - lastEvent) / 3600000 : Infinity;
    const hoursSinceLastPixel = lastPixel ? (now - lastPixel) / 3600000 : Infinity;

    // Sem nenhum evento
    if (!lastEvent) return { state: 'dead', detail: 'Nenhum evento recebido ainda', severity: 'warn' };

    // Morto: sem evento há mais de 7d
    if (hoursSinceLast > 168) {
        return { state: 'dead', detail: `Último evento há ${Math.floor(hoursSinceLast / 24)}d`, severity: 'error' };
    }

    // Erro alto (>5% em 24h)
    if (events24h > 10 && errors7d / Math.max(events24h, 1) > 0.05) {
        return {
            state: 'error_rate',
            detail: `${errors7d} falha(s) em 7d`,
            severity: 'error',
        };
    }

    // Pixel ausente: webhook funciona mas pixel browser não dispara há > 24h
    // Só considera "pixel_missing" se a fonte tem domínio configurado (indica intenção de site)
    if (s.domain && hoursSinceLastPixel > 24 && hoursSinceLast < 168) {
        return {
            state: 'pixel_missing',
            detail: lastPixel
                ? `Pixel browser parou há ${Math.floor(hoursSinceLastPixel / 24)}d`
                : 'Pixel browser nunca disparou',
            severity: 'warn',
        };
    }

    if (hoursSinceLast < 1) {
        return { state: 'healthy', detail: 'Evento há menos de 1h', severity: 'ok' };
    }
    if (hoursSinceLast < 24) {
        return { state: 'active', detail: `Último evento há ${Math.floor(hoursSinceLast)}h`, severity: 'ok' };
    }
    return {
        state: 'idle',
        detail: `Último evento há ${Math.floor(hoursSinceLast / 24)}d`,
        severity: 'info',
    };
}

// ─── GET /tracking/sources/:id/whatsapp-leads ───────────────────────────────
router.get('/sources/:id/whatsapp-leads', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const rows = await query<any>(
            `SELECT id, phone, name, ctwa_clid, ad_source_id, ad_source_url,
                    ad_title, pixel_id, page_id, lead_meta_status, lead_meta_error,
                    purchase_event_id, purchase_value, purchase_at, kommo_lead_id,
                    created_at
             FROM tracking_whatsapp_leads
             WHERE source_id = $1
             ORDER BY created_at DESC LIMIT 200`,
            [id]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
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
// Query: limit, offset, status, event_name, from (ISO), to (ISO), search (event_id|external_id substring)
router.get('/sources/:id/events', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const {
            limit = '50',
            offset = '0',
            status,
            event_name,
            from,
            to,
            search,
        } = req.query as any;

        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const whereParts: string[] = [`source_id = $1`];
        const params: any[] = [id];
        if (status)     { params.push(status);     whereParts.push(`meta_status = $${params.length}`); }
        if (event_name) { params.push(event_name); whereParts.push(`event_name = $${params.length}`); }
        if (from)       { params.push(from);       whereParts.push(`created_at >= $${params.length}::timestamptz`); }
        if (to)         { params.push(to);         whereParts.push(`created_at <= $${params.length}::timestamptz`); }
        if (search) {
            const term = String(search).trim();
            if (term.length > 0) {
                params.push(`%${term}%`);
                const i = params.length;
                whereParts.push(
                    `(event_id ILIKE $${i} OR external_id ILIKE $${i} OR meta_fbtrace_id ILIKE $${i})`
                );
            }
        }
        const whereSql = whereParts.join(' AND ');

        // Total + page
        const lim = Math.min(parseInt(limit, 10) || 50, 500);
        const off = Math.max(parseInt(offset, 10) || 0, 0);

        const countRow = await query<{ total: string }>(
            `SELECT COUNT(*)::text AS total FROM tracking_events WHERE ${whereSql}`,
            params
        );
        const total = Number(countRow[0]?.total || 0);

        params.push(lim, off);
        const sql = `
            SELECT id, event_name, event_id, event_time, action_source, external_id,
                   event_source_url, value, currency, emq_score, meta_status,
                   meta_error, meta_fbtrace_id, retry_count, created_at,
                   city, state, country
            FROM tracking_events
            WHERE ${whereSql}
            ORDER BY created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `;
        const rows = await query<any>(sql, params);
        res.json({ success: true, data: rows, meta: { total, limit: lim, offset: off } });
    } catch (err: any) {
        logger.error('tracking: listar eventos falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/health ──────────────────────────────────────
// Diagnóstico detalhado pro source detail. Retorna estado + sinais úteis pra
// decidir o que mostrar pro usuário.
router.get('/sources/:id/health', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const rows = await query<any>(
            `SELECT s.id, s.name, s.pixel_id, s.is_active, s.domain, s.test_event_code,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '24 hours') AS events_24h,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '24 hours'
                       AND e.action_source = 'website') AS pixel_events_24h,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '24 hours'
                       AND e.meta_status = 'test_only') AS test_only_24h,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.created_at >= NOW() - INTERVAL '7 days' AND e.meta_status = 'failed') AS errors_7d,
                    (SELECT COUNT(*) FROM tracking_events e WHERE e.source_id = s.id
                       AND e.meta_status = 'failed' AND e.retry_count < 3
                       AND e.created_at >= NOW() - INTERVAL '24 hours') AS pending_retries,
                    (SELECT MAX(created_at) FROM tracking_events e WHERE e.source_id = s.id) AS last_event_at,
                    (SELECT MAX(created_at) FROM tracking_events e
                       WHERE e.source_id = s.id AND e.action_source = 'website') AS last_pixel_event_at,
                    (SELECT MAX(created_at) FROM tracking_events e
                       WHERE e.source_id = s.id AND e.meta_status = 'failed') AS last_error_at
             FROM tracking_sources s
             WHERE s.id = $1 AND s.user_id = $2`,
            [id, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const s = rows[0];
        const status = computeSourceStatus(s);

        // Checklist de instalação
        const checklist = [
            {
                key: 'is_active',
                label: 'Fonte ativa',
                ok: !!s.is_active,
                hint: s.is_active ? undefined : 'Ative a fonte em "Editar credenciais"',
            },
            {
                key: 'pixel_id',
                label: 'Pixel ID configurado',
                ok: !!s.pixel_id,
                hint: s.pixel_id ? undefined : 'Cole o Pixel ID em "Editar credenciais"',
            },
            {
                key: 'production_mode',
                label: 'Modo produção (não-teste)',
                ok: !s.test_event_code,
                hint: s.test_event_code
                    ? `test_event_code="${s.test_event_code}" ativo — eventos aparecem SÓ na aba "Eventos de teste" da Meta. Remova em "Editar credenciais" pra contar em produção.`
                    : undefined,
            },
            {
                key: 'pixel_installed',
                label: 'Pixel instalado no site',
                ok: Number(s.pixel_events_24h) > 0,
                hint: Number(s.pixel_events_24h) > 0
                    ? undefined
                    : 'Nenhum evento browser nas últimas 24h — confira o <script> no site',
            },
            {
                key: 'no_recent_errors',
                label: 'Sem erros recentes (24h)',
                ok: Number(s.errors_7d) === 0 || Number(s.pending_retries) === 0,
                hint: Number(s.pending_retries) > 0
                    ? `${s.pending_retries} evento(s) ainda elegíveis pra retry`
                    : undefined,
            },
        ];

        res.json({
            success: true,
            data: {
                status,
                signals: {
                    events_24h: Number(s.events_24h) || 0,
                    pixel_events_24h: Number(s.pixel_events_24h) || 0,
                    errors_7d: Number(s.errors_7d) || 0,
                    pending_retries: Number(s.pending_retries) || 0,
                    last_event_at: s.last_event_at,
                    last_pixel_event_at: s.last_pixel_event_at,
                    last_error_at: s.last_error_at,
                },
                checklist,
            },
        });
    } catch (err: any) {
        logger.error('tracking: health falhou', { error: err.message });
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
                retry_count: Number(ev.retry_count) || 0,
                last_retry_at: ev.last_retry_at,
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

// ─── GET /tracking/sources/:id/dashboard ────────────────────────────────────
// Dashboard de performance do cliente (leads, qualificados, vendas, ROI).
// Aceita ?since=YYYY-MM-DD&until=YYYY-MM-DD (default últimos 30 dias).
// Se a fonte tem account_id vinculado, inclui ad_spend + ROI real.
router.get('/sources/:id/dashboard', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { since, until } = req.query as any;

        const src = await query<any>(
            `SELECT s.*, a.account_name AS meta_account_name
             FROM tracking_sources s
             LEFT JOIN ad_accounts a ON s.account_id = a.id
             WHERE s.id = $1 AND s.user_id = $2`,
            [id, userId]
        );
        if (!src.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const source = src[0];

        // Default: últimos 30 dias
        const now = new Date();
        const endDate = until ? new Date(until + 'T23:59:59') : now;
        const startDate = since ? new Date(since + 'T00:00:00')
            : new Date(now.getTime() - 30 * 86400000);
        const sinceStr = startDate.toISOString().split('T')[0];
        const untilStr = endDate.toISOString().split('T')[0];

        // KPIs agregados
        const totals = await query<any>(
            `SELECT
                COUNT(*) FILTER (WHERE event_name = 'Lead') AS leads,
                COUNT(*) FILTER (WHERE event_name = 'Contact') AS qualified,
                COUNT(*) FILTER (WHERE event_name = 'Lead_Desqualificado') AS disqualified,
                COUNT(*) FILTER (WHERE event_name = 'Schedule') AS scheduled,
                COUNT(*) FILTER (WHERE event_name = 'Purchase') AS sales_count,
                COALESCE(SUM(value) FILTER (WHERE event_name = 'Purchase'), 0) AS sales_value,
                COUNT(*) FILTER (WHERE meta_status = 'sent') AS events_sent,
                COUNT(*) FILTER (WHERE meta_status = 'failed') AS events_failed,
                COALESCE(AVG(emq_score), 0)::float AS avg_emq
             FROM tracking_events
             WHERE source_id = $1
               AND created_at BETWEEN $2 AND $3`,
            [id, startDate.toISOString(), endDate.toISOString()]
        );
        const t = totals[0];
        const leadsNum = Number(t.leads) || 0;
        const qualifiedNum = Number(t.qualified) || 0;
        const salesCount = Number(t.sales_count) || 0;
        const salesValue = Number(t.sales_value) || 0;

        // Ad spend (se conta Meta vinculada)
        let adSpend = 0;
        if (source.account_id) {
            const spendQ = await query<any>(
                `SELECT COALESCE(SUM(ih.spend), 0) AS spend
                 FROM insights_history ih
                 JOIN campaigns c ON ih.campaign_id = c.id
                 WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3`,
                [source.account_id, sinceStr, untilStr]
            );
            adSpend = Number(spendQ[0]?.spend) || 0;
        }

        // Indicadores derivados
        const cpl = leadsNum > 0 ? adSpend / leadsNum : 0;
        const cpa = salesCount > 0 ? adSpend / salesCount : 0;
        const conversionRate = leadsNum > 0 ? (salesCount / leadsNum) * 100 : 0;
        const qualifiedRate = leadsNum > 0 ? (qualifiedNum / leadsNum) * 100 : 0;
        const roiPct = adSpend > 0 ? ((salesValue - adSpend) / adSpend) * 100 : 0;
        const revenueMinusSpend = salesValue - adSpend;
        const roas = adSpend > 0 ? salesValue / adSpend : 0;
        const avgTicket = salesCount > 0 ? salesValue / salesCount : 0;

        // Breakdown diário (eventos)
        const dailyEvents = await query<any>(
            `SELECT DATE(created_at) AS date,
                    COUNT(*) FILTER (WHERE event_name = 'Lead') AS leads,
                    COUNT(*) FILTER (WHERE event_name = 'Contact') AS qualified,
                    COUNT(*) FILTER (WHERE event_name = 'Schedule') AS scheduled,
                    COUNT(*) FILTER (WHERE event_name = 'Purchase') AS sales,
                    COALESCE(SUM(value) FILTER (WHERE event_name = 'Purchase'), 0) AS sales_value
             FROM tracking_events
             WHERE source_id = $1
               AND created_at BETWEEN $2 AND $3
             GROUP BY DATE(created_at)
             ORDER BY date ASC`,
            [id, startDate.toISOString(), endDate.toISOString()]
        );

        // Daily spend (merge por data no front)
        let dailySpend: any[] = [];
        if (source.account_id) {
            dailySpend = await query<any>(
                `SELECT ih.date::text AS date, COALESCE(SUM(ih.spend), 0) AS spend
                 FROM insights_history ih
                 JOIN campaigns c ON ih.campaign_id = c.id
                 WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3
                 GROUP BY ih.date
                 ORDER BY ih.date ASC`,
                [source.account_id, sinceStr, untilStr]
            );
        }

        // Merge daily events + spend
        const byDate: Record<string, any> = {};
        for (const r of dailyEvents) {
            const d = new Date(r.date).toISOString().split('T')[0];
            byDate[d] = {
                date: d,
                leads: Number(r.leads) || 0,
                qualified: Number(r.qualified) || 0,
                scheduled: Number(r.scheduled) || 0,
                sales: Number(r.sales) || 0,
                sales_value: Number(r.sales_value) || 0,
                spend: 0,
            };
        }
        for (const r of dailySpend) {
            const d = String(r.date).slice(0, 10);
            if (!byDate[d]) byDate[d] = { date: d, leads: 0, qualified: 0, scheduled: 0, sales: 0, sales_value: 0, spend: 0 };
            byDate[d].spend = Number(r.spend) || 0;
        }
        const daily = Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));

        res.json({
            success: true,
            data: {
                source: {
                    id: source.id,
                    name: source.name,
                    meta_account_name: source.meta_account_name,
                    has_account_link: !!source.account_id,
                },
                period: { since: sinceStr, until: untilStr },
                kpis: {
                    leads: leadsNum,
                    qualified: qualifiedNum,
                    disqualified: Number(t.disqualified) || 0,
                    scheduled: Number(t.scheduled) || 0,
                    sales_count: salesCount,
                    sales_value: salesValue,
                    ad_spend: adSpend,
                    revenue_minus_spend: revenueMinusSpend,
                    roi_pct: roiPct,
                    roas,
                    cpl, cpa,
                    conversion_rate: conversionRate,
                    qualified_rate: qualifiedRate,
                    avg_ticket: avgTicket,
                    events_sent: Number(t.events_sent) || 0,
                    events_failed: Number(t.events_failed) || 0,
                    avg_emq: t.avg_emq || 0,
                },
                daily,
            },
        });
    } catch (err: any) {
        logger.error('tracking: dashboard falhou', { error: err.message });
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

// ─── POST /tracking/events/:eventId/retry ──────────────────────────────────
// Retenta UM evento falho específico. Valida ownership.
router.post('/events/:eventId/retry', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { eventId } = req.params;
        const own = await query<any>(
            `SELECT e.id FROM tracking_events e
             JOIN tracking_sources s ON e.source_id = s.id
             WHERE e.id = $1 AND s.user_id = $2`,
            [eventId, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Evento não encontrado' } });

        const result = await retryEvent(eventId);
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking: retry de evento falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tracking/sources/:id/retry-failed ───────────────────────────────
// Retenta TODOS os eventos failed da fonte (últimas 24h, max 3 tentativas/evento).
// Body opcional: { max_age_hours, limit }
router.post('/sources/:id/retry-failed', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const result = await retryFailedBatch({
            sourceId: id,
            maxAgeHours: Number(req.body?.max_age_hours) || 24,
            maxRetries: 3,
            minSinceLastRetryMs: 0, // no manual mode, sem cooldown
            limit: Number(req.body?.limit) || 200,
        });
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking: retry-failed falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const trackingController = router;
