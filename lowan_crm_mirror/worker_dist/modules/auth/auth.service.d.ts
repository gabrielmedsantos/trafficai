import { FastifyInstance } from 'fastify';
import type { LoginInput } from './auth.schema';
export declare class AuthService {
    private readonly app;
    constructor(app: FastifyInstance);
    login(input: LoginInput): Promise<{
        accessToken: string;
        refreshToken: any;
        user: {
            id: string;
            name: string;
            email: string;
            role: import(".prisma/client").$Enums.UserRole;
        };
    }>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
    }>;
    logout(userId: string): Promise<void>;
    getMe(userId: string): Promise<{
        id: string;
        email: string;
        name: string;
        role: import(".prisma/client").$Enums.UserRole;
        lastLoginAt: Date | null;
        createdAt: Date;
    }>;
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
}
//# sourceMappingURL=auth.service.d.ts.map