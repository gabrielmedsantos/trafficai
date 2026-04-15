// ==============================
// TrafficAI — Rate Limiter for Meta API
// ==============================

import { logger } from './logger';
import { RateLimitError } from './errors';

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    retryDelayMs: number;
    maxRetries: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
    maxRequests: 5000,       // Meta allows ~200 calls per hour per user, increased for local testing
    windowMs: 60 * 60 * 1000, // 1 hour
    retryDelayMs: 5000,
    maxRetries: 3,
};

class MetaRateLimiter {
    private requestCounts = new Map<string, { count: number; resetAt: number }>();
    private config: RateLimitConfig;

    constructor(config: Partial<RateLimitConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Check if request can proceed for a given user
     */
    canProceed(userId: string): boolean {
        const entry = this.requestCounts.get(userId);
        if (!entry) return true;

        if (Date.now() > entry.resetAt) {
            this.requestCounts.delete(userId);
            return true;
        }

        return entry.count < this.config.maxRequests;
    }

    /**
     * Track a request for a given user
     */
    trackRequest(userId: string): void {
        const entry = this.requestCounts.get(userId);
        if (!entry || Date.now() > entry.resetAt) {
            this.requestCounts.set(userId, {
                count: 1,
                resetAt: Date.now() + this.config.windowMs,
            });
        } else {
            entry.count++;
        }
    }

    /**
     * Execute a function with rate limiting and retry logic
     */
    async executeWithRetry<T>(
        userId: string,
        fn: () => Promise<T>,
        retryCount = 0
    ): Promise<T> {
        if (!this.canProceed(userId)) {
            const entry = this.requestCounts.get(userId);
            const retryAfter = entry ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 60;
            throw new RateLimitError(retryAfter);
        }

        try {
            this.trackRequest(userId);
            return await fn();
        } catch (error: any) {
            // Meta API rate limit error (code 32 or 4)
            const isRateLimit =
                error?.response?.data?.error?.code === 32 ||
                error?.response?.data?.error?.code === 4 ||
                error?.response?.status === 429;

            if (isRateLimit && retryCount < this.config.maxRetries) {
                const delay = this.config.retryDelayMs * Math.pow(2, retryCount);
                logger.warn(`Rate limited by Meta API. Retrying in ${delay}ms...`, {
                    userId,
                    retryCount: retryCount + 1,
                });
                await this.sleep(delay);
                return this.executeWithRetry(userId, fn, retryCount + 1);
            }

            // General retry for transient errors
            if (
                retryCount < this.config.maxRetries &&
                (error?.response?.status >= 500 || error?.code === 'ECONNRESET')
            ) {
                const delay = this.config.retryDelayMs * Math.pow(2, retryCount);
                logger.warn(`Transient error from Meta API. Retrying in ${delay}ms...`, {
                    userId,
                    retryCount: retryCount + 1,
                    error: error.message,
                });
                await this.sleep(delay);
                return this.executeWithRetry(userId, fn, retryCount + 1);
            }

            throw error;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export const metaRateLimiter = new MetaRateLimiter();
export { MetaRateLimiter, RateLimitConfig };
