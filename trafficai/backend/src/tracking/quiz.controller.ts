import { quizRecoveryCandidates } from './quiz-recovery';
import { quizSourceScope } from './quiz-sharing';
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { query, queryOne, transaction } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { sharedAccountReadAccess } from '../team/account-read-access';
import { encrypt, decrypt } from '../shared/encryption';
import { UUID, normalizeAttribution, normalizeFunnel, validateEvent } from './quiz.validation';
import { quizSdk } from './quiz-sdk';
import { linkQuizOrders } from './quiz-orders.service';
import { quizEngagementCte } from './quiz-engagement';
import { matchingQuizSessions, quizContact } from './quiz-contact-search';

const hash = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(err => {
        if (err instanceof HttpError) res.status(err.status).json({ success: false, error: { message: err.message } });
        else next(err);
    });
};
function validate<T>(fn: () => T): T { try { return fn(); } catch { throw new HttpError(400, 'Dados inválidos'); } }
async function owned(req: Request) {
    if (!UUID.test(req.params.sourceId)) throw new HttpError(400, 'Fonte inválida');
    const source = await queryOne<any>('SELECT id, public_token FROM tracking_sources WHERE id=$1 AND user_id=$2', [req.params.sourceId, (req as any).user.userId]);
    if (!source) throw new HttpError(404, 'Fonte não encontrada');
    return source;
}
async function publicFunnel(req: Request) {
    const f = await queryOne<any>(`SELECT f.* FROM tracking_quiz_funnels f JOIN tracking_sources s ON s.id=f.source_id WHERE s.public_token=$1 AND s.is_active=true AND f.slug=$2`, [req.params.token, req.params.slug]);
    // Origem conferida no servidor além do CORS. Não permite prévia file:// em produção.
    if (!f || req.get('origin') !== f.origin) throw new HttpError(403, 'Origem ou funil não autorizado');
    return f;
}
// Foto opcional da criança, enviada pelo responsável no quiz com autorização expressa. Fica em disco
// no servidor (fora do banco), só o dono da fonte consegue ver, e é apagada depois de 90 dias.
const photoRoot = () => path.resolve(process.env.DELIVERY_STORAGE_ROOT || '/data/deliveries', 'photos');
const photoFile = (sessionId: string) => path.join(photoRoot(), `${sessionId.toLowerCase()}.jpg`);
const hasPhoto = (sessionId: string) => fs.access(photoFile(sessionId)).then(() => true, () => false);
async function sweepOldPhotos() {
    const limit = Date.now() - 90 * 86400000;
    for (const name of await fs.readdir(photoRoot()).catch(() => [] as string[])) {
        const file = path.join(photoRoot(), name);
        const stat = await fs.stat(file).catch(() => null);
        if (stat && stat.mtimeMs < limit) await fs.rm(file, { force: true }).catch(() => {});
    }
}
async function quizSession(req: Request) {
    const f = await publicFunnel(req);
    const key = req.get('X-Quiz-Key');
    if (!UUID.test(req.params.sessionId) || !key || !/^[a-f0-9]{64}$/.test(key)) throw new HttpError(403, 'Sessão não autorizada');
    const found = await queryOne<any>('SELECT id FROM tracking_quiz_sessions WHERE id=$1 AND funnel_id=$2 AND write_key_hash=$3', [req.params.sessionId, f.id, hash(key)]);
    if (!found) throw new HttpError(403, 'Sessão não autorizada');
    return found.id as string;
}
const pub = Router();
pub.get('/sdk.js', (_req, res) => { res.type('application/javascript').set('Cache-Control','public, max-age=300').send(quizSdk); });
pub.post('/:token/:slug/sessions', wrap(async (req, res) => {
    const f = await publicFunnel(req);
    const { id, writeKey } = req.body || {};
    if (!UUID.test(id || '') || typeof writeKey !== 'string' || !/^[a-f0-9]{64}$/.test(writeKey)) throw new HttpError(400, 'Sessão inválida');
    const attribution = normalizeAttribution(req.body.attribution);
    const trackingId = typeof req.body.trackingSessionId === 'string' ? req.body.trackingSessionId.slice(0, 100) : null;
    await query(`INSERT INTO tracking_quiz_sessions(id,funnel_id,write_key_hash,tracking_session_id,attribution,answers_encrypted)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`, [id, f.id, hash(writeKey), trackingId, JSON.stringify(attribution), encrypt('{}')]);
    const found = await queryOne<any>('SELECT id FROM tracking_quiz_sessions WHERE id=$1 AND funnel_id=$2 AND write_key_hash=$3', [id, f.id, hash(writeKey)]);
    if (!found) throw new HttpError(409, 'Sessão já existe');
    res.status(201).json({ success: true, data: { id } });
}));
pub.post('/:token/:slug/sessions/:sessionId/events', wrap(async (req, res) => {
    const f = await publicFunnel(req);
    const key = req.get('X-Quiz-Key');
    if (!UUID.test(req.params.sessionId) || !key || !/^[a-f0-9]{64}$/.test(key)) throw new HttpError(403, 'Sessão não autorizada');
    const event = validate(() => validateEvent(req.body, f.steps, f.answer_keys));
    const milestoneStep = f.slug === 'mamae-quero-historinha' && event.step === 'redirect' ? f.checkout_step : event.step;
    await transaction(async tx => {
        const rows = await tx(`SELECT id FROM tracking_quiz_sessions WHERE id=$1 AND funnel_id=$2 AND write_key_hash=$3 FOR UPDATE`, [req.params.sessionId, f.id, hash(key)]);
        if (!rows.length) throw new HttpError(403, 'Sessão não autorizada');
        const inserted = await tx(`INSERT INTO tracking_quiz_events(session_id,event_id,step,kind) VALUES($1,$2,$3,$4)
            ON CONFLICT(session_id,event_id) DO NOTHING RETURNING id`, [req.params.sessionId, event.eventId, event.step, event.kind]);
        if (!inserted.length) return;
        await tx(`UPDATE tracking_quiz_sessions SET answers_encrypted=$2,revision=$3,current_step=$4::varchar,updated_at=NOW(),
            completed_at=CASE WHEN $4::varchar=$6::varchar AND $5::text='view' THEN COALESCE(completed_at,NOW()) ELSE completed_at END,
            checkout_at=CASE WHEN $4::varchar=$7::varchar AND $5::text='view' THEN COALESCE(checkout_at,NOW()) ELSE checkout_at END
            WHERE id=$1 AND revision<$3`, [req.params.sessionId, encrypt(JSON.stringify(event.answers)), event.revision, milestoneStep, event.kind, f.completed_step, f.checkout_step]);
    });
    if(event.kind==='view' && milestoneStep===f.checkout_step) await linkQuizOrders(f.source_id);
    res.json({ success: true, data: { accepted: true } });
}));

