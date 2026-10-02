// ==============================
// TrafficAI — Auth Middleware (JWT)
// ==============================

import { Request, Response, NextFunction } from 'express';
import { authService, JwtPayload } from './auth.service';
import { AuthError, AppError } from '../shared/errors';
import { loadIdentity } from './identity';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

/**
 * Autentica pelo JWT e resolve a identidade:
 *   req.user.userId  = de quem são os dados (dono, pra membro do time)
 *   req.user.actorId = quem está logado (papel e permissões)
 *   req.user.imp     = admin que está "vendo como" (sessão de suporte)
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthError('No authentication token provided');
    }

    const token = authHeader.split(' ')[1];
    const payload = authService.verifyToken(token);

    loadIdentity(payload.userId).then((ident) => {
        if (!ident) return next(new AuthError('Invalid or expired token'));
        // Conta suspensa: bloqueia o próprio usuário (o admin "vendo como" passa).
        if (ident.suspended && !payload.imp) {
            return next(Object.assign(new AppError('Conta suspensa. Fale com o suporte da Alfamax.', 403), { code: 'ACCOUNT_SUSPENDED' }));
        }
        req.user = {
            ...payload,
            userId: ident.ownerId || payload.userId,
            actorId: payload.userId,
        };
        // Sessão de "Entrar como" tem prazo fixo — não renova.
        if (!payload.imp) {
            const renewed = authService.renewIfStale(payload);
            if (renewed) res.setHeader('X-Renewed-Token', renewed);
        }
        next();
    }).catch(next);
}

/** Id de quem está logado (pra papel/permissão). */
export function actorIdOf(req: Request): string {
    return req.user?.actorId || req.user!.userId;
}
