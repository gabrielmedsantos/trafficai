"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const env_1 = require("../../config/env");
const common_types_1 = require("../../types/common.types");
class AuthService {
    app;
    constructor(app) {
        this.app = app;
    }
    async login(input) {
        const user = await database_1.prisma.user.findUnique({
            where: { email: input.email.toLowerCase() },
            select: {
                id: true,
                name: true,
                email: true,
                passwordHash: true,
                role: true,
                isActive: true,
            },
        });
        if (!user || !user.isActive) {
            throw common_types_1.HttpError.unauthorized('Invalid credentials');
        }
        const valid = await bcryptjs_1.default.compare(input.password, user.passwordHash);
        if (!valid) {
            throw common_types_1.HttpError.unauthorized('Invalid credentials');
        }
        await database_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        const accessToken = this.app.jwt.sign({ sub: user.id, email: user.email, role: user.role }, { expiresIn: env_1.env.JWT_EXPIRES_IN });
        const refreshToken = this.app.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: env_1.env.JWT_REFRESH_EXPIRES_IN, secret: env_1.env.JWT_REFRESH_SECRET });
        // Persist refresh token hash in Redis
        const refreshHash = await bcryptjs_1.default.hash(refreshToken, 6);
        const ttl = parseDurationToSeconds(env_1.env.JWT_REFRESH_EXPIRES_IN);
        await redis_1.redis.setex(redis_1.RedisKeys.userSession(user.id), ttl, refreshHash);
        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        };
    }
    async refresh(refreshToken) {
        let payload;
        try {
            payload = this.app.jwt.verify(refreshToken, {
                key: env_1.env.JWT_REFRESH_SECRET,
            });
        }
        catch {
            throw common_types_1.HttpError.unauthorized('Invalid refresh token');
        }
        if (payload.type !== 'refresh') {
            throw common_types_1.HttpError.unauthorized('Invalid token type');
        }
        const storedHash = await redis_1.redis.get(redis_1.RedisKeys.userSession(payload.sub));
        if (!storedHash) {
            throw common_types_1.HttpError.unauthorized('Session expired');
        }
        const valid = await bcryptjs_1.default.compare(refreshToken, storedHash);
        if (!valid) {
            throw common_types_1.HttpError.unauthorized('Invalid refresh token');
        }
        const user = await database_1.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, role: true, isActive: true },
        });
        if (!user || !user.isActive) {
            throw common_types_1.HttpError.unauthorized('User not found or inactive');
        }
        const accessToken = this.app.jwt.sign({ sub: user.id, email: user.email, role: user.role }, { expiresIn: env_1.env.JWT_EXPIRES_IN });
        return { accessToken };
    }
    async logout(userId) {
        await redis_1.redis.del(redis_1.RedisKeys.userSession(userId));
    }
    async getMe(userId) {
        const user = await database_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, role: true, lastLoginAt: true, createdAt: true },
        });
        if (!user)
            throw common_types_1.HttpError.notFound('User not found');
        return user;
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await database_1.prisma.user.findUnique({
            where: { id: userId },
            select: { passwordHash: true },
        });
        if (!user)
            throw common_types_1.HttpError.notFound('User not found');
        const valid = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
        if (!valid)
            throw common_types_1.HttpError.badRequest('Current password is incorrect', 'WRONG_PASSWORD');
        const newHash = await bcryptjs_1.default.hash(newPassword, env_1.env.BCRYPT_ROUNDS);
        await database_1.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
        // Invalidate all sessions
        await redis_1.redis.del(redis_1.RedisKeys.userSession(userId));
    }
}
exports.AuthService = AuthService;
function parseDurationToSeconds(duration) {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match)
        return 604800; // default 7d
    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit] ?? 1);
}
//# sourceMappingURL=auth.service.js.map