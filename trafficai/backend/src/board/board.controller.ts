// ==============================
// TrafficAI — Board Controller
// Gerenciador de demandas (cards) com status, prioridade, prazo e checklist.
// Uma tabela, duas visões no frontend: lista simples com checkbox e Kanban.
// ==============================

import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';
import { randomUUID } from 'crypto';

const router = Router();
router.use(authMiddleware);

const VALID_STATUS = ['todo', 'doing', 'done'];
const VALID_PRIORITY = ['low', 'normal', 'high'];

function sanitizeChecklist(input: any): { id: string; text: string; done: boolean }[] {
    if (!Array.isArray(input)) return [];
    return input
        .filter(i => i && typeof i.text === 'string' && i.text.trim().length > 0)
        .slice(0, 50)
        .map(i => ({
            id: typeof i.id === 'string' ? i.id : randomUUID(),
            text: String(i.text).slice(0, 300),
            done: !!i.done,
        }));
}

// ─── GET /board ─────────────────────────────────────────────────────────────
// Lista todos os cards do usuário (ordenados por status + position).
// Aceita ?client_id=<uuid> ou ?client_id=none (cards sem cliente).
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { client_id } = req.query as any;

        let clientFilter = '';
        const params: any[] = [userId];
        if (client_id === 'none') {
            clientFilter = 'AND bc.client_id IS NULL';
        } else if (client_id && typeof client_id === 'string') {
            params.push(client_id);
            clientFilter = `AND bc.client_id = $${params.length}`;
        }

        const rows = await query<any>(
            `SELECT bc.id, bc.title, bc.description, bc.status, bc.priority, bc.project, bc.due_date,
                    bc.position, bc.checklist, bc.completed_at, bc.created_at, bc.updated_at,
                    bc.client_id,
                    cl.name AS client_name, cl.company AS client_company, cl.avatar_color AS client_avatar_color
             FROM board_cards bc
             LEFT JOIN clients cl ON bc.client_id = cl.id
             WHERE bc.user_id = $1 ${clientFilter}
             ORDER BY
                CASE bc.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
                bc.position ASC,
                bc.created_at DESC`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('board: list falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /board/clients-summary ─────────────────────────────────────────────
// Retorna contagem de cards por cliente (pra chips no topo).
router.get('/clients-summary', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const rows = await query<any>(
            `SELECT
                bc.client_id,
                cl.name AS client_name,
                cl.company AS client_company,
                cl.avatar_color,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE bc.status <> 'done') AS open_count
             FROM board_cards bc
             LEFT JOIN clients cl ON bc.client_id = cl.id
             WHERE bc.user_id = $1
             GROUP BY bc.client_id, cl.name, cl.company, cl.avatar_color
             ORDER BY cl.name NULLS LAST`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('board: clients-summary falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /board ────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { title, description, status, priority, project, client_id, due_date, checklist } = req.body;

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({ success: false, error: { message: 'Título obrigatório' } });
        }
        const statusV = VALID_STATUS.includes(status) ? status : 'todo';
        const priorityV = VALID_PRIORITY.includes(priority) ? priority : 'normal';

        // Valida client_id (se fornecido, precisa pertencer ao user)
        let clientIdV: string | null = null;
        if (client_id && typeof client_id === 'string') {
            const cl = await query<any>(
                `SELECT id FROM clients WHERE id = $1 AND user_id = $2`,
                [client_id, userId]
            );
            if (!cl.length) return res.status(400).json({ success: false, error: { message: 'Cliente inválido' } });
            clientIdV = client_id;
        }

        // position = próxima posição na coluna
        const posQ = await query<any>(
            `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
             FROM board_cards WHERE user_id = $1 AND status = $2`,
            [userId, statusV]
        );
        const position = posQ[0]?.next_pos || 0;

        const row = await query<any>(
            `INSERT INTO board_cards
                (user_id, title, description, status, priority, project, client_id, due_date, position, checklist)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
             RETURNING id`,
            [
                userId,
                String(title).trim().slice(0, 300),
                description ? String(description).slice(0, 5000) : null,
                statusV,
                priorityV,
                project ? String(project).slice(0, 100) : null,
                clientIdV,
                due_date || null,
                position,
                JSON.stringify(sanitizeChecklist(checklist)),
            ]
        );

        // Retorna com dados do cliente já mergeados
        const full = await query<any>(
            `SELECT bc.*, cl.name AS client_name, cl.company AS client_company, cl.avatar_color AS client_avatar_color
             FROM board_cards bc LEFT JOIN clients cl ON bc.client_id = cl.id
             WHERE bc.id = $1`,
            [row[0].id]
        );
        res.json({ success: true, data: full[0] });
    } catch (err: any) {
        logger.error('board: create falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── PATCH /board/:id ───────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { title, description, status, priority, project, client_id, due_date, checklist, position } = req.body;

        const fields: string[] = [];
        const values: any[] = [];
        let i = 1;

        if (title !== undefined) { fields.push(`title = $${i++}`); values.push(String(title).trim().slice(0, 300)); }
        if (description !== undefined) { fields.push(`description = $${i++}`); values.push(description ? String(description).slice(0, 5000) : null); }
        if (status !== undefined) {
            if (!VALID_STATUS.includes(status)) return res.status(400).json({ success: false, error: { message: 'Status inválido' } });
            fields.push(`status = $${i++}`); values.push(status);
            // quando move pra done, marca completed_at
            if (status === 'done') { fields.push(`completed_at = NOW()`); }
            else { fields.push(`completed_at = NULL`); }
        }
        if (priority !== undefined) {
            if (!VALID_PRIORITY.includes(priority)) return res.status(400).json({ success: false, error: { message: 'Prioridade inválida' } });
            fields.push(`priority = $${i++}`); values.push(priority);
        }
        if (project !== undefined) { fields.push(`project = $${i++}`); values.push(project ? String(project).slice(0, 100) : null); }
        if (client_id !== undefined) {
            let clientIdV: string | null = null;
            if (client_id) {
                const cl = await query<any>(
                    `SELECT id FROM clients WHERE id = $1 AND user_id = $2`,
                    [client_id, userId]
                );
                if (!cl.length) return res.status(400).json({ success: false, error: { message: 'Cliente inválido' } });
                clientIdV = client_id;
            }
            fields.push(`client_id = $${i++}`); values.push(clientIdV);
        }
        if (due_date !== undefined) { fields.push(`due_date = $${i++}`); values.push(due_date || null); }
        if (checklist !== undefined) { fields.push(`checklist = $${i++}::jsonb`); values.push(JSON.stringify(sanitizeChecklist(checklist))); }
        if (position !== undefined) { fields.push(`position = $${i++}`); values.push(Number(position) || 0); }

        if (!fields.length) return res.status(400).json({ success: false, error: { message: 'Nada para atualizar' } });
        fields.push(`updated_at = NOW()`);

        values.push(id, userId);
        const row = await query<any>(
            `UPDATE board_cards SET ${fields.join(', ')}
             WHERE id = $${i++} AND user_id = $${i++}
             RETURNING id`,
            values
        );
        if (!row.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const full = await query<any>(
            `SELECT bc.*, cl.name AS client_name, cl.company AS client_company, cl.avatar_color AS client_avatar_color
             FROM board_cards bc LEFT JOIN clients cl ON bc.client_id = cl.id
             WHERE bc.id = $1`,
            [row[0].id]
        );
        res.json({ success: true, data: full[0] });
    } catch (err: any) {
        logger.error('board: update falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /board/:id/checklist/:itemId/toggle ──────────────────────────────
router.post('/:id/checklist/:itemId/toggle', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id, itemId } = req.params;
        const cur = await query<any>(
            `SELECT checklist FROM board_cards WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (!cur.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const list = Array.isArray(cur[0].checklist) ? cur[0].checklist : [];
        const updated = list.map((it: any) => it.id === itemId ? { ...it, done: !it.done } : it);
        const row = await query<any>(
            `UPDATE board_cards SET checklist = $1::jsonb, updated_at = NOW()
             WHERE id = $2 AND user_id = $3 RETURNING *`,
            [JSON.stringify(updated), id, userId]
        );
        res.json({ success: true, data: row[0] });
    } catch (err: any) {
        logger.error('board: toggle checklist falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /board/reorder ────────────────────────────────────────────────────
// Body: { cards: [{ id, status, position }, ...] }
// Usado pelo drag-and-drop do Kanban (reordena em massa numa transação).
router.post('/reorder', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { cards } = req.body;
        if (!Array.isArray(cards)) return res.status(400).json({ success: false, error: { message: 'cards inválido' } });

        for (const c of cards) {
            if (!c.id || !VALID_STATUS.includes(c.status)) continue;
            const completedClause = c.status === 'done' ? 'completed_at = NOW()' : 'completed_at = NULL';
            await query(
                `UPDATE board_cards SET status = $1, position = $2, ${completedClause}, updated_at = NOW()
                 WHERE id = $3 AND user_id = $4`,
                [c.status, Number(c.position) || 0, c.id, userId]
            );
        }
        res.json({ success: true, data: { count: cards.length } });
    } catch (err: any) {
        logger.error('board: reorder falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── DELETE /board/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const r = await query<any>(
            `DELETE FROM board_cards WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, userId]
        );
        if (!r.length) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        res.json({ success: true, data: { id } });
    } catch (err: any) {
        logger.error('board: delete falhou', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const boardController = router;
