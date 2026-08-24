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
import { routinesConfigController } from '../routines-config/routines-config.controller';
import { onboardingController } from '../onboarding/onboarding.controller';
import { clientsController } from '../clients/clients.controller';
import { financialController } from '../financial/financial.controller';
import { tasksController } from '../tasks/tasks.controller';
import { teamController } from '../team/team.controller';
import { trackingController } from '../tracking/tracking.controller';
import { trackingPublicController } from '../tracking/tracking.public';
import { boardController } from '../board/board.controller';
import { commercialController } from '../commercial/commercial.controller';
import { integrationsController as commercialIntegrationsController } from '../commercial/integrations/integrations.controller';
import { kommoWebhookController } from '../commercial/integrations/kommo/webhook';
import { evolutionWebhookController } from '../commercial/integrations/evolution/webhook';
import { shareLinksController, shareLinksPublicController } from '../commercial/share-links.controller';
import { automationController } from '../automation/automation.controller';
import { metaActionsController } from '../meta/meta-actions.controller';
import { googleAdsController } from '../googleAds/google-ads.controller';
import { googleOAuthController, googleOAuthPublicController } from '../googleAds/google-oauth.controller';
import { billingController, billingPublicController } from '../billing/billing.controller';
import { metaSignupController } from '../auth/meta-signup.controller';
import { pdfReportController, pdfReportPublicController } from '../reports/pdf-report.controller';
import { templatesController } from '../templates/templates.controller';
import { planGuard } from '../billing/plan.middleware';

const router = Router();

// Plan guard global — bloqueia acesso a rotas protegidas quando o user
// não tem assinatura ativa nem trial vigente. Rotas isentas (auth/billing/
// webhooks/públicas) são reconhecidas pelo prefixo do path.
router.use(planGuard);

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
router.use('/automation', automationController);
router.use('/meta-actions', metaActionsController);
router.use('/google-ads', googleAdsController);
router.use('/google/oauth', googleOAuthPublicController);       // GET /google/oauth/callback (público)
router.use('/google', googleOAuthController);                    // /google/oauth/{status,connect,disconnect}, /google/drive/upload, /google/calendar/events
router.use('/billing/webhook', billingPublicController);        // POST /billing/webhook (público — Stripe)
router.use('/billing', billingController);                       // GET /billing/subscription, POST /billing/checkout, /billing/portal, GET /billing/plans
router.use('/meta-signup', metaSignupController);
router.use('/prediction', predictionController);
router.use('/alerts', alertsController);
router.use('/settings/notifications', notificationController);
router.use('/reports', reportController);
router.use('/reports', pdfReportController);       // POST /reports/pdf/generate, GET /reports/pdf/list, DELETE
router.use('/r', pdfReportPublicController);       // GET /r/pdf/:token (público)
router.use('/templates', templatesController);
router.use('/routine', routineController);
router.use('/routines-config', routinesConfigController);
router.use('/onboarding', onboardingController);
router.use('/clients', clientsController);
router.use('/financial', financialController);
router.use('/tasks', tasksController);
router.use('/team', teamController);
router.use('/board', boardController);

// Tracking público (sem JWT) — pixel, ingest e webhook
router.use('/track', trackingPublicController);

// Tracking autenticado — CRUD + stats
router.use('/tracking', trackingController);

// Comercial — webhooks públicos PRIMEIRO (sem JWT), depois rotas autenticadas
router.use('/commercial/webhooks', kommoWebhookController);
router.use('/commercial/webhooks', evolutionWebhookController);
router.use('/commercial/public', shareLinksPublicController);
router.use('/commercial/integrations', commercialIntegrationsController);
router.use('/commercial/share-links', shareLinksController);
router.use('/commercial', commercialController);

export const apiRoutes = router;
