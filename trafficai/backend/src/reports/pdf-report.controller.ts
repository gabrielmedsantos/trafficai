// ==============================
// PDF Report Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { query } from '../database/connection';
import { ValidationError } from '../shared/errors';
import { buildReportForAccount, renderReportHTML, saveReportSnapshot } from './pdf-report.service';
import { metaService } from '../meta/meta.service';
import { authRepository } from '../auth/auth.repository';
import { logger } from '../shared/logger';

const router = Router();
const mediaCache = new Map<string, { url: string; expiresAt: number }>();

async function getSnapshotCreative(token: string, adId: string) {
    const rows = await query<any>(
        `SELECT s.html, s.user_id, s.account_id, a.meta_account_id
         FROM report_pdf_snapshots s
         JOIN ad_accounts a ON a.id = s.account_id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [token]
    );
    if (!rows.length) return null;
    const { html, user_id, account_id, meta_account_id } = rows[0];
    const escapedId = adId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`data-ad-id="${escapedId}"`).test(html || '')) return null;
    const user = await authRepository.findById(user_id);
    if (!user?.access_token || !meta_account_id) return null;
    return { user_id, account_id, meta_account_id, access_token: user.access_token };
}

// PÚBLICO — visualização (cliente abre link do WhatsApp)
router.get('/pdf/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Este HTML tem CSS/JS inline e carrega mídia pela CDN da Meta. O CSP padrão do
        // Helmet bloqueia script-src inline e img-src externo, deixando cards pretos e
        // o botão de visualização sem ação. A exceção fica restrita a este relatório.
        res.setHeader('Content-Security-Policy', [
            "default-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
            "frame-src https://instagram.com https://www.instagram.com https://facebook.com https://www.facebook.com",
            "script-src 'unsafe-inline'",
            "style-src 'unsafe-inline' https:",
            "img-src 'self' data: https: blob:",
            "media-src 'self' https: blob:",
            "connect-src 'self'",
            "font-src 'self' data: https:",
        ].join('; '));

        const r = await query<any>(
            `SELECT html, expires_at, user_id, account_id, period_start::text, period_end::text
             FROM report_pdf_snapshots WHERE token = $1`,
            [req.params.token]
        );
        if (!r.length) {
            return res.status(404).type('html').send(`<h1 style="font-family:sans-serif;padding:40px">Relatório não encontrado</h1><p style="font-family:sans-serif;padding:0 40px">Este link expirou ou foi removido.</p>`);
        }
        if (new Date(r[0].expires_at) < new Date()) {
            return res.status(410).type('html').send(`<h1 style="font-family:sans-serif;padding:40px">Relatório expirado</h1><p style="font-family:sans-serif;padding:0 40px">Este link tem validade de 90 dias. Peça pra gerar um novo.</p>`);
        }
        let html = r[0].html;
        // Links antigos guardam HTML sem IDs de anúncio, então não conseguem atualizar
        // miniaturas nem abrir vídeos. Regenera uma vez ao primeiro acesso e grava no
        // mesmo token; os próximos acessos já recebem o snapshot corrigido.
        if (html?.includes('Ranking de Criativos') && (!html.includes('data-ad-id=') || !html.includes('data-media-player-v2='))) {
            try {
                const data = await buildReportForAccount(r[0].user_id, r[0].account_id, r[0].period_start, r[0].period_end);
                html = renderReportHTML(data, req.params.token);
                await query(`UPDATE report_pdf_snapshots SET html = $2 WHERE token = $1`, [req.params.token, html]);
            } catch (repairError: any) {
                logger.warn('Não foi possível atualizar snapshot antigo de criativos', { error: repairError.message });
            }
        }

        // Contabiliza view
        await query(
            `UPDATE report_pdf_snapshots SET view_count = view_count + 1, last_viewed_at = NOW() WHERE token = $1`,
            [req.params.token]
        ).catch(() => {/* noop */});
        res.type('html').send(html);
    } catch (err) { next(err); }
});

// Mídia sob demanda para os cards dentro do snapshot público.
router.get('/pdf/:token/ad-thumbnail/:adId', async (req: Request, res: Response) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    try {
        const { token, adId } = req.params;
        const ctx = await getSnapshotCreative(token, adId);
        if (!ctx) return res.status(404).end();
        const key = `${ctx.account_id}:${adId}`;
        const cached = mediaCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return res.redirect(302, cached.url);
        const thumbnails = await metaService.getAdThumbnails(ctx.user_id, ctx.access_token, ctx.meta_account_id, [adId]);
        const url = thumbnails.get(adId);
        if (!url) return res.status(404).end();
        mediaCache.set(key, { url, expiresAt: Date.now() + 30 * 60 * 1000 });
        return res.redirect(302, url);
    } catch (err: any) {
        return res.status(500).end();
    }
});

router.get('/pdf/:token/ad-video/:adId', async (req: Request, res: Response) => {
    try {
        const { token, adId } = req.params;
        const ctx = await getSnapshotCreative(token, adId);
        if (!ctx) return res.status(404).json({ success: false });
        const info = await metaService.getAdVideoInfo(ctx.user_id, ctx.access_token, ctx.meta_account_id, [adId]);
        const media = info.get(adId);
        const videoId = media?.video_id;
        const isVideo = !!videoId || media?.object_type === 'VIDEO';
        const watchUrl = media?.permalink_url;
        if (!isVideo) return res.json({ success: true, data: { is_video: false, watch_url: watchUrl } });
        const url = videoId ? await metaService.getVideoSourceUrl(ctx.user_id, ctx.access_token, videoId) : undefined;
        return res.json({ success: true, data: { is_video: true, video_id: videoId, url, watch_url: watchUrl } });
    } catch (err: any) {
        return res.status(500).json({ success: false });
    }
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
        const snapshot = await saveReportSnapshot(req.user!.userId, account_id, token => renderReportHTML(data, token), {
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
