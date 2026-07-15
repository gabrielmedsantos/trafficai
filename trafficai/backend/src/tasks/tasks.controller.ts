// ==============================
// TrafficAI — Client Workflow Tasks Controller
// ==============================

import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';

const router = Router();
router.use(authMiddleware);

// ─── GET /tasks?since=YYYY-MM-DD&until=YYYY-MM-DD ─────────────────────────
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { since, until } = req.query;

        const rows = await query<any>(
            `SELECT
                cwt.*,
                cl.name AS client_name,
                cl.company AS client_company,
                cl.avatar_color
             FROM client_workflow_tasks cwt
             JOIN clients cl ON cwt.client_id = cl.id
             WHERE cwt.user_id = $1
               AND cwt.scheduled_date >= $2
               AND cwt.scheduled_date <= $3
             ORDER BY cwt.scheduled_date ASC, cl.name ASC`,
            [userId, since || '1970-01-01', until || '2099-12-31']
        );

        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao listar tarefas de workflow', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tasks/summary ───────────────────────────────────────────────────
router.get('/summary', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;

        // Get Monday and Sunday of current week
        const now = new Date();
        const day = now.getDay();
        const diffToMon = day === 0 ? -6 : 1 - day;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMon);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const monStr = monday.toISOString().split('T')[0];
        const sunStr = sunday.toISOString().split('T')[0];

        const rows = await query<any>(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                COUNT(*) FILTER (WHERE status = 'done') AS done,
                COUNT(*) AS total
             FROM client_workflow_tasks
             WHERE user_id = $1
               AND scheduled_date >= $2
               AND scheduled_date <= $3`,
            [userId, monStr, sunStr]
        );

        const clientsPendingRows = await query<any>(
            `SELECT COUNT(DISTINCT client_id) AS clients_pending
             FROM client_workflow_tasks
             WHERE user_id = $1
               AND status = 'pending'
               AND scheduled_date >= $2
               AND scheduled_date <= $3`,
            [userId, monStr, sunStr]
        );

        const summary = rows[0] || { pending: 0, done: 0, total: 0 };
        const clientsPending = clientsPendingRows[0]?.clients_pending || 0;

        res.json({
            success: true,
            data: {
                pending: Number(summary.pending),
                done: Number(summary.done),
                total: Number(summary.total),
                clients_pending: Number(clientsPending),
            },
        });
    } catch (error: any) {
        logger.error('Erro ao buscar summary', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tasks/history?client_id=xxx&limit=50 ────────────────────────────
router.get('/history', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { client_id, limit } = req.query;
        const limitNum = Math.min(Number(limit) || 50, 500);

        const params: any[] = [userId];
        let clientFilter = '';
        if (client_id) {
            params.push(client_id);
            clientFilter = `AND cwt.client_id = $${params.length}`;
        }
        params.push(limitNum);

        const rows = await query<any>(
            `SELECT
                cwt.*,
                cl.name AS client_name,
                cl.company AS client_company,
                cl.avatar_color
             FROM client_workflow_tasks cwt
             JOIN clients cl ON cwt.client_id = cl.id
             WHERE cwt.user_id = $1
               AND cwt.status IN ('done', 'skipped')
               ${clientFilter}
             ORDER BY cwt.scheduled_date DESC
             LIMIT $${params.length}`,
            params
        );

        res.json({ success: true, data: rows });
    } catch (error: any) {
        logger.error('Erro ao buscar histórico', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tasks/generate ─────────────────────────────────────────────────
router.post('/generate', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { since, until } = req.body;

        if (!since || !until) {
            return res.status(400).json({ success: false, error: { message: 'since e until são obrigatórios' } });
        }

        // Fetch active clients
        const clients = await query<any>(
            `SELECT id, name, avatar_color FROM clients WHERE user_id = $1 AND status = 'ativo'`,
            [userId]
        );

        if (!clients.length) {
            return res.json({ success: true, data: { generated: 0 } });
        }

        let generated = 0;

        // Iterate over each date in the range
        const sinceDate = new Date(since + 'T00:00:00');
        const untilDate = new Date(until + 'T00:00:00');

        const current = new Date(sinceDate);
        while (current <= untilDate) {
            const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            const dateStr = current.toISOString().split('T')[0];

            for (const client of clients) {
                // Monday → report
                if (dayOfWeek === 1) {
                    const r = await query(
                        `INSERT INTO client_workflow_tasks (user_id, client_id, type, scheduled_date)
                         VALUES ($1, $2, 'report', $3)
                         ON CONFLICT (client_id, type, scheduled_date) DO NOTHING`,
                        [userId, client.id, dateStr]
                    );
                    if ((r as any).rowCount > 0) generated++;
                }

                // Wednesday → checkin_wed
                if (dayOfWeek === 3) {
                    const r = await query(
                        `INSERT INTO client_workflow_tasks (user_id, client_id, type, scheduled_date)
                         VALUES ($1, $2, 'checkin_wed', $3)
                         ON CONFLICT (client_id, type, scheduled_date) DO NOTHING`,
                        [userId, client.id, dateStr]
                    );
                    if ((r as any).rowCount > 0) generated++;
                }

                // Friday → checkin_fri
                if (dayOfWeek === 5) {
                    const r = await query(
                        `INSERT INTO client_workflow_tasks (user_id, client_id, type, scheduled_date)
                         VALUES ($1, $2, 'checkin_fri', $3)
                         ON CONFLICT (client_id, type, scheduled_date) DO NOTHING`,
                        [userId, client.id, dateStr]
                    );
                    if ((r as any).rowCount > 0) generated++;
                }
            }

            current.setDate(current.getDate() + 1);
        }

        // Generate analysis tasks: one per active client if last analysis > 6 days ago from sinceDate
        for (const client of clients) {
            const lastAnalysis = await query<any>(
                `SELECT scheduled_date FROM client_workflow_tasks
                 WHERE user_id = $1 AND client_id = $2 AND type = 'analysis'
                 ORDER BY scheduled_date DESC
                 LIMIT 1`,
                [userId, client.id]
            );

            const sinceDateStr = sinceDate.toISOString().split('T')[0];
            let shouldCreate = false;

            if (!lastAnalysis.length) {
                shouldCreate = true;
            } else {
                const lastDate = new Date(lastAnalysis[0].scheduled_date + 'T00:00:00');
                const diffDays = (sinceDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays > 6) {
                    shouldCreate = true;
                }
            }

            if (shouldCreate) {
                const r = await query(
                    `INSERT INTO client_workflow_tasks (user_id, client_id, type, scheduled_date)
                     VALUES ($1, $2, 'analysis', $3)
                     ON CONFLICT (client_id, type, scheduled_date) DO NOTHING`,
                    [userId, client.id, sinceDate.toISOString().split('T')[0]]
                );
                if ((r as any).rowCount > 0) generated++;
            }
        }

        res.json({ success: true, data: { generated } });
    } catch (error: any) {
        logger.error('Erro ao gerar tarefas de workflow', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── PUT /tasks/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { status, campaign_changes, report_sent, report_data, message_text, message_sent, notes } = req.body;

        const completedAtExpr = status === 'done' ? 'NOW()' : 'completed_at';

        const rows = await query<any>(
            `UPDATE client_workflow_tasks SET
               status = COALESCE($3, status),
               campaign_changes = COALESCE($4, campaign_changes),
               report_sent = COALESCE($5, report_sent),
               report_data = COALESCE($6, report_data),
               message_text = COALESCE($7, message_text),
               message_sent = COALESCE($8, message_sent),
               notes = COALESCE($9, notes),
               completed_at = CASE WHEN $3 = 'done' THEN NOW() ELSE completed_at END,
               updated_at = NOW()
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, userId, status ?? null, campaign_changes ?? null, report_sent ?? null, report_data ?? null, message_text ?? null, message_sent ?? null, notes ?? null]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Tarefa não encontrada' } });
        }

        // Re-fetch with client info
        const fullRows = await query<any>(
            `SELECT cwt.*, cl.name AS client_name, cl.company AS client_company, cl.avatar_color
             FROM client_workflow_tasks cwt
             JOIN clients cl ON cwt.client_id = cl.id
             WHERE cwt.id = $1`,
            [id]
        );

        res.json({ success: true, data: fullRows[0] });
    } catch (error: any) {
        logger.error('Erro ao atualizar tarefa', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tasks/:id/timer/start ─────────────────────────────────────────
router.post('/:id/timer/start', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const rows = await query<any>(
            `UPDATE client_workflow_tasks
             SET timer_started_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND timer_started_at IS NULL
             RETURNING id, timer_started_at`,
            [id, userId]
        );

        if (!rows.length) {
            const check = await query<any>(`SELECT id, timer_started_at FROM client_workflow_tasks WHERE id = $1 AND user_id = $2`, [id, userId]);
            if (!check.length) return res.status(404).json({ success: false, error: { message: 'Tarefa não encontrada' } });
            if (check[0].timer_started_at) return res.status(409).json({ success: false, error: { message: 'Timer já está rodando' } });
        }

        res.json({ success: true, data: { timer_started_at: rows[0]?.timer_started_at || null } });
    } catch (error: any) {
        logger.error('Erro ao iniciar timer', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── POST /tasks/:id/timer/stop ──────────────────────────────────────────
// Pausar = concluir: marca a tarefa como done e fecha o cronômetro.
// Body opcional { complete: false } pra apenas pausar sem concluir.
router.post('/:id/timer/stop', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const complete = (req.body?.complete ?? true) !== false;

        const current = await query<any>(
            `SELECT timer_started_at, time_spent_seconds, status FROM client_workflow_tasks WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );

        if (!current.length) return res.status(404).json({ success: false, error: { message: 'Tarefa não encontrada' } });
        if (!current[0].timer_started_at) return res.status(409).json({ success: false, error: { message: 'Timer não está rodando' } });

        const elapsed = Math.round((Date.now() - new Date(current[0].timer_started_at).getTime()) / 1000);
        const totalSeconds = (Number(current[0].time_spent_seconds) || 0) + elapsed;
        const newStatus = complete && current[0].status === 'pending' ? 'done' : current[0].status;
        const completeTouch = complete && current[0].status === 'pending'
            ? `, completed_at = NOW()`
            : '';

        const updated = await query<any>(
            `UPDATE client_workflow_tasks
             SET timer_started_at = NULL, time_spent_seconds = $3, status = $4${completeTouch}, updated_at = NOW()
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [id, userId, totalSeconds, newStatus]
        );

        res.json({
            success: true,
            data: {
                ...updated[0],
                time_spent_seconds: totalSeconds,
                elapsed_seconds: elapsed,
            },
        });
    } catch (error: any) {
        logger.error('Erro ao parar timer', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── GET /tasks/team-stats?since=YYYY-MM-DD&until=YYYY-MM-DD ─────────────
router.get('/team-stats', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { since, until } = req.query;

        const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const untilDate = until || new Date().toISOString().split('T')[0];

        const stats = await query<any>(
            `SELECT
                u.id AS user_id,
                u.name,
                u.email,
                u.department,
                u.job_title,
                u.avatar_color,
                COUNT(cwt.id) FILTER (WHERE cwt.status = 'done') AS tasks_done,
                COUNT(cwt.id) FILTER (WHERE cwt.status = 'pending') AS tasks_pending,
                COUNT(cwt.id) FILTER (WHERE cwt.status = 'skipped') AS tasks_skipped,
                COUNT(cwt.id) AS tasks_total,
                COALESCE(SUM(cwt.time_spent_seconds) FILTER (WHERE cwt.status = 'done'), 0) AS total_seconds,
                COUNT(DISTINCT cwt.client_id) FILTER (WHERE cwt.status = 'done') AS clients_served,
                json_agg(
                    json_build_object(
                        'type', cwt.type,
                        'count', 1,
                        'time_spent_seconds', COALESCE(cwt.time_spent_seconds, 0)
                    )
                ) FILTER (WHERE cwt.status = 'done') AS task_breakdown_raw
             FROM users u
             LEFT JOIN client_workflow_tasks cwt ON cwt.user_id = u.id
                AND cwt.scheduled_date >= $1 AND cwt.scheduled_date <= $2
             GROUP BY u.id, u.name, u.email, u.department, u.job_title, u.avatar_color
             ORDER BY tasks_done DESC, total_seconds DESC`,
            [sinceDate, untilDate]
        );

        const data = stats.map((r: any) => {
            const byType: Record<string, { count: number; total_seconds: number }> = {};
            (r.task_breakdown_raw || []).forEach((t: any) => {
                if (!t.type) return;
                if (!byType[t.type]) byType[t.type] = { count: 0, total_seconds: 0 };
                byType[t.type].count++;
                byType[t.type].total_seconds += t.time_spent_seconds || 0;
            });
            return {
                user_id: r.user_id,
                name: r.name,
                email: r.email,
                department: r.department,
                job_title: r.job_title,
                avatar_color: r.avatar_color || '#6366f1',
                tasks_done: Number(r.tasks_done),
                tasks_pending: Number(r.tasks_pending),
                tasks_skipped: Number(r.tasks_skipped),
                tasks_total: Number(r.tasks_total),
                total_seconds: Number(r.total_seconds),
                clients_served: Number(r.clients_served),
                by_type: byType,
            };
        });

        res.json({ success: true, data });
    } catch (error: any) {
        logger.error('Erro ao buscar team stats', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── DELETE /tasks/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const rows = await query<any>(
            `DELETE FROM client_workflow_tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: { message: 'Tarefa não encontrada' } });
        }

        res.json({ success: true, data: { message: 'Tarefa removida' } });
    } catch (error: any) {
        logger.error('Erro ao remover tarefa', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const tasksController = router;
