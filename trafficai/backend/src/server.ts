// ==============================
// TrafficAI — Server Bootstrap
// ==============================

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { apiRoutes } from './api/routes';
import { errorHandler } from './api/middleware/error-handler';
import { startSyncWorker } from './workers/sync.worker';
import { startTokenRefreshWorker } from './workers/token-refresh.worker';
import { startAlertsWorker } from './workers/alerts.worker';
import { startAutomationWorker } from './workers/automation.worker';
import { startGoogleAdsSyncWorker } from './workers/google-ads-sync.worker';
import { startWeeklyMonthlyReportWorker } from './workers/weekly-monthly-report.worker';
import { startBalanceSyncWorker } from './workers/balance-sync.worker';
import { startReportWorker } from './reports/report.worker';
import { startBillingWorker } from './workers/billing.worker';
import { startInvoiceReminderWorker } from './workers/invoice-reminder.worker';
import { startTrackingRetryWorker } from './workers/tracking-retry.worker';
import { startTrackingCleanupWorker } from './workers/tracking-cleanup.worker';
import { startCrmSyncWorker } from './workers/tracking-crm-sync.worker';
import { startCommercialWorker } from './commercial/commercial.worker';
import { logger } from './shared/logger';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Trust proxy (necessário atrás do Traefik/nginx)
app.set('trust proxy', 1);

// ---- Security Middleware ----
app.use(helmet());

// CORS aberto para o namespace /api/v1/track (sites dos clientes embedam o pixel).
// Os endpoints de tracking não usam cookies nem dependem de auth JWT.
app.use('/api/v1/track', cors({ origin: true, credentials: false }));

// CORS restrito ao painel para o restante.
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:3002',
        'http://localhost:3003',
    ],
    credentials: true,
}));

// ---- Rate Limiting ----
// Rate limit mais generoso para /api/v1/track (cada usuário final do site
// dispara múltiplos eventos: PageView + scrolls + conversões).
const trackLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 300,            // pixel dispara vários eventos por navegação
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { message: 'Too many requests', code: 429 } },
});
// Limiter específico pra /auth (login/register) — protege brute force
// sem estrangular o resto do app.
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 30,                  // 30 tentativas por IP em 5 min
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // login bem-sucedido não conta
    message: { success: false, error: { message: 'Muitas tentativas de login. Tente em alguns minutos.', code: 429 } },
});
// Main limiter mais folgado — SaaS multi-user compartilhando IP via proxy.
const mainLimiter = rateLimit({
    windowMs: 60 * 1000,      // 1 minuto (janela curta pra recuperar rápido)
    max: 600,                  // 600 req/min por IP — cobre múltiplos users atrás do mesmo proxy
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { message: 'Too many requests', code: 429 } },
});
app.use('/api/v1/track', trackLimiter);
app.use('/api/v1/auth', authLimiter);
app.use(mainLimiter);

// ---- Body Parsing ----
// IMPORTANTE: Stripe webhook precisa de raw body pra validar assinatura.
// A rota /api/v1/billing/webhook usa express.raw() no seu próprio router,
// então pulamos o express.json() pra ela.
app.use((req, res, next) => {
    if (req.path === '/api/v1/billing/webhook') return next();
    express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

// ---- Request Logging ----
app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 50),
    });
    next();
});

// ---- API Routes ----
app.use('/api/v1', apiRoutes);

// ---- 404 Handler ----
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: { message: 'Endpoint not found', code: 404 },
    });
});

// ---- Global Error Handler ----
app.use(errorHandler);

// ---- Start Server ----
app.listen(PORT, () => {
    logger.info(`🚀 TrafficAI API running on port ${PORT}`);
    logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Start background workers
    if (process.env.NODE_ENV !== 'test') {
        startSyncWorker();
        startTokenRefreshWorker();
        startBalanceSyncWorker();
        startAlertsWorker();
        startReportWorker();
        startCommercialWorker();
        startBillingWorker();
        startInvoiceReminderWorker();
        startTrackingRetryWorker();
        startTrackingCleanupWorker();
        startCrmSyncWorker();
        startAutomationWorker();
        startGoogleAdsSyncWorker();
        startWeeklyMonthlyReportWorker();
    }
});

export default app;
