// ==============================
// TrafficAI — Report Controller
// ==============================

import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { reportService, ReportType, ReportService } from './report.service';
import { dailyWhatsAppService } from './daily-whatsapp.service';
import { logger } from '../shared/logger';

const router = Router();

// ─── ROTAS PÚBLICAS (sem auth) ─────────────────────────────────────────────

// GET /reports/public/:token — página pública do cliente
router.get('/public/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        const rows = await query<any>(
            `SELECT r.*, a.account_name, a.currency
             FROM client_reports r
             JOIN ad_accounts a ON r.account_id = a.id
             WHERE r.public_token = $1`,
            [token]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Relatório não encontrado' } });
        }

        const report = rows[0];

        // Incrementa visualizações
        await query(
            `UPDATE client_reports
             SET viewed_count = viewed_count + 1,
                 viewed_at = COALESCE(viewed_at, NOW()),
                 status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END
             WHERE id = $1`,
            [report.id]
        );

        res.json({ success: true, data: report });
    } catch (error: any) {
        logger.error('Erro ao buscar relatório público', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── ROTAS AUTENTICADAS ───────────────────────────────────────────────────

router.use(authMiddleware);

// GET /reports — lista todos os relatórios do usuário
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { account_id, type, limit = 20, offset = 0 } = req.query;

        let sql = `
            SELECT r.*, a.account_name
            FROM client_reports r
            JOIN ad_accounts a ON r.account_id = a.id
            WHERE r.user_id = $1
        `;
        const params: any[] = [userId];

        if (account_id) {
            params.push(account_id);
            sql += ` AND r.account_id = $${params.length}`;
        }
        if (type) {
            params.push(type);
            sql += ` AND r.type = $${params.length}`;
        }

        sql += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Number(limit), Number(offset));

        const reports = await query(sql, params);
        res.json({ success: true, data: reports });
    } catch (error: any) {
        logger.error('Erro ao listar relatórios', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /reports/:id — busca relatório por ID
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const rows = await query<any>(
            `SELECT r.*, a.account_name, a.currency
             FROM client_reports r
             JOIN ad_accounts a ON r.account_id = a.id
             WHERE r.id = $1 AND r.user_id = $2`,
            [id, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Relatório não encontrado' } });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /reports/generate-manual — gera relatório a partir de CSV do Meta ou texto livre
// Para contas NÃO conectadas ao perfil Meta do usuário.
router.post('/generate-manual', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const {
            type, period_start, period_end,
            csv_data, text_data,
            account_id, client_name, client_email, client_phone,
            primary_action,
        } = req.body;

        if (!type) {
            return res.status(400).json({ success: false, error: { message: 'type é obrigatório' } });
        }
        if (!csv_data && !text_data) {
            return res.status(400).json({ success: false, error: { message: 'Envie csv_data ou text_data' } });
        }
        if (!account_id && !client_name) {
            return res.status(400).json({ success: false, error: { message: 'Informe account_id ou client_name' } });
        }

        let start: Date, end: Date;
        if (period_start && period_end) {
            start = new Date(period_start);
            end = new Date(period_end);
        } else {
            const dates = ReportService.getPeriodDates(type as ReportType);
            start = dates.start;
            end = dates.end;
        }

        const reportId = await reportService.generateReportFromManualData(userId, {
            type: type as ReportType,
            period_start: start,
            period_end: end,
            csv_data, text_data,
            account_id: account_id || undefined,
            client_name, client_email, client_phone,
            primary_action: primary_action || undefined,
        });

        const rows = await query(
            `SELECT r.*, a.account_name
             FROM client_reports r
             LEFT JOIN ad_accounts a ON r.account_id = a.id
             WHERE r.id = $1`,
            [reportId]
        );
        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        logger.error('Erro ao gerar relatório manual', { error: err.message });
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// POST /reports/generate — gera relatório manualmente
router.post('/generate', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { account_id, type, period_start, period_end } = req.body;

        if (!account_id || !type) {
            return res.status(400).json({ success: false, error: { message: 'account_id e type são obrigatórios' } });
        }

        let start: Date, end: Date;
        if (period_start && period_end) {
            start = new Date(period_start);
            end = new Date(period_end);
        } else {
            const dates = ReportService.getPeriodDates(type as ReportType);
            start = dates.start;
            end = dates.end;
        }

        logger.info(`[GENERATE] userId=${userId} account_id=${account_id} type=${type}`);
        const reportId = await reportService.generateReport(userId, account_id, type as ReportType, start, end);

        const report = await query(
            `SELECT r.*, a.account_name FROM client_reports r JOIN ad_accounts a ON r.account_id = a.id WHERE r.id = $1`,
            [reportId]
        );

        res.json({ success: true, data: report[0] });
    } catch (error: any) {
        logger.error('Erro ao gerar relatório', { error: error.message });
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

// POST /reports/:id/send — envia relatório por email
router.post('/:id/send', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { email } = req.body;

        // Verifica propriedade
        const rows = await query(`SELECT id FROM client_reports WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Relatório não encontrado' } });

        await reportService.sendReportByEmail(id, email);

        res.json({ success: true, data: { message: 'Relatório enviado com sucesso' } });
    } catch (error: any) {
        logger.error('Erro ao enviar relatório', { error: error.message });
        res.status(400).json({ success: false, error: { message: error.message } });
    }
});

// POST /reports/:id/send-whatsapp — gera link WhatsApp e registra envio
router.post('/:id/send-whatsapp', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { phone, base_url } = req.body;

        const rows = await query<any>(
            `SELECT r.*, a.account_name FROM client_reports r
             JOIN ad_accounts a ON r.account_id = a.id
             WHERE r.id = $1 AND r.user_id = $2`,
            [id, userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Relatório não encontrado' } });

        const report = rows[0];
        const recipient = phone || report.client_phone;
        if (!recipient) return res.status(400).json({ success: false, error: { message: 'Número ou link do grupo não informado' } });

        const frontendBase = base_url || process.env.FRONTEND_URL || 'http://localhost:3000';
        const publicUrl = `${frontendBase}/report/${report.public_token}`;
        const isGroup = recipient.startsWith('https://chat.whatsapp.com/');

        let waLink: string;
        let recipientLabel: string;

        if (isGroup) {
            // Grupo: abre o link do grupo (mensagem copiada pelo frontend)
            waLink = recipient;
            recipientLabel = recipient;
        } else {
            // Contato individual: gera wa.me com mensagem pré-preenchida
            const digits = recipient.replace(/\D/g, '');
            const normalizedPhone = digits.startsWith('55') ? digits : `55${digits}`;
            const clientName = report.client_name ? ` para ${report.client_name}` : '';
            const typeLabel = report.type === 'daily' ? 'diário' : report.type === 'weekly' ? 'semanal' : 'mensal';
            const message = encodeURIComponent(
                `Olá${clientName}! 👋\n\nSeu relatório ${typeLabel} de tráfego pago está pronto.\n\n` +
                `📊 ${report.title}\n\n` +
                `Acesse aqui: ${publicUrl}`
            );
            waLink = `https://wa.me/${normalizedPhone}?text=${message}`;
            recipientLabel = normalizedPhone;
        }

        // Atualiza status do relatório
        await query(
            `UPDATE client_reports SET status = 'sent', sent_at = COALESCE(sent_at, NOW()) WHERE id = $1`,
            [id]
        );

        // Registra no histórico de envios (requer migration 009)
        try {
            await query(
                `INSERT INTO report_sends (report_id, user_id, channel, recipient, status)
                 VALUES ($1, $2, 'whatsapp', $3, 'sent')`,
                [id, userId, recipient]
            );
        } catch (histErr: any) {
            logger.warn('report_sends não disponível ainda (rode a migration 009)', { error: histErr.message });
        }

        logger.info(`📱 Link WhatsApp gerado para relatório ${id} → ${recipientLabel} (${isGroup ? 'grupo' : 'contato'})`);
        res.json({ success: true, data: { wa_link: waLink, is_group: isGroup, public_url: publicUrl } });
    } catch (error: any) {
        logger.error('Erro ao gerar link WhatsApp', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /reports/:id/sends — histórico de envios do relatório
router.get('/:id/sends', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        // Verifica propriedade
        const owns = await query(`SELECT id FROM client_reports WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (!owns.length) return res.status(404).json({ success: false, error: { message: 'Relatório não encontrado' } });

        let sends: any[] = [];
        try {
            sends = await query(
                `SELECT id, channel, recipient, sent_at, status
                 FROM report_sends WHERE report_id = $1 ORDER BY sent_at DESC`,
                [id]
            );
        } catch {
            // tabela ainda não existe — retorna array vazio
        }

        res.json({ success: true, data: sends });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PATCH /reports/:id — atualiza dados do relatório (incluindo edição completa)
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const {
            client_name, client_email, client_phone, public_title,
            custom_note, edited_analysis, edited_recommendations,
            selected_campaign_ids, show_campaign_table, show_ai_analysis,
        } = req.body;

        await query(
            `UPDATE client_reports
             SET client_name = COALESCE($3, client_name),
                 client_email = COALESCE($4, client_email),
                 client_phone = COALESCE($5, client_phone),
                 public_title = COALESCE($6, public_title),
                 custom_note = $7,
                 edited_analysis = $8,
                 edited_recommendations = $9,
                 selected_campaign_ids = $10,
                 show_campaign_table = COALESCE($11, show_campaign_table),
                 show_ai_analysis = COALESCE($12, show_ai_analysis),
                 updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [
                id, userId,
                client_name ?? null, client_email ?? null, client_phone ?? null, public_title ?? null,
                custom_note ?? null,
                edited_analysis ?? null,
                edited_recommendations != null ? JSON.stringify(edited_recommendations) : null,
                selected_campaign_ids != null ? JSON.stringify(selected_campaign_ids) : null,
                show_campaign_table ?? null,
                show_ai_analysis ?? null,
            ]
        );

        const updated = await query(
            `SELECT r.*, a.account_name FROM client_reports r JOIN ad_accounts a ON r.account_id = a.id WHERE r.id = $1`,
            [id]
        );

        res.json({ success: true, data: updated[0] });
    } catch (error: any) {
        logger.error('Erro ao atualizar relatório', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /reports/:id/campaigns — campanhas disponíveis para o relatório (com métricas do período)
router.get('/:id/campaigns', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const reportRows = await query<any>(
            `SELECT r.account_id, r.period_start, r.period_end, r.selected_campaign_ids
             FROM client_reports r WHERE r.id = $1 AND r.user_id = $2`,
            [id, userId]
        );
        if (!reportRows.length) return res.status(404).json({ success: false, error: { message: 'Relatório não encontrado' } });

        const { account_id, period_start, period_end, selected_campaign_ids } = reportRows[0];

        const campaigns = await query<any>(`
            SELECT
                c.id, c.name, c.objective, c.status,
                COALESCE(SUM(ih.spend), 0) as spend,
                COALESCE(SUM(ih.conversions), 0) as conversions,
                COALESCE(SUM(ih.clicks), 0) as clicks,
                COALESCE(SUM(ih.impressions), 0) as impressions,
                COALESCE(AVG(NULLIF(ih.roas, 0)), 0) as roas,
                COALESCE(AVG(NULLIF(ih.ctr, 0)), 0) as ctr
            FROM campaigns c
            LEFT JOIN insights_history ih ON ih.campaign_id = c.id
                AND ih.date BETWEEN $2 AND $3
            WHERE c.account_id = $1
            GROUP BY c.id, c.name, c.objective, c.status
            ORDER BY spend DESC
        `, [account_id, period_start, period_end]);

        const selectedIds: string[] | null = selected_campaign_ids;

        res.json({
            success: true,
            data: campaigns.map(c => ({
                ...c,
                selected: selectedIds ? selectedIds.includes(c.id) : true,
            }))
        });
    } catch (error: any) {
        logger.error('Erro ao buscar campanhas do relatório', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /reports/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        await query(`DELETE FROM client_reports WHERE id = $1 AND user_id = $2`, [id, userId]);
        res.json({ success: true, data: { message: 'Relatório removido' } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── CONFIGURAÇÕES DE RELATÓRIO ───────────────────────────────────────────

// GET /reports/settings/:account_id
router.get('/settings/:account_id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { account_id } = req.params;

        const rows = await query(
            `SELECT * FROM report_settings WHERE account_id = $1 AND user_id = $2`,
            [account_id, userId]
        );

        res.json({ success: true, data: rows[0] || null });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /reports/settings/:account_id
router.put('/settings/:account_id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { account_id } = req.params;
        const {
            client_name, client_email, client_phone,
            daily_enabled, weekly_enabled, monthly_enabled,
            auto_send_email, auto_send_whatsapp, daily_whatsapp_enabled,
            agency_name, custom_message,
        } = req.body;

        // Salva campos base (colunas da migration 006 — sempre existem)
        await query(
            `INSERT INTO report_settings (
                user_id, account_id, client_name, client_email,
                daily_enabled, weekly_enabled, monthly_enabled,
                auto_send_email,
                agency_name, custom_message, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
            ON CONFLICT (account_id) DO UPDATE SET
                client_name = EXCLUDED.client_name,
                client_email = EXCLUDED.client_email,
                daily_enabled = EXCLUDED.daily_enabled,
                weekly_enabled = EXCLUDED.weekly_enabled,
                monthly_enabled = EXCLUDED.monthly_enabled,
                auto_send_email = EXCLUDED.auto_send_email,
                agency_name = EXCLUDED.agency_name,
                custom_message = EXCLUDED.custom_message,
                updated_at = NOW()`,
            [
                userId, account_id,
                client_name || null, client_email || null,
                daily_enabled ?? false, weekly_enabled ?? true, monthly_enabled ?? true,
                auto_send_email ?? false,
                agency_name || 'TrafficAI',
                custom_message || null,
            ]
        );

        // Salva client_phone e auto_send_whatsapp (migration 009)
        try {
            await query(
                `UPDATE report_settings SET client_phone = $1, auto_send_whatsapp = $2 WHERE account_id = $3 AND user_id = $4`,
                [client_phone || null, auto_send_whatsapp ?? false, account_id, userId]
            );
        } catch { /* colunas ainda não existem — migration 009 pendente */ }

        // Salva daily_whatsapp_enabled (migration 010)
        try {
            await query(
                `UPDATE report_settings SET daily_whatsapp_enabled = $1 WHERE account_id = $2 AND user_id = $3`,
                [daily_whatsapp_enabled ?? false, account_id, userId]
            );
        } catch { /* coluna ainda não existe — migration 010 pendente */ }

        res.json({ success: true, data: { message: 'Configurações salvas' } });
    } catch (error: any) {
        logger.error('Erro ao salvar configurações de relatório', { error: error.message });
        res.status(500).json({ success: false, error: { message: error.message || 'Erro interno' } });
    }
});

// ─── RELATÓRIO DIÁRIO EM TEXTO VIA WHATSAPP ───────────────────────────────

// POST /reports/daily-whatsapp/send-account — envia para uma conta específica (teste manual)
router.post('/daily-whatsapp/send-account', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { account_id, date, phone } = req.body;

        if (!account_id) {
            return res.status(400).json({ success: false, error: { message: 'account_id obrigatório' } });
        }

        const result = await dailyWhatsAppService.sendForAccount(userId, account_id, date, phone);

        res.json({ success: true, data: { message: 'Relatório diário enviado com sucesso', preview: result.message } });
    } catch (error: any) {
        logger.error('Erro ao enviar relatório diário WhatsApp', { error: error.message });
        res.status(500).json({ success: false, error: { message: error.message || 'Erro interno' } });
    }
});

export const reportController = router;
