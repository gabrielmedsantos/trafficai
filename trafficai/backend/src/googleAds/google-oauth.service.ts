// ==============================
// Google OAuth Service — Drive + Calendar
// Reutiliza client_id/secret do Google Ads OU env vars dedicadas.
// ==============================

import axios from 'axios';
import crypto from 'crypto';
import { query } from '../database/connection';
import { AppError } from '../shared/errors';
import { logger } from '../shared/logger';

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const stateStore = new Map<string, { userId: string; scopes: string[]; expiresAt: number }>();
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of stateStore) if (v.expiresAt < now) stateStore.delete(k);
}, 60000);

async function getClientCredentials(userId: string): Promise<{ client_id: string; client_secret: string }> {
    const envId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const envSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (envId && envSecret) return { client_id: envId, client_secret: envSecret };
    const r = await query<any>(`SELECT client_id, client_secret FROM google_ads_credentials WHERE user_id = $1`, [userId]);
    if (r.length && r[0].client_id && r[0].client_secret) return { client_id: r[0].client_id, client_secret: r[0].client_secret };
    throw new AppError('OAuth Google não configurado. Configure em /google-ads primeiro OU adicione GOOGLE_OAUTH_CLIENT_ID/SECRET.', 400);
}

export async function buildAuthUrl(userId: string, scopes: string[]): Promise<string> {
    const creds = await getClientCredentials(userId);
    const state = crypto.randomBytes(24).toString('hex');
    stateStore.set(state, { userId, scopes, expiresAt: Date.now() + 10 * 60 * 1000 });
    const params = new URLSearchParams({
        client_id: creds.client_id,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://api.alfamaxdigital.com.br/api/v1/google/oauth/callback',
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
    });
    return `${OAUTH_AUTH_URL}?${params}`;
}

export async function handleOAuthCallback(code: string, state: string): Promise<{ userId: string; email: string; scopes: string[] }> {
    const stateData = stateStore.get(state);
    if (!stateData) throw new AppError('State inválido ou expirado', 400);
    stateStore.delete(state);
    const creds = await getClientCredentials(stateData.userId);
    const redirect = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://api.alfamaxdigital.com.br/api/v1/google/oauth/callback';
    const tokenResp = await axios.post(OAUTH_URL, null, {
        params: { code, client_id: creds.client_id, client_secret: creds.client_secret, redirect_uri: redirect, grant_type: 'authorization_code' },
        timeout: 20000,
    });
    const { access_token, refresh_token, expires_in, scope } = tokenResp.data;
    if (!refresh_token) throw new AppError('Google não retornou refresh_token. Revogue consent e tente de novo.', 502);
    const userinfo = await axios.get(USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` }, timeout: 15000 });
    const email = userinfo.data.email || 'unknown';
    const grantedScopes: string[] = (scope || '').split(' ').filter(Boolean);
    const expiresAt = new Date(Date.now() + (Number(expires_in) || 3600) * 1000);
    await query(`
        INSERT INTO google_oauth_credentials (user_id, scopes, refresh_token, access_token, access_token_expires_at, google_email)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE SET
            scopes = EXCLUDED.scopes, refresh_token = EXCLUDED.refresh_token,
            access_token = EXCLUDED.access_token, access_token_expires_at = EXCLUDED.access_token_expires_at,
            google_email = EXCLUDED.google_email, updated_at = NOW()
    `, [stateData.userId, grantedScopes, refresh_token, access_token, expiresAt, email]);
    logger.info('google-oauth: conectado', { userId: stateData.userId, email });
    return { userId: stateData.userId, email, scopes: grantedScopes };
}

export async function getAccessToken(userId: string): Promise<string> {
    const r = await query<any>(`SELECT refresh_token, access_token, access_token_expires_at FROM google_oauth_credentials WHERE user_id = $1`, [userId]);
    if (!r.length) throw new AppError('Google OAuth não conectado', 401);
    const row = r[0];
    if (row.access_token && new Date(row.access_token_expires_at) > new Date(Date.now() + 60000)) return row.access_token;
    const creds = await getClientCredentials(userId);
    const resp = await axios.post(OAUTH_URL, null, {
        params: { grant_type: 'refresh_token', client_id: creds.client_id, client_secret: creds.client_secret, refresh_token: row.refresh_token },
        timeout: 15000,
    });
    const { access_token, expires_in } = resp.data;
    const expiresAt = new Date(Date.now() + (Number(expires_in) || 3600) * 1000);
    await query(`UPDATE google_oauth_credentials SET access_token = $1, access_token_expires_at = $2 WHERE user_id = $3`, [access_token, expiresAt, userId]);
    return access_token;
}

export async function getStatus(userId: string) {
    const r = await query<any>(`SELECT google_email, scopes FROM google_oauth_credentials WHERE user_id = $1`, [userId]);
    if (!r.length) return { connected: false, email: null, scopes: [] };
    return { connected: true, email: r[0].google_email, scopes: r[0].scopes || [] };
}

export async function disconnect(userId: string): Promise<void> {
    await query(`DELETE FROM google_oauth_credentials WHERE user_id = $1`, [userId]);
}

// ─── Drive ─────────────────────────────────────────────────────────────

export async function uploadPdfToDrive(userId: string, snapshotToken: string, folderName: string = 'TrafficAI Reports'): Promise<{ fileId: string; webViewLink: string }> {
    const snap = await query<any>(`SELECT html, account_name, period_start, period_end FROM report_pdf_snapshots WHERE token = $1 AND user_id = $2`, [snapshotToken, userId]);
    if (!snap.length) throw new AppError('Snapshot não encontrado', 404);
    const s = snap[0];
    const accessToken = await getAccessToken(userId);
    const folderId = await ensureFolder(accessToken, folderName);
    const fileName = `${s.account_name} - ${formatBR(s.period_start)} a ${formatBR(s.period_end)}.html`;
    const metadata = { name: fileName, mimeType: 'text/html', parents: [folderId] };
    const boundary = 'traffic-boundary-' + Date.now();
    const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: text/html\r\n\r\n${s.html}\r\n--${boundary}--`;
    const resp = await axios.post(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        body,
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, timeout: 30000 }
    );
    const { id: fileId, webViewLink } = resp.data;
    await query(`UPDATE report_pdf_snapshots SET drive_file_id = $1, drive_uploaded_at = NOW() WHERE token = $2`, [fileId, snapshotToken]);
    logger.info('google-drive: upload ok', { userId, fileName, fileId });
    return { fileId, webViewLink };
}

