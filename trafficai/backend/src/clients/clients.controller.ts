// ==============================
// TrafficAI — Clients Controller
// ==============================

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';
import {
    getOrCreateDefaultTemplate, renderTemplate, generateContractPdf, saveGeneratedContract,
    formatCurrencyBRL, valorPorExtenso, ContractVars,
} from './contract-generator.service';
import { zapsignCreateDocument } from './zapsign.client';
import { decryptMaybe } from '../shared/encryption';

const router = Router();
router.use(authMiddleware);

// GET /clients/contracts/all — all contracts (must be before /:id routes)
router.get('/contracts/all', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const rows = await query<any>(
            `SELECT c.*, cl.name as client_name, cl.avatar_color
             FROM contracts c
             JOIN clients cl ON c.client_id = cl.id
             WHERE c.user_id = $1
             ORDER BY cl.name, c.created_at DESC`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /clients/contract-template — modelo padrão de contrato (cria se não existir)
router.get('/contract-template', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const template = await getOrCreateDefaultTemplate(userId);
        res.json({ success: true, data: template });
    } catch (error: any) {
        logger.error('Erro ao buscar modelo de contrato', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /clients/contract-template/:id — edita o texto do modelo
router.put('/contract-template/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { content } = req.body as { content?: string };
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, error: { message: 'Conteúdo é obrigatório' } });
        }
        const rows = await query<any>(
            `UPDATE contract_templates SET content = $3, updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING id, name, content`,
            [id, userId, content]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Modelo não encontrado' } });
        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao atualizar modelo de contrato', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /clients/generated-contracts/:id/download — baixa o PDF já gerado (must be before /:id)
router.get('/generated-contracts/:id/download', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const row = await queryOne<{ filename: string; file_data: Buffer }>(
            `SELECT gc.filename, gc.file_data
             FROM generated_contracts gc
             JOIN contracts c ON c.id = gc.contract_id
             WHERE gc.id = $1 AND c.user_id = $2`,
            [id, userId]
        );
        if (!row) return res.status(404).json({ success: false, error: { message: 'Contrato gerado não encontrado' } });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
        res.send(row.file_data);
    } catch (error: any) {
        logger.error('Erro ao baixar contrato gerado', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /clients/generated-contracts/:id/send-for-signature — envia o PDF já gerado
// pra ZapSign e devolve o link de assinatura (must be before /:id)
router.post('/generated-contracts/:id/send-for-signature', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const row = await queryOne<{ filename: string; file_data: Buffer; client_name: string; client_email: string | null; client_phone: string | null }>(
            `SELECT gc.filename, gc.file_data, cl.name as client_name, cl.email as client_email, cl.phone as client_phone
             FROM generated_contracts gc
             JOIN contracts c ON c.id = gc.contract_id
             JOIN clients cl ON cl.id = c.client_id
             WHERE gc.id = $1 AND c.user_id = $2`,
            [id, userId]
        );
        if (!row) return res.status(404).json({ success: false, error: { message: 'Contrato gerado não encontrado' } });

        const existing = await queryOne<{ id: string }>(`SELECT id FROM contract_signatures WHERE generated_contract_id = $1`, [id]);
        if (existing) return res.status(400).json({ success: false, error: { message: 'Esse contrato já foi enviado pra assinatura' } });

        const user = await queryOne<{ zapsign_api_token: string | null }>(`SELECT zapsign_api_token FROM users WHERE id = $1`, [userId]);
        const apiToken = decryptMaybe(user?.zapsign_api_token);
        if (!apiToken) {
            return res.status(400).json({ success: false, error: { message: 'Conecte sua conta ZapSign em Configurações antes de enviar pra assinatura' } });
        }
        if (!row.client_email && !row.client_phone) {
            return res.status(400).json({ success: false, error: { message: 'O cliente precisa ter e-mail ou telefone cadastrado pra receber o link de assinatura' } });
        }

        const result = await zapsignCreateDocument(
            apiToken,
            row.filename,
            row.file_data.toString('base64'),
            { name: row.client_name, email: row.client_email || undefined, phoneNumber: row.client_phone || undefined }
        );

        await query(
            `INSERT INTO contract_signatures (generated_contract_id, zapsign_token, sign_url, status, signer_name, signer_email, signer_phone)
             VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
            [id, result.token, result.signUrl, row.client_name, row.client_email, row.client_phone]
        );

        res.status(201).json({ success: true, data: { signUrl: result.signUrl, status: 'pending' } });
    } catch (error: any) {
        logger.error('Erro ao enviar contrato pra assinatura', { error: error.message });
        res.status(500).json({ success: false, error: { message: error.message || 'Erro interno' } });
    }
});

// GET /clients/contract-signatures/:id/download-signed — baixa o PDF já assinado (must be before /:id)
router.get('/contract-signatures/:id/download-signed', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const row = await queryOne<{ filename: string; signed_file_data: Buffer | null }>(
            `SELECT gc.filename, cs.signed_file_data
             FROM contract_signatures cs
             JOIN generated_contracts gc ON gc.id = cs.generated_contract_id
             JOIN contracts c ON c.id = gc.contract_id
             WHERE cs.id = $1 AND c.user_id = $2`,
            [id, userId]
        );
        if (!row || !row.signed_file_data) return res.status(404).json({ success: false, error: { message: 'PDF assinado ainda não disponível' } });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Assinado - ${row.filename}"`);
        res.send(row.signed_file_data);
    } catch (error: any) {
        logger.error('Erro ao baixar contrato assinado', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /clients — list all clients
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { status, search } = req.query;

        let sql = `
            SELECT cl.*,
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'type', c.type,
                        'fixed_amount', c.fixed_amount,
                        'percentage', c.percentage,
                        'percentage_base', c.percentage_base,
                        'status', c.status
                    ))
                    FROM contracts c
                    WHERE c.client_id = cl.id AND c.status = 'active'
                ), '[]'::json) AS active_contracts
            FROM clients cl WHERE cl.user_id = $1
        `;
        const params: any[] = [userId];

        if (status) {
            params.push(status);
            sql += ` AND cl.status = $${params.length}`;
        }
        if (search) {
            params.push(`%${search}%`);
            sql += ` AND (cl.name ILIKE $${params.length} OR cl.email ILIKE $${params.length} OR cl.company ILIKE $${params.length})`;
        }

        sql += ` ORDER BY cl.name ASC`;

        const rows = await query<any>(sql, params);
        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao listar clientes', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /clients/:id — get single client
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const rows = await query<any>(
            `SELECT * FROM clients WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao buscar cliente', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /clients — create client
router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const {
            name, email, phone, company, status, plan, monthly_value, contract_start, contract_end, notes, avatar_color,
            legal_name, cnpj, address, neighborhood, zip_code, city_state,
        } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: { message: 'Nome é obrigatório' } });
        }

        const rows = await query<any>(
            `INSERT INTO clients (user_id, name, email, phone, company, status, plan, monthly_value, contract_start, contract_end, notes, avatar_color,
                                   legal_name, cnpj, address, neighborhood, zip_code, city_state)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             RETURNING *`,
            [userId, name, email || null, phone || null, company || null, status || 'ativo', plan || null,
             monthly_value || 0, contract_start || null, contract_end || null, notes || null, avatar_color || '#6366f1',
             legal_name || null, cnpj || null, address || null, neighborhood || null, zip_code || null, city_state || null]
        );

        res.status(201).json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao criar cliente', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /clients/:id — update client
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const {
            name, email, phone, company, status, plan, monthly_value, contract_start, contract_end, notes, avatar_color,
            legal_name, cnpj, address, neighborhood, zip_code, city_state,
        } = req.body;

        // churned_at: seta NOW() quando transiciona pra 'churned', limpa quando sai.
        // CASE no SQL pra não exigir uma SELECT prévia.
        const rows = await query<any>(
            `UPDATE clients SET
               name = COALESCE($3, name),
               email = COALESCE($4, email),
               phone = COALESCE($5, phone),
               company = COALESCE($6, company),
               status = COALESCE($7, status),
               plan = COALESCE($8, plan),
               monthly_value = COALESCE($9, monthly_value),
               contract_start = COALESCE($10, contract_start),
               contract_end = COALESCE($11, contract_end),
               notes = COALESCE($12, notes),
               avatar_color = COALESCE($13, avatar_color),
               legal_name = COALESCE($14, legal_name),
               cnpj = COALESCE($15, cnpj),
               address = COALESCE($16, address),
               neighborhood = COALESCE($17, neighborhood),
               zip_code = COALESCE($18, zip_code),
               city_state = COALESCE($19, city_state),
               churned_at = CASE
                 WHEN $7::varchar = 'churned' AND status <> 'churned' THEN NOW()
                 WHEN $7::varchar IS NOT NULL AND $7::varchar <> 'churned' THEN NULL
                 ELSE churned_at
               END,
               updated_at = NOW()
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, userId, name, email, phone, company, status, plan, monthly_value, contract_start, contract_end, notes, avatar_color,
             legal_name, cnpj, address, neighborhood, zip_code, city_state]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao atualizar cliente', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /clients/:id/reminder-mode — override por cliente do modo de lembrete de
// fatura (approval | automatic | null pra voltar a usar o padrão geral)
router.put('/:id/reminder-mode', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { reminder_mode } = req.body as { reminder_mode: 'approval' | 'automatic' | null };

        if (reminder_mode !== null && !['approval', 'automatic'].includes(reminder_mode)) {
            return res.status(400).json({ success: false, error: { message: 'reminder_mode inválido' } });
        }

        const rows = await query<any>(
            `UPDATE clients SET reminder_mode = $3, updated_at = NOW()
             WHERE id = $1 AND user_id = $2
             RETURNING id, reminder_mode`,
            [id, userId, reminder_mode]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao atualizar modo de lembrete do cliente', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /clients/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const rows = await query<any>(
            `DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });
        }

        res.json({ success: true, data: { message: 'Cliente removido' } });
    } catch (error: any) {
        logger.error('Erro ao remover cliente', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── CONTRACTS ─────────────────────────────────────────────────────────────

// GET /clients/:clientId/contracts
router.get('/:clientId/contracts', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { clientId } = req.params;
        const rows = await query<any>(
            `SELECT c.* FROM contracts c
             JOIN clients cl ON c.client_id = cl.id
             WHERE c.client_id = $1 AND cl.user_id = $2
             ORDER BY c.created_at DESC`,
            [clientId, userId]
        );
        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao listar contratos', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /clients/:clientId/contracts
router.post('/:clientId/contracts', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { clientId } = req.params;
        const { description, type, fixed_amount, percentage, percentage_base, billing_day, start_date, end_date, status, payment_method, notes, contract_file_url } = req.body;

        if (!description) {
            return res.status(400).json({ success: false, error: { message: 'Descrição é obrigatória' } });
        }
        // Verify client ownership
        const clients = await query<any>(`SELECT id FROM clients WHERE id = $1 AND user_id = $2`, [clientId, userId]);
        if (!clients.length) return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });

        const rows = await query<any>(
            `INSERT INTO contracts (user_id, client_id, description, type, fixed_amount, percentage, percentage_base, billing_day, start_date, end_date, status, payment_method, notes, contract_file_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
            [userId, clientId, description, type || 'fixed', fixed_amount || 0, percentage || 0,
             percentage_base || 'Investimento em anúncios', billing_day || 1,
             start_date || null, end_date || null, status || 'active',
             payment_method || null, notes || null, contract_file_url || null]
        );
        res.status(201).json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao criar contrato', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /clients/:clientId/contracts/:contractId
router.put('/:clientId/contracts/:contractId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { contractId } = req.params;
        const { description, type, fixed_amount, percentage, percentage_base, billing_day, start_date, end_date, status, payment_method, notes, contract_file_url } = req.body;

        const rows = await query<any>(
            `UPDATE contracts SET
               description = COALESCE($3, description),
               type = COALESCE($4, type),
               fixed_amount = COALESCE($5, fixed_amount),
               percentage = COALESCE($6, percentage),
               percentage_base = COALESCE($7, percentage_base),
               billing_day = COALESCE($8, billing_day),
               start_date = COALESCE($9, start_date),
               end_date = COALESCE($10, end_date),
               status = COALESCE($11, status),
               payment_method = COALESCE($12, payment_method),
               notes = COALESCE($13, notes),
               contract_file_url = $14,
               updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [contractId, userId, description, type, fixed_amount, percentage, percentage_base, billing_day, start_date, end_date, status, payment_method, notes, contract_file_url || null]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Contrato não encontrado' } });
        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /clients/:clientId/contracts/:contractId
router.delete('/:clientId/contracts/:contractId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { contractId } = req.params;
        await query(`DELETE FROM contracts WHERE id = $1 AND user_id = $2`, [contractId, userId]);
        res.json({ success: true, data: { message: 'Contrato removido' } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /clients/:clientId/contracts/:contractId/generated — histórico de PDFs já gerados
router.get('/:clientId/contracts/:contractId/generated', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { contractId } = req.params;
        const rows = await query<any>(
            `SELECT gc.id, gc.filename, gc.generated_at
             FROM generated_contracts gc
             JOIN contracts c ON c.id = gc.contract_id
             WHERE gc.contract_id = $1 AND c.user_id = $2
             ORDER BY gc.generated_at DESC`,
            [contractId, userId]
        );
        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao listar contratos gerados', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /clients/:clientId/contracts/:contractId/latest-signature — último PDF gerado
// desse contrato + status de assinatura (se já foi enviado pra ZapSign). Um único
// request pra alimentar o card do contrato no frontend (evita N+1).
router.get('/:clientId/contracts/:contractId/latest-signature', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { contractId } = req.params;
        const latest = await queryOne<{ id: string; filename: string }>(
            `SELECT gc.id, gc.filename FROM generated_contracts gc
             JOIN contracts c ON c.id = gc.contract_id
             WHERE gc.contract_id = $1 AND c.user_id = $2
             ORDER BY gc.generated_at DESC LIMIT 1`,
            [contractId, userId]
        );
        if (!latest) return res.json({ success: true, data: null });

        const signature = await queryOne<any>(
            `SELECT id, sign_url, status, signed_at FROM contract_signatures WHERE generated_contract_id = $1`,
            [latest.id]
        );
        res.json({ success: true, data: { generatedContractId: latest.id, filename: latest.filename, signature: signature || null } });
    } catch (error: any) {
        logger.error('Erro ao buscar status da assinatura', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /clients/:clientId/contracts/:contractId/generate — gera o PDF a partir do modelo
// Body: { project_name, first_payment_date, due_day, contract_term_months, signature_date,
//         signature_city, legal_name?, cnpj?, address?, neighborhood?, zip_code?, city_state? }
// Os campos legais opcionais, se enviados, também são salvos no cliente (reuso em contratos futuros).
router.post('/:clientId/contracts/:contractId/generate', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { clientId, contractId } = req.params;
        const {
            project_name, first_payment_date, due_day, contract_term_months, signature_date, signature_city,
            legal_name, cnpj, address, neighborhood, zip_code, city_state,
        } = req.body;

        const client = await queryOne<any>(`SELECT * FROM clients WHERE id = $1 AND user_id = $2`, [clientId, userId]);
        if (!client) return res.status(404).json({ success: false, error: { message: 'Cliente não encontrado' } });

        const contract = await queryOne<any>(`SELECT * FROM contracts WHERE id = $1 AND user_id = $2`, [contractId, userId]);
        if (!contract) return res.status(404).json({ success: false, error: { message: 'Contrato não encontrado' } });

        // Salva/atualiza os dados legais no cliente, se vieram preenchidos — reaproveita da próxima vez.
        const effectiveLegal = {
            legal_name: legal_name || client.legal_name,
            cnpj: cnpj || client.cnpj,
            address: address || client.address,
            neighborhood: neighborhood || client.neighborhood,
            zip_code: zip_code || client.zip_code,
            city_state: city_state || client.city_state,
        };
        if (legal_name || cnpj || address || neighborhood || zip_code || city_state) {
            await query(
                `UPDATE clients SET legal_name = $2, cnpj = $3, address = $4, neighborhood = $5, zip_code = $6, city_state = $7, updated_at = NOW()
                 WHERE id = $1`,
                [clientId, effectiveLegal.legal_name, effectiveLegal.cnpj, effectiveLegal.address,
                 effectiveLegal.neighborhood, effectiveLegal.zip_code, effectiveLegal.city_state]
            );
        }

        for (const [key, val] of Object.entries(effectiveLegal)) {
            if (!val) return res.status(400).json({ success: false, error: { message: `Campo obrigatório ausente: ${key}` } });
        }
        if (!project_name || !first_payment_date || !due_day || !contract_term_months || !signature_date || !signature_city) {
            return res.status(400).json({ success: false, error: { message: 'Preencha todos os campos do contrato' } });
        }

        const value = Number(contract.fixed_amount) || 0;
        const vars: ContractVars = {
            client_legal_name: effectiveLegal.legal_name,
            client_cnpj: effectiveLegal.cnpj,
            client_address: effectiveLegal.address,
            client_neighborhood: effectiveLegal.neighborhood,
            client_zip: effectiveLegal.zip_code,
            client_city_state: effectiveLegal.city_state,
            project_name,
            monthly_value: formatCurrencyBRL(value),
            monthly_value_extenso: valorPorExtenso(value),
            due_day: String(due_day),
            first_payment_date,
            contract_term_months: String(contract_term_months),
            signature_date,
            signature_city,
        };

        const template = await getOrCreateDefaultTemplate(userId);
        const rendered = renderTemplate(template.content, vars as unknown as Record<string, string>);
        const pdfBuffer = await generateContractPdf(rendered);
        const filename = `Contrato - ${client.name} - ${new Date().toISOString().slice(0, 10)}.pdf`;
        const saved = await saveGeneratedContract(contractId, template.id, filename, pdfBuffer, vars);

        res.status(201).json({ success: true, data: { id: saved.id, filename } });
    } catch (error: any) {
        logger.error('Erro ao gerar contrato', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const clientsController = router;
