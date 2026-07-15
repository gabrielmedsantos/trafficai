// ==============================
// Automation Controller — CRUD de regras
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { query } from '../database/connection';
import { evaluateRule, AutomationRule } from './automation.service';
import { ValidationError } from '../shared/errors';

const router = Router();
router.use(authMiddleware);

// GET /automation/rules — lista todas do user
router.get('/rules', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rules = await query<any>(
            `SELECT r.*, a.account_name FROM automation_rules r
             LEFT JOIN ad_accounts a ON r.account_id = a.id
             WHERE r.user_id = $1 ORDER BY r.created_at DESC`,
            [req.user!.userId]
        );
        res.json({ success: true, data: rules });
    } catch (err) { next(err); }
});

// POST /automation/rules — cria
router.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const b = req.body;
        const required = ['name', 'condition_metric', 'condition_operator', 'condition_value', 'action'];
        for (const f of required) if (!b[f]) throw new ValidationError(`${f} é obrigatório`);

        const r = await query<any>(
            `INSERT INTO automation_rules
                (user_id, account_id, name, scope, condition_metric, condition_operator,
                 condition_value, condition_period, action, is_active, cooldown_hours)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
                req.user!.userId, b.account_id || null, b.name,
                b.scope || 'campaign', b.condition_metric, b.condition_operator,
                b.condition_value, b.condition_period || 'yesterday', b.action,
                b.is_active !== false, b.cooldown_hours || 24,
            ]
        );
        res.json({ success: true, data: r[0] });
    } catch (err) { next(err); }
});

// PATCH /automation/rules/:id
router.patch('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const b = req.body;
        const fields: string[] = [];
        const vals: any[] = [];
        let i = 1;
        for (const k of ['name', 'account_id', 'scope', 'condition_metric', 'condition_operator', 'condition_value', 'condition_period', 'action', 'is_active', 'cooldown_hours']) {
            if (b[k] !== undefined) { fields.push(`${k} = $${i++}`); vals.push(b[k]); }
        }
        if (!fields.length) throw new ValidationError('nada pra atualizar');
        vals.push(req.params.id, req.user!.userId);
        const r = await query<any>(
            `UPDATE automation_rules SET ${fields.join(', ')}, updated_at = NOW()
             WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
            vals
        );
        res.json({ success: true, data: r[0] });
    } catch (err) { next(err); }
});

// DELETE /automation/rules/:id
router.delete('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await query(`DELETE FROM automation_rules WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// POST /automation/rules/:id/run — dispara avaliação manual
router.post('/rules/:id/run', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const r = await query<AutomationRule>(
            `SELECT * FROM automation_rules WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        if (!r.length) throw new ValidationError('regra não encontrada');
        const result = await evaluateRule(r[0]);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// GET /automation/rules/:id/events — histórico
router.get('/rules/:id/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const events = await query<any>(
            `SELECT e.*, c.name AS campaign_name FROM automation_rule_events e
             LEFT JOIN campaigns c ON e.campaign_id = c.id
             WHERE e.rule_id = $1 ORDER BY e.triggered_at DESC LIMIT 50`,
            [req.params.id]
        );
        res.json({ success: true, data: events });
    } catch (err) { next(err); }
});

export const automationController = router;
