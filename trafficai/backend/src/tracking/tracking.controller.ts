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
import { normalizeKommoSubdomain } from './crm-adapters/kommo.adapter';
import { getAdapter, backfillSource } from './crm-sync.service';
import { retryGoogleEvent, retryFailedGoogleBatch, getConversionActionMapping, getLinkedGoogleAdsCustomerId, sendGoogleConversion } from './google-ads-adapter';
import { encrypt } from '../shared/encryption';
import { listPurchaseReviews, approvePurchaseReview, rejectPurchaseReview } from './whatsapp-purchase-detector';
import { getFunnelConfiguration, updateFunnelConfiguration, FunnelStageInput } from './funnel-configuration.service';
import {
    listConversionRules, createConversionRule, updateConversionRule, deleteConversionRule, listRuleExecutions,
} from './conversion-rules/conversion-rules.service';
import { getDiagnosticsSummary, listDiagnosticEvents } from './diagnostics.service';
import { buildSummary, buildGroupedRows, ReportGroup, normalizeSalesSettings, updateMetaObject, getUserAdsToken, actId } from './sales-report.service';
import axios from 'axios';

const router = Router();
router.use(authMiddleware);

// ─── Vendas (pedidos de checkout) — relatório estilo UTMify ─────────────────
const REPORT_GROUPS: ReportGroup[] = ['campaign', 'adset', 'ad', 'utm_source', 'utm_campaign', 'utm_medium', 'utm_content', 'utm_term', 'day', 'product'];

function brtDate(offsetDays = 0): string {
    const d = new Date(Date.now() - 3 * 3600000 + offsetDays * 86400000);
    return d.toISOString().slice(0, 10);
}

async function loadReportSource(sourceId: string, userId: string) {
    const rows = await query<any>(
        `SELECT s.id, s.user_id, s.account_id, s.sales_settings, a.meta_account_id
         FROM tracking_sources s LEFT JOIN ad_accounts a ON a.id = s.account_id
         WHERE s.id = $1 AND s.user_id = $2`,
        [sourceId, userId]
    );
    return rows[0] || null;
}

function reportRange(q: any): { since: string; until: string } | null {
    const since = typeof q.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.since) ? q.since : brtDate(-6);
    const until = typeof q.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.until) ? q.until : brtDate(0);
    return since <= until ? { since, until } : null;
}

