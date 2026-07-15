// ==============================
// TrafficAI — Report Controller
// ==============================

import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { reportService, ReportType, ReportService } from './report.service';
import { dailyWhatsAppService, TEMPLATE_VARIABLES, getDefaultTemplate, renderTemplate, buildTemplateVars } from './daily-whatsapp.service';
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
             LEFT JOIN ad_accounts a ON r.account_id = a.id
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
            LEFT JOIN ad_accounts a ON r.account_id = a.id
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
             LEFT JOIN ad_accounts a ON r.account_id = a.id
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
            `SELECT r.*, a.account_name FROM client_reports r LEFT JOIN ad_accounts a ON r.account_id = a.id WHERE r.id = $1`,
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
             LEFT JOIN ad_accounts a ON r.account_id = a.id
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
            `SELECT r.*, a.account_name FROM client_reports r LEFT JOIN ad_accounts a ON r.account_id = a.id WHERE r.id = $1`,
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
            daily_whatsapp_time,
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

        // Salva daily_whatsapp_time (migration 031)
        if (daily_whatsapp_time) {
            const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(daily_whatsapp_time);
            if (validTime) {
                try {
                    await query(
                        `UPDATE report_settings SET daily_whatsapp_time = $1 WHERE account_id = $2 AND user_id = $3`,
                        [daily_whatsapp_time, account_id, userId]
                    );
                } catch { /* migration 031 pendente */ }
            }
        }

        // Toggles semanal/mensal/cobrança (migration 044)
        const {
            weekly_report_enabled, weekly_report_day,
            monthly_report_enabled, monthly_report_day,
            billing_alert_enabled, billing_alert_min_interval_hours,
            report_owner_phone,
        } = req.body;
        const toggleFields: string[] = [];
        const toggleParams: any[] = [];
        let ti = 1;
        if (weekly_report_enabled !== undefined) { toggleFields.push(`weekly_report_enabled = $${ti++}`); toggleParams.push(Boolean(weekly_report_enabled)); }
        if (weekly_report_day !== undefined) { toggleFields.push(`weekly_report_day = $${ti++}`); toggleParams.push(Number(weekly_report_day)); }
        if (monthly_report_enabled !== undefined) { toggleFields.push(`monthly_report_enabled = $${ti++}`); toggleParams.push(Boolean(monthly_report_enabled)); }
        if (monthly_report_day !== undefined) { toggleFields.push(`monthly_report_day = $${ti++}`); toggleParams.push(Number(monthly_report_day)); }
        if (billing_alert_enabled !== undefined) { toggleFields.push(`billing_alert_enabled = $${ti++}`); toggleParams.push(Boolean(billing_alert_enabled)); }
        if (billing_alert_min_interval_hours !== undefined) { toggleFields.push(`billing_alert_min_interval_hours = $${ti++}`); toggleParams.push(Number(billing_alert_min_interval_hours)); }
        if (report_owner_phone !== undefined) { toggleFields.push(`report_owner_phone = $${ti++}`); toggleParams.push(report_owner_phone || null); }
        if (toggleFields.length > 0) {
            try {
                toggleParams.push(account_id, userId);
                await query(
                    `UPDATE report_settings SET ${toggleFields.join(', ')} WHERE account_id = $${ti++} AND user_id = $${ti}`,
                    toggleParams
                );
            } catch (e: any) { logger.warn('toggles report_settings falhou (migration 044 pendente?)', { error: e.message }); }
        }

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

// ─── WHATSAPP DIÁRIO — CONFIGURAÇÕES POR CONTA ─────────────────────────────

// GET /reports/whatsapp/variables — lista de placeholders disponíveis no template
router.get('/whatsapp/variables', (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            variables: TEMPLATE_VARIABLES,
            default_template: getDefaultTemplate(),
        },
    });
});