pub.post('/:token/:slug/sessions/:sessionId/photo', wrap(async (req, res) => {
    const id = await quizSession(req);
    if (req.body?.consent !== true) throw new HttpError(400, 'Autorização obrigatória');
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image || ''));
    const bytes = match ? Buffer.from(match[1], 'base64') : null;
    if (!bytes || bytes.length < 2000 || bytes.length > 2500000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new HttpError(400, 'Imagem inválida');
    await fs.mkdir(photoRoot(), { recursive: true });
    await fs.writeFile(photoFile(id), bytes, { mode: 0o600 });
    void sweepOldPhotos();
    res.json({ success: true, data: { saved: true } });
}));
pub.delete('/:token/:slug/sessions/:sessionId/photo', wrap(async (req, res) => {
    const id = await quizSession(req);
    await fs.rm(photoFile(id), { force: true });
    res.json({ success: true, data: { removed: true } });
}));

const admin = Router();
admin.use(authMiddleware);
admin.use(sharedAccountReadAccess('quiz'));
admin.get('/sources/:sourceId/funnels', wrap(async (req, res) => {
    const source = await owned(req);
    const funnels = await query(`SELECT f.*,s.public_token AS public_token,(f.source_id<>$1::uuid) AS shared FROM tracking_quiz_funnels f JOIN tracking_sources s ON s.id=f.source_id WHERE ${quizSourceScope()} ORDER BY f.created_at DESC`, [source.id]);
    res.json({ success: true, data: { funnels, publicToken: source.public_token } });
}));
admin.post('/sources/:sourceId/funnels', wrap(async (req, res) => {
    const source = await owned(req);
    const f = validate(() => normalizeFunnel(req.body));
    const shared=await queryOne(`SELECT f.id FROM tracking_quiz_funnels f WHERE ${quizSourceScope()} AND f.source_id<>$1::uuid AND f.slug=$2`,[source.id,f.slug]);
    if(shared)throw new HttpError(409,'Este funil é compartilhado. Configure-o na fonte de origem, sem duplicar a jornada.');
    const previous = await queryOne<any>('SELECT id,steps,answer_keys,completed_step,checkout_step FROM tracking_quiz_funnels WHERE source_id=$1 AND slug=$2',[source.id,f.slug]);
    if(previous) {
        const sessions = await queryOne<any>('SELECT COUNT(*)::int AS n FROM tracking_quiz_sessions WHERE funnel_id=$1',[previous.id]);
        if(sessions.n && (JSON.stringify(previous.steps)!==JSON.stringify(f.steps) || JSON.stringify(previous.answer_keys)!==JSON.stringify(f.answerKeys)
            || previous.completed_step!==f.completedStep || previous.checkout_step!==f.checkoutStep)) throw new HttpError(409,'Este funil já tem respostas. Crie uma nova versão com outro identificador para mudar etapas ou campos.');
    }
    const result = await queryOne(`INSERT INTO tracking_quiz_funnels(source_id,slug,name,origin,steps,answer_keys,completed_step,checkout_step) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(source_id,slug) DO UPDATE SET name=EXCLUDED.name,origin=EXCLUDED.origin,steps=EXCLUDED.steps,answer_keys=EXCLUDED.answer_keys,completed_step=EXCLUDED.completed_step,checkout_step=EXCLUDED.checkout_step RETURNING *`, [source.id, f.slug, f.name, f.origin, JSON.stringify(f.steps),JSON.stringify(f.answerKeys),f.completedStep,f.checkoutStep]);
    res.json({ success: true, data: result });
}));
admin.get('/sources/:sourceId/report', wrap(async (req, res) => {
    const source = await owned(req);
    const { since, until } = req.query;
    const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
    if (!date(since) || !date(until) || String(since)>String(until)) throw new HttpError(400, 'Período inválido');
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    if (!Number.isInteger(page)) throw new HttpError(400, 'Página inválida');
    const campaign = typeof req.query.campaign === 'string' ? req.query.campaign.slice(0,300) : '';
    const funnel = typeof req.query.funnel === 'string' ? req.query.funnel : '';
    if(funnel && !UUID.test(funnel)) throw new HttpError(400,'Funil inválido');
    const params = [source.id, since, until, campaign, funnel];
    const payment = req.query.payment || '';
    if (payment !== '' && payment !== 'approved') throw new HttpError(400, 'Filtro de pagamento inválido');
    const interest = req.query.interest || '';
    if (!['','hot','warm','cold','paid','closed'].includes(String(interest))) throw new HttpError(400, 'Filtro de interesse inválido');
    const sort = req.query.sort || 'priority';
    if (!['priority','recent'].includes(String(sort))) throw new HttpError(400, 'Ordenação inválida');
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0,120) : '';
    const searchIds = search ? await matchingQuizSessions(source.id,String(since),String(until),search) : [];
    const sessionFilter = (payment === 'approved' ? " AND payment_status='approved'" : '') + (interest ? ` AND interest='${interest}'` : '') + (search ? ' AND id=ANY($6::uuid[])' : '');
    const filterParams = search ? [...params,searchIds] : params;
    const scope = `${quizSourceScope()} AND s.created_at>=($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND s.created_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND ($4='' OR s.attribution->>'utm_campaign'=$4) AND ($5='' OR f.id::text=$5)`;
    const leadCte = quizEngagementCte(scope);
    const [summary, sessions, stages, engagement] = await Promise.all([
        queryOne(`SELECT COUNT(*)::int AS total,COUNT(s.completed_at)::int AS completed,COUNT(s.checkout_at)::int AS checkouts,
            COUNT(*) FILTER(WHERE o.status='approved')::int AS paid FROM tracking_quiz_sessions s JOIN tracking_quiz_funnels f ON f.id=s.funnel_id
            LEFT JOIN tracking_orders o ON o.id=s.order_id WHERE ${scope}`, params),
        query(`${leadCte} SELECT id,current_step,created_at,updated_at,completed_at,checkout_at,attribution,order_id,payment_status,name,progress_percent,interest,answers_encrypted,customer_name,customer_email,customer_phone
            FROM leads WHERE TRUE${sessionFilter} ORDER BY ${sort==='priority'?"CASE interest WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 WHEN 'cold' THEN 2 ELSE 3 END,progress_percent DESC,":''} updated_at DESC,id LIMIT 30 OFFSET $${filterParams.length+1}`, [...filterParams, (page-1)*30]),
        query(`SELECT CASE WHEN f.slug='mamae-quero-historinha' AND e.step='redirect' THEN f.checkout_step ELSE e.step END AS step, COUNT(DISTINCT s.id) FILTER(WHERE e.kind='view')::int AS viewed,
            COUNT(DISTINCT s.id) FILTER(WHERE e.kind='complete')::int AS completed FROM tracking_quiz_events e
            JOIN tracking_quiz_sessions s ON s.id=e.session_id JOIN tracking_quiz_funnels f ON f.id=s.funnel_id
            WHERE ${scope} GROUP BY CASE WHEN f.slug='mamae-quero-historinha' AND e.step='redirect' THEN f.checkout_step ELSE e.step END`, params),
        queryOne(`${leadCte} SELECT COUNT(*) FILTER(WHERE interest='hot')::int AS hot,
            COUNT(*) FILTER(WHERE interest='warm')::int AS warm,COUNT(*) FILTER(WHERE interest='cold')::int AS cold,
            COUNT(*) FILTER(WHERE interest='paid')::int AS paid,COUNT(*) FILTER(WHERE interest='closed')::int AS closed,
            COUNT(*) FILTER(WHERE TRUE${sessionFilter})::int AS matched FROM leads`,filterParams),
    ]);
    // Oferta das 4 histórias (pop-up antes do checkout): eventos Combo4* do pixel,
    // ligados à sessão do quiz pela sessão de navegação.
    const comboJoin = `JOIN tracking_events e ON e.source_id=f.source_id AND e.session_id=s.tracking_session_id
        AND e.event_name IN ('Combo4View','Combo4Accept','Combo4Refuse') AND e.created_at>=s.created_at`;
    const comboRank = `MAX(CASE e.event_name WHEN 'Combo4Accept' THEN 3 WHEN 'Combo4Refuse' THEN 2 ELSE 1 END)::int`;
    const sessionIds = sessions.map((s:any)=>s.id);
    const [comboRows, combo4] = await Promise.all([
        sessionIds.length ? query(`SELECT s.id, ${comboRank} AS c FROM tracking_quiz_sessions s JOIN tracking_quiz_funnels f ON f.id=s.funnel_id ${comboJoin}
            WHERE ${quizSourceScope()} AND s.id=ANY($2::uuid[]) GROUP BY s.id`, [source.id, sessionIds]) : Promise.resolve([]),
        queryOne(`SELECT COUNT(*)::int AS viewed, COUNT(*) FILTER(WHERE c=3)::int AS accepted, COUNT(*) FILTER(WHERE c=2)::int AS refused
            FROM (SELECT s.id, ${comboRank} AS c FROM tracking_quiz_sessions s JOIN tracking_quiz_funnels f ON f.id=s.funnel_id ${comboJoin} WHERE ${scope} GROUP BY s.id) x`, params),
    ]);
    const comboBySession = new Map((comboRows as any[]).map(r=>[r.id, r.c===3?'accepted':r.c===2?'refused':'viewed']));
    res.setHeader('Cache-Control','no-store');
    res.json({ success: true, data: { summary, combo4, sessions: sessions.map((s:any)=>{const {answers_encrypted,...safe}=s;return {...safe,combo4:comboBySession.get(s.id)||null,...quizContact(answers_encrypted,s)};}), stages, engagement, page } });
}));
admin.get('/sources/:sourceId/recovery', wrap(async (req,res)=>{
    const source=await owned(req);
    const {since,until}=req.query;
    const valid=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
    if(!valid(since)||!valid(until)||String(since)>String(until))throw new HttpError(400,'Período inválido');
    const rows=await quizRecoveryCandidates(source.id,(req as any).user.userId,String(since),String(until));
    res.setHeader('Cache-Control','no-store');res.json({success:true,data:rows});
}));
admin.get('/sources/:sourceId/sessions/:sessionId', wrap(async (req, res) => {
    const source = await owned(req);
    if (!UUID.test(req.params.sessionId)) throw new HttpError(400, 'Sessão inválida');
    const s = await queryOne<any>(`SELECT s.id,s.answers_encrypted,s.attribution,s.tracking_session_id,s.order_id,f.source_id AS canonical_source_id,f.slug AS funnel_slug,o.status AS payment_status
        FROM tracking_quiz_sessions s JOIN tracking_quiz_funnels f ON f.id=s.funnel_id LEFT JOIN tracking_orders o ON o.id=s.order_id
        WHERE s.id=$1 AND ${quizSourceScope('f','$2')}`, [req.params.sessionId, source.id]);
    if (!s) throw new HttpError(404, 'Sessão não encontrada');
    const events = await query('SELECT step,kind,created_at FROM tracking_quiz_events WHERE session_id=$1 ORDER BY id', [s.id]);
    const { answers_encrypted, ...detail } = s;
    res.setHeader('Cache-Control', 'no-store');
    const answers = JSON.parse(decrypt(answers_encrypted));
    // Oferta das 4 histórias: escolha registrada pelos eventos Combo4* da mesma sessão de navegação.
    const combo = s.tracking_session_id ? await queryOne<{ c: number | null }>(
        `SELECT MAX(CASE event_name WHEN 'Combo4Accept' THEN 3 WHEN 'Combo4Refuse' THEN 2 ELSE 1 END)::int AS c
           FROM tracking_events WHERE source_id=$1 AND session_id=$2 AND event_name IN ('Combo4View','Combo4Accept','Combo4Refuse')`,
        [s.canonical_source_id, s.tracking_session_id]) : null;
    const combo4 = combo?.c === 3 || answers?.extra === true ? 'accepted' : combo?.c === 2 ? 'refused' : combo?.c === 1 ? 'viewed' : null;
    res.json({ success: true, data: { ...detail, combo4, answers, events, has_photo: await hasPhoto(s.id) } });
}));
// Apenas pedidos reais da mesma fonte. O status é sempre lido de tracking_orders.
admin.put('/sources/:sourceId/sessions/:sessionId/order', wrap(async (req, res) => {
    const source = await owned(req);
    if (!UUID.test(req.params.sessionId) || !UUID.test(req.body?.orderId || '')) throw new HttpError(400, 'Pedido inválido');
    const updated = await queryOne(`UPDATE tracking_quiz_sessions s SET order_id=$3 FROM tracking_quiz_funnels f,tracking_orders o
        WHERE s.funnel_id=f.id AND ${quizSourceScope('f','$2')} AND s.id=$1 AND o.id=$3 AND o.source_id=f.source_id RETURNING s.id`, [req.params.sessionId, source.id, req.body.orderId]);
    if (!updated) throw new HttpError(404, 'Sessão ou pedido não encontrado');
    res.json({ success: true, data: updated });
}));
async function ownedSession(req: Request) {
    const source = await owned(req);
    if (!UUID.test(req.params.sessionId)) throw new HttpError(400, 'Sessão inválida');
    const s = await queryOne<any>(`SELECT s.id FROM tracking_quiz_sessions s JOIN tracking_quiz_funnels f ON f.id=s.funnel_id WHERE s.id=$1 AND ${quizSourceScope('f','$2')}`, [req.params.sessionId, source.id]);
    if (!s) throw new HttpError(404, 'Sessão não encontrada');
    return s.id as string;
}
admin.get('/sources/:sourceId/sessions/:sessionId/photo', wrap(async (req, res) => {
    const id = await ownedSession(req);
    const bytes = await fs.readFile(photoFile(id)).catch(() => null);
    if (!bytes) throw new HttpError(404, 'Esta sessão não tem foto.');
    res.setHeader('Cache-Control', 'no-store');
    res.type('image/jpeg').send(bytes);
}));
admin.delete('/sources/:sourceId/sessions/:sessionId/photo', wrap(async (req, res) => {
    const id = await ownedSession(req);
    await fs.rm(photoFile(id), { force: true });
    res.json({ success: true, data: { removed: true } });
}));
export const quizPublicController = pub;
export const quizController = admin;
