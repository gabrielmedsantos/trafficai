// ==============================
// TrafficAI — Team Members Controller
// CRUD de membros do time. Apenas admins podem criar/editar/remover.
// ==============================

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';
import { CAPABILITIES } from './capabilities';
import { recordAudit } from '../audit/audit.service';

const router = Router();
router.use(authMiddleware);

async function getUserRole(userId: string): Promise<string> {
    const rows = await query<any>(`SELECT role FROM users WHERE id = $1`, [userId]);
    return rows[0]?.role || 'member';
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
    const userId = (req as any).user.userId;
    const role = await getUserRole(userId);
    if (role !== 'admin') {
        res.status(403).json({ success: false, error: { message: 'Apenas administradores podem gerenciar o time' } });
        return false;
    }
    return true;
}

// ─── GET /team/capabilities ─────────────────────────────────────────────────
router.get('/capabilities', async (_req: Request, res: Response) => {
    res.json({ success: true, data: CAPABILITIES });
});

// ─── GET /team/members ──────────────────────────────────────────────────────
router.get('/members', async (req: Request, res: Response) => {
    try {
        const rows = await query<any>(
            `SELECT id, name, email, role, department, job_title, avatar_color, capabilities, created_at
             FROM users
             ORDER BY name ASC`
        );
        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao listar membros', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /team/members ─────────────────────────────────────────────────────
router.post('/members', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
        // Hard-block: verifica limite de seats do plano
        const { canAddSeat } = await import('../billing/stripe.service');
        const check = await canAddSeat((req as any).user.userId);
        if (!check.ok) {
            return res.status(402).json({
                success: false,
                error: { message: check.reason, code: 402, upgrade_plan: check.upgrade_plan },
            });
        }

        const { name, email, password, role, department, job_title, avatar_color, capabilities } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: { message: 'Nome, email e senha são obrigatórios' } });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, error: { message: 'Senha precisa de no mínimo 8 caracteres' } });
        }
        if (capabilities !== undefined && capabilities !== null && !Array.isArray(capabilities)) {
            return res.status(400).json({ success: false, error: { message: 'capabilities deve ser um array ou null' } });
        }

        const existing = await query<any>(`SELECT id FROM users WHERE email = $1`, [email]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, error: { message: 'Já existe um usuário com esse email' } });
        }

        const password_hash = await bcrypt.hash(password, 10);

        const rows = await query<any>(
            `INSERT INTO users (name, email, password_hash, role, department, job_title, avatar_color, capabilities)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, name, email, role, department, job_title, avatar_color, capabilities, created_at`,
            [
                name,
                email,
                password_hash,
                role || 'member',
                department || null,
                job_title || null,
                avatar_color || '#6366f1',
                capabilities ?? null,
            ]
        );

        recordAudit({
            userId: (req as any).user.userId,
            action: 'team.member_created',
            entityType: 'user',
            entityId: rows[0].id,
            entityLabel: rows[0].name,
            details: { role: rows[0].role, email: rows[0].email },
        });

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao criar membro', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── PATCH /team/members/:id ────────────────────────────────────────────────
router.patch('/members/:id', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
        const { id } = req.params;
        const { name, email, role, department, job_title, avatar_color, password, capabilities } = req.body;

        if (capabilities !== undefined && capabilities !== null && !Array.isArray(capabilities)) {
            return res.status(400).json({ success: false, error: { message: 'capabilities deve ser um array ou null' } });
        }

        const fields: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (name !== undefined)          { fields.push(`name = $${idx++}`); params.push(name); }
        if (email !== undefined)         { fields.push(`email = $${idx++}`); params.push(email); }
        if (role !== undefined)          { fields.push(`role = $${idx++}`); params.push(role); }
        if (department !== undefined)    { fields.push(`department = $${idx++}`); params.push(department || null); }
        if (job_title !== undefined)     { fields.push(`job_title = $${idx++}`); params.push(job_title || null); }
        if (avatar_color !== undefined)  { fields.push(`avatar_color = $${idx++}`); params.push(avatar_color); }
        if (capabilities !== undefined)  { fields.push(`capabilities = $${idx++}`); params.push(capabilities); }

        if (password) {
            if (password.length < 8) {
                return res.status(400).json({ success: false, error: { message: 'Senha precisa de no mínimo 8 caracteres' } });
            }
            const hash = await bcrypt.hash(password, 10);
            fields.push(`password_hash = $${idx++}`);
            params.push(hash);
        }

        if (!fields.length) {
            return res.status(400).json({ success: false, error: { message: 'Nenhum campo para atualizar' } });
        }

        fields.push(`updated_at = NOW()`);
        params.push(id);

        const rows = await query<any>(
            `UPDATE users SET ${fields.join(', ')}
             WHERE id = $${idx}
             RETURNING id, name, email, role, department, job_title, avatar_color, capabilities, updated_at`,
            params
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Membro não encontrado' } });
        }

        recordAudit({
            userId: (req as any).user.userId,
            action: 'team.member_updated',
            entityType: 'user',
            entityId: rows[0].id,
            entityLabel: rows[0].name,
            details: { fields_changed: Object.keys(req.body) },
        });

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao atualizar membro', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── DELETE /team/members/:id ───────────────────────────────────────────────
router.delete('/members/:id', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
        const { id } = req.params;
        const userId = (req as any).user.userId;

        if (id === userId) {
            return res.status(400).json({ success: false, error: { message: 'Você não pode remover a si mesmo' } });
        }

        // Checa se é o último admin
        const { rows: admins } = { rows: await query<any>(`SELECT id FROM users WHERE role = 'admin'`) };
        const isAdmin = (await query<any>(`SELECT role FROM users WHERE id = $1`, [id]))[0]?.role === 'admin';
        if (isAdmin && admins.length <= 1) {
            return res.status(400).json({ success: false, error: { message: 'Não é possível remover o último admin' } });
        }

        const deleted = await query<any>(
            `DELETE FROM users WHERE id = $1 RETURNING id, name, email`,
            [id]
        );

        if (!deleted.length) {
            return res.status(404).json({ success: false, error: { message: 'Membro não encontrado' } });
        }

        recordAudit({
            userId,
            action: 'team.member_removed',
            entityType: 'user',
            entityId: deleted[0].id,
            entityLabel: deleted[0].name || deleted[0].email,
        });

        res.json({ success: true, data: { message: 'Membro removido' } });
    } catch (error: any) {
        logger.error('Erro ao remover membro', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const teamController = router;