// GET /reports/whatsapp/accounts — lista todas as contas do usuário com seu status
// de configuração do WhatsApp diário (ativo/inativo, telefone, horário, template custom?)
router.get('/whatsapp/accounts', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const rows = await query<any>(
            `SELECT
                a.id AS account_id,
                a.account_name,
                a.meta_account_id,
                a.is_client_active,
                COALESCE(rs.client_name, a.account_name) AS client_name,
                rs.client_phone,
                rs.daily_whatsapp_enabled,
                COALESCE(rs.daily_whatsapp_time, '11:15') AS daily_whatsapp_time,
                rs.daily_whatsapp_last_sent_date,
                (rs.daily_whatsapp_template IS NOT NULL AND rs.daily_whatsapp_template <> '') AS has_custom_template
             FROM ad_accounts a
             LEFT JOIN report_settings rs ON rs.account_id = a.id
             WHERE a.user_id = $1
             ORDER BY a.account_name ASC`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('Erro ao listar contas WhatsApp', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /reports/whatsapp/settings/:accountId — config completa (incluindo template)
router.get('/whatsapp/settings/:accountId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { accountId } = req.params;

        // Verifica ownership
        const own = await query<any>(
            `SELECT id, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2`,
            [accountId, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Conta não encontrada' } });

        const rows = await query<any>(
            `SELECT
                rs.id, rs.account_id, rs.client_name, rs.client_phone,
                rs.daily_whatsapp_enabled,
                COALESCE(rs.daily_whatsapp_time, '11:15') AS daily_whatsapp_time,
                rs.daily_whatsapp_last_sent_date,
                rs.daily_whatsapp_template
             FROM report_settings rs
             WHERE rs.account_id = $1`,
            [accountId]
        );

        const settings = rows[0] || {
            account_id: accountId,
            client_name: own[0].account_name,
            client_phone: null,
            daily_whatsapp_enabled: false,
            daily_whatsapp_time: '11:15',
            daily_whatsapp_last_sent_date: null,
            daily_whatsapp_template: null,
        };

        res.json({
            success: true,
            data: {
                ...settings,
                effective_template: settings.daily_whatsapp_template || getDefaultTemplate(),
                default_template: getDefaultTemplate(),
            },
        });
    } catch (err: any) {
        logger.error('Erro ao buscar settings WhatsApp', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /reports/whatsapp/settings/:accountId — atualiza qualquer combinação dos campos
// Body: { client_name?, client_phone?, daily_whatsapp_enabled?, daily_whatsapp_time?, daily_whatsapp_template? }
// Para limpar o template e voltar pro default: enviar daily_whatsapp_template: null
router.put('/whatsapp/settings/:accountId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { accountId } = req.params;
        const { client_name, client_phone, daily_whatsapp_enabled, daily_whatsapp_time, daily_whatsapp_template } = req.body;

        // Ownership
        const own = await query<any>(
            `SELECT id FROM ad_accounts WHERE id = $1 AND user_id = $2`,
            [accountId, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Conta não encontrada' } });

        // Validação leve do horário (HH:MM)
        if (daily_whatsapp_time !== undefined && daily_whatsapp_time !== null) {
            if (!/^\d{2}:\d{2}$/.test(String(daily_whatsapp_time))) {
                return res.status(400).json({ success: false, error: { message: 'Horário inválido. Use HH:MM (24h, UTC).' } });
            }
        }

        // Upsert
        const exists = await query<any>(`SELECT id FROM report_settings WHERE account_id = $1`, [accountId]);

        if (exists.length === 0) {
            await query(
                `INSERT INTO report_settings
                 (user_id, account_id, client_name, client_phone, daily_whatsapp_enabled, daily_whatsapp_time, daily_whatsapp_template)
                 VALUES ($1, $2, $3, $4, COALESCE($5, false), COALESCE($6, '11:15'), $7)`,
                [
                    userId, accountId,
                    client_name ?? null,
                    client_phone ?? null,
                    daily_whatsapp_enabled,
                    daily_whatsapp_time,
                    // null explícito limpa o template
                    daily_whatsapp_template === undefined ? null : daily_whatsapp_template,
                ]
            );
        } else {
            const fields: string[] = [];
            const params: any[] = [];
            let idx = 1;
            if (client_name !== undefined)             { fields.push(`client_name = $${idx++}`); params.push(client_name); }
            if (client_phone !== undefined)            { fields.push(`client_phone = $${idx++}`); params.push(client_phone); }
            if (daily_whatsapp_enabled !== undefined)  { fields.push(`daily_whatsapp_enabled = $${idx++}`); params.push(Boolean(daily_whatsapp_enabled)); }
            if (daily_whatsapp_time !== undefined)     { fields.push(`daily_whatsapp_time = $${idx++}`); params.push(daily_whatsapp_time); }
            if (daily_whatsapp_template !== undefined) { fields.push(`daily_whatsapp_template = $${idx++}`); params.push(daily_whatsapp_template); }
            if (fields.length === 0) {
                return res.status(400).json({ success: false, error: { message: 'Nada para atualizar' } });
            }
            fields.push(`updated_at = NOW()`);
            params.push(accountId);
            await query(
                `UPDATE report_settings SET ${fields.join(', ')} WHERE account_id = $${idx}`,
                params
            );
        }

        const updated = await query<any>(
            `SELECT id, account_id, client_name, client_phone,
                    daily_whatsapp_enabled,
                    COALESCE(daily_whatsapp_time, '11:15') AS daily_whatsapp_time,
                    daily_whatsapp_template
             FROM report_settings WHERE account_id = $1`,
            [accountId]
        );

        res.json({
            success: true,
            data: {
                ...updated[0],
                effective_template: updated[0]?.daily_whatsapp_template || getDefaultTemplate(),
                default_template: getDefaultTemplate(),
            },
        });
    } catch (err: any) {
        logger.error('Erro ao atualizar settings WhatsApp', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /reports/whatsapp/preview/:accountId — renderiza preview da mensagem
// Body opcional: { template?: string } — se vier, usa esse em vez do salvo
// Sempre usa dados de EXEMPLO (não dados reais) pra preview ser rápido e não falhar
// quando ainda não tem insights coletados.
router.post('/whatsapp/preview/:accountId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { accountId } = req.params;

        const acc = await query<any>(
            `SELECT a.account_name, rs.client_name, rs.daily_whatsapp_template
             FROM ad_accounts a
             LEFT JOIN report_settings rs ON rs.account_id = a.id
             WHERE a.id = $1 AND a.user_id = $2`,
            [accountId, userId]
        );
        if (!acc.length) return res.status(404).json({ success: false, error: { message: 'Conta não encontrada' } });

        const template = typeof req.body?.template === 'string'
            ? req.body.template
            : (acc[0].daily_whatsapp_template || getDefaultTemplate());

        const clientName = acc[0].client_name || acc[0].account_name || 'Cliente';

        // Dados de exemplo realistas
        const sampleVars = buildTemplateVars({
            client_name: clientName,
            greeting: 'Bom dia',
            today:  { metrics: { spend: 1234.56, impressions: 12345, leads: 23, cost_per_lead: 53.67, primary_action_label: 'leads', ctr: 0, cpc: 0, cpm: 0, roas: 0, conversions: 23 } as any, label: '28/06' },
            last7d: { metrics: { spend: 8500.00, impressions: 85300, leads: 142, cost_per_lead: 59.86, primary_action_label: 'leads', ctr: 0, cpc: 0, cpm: 0, roas: 0, conversions: 142 } as any, label: '22/06 a 28/06' },
            month:  { metrics: { spend: 24180.00, impressions: 320500, leads: 412, cost_per_lead: 58.69, primary_action_label: 'leads', ctr: 0, cpc: 0, cpm: 0, roas: 0, conversions: 412 } as any, label: '01/06 a 28/06' },
            activeAds: 8,
        });

        const rendered = renderTemplate(template, sampleVars);

        res.json({
            success: true,
            data: {
                preview: rendered,
                vars_used: Object.fromEntries(Object.entries(sampleVars).map(([k, v]) => [k, String(v)])),
            },
        });
    } catch (err: any) {
        logger.error('Erro ao gerar preview WhatsApp', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /reports/whatsapp/send-now/:accountId — dispara o envio AGORA (manual)
// Útil pra testar a config sem esperar o horário agendado.
router.post('/whatsapp/send-now/:accountId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { accountId } = req.params;
        const own = await query<any>(
            `SELECT id FROM ad_accounts WHERE id = $1 AND user_id = $2`,
            [accountId, userId]
        );
        if (!own.length) return res.status(404).json({ success: false, error: { message: 'Conta não encontrada' } });

        // O service tem método sendDailyReports() mas dispara pra TODAS as habilitadas.
        // Pra disparar pra UMA conta específica, chamamos o método específico.
        await dailyWhatsAppService.sendNowForAccount(accountId);
        res.json({ success: true, data: { sent: true } });
    } catch (err: any) {
        logger.error('Erro send-now WhatsApp', { error: err.message });
        res.status(500).json({ success: false, error: { message: err.message || 'Erro interno' } });
    }
});

export const reportController = router;
