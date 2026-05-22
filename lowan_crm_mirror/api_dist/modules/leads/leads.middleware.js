"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateLeadUser = authenticateLeadUser;
exports.requireLeadAdmin = requireLeadAdmin;
exports.requirePermission = requirePermission;
const common_types_1 = require("../../types/common.types");
async function authenticateLeadUser(request, _reply) {
    try {
        await request.jwtVerify();
        const payload = request.user;
        if (payload.type !== 'lead')
            throw new Error('Not a lead token');
        request.leadUser = { id: payload.sub, role: payload.role, workspaceId: payload.workspaceId, permissions: payload.permissions };
    }
    catch {
        throw common_types_1.HttpError.unauthorized('Sessão inválida ou expirada');
    }
}
async function requireLeadAdmin(request, _reply) {
    if (request.leadUser?.role !== 'ADMIN') {
        throw common_types_1.HttpError.forbidden('Acesso restrito ao administrador');
    }
}
function requirePermission(key) {
    return async function (request, _reply) {
        const user = request.leadUser;
        if (!user)
            throw common_types_1.HttpError.unauthorized('Sessão inválida');
        if (user.role === 'ADMIN')
            return;
        if (!user.permissions?.[key])
            throw common_types_1.HttpError.forbidden('Permissão insuficiente');
    };
}
//# sourceMappingURL=leads.middleware.js.map