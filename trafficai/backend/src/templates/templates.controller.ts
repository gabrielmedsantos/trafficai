// ==============================
// Templates Library Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { query } from '../database/connection';
import { ValidationError } from '../shared/errors';

const router = Router();
router.use(authMiddleware);

const VALID_CATEGORIES = ['daily_report', 'weekly_report', 'monthly_report', 'billing_alert'];
const VALID_CHANNELS = ['meta', 'google', 'generic'];

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { category, channel } = req.query;
        const conds = [`user_id = $1`];
        const params: any[] = [req.user!.userId];
        if (category && VALID_CATEGORIES.includes(category as string)) {
            params.push(category); conds.push(`category = $${params.length}`);
        }
        if (channel && VALID_CHANNELS.includes(channel as string)) {
            params.push(channel); conds.push(`channel = $${params.length}`);
        }
        const rows = await query<any>(
            `SELECT * FROM message_templates WHERE ${conds.join(' AND ')} ORDER BY category, name`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (err) { next(err); }
});

router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await query<any>(
            `SELECT channel, category, COUNT(*)::int AS count
             FROM message_templates
             WHERE user_id = $1 AND is_active = TRUE
             GROUP BY channel, category`,
            [req.user!.userId]
        );
        res.json({ success: true, data: rows });
    } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, category, channel, body, description, is_default } = req.body;
        if (!name || !category || !body) throw new ValidationError('name, category, body obrigatórios');
        if (!VALID_CATEGORIES.includes(category)) throw new ValidationError('category inválido');
        if (channel && !VALID_CHANNELS.includes(channel)) throw new ValidationError('channel inválido');

        // Se marcar como default, desmarca outros da mesma categoria+channel
        if (is_default) {
            await query(
                `UPDATE message_templates SET is_default = FALSE
                 WHERE user_id = $1 AND category = $2 AND channel = $3`,
                [req.user!.userId, category, channel || 'meta']
            );
        }

        const r = await query<any>(
            `INSERT INTO message_templates (user_id, channel, category, name, description, body, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.user!.userId, channel || 'meta', category, name, description || null, body, !!is_default]
        );
        res.json({ success: true, data: r[0] });
    } catch (err) { next(err); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const b = req.body;
        const fields: string[] = [];
        const vals: any[] = [];
        let i = 1;
        for (const k of ['name', 'description', 'body', 'category', 'channel', 'is_active', 'is_default']) {
            if (b[k] !== undefined) { fields.push(`${k} = $${i++}`); vals.push(b[k]); }
        }
        if (!fields.length) throw new ValidationError('nada pra atualizar');
        vals.push(req.params.id, req.user!.userId);
        const r = await query<any>(
            `UPDATE message_templates SET ${fields.join(', ')}, updated_at = NOW()
             WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
            vals
        );
        res.json({ success: true, data: r[0] });
    } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await query(`DELETE FROM message_templates WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.userId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

export const templatesController = router;
