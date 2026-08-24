// ==============================
// TrafficAI — Routines Config Controller
// CRUD + expansão de ocorrências pra "hoje/semana".
// Rotinas configuradas pelo gestor: reuniões, checklists, envio de relatórios.
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { ValidationError } from '../shared/errors';

const router = Router();
router.use(authMiddleware);

// ─── Types ────────────────────────────────────────────────────────────────────

type RoutineKind = 'meeting' | 'checklist_camp' | 'checklist_client' | 'report_send' | 'custom';
type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

interface Routine {
    id: string;
    user_id: string;
    ad_account_id: string | null;
    kind: RoutineKind;
    title: string;
    description: string | null;
    frequency: Frequency;
    days_of_week: number[];
    day_of_month: number | null;
    time_of_day: string | null;
    checklist_items: any;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retorna true se a rotina se aplica ao dia especificado.
 * Considera frequency + days_of_week + day_of_month + biweekly reference.
 */
function appliesTo(routine: Routine, date: Date): boolean {
    if (!routine.is_active) return false;
    const dow = date.getDay(); // 0=Dom, 1=Seg...

    if (routine.frequency === 'daily') return true;

    if (routine.frequency === 'weekly') {
        return Array.isArray(routine.days_of_week) && routine.days_of_week.includes(dow);
    }

    if (routine.frequency === 'biweekly') {
        if (!routine.days_of_week?.includes(dow)) return false;
        // Bissemanal: ativa em semanas pares (semana 1 desde criação)
        const created = new Date(routine.created_at);
        const daysSince = Math.floor((date.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = Math.floor(daysSince / 7);
        return weekIdx % 2 === 0;
    }

    if (routine.frequency === 'monthly') {
        return routine.day_of_month === date.getDate();
    }

    return false;
}

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

// ─── Endpoints CRUD ───────────────────────────────────────────────────────────

/** GET /routines-config — lista todas as rotinas do usuário */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await query<Routine>(
            `SELECT r.*, a.account_name AS ad_account_name
             FROM routines r
             LEFT JOIN ad_accounts a ON a.id = r.ad_account_id
             WHERE r.user_id = $1
             ORDER BY r.display_order ASC, r.created_at DESC`,
            [req.user!.userId]
        );
        res.json({ success: true, data: rows });
    } catch (err) { next(err); }
});

/** POST /routines-config — cria nova rotina */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const b = req.body || {};
        const kind: RoutineKind = b.kind;
        const validKinds = ['meeting', 'checklist_camp', 'checklist_client', 'report_send', 'custom'];
        if (!validKinds.includes(kind)) throw new ValidationError('kind inválido');

        const frequency: Frequency = b.frequency;
        const validFreqs = ['daily', 'weekly', 'biweekly', 'monthly', 'custom'];
        if (!validFreqs.includes(frequency)) throw new ValidationError('frequency inválido');

        const title = String(b.title || '').trim();
        if (!title) throw new ValidationError('title obrigatório');

        // days_of_week: array de 0-6
        const daysOfWeek: number[] = Array.isArray(b.days_of_week)
            ? b.days_of_week.map((n: any) => Number(n)).filter((n: number) => n >= 0 && n <= 6)
            : [];

        // day_of_month: 1-31
        const dayOfMonth = b.day_of_month != null ? Math.max(1, Math.min(31, Number(b.day_of_month))) : null;

        // time_of_day: HH:MM ou null
        const timeOfDay = b.time_of_day && /^\d{2}:\d{2}$/.test(b.time_of_day) ? b.time_of_day : null;

        const rows = await query<Routine>(
            `INSERT INTO routines (
                user_id, ad_account_id, kind, title, description,
                frequency, days_of_week, day_of_month, time_of_day,
                checklist_items, is_active, display_order
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
            [
                req.user!.userId,
                b.ad_account_id || null,
                kind,
                title,
                b.description || null,
                frequency,
                daysOfWeek,
                dayOfMonth,
                timeOfDay,
                JSON.stringify(Array.isArray(b.checklist_items) ? b.checklist_items : []),
                b.is_active !== false,
                Number(b.display_order || 0),
            ]
        );
        res.status(201).json({ success: true, data: rows[0] });
    } catch (err) { next(err); }
});

/** PATCH /routines-config/:id — atualiza rotina */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const b = req.body || {};
        const allowed = [
            'title', 'description', 'kind', 'frequency', 'ad_account_id',
            'days_of_week', 'day_of_month', 'time_of_day', 'checklist_items',
            'is_active', 'display_order',
        ];
        const sets: string[] = [];
        const values: any[] = [];
        let i = 1;
        for (const field of allowed) {
            if (field in b) {
                if (field === 'checklist_items' || field === 'days_of_week') {
                    sets.push(`${field} = $${i++}`);
                    values.push(field === 'checklist_items' ? JSON.stringify(b[field]) : b[field]);
                } else {
                    sets.push(`${field} = $${i++}`);
                    values.push(b[field]);
                }
            }
        }
        if (sets.length === 0) throw new ValidationError('Nada pra atualizar');
        values.push(req.params.id, req.user!.userId);
        const rows = await query<Routine>(
            `UPDATE routines SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
            values
        );
        if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Rotina não encontrada' } });
        res.json({ success: true, data: rows[0] });
    } catch (err) { next(err); }
});

