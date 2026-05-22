"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuperService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../../config/database");
const common_types_1 = require("../../types/common.types");
const env_1 = require("../../config/env");
class SuperService {
    app;
    constructor(app) {
        this.app = app;
    }
    // ─── Auth ──────────────────────────────────────────────────────────────────
    async hasAnySuperAdmin() {
        const count = await database_1.prisma.superAdmin.count();
        return count > 0;
    }
    async setup(input) {
        if (await this.hasAnySuperAdmin()) {
            throw common_types_1.HttpError.conflict('Super Admin já configurado');
        }
        const passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        const admin = await database_1.prisma.superAdmin.create({
            data: { name: input.name, email: input.email.toLowerCase(), passwordHash },
        });
        const token = this.app.jwt.sign({ sub: admin.id, type: 'superadmin' }, { expiresIn: '30d' });
        return { token, admin: { id: admin.id, name: admin.name, email: admin.email } };
    }
    async login(input) {
        const admin = await database_1.prisma.superAdmin.findUnique({
            where: { email: input.email.toLowerCase() },
        });
        if (!admin || !admin.isActive)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        const valid = await bcryptjs_1.default.compare(input.password, admin.passwordHash);
        if (!valid)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        const token = this.app.jwt.sign({ sub: admin.id, type: 'superadmin' }, { expiresIn: '30d' });
        return { token, admin: { id: admin.id, name: admin.name, email: admin.email } };
    }
    // ─── Workspaces ───────────────────────────────────────────────────────────
    async listWorkspaces() {
        return database_1.prisma.workspace.findMany({
            orderBy: { createdAt: 'asc' },
            include: {
                _count: { select: { leadUsers: true, leads: true, connections: true } },
            },
        });
    }
    async createWorkspace(input) {
        const existing = await database_1.prisma.workspace.findUnique({ where: { slug: input.slug } });
        if (existing)
            throw common_types_1.HttpError.conflict('Slug já em uso');
        const passwordHash = await bcryptjs_1.default.hash(input.adminPassword, env_1.env.BCRYPT_ROUNDS);
        return database_1.prisma.$transaction(async (tx) => {
            const ws = await tx.workspace.create({
                data: { name: input.name, slug: input.slug },
            });
            await tx.leadUser.create({
                data: {
                    name: input.adminName,
                    email: input.adminEmail.toLowerCase(),
                    passwordHash,
                    role: 'ADMIN',
                    workspaceId: ws.id,
                },
            });
            return ws;
        });
    }
    async updateWorkspace(id, input) {
        const ws = await database_1.prisma.workspace.findUnique({ where: { id } });
        if (!ws)
            throw common_types_1.HttpError.notFound('Workspace não encontrado');
        return database_1.prisma.workspace.update({ where: { id }, data: input });
    }
    async deleteWorkspace(id) {
        const ws = await database_1.prisma.workspace.findUnique({ where: { id } });
        if (!ws)
            throw common_types_1.HttpError.notFound('Workspace não encontrado');
        if (ws.slug === 'default')
            throw common_types_1.HttpError.conflict('Não é possível excluir o workspace padrão');
        const [leadCount, userCount] = await Promise.all([
            database_1.prisma.lead.count({ where: { workspaceId: id } }),
            database_1.prisma.leadUser.count({ where: { workspaceId: id } }),
        ]);
        if (leadCount > 0 || userCount > 0) {
            throw common_types_1.HttpError.conflict(`Workspace possui ${leadCount} lead(s) e ${userCount} usuário(s). Remova os dados antes de excluir.`);
        }
        await database_1.prisma.workspace.delete({ where: { id } });
    }
    async getWorkspace(id) {
        const ws = await database_1.prisma.workspace.findUnique({
            where: { id },
            include: {
                _count: { select: { leadUsers: true, leads: true, connections: true } },
            },
        });
        if (!ws)
            throw common_types_1.HttpError.notFound('Workspace não encontrado');
        return ws;
    }
    async getWorkspaceUsers(workspaceId) {
        const ws = await database_1.prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!ws)
            throw common_types_1.HttpError.notFound('Workspace não encontrado');
        return database_1.prisma.leadUser.findMany({
            where: { workspaceId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        });
    }
    async impersonateWorkspace(workspaceId) {
        const ws = await database_1.prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!ws)
            throw common_types_1.HttpError.notFound('Workspace não encontrado');
        if (!ws.isActive)
            throw common_types_1.HttpError.forbidden('Workspace inativo');
        const admin = await database_1.prisma.leadUser.findFirst({
            where: { workspaceId, role: 'ADMIN', isActive: true },
        });
        if (!admin)
            throw common_types_1.HttpError.notFound('Nenhum admin ativo encontrado neste workspace');
        const token = this.app.jwt.sign({ sub: admin.id, role: admin.role, type: 'lead', workspaceId: ws.id }, { expiresIn: '8h' });
        return {
            token,
            user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
            workspaceSlug: ws.slug,
        };
    }
}
exports.SuperService = SuperService;
//# sourceMappingURL=super.service.js.map