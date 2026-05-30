// ==============================
// TrafficAI — Auth Service
// ==============================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { authRepository, User } from './auth.repository';
import { AuthError, AppError, ValidationError } from '../shared/errors';
import { logger } from '../shared/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || '';

export interface JwtPayload {
    userId: string;
    email: string;
}

export interface AuthTokenResponse {
    token: string;
    user: Omit<User, 'password_hash' | 'access_token'>;
}

export class AuthService {
    /**
     * Register a new user
     */
    async register(email: string, password: string, name?: string): Promise<AuthTokenResponse> {
        const existing = await authRepository.findByEmail(email);
        if (existing) {
            throw new ValidationError('Email already registered');
        }

        if (password.length < 8) {
            throw new ValidationError('Password must be at least 8 characters');
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await authRepository.create(email, passwordHash, name);

        const token = this.generateToken(user);
        logger.info('User registered', { userId: user.id, email: user.email });

        return { token, user: this.sanitizeUser(user) };
    }

    /**
     * Login with email and password
     */
    async login(email: string, password: string): Promise<AuthTokenResponse> {
        const user = await authRepository.findByEmail(email);
        if (!user) {
            throw new AuthError('Invalid email or password');
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            throw new AuthError('Invalid email or password');
        }

        const token = this.generateToken(user);
        logger.info('User logged in', { userId: user.id });

        return { token, user: this.sanitizeUser(user) };
    }

    /**
     * Generate Meta OAuth authorization URL
     */
    getMetaAuthUrl(userId: string): string {
        const scopes = [
            'ads_read',
            'ads_management',
            'business_management',
            'read_insights',
            'pages_show_list',
        ].join(',');

        const params = new URLSearchParams({
            client_id: META_APP_ID,
            redirect_uri: META_REDIRECT_URI,
            scope: scopes,
            state: userId, // pass userId to callback
            response_type: 'code',
        });

        return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
    }

    /**
     * Handle Meta OAuth callback — exchange code for token
     */
    async handleMetaCallback(code: string, userId: string): Promise<void> {
        try {
            // Exchange code for short-lived token
            const tokenResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
                params: {
                    client_id: META_APP_ID,
                    client_secret: META_APP_SECRET,
                    redirect_uri: META_REDIRECT_URI,
                    code,
                },
            });

            const shortLivedToken = tokenResponse.data.access_token;

            // Exchange for long-lived token (60 days)
            const longLivedResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: META_APP_ID,
                    client_secret: META_APP_SECRET,
                    fb_exchange_token: shortLivedToken,
                },
            });

            const { access_token, expires_in } = longLivedResponse.data;
            const tokenExpiration = new Date(Date.now() + expires_in * 1000);

            // Get Meta user ID
            const meResponse = await axios.get('https://graph.facebook.com/v19.0/me', {
                params: { access_token },
            });

            const metaUserId = meResponse.data.id;

            await authRepository.updateMetaToken(userId, metaUserId, access_token, tokenExpiration);
            logger.info('Meta account connected', { userId, metaUserId });
        } catch (error: any) {
            logger.error('Meta OAuth callback failed', { error: error.message, userId });
            throw new AppError('Failed to connect Meta account', 502);
        }
    }

    /**
     * Manually save Meta access token (for development/testing)
     */
    async saveManualMetaToken(userId: string, accessToken: string): Promise<void> {
        try {
            // Validate token by calling Meta API
            const meResponse = await axios.get('https://graph.facebook.com/v19.0/me', {
                params: { access_token: accessToken },
            });

            const metaUserId = meResponse.data.id;

            // Set expiration to 60 days from now (standard for long-lived tokens)
            const tokenExpiration = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

            await authRepository.updateMetaToken(userId, metaUserId, accessToken, tokenExpiration);
            logger.info('Manual Meta token saved', { userId, metaUserId });
        } catch (error: any) {
            logger.error('Invalid Meta token', { error: error.message, userId });
            throw new AppError('Invalid Meta access token', 400);
        }
    }

    /**
     * Refresh a Meta access token
     */
    async refreshMetaToken(userId: string): Promise<void> {
        const user = await authRepository.findById(userId);
        if (!user?.access_token) {
            throw new AppError('No Meta token to refresh');
        }

        try {
            const response = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: META_APP_ID,
                    client_secret: META_APP_SECRET,
                    fb_exchange_token: user.access_token,
                },
            });

            const { access_token, expires_in } = response.data;
            if (!access_token || typeof expires_in !== 'number' || !Number.isFinite(expires_in) || expires_in <= 0) {
                throw new AppError(
                    `Meta retornou resposta inválida no refresh: ${JSON.stringify(response.data).slice(0, 200)}`,
                    502,
                );
            }
            const tokenExpiration = new Date(Date.now() + expires_in * 1000);

            await authRepository.updateMetaToken(userId, user.meta_user_id!, access_token, tokenExpiration);
            logger.info('Meta token refreshed', { userId });
        } catch (error: any) {
            logger.error('Meta token refresh failed', { userId, error: error.message });
            throw new AppError('Failed to refresh Meta token', 502);
        }
    }

    /**
     * Verify a JWT token and return payload
     */
    verifyToken(token: string): JwtPayload {
        try {
            return jwt.verify(token, JWT_SECRET) as JwtPayload;
        } catch {
            throw new AuthError('Invalid or expired token');
        }
    }

    private generateToken(user: User): string {
        const payload: JwtPayload = { userId: user.id, email: user.email };
        return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
    }

    private sanitizeUser(user: User): Omit<User, 'password_hash' | 'access_token'> {
        const { password_hash, access_token, ...safe } = user;
        return safe;
    }
}

export const authService = new AuthService();
