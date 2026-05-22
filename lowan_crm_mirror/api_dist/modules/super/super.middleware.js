"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateSuperAdmin = authenticateSuperAdmin;
const common_types_1 = require("../../types/common.types");
async function authenticateSuperAdmin(request, _reply) {
    try {
        await request.jwtVerify();
        const payload = request.user;
        if (payload.type !== 'superadmin')
            throw new Error('Not a superadmin token');
        request.superAdmin = { id: payload.sub };
    }
    catch {
        throw common_types_1.HttpError.unauthorized('Sessão inválida ou expirada');
    }
}
//# sourceMappingURL=super.middleware.js.map