// ==============================
// TrafficAI — Client Onboarding Controller
// Checklist de setup inicial pós-contrato. Template de 48 items em 6 fases.
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { ValidationError } from '../shared/errors';
import { DEFAULT_ONBOARDING_TEMPLATE } from './onboarding.template';

const router = Router();
router.use(authMiddleware);

// ─── Endpoints ────────────────────────────────────────────────────────────────

/** GET /onboarding — todos os onboardings do user (resumo geral) */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await query<any>(
            `SELECT o.id, o.ad_account_id, o.status, o.items, o.threshold_percent,
                    o.started_at, o.completed_at,
                    a.account_name, a.meta_account_id
             FROM client_onboardings o
             JOIN ad_accounts a ON a.id = o.ad_account_id
             WHERE o.user_id = $1
             ORDER BY o.started_at DESC`,
            [req.user!.userId]
        );
        // Adiciona progress calculado
        const enriched = rows.map(r => {
            const items = Array.isArray(r.items) ? r.items : [];
            const total = items.length;
            const done = items.filter((it: any) => it.done).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return { ...r, total, done, progress_pct: pct };
        });
        res.json({ success: true, data: enriched });
    } catch (err) { next(err); }
});

/** GET /onboarding/account/:accountId — onboarding de 1 cliente */
router.get('/account/:accountId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await query<any>(
            `SELECT o.*, a.account_name, a.meta_account_id
             FROM client_onboardings o
             JOIN ad_accounts a ON a.id = o.ad_account_id
             WHERE o.user_id = $1 AND o.ad_account_id = $2`,
            [req.user!.userId, req.params.accountId]
        );
        res.json({ success: true, data: rows[0] || null });
    } catch (err) { next(err); }
});

/** POST /onboarding/account/:accountId/start — cria onboarding com template do usuário ou default */
router.post('/account/:accountId/start', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Verifica se ad_account pertence ao user
        const acc = await query<any>(
            `SELECT id, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2`,
            [req.params.accountId, req.user!.userId]
        );
        if (!acc[0]) throw new ValidationError('Conta não encontrada');

        // Se já existe, retorna
        const existing = await query<any>(
            `SELECT * FROM client_onboardings WHERE ad_account_id = $1`,
            [req.params.accountId]
        );
        if (existing[0]) {
            return res.json({ success: true, data: existing[0], already_exists: true });
        }

        // Carrega template do usuário (custom se existir, senão default)
        const template = await loadUserTemplate(req.user!.userId);

        // Clona template (adiciona id + done=false pra cada item)
        const items = template.map((it: any, idx: number) => ({
            id: `item-${idx + 1}`,
            phase: it.phase,
            title: it.title,
            description: it.description || '',
            owner: it.owner,
            done: false,
            done_at: null,
            done_by: null,
            notes: '',
            order: idx,
        }));

        const rows = await query<any>(
            `INSERT INTO client_onboardings (user_id, ad_account_id, items, status)
             VALUES ($1, $2, $3, 'in_progress')
             RETURNING *`,
            [req.user!.userId, req.params.accountId, JSON.stringify(items)]
        );
        res.status(201).json({ success: true, data: rows[0] });
    } catch (err) { next(err); }
});

/**
 * Carrega o template do usuário: se ele tem custom salvo, retorna esse.
 * Senão, retorna o default embarcado.
 */
async function loadUserTemplate(userId: string) {
    const rows = await query<any>(
        `SELECT items FROM user_onboarding_templates WHERE user_id = $1`,
        [userId]
    );
    if (rows[0] && Array.isArray(rows[0].items) && rows[0].items.length > 0) {
        return rows[0].items;
    }
    return DEFAULT_ONBOARDING_TEMPLATE;
}

/** GET /onboarding/template — retorna template do usuário (custom ou default) */
router.get('/template', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await query<any>(
            `SELECT items, updated_at FROM user_onboarding_templates WHERE user_id = $1`,
            [req.user!.userId]
        );
        const isCustom = !!rows[0] && Array.isArray(rows[0].items) && rows[0].items.length > 0;
        const items = isCustom ? rows[0].items : DEFAULT_ONBOARDING_TEMPLATE;
        res.json({
            success: true,
            data: {
                items,
                is_custom: isCustom,
                updated_at: rows[0]?.updated_at || null,
            }
        });
    } catch (err) { next(err); }
});

