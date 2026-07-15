// ==============================
// Google OAuth Controller — Drive + Calendar endpoints
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { ValidationError } from '../shared/errors';
import {
    buildAuthUrl, handleOAuthCallback, getStatus, disconnect,
    uploadPdfToDrive, createCalendarEvent, listCalendarEvents,
} from './google-oauth.service';
import { logger } from '../shared/logger';

// Public callback (Google redireciona pra cá após consent)
const publicRouter = Router();

publicRouter.get('/callback', async (req: Request, res: Response) => {
    try {
        const code = String(req.query.code || '');
        const state = String(req.query.state || '');
        const err = req.query.error;
        if (err) {
            return res.status(400).type('html').send(renderCallbackPage(false, `Google recusou: ${err}`));
        }
        if (!code || !state) return res.status(400).type('html').send(renderCallbackPage(false, 'code ou state ausente'));
        const result = await handleOAuthCallback(code, state);
        res.type('html').send(renderCallbackPage(true, `Conectado como ${result.email}`));
    } catch (e: any) {
        logger.warn('google oauth callback falhou', { error: e.message });
        res.status(400).type('html').send(renderCallbackPage(false, e.message));
    }
});

function renderCallbackPage(ok: boolean, msg: string): string {
    const color = ok ? '#22c55e' : '#ef4444';
    const title = ok ? '✓ Google conectado' : '✗ Falhou';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Google</title></head>
<body style="font-family:system-ui;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center;padding:40px;border:1px solid #333;border-radius:12px;background:#111">
        <h1 style="color:${color};margin:0 0 12px">${title}</h1>
        <p style="color:#ccc;margin:0 0 24px">${msg}</p>
        <p style="color:#666;font-size:13px">Você pode fechar esta janela.</p>
    </div>
    <script>setTimeout(() => window.close(), 2500);</script>
</body></html>`;
}

// Authed
const authed = Router();
authed.use(authMiddleware);

// GET /google/oauth/status
authed.get('/status', async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await getStatus(req.user!.userId) }); }
    catch (err) { next(err); }
});

// POST /google/oauth/connect  { scopes?: string[] }  → { url }
authed.post('/connect', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const scopes: string[] = Array.isArray(req.body?.scopes) && req.body.scopes.length
            ? req.body.scopes
            : [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/calendar.events',
                'https://www.googleapis.com/auth/userinfo.email',
            ];
        const url = await buildAuthUrl(req.user!.userId, scopes);
        res.json({ success: true, data: { url } });
    } catch (err) { next(err); }
});

// POST /google/oauth/disconnect
authed.post('/disconnect', async (req: Request, res: Response, next: NextFunction) => {
    try { await disconnect(req.user!.userId); res.json({ success: true }); }
    catch (err) { next(err); }
});

// POST /google/drive/upload  { snapshot_token, folder? }
authed.post('/drive/upload', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { snapshot_token, folder } = req.body;
        if (!snapshot_token) throw new ValidationError('snapshot_token obrigatório');
        const result = await uploadPdfToDrive(req.user!.userId, snapshot_token, folder || 'TrafficAI Reports');
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// POST /google/calendar/events  { title, startAt, endAt, description?, clientId?, attendees?, createMeet? }
authed.post('/calendar/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { title, startAt, endAt, description, clientId, attendees, createMeet } = req.body;
        if (!title || !startAt || !endAt) throw new ValidationError('title, startAt e endAt são obrigatórios');
        const result = await createCalendarEvent(req.user!.userId, {
            title, startAt, endAt, description, clientId,
            attendees: Array.isArray(attendees) ? attendees : undefined,
            createMeet: Boolean(createMeet),
        });
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// GET /google/calendar/events?from=...&to=...
authed.get('/calendar/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const from = String(req.query.from || new Date(Date.now() - 7 * 86400000).toISOString());
        const to = String(req.query.to || new Date(Date.now() + 30 * 86400000).toISOString());
        const events = await listCalendarEvents(req.user!.userId, from, to);
        res.json({ success: true, data: events });
    } catch (err) { next(err); }
});

export const googleOAuthPublicController = publicRouter;
export const googleOAuthController = authed;
