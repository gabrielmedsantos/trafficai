// ==============================
// TrafficAI — Audit Log Controller
// Leitura do log de auditoria. Apenas admins podem ver.
// ==============================

import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';

const router = Router();
router.use(authMiddleware);

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
    const userId = (req as any).user.userId;
    const rows = await query<any>(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (rows[0]?.role !== 'admin') {
        res.status(403).json({ success: false, error: { message: 'Apenas administradores podem ver o log de auditoria' } });
        return false;
    }
    return true;
}

// ─── GET /audit-log?limit=&before=&user_id=&action= ────────────────────────
router.get('/', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const { user_id, action, before } = req.query as Record<string, string | undefined>;

        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
        if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
        if (before) { conditions.push(`created_at < $${idx++}`); params.push(before); }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(limit);

        const rows = await query<any>(
            `SELECT id, user_id, user_name, action, entity_type, entity_id, entity_label, details, created_at
             FROM audit_log
             ${where}
             ORDER BY created_at DESC
             LIMIT $${idx}`,
            params
        );

        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao listar audit_log', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /audit-log/actions — lista de ações distintas, pra filtro na UI ────
router.get('/actions', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
        const rows = await query<{ action: string }>(`SELECT DISTINCT action FROM audit_log ORDER BY action`);
        res.json({ success: true, data: rows.map(r => r.action) });
    } catch (error: any) {
        logger.error('Erro ao listar ações do audit_log', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const auditController = router;
