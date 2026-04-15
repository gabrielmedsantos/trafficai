// ==============================
// TrafficAI — Prediction Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { predictionService } from './prediction.service';

const router = Router();
router.use(authMiddleware);

/**
 * GET /prediction/campaign/:id
 * Get predictions for a specific campaign
 */
router.get('/campaign/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await predictionService.predictCampaign(req.params.id);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

export const predictionController = router;
