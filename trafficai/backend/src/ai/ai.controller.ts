// ==============================
// TrafficAI — AI Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware } from '../auth/auth.middleware';
import { aiService } from './ai.service';
import { aiRepository } from './ai.repository';
import { streamAgentChat, ChatMessage } from './agent.service';
import { ValidationError } from '../shared/errors';

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
router.post('/analyze-campaign', async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/analyze-creative', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
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

export const aiController = router;
