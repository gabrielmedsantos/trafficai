// ==============================
// TrafficAI — Auth Middleware (JWT)
// ==============================

import { Request, Response, NextFunction } from 'express';
import { authService, JwtPayload } from './auth.service';
import { AuthError } from '../shared/errors';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

/**
 * Middleware to authenticate incoming requests via JWT Bearer token
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthError('No authentication token provided');
    }

    const token = authHeader.split(' ')[1];
    req.user = authService.verifyToken(token);
    next();
}
