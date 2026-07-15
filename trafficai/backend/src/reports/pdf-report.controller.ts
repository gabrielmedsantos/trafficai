// ==============================
// PDF Report Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { query } from '../database/connection';
import { ValidationError } from '../shared/errors';
import { buildReportForAccount, renderReportHTML, saveReportSnapshot } from './pdf-report.service';

const router = Router();

// PÚBLICO — visualização (cliente abre link do WhatsApp)
router.get('/pdf/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const r = await query<any>(
            `SELECT html, expires_at FROM report_pdf_snapshots WHERE token = $1`,
            [req.params.token]
        );
        if (!r.length) {
            return res.status(404).type('html').send(`<h1 style="font-family:sans-serif;padding:40px">Relatório não encontrado</h1><p style="font-family:sans-serif;padding:0 40px">Este link expirou ou foi removido.</p>`);
        }
        if (new Date(r[0].expires_at) < new Date()) {
            return res.status(410).type('html').send(`<h1 style="font-family:sans-serif;padding:40px">Relatório expirado</h1><p style="font-family:sans-serif;padding:0 40px">Este link tem validade de 90 dias. Peça pra gerar um novo.</p>`);
        }
        // Contabiliza view
        await query(
            `UPDATE report_pdf_snapshots SET view_count = view_count + 1, last_viewed_at = NOW() WHERE token = $1`,
            [req.params.token]
        ).catch(() => {/* noop */});
        res.type('html').send(r[0].html);
    } catch (err) { next(err); }
});

// Rotas autenticadas
const authed = Router();
authed.use(authMiddleware);

// POST /reports/pdf/generate  { account_id, period_start, period_end }
authed.post('/pdf/generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { account_id, period_start, period_end } = req.body;
        if (!account_id || !period_start || !period_end) {
            throw new ValidationError('account_id, period_start, period_end obrigatórios');
        }
        const data = await buildReportForAccount(req.user!.userId, account_id, period_start, period_end);
        const html = renderReportHTML(data);
        const snapshot = await saveReportSnapshot(req.user!.userId, account_id, html, {
            periodStart: period_start,
            periodEnd: period_end,
            accountName: data.accountName,
        });
        res.json({
            success: true,
            data: {
                url: snapshot.url,
                token: snapshot.token,
                account_name: data.accountName,
                period: { start: period_start, end: period_end },
                totals: data.totals,
            },
        });
    } catch (err) { next(err); }
});

// GET /reports/pdf/list — histórico de PDFs gerados
authed.get('/pdf/list', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await query<any>(
            `SELECT token, account_id, account_name, period_start::text, period_end::text,
                    view_count, last_viewed_at, expires_at, created_at
             FROM report_pdf_snapshots
             WHERE user_id = $1 AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 50`,
            [req.user!.userId]
        );
        res.json({ success: true, data: rows });
    } catch (err) { next(err); }
});

// DELETE /reports/pdf/:token
authed.delete('/pdf/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await query(
            `DELETE FROM report_pdf_snapshots WHERE token = $1 AND user_id = $2`,
            [req.params.token, req.user!.userId]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

export const pdfReportPublicController = router;
export const pdfReportController = authed;
