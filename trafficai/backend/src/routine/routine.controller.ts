// ==============================
// TrafficAI — Routine Controller
// Google Calendar + Review Schedule
// ==============================

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/v1/routine/google/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── GOOGLE OAUTH (público — callback do Google) ───────────────────────────

// GET /routine/google/callback — OAuth callback do Google
router.get('/google/callback', async (req: Request, res: Response) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            return res.redirect(`${FRONTEND_URL}/rotina?google_error=${error}`);
        }

        if (!code || !state) {
            return res.redirect(`${FRONTEND_URL}/rotina?google_error=missing_params`);
        }

        // Decodifica o userId do state (base64url — URL-safe)
        const rawState = decodeURIComponent(state as string);
        const decoded = Buffer.from(rawState, 'base64').toString('utf-8');
        const userId = decoded.split('::')[0];

        if (!userId) {
            return res.redirect(`${FRONTEND_URL}/rotina?google_error=invalid_state`);
        }

        // Troca o código por tokens (form-encoded — formato preferido pelo Google)
        const params = new URLSearchParams();
        params.append('code', code as string);
        params.append('client_id', GOOGLE_CLIENT_ID);
        params.append('client_secret', GOOGLE_CLIENT_SECRET);
        params.append('redirect_uri', GOOGLE_REDIRECT_URI);
        params.append('grant_type', 'authorization_code');
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const { access_token, refresh_token, expires_in } = tokenRes.data;
        const expiry = new Date(Date.now() + (expires_in || 3600) * 1000);

        // Busca email do usuário Google
        let googleEmail: string | null = null;
        try {
            const userInfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${access_token}` },
            });
            googleEmail = userInfo.data.email;
        } catch { /* silently ignore */ }

        // Salva tokens no banco
        await query(
            `INSERT INTO google_calendar_tokens (user_id, access_token, refresh_token, token_expiry, google_email, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               access_token = EXCLUDED.access_token,
               refresh_token = COALESCE(EXCLUDED.refresh_token, google_calendar_tokens.refresh_token),
               token_expiry = EXCLUDED.token_expiry,
               google_email = EXCLUDED.google_email,
               updated_at = NOW()`,
            [userId, access_token, refresh_token || null, expiry, googleEmail]
        );

        res.redirect(`${FRONTEND_URL}/rotina?google_connected=true`);
    } catch (err: any) {
        const googleErr = err.response?.data?.error || 'auth_failed';
        const googleDesc = err.response?.data?.error_description || err.message;
        logger.error('Google OAuth callback error', { error: googleErr, description: googleDesc });
        console.error(`\n❌ Google OAuth Error: ${googleErr}\n   ${googleDesc}\n`);
        res.redirect(`${FRONTEND_URL}/rotina?google_error=${encodeURIComponent(googleErr)}&google_desc=${encodeURIComponent(googleDesc)}`);
    }
});

// ─── ROTAS AUTENTICADAS ────────────────────────────────────────────────────

router.use(authMiddleware);

// ─── GOOGLE CALENDAR ───────────────────────────────────────────────────────

// GET /routine/google/auth-url — retorna URL de autorização OAuth
router.get('/google/auth-url', (req: Request, res: Response) => {
    const userId = (req as any).user.userId;

    if (!GOOGLE_CLIENT_ID) {
        return res.status(503).json({ success: false, error: { message: 'Google Calendar não configurado' } });
    }

    const state = encodeURIComponent(Buffer.from(`${userId}::${Date.now()}`).toString('base64'));
    const scopes = [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${state}`;

    res.json({ success: true, data: { url } });
});

// GET /routine/google/status — verifica se Google Calendar está conectado
router.get('/google/status', async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    const rows = await query(
        `SELECT google_email, connected_at FROM google_calendar_tokens WHERE user_id = $1`,
        [userId]
    );
    res.json({
        success: true,
        data: {
            connected: rows.length > 0,
            email: rows[0]?.google_email || null,
            connected_at: rows[0]?.connected_at || null,
            configured: !!GOOGLE_CLIENT_ID,
        },
    });
});

// DELETE /routine/google/disconnect
router.delete('/google/disconnect', async (req: Request, res: Response) => {
    const userId = (req as any).user.userId;
    await query(`DELETE FROM google_calendar_tokens WHERE user_id = $1`, [userId]);
    res.json({ success: true, data: { message: 'Google Calendar desconectado' } });
});

