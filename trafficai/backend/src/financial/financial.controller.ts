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
// Query: month, year, regime ('cash' | 'accrual', default 'accrual')
//   cash = só 'confirmed'/'paid' (o que efetivamente entrou/saiu)
//   accrual = inclui 'pending' (regime de competência)
router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { month, year, regime } = req.query;
        const isCash = regime === 'cash';

        const targetMonth = month ? Number(month) : new Date().getMonth() + 1;
        const targetYear = year ? Number(year) : new Date().getFullYear();

        const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const endDate = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];

        // Filtro de status conforme regime
        // cash: confirmed apenas. accrual: confirmed + pending. cancelled sempre fora.
        const txStatusFilter = isCash
            ? `AND status = 'confirmed'`
            : `AND status != 'cancelled'`;

        // Totals by type (transactions avulsas)
        const totals = await query<any>(
            `SELECT type, SUM(amount) as total
             FROM transactions
             WHERE user_id=$1 AND date BETWEEN $2 AND $3 ${txStatusFilter}
             GROUP BY type`,
            [userId, startDate, endDate]
        );

        const txIncome = Number(totals.find((r: any) => r.type === 'income')?.total || 0);
        const txExpense = Number(totals.find((r: any) => r.type === 'expense')?.total || 0);

        // Receita pending separada (útil pro frontend mostrar mesmo em regime caixa)
        const pendingRows = await query<any>(
            `SELECT type, SUM(amount) as total
             FROM transactions
             WHERE user_id=$1 AND date BETWEEN $2 AND $3 AND status = 'pending'
             GROUP BY type`,
            [userId, startDate, endDate]
        );
        const pendingIncome = Number(pendingRows.find((r: any) => r.type === 'income')?.total || 0);
        const pendingExpense = Number(pendingRows.find((r: any) => r.type === 'expense')?.total || 0);

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

        // Em regime caixa, contratos pending NÃO contam como receita realizada.
        // Em competência, somam (entram em "Receitas"), assim como tx pending já entrou em txIncome.
        const income = isCash
            ? txIncome + contractsPaid
            : txIncome + contractsPaid + contractsPending + contractsOverdue;
        const expense = txExpense;
        // Receita "a receber" combina tx income pending + cobranças não-pagas
        const totalReceivable = contractsReceivable + pendingIncome;

        // Category breakdown — respeita regime
        const byCategory = await query<any>(
            `SELECT type, category, SUM(amount) as total
             FROM transactions
             WHERE user_id=$1 AND date BETWEEN $2 AND $3 ${txStatusFilter}
             GROUP BY type, category
             ORDER BY total DESC`,
            [userId, startDate, endDate]
        );

        // Separa pra UI conseguir mostrar gráficos lado a lado sem filtrar
        const incomeByCategory = byCategory.filter((r: any) => r.type === 'income');
        const expenseByCategory = byCategory.filter((r: any) => r.type === 'expense');

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

        // Daily flow (for chart) — respeita regime
        const dailyFlow = await query<any>(
            `SELECT date, type, SUM(amount) as total
             FROM transactions
             WHERE user_id=$1 AND date BETWEEN $2 AND $3 ${txStatusFilter}
             GROUP BY date, type
             ORDER BY date`,
            [userId, startDate, endDate]
        );

        res.json({
            success: true,
            data: {
                regime: isCash ? 'cash' : 'accrual',
                income,
                expense,
                balance: income - expense,
                income_breakdown: {
                    transactions: txIncome,
                    contracts_paid: contractsPaid,
                    pending_tx: pendingIncome,
                    pending_contracts: contractsPending + contractsOverdue,
                },
                expense_breakdown: {
                    transactions: txExpense,
                    pending_tx: pendingExpense,
                },
                receivable: totalReceivable,
                receivable_breakdown: {
                    pending: contractsPending,
                    overdue: contractsOverdue,
                    pending_tx: pendingIncome,
                },
                byCategory,
                incomeByCategory,
                expenseByCategory,
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

        // Último dia do mês (para cap em billing_day=31, fevereiro, etc)
        const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();

        for (const contract of contracts) {
            try {
                const fixedAmt = Number(contract.fixed_amount) || 0;
                const billingDay = Math.min(
                    Math.max(1, Number(contract.billing_day) || 1),
                    lastDayOfMonth
                );
                const dueDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(billingDay).padStart(2, '0')}`;

                await query(
                    `INSERT INTO contract_billing
                       (user_id, contract_id, client_id, reference_month, due_date,
                        fixed_amount, percentage_amount, total_amount, status)
                     VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'pending')
                     ON CONFLICT (contract_id, reference_month) DO NOTHING`,
                    [userId, contract.id, contract.client_id, refMonth, dueDate, fixedAmt]
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

// PUT /financial/billing/:id — marcar pago / editar valor / due_date / notes
router.put('/billing/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { status, percentage_amount, payment_method, notes, due_date } = req.body;

        // Recalculate total if percentage_amount changes
        const existing = await query<any>(
            `SELECT cb.fixed_amount FROM contract_billing cb WHERE cb.id = $1 AND cb.user_id = $2`,
            [id, userId]
        );
        if (!existing.length) return res.status(404).json({ success: false, error: { message: 'Registro não encontrado' } });

        const fixedAmt = Number(existing[0].fixed_amount);
        const pctAmt = percentage_amount !== undefined ? Number(percentage_amount) : null;
        const totalAmt = pctAmt !== null ? fixedAmt + pctAmt : null;

        // due_date aceito como "YYYY-MM-DD" ou null (para remover).
        // undefined = não altera.
        const dueDateParam = due_date === undefined ? null : (due_date || null);
        const dueDateProvided = due_date !== undefined;

        const rows = await query<any>(
            `UPDATE contract_billing SET
                status = COALESCE($3, status),
                percentage_amount = COALESCE($4, percentage_amount),
                total_amount = COALESCE($5, total_amount),
                payment_method = COALESCE($6, payment_method),
                notes = COALESCE($7, notes),
                due_date = CASE WHEN $9::boolean THEN $8::date ELSE due_date END,
                paid_at = CASE WHEN $3 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
                updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [id, userId, status || null, pctAmt, totalAmt, payment_method || null, notes || null, dueDateParam, dueDateProvided]
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

// ─── MANAGEMENT METRICS ────────────────────────────────────────────────────

// GET /financial/metrics — MRR, ARR, churn, ticket médio, lucro estimado
// Query: month, year (default: mês corrente)
router.get('/metrics', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { month, year } = req.query;

        const targetMonth = month ? Number(month) : new Date().getMonth() + 1;
        const targetYear = year ? Number(year) : new Date().getFullYear();
        const refMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const monthEnd = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];

        // Mês anterior pra MoM
        const prevDate = new Date(targetYear, targetMonth - 2, 1);
        const prevMonthStart = prevDate.toISOString().split('T')[0];
        const prevMonthEnd = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).toISOString().split('T')[0];

        // MRR — soma fixed_amount de contratos ativos (fixed + mixed)
        // que estavam ativos no fim do mês selecionado
        const mrrRows = await query<any>(
            `SELECT COALESCE(SUM(fixed_amount), 0) AS mrr,
                    COUNT(DISTINCT client_id) AS clients_with_contract
             FROM contracts
             WHERE user_id = $1
               AND status = 'active'
               AND type IN ('fixed', 'mixed')
               AND fixed_amount > 0
               AND (start_date IS NULL OR start_date <= $2)
               AND (end_date IS NULL OR end_date >= $2)`,
            [userId, monthEnd]
        );
        const mrr = Number(mrrRows[0]?.mrr || 0);
        const clientsWithContract = Number(mrrRows[0]?.clients_with_contract || 0);
        const arr = mrr * 12;

        // MRC — custo recorrente mensal (despesas recorrentes ativas)
        const mrcRows = await query<any>(
            `SELECT COALESCE(SUM(amount), 0) AS mrc
             FROM recurring_transactions
             WHERE user_id = $1 AND active = true AND type = 'expense'`,
            [userId]
        );
        const mrc = Number(mrcRows[0]?.mrc || 0);

        // Clientes ativos no momento (status='ativo')
        const activeClientsRows = await query<any>(
            `SELECT COUNT(*) AS total FROM clients WHERE user_id = $1 AND status = 'ativo'`,
            [userId]
        );
        const activeClients = Number(activeClientsRows[0]?.total || 0);
        const avgTicket = clientsWithContract > 0 ? mrr / clientsWithContract : 0;

        // Receita realizada do mês (caixa): billings paid + tx income confirmed
        const revenueRows = await query<any>(
            `SELECT
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income' AND t.status != 'cancelled'), 0) AS tx_income,
                COALESCE((SELECT SUM(total_amount) FROM contract_billing
                          WHERE user_id = $1 AND reference_month = $2 AND status = 'paid'), 0) AS contract_paid
             FROM transactions t
             WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3`,
            [userId, refMonth, monthEnd]
        );
        const revenueThisMonth = Number(revenueRows[0]?.tx_income || 0) + Number(revenueRows[0]?.contract_paid || 0);

        // Receita mês anterior pra MoM
        const prevRevenueRows = await query<any>(
            `SELECT
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income' AND t.status != 'cancelled'), 0) AS tx_income,
                COALESCE((SELECT SUM(total_amount) FROM contract_billing
                          WHERE user_id = $1 AND reference_month = $2 AND status = 'paid'), 0) AS contract_paid
             FROM transactions t
             WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3`,
            [userId, prevMonthStart, prevMonthEnd]
        );
        const revenueLastMonth = Number(prevRevenueRows[0]?.tx_income || 0) + Number(prevRevenueRows[0]?.contract_paid || 0);
        const revenueGrowthPct = revenueLastMonth > 0
            ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
            : null;

        // Despesa realizada (caixa) — soma transactions expense confirmed
        const expenseRows = await query<any>(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM transactions
             WHERE user_id = $1 AND type = 'expense' AND status != 'cancelled'
               AND date BETWEEN $2 AND $3`,
            [userId, refMonth, monthEnd]
        );
        const expenseRealized = Number(expenseRows[0]?.total || 0);
        const profitRealized = revenueThisMonth - expenseRealized;
        const profitEstimateMonthly = mrr - mrc;

        // Churn — clientes que viraram churned nos últimos 90 dias (3 meses corridos)
        const churnRows = await query<any>(
            `SELECT COUNT(*) AS churned_3mo
             FROM clients
             WHERE user_id = $1 AND status = 'churned'
               AND churned_at >= NOW() - INTERVAL '90 days'`,
            [userId]
        );
        const churned3mo = Number(churnRows[0]?.churned_3mo || 0);

        // Churn deste mês (window do mês selecionado)
        const churnMonthRows = await query<any>(
            `SELECT COUNT(*) AS churned_this_month
             FROM clients
             WHERE user_id = $1 AND status = 'churned'
               AND churned_at::date BETWEEN $2 AND $3`,
            [userId, refMonth, monthEnd]
        );
        const churnedThisMonth = Number(churnMonthRows[0]?.churned_this_month || 0);

        // Base pra churn rate: clientes ativos + os que saíram no período
        const churnBase = activeClients + churned3mo;
        const churnRate3mo = churnBase > 0 ? (churned3mo / churnBase) * 100 : 0;

        // Novos clientes do mês (created_at no período, status atual ativo)
        const newClientsRows = await query<any>(
            `SELECT COUNT(*) AS total FROM clients
             WHERE user_id = $1 AND created_at::date BETWEEN $2 AND $3`,
            [userId, refMonth, monthEnd]
        );
        const newClientsThisMonth = Number(newClientsRows[0]?.total || 0);

        res.json({
            success: true,
            data: {
                period: { month: targetMonth, year: targetYear },
                mrr,
                arr,
                mrc,
                avg_ticket: avgTicket,
                active_clients: activeClients,
                clients_with_contract: clientsWithContract,
                revenue_this_month: revenueThisMonth,
                revenue_last_month: revenueLastMonth,
                revenue_growth_pct: revenueGrowthPct,
                expense_realized: expenseRealized,
                profit_realized: profitRealized,
                profit_estimate_monthly: profitEstimateMonthly,
                churned_3mo: churned3mo,
                churned_this_month: churnedThisMonth,
                churn_rate_3mo_pct: churnRate3mo,
                new_clients_this_month: newClientsThisMonth,
            },
        });
    } catch (error: any) {
        logger.error('Erro em metrics', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// GET /financial/revenue-by-client — receita por cliente no período
// Query: month, year
router.get('/revenue-by-client', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { month, year } = req.query;

        const targetMonth = month ? Number(month) : new Date().getMonth() + 1;
        const targetYear = year ? Number(year) : new Date().getFullYear();
        const refMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const monthEnd = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];

        const rows = await query<any>(
            `SELECT
                cl.id AS client_id,
                cl.name AS client_name,
                cl.avatar_color,
                cl.status AS client_status,
                COALESCE((
                    SELECT SUM(t.amount)
                    FROM transactions t
                    WHERE t.user_id = $1 AND t.client_id = cl.id
                      AND t.type = 'income' AND t.status != 'cancelled'
                      AND t.date BETWEEN $2 AND $3
                ), 0) AS tx_income,
                COALESCE((
                    SELECT SUM(cb.total_amount)
                    FROM contract_billing cb
                    WHERE cb.user_id = $1 AND cb.client_id = cl.id
                      AND cb.reference_month = $2 AND cb.status = 'paid'
                ), 0) AS contract_paid,
                COALESCE((
                    SELECT SUM(cb.total_amount)
                    FROM contract_billing cb
                    WHERE cb.user_id = $1 AND cb.client_id = cl.id
                      AND cb.reference_month = $2 AND cb.status IN ('pending', 'overdue')
                ), 0) AS contract_pending
             FROM clients cl
             WHERE cl.user_id = $1
             ORDER BY (
                COALESCE((SELECT SUM(t.amount) FROM transactions t
                          WHERE t.user_id = $1 AND t.client_id = cl.id
                            AND t.type = 'income' AND t.status != 'cancelled'
                            AND t.date BETWEEN $2 AND $3), 0)
              + COALESCE((SELECT SUM(cb.total_amount) FROM contract_billing cb
                          WHERE cb.user_id = $1 AND cb.client_id = cl.id
                            AND cb.reference_month = $2 AND cb.status = 'paid'), 0)
             ) DESC`,
            [userId, refMonth, monthEnd]
        );

        // Filtra zerados pra não poluir a UI, mas sempre devolve clientes ativos
        const filtered = rows
            .map((r: any) => ({
                client_id: r.client_id,
                client_name: r.client_name,
                avatar_color: r.avatar_color,
                client_status: r.client_status,
                tx_income: Number(r.tx_income),
                contract_paid: Number(r.contract_paid),
                contract_pending: Number(r.contract_pending),
                total_paid: Number(r.tx_income) + Number(r.contract_paid),
            }))
            .filter((r: any) => r.total_paid > 0 || r.contract_pending > 0 || r.client_status === 'ativo');

        res.json({ success: true, data: filtered });
    } catch (error: any) {
        logger.error('Erro em revenue-by-client', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /financial/billing/mark-overdue — marca atrasadas (due_date < hoje)
router.post('/billing/mark-overdue', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const result = await query<any>(
            `UPDATE contract_billing SET status = 'overdue', updated_at = NOW()
             WHERE user_id = $1
               AND status = 'pending'
               AND due_date IS NOT NULL
               AND due_date < CURRENT_DATE
             RETURNING id`,
            [userId]
        );
        res.json({ success: true, data: { updated: result.length } });
    } catch (error: any) {
        logger.error('Erro em mark-overdue', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const financialController = router;
