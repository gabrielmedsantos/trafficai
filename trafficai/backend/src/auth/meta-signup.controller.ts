// ==============================
// Meta Ads Embedded Signup
// Flow: frontend chama FB.login({config_id, response_type:'code'}) → recebe code
//   → POST /meta-signup/exchange → backend troca code por User Long-Lived Token
//   → salva em users.access_token + token_expiration
//   → dispara sync inicial das ad_accounts
// ==============================

import axios from 'axios';
import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from './auth.middleware';
import { authRepository } from './auth.repository';
import { metaService } from '../meta/meta.service';
import { AppError, ValidationError } from '../shared/errors';
import { logger } from '../shared/logger';

const router = Router();

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;
// Config ID opcional pra Embedded Signup específico (criado no Business Manager Meta)
const META_ADS_SIGNUP_CONFIG_ID = process.env.META_ADS_SIGNUP_CONFIG_ID || '';

// PÚBLICO — config pro frontend inicializar FB SDK. Nunca inclui secret.
router.get('/config', (_req: Request, res: Response) => {
    if (!META_APP_ID) {
        return res.status(503).json({ success: false, error: { message: 'META_APP_ID não configurado no server' } });
    }
    res.json({
        success: true,
        data: {
            appId: META_APP_ID,
            graphApiVersion: META_API_VERSION,
            configId: META_ADS_SIGNUP_CONFIG_ID || null,
            // Scopes usados quando SEM config_id (fallback pra plain FB.login)
            scope: 'ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,instagram_basic,read_insights',
        },
    });
});

router.use(authMiddleware);

/**
 * POST /meta-signup/exchange
 * Body: { code: string, redirect_uri?: string }
 *
 * 1) Troca code (Meta Login for Business) por short-lived user token
 * 2) Troca short-lived por Long-Lived (60d) via fb_exchange_token
 * 3) Busca /me pra pegar meta_user_id
 * 4) Salva em users.access_token + token_expiration
 * 5) Dispara sync inicial (descoberta de ad_accounts)
 */
router.post('/exchange', async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!META_APP_ID || !META_APP_SECRET) {
            throw new AppError('META_APP_ID/SECRET não configurados no servidor', 503);
        }
        const { code, redirect_uri } = req.body;
        if (!code) throw new ValidationError('code é obrigatório');
        const userId = req.user!.userId;

        // Se veio code do Embedded Signup (config_id flow), redirect_uri deve ser vazio
        // ou o exato usado no client. Se veio de OAuth padrão, precisa bater.
        const params: any = {
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            code,
        };
        if (redirect_uri) params.redirect_uri = redirect_uri;

        // 1) Short-lived (User) token — endpoint OAuth padrão
        let shortToken: string;
        try {
            const r = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
                params, timeout: 20000,
            });
            shortToken = r.data.access_token;
            if (!shortToken) throw new Error('Meta não retornou access_token');
        } catch (err: any) {
            const detail = err.response?.data?.error?.message || err.message;
            logger.warn('meta-signup: code exchange falhou', { userId, detail });
            throw new AppError(`Meta code exchange falhou: ${detail}`, 400);
        }

        // 2) Long-lived (60d) token via fb_exchange_token
        let longToken: string;
        let expiresIn: number;
        try {
            const r = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: META_APP_ID,
                    client_secret: META_APP_SECRET,
                    fb_exchange_token: shortToken,
                },
                timeout: 20000,
            });
            longToken = r.data.access_token;
            expiresIn = Number(r.data.expires_in) || 60 * 24 * 3600; // fallback 60d
            if (!longToken) throw new Error('sem long token');
        } catch (err: any) {
            const detail = err.response?.data?.error?.message || err.message;
            logger.warn('meta-signup: long-lived exchange falhou', { userId, detail });
            throw new AppError(`Long-lived token exchange falhou: ${detail}`, 502);
        }

        // 3) /me pra pegar user id (dono do token) — Meta exige guardar meta_user_id
        let metaUserId: string;
        let metaUserName: string | null = null;
        try {
            const r = await axios.get(`${META_GRAPH_URL}/me`, {
                params: { fields: 'id,name', access_token: longToken },
                timeout: 15000,
            });
            metaUserId = r.data.id;
            metaUserName = r.data.name || null;
        } catch (err: any) {
            throw new AppError('Não foi possível verificar identidade Meta', 502);
        }

        // 4) Salva token no user
        const tokenExpiration = new Date(Date.now() + expiresIn * 1000);
        await authRepository.updateMetaToken(userId, metaUserId, longToken, tokenExpiration);
        logger.info('meta-signup: token instalado', { userId, metaUserId, expiresIn });

        // 5) Sync inicial em background (não bloqueia response)
        setImmediate(async () => {
            try {
                await metaService.syncUserData(userId, longToken, 35);
                logger.info('meta-signup: sync inicial ok', { userId });
            } catch (err: any) {
                logger.warn('meta-signup: sync inicial falhou (não crítico)', { userId, error: err.message });
            }
        });

        res.json({
            success: true,
            data: {
                connected: true,
                meta_user_id: metaUserId,
                meta_user_name: metaUserName,
                token_expires_at: tokenExpiration.toISOString(),
                message: 'Meta Ads conectado. Sincronizando contas em background.',
            },
        });
    } catch (err) { next(err); }
});

/**
 * POST /meta-signup/disconnect — invalida token local
 */
router.post('/disconnect', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await authRepository.updateMetaToken(req.user!.userId, '', '', new Date(0));
        res.json({ success: true });
    } catch (err) { next(err); }
});

/**
 * GET /meta-signup/status — está conectado? token válido?
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const u = await authRepository.findById(req.user!.userId);
        const connected = !!u?.access_token && !!u.meta_user_id;
        const expired = u?.token_expiration ? new Date(u.token_expiration) < new Date() : true;
        res.json({
            success: true,
            data: {
                connected,
                expired,
                meta_user_id: u?.meta_user_id || null,
                token_expires_at: u?.token_expiration || null,
            },
        });
    } catch (err) { next(err); }
});

export const metaSignupController = router;