/** PUT /onboarding/template — salva/atualiza template do usuário */
router.put('/template', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const items = req.body?.items;
        if (!Array.isArray(items)) throw new ValidationError('items deve ser array');
        // Valida cada item
        const valid = items.map((it: any) => ({
            phase: it.phase || 'custom',
            title: String(it.title || '').trim(),
            description: it.description || '',
            owner: it.owner === 'client' ? 'client' : 'agency',
        })).filter(it => it.title);

        await query(
            `INSERT INTO user_onboarding_templates (user_id, items, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (user_id) DO UPDATE
             SET items = EXCLUDED.items, updated_at = now()`,
            [req.user!.userId, JSON.stringify(valid)]
        );
        res.json({ success: true, count: valid.length });
    } catch (err) { next(err); }
});

/** POST /onboarding/template/reset — reseta pro default embarcado */
router.post('/template/reset', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await query(`DELETE FROM user_onboarding_templates WHERE user_id = $1`, [req.user!.userId]);
        res.json({ success: true, data: { items: DEFAULT_ONBOARDING_TEMPLATE, is_custom: false } });
    } catch (err) { next(err); }
});

/** GET /onboarding/summary — visão agregada: contagem total + progresso por cliente
 *  Usado pra: badge na tabela /clientes + contador na sidebar. */
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Todos os onboardings do user + ad_account + clientes vinculados
        const rows = await query<any>(
            `SELECT
                o.id, o.status, o.items, o.ad_account_id,
                caa.client_id
             FROM client_onboardings o
             LEFT JOIN client_ad_accounts caa ON caa.ad_account_id = o.ad_account_id
             WHERE o.user_id = $1`,
            [req.user!.userId]
        );

        // Agrega por client_id (se cliente tiver N ad_accounts com onboarding, pega o melhor progresso)
        const byClient: Record<string, { pct: number; done: number; total: number; status: string; onboarding_id: string }> = {};
        let activeCount = 0;

        for (const r of rows) {
            const items = Array.isArray(r.items) ? r.items : [];
            const total = items.length;
            const done = items.filter((it: any) => it.done).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            if (r.status === 'in_progress') activeCount++;

            if (r.client_id) {
                // Se cliente tem múltiplas ad_accounts com onboarding, prioriza in_progress > paused > completed
                const existing = byClient[r.client_id];
                const shouldReplace =
                    !existing ||
                    (r.status === 'in_progress' && existing.status !== 'in_progress') ||
                    (r.status === existing.status && pct > existing.pct);
                if (shouldReplace) {
                    byClient[r.client_id] = { pct, done, total, status: r.status, onboarding_id: r.id };
                }
            }
        }

        res.json({
            success: true,
            data: {
                active_count: activeCount,
                total_count: rows.length,
                by_client: byClient,
            },
        });
    } catch (err) { next(err); }
});

