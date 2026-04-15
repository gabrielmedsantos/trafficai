// ==============================
// TrafficAI — API Routes
// ==============================

import { Router } from 'express';
import { authController } from '../auth/auth.controller';
import { metaController } from '../meta/meta.controller';
import { aiController } from '../ai/ai.controller';
import { predictionController } from '../prediction/prediction.controller';
import { alertsController } from '../analytics/alerts.controller';
import { notificationController } from '../notifications/notification.controller';
import { reportController } from '../reports/report.controller';
import { routineController } from '../routine/routine.controller';
import { clientsController } from '../clients/clients.controller';
import { financialController } from '../financial/financial.controller';
import { tasksController } from '../tasks/tasks.controller';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
    res.json({
        success: true,
        data: {
            service: 'TrafficAI API',
            version: '1.0.0',
            status: 'healthy',
            timestamp: new Date().toISOString(),
        },
    });
});

// Mount module routes
router.use('/auth', authController);
router.use('/meta', metaController);
router.use('/ai', aiController);
router.use('/prediction', predictionController);
router.use('/alerts', alertsController);
router.use('/settings/notifications', notificationController);
router.use('/reports', reportController);
router.use('/routine', routineController);
router.use('/clients', clientsController);
router.use('/financial', financialController);
router.use('/tasks', tasksController);

export const apiRoutes = router;
