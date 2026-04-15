// ==============================
// TrafficAI — Clients Controller
// ==============================

import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';

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
        const { name, email, phone, company, status, plan, monthly_value, contract_start, contract_end, notes, avatar_color } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: { message: 'Nome é obrigatório' } });
        }

        const rows = await query<any>(
            `INSERT INTO clients (user_id, name, email, phone, company, status, plan, monthly_value, contract_start, contract_end, notes, avatar_color)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [userId, name, email || null, phone || null, company || null, status || 'ativo', plan || null,
             monthly_value || 0, contract_start || null, contract_end || null, notes || null, avatar_color || '#6366f1']
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
        const { name, email, phone, company, status, plan, monthly_value, contract_start, contract_end, notes, avatar_color } = req.body;

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
               updated_at = NOW()
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, userId, name, email, phone, company, status, plan, monthly_value, contract_start, contract_end, notes, avatar_color]
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

export const clientsController = router;