/** GET /onboarding/client/:clientId — traz ad_accounts vinculadas ao cliente + onboardings */
router.get('/client/:clientId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Busca ad_accounts vinculadas ao cliente
        const accounts = await query<any>(
            `SELECT a.id, a.account_name, a.meta_account_id
             FROM client_ad_accounts caa
             JOIN ad_accounts a ON a.id = caa.ad_account_id
             WHERE caa.client_id = $1 AND a.user_id = $2`,
            [req.params.clientId, req.user!.userId]
        );

        // Pra cada ad_account, busca onboarding se existir
        const result: any[] = [];
        for (const acc of accounts) {
            const ob = await query<any>(
                `SELECT id, status, items, threshold_percent, started_at, completed_at
                 FROM client_onboardings WHERE ad_account_id = $1`,
                [acc.id]
            );
            let progress = null;
            if (ob[0]) {
                const items = Array.isArray(ob[0].items) ? ob[0].items : [];
                const total = items.length;
                const done = items.filter((it: any) => it.done).length;
                progress = {
                    onboarding_id: ob[0].id,
                    status: ob[0].status,
                    total, done,
                    pct: total > 0 ? Math.round((done / total) * 100) : 0,
                    started_at: ob[0].started_at,
                    completed_at: ob[0].completed_at,
                };
            }
            result.push({ ad_account: acc, onboarding: progress });
        }

        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

/** PATCH /onboarding/:id/item/:itemId — marca item como feito/desfeito */
router.patch('/:id/item/:itemId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { done, notes } = req.body || {};
        const rows = await query<any>(
            `SELECT items, ad_account_id, status FROM client_onboardings WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });

        const items = rows[0].items || [];
        const updated = items.map((it: any) => {
            if (it.id === req.params.itemId) {
                return {
                    ...it,
                    done: done !== undefined ? done : it.done,
                    done_at: done ? new Date().toISOString() : null,
                    done_by: done ? req.user!.userId : null,
                    notes: notes !== undefined ? notes : it.notes,
                };
            }
            return it;
        });

        // Recalcula progress e status
        const total = updated.length;
        const doneCount = updated.filter((it: any) => it.done).length;
        const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
        const thresholdRows = await query<any>(
            `SELECT threshold_percent FROM client_onboardings WHERE id = $1`,
            [req.params.id]
        );
        const threshold = thresholdRows[0]?.threshold_percent || 100;
        const shouldComplete = pct >= threshold;
        const wasCompleted = rows[0].status === 'completed';

        const updateRows = await query<any>(
            `UPDATE client_onboardings
             SET items = $1, status = CASE WHEN $2::boolean THEN 'completed' ELSE 'in_progress' END
             WHERE id = $3 AND user_id = $4 RETURNING *`,
            [JSON.stringify(updated), shouldComplete, req.params.id, req.user!.userId]
        );

        // Auto-cria rotinas padrão do cliente ao concluir (só na primeira vez)
        let routinesCreated: string[] = [];
        if (shouldComplete && !wasCompleted) {
            routinesCreated = await autoCreateClientRoutines(
                req.user!.userId,
                rows[0].ad_account_id
            );
        }

        res.json({
            success: true,
            data: updateRows[0],
            just_completed: shouldComplete && !wasCompleted,
            routines_created: routinesCreated,
        });
    } catch (err) { next(err); }
});

/**
 * Ao concluir onboarding, cria automaticamente 3 rotinas semanais pro cliente:
 *   - Reunião semanal de acompanhamento (quinta 10h)
 *   - Envio de relatório semanal (sexta 15h)
 *   - Revisar campanhas do cliente (segunda 9h)
 *
 * Só cria se ainda NÃO existir rotina desse tipo pra esse cliente (idempotente).
 */
async function autoCreateClientRoutines(userId: string, adAccountId: string): Promise<string[]> {
    const templates = [
        { kind: 'meeting',          title: 'Reunião semanal de acompanhamento', days: [4], time: '10:00' },  // Quinta
        { kind: 'report_send',      title: 'Envio de relatório semanal',        days: [5], time: '15:00' },  // Sexta
        { kind: 'checklist_camp',   title: 'Revisar campanhas do cliente',      days: [1], time: '09:00' },  // Segunda
    ];
    const created: string[] = [];
    for (const t of templates) {
        // Idempotência: só cria se não existir com mesmo kind + mesmo cliente
        const existing = await query(
            `SELECT id FROM routines WHERE user_id = $1 AND ad_account_id = $2 AND kind = $3 LIMIT 1`,
            [userId, adAccountId, t.kind]
        );
        if (existing.length > 0) continue;
        await query(
            `INSERT INTO routines (user_id, ad_account_id, kind, title, frequency, days_of_week, time_of_day, is_active)
             VALUES ($1, $2, $3, $4, 'weekly', $5, $6, TRUE)`,
            [userId, adAccountId, t.kind, t.title, t.days, t.time]
        );
        created.push(t.title);
    }
    return created;
}

/** POST /onboarding/:id/item — adiciona item customizado */
router.post('/:id/item', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phase, title, description, owner } = req.body || {};
        if (!title) throw new ValidationError('title obrigatório');
        const rows = await query<any>(
            `SELECT items FROM client_onboardings WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const items = rows[0].items || [];
        const newItem = {
            id: `item-custom-${Date.now()}`,
            phase: phase || 'custom',
            title,
            description: description || '',
            owner: owner || 'agency',
            done: false,
            done_at: null,
            done_by: null,
            notes: '',
            order: items.length,
        };
        items.push(newItem);
        await query(
            `UPDATE client_onboardings SET items = $1 WHERE id = $2`,
            [JSON.stringify(items), req.params.id]
        );
        res.status(201).json({ success: true, data: newItem });
    } catch (err) { next(err); }
});

/** DELETE /onboarding/:id/item/:itemId — remove item */
router.delete('/:id/item/:itemId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await query<any>(
            `SELECT items FROM client_onboardings WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Não encontrado' } });
        const items = (rows[0].items || []).filter((it: any) => it.id !== req.params.itemId);
        await query(
            `UPDATE client_onboardings SET items = $1 WHERE id = $2`,
            [JSON.stringify(items), req.params.id]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

/** DELETE /onboarding/:id — apaga o onboarding inteiro (útil pra recomeçar) */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await query(
            `DELETE FROM client_onboardings WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

/** POST /onboarding/:id/pause — pausa (útil quando cliente atrasa) */
router.post('/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await query(
            `UPDATE client_onboardings SET status = 'paused' WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

/** POST /onboarding/:id/resume */
router.post('/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await query(
            `UPDATE client_onboardings SET status = 'in_progress' WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user!.userId]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

export const onboardingController = router;