// GET /tracking/sources/:id/sales-report?since=YYYY-MM-DD&until=YYYY-MM-DD&group=campaign
router.get('/sources/:id/sales-report', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const range = reportRange(req.query);
        if (!range) return res.status(400).json({ success: false, error: { message: 'Período inválido' } });
        const group = (REPORT_GROUPS.includes(req.query.group as ReportGroup) ? req.query.group : 'campaign') as ReportGroup;

        const [summary, grouped] = await Promise.all([
            buildSummary(source, range.since, range.until),
            buildGroupedRows(source, group, range.since, range.until),
        ]);
        res.json({ success: true, data: { ...range, group, summary, rows: grouped.rows, meta_live: grouped.live } });
    } catch (err: any) {
        logger.error('sales-report falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /tracking/sources/:id/orders?since&until&status&limit — pedidos recentes
router.get('/sources/:id/orders', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const range = reportRange(req.query);
        if (!range) return res.status(400).json({ success: false, error: { message: 'Período inválido' } });
        const status = typeof req.query.status === 'string' ? req.query.status : null;
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const rows = await query<any>(
            `SELECT id, platform, external_order_id, status, payment_method, product_name,
                    gross_value, net_value, currency, customer_name,
                    utm_source, utm_campaign, utm_medium, utm_content,
                    meta_campaign_id, meta_adset_id, meta_ad_id, purchase_event_id,
                    COALESCE(approved_at, order_created_at, created_at) AS order_date
             FROM tracking_orders
             WHERE source_id = $1
               AND (COALESCE(approved_at, order_created_at, created_at) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3
               AND (($4::text IS NULL AND status <> 'abandoned') OR status = $4)
             ORDER BY order_date DESC LIMIT $5`,
            [source.id, range.since, range.until, status, limit]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('orders list falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /tracking/sources/:id/recovery?since&until — carrinhos abandonados,
// Pix/boleto gerados e não pagos e compras recusadas, com contato do cliente
// e se já foi recuperado (o mesmo cliente comprou depois).
router.get('/sources/:id/recovery', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const range = reportRange(req.query);
        if (!range) return res.status(400).json({ success: false, error: { message: 'Período inválido' } });
        const rows = await query<any>(
            `SELECT o.id, o.status, o.payment_method, o.product_name, o.gross_value, o.net_value,
                    o.customer_name, o.customer_email, o.customer_phone, o.checkout_url,
                    o.utm_campaign, o.recovery_contacted_at,
                    o.raw->>'pix_expiration' AS pix_expiration,
                    o.raw->>'boleto_URL' AS boleto_url,
                    COALESCE(o.order_created_at, o.created_at) AS order_date,
                    r.id AS recovered_order_id, r.gross_value AS recovered_value, r.approved_at AS recovered_at
             FROM tracking_orders o
             LEFT JOIN tracking_orders r ON r.id = o.recovered_order_id
             WHERE o.source_id = $1
               AND o.status IN ('abandoned', 'pending', 'refused')
               AND (COALESCE(o.order_created_at, o.created_at) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3
             ORDER BY order_date DESC
             LIMIT 500`,
            [source.id, range.since, range.until]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('recovery list falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PATCH /tracking/sources/:id/orders/:orderId/contacted  { contacted: boolean }
router.patch('/sources/:id/orders/:orderId/contacted', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const contacted = req.body?.contacted !== false;
        const [row] = await query<any>(
            `UPDATE tracking_orders SET recovery_contacted_at = ${contacted ? 'NOW()' : 'NULL'}, updated_at = NOW()
             WHERE id = $1 AND source_id = $2 RETURNING id, recovery_contacted_at`,
            [req.params.orderId, source.id]
        );
        if (!row) return res.status(404).json({ success: false, error: { message: 'Pedido não encontrado' } });
        res.json({ success: true, data: row });
    } catch (err: any) {
        logger.error('recovery contacted falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PATCH /tracking/sources/:id/meta-objects/:metaId  { status?: 'ACTIVE'|'PAUSED', daily_budget?: number (R$) }
// Pausar/ativar e orçamento de campanha/conjunto/anúncio direto do relatório.
router.patch('/sources/:id/meta-objects/:metaId', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const { status, daily_budget } = req.body || {};
        if (status !== undefined && status !== 'ACTIVE' && status !== 'PAUSED') {
            return res.status(400).json({ success: false, error: { message: 'status deve ser ACTIVE ou PAUSED' } });
        }
        const budget = daily_budget !== undefined ? Number(daily_budget) : undefined;
        if (budget !== undefined && (!Number.isFinite(budget) || budget < 1)) {
            return res.status(400).json({ success: false, error: { message: 'Orçamento inválido (mínimo R$ 1)' } });
        }
        if (status === undefined && budget === undefined) {
            return res.status(400).json({ success: false, error: { message: 'Nada pra alterar' } });
        }
        await updateMetaObject(source, req.params.metaId, { status, daily_budget: budget });
        logger.info('vendas: objeto Meta alterado', { source: source.id, metaId: req.params.metaId, status, daily_budget: budget });
        res.json({ success: true, data: { id: req.params.metaId, status, daily_budget: budget } });
    } catch (err: any) {
        const msg = err.response?.data?.error?.error_user_msg || err.response?.data?.error?.message || err.message;
        logger.warn('vendas: alterar objeto Meta falhou', { error: msg });
        res.status(400).json({ success: false, error: { message: msg || 'Falha ao alterar na Meta' } });
    }
});

// GET /tracking/account-pixels?account_id=<uuid local> — pixels da conta de
// anúncio direto da Meta, com o token da conta já conectada. Cobre contas
// ativadas pelo login normal (o Cadastro Incorporado só descobre os pixels
// do BM que passou pelo fluxo dele).
router.get('/account-pixels', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const accountId = String(req.query.account_id || '');
        const [acc] = await query<any>(`SELECT meta_account_id FROM ad_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
        if (!acc) return res.status(404).json({ success: false, error: { message: 'Conta não encontrada' } });
        const token = await getUserAdsToken(userId);
        if (!token) return res.status(400).json({ success: false, error: { message: 'Conta Meta desconectada — reconecte em Contas' } });
        const r: any = await axios.get(`https://graph.facebook.com/v21.0/${actId(acc.meta_account_id)}/adspixels`, {
            params: { fields: 'id,name,last_fired_time', limit: 100, access_token: token },
            timeout: 20000,
        });
        const pixels = (r.data?.data || []).map((p: any) => ({
            pixel_id: String(p.id), pixel_name: p.name || String(p.id), last_fired_time: p.last_fired_time || null,
        }));
        res.json({ success: true, data: pixels });
    } catch (err: any) {
        const msg = err.response?.data?.error?.message || err.message;
        logger.warn('tracking: listar pixels da conta falhou', { error: msg });
        res.status(400).json({ success: false, error: { message: `Não consegui listar os pixels na Meta: ${msg}` } });
    }
});

// GET/PUT /tracking/sources/:id/sales-settings — imposto, custo por produto, regras do Purchase
router.get('/sources/:id/sales-settings', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const products = await query<{ product_name: string; orders: string }>(
            `SELECT product_name, COUNT(*) AS orders FROM tracking_orders
             WHERE source_id = $1 AND product_name IS NOT NULL
             GROUP BY 1 ORDER BY 2 DESC LIMIT 100`,
            [source.id]
        );
        res.json({ success: true, data: { settings: normalizeSalesSettings(source.sales_settings), products } });
    } catch (err: any) {
        logger.error('sales-settings get falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

router.put('/sources/:id/sales-settings', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const settings = normalizeSalesSettings({ ...normalizeSalesSettings(source.sales_settings), ...(req.body || {}) });
        await query(`UPDATE tracking_sources SET sales_settings = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(settings), source.id]);
        res.json({ success: true, data: settings });
    } catch (err: any) {
        logger.error('sales-settings put falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// Despesas adicionais (entram no lucro)
router.get('/sources/:id/expenses', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const range = reportRange(req.query);
        if (!range) return res.status(400).json({ success: false, error: { message: 'Período inválido' } });
        const rows = await query<any>(
            `SELECT id, to_char(expense_date, 'YYYY-MM-DD') AS expense_date, description, category, amount
             FROM tracking_expenses WHERE source_id = $1 AND expense_date BETWEEN $2 AND $3
             ORDER BY expense_date DESC, created_at DESC`,
            [source.id, range.since, range.until]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('expenses list falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

router.post('/sources/:id/expenses', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const { expense_date, description, category, amount } = req.body || {};
        const value = Number(amount);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expense_date || '')) || !String(description || '').trim() || !Number.isFinite(value) || value < 0) {
            return res.status(400).json({ success: false, error: { message: 'Preencha data, descrição e valor' } });
        }
        const [row] = await query<any>(
            `INSERT INTO tracking_expenses (source_id, expense_date, description, category, amount)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, to_char(expense_date, 'YYYY-MM-DD') AS expense_date, description, category, amount`,
            [source.id, expense_date, String(description).trim().slice(0, 200), category ? String(category).slice(0, 60) : null, value]
        );
        res.json({ success: true, data: row });
    } catch (err: any) {
        logger.error('expense create falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

router.delete('/sources/:id/expenses/:expenseId', async (req: Request, res: Response) => {
    try {
        const source = await loadReportSource(req.params.id, (req as any).user.userId);
        if (!source) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        await query(`DELETE FROM tracking_expenses WHERE id = $1 AND source_id = $2`, [req.params.expenseId, source.id]);
        res.json({ success: true });
    } catch (err: any) {
        logger.error('expense delete falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/crm-schema ──────────────────────────────────────────────
// Retorna quais campos são necessários para cada tipo de CRM
router.get('/crm-schema', async (req: Request, res: Response) => {
    const schema: Record<string, any> = {
        kommo: {
            name: 'Kommo',
            description: 'CRM Kommo com pipelines e status customizáveis',
            fields: [
                {
                    key: 'crm_subdomain',
                    label: 'Subdomínio Kommo',
                    type: 'text',
                    required: true,
                    placeholder: 'Ex: mapscar',
                    help: 'Se você acessa "mapscar.kommo.com", cole apenas "mapscar"',
                },
                {
                    key: 'crm_access_token',
                    label: 'Token de Acesso Kommo',
                    type: 'password',
                    required: true,
                    help: 'Kommo → Configurações → Integrações → Integrações privadas → Token de longa duração',
                },
            ],
            backfill_options: ['enrich_existing', 'sync_won_purchases', 'sync_leads'],
        },
        datacrazy: {
            name: 'DataCrazy',
            description: 'CRM DataCrazy com stages/fases e automação IA',
            fields: [
                {
                    key: 'crm_access_token',
                    label: 'API Key DataCrazy',
                    type: 'password',
                    required: true,
                    help: 'DataCrazy → https://crm.datacrazy.io → Settings → API → Generate Token',
                },
            ],
            backfill_options: ['enrich_existing', 'sync_won_purchases'],
            note: 'Stages de "Venda Ganha" serão detectadas automaticamente. Quando habilitado, Purchase events são enviados pra Meta CAPI pra otimizar seus anúncios.',
        },
    };
    res.json({ success: true, data: schema });
});

// ─── GET /tracking/diagnostics/summary ──────────────────────────────────────
// Central de Diagnóstico — status geral (saudável/atenção/crítico) de TODAS
// as fontes do usuário no período. Não é por fonte porque o objetivo é dar
// uma visão "o que deu errado hoje" de uma vez só.
router.get('/diagnostics/summary', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { since, until } = req.query as any;
        const untilDate = until ? new Date(until + 'T23:59:59') : new Date();
        const sinceDate = since ? new Date(since + 'T00:00:00') : new Date(untilDate.getTime() - 7 * 86400000);

        const summary = await getDiagnosticsSummary(userId, sinceDate, untilDate);
        res.json({ success: true, data: summary });
    } catch (err: any) {
        logger.error('tracking: diagnostics summary falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/diagnostics ───────────────────────────────────────────────
// Query: source_id?, severity?, event_type?, search?, since?, until?, limit?
router.get('/diagnostics', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const q = req.query as any;
        const events = await listDiagnosticEvents(userId, {
            sourceId: q.source_id || undefined,
            severity: q.severity || undefined,
            eventType: q.event_type || undefined,
            search: q.search || undefined,
            since: q.since ? new Date(q.since + 'T00:00:00') : undefined,
            until: q.until ? new Date(q.until + 'T23:59:59') : undefined,
            limit: q.limit ? Number(q.limit) : undefined,
        });
        res.json({ success: true, data: events });
    } catch (err: any) {
        logger.error('tracking: list diagnostics falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

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
// "Leads rastreados pelo WhatsApp" — busca por nome/telefone, filtro por
// situação (ativo/convertido) e etapa (só o que o Traffic AI de fato
// acompanha: conversa iniciada / venda registrada — não substitui o funil
// do CRM), paginado.
router.get('/sources/:id/whatsapp-leads', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { search, situacao, etapa, limit = '25', offset = '0' } = req.query as any;
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const whereParts: string[] = [`source_id = $1`];
        const params: any[] = [id];
        if (search) {
            const term = String(search).trim();
            if (term) {
                params.push(`%${term}%`);
                const i = params.length;
                whereParts.push(`(name ILIKE $${i} OR phone ILIKE $${i})`);
            }
        }
        if (situacao === 'convertido') whereParts.push(`purchase_event_id IS NOT NULL`);
        else if (situacao === 'ativo') whereParts.push(`purchase_event_id IS NULL`);
        if (etapa === 'iniciada') whereParts.push(`purchase_event_id IS NULL`);
        else if (etapa === 'convertida') whereParts.push(`purchase_event_id IS NOT NULL`);
        const whereSql = whereParts.join(' AND ');

        const lim = Math.min(parseInt(limit, 10) || 25, 200);
        const off = Math.max(parseInt(offset, 10) || 0, 0);

        const countRow = await query<{ total: string }>(
            `SELECT COUNT(*)::text AS total FROM tracking_whatsapp_leads WHERE ${whereSql}`,
            params
        );
        const total = Number(countRow[0]?.total || 0);

        params.push(lim, off);
        const rows = await query<any>(
            `SELECT id, phone, name, ctwa_clid, ad_source_id, ad_source_url,
                    ad_title, pixel_id, page_id, lead_meta_status, lead_meta_error,
                    purchase_event_id, purchase_value, purchase_at, kommo_lead_id,
                    campaign_id, meta_campaign_id, meta_campaign_name, meta_adset_name, ad_name,
                    updated_at, created_at
             FROM tracking_whatsapp_leads
             WHERE ${whereSql}
             ORDER BY created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );
        res.json({ success: true, data: rows, total, limit: lim, offset: off });
    } catch (err: any) {
        logger.error('tracking: whatsapp-leads falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/whatsapp-leads/:leadId ───────────────────────
// "Origem da venda" — detalhe completo de um lead: atribuição
// (campanha/conjunto/anúncio), criativo e jornada.
router.get('/sources/:id/whatsapp-leads/:leadId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id, leadId } = req.params;
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const rows = await query<any>(
            `SELECT * FROM tracking_whatsapp_leads WHERE id = $1 AND source_id = $2`,
            [leadId, id]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Lead não encontrado' } });
        const lead = rows[0];
        delete lead.raw_payload; // pode conter PII adicional do webhook — não expõe por padrão

        // Jornada — todo evento com o mesmo ctwa_clid nessa fonte (Lead inicial
        // + qualquer evento seguinte que o webhook genérico tenha enriquecido
        // com esse mesmo clique, ex: Purchase).
        const journey = lead.ctwa_clid
            ? await query<any>(
                `SELECT id, event_name, event_time, meta_status, value, currency, created_at
                 FROM tracking_events
                 WHERE source_id = $1 AND ctwa_clid = $2
                 ORDER BY created_at ASC`,
                [id, lead.ctwa_clid]
            )
            : [];

        res.json({ success: true, data: { ...lead, journey } });
    } catch (err: any) {
        logger.error('tracking: whatsapp-lead detail falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/purchase-reviews ─────────────────────────────
// Fila de vendas detectadas por mensagem de WhatsApp que precisam de
// confirmação humana antes de ir pra Meta (valor/pedido ambíguo, etc.) — mais
// o histórico de tudo que já foi processado (enviado, rejeitado, duplicado).
router.get('/sources/:id/purchase-reviews', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { status } = req.query as any;
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const rows = await listPurchaseReviews(id, status || undefined);
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('tracking: purchase-reviews falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tracking/sources/:id/purchase-reviews/:reviewId/approve ─────────
// Body opcional: { value?, order_id? } — corrige o que o parser não conseguiu
// resolver sozinho antes de disparar pra Meta.
router.post('/sources/:id/purchase-reviews/:reviewId/approve', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id, reviewId } = req.params;
        const { value, order_id } = req.body || {};
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const result = await approvePurchaseReview(id, reviewId, userId, {
            value: value != null ? Number(value) : undefined,
            orderId: order_id || undefined,
        });
        if (!result.ok) return res.status(400).json({ success: false, error: { message: result.error || 'Falha ao aprovar' } });
        res.json({ success: true, data: { approved: true } });
    } catch (err: any) {
        logger.error('tracking: approve purchase-review falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tracking/sources/:id/purchase-reviews/:reviewId/reject ──────────
router.post('/sources/:id/purchase-reviews/:reviewId/reject', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id, reviewId } = req.params;
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const result = await rejectPurchaseReview(id, reviewId, userId);
        if (!result.ok) return res.status(400).json({ success: false, error: { message: 'Revisão não encontrada ou já processada' } });
        res.json({ success: true, data: { rejected: true } });
    } catch (err: any) {
        logger.error('tracking: reject purchase-review falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/funnel ───────────────────────────────────────
router.get('/sources/:id/funnel', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const stages = await getFunnelConfiguration(id);
        res.json({ success: true, data: stages });
    } catch (err: any) {
        logger.error('tracking: get funnel falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── PUT /tracking/sources/:id/funnel ───────────────────────────────────────
// Body: { stages: [{ event_name, label, position, visible, default_value?, default_currency?, default_content_name? }] }
router.put('/sources/:id/funnel', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { stages } = req.body || {};
        const own = await query<any>(
            `SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        if (!Array.isArray(stages) || stages.length === 0) {
            return res.status(400).json({ success: false, error: { message: 'Informe ao menos um estágio' } });
        }
        for (const s of stages as FunnelStageInput[]) {
            if (!s.event_name?.trim() || !s.label?.trim()) {
                return res.status(400).json({ success: false, error: { message: 'Cada estágio precisa de event_name e label' } });
            }
        }

        const updated = await updateFunnelConfiguration(id, stages);
        res.json({ success: true, data: updated });
    } catch (err: any) {
        logger.error('tracking: update funnel falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/conversion-rules ─────────────────────────────
router.get('/sources/:id/conversion-rules', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const rules = await listConversionRules(id);
        res.json({ success: true, data: rules });
    } catch (err: any) {
        logger.error('tracking: list conversion-rules falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tracking/sources/:id/conversion-rules ────────────────────────────
router.post('/sources/:id/conversion-rules', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const { name, trigger_type, event_name } = req.body || {};
        if (!name?.trim() || !trigger_type || !event_name?.trim()) {
            return res.status(400).json({ success: false, error: { message: 'Informe nome, tipo de gatilho e evento' } });
        }
        const rule = await createConversionRule(id, req.body);
        res.json({ success: true, data: rule });
    } catch (err: any) {
        logger.error('tracking: create conversion-rule falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── PUT /tracking/sources/:id/conversion-rules/:ruleId ─────────────────────
router.put('/sources/:id/conversion-rules/:ruleId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id, ruleId } = req.params;
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const rule = await updateConversionRule(id, ruleId, req.body || {});
        if (!rule) return res.status(404).json({ success: false, error: { message: 'Regra não encontrada' } });
        res.json({ success: true, data: rule });
    } catch (err: any) {
        logger.error('tracking: update conversion-rule falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── DELETE /tracking/sources/:id/conversion-rules/:ruleId ──────────────────
router.delete('/sources/:id/conversion-rules/:ruleId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id, ruleId } = req.params;
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const ok = await deleteConversionRule(id, ruleId);
        if (!ok) return res.status(404).json({ success: false, error: { message: 'Regra não encontrada' } });
        res.json({ success: true, data: { deleted: true } });
    } catch (err: any) {
        logger.error('tracking: delete conversion-rule falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/conversion-rules/:ruleId/executions ──────────
router.get('/sources/:id/conversion-rules/:ruleId/executions', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id, ruleId } = req.params;
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const executions = await listRuleExecutions(id, ruleId);
        res.json({ success: true, data: executions });
    } catch (err: any) {
        logger.error('tracking: list rule-executions falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/whatsapp-labels ───────────────────────────────
// Labels sincronizadas da conexão Evolution vinculada a essa fonte — usado
// pelo seletor de "Nova regra" (trigger_type='whatsapp_label').
router.get('/sources/:id/whatsapp-labels', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const labels = await query<{ name: string }>(
            `SELECT DISTINCT el.name FROM evolution_labels el
             JOIN comm_integrations ci ON ci.id = el.integration_id
             WHERE ci.tracking_source_id = $1 AND el.deleted = FALSE
             ORDER BY el.name`,
            [id]
        );
        res.json({ success: true, data: labels.map(l => l.name) });
    } catch (err: any) {
        logger.error('tracking: list whatsapp-labels falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tracking/sources ─────────────────────────────────────────────────
router.post('/sources', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name, account_id, pixel_id, access_token, use_ads_token, test_event_code, domain } = req.body;
        if (!name) return res.status(400).json({ success: false, error: { message: 'Nome é obrigatório' } });

        // use_ads_token: reaproveita o token de Ads do Cadastro Incorporado
        // (mesmo Business Manager do pixel) em vez de exigir colar um token
        // separado do pixel — nunca passa pelo frontend, resolvido aqui.
        let effectiveToken: string | null = access_token || null;
        if (use_ads_token && !access_token) {
            const { authRepository } = await import('../auth/auth.repository');
            const user = await authRepository.findById(userId);
            if (!user?.access_token) {
                return res.status(400).json({ success: false, error: { message: 'Conta Meta Ads não conectada — conecte em Configurações antes de usar essa opção.' } });
            }
            effectiveToken = user.access_token;
        }

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
                effectiveToken ? encrypt(effectiveToken) : null,
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
            name, account_id, pixel_id, access_token, use_ads_token, test_event_code, domain, is_active,
            crm_type, crm_subdomain, crm_access_token, crm_config,
            google_ads_account_id,
        } = req.body;

        // use_ads_token: reaproveita o token de Ads do Cadastro Incorporado em
        // vez de exigir colar um token separado do pixel — resolvido aqui,
        // nunca passa pelo frontend.
        let effectiveAccessToken = access_token;
        if (use_ads_token && !access_token) {
            const { authRepository } = await import('../auth/auth.repository');
            const user = await authRepository.findById(userId);
            if (!user?.access_token) {
                return res.status(400).json({ success: false, error: { message: 'Conta Meta Ads não conectada — conecte em Configurações antes de usar essa opção.' } });
            }
            effectiveAccessToken = user.access_token;
        }

        // Validação: se crm_type está sendo setado, validar campos obrigatórios
        if (crm_type) {
            if (crm_type === 'kommo') {
                if (!crm_subdomain || !crm_access_token) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            message: 'Kommo: subdomínio e token de acesso são obrigatórios',
                            required_fields: ['crm_subdomain', 'crm_access_token'],
                        },
                    });
                }
            } else if (crm_type === 'datacrazy') {
                if (!crm_access_token) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            message: 'DataCrazy: API key é obrigatório',
                            required_fields: ['crm_access_token'],
                        },
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: `CRM não suportado: ${crm_type}. Use 'kommo' ou 'datacrazy'`,
                        supported: ['kommo', 'datacrazy'],
                    },
                });
            }
        }

        const fields: string[] = [];
        const params: any[] = [];
        let idx = 1;
        if (name !== undefined)             { fields.push(`name=$${idx++}`); params.push(name); }
        if (account_id !== undefined)       { fields.push(`account_id=$${idx++}`); params.push(account_id || null); }
        if (pixel_id !== undefined)         { fields.push(`pixel_id=$${idx++}`); params.push(pixel_id || null); }
        if (effectiveAccessToken !== undefined) { fields.push(`access_token=$${idx++}`); params.push(effectiveAccessToken ? encrypt(effectiveAccessToken) : null); }
        if (test_event_code !== undefined)  { fields.push(`test_event_code=$${idx++}`); params.push(test_event_code || null); }
        if (domain !== undefined)           { fields.push(`domain=$${idx++}`); params.push(domain || null); }
        if (is_active !== undefined)        { fields.push(`is_active=$${idx++}`); params.push(Boolean(is_active)); }
        if (crm_type !== undefined)         { fields.push(`crm_type=$${idx++}`); params.push(crm_type || null); }
        if (crm_subdomain !== undefined) {
            // Normaliza no save — user pode colar URL completa/domínio completo
            const norm = crm_subdomain ? normalizeKommoSubdomain(crm_subdomain) : null;
            fields.push(`crm_subdomain=$${idx++}`);
            params.push(norm || null);
        }
        if (crm_access_token !== undefined) { fields.push(`crm_access_token=$${idx++}`); params.push(crm_access_token || null); }
        if (crm_config !== undefined)       { fields.push(`crm_config=$${idx++}::jsonb`); params.push(JSON.stringify(crm_config || {})); }
        if (google_ads_account_id !== undefined) { fields.push(`google_ads_account_id=$${idx++}`); params.push(google_ads_account_id || null); }

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

// ─── Google Ads — mapeamento evento → conversion action ────────────────────
// Um evento (Lead, Purchase, ...) só sobe pro Google Ads quando existe um
// mapeamento ativo pra ele nessa fonte. Sem mapeamento, o evento continua
// indo normalmente pra Meta e simplesmente não tenta o Google.

// GET /tracking/sources/:id/google-conversion-actions
router.get('/sources/:id/google-conversion-actions', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const rows = await query<any>(
            `SELECT id, event_name, conversion_action_resource_name, is_active, created_at, updated_at
             FROM tracking_google_conversion_actions
             WHERE tracking_source_id = $1
             ORDER BY event_name ASC`,
            [id]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('tracking: listar conversion actions falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /tracking/sources/:id/google-conversion-actions
// Body: { event_name, conversion_action_resource_name }
router.post('/sources/:id/google-conversion-actions', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { event_name, conversion_action_resource_name } = req.body;
        if (!event_name || !conversion_action_resource_name) {
            return res.status(400).json({ success: false, error: { message: 'event_name e conversion_action_resource_name são obrigatórios' } });
        }
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const rows = await query<any>(
            `INSERT INTO tracking_google_conversion_actions (tracking_source_id, event_name, conversion_action_resource_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (tracking_source_id, event_name) DO UPDATE SET
                conversion_action_resource_name = EXCLUDED.conversion_action_resource_name,
                is_active = TRUE, updated_at = NOW()
             RETURNING id, event_name, conversion_action_resource_name, is_active, created_at, updated_at`,
            [id, event_name, conversion_action_resource_name]
        );
        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        logger.error('tracking: criar conversion action falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PATCH /tracking/google-conversion-actions/:mappingId
// Body: { conversion_action_resource_name?, is_active? }
router.patch('/google-conversion-actions/:mappingId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { mappingId } = req.params;
        const { conversion_action_resource_name, is_active } = req.body;

        const fields: string[] = [];
        const params: any[] = [];
        let idx = 1;
        if (conversion_action_resource_name !== undefined) { fields.push(`conversion_action_resource_name=$${idx++}`); params.push(conversion_action_resource_name); }
        if (is_active !== undefined) { fields.push(`is_active=$${idx++}`); params.push(Boolean(is_active)); }
        if (!fields.length) return res.status(400).json({ success: false, error: { message: 'Nada para atualizar' } });
        fields.push(`updated_at = NOW()`);

        params.push(mappingId, userId);
        const rows = await query<any>(
            `UPDATE tracking_google_conversion_actions m SET ${fields.join(', ')}
             FROM tracking_sources s
             WHERE m.id = $${idx++} AND m.tracking_source_id = s.id AND s.user_id = $${idx}
             RETURNING m.id, m.event_name, m.conversion_action_resource_name, m.is_active`,
            params
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        logger.error('tracking: atualizar conversion action falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /tracking/google-conversion-actions/:mappingId
router.delete('/google-conversion-actions/:mappingId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { mappingId } = req.params;
        await query(
            `DELETE FROM tracking_google_conversion_actions m
             USING tracking_sources s
             WHERE m.id = $1 AND m.tracking_source_id = s.id AND s.user_id = $2`,
            [mappingId, userId]
        );
        res.json({ success: true, data: { message: 'Removido' } });
    } catch (err: any) {
        logger.error('tracking: remover conversion action falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /tracking/sources/:id/retry-failed-google — retenta em batch eventos
// com falha no envio pro Google Ads (mesmo padrão do retry-failed do Meta).
router.post('/sources/:id/retry-failed-google', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const own = await query<any>(`SELECT id FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const result = await retryFailedGoogleBatch({ sourceId: id });
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking: retry-failed google falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /tracking/events/:eventId/retry-google
router.post('/events/:eventId/retry-google', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { eventId } = req.params;
        const own = await query<any>(
            `SELECT e.id FROM tracking_events e JOIN tracking_sources s ON e.source_id = s.id
             WHERE e.id = $1 AND s.user_id = $2`,
            [eventId, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const result = await retryGoogleEvent(eventId);
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking: retry evento google falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /tracking/sources/:id/test-google — dispara uma conversão de teste pro
// Google Ads pra validar credenciais OAuth/developer-token e o mapeamento de
// conversion action, mesmo espírito do POST /sources/:id/test (Meta). Sem
// gclid real informado, usa um valor fake — a Google deve rejeitar esse
// clique específico, mas o erro retornado já serve de diagnóstico (credencial
// inválida, developer-token sem acesso, conversion action errada, etc).
router.post('/sources/:id/test-google', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { event_name, gclid } = req.body || {};

        const src = await query<any>(`SELECT * FROM tracking_sources WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!src.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const source = src[0];

        if (!source.google_ads_account_id) {
            return res.status(400).json({ success: false, error: { message: 'Fonte sem conta Google Ads linkada' } });
        }

        const eventName = event_name || 'Lead';
        const mapping = await getConversionActionMapping(id, eventName);
        if (!mapping) {
            return res.status(400).json({ success: false, error: { message: `Sem conversion action mapeada para o evento "${eventName}"` } });
        }
        const customerId = await getLinkedGoogleAdsCustomerId(source.google_ads_account_id);
        if (!customerId) {
            return res.status(400).json({ success: false, error: { message: 'Conta Google Ads linkada não encontrada' } });
        }

        const result = await sendGoogleConversion(userId, customerId, {
            gclid: gclid || 'TEST_' + crypto.randomBytes(8).toString('hex'),
            conversionActionResourceName: mapping.conversion_action_resource_name,
            conversionDateTimeUnixSec: Math.floor(Date.now() / 1000),
            value: 1,
            currency: 'BRL',
            orderId: 'test-' + crypto.randomBytes(6).toString('hex'),
        });
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking: test-google falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: err.message } });
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
        let discoveredStages: string[] = [];

        // Kommo: tenta listar status de ganho
        if (src.crm_type === 'kommo') {
            try { wonStatuses = await adapter.findWonStatuses(); } catch { /* opcional */ }
        }
        // DataCrazy: tenta descobrir stages existentes
        else if (src.crm_type === 'datacrazy') {
            try {
                const { discoverDataCrazyStages } = await import('./crm-adapters/datacrazy.adapter');
                discoveredStages = await discoverDataCrazyStages(src.crm_access_token);
            } catch { /* opcional */ }
        }

        res.json({
            success: true,
            data: {
                account,
                won_statuses: wonStatuses,
                discovered_stages: discoveredStages,
            },
        });
    } catch (err: any) {
        logger.error('tracking: test CRM falhou', { error: err.message });
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// ─── POST /tracking/sources/:id/backfill ────────────────────────────────────
// Executa backfill. Body:
//   {
//     enrich_existing?: bool,      — busca PII no CRM pra eventos antigos sem email/phone
//     sync_won_purchases?: bool,   — dispara Purchase pra leads em status "ganho"
//     sync_leads?: bool,           — dispara Lead pra leads em estágios de qualificação
//     lead_stage_ids?: number[],   — se vazio, auto-detecta (regex "qualif|lead|novo|prospec|inicial")
//     time_strategy?: 'clamp_7d' | 'now' | 'original',
//   }
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
            sync_leads: Boolean(req.body?.sync_leads),
            lead_stage_ids: Array.isArray(req.body?.lead_stage_ids)
                ? req.body.lead_stage_ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
                : undefined,
            time_strategy: (req.body?.time_strategy || 'clamp_7d') as 'clamp_7d' | 'now' | 'original',
        };
        if (!opts.enrich_existing && !opts.sync_won_purchases && !opts.sync_leads) {
            return res.status(400).json({
                success: false,
                error: { message: 'Selecione ao menos uma opção (enriquecer, sincronizar Purchase ou sincronizar Lead)' },
            });
        }

        const result = await backfillSource(id, opts);
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('tracking: backfill falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// ─── GET /tracking/sources/:id/crm/pipelines ────────────────────────────────
// Lista pipelines + estágios do Kommo pro user escolher lead_stage_ids no backfill.
router.get('/sources/:id/crm/pipelines', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const rows = await query<any>(
            `SELECT * FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const src = rows[0];
        if (!src.crm_type || !src.crm_subdomain || !src.crm_access_token) {
            return res.status(400).json({ success: false, error: { message: 'CRM não configurado nessa fonte' } });
        }
        const adapter: any = getAdapter(src);
        const pipelines = await adapter.listPipelines();
        res.json({ success: true, data: { pipelines } });
    } catch (err: any) {
        logger.error('tracking: listar pipelines falhou', { error: err.message });
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
                   city, state, country, attribution_confidence, attribution_reason,
                   google_status, google_error, google_retry_count,
                   campaign_id, meta_campaign_name
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
                COUNT(*) FILTER (WHERE meta_status = 'failed' AND retry_count < 3) AS retry_pending,
                COUNT(*) FILTER (WHERE meta_status = 'failed' AND retry_count >= 3) AS retry_exhausted,
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
            `SELECT s.*, a.account_name AS meta_account_name, a.timezone AS account_timezone, a.currency AS account_currency
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
                COUNT(*) FILTER (WHERE event_name = 'Purchase' AND purchase_kind = 'first_purchase') AS first_purchase_count,
                COALESCE(SUM(value) FILTER (WHERE event_name = 'Purchase' AND purchase_kind = 'first_purchase'), 0) AS first_purchase_value,
                COUNT(*) FILTER (WHERE event_name = 'Purchase' AND purchase_kind = 'repurchase') AS repurchase_count,
                COALESCE(SUM(value) FILTER (WHERE event_name = 'Purchase' AND purchase_kind = 'repurchase'), 0) AS repurchase_value,
                COUNT(*) FILTER (WHERE event_name = 'Purchase' AND campaign_id IS NOT NULL) AS paid_sales_count,
                COALESCE(SUM(value) FILTER (WHERE event_name = 'Purchase' AND campaign_id IS NOT NULL), 0) AS paid_revenue,
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
        const firstPurchaseCount = Number(t.first_purchase_count) || 0;
        const firstPurchaseValue = Number(t.first_purchase_value) || 0;
        const repurchaseCount = Number(t.repurchase_count) || 0;
        const repurchaseValue = Number(t.repurchase_value) || 0;
        const paidRevenue = Number(t.paid_revenue) || 0;
        const organicRevenue = salesValue - paidRevenue;

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

        // Conversas Meta (reportadas pela própria Meta via Insights — ação
        // "onsite_conversion.messaging_conversation_started_7d") vs Conversas
        // reais (identificadas pelo nosso próprio tracking no WhatsApp) — são
        // números diferentes de propósito e nunca devem ser somados.
        let conversationsMeta = 0;
        if (source.account_id) {
            const convQ = await query<any>(
                `SELECT COALESCE(SUM((elem->>'value')::numeric), 0) AS total
                 FROM insights_history ih
                 JOIN campaigns c ON ih.campaign_id = c.id
                 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ih.actions, '[]'::jsonb)) AS elem
                 WHERE c.account_id = $1 AND ih.date BETWEEN $2 AND $3
                   AND elem->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d'`,
                [source.account_id, sinceStr, untilStr]
            );
            conversationsMeta = Number(convQ[0]?.total) || 0;
        }
        const convRealQ = await query<any>(
            `SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE ctwa_clid IS NOT NULL) AS attributed
             FROM tracking_whatsapp_leads
             WHERE source_id = $1 AND created_at BETWEEN $2 AND $3`,
            [id, startDate.toISOString(), endDate.toISOString()]
        );
        const conversationsReal = Number(convRealQ[0]?.total) || 0;
        // Taxa de rastreamento: das conversas reais recebidas, quantas o
        // sistema conseguiu atribuir a um clique de anúncio (ctwa_clid) —
        // mede qualidade do rastreamento, não qualidade do tráfego.
        const conversationsAttributed = Number(convRealQ[0]?.attributed) || 0;
        const trackingRate = conversationsReal > 0 ? (conversationsAttributed / conversationsReal) * 100 : null;

        // Custo por conversa (Meta e real) e por lead qualificado — mesmas
        // métricas do RastrackDash, cada uma só quando o denominador > 0
        // (evita divisão por zero virando Infinity no front).
        const costPerMetaConversation = conversationsMeta > 0 ? adSpend / conversationsMeta : null;
        const costPerRealConversation = conversationsReal > 0 ? adSpend / conversationsReal : null;
        const costPerQualifiedLead = qualifiedNum > 0 ? adSpend / qualifiedNum : null;

        // Indicadores derivados
        const cpl = leadsNum > 0 ? adSpend / leadsNum : 0;
        const cpa = salesCount > 0 ? adSpend / salesCount : 0;
        const conversionRate = leadsNum > 0 ? (salesCount / leadsNum) * 100 : 0;
        const qualifiedRate = leadsNum > 0 ? (qualifiedNum / leadsNum) * 100 : 0;
        const roiPct = adSpend > 0 ? ((salesValue - adSpend) / adSpend) * 100 : 0;
        const revenueMinusSpend = salesValue - adSpend;
        const roas = adSpend > 0 ? salesValue / adSpend : 0;
        // roas = "com recompra" (receita total / spend, já era assim). Adiciona
        // roas_acquisition = só primeira compra / spend — separa retorno de
        // AQUISIÇÃO (o que o anúncio realmente conquistou) de recompra de
        // cliente já existente, que o anúncio não influenciou.
        const roasAcquisition = adSpend > 0 ? firstPurchaseValue / adSpend : 0;
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

        // "Origem da venda" — leads/vendas por campanha real (só eventos com
        // campaign_id resolvido; ver migration 061). Spend vem de
        // insights_history (já sincronizado por campanha via Meta Insights),
        // então o ROAS aqui é por campanha de verdade, não a média da conta.
        const byCampaign = await query<any>(
            `SELECT e.campaign_id,
                    COALESCE(c.name, MAX(e.meta_campaign_name)) AS campaign_name,
                    COUNT(*) FILTER (WHERE e.event_name = 'Lead') AS leads,
                    COUNT(*) FILTER (WHERE e.event_name = 'Contact') AS qualified,
                    COUNT(*) FILTER (WHERE e.event_name = 'Purchase') AS sales_count,
                    COALESCE(SUM(e.value) FILTER (WHERE e.event_name = 'Purchase'), 0) AS sales_value
             FROM tracking_events e
             LEFT JOIN campaigns c ON c.id = e.campaign_id
             WHERE e.source_id = $1 AND e.created_at BETWEEN $2 AND $3 AND e.campaign_id IS NOT NULL
             GROUP BY e.campaign_id, c.name`,
            [id, startDate.toISOString(), endDate.toISOString()]
        );
        const campaignIds = byCampaign.map((r: any) => r.campaign_id);
        const campaignSpend = campaignIds.length
            ? await query<any>(
                `SELECT campaign_id, COALESCE(SUM(spend), 0) AS spend
                 FROM insights_history
                 WHERE campaign_id = ANY($1) AND date BETWEEN $2 AND $3
                 GROUP BY campaign_id`,
                [campaignIds, sinceStr, untilStr]
            )
            : [];
        const campaignConvMeta = campaignIds.length
            ? await query<any>(
                `SELECT ih.campaign_id, COALESCE(SUM((elem->>'value')::numeric), 0) AS total
                 FROM insights_history ih
                 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ih.actions, '[]'::jsonb)) AS elem
                 WHERE ih.campaign_id = ANY($1) AND ih.date BETWEEN $2 AND $3
                   AND elem->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d'
                 GROUP BY ih.campaign_id`,
                [campaignIds, sinceStr, untilStr]
            )
            : [];
        const campaignConvReal = campaignIds.length
            ? await query<any>(
                `SELECT campaign_id, COUNT(*) AS total FROM tracking_whatsapp_leads
                 WHERE campaign_id = ANY($1) AND created_at BETWEEN $2 AND $3
                 GROUP BY campaign_id`,
                [campaignIds, startDate.toISOString(), endDate.toISOString()]
            )
            : [];
        const spendByCampaign = new Map(campaignSpend.map((r: any) => [r.campaign_id, Number(r.spend) || 0]));
        const convMetaByCampaign = new Map(campaignConvMeta.map((r: any) => [r.campaign_id, Number(r.total) || 0]));
        const convRealByCampaign = new Map(campaignConvReal.map((r: any) => [r.campaign_id, Number(r.total) || 0]));
        const byCampaignOut = byCampaign.map((r: any) => {
            const spend = spendByCampaign.get(r.campaign_id) || 0;
            const leads = Number(r.leads) || 0;
            const salesN = Number(r.sales_count) || 0;
            const salesVal = Number(r.sales_value) || 0;
            return {
                campaign_id: r.campaign_id,
                campaign_name: r.campaign_name,
                leads,
                qualified: Number(r.qualified) || 0,
                sales_count: salesN, sales_value: salesVal,
                spend,
                conversations_meta: convMetaByCampaign.get(r.campaign_id) || 0,
                conversations_real: convRealByCampaign.get(r.campaign_id) || 0,
                cpl: leads > 0 ? spend / leads : 0,
                roas: spend > 0 ? salesVal / spend : 0,
            };
        }).sort((a, b) => b.sales_value - a.sales_value);
        // Eventos sem campanha resolvida — mantém o total explicável (não
        // "some" nenhum lead/venda da soma da conta).
        const unattributed = await query<any>(
            `SELECT COUNT(*) FILTER (WHERE event_name = 'Lead') AS leads,
                    COUNT(*) FILTER (WHERE event_name = 'Purchase') AS sales_count,
                    COALESCE(SUM(value) FILTER (WHERE event_name = 'Purchase'), 0) AS sales_value
             FROM tracking_events
             WHERE source_id = $1 AND created_at BETWEEN $2 AND $3 AND campaign_id IS NULL`,
            [id, startDate.toISOString(), endDate.toISOString()]
        );

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
                model_info: {
                    model: 'Click-to-WhatsApp determinístico (via ctwa_clid) — resto cai em "não atribuído"',
                    timezone: source.account_timezone || 'America/Sao_Paulo',
                    currency: source.account_currency || 'BRL',
                },
                kpis: {
                    leads: leadsNum,
                    qualified: qualifiedNum,
                    disqualified: Number(t.disqualified) || 0,
                    scheduled: Number(t.scheduled) || 0,
                    conversations_meta: conversationsMeta,
                    conversations_real: conversationsReal,
                    sales_count: salesCount,
                    sales_value: salesValue,
                    ad_spend: adSpend,
                    revenue_minus_spend: revenueMinusSpend,
                    roi_pct: roiPct,
                    roas,
                    roas_acquisition: roasAcquisition,
                    cpl, cpa,
                    conversion_rate: conversionRate,
                    qualified_rate: qualifiedRate,
                    avg_ticket: avgTicket,
                    events_sent: Number(t.events_sent) || 0,
                    events_failed: Number(t.events_failed) || 0,
                    avg_emq: t.avg_emq || 0,
                    first_purchase_count: firstPurchaseCount,
                    first_purchase_value: firstPurchaseValue,
                    repurchase_count: repurchaseCount,
                    repurchase_value: repurchaseValue,
                    paid_revenue: paidRevenue,
                    organic_revenue: organicRevenue,
                    tracking_rate: trackingRate,
                    cost_per_meta_conversation: costPerMetaConversation,
                    cost_per_real_conversation: costPerRealConversation,
                    cost_per_qualified_lead: costPerQualifiedLead,
                },
                daily,
                by_campaign: byCampaignOut,
                unattributed: {
                    leads: Number(unattributed[0]?.leads) || 0,
                    sales_count: Number(unattributed[0]?.sales_count) || 0,
                    sales_value: Number(unattributed[0]?.sales_value) || 0,
                },
            },
        });
    } catch (err: any) {
        logger.error('tracking: dashboard falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tracking/sources/:id/dashboard/export.csv ─────────────────────────
// CSV da performance por campanha no período — mesmos números da tabela
// "Performance" do dashboard (Investimento, Conversas Meta/reais, Lead
// qualificado, Compras, Receita, ROAS).
router.get('/sources/:id/dashboard/export.csv', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { since, until } = req.query as any;

        const src = await query<any>(
            `SELECT id, account_id FROM tracking_sources WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!src.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const source = src[0];

        const now = new Date();
        const endDate = until ? new Date(until + 'T23:59:59') : now;
        const startDate = since ? new Date(since + 'T00:00:00') : new Date(now.getTime() - 30 * 86400000);
        const sinceStr = startDate.toISOString().split('T')[0];
        const untilStr = endDate.toISOString().split('T')[0];

        const byCampaign = await query<any>(
            `SELECT e.campaign_id,
                    COALESCE(c.name, MAX(e.meta_campaign_name)) AS campaign_name,
                    COUNT(*) FILTER (WHERE e.event_name = 'Lead') AS leads,
                    COUNT(*) FILTER (WHERE e.event_name = 'Contact') AS qualified,
                    COUNT(*) FILTER (WHERE e.event_name = 'Purchase') AS sales_count,
                    COALESCE(SUM(e.value) FILTER (WHERE e.event_name = 'Purchase'), 0) AS sales_value
             FROM tracking_events e
             LEFT JOIN campaigns c ON c.id = e.campaign_id
             WHERE e.source_id = $1 AND e.created_at BETWEEN $2 AND $3 AND e.campaign_id IS NOT NULL
             GROUP BY e.campaign_id, c.name
             ORDER BY sales_value DESC`,
            [id, startDate.toISOString(), endDate.toISOString()]
        );
        const campaignIds = byCampaign.map((r: any) => r.campaign_id);
        const campaignSpend = campaignIds.length
            ? await query<any>(
                `SELECT campaign_id, COALESCE(SUM(spend), 0) AS spend FROM insights_history
                 WHERE campaign_id = ANY($1) AND date BETWEEN $2 AND $3 GROUP BY campaign_id`,
                [campaignIds, sinceStr, untilStr]
            )
            : [];
        const spendByCampaign = new Map(campaignSpend.map((r: any) => [r.campaign_id, Number(r.spend) || 0]));

        const header = ['Campanha', 'Leads', 'Lead qualificado', 'Compras', 'Receita', 'Investido', 'CPL', 'ROAS'];
        const csvEscape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [header.map(csvEscape).join(',')];
        for (const r of byCampaign) {
            const spend = spendByCampaign.get(r.campaign_id) || 0;
            const leads = Number(r.leads) || 0;
            const salesVal = Number(r.sales_value) || 0;
            lines.push([
                r.campaign_name || r.campaign_id,
                leads,
                Number(r.qualified) || 0,
                Number(r.sales_count) || 0,
                salesVal.toFixed(2),
                spend.toFixed(2),
                leads > 0 ? (spend / leads).toFixed(2) : '',
                spend > 0 ? (salesVal / spend).toFixed(2) : '',
            ].map(csvEscape).join(','));
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="performance-${sinceStr}-a-${untilStr}.csv"`);
        res.send('﻿' + lines.join('\r\n'));
    } catch (err: any) {
        logger.error('tracking: export csv falhou', { error: err.message });
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
