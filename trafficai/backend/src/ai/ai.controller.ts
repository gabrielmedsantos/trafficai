// ==============================
// TrafficAI — AI Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware } from '../auth/auth.middleware';
import { aiService } from './ai.service';
import { aiRepository } from './ai.repository';
import { streamAgentChat, ChatMessage } from './agent.service';
import { ValidationError, AppError } from '../shared/errors';
import { consumeAiCredit } from './ai-credits.middleware';
import { query } from '../database/connection';
import { metaRepository } from '../meta/meta.repository';
import { metaService } from '../meta/meta.service';
import { authRepository } from '../auth/auth.repository';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

router.use(authMiddleware);

/**
 * POST /ai/analyze-campaign
 * Analyze campaign performance with AI
 */
// GET /ai/credits — saldo atual
router.get('/credits', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const r = await query<any>(
            `SELECT ai_credits AS balance, ai_credits_monthly_limit AS monthly_limit,
                    ai_credits_reset_at AS reset_at
             FROM users WHERE id = $1`,
            [req.user!.userId]
        );
        res.json({ success: true, data: r[0] });
    } catch (err) { next(err); }
});

router.post('/analyze-campaign', consumeAiCredit('analyze-campaign', 2), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { campaign_id } = req.body;
        if (!campaign_id) {
            throw new ValidationError('campaign_id is required');
        }
        const result = await aiService.analyzeCampaign(campaign_id);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /ai/analyze-creative
 * Analyze creative assets (image, video, text)
 */
router.post('/analyze-creative', consumeAiCredit('analyze-creative', 1), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { type, text_content, context } = req.body;

        let fileType: 'image' | 'video' | 'text';
        let content: string;

        if (type === 'text' || (!req.file && text_content)) {
            fileType = 'text';
            content = text_content || '';
            if (!content) {
                throw new ValidationError('text_content is required for text analysis');
            }
        } else if (req.file) {
            const mimeType = req.file.mimetype;
            if (mimeType.startsWith('image/')) {
                fileType = 'image';
            } else if (mimeType.startsWith('video/')) {
                fileType = 'video';
            } else {
                throw new ValidationError('Unsupported file type. Please upload an image, video, or text.');
            }
            content = req.file.buffer.toString('base64');
        } else {
            throw new ValidationError('Please provide a file or text_content');
        }

        const result = await aiService.analyzeCreative(userId, fileType, content, context);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /ai/top-creatives-analysis
 * Analisa os top criativos de uma conta (últimos N dias, ordenados por spend)
 * Body: { account_id: string, days?: number (default 30), limit?: number (default 10) }
 */
router.post('/top-creatives-analysis', consumeAiCredit('top-creatives', 3), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { account_id, days = 30, limit = 10 } = req.body;
        if (!account_id) throw new ValidationError('account_id é obrigatório');
        const result = await aiService.analyzeTopCreatives(userId, account_id, Number(days), Number(limit));
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /ai/analyses?campaign_id=xxx
 * Get stored AI analyses
 */
router.get('/analyses', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { campaign_id } = req.query;
        if (campaign_id) {
            const analyses = await aiRepository.getByCampaign(campaign_id as string);
            return res.json({ success: true, data: analyses });
        }
        const analyses = await aiRepository.getRecentByUser(req.user!.userId);
        res.json({ success: true, data: analyses });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /ai/chat
 * Conversational agent — streams SSE response
 * Body: { messages: [{ role: 'user'|'assistant', content: string }] }
 */
router.post('/chat', async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { messages } = req.body as { messages: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ success: false, error: { message: 'messages array required', code: 400 } });
        return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await streamAgentChat(userId, messages, res);
});

/**
 * POST /ai/agent/apply-suggestion — executa de verdade uma sugestão do Agente
 * (pausar/ativar/mudar orçamento) depois que o usuário clicou em "Aplicar".
 * Nunca chamado automaticamente pelo agente — só por ação explícita do usuário.
 */
router.post('/agent/apply-suggestion', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { campaign_id, action, value } = req.body as {
            campaign_id: string;
            action: 'pause' | 'activate' | 'set_budget';
            value?: number;
        };

        if (!campaign_id || !['pause', 'activate', 'set_budget'].includes(action)) {
            throw new ValidationError('campaign_id e action (pause|activate|set_budget) são obrigatórios');
        }

        const campaign = await metaRepository.getCampaignById(campaign_id);
        if (!campaign) throw new AppError('Campanha não encontrada', 404);
        const owned = await metaRepository.getCampaignsByUser(userId);
        if (!owned.some((c: any) => c.id === campaign.id)) {
            throw new AppError('Campanha não pertence a este usuário', 403);
        }

        const user = await authRepository.findById(userId);
        if (!user?.access_token) throw new AppError('Conta Meta não conectada', 400);

        if (action === 'set_budget') {
            if (value == null) throw new ValidationError('value (orçamento em reais) é obrigatório pra set_budget');
            await metaService.setCampaignDailyBudget(userId, user.access_token, campaign.meta_campaign_id, value);
            await query('UPDATE campaigns SET daily_budget = $1, updated_at = NOW() WHERE id = $2', [value, campaign_id]);
        } else {
            const status = action === 'pause' ? 'PAUSED' : 'ACTIVE';
            await metaService.setCampaignStatus(userId, user.access_token, campaign.meta_campaign_id, status);
            await query('UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2', [status, campaign_id]);
        }

        res.json({ success: true, data: { campaign_id, action, value } });
    } catch (err) {
        next(err);
    }
});

export const aiController = router;
