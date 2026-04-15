// ==============================
// TrafficAI — Global Error Handler Middleware
// ==============================

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';

export function errorHandler(err: Error | AppError, _req: Request, res: Response, _next: NextFunction): void {
    if (err instanceof AppError) {
        logger.warn('Application error', {
            message: err.message,
            statusCode: err.statusCode,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        });

        res.status(err.statusCode).json({
            success: false,
            error: {
                message: err.message,
                code: err.statusCode,
            },
        });
        return;
    }

    // Unexpected errors
    logger.error('Unhandled error', {
        message: err.message,
        stack: err.stack,
    });

    res.status(500).json({
        success: false,
        error: {
            message: process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : err.message,
            code: 500,
        },
    });
}
