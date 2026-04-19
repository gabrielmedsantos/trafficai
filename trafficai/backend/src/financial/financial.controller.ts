// ==============================
// TrafficAI — Financial Controller
// ==============================

import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';

const router = Router();
router.use(authMiddleware);

// ─── ACCOUNTS ─────────────────────────────────────────────────────────────

// GET /financial/accounts
router.get('/accounts', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const rows = await query<any>(`SELECT * FROM financial_accounts WHERE user_id = $1 ORDER BY name`, [userId]);
        res.json({ success: true, data: rows });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /financial/accounts
router.post('/accounts', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name, type, balance, currency } = req.body;
        if (!name) return res.status(400).json({ success: false, error: { message: 'Nome é obrigatório' } });
        const rows = await query<any>(
            `INSERT INTO financial_accounts (user_id, name, type, balance, currency) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [userId, name, type || 'checking', balance || 0, currency || 'BRL']
        );
        res.status(201).json({ success: true, data: rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /financial/accounts/:id
router.put('/accounts/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { name, type, balance } = req.body;
        const rows = await query<any>(
            `UPDATE financial_accounts SET name=COALESCE($3,name), type=COALESCE($4,type), balance=COALESCE($5,balance), updated_at=NOW()
             WHERE id=$1 AND user_id=$2 RETURNING *`,
            [id, userId, name, type, balance]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Conta não encontrada' } });
        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /financial/accounts/:id
router.delete('/accounts/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        await query(`DELETE FROM financial_accounts WHERE id=$1 AND user_id=$2`, [id, userId]);
        res.json({ success: true, data: { message: 'Conta removida' } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── DASHBOARD ─────────────────────────────────────────────────────────────

// GET /financial/dashboard — summary for current month
router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { month, year } = req.query;

        const targetMonth = month ? Number(month) : new Date().getMonth() + 1;
        const targetYear = year ? Number(year) : new Date().getFullYear();

        const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const endDate = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];

        // Totals by type (transactions avulsas)
        const totals = await query<any>(
            `SELECT type, SUM(amount) as total
             FROM transactions
             WHERE user_id=$1 AND date BETWEEN $2 AND $3 AND status != 'cancelled'
             GROUP BY type`,
            [userId, startDate, endDate]
        );

        const txIncome = Number(totals.find((r: any) => r.type === 'income')?.total || 0);
        const txExpense = Number(totals.find((r: any) => r.type === 'expense')?.total || 0);

        // Cobranças de contrato do mês de referência — considera pago como receita
        // e pendente/atrasado como "a receber" (reportado separadamente).
        const billingTotals = await query<any>(
            `SELECT status, COALESCE(SUM(total_amount), 0) AS total
             FROM contract_billing
             WHERE user_id = $1 AND reference_month = $2
             GROUP BY status`,
            [userId, startDate]
        );
        const contractsPaid = Number(billingTotals.find((r: any) => r.status === 'paid')?.total || 0);
        const contractsPending = Number(billingTotals.find((r: any) => r.status === 'pending')?.total || 0);
        const contractsOverdue = Number(billingTotals.find((r: any) => r.status === 'overdue')?.total || 0);
        const contractsReceivable = contractsPending + contractsOverdue;

        const income = txIncome + contractsPaid;
        const expense = txExpense;

        // Category breakdown
        const byCategory = await query<any>(
            `SELECT type, category, SUM(amount) as total
             FROM transactions
             WHERE user_id=$1 AND date BETWEEN $2 AND $3 AND status != 'cancelled'
             GROUP BY type, category
             ORDER BY total DESC`,
            [userId, startDate, endDate]
        );

        // Recent transactions
        const recent = await query<any>(
            `SELECT t.*, c.name as client_name
             FROM transactions t
             LEFT JOIN clients c ON t.client_id = c.id
             WHERE t.user_id=$1 AND t.date BETWEEN $2 AND $3
             ORDER BY t.date DESC, t.created_at DESC
             LIMIT 10`,
            [userId, startDate, endDate]
        );

        // Account balances
        const accounts = await query<any>(
            `SELECT * FROM financial_accounts WHERE user_id=$1 ORDER BY name`,
            [userId]
        );

        // Daily flow (for chart)
        const dailyFlow = await query<any>(
            `SELECT date, type, SUM(amount) as total
             FROM transactions
             WHERE user_id=$1 AND date BETWEEN $2 AND $3 AND status != 'cancelled'
             GROUP BY date, type
             ORDER BY date`,
            [userId, startDate, endDate]
        );

        res.json({
            success: true,
            data: {
                income,
                expense,
                balance: income - expense,
                income_breakdown: {
                    transactions: txIncome,
                    contracts_paid: contractsPaid,
                },
                receivable: contractsReceivable,
                receivable_breakdown: {
                    pending: contractsPending,
                    overdue: contractsOverdue,
                },
                byCategory,
                recent,
                accounts,
                dailyFlow,
                period: { month: targetMonth, year: targetYear, startDate, endDate },
            }
        });
    } catch (error: any) {
        logger.error('Erro no dashboard financeiro', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── TRANSACTIONS ──────────────────────────────────────────────────────────

// GET /financial/transactions
router.get('/transactions', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { type, category, client_id, month, year, status, limit = 50, offset = 0 } = req.query;

        let sql = `
            SELECT t.*, c.name as client_name, fa.name as account_name
            FROM transactions t
            LEFT JOIN clients c ON t.client_id = c.id
            LEFT JOIN financial_accounts fa ON t.account_id = fa.id
            WHERE t.user_id = $1
        `;
        const params: any[] = [userId];

        if (type) { params.push(type); sql += ` AND t.type = $${params.length}`; }
        if (category) { params.push(category); sql += ` AND t.category = $${params.length}`; }
        if (client_id) { params.push(client_id); sql += ` AND t.client_id = $${params.length}`; }
        if (status) { params.push(status); sql += ` AND t.status = $${params.length}`; }
        if (month && year) {
            const start = `${year}-${String(month).padStart(2, '0')}-01`;
            const end = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
            params.push(start, end);
            sql += ` AND t.date BETWEEN $${params.length - 1} AND $${params.length}`;
        }

        sql += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Number(limit), Number(offset));

        const rows = await query<any>(sql, params);
        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao listar transações', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /financial/transactions
router.post('/transactions', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { account_id, client_id, type, category, description, amount, date, status, payment_method, notes } = req.body;

        if (!type || !description || !amount || !date) {
            return res.status(400).json({ success: false, error: { message: 'type, description, amount e date são obrigatórios' } });
        }

        const rows = await query<any>(
            `INSERT INTO transactions (user_id, account_id, client_id, type, category, description, amount, date, status, payment_method, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [userId, account_id || null, client_id || null, type, category || null, description, amount, date,
             status || 'confirmed', payment_method || null, notes || null]
        );

        res.status(201).json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao criar transação', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /financial/transactions/:id
router.put('/transactions/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { account_id, client_id, type, category, description, amount, date, status, payment_method, notes } = req.body;

        const rows = await query<any>(
            `UPDATE transactions SET
               account_id=COALESCE($3,account_id), client_id=COALESCE($4,client_id),
               type=COALESCE($5,type), category=COALESCE($6,category),
               description=COALESCE($7,description), amount=COALESCE($8,amount),
               date=COALESCE($9,date), status=COALESCE($10,status),
               payment_method=COALESCE($11,payment_method), notes=COALESCE($12,notes),
               updated_at=NOW()
             WHERE id=$1 AND user_id=$2 RETURNING *`,
            [id, userId, account_id, client_id, type, category, description, amount, date, status, payment_method, notes]
        );

        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Transação não encontrada' } });
        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /financial/transactions/:id
router.delete('/transactions/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        await query(`DELETE FROM transactions WHERE id=$1 AND user_id=$2`, [id, userId]);
        res.json({ success: true, data: { message: 'Transação removida' } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── RECURRING ─────────────────────────────────────────────────────────────

// GET /financial/recurring
router.get('/recurring', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const rows = await query<any>(
            `SELECT r.*, c.name as client_name
             FROM recurring_transactions r
             LEFT JOIN clients c ON r.client_id = c.id
             WHERE r.user_id=$1 ORDER BY r.next_due ASC NULLS LAST`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /financial/recurring
router.post('/recurring', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { client_id, account_id, type, category, description, amount, frequency, day_of_month, next_due, payment_method, notes } = req.body;

        if (!type || !description || !amount || !frequency) {
            return res.status(400).json({ success: false, error: { message: 'type, description, amount e frequency são obrigatórios' } });
        }

        const rows = await query<any>(
            `INSERT INTO recurring_transactions (user_id, client_id, account_id, type, category, description, amount, frequency, day_of_month, next_due, payment_method, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
            [userId, client_id || null, account_id || null, type, category || null, description, amount,
             frequency, day_of_month || null, next_due || null, payment_method || null, notes || null]
        );

        res.status(201).json({ success: true, data: rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /financial/recurring/:id
router.put('/recurring/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { client_id, account_id, type, category, description, amount, frequency, day_of_month, next_due, active, payment_method, notes } = req.body;

        const rows = await query<any>(
            `UPDATE recurring_transactions SET
               client_id=COALESCE($3,client_id), account_id=COALESCE($4,account_id),
               type=COALESCE($5,type), category=COALESCE($6,category),
               description=COALESCE($7,description), amount=COALESCE($8,amount),
               frequency=COALESCE($9,frequency), day_of_month=COALESCE($10,day_of_month),
               next_due=COALESCE($11,next_due), active=COALESCE($12,active),
               payment_method=COALESCE($13,payment_method), notes=COALESCE($14,notes),
               updated_at=NOW()
             WHERE id=$1 AND user_id=$2 RETURNING *`,
            [id, userId, client_id, account_id, type, category, description, amount, frequency, day_of_month, next_due, active, payment_method, notes]
        );

        if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Recorrência não encontrada' } });
        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /financial/recurring/:id
router.delete('/recurring/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        await query(`DELETE FROM recurring_transactions WHERE id=$1 AND user_id=$2`, [id, userId]);
        res.json({ success: true, data: { message: 'Recorrência removida' } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── CONTRACT BILLING ──────────────────────────────────────────────────────

// GET /financial/billing — list billing records with client/contract info
// Query params: months (default 3), status, client_id
router.get('/billing', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { months = 3, status, client_id } = req.query;

        // Get start date: N months ago
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (Number(months) - 1));
        startDate.setDate(1);
        const startStr = startDate.toISOString().split('T')[0];

        let sql = `
            SELECT
                cb.*,
                cl.name AS client_name,
                cl.avatar_color,
                c.description AS contract_description,
                c.type AS contract_type,
                c.percentage,
                c.percentage_base,
                c.billing_day
            FROM contract_billing cb
            JOIN contracts c ON cb.contract_id = c.id
            JOIN clients cl ON cb.client_id = cl.id
            WHERE cb.user_id = $1 AND cb.reference_month >= $2
        `;
        const params: any[] = [userId, startStr];

        if (status) { params.push(status); sql += ` AND cb.status = $${params.length}`; }
        if (client_id) { params.push(client_id); sql += ` AND cb.client_id = $${params.length}`; }

        sql += ` ORDER BY cb.reference_month DESC, cl.name ASC`;

        const rows = await query<any>(sql, params);
        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao listar billing', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /financial/billing/summary — total owed per client
router.get('/billing/summary', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;

        const rows = await query<any>(
            `SELECT
                cl.id AS client_id,
                cl.name AS client_name,
                cl.avatar_color,
                COUNT(cb.id) FILTER (WHERE cb.status IN ('pending', 'overdue')) AS pending_count,
                COALESCE(SUM(cb.total_amount) FILTER (WHERE cb.status IN ('pending', 'overdue')), 0) AS total_owed,
                COALESCE(SUM(cb.total_amount) FILTER (WHERE cb.status = 'paid'), 0) AS total_paid,
                MIN(cb.reference_month) FILTER (WHERE cb.status IN ('pending', 'overdue')) AS oldest_pending
             FROM clients cl
             LEFT JOIN contract_billing cb ON cb.client_id = cl.id AND cb.user_id = $1
             WHERE cl.user_id = $1
             GROUP BY cl.id, cl.name, cl.avatar_color
             HAVING COUNT(cb.id) > 0
             ORDER BY total_owed DESC`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /financial/billing/generate — generate billing records for active contracts
// Body: { month, year } — defaults to current month
router.post('/billing/generate', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { month, year } = req.body;
        const targetMonth = month || (new Date().getMonth() + 1);
        const targetYear = year || new Date().getFullYear();
        const refMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;

        // Get all active fixed/mixed contracts for this user
        const contracts = await query<any>(
            `SELECT c.*, cl.id AS client_id_val
             FROM contracts c
             JOIN clients cl ON c.client_id = cl.id
             WHERE c.user_id = $1 AND c.status = 'active'
               AND c.type IN ('fixed', 'mixed')
               AND (c.start_date IS NULL OR c.start_date <= $2)
               AND (c.end_date IS NULL OR c.end_date >= $2)`,
            [userId, refMonth]
        );

        let created = 0;
        let skipped = 0;

        for (const contract of contracts) {
            try {
                const fixedAmt = Number(contract.fixed_amount) || 0;
                await query(
                    `INSERT INTO contract_billing (user_id, contract_id, client_id, reference_month, fixed_amount, percentage_amount, total_amount, status)
                     VALUES ($1, $2, $3, $4, $5, 0, $5, 'pending')
                     ON CONFLICT (contract_id, reference_month) DO NOTHING`,
                    [userId, contract.id, contract.client_id, refMonth, fixedAmt]
                );
                created++;
            } catch {
                skipped++;
            }
        }

        res.json({ success: true, data: { created, skipped, month: targetMonth, year: targetYear } });
    } catch (error: any) {
        logger.error('Erro ao gerar billing', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /financial/billing/:id — mark paid / update percentage amount / notes
router.put('/billing/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { status, percentage_amount, payment_method, notes } = req.body;

        // Recalculate total if percentage_amount changes
        const existing = await query<any>(
            `SELECT cb.fixed_amount FROM contract_billing cb WHERE cb.id = $1 AND cb.user_id = $2`,
            [id, userId]
        );
        if (!existing.length) return res.status(404).json({ success: false, error: { message: 'Registro não encontrado' } });

        const fixedAmt = Number(existing[0].fixed_amount);
        const pctAmt = percentage_amount !== undefined ? Number(percentage_amount) : null;
        const totalAmt = pctAmt !== null ? fixedAmt + pctAmt : null;

        const rows = await query<any>(
            `UPDATE contract_billing SET
                status = COALESCE($3, status),
                percentage_amount = COALESCE($4, percentage_amount),
                total_amount = COALESCE($5, total_amount),
                payment_method = COALESCE($6, payment_method),
                notes = COALESCE($7, notes),
                paid_at = CASE WHEN $3 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
                updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [id, userId, status || null, pctAmt, totalAmt, payment_method || null, notes || null]
        );

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao atualizar billing', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /financial/billing/:id — delete a billing record
router.delete('/billing/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const rows = await query<any>(
            `DELETE FROM contract_billing WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Registro não encontrado' } });
        }

        res.json({ success: true, data: { message: 'Registro removido' } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /financial/billing/mark-overdue — mark old pending as overdue
router.post('/billing/mark-overdue', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

        const result = await query<any>(
            `UPDATE contract_billing SET status = 'overdue', updated_at = NOW()
             WHERE user_id = $1 AND status = 'pending' AND reference_month < $2
             RETURNING id`,
            [userId, currentMonth]
        );

        res.json({ success: true, data: { updated: result.length } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const financialController = router;