/** DELETE /routines-config/:id */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await query('DELETE FROM routines WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.userId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ─── Expansão de ocorrências ──────────────────────────────────────────────────

/** GET /routines-config/today — o que tem hoje pra fazer */
router.get('/today', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        const items = await expandForDate(req.user!.userId, today);
        res.json({ success: true, data: { date: isoDate(today), items } });
    } catch (err) { next(err); }
});

/** GET /routines-config/week — expansão dos próximos 7 dias */
router.get('/week', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const days: any[] = [];
        for (let offset = 0; offset < 7; offset++) {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            const items = await expandForDate(req.user!.userId, d);
            days.push({ date: isoDate(d), day_of_week: d.getDay(), items });
        }
        res.json({ success: true, data: days });
    } catch (err) { next(err); }
});

/** POST /routines-config/:id/mark-done — marca ocorrência do dia como feita */
router.post('/:id/mark-done', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dateStr = req.body?.date || isoDate(new Date());
        const isDone = req.body?.is_done !== false;
        await query(
            `INSERT INTO routine_occurrences (routine_id, scheduled_for, is_done, done_at)
             VALUES ($1, $2::date, $3, $4)
             ON CONFLICT (routine_id, scheduled_for) DO UPDATE
             SET is_done = EXCLUDED.is_done,
                 done_at = CASE WHEN EXCLUDED.is_done THEN now() ELSE NULL END`,
            [req.params.id, dateStr, isDone, isDone ? new Date() : null]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

async function expandForDate(userId: string, date: Date) {
    const routines = await query<Routine & { ad_account_name?: string }>(
        `SELECT r.*, a.account_name AS ad_account_name
         FROM routines r
         LEFT JOIN ad_accounts a ON a.id = r.ad_account_id
         WHERE r.user_id = $1 AND r.is_active = TRUE
         ORDER BY r.time_of_day ASC NULLS LAST, r.display_order ASC`,
        [userId]
    );

    const dateStr = isoDate(date);
    const applied = routines.filter(r => appliesTo(r, date));

    // Busca status de conclusão do dia
    const ids = applied.map(r => r.id);
    let occurrences: any[] = [];
    if (ids.length > 0) {
        occurrences = await query(
            `SELECT routine_id, is_done, done_at FROM routine_occurrences
             WHERE scheduled_for = $1::date AND routine_id = ANY($2::uuid[])`,
            [dateStr, ids]
        );
    }
    const occMap = new Map(occurrences.map((o: any) => [o.routine_id, o]));

    return applied.map(r => ({
        ...r,
        is_done: occMap.get(r.id)?.is_done || false,
        done_at: occMap.get(r.id)?.done_at || null,
    }));
}

export const routinesConfigController = router;