async function ensureFolder(accessToken: string, name: string): Promise<string> {
    const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const searchResp = await axios.get(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
        headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000,
    });
    if (searchResp.data.files?.length) return searchResp.data.files[0].id;
    const createResp = await axios.post('https://www.googleapis.com/drive/v3/files', { name, mimeType: 'application/vnd.google-apps.folder' }, {
        headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000,
    });
    return createResp.data.id;
}

// ─── Calendar ──────────────────────────────────────────────────────────

export interface CalendarEventInput {
    title: string;
    description?: string;
    startAt: string;
    endAt: string;
    clientId?: string;
    attendees?: string[];
    createMeet?: boolean;
}

export async function createCalendarEvent(userId: string, input: CalendarEventInput) {
    const accessToken = await getAccessToken(userId);
    const body: any = {
        summary: input.title,
        description: input.description || '',
        start: { dateTime: input.startAt, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: input.endAt, timeZone: 'America/Sao_Paulo' },
    };
    if (input.attendees?.length) body.attendees = input.attendees.map(email => ({ email }));
    if (input.createMeet) {
        body.conferenceData = {
            createRequest: { requestId: crypto.randomBytes(8).toString('hex'), conferenceSolutionKey: { type: 'hangoutsMeet' } },
        };
    }
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1';
    const resp = await axios.post(url, body, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 20000,
    });
    const evt = resp.data;
    const meetLink = evt.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || null;
    await query(`
        INSERT INTO calendar_events (user_id, google_event_id, title, description, start_at, end_at, client_id, meet_link)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, google_event_id) DO UPDATE SET
            title = EXCLUDED.title, description = EXCLUDED.description,
            start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
            meet_link = EXCLUDED.meet_link, updated_at = NOW()
    `, [userId, evt.id, input.title, input.description || null, input.startAt, input.endAt, input.clientId || null, meetLink]);
    return { eventId: evt.id, meetLink, htmlLink: evt.htmlLink };
}

export async function listCalendarEvents(userId: string, fromISO: string, toISO: string) {
    const local = await query<any>(`SELECT * FROM calendar_events WHERE user_id = $1 AND start_at >= $2::timestamptz AND start_at <= $3::timestamptz ORDER BY start_at`, [userId, fromISO, toISO]);
    if (local.length > 0) return local;
    try {
        const accessToken = await getAccessToken(userId);
        const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
        url.searchParams.set('timeMin', fromISO); url.searchParams.set('timeMax', toISO);
        url.searchParams.set('singleEvents', 'true'); url.searchParams.set('orderBy', 'startTime');
        const resp = await axios.get(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 20000 });
        return (resp.data.items || []).map((evt: any) => ({
            google_event_id: evt.id, title: evt.summary, description: evt.description,
            start_at: evt.start?.dateTime || evt.start?.date, end_at: evt.end?.dateTime || evt.end?.date,
            meet_link: evt.hangoutLink, html_link: evt.htmlLink,
        }));
    } catch { return []; }
}

function formatBR(iso: string): string { const [y, m, d] = String(iso).split('T')[0].split('-'); return `${d}-${m}-${y}`; }
