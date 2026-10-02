// ==============================
// TrafficAI — Auth Controller
// ==============================

import { Router, Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { authMiddleware } from './auth.middleware';
import { ValidationError } from '../shared/errors';

const router = Router();

/**
 * POST /auth/register
 * Create a new user account
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            throw new ValidationError('Email and password are required');
        }
        const result = await authService.register(email, password, name);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /auth/login
 * Authenticate and receive JWT
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            throw new ValidationError('Email and password are required');
        }
        const result = await authService.login(email, password);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /auth/meta/connect
 * Redirect user to Meta OAuth authorization page
 */
router.get('/meta/connect', authMiddleware, (req: Request, res: Response) => {
    const url = authService.getMetaAuthUrl(req.user!.userId);
    res.json({ success: true, data: { url } });
});

/**
 * POST /auth/meta/manual-token
 * Manually save Meta access token
 */
router.post('/meta/manual-token', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { access_token } = req.body;
        if (!access_token) {
            throw new ValidationError('access_token is required');
        }
        await authService.saveManualMetaToken(req.user!.userId, access_token);
        res.json({ success: true, message: 'Meta token saved successfully' });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /auth/meta/callback
 * Handle Meta OAuth callback
 */
router.get('/meta/callback', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { code, state } = req.query;
        if (!code || !state) {
            throw new ValidationError('Missing authorization code or state');
        }
        await authService.handleMetaCallback(code as string, state as string);
        // Redirect to frontend success page
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/dashboard?meta_connected=true`);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { authRepository } = await import('./auth.repository');
        const actorId = req.user!.actorId || req.user!.userId;
        const user = await authRepository.findById(actorId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        // Conexão Meta é do dono dos dados (membro do time usa a do dono).
        const owner = actorId === req.user!.userId ? user : await authRepository.findById(req.user!.userId);
        let impersonatedBy: { id: string; name: string } | null = null;
        if (req.user!.imp) {
            const admin = await authRepository.findById(req.user!.imp);
            impersonatedBy = admin ? { id: admin.id, name: admin.name || admin.email } : { id: req.user!.imp, name: 'Admin' };
        }
        const { password_hash, access_token, ...safeUser } = user;
        res.json({
            success: true,
            data: {
                ...safeUser,
                // Durante "Entrar como" o papel é o do cliente — nunca o do admin.
                role: (user as any).role,
                is_team_member: actorId !== req.user!.userId,
                impersonated_by: impersonatedBy,
                meta_connected: !!owner?.access_token && !!owner?.token_expiration && new Date(owner.token_expiration) > new Date(),
            },
        });
    } catch (err) {
        next(err);
    }
});

export const authController = router;