// GET /routine/google/events?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/google/events', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { start, end } = req.query;

        const tokenRows = await query<any>(
            `SELECT access_token, refresh_token, token_expiry FROM google_calendar_tokens WHERE user_id = $1`,
            [userId]
        );

        if (!tokenRows.length) {
            return res.json({ success: true, data: [] });
        }

        const token = await getValidToken(userId, tokenRows[0]);
        if (!token) {
            return res.status(401).json({ success: false, error: { message: 'Token Google inválido' } });
        }

        const startDate = start || new Date().toISOString().split('T')[0];
        const endDate = end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const eventsRes = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                timeMin: `${startDate}T00:00:00Z`,
                timeMax: `${endDate}T23:59:59Z`,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 100,
            },
        });

        const events = (eventsRes.data.items || []).map((e: any) => ({
            id: e.id,
            title: e.summary || '(Sem título)',
            description: e.description || null,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            allDay: !e.start?.dateTime,
            location: e.location || null,
            meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri || null,
            color: e.colorId || null,
            colorId: e.colorId || null,
            attendees: (e.attendees || []).map((a: any) => ({ email: a.email, status: a.responseStatus })),
        }));

        res.json({ success: true, data: events });
    } catch (err: any) {
        logger.error('Erro ao buscar eventos Google Calendar', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro ao buscar eventos' } });
    }
});

// POST /routine/google/create-event — cria evento no Google Calendar
router.post('/google/create-event', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { task_id, title, description, date, time, startTime, endTime, allDay, colorId, createMeet, attendees } = req.body;

        const tokenRows = await query<any>(
            `SELECT access_token, refresh_token, token_expiry FROM google_calendar_tokens WHERE user_id = $1`,
            [userId]
        );
        if (!tokenRows.length) return res.status(400).json({ success: false, error: { message: 'Google Calendar não conectado' } });
        const token = await getValidToken(userId, tokenRows[0]);
        if (!token) return res.status(401).json({ success: false, error: { message: 'Token Google inválido' } });

        const guestList: string[] = Array.isArray(attendees) ? attendees.filter(Boolean) : [];

        let eventBody: any;
        if (allDay) {
            eventBody = { summary: title || 'Evento TrafficAI', description: description || '', start: { date }, end: { date }, colorId: colorId || '8' };
        } else {
            const st = startTime || time || '09:00';
            const et = endTime || `${String(parseInt(st.split(':')[0]) + 1).padStart(2, '0')}:${st.split(':')[1]}`;
            eventBody = {
                summary: title || '📊 Revisão de Campanha — TrafficAI',
                description: description || '',
                start: { dateTime: new Date(`${date}T${st}:00`).toISOString(), timeZone: 'America/Sao_Paulo' },
                end: { dateTime: new Date(`${date}T${et}:00`).toISOString(), timeZone: 'America/Sao_Paulo' },
                colorId: colorId || '8',
            };
        }

        if (guestList.length) eventBody.attendees = guestList.map(email => ({ email }));
        if (createMeet) {
            eventBody.conferenceData = { createRequest: { requestId: `trafficai-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
        }

        const eventRes = await axios.post(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            eventBody,
            {
                headers: { Authorization: `Bearer ${token}` },
                params: { conferenceDataVersion: createMeet ? 1 : 0, sendUpdates: guestList.length ? 'all' : 'none' },
            }
        );
        const googleEventId = eventRes.data.id;
        const meetLink = eventRes.data.hangoutLink || eventRes.data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri || null;

        if (task_id) {
            await query(`UPDATE review_tasks SET google_event_id = $2 WHERE id = $1 AND user_id = $3`, [task_id, googleEventId, userId]);
        }
        res.json({ success: true, data: { google_event_id: googleEventId, id: googleEventId, meetLink } });
    } catch (err: any) {
        logger.error('Erro ao criar evento Google Calendar', { error: err.message, detail: err.response?.data });
        res.status(500).json({ success: false, error: { message: err.response?.data?.error?.message || 'Erro ao criar evento' } });
    }
});

// PUT /routine/google/event/:eventId — atualiza evento no Google Calendar
router.put('/google/event/:eventId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { eventId } = req.params;
        const { title, description, date, startTime, endTime, allDay, colorId, createMeet, attendees } = req.body;

        const tokenRows = await query<any>(
            `SELECT access_token, refresh_token, token_expiry FROM google_calendar_tokens WHERE user_id = $1`, [userId]
        );
        if (!tokenRows.length) return res.status(400).json({ success: false, error: { message: 'Google Calendar não conectado' } });
        const token = await getValidToken(userId, tokenRows[0]);
        if (!token) return res.status(401).json({ success: false, error: { message: 'Token Google inválido' } });

        const guestList: string[] = Array.isArray(attendees) ? attendees.filter(Boolean) : [];

        let eventBody: any;
        if (allDay) {
            eventBody = { summary: title, description: description || '', start: { date }, end: { date }, colorId: colorId || '8' };
        } else {
            eventBody = {
                summary: title,
                description: description || '',
                start: { dateTime: new Date(`${date}T${startTime}:00`).toISOString(), timeZone: 'America/Sao_Paulo' },
                end: { dateTime: new Date(`${date}T${endTime}:00`).toISOString(), timeZone: 'America/Sao_Paulo' },
                colorId: colorId || '8',
            };
        }

        if (guestList.length) eventBody.attendees = guestList.map(email => ({ email }));
        if (createMeet) {
            eventBody.conferenceData = { createRequest: { requestId: `trafficai-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
        }

        const updateRes = await axios.put(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
            eventBody,
            {
                headers: { Authorization: `Bearer ${token}` },
                params: { conferenceDataVersion: createMeet ? 1 : 0, sendUpdates: guestList.length ? 'all' : 'none' },
            }
        );
        const meetLink = updateRes.data.hangoutLink || updateRes.data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri || null;
        res.json({ success: true, data: { id: updateRes.data.id, meetLink } });
    } catch (err: any) {
        logger.error('Erro ao atualizar evento', { error: err.message, detail: err.response?.data });
        res.status(500).json({ success: false, error: { message: err.response?.data?.error?.message || 'Erro ao atualizar evento' } });
    }
});

