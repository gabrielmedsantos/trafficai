"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const common_types_1 = require("../types/common.types");
const database_1 = require("../config/database");
async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
        // JWT payload uses `sub` for user id; cast to read it safely
        const payload = request.user;
        const userId = payload.sub ?? payload.id;
        const user = await database_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true, isActive: true },
        });
        if (!user || !user.isActive) {
            throw common_types_1.HttpError.unauthorized('User not found or inactive');
        }
        request.user = { id: user.id, email: user.email, role: user.role };
    }
    catch (err) {
        if (err instanceof common_types_1.HttpError)
            throw err;
        throw common_types_1.HttpError.unauthorized('Invalid or expired token');
    }
}
function requireRole(...roles) {
    return async (request, _reply) => {
        if (!roles.includes(request.user.role)) {
            throw common_types_1.HttpError.forbidden('Insufficient permissions');
        }
    };
}
//# sourceMappingURL=auth.middleware.js.map