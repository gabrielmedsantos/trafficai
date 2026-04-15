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
import { startReportWorker } from './reports/report.worker';
import { logger } from './shared/logger';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ---- Security Middleware ----
app.use(helmet());
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:3002',
        'http://localhost:3003',
    ],
    credentials: true,
}));

// ---- Rate Limiting ----
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // increased for frontend initial requests
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { message: 'Too many requests', code: 429 } },
}));

// ---- Body Parsing ----
app.use(express.json({ limit: '10mb' }));
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
        startAlertsWorker();
        startReportWorker();
    }
});

export default app;