// DELETE /routine/google/event/:eventId — remove evento do Google Calendar
router.delete('/google/event/:eventId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { eventId } = req.params;

        const tokenRows = await query<any>(
            `SELECT access_token, refresh_token, token_expiry FROM google_calendar_tokens WHERE user_id = $1`, [userId]
        );
        if (!tokenRows.length) return res.status(400).json({ success: false, error: { message: 'Google Calendar não conectado' } });
        const token = await getValidToken(userId, tokenRows[0]);
        if (!token) return res.status(401).json({ success: false, error: { message: 'Token Google inválido' } });

        await axios.delete(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        await query(`UPDATE review_tasks SET google_event_id = NULL WHERE google_event_id = $1 AND user_id = $2`, [eventId, userId]);
        res.json({ success: true, data: { message: 'Evento removido' } });
    } catch (err: any) {
        logger.error('Erro ao remover evento', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro ao remover evento' } });
    }
});

// ─── SCHEDULE (configuração de revisões) ──────────────────────────────────

// GET /routine/schedule
router.get('/schedule', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const rows = await query<any>(
            `SELECT rs.*, a.account_name
             FROM review_schedule rs
             LEFT JOIN ad_accounts a ON rs.account_id = a.id
             WHERE rs.user_id = $1
             ORDER BY rs.created_at`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /routine/schedule — cria nova entrada de agenda
router.post('/schedule', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { account_id, days_of_week, review_time, sync_to_google } = req.body;

        const result = await query<any>(
            `INSERT INTO review_schedule (user_id, account_id, days_of_week, review_time, sync_to_google)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [userId, account_id || null, days_of_week || [2, 5], review_time || '09:00', sync_to_google || false]
        );

        const rows = await query<any>(
            `SELECT rs.*, a.account_name FROM review_schedule rs LEFT JOIN ad_accounts a ON rs.account_id = a.id WHERE rs.id = $1`,
            [result[0].id]
        );

        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PATCH /routine/schedule/:id
router.patch('/schedule/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { account_id, days_of_week, review_time, active, sync_to_google } = req.body;

        await query(
            `UPDATE review_schedule SET
               account_id = COALESCE($3, account_id),
               days_of_week = COALESCE($4, days_of_week),
               review_time = COALESCE($5, review_time),
               active = COALESCE($6, active),
               sync_to_google = COALESCE($7, sync_to_google),
               updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [id, userId, account_id, days_of_week, review_time, active, sync_to_google]
        );

        const rows = await query<any>(
            `SELECT rs.*, a.account_name FROM review_schedule rs LEFT JOIN ad_accounts a ON rs.account_id = a.id WHERE rs.id = $1`,
            [id]
        );

        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /routine/schedule/:id
router.delete('/schedule/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        await query(`DELETE FROM review_schedule WHERE id = $1 AND user_id = $2`, [id, userId]);
        res.json({ success: true, data: { message: 'Agenda removida' } });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── TASKS ────────────────────────────────────────────────────────────────

// GET /routine/tasks?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/tasks', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { start, end } = req.query;

        const startDate = start || getWeekStart(new Date());
        const endDate = end || getWeekEnd(new Date());

        const tasks = await query<any>(
            `SELECT rt.*, a.account_name
             FROM review_tasks rt
             LEFT JOIN ad_accounts a ON rt.account_id = a.id
             WHERE rt.user_id = $1 AND rt.scheduled_date BETWEEN $2 AND $3
             ORDER BY rt.scheduled_date, a.account_name`,
            [userId, startDate, endDate]
        );

        res.json({ success: true, data: tasks });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /routine/tasks/generate — gera tarefas para as próximas semanas
router.post('/tasks/generate', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { weeks = 2 } = req.body;

        const schedules = await query<any>(
            `SELECT * FROM review_schedule WHERE user_id = $1 AND active = true`,
            [userId]
        );

        if (!schedules.length) {
            return res.json({ success: true, data: { generated: 0 } });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(today.getTime() + Number(weeks) * 7 * 24 * 60 * 60 * 1000);

        let generated = 0;

        for (const sched of schedules) {
            const days: number[] = sched.days_of_week;
            const current = new Date(today);

            while (current <= endDate) {
                // day_of_week: 1=Dom(0), 2=Seg(1), 3=Ter(2), 4=Qua(3), 5=Qui(4), 6=Sex(5), 7=Sab(6)
                const jsDay = current.getDay(); // 0=Sun...6=Sat
                const ourDay = jsDay === 0 ? 1 : jsDay + 1;

                if (days.includes(ourDay)) {
                    const dateStr = current.toISOString().split('T')[0];

                    // Evita duplicatas
                    const existing = await query(
                        `SELECT id FROM review_tasks WHERE user_id=$1 AND account_id IS NOT DISTINCT FROM $2 AND scheduled_date=$3 AND schedule_id=$4`,
                        [userId, sched.account_id, dateStr, sched.id]
                    );

                    if (!existing.length) {
                        await query(
                            `INSERT INTO review_tasks (user_id, account_id, schedule_id, scheduled_date) VALUES ($1,$2,$3,$4)`,
                            [userId, sched.account_id, sched.id, dateStr]
                        );
                        generated++;
                    }
                }

                current.setDate(current.getDate() + 1);
            }
        }

        res.json({ success: true, data: { generated } });
    } catch (err: any) {
        logger.error('Erro ao gerar tarefas', { error: err.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PATCH /routine/tasks/:id — atualiza tarefa (concluída, notas)
router.patch('/tasks/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { completed, notes } = req.body;

        await query(
            `UPDATE review_tasks SET
               completed = COALESCE($3, completed),
               completed_at = CASE WHEN $3 = true THEN NOW() WHEN $3 = false THEN NULL ELSE completed_at END,
               notes = COALESCE($4, notes)
             WHERE id = $1 AND user_id = $2`,
            [id, userId, completed, notes]
        );

        const rows = await query<any>(
            `SELECT rt.*, a.account_name FROM review_tasks rt LEFT JOIN ad_accounts a ON rt.account_id = a.id WHERE rt.id = $1`,
            [id]
        );

        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// DELETE /routine/tasks/:id
router.delete('/tasks/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        await query(`DELETE FROM review_tasks WHERE id = $1 AND user_id = $2`, [id, userId]);
        res.json({ success: true, data: { message: 'Tarefa removida' } });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────

async function getValidToken(userId: string, tokenData: any): Promise<string | null> {
    const { access_token, refresh_token, token_expiry } = tokenData;

    // Se o token ainda é válido (com margem de 5 min), usa direto
    if (token_expiry && new Date(token_expiry) > new Date(Date.now() + 5 * 60 * 1000)) {
        return access_token;
    }

    // Precisa de refresh
    if (!refresh_token) return null;

    try {
        const res = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token,
            grant_type: 'refresh_token',
        });

        const newToken = res.data.access_token;
        const newExpiry = new Date(Date.now() + (res.data.expires_in || 3600) * 1000);

        await query(
            `UPDATE google_calendar_tokens SET access_token = $2, token_expiry = $3, updated_at = NOW() WHERE user_id = $1`,
            [userId, newToken, newExpiry]
        );

        return newToken;
    } catch {
        return null;
    }
}

function getWeekStart(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    d.setDate(diff);
    return d.toISOString().split('T')[0];
}

function getWeekEnd(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 0 : 7); // Sunday
    d.setDate(diff);
    return d.toISOString().split('T')[0];
}

// ─── MEETING LOGS ─────────────────────────────────────────────────────────────

// GET /routine/meeting-logs?since=YYYY-MM-DD&until=YYYY-MM-DD&client_id=xxx
router.get('/meeting-logs', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { since, until, client_id } = req.query as { since?: string; until?: string; client_id?: string };

        const params: any[] = [userId];
        let filters = 'WHERE ml.user_id = $1';

        if (since && until) {
            params.push(since, until);
            filters += ` AND ml.event_date >= $${params.length - 1} AND ml.event_date <= $${params.length}`;
        }
        if (client_id) {
            params.push(client_id);
            filters += ` AND ml.client_id = $${params.length}`;
        }

        const rows = await query(
            `SELECT ml.*, cl.name AS client_name, cl.avatar_color
             FROM meeting_logs ml
             LEFT JOIN clients cl ON ml.client_id = cl.id
             ${filters}
             ORDER BY ml.event_date DESC
             LIMIT 200`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// GET /routine/meeting-logs/stats — reuniões por cliente nos últimos N meses
router.get('/meeting-logs/stats', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const months = Number((req.query as any).months) || 3;

        const rows = await query<any>(
            `SELECT
                cl.id AS client_id,
                cl.name AS client_name,
                cl.avatar_color,
                COUNT(*) FILTER (WHERE ml.completed_at IS NOT NULL) AS total_completed,
                COUNT(*) FILTER (
                    WHERE ml.completed_at IS NOT NULL
                    AND ml.event_date >= date_trunc('month', CURRENT_DATE)
                ) AS this_month,
                COUNT(*) FILTER (
                    WHERE ml.completed_at IS NOT NULL
                    AND ml.event_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                    AND ml.event_date < date_trunc('month', CURRENT_DATE)
                ) AS last_month,
                json_agg(
                    json_build_object(
                        'month', to_char(date_trunc('month', ml.event_date), 'YYYY-MM'),
                        'count', 1
                    ) ORDER BY ml.event_date DESC
                ) FILTER (WHERE ml.completed_at IS NOT NULL) AS monthly_detail
             FROM clients cl
             LEFT JOIN meeting_logs ml ON ml.client_id = cl.id AND ml.user_id = $1
                AND ml.event_date >= CURRENT_DATE - ($2 || ' months')::INTERVAL
             WHERE cl.user_id = $1 AND cl.status = 'ativo'
             GROUP BY cl.id, cl.name, cl.avatar_color
             ORDER BY cl.name`,
            [userId, months]
        );

        // Agrupa monthly_detail por mês
        const data = rows.map((r: any) => {
            const byMonth: Record<string, number> = {};
            (r.monthly_detail || []).forEach((d: any) => {
                byMonth[d.month] = (byMonth[d.month] || 0) + 1;
            });
            const thisMonthCount = Number(r.this_month) || 0;
            const lastMonthCount = Number(r.last_month) || 0;
            // Risco: vermelho se este mês = 0, amarelo se = 1, verde se >= 2
            const risk = thisMonthCount === 0 ? 'high' : thisMonthCount === 1 ? 'medium' : 'low';
            return {
                client_id: r.client_id,
                client_name: r.client_name,
                avatar_color: r.avatar_color,
                total_completed: Number(r.total_completed) || 0,
                this_month: thisMonthCount,
                last_month: lastMonthCount,
                by_month: byMonth,
                risk,
            };
        });

        res.json({ success: true, data });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// POST /routine/meeting-logs — upsert (cria ou atualiza)
router.post('/meeting-logs', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { google_event_id, title, event_date, summary, completed, client_id } = req.body;
        if (!google_event_id || !title || !event_date) {
            return res.status(400).json({ success: false, error: { message: 'google_event_id, title e event_date são obrigatórios' } });
        }
        const completed_at = completed ? new Date().toISOString() : null;
        const rows = await query(
            `INSERT INTO meeting_logs (user_id, google_event_id, title, event_date, summary, completed_at, client_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, google_event_id) DO UPDATE
             SET title = EXCLUDED.title, summary = EXCLUDED.summary,
                 completed_at = EXCLUDED.completed_at,
                 client_id = COALESCE(EXCLUDED.client_id, meeting_logs.client_id),
                 updated_at = NOW()
             RETURNING *`,
            [userId, google_event_id, title, event_date, summary || null, completed_at, client_id || null]
        );
        res.json({ success: true, data: rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

export const routineController = router;
