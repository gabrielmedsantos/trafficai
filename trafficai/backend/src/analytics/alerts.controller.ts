// ==============================
// TrafficAI — Alerts Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { alertsRepository } from './alerts.repository';
import { smartAlertsService } from './smart-alerts.service';

const router = Router();
router.use(authMiddleware);

/**
 * GET /alerts — list alerts for current user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { unread_only } = req.query;
        const userId = req.user!.userId;

        const limit = Math.min(parseInt(req.query.limit as string || '200', 10), 500);
        const alerts = unread_only === 'true'
            ? await alertsRepository.getUnread(userId)
            : await alertsRepository.getByUser(userId, limit);

        const unreadCount = await alertsRepository.getUnreadCount(userId);

        res.json({ success: true, data: { alerts, unread_count: unreadCount } });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /alerts/:id/read — mark alert as read
 */
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await alertsRepository.markAsRead(req.params.id, req.user!.userId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /alerts/read-all — mark all alerts as read
 */
router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await alertsRepository.markAllAsRead(req.user!.userId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /alerts/analyze — trigger manual alert analysis for current user
 */
router.post('/analyze', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await smartAlertsService.analyzeActiveAccountsByUser(req.user!.userId);
        res.json({ success: true, message: 'Análise de alertas concluída' });
    } catch (err) {
        next(err);
    }
});

export const alertsController = router;
