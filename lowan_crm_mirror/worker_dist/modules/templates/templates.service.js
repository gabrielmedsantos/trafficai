"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplatesService = void 0;
const database_1 = require("../../config/database");
const common_types_1 = require("../../types/common.types");
const pagination_1 = require("../../utils/pagination");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const cloud_api_service_1 = require("../../services/whatsapp/cloud-api.service");
const logger_1 = require("../../config/logger");
class TemplatesService {
    async list(input) {
        const { page, limit, skip } = (0, pagination_1.getPaginationParams)(input);
        const where = {};
        if (input.status)
            where.status = input.status;
        if (input.category)
            where.category = input.category;
        if (input.search) {
            where.OR = [
                { name: { contains: input.search, mode: 'insensitive' } },
                { body: { contains: input.search, mode: 'insensitive' } },
            ];
        }
        const [data, total] = await Promise.all([
            database_1.prisma.template.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    metaTemplateId: true,
                    name: true,
                    language: true,
                    category: true,
                    status: true,
                    headerType: true,
                    variablesCount: true,
                    connectionId: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            database_1.prisma.template.count({ where }),
        ]);
        return (0, pagination_1.paginate)(data, total, page, limit);
    }
    async getById(id) {
        const template = await database_1.prisma.template.findUnique({ where: { id } });
        if (!template)
            throw common_types_1.HttpError.notFound('Template not found');
        return template;
    }
    async create(input, userId) {
        const variablesCount = this.countBodyVariables(input.body);
        if (input.variables.length > 0) {
            const maxIndex = Math.max(...input.variables.map((v) => v.index));
            if (maxIndex !== variablesCount) {
                throw common_types_1.HttpError.unprocessable(`Body has ${variablesCount} variables ({{1}}...{{${variablesCount}}}), but ${input.variables.length} variables defined`, 'VARIABLES_MISMATCH');
            }
        }
        // Multi-conexão: criar um template por WABA
        const connectionIds = input.connectionIds?.length
            ? input.connectionIds
            : input.connectionId
                ? [input.connectionId]
                : [null];
        const templates = [];
        for (const connId of connectionIds) {
            if (connId) {
                const conn = await database_1.prisma.whatsappConnection.findUnique({ where: { id: connId } });
                if (!conn)
                    throw common_types_1.HttpError.notFound(`Connection ${connId} not found`);
            }
            const { connectionIds: _, ...inputWithoutIds } = input;
            const template = await database_1.prisma.template.create({
                data: {
                    ...inputWithoutIds,
                    connectionId: connId ?? undefined,
                    variablesCount,
                    variables: input.variables,
                    buttons: input.buttons ? input.buttons : undefined,
                    createdById: userId,
                },
            });
            this.submitToMeta(template.id, { ...inputWithoutIds, connectionId: connId ?? undefined }).catch((err) => logger_1.logger.warn({ templateId: template.id, error: err.message }, 'Background Meta submission failed'));
            templates.push(template);
        }
        return templates.length === 1 ? templates[0] : templates;
    }
    async submitToMeta(templateId, input) {
        // Buscar conexão ativa para usar o WABA e token
        const connection = await database_1.prisma.whatsappConnection.findFirst({
            where: {
                status: 'ACTIVE',
                ...(input.connectionId ? { id: input.connectionId } : {}),
            },
            select: { id: true, name: true, wabaId: true, accessTokenEnc: true },
        });
        if (!connection) {
            const msg = input.connectionId
                ? `Connection ${input.connectionId} is not ACTIVE`
                : 'No active connection found to submit template';
            logger_1.logger.warn({ templateId, connectionId: input.connectionId }, msg);
            throw new Error(msg);
        }
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const components = this.buildMetaComponents(input);
        // Converter EN_US → en_US (Meta espera lowercase_UPPERCASE)
        const [lang, region] = input.language.split('_');
        const language = region ? `${lang.toLowerCase()}_${region.toUpperCase()}` : input.language.toLowerCase();
        const result = await cloud_api_service_1.cloudApiService.submitTemplate(connection.wabaId, accessToken, {
            name: input.name,
            language,
            category: input.category,
            components,
        });
        await database_1.prisma.template.update({
            where: { id: templateId },
            data: { metaTemplateId: result.id },
        });
    }
    buildMetaComponents(input) {
        const components = [];
        if (input.headerType && input.headerContent) {
            const comp = { type: 'HEADER', format: input.headerType };
            if (input.headerType === 'TEXT')
                comp.text = input.headerContent;
            components.push(comp);
        }
        const bodyComp = { type: 'BODY', text: input.body };
        if (input.variables.length > 0) {
            const examples = input.variables.map((v) => v.example ?? `example_${v.index}`);
            bodyComp.example = { body_text: [examples] };
        }
        components.push(bodyComp);
        if (input.footer) {
            components.push({ type: 'FOOTER', text: input.footer });
        }
        if (input.buttons && input.buttons.length > 0) {
            components.push({
                type: 'BUTTONS',
                buttons: input.buttons.map((b) => ({
                    type: b.type,
                    text: b.text,
                    ...(b.url ? { url: b.url } : {}),
                    ...(b.phone_number ? { phone_number: b.phone_number } : {}),
                })),
            });
        }
        return components;
    }
    async update(id, input, userId) {
        await this.getById(id);
        const data = { ...input };
        if (input.body) {
            data.variablesCount = this.countBodyVariables(input.body);
        }
        return database_1.prisma.template.update({
            where: { id },
            data,
        });
    }
    async resubmit(id) {
        const template = await this.getById(id);
        const input = {
            name: template.name,
            language: template.language,
            category: template.category,
            status: template.status,
            body: template.body,
            footer: template.footer ?? undefined,
            headerType: template.headerType ?? undefined,
            headerContent: template.headerContent ?? undefined,
            buttons: template.buttons ? template.buttons : undefined,
            variables: template.variables ? template.variables : [],
            connectionId: template.connectionId ?? undefined,
        };
        // Throws with a descriptive message if connection is not ACTIVE or Meta rejects
        await this.submitToMeta(id, input);
        const updated = await database_1.prisma.template.findUnique({ where: { id }, select: { metaTemplateId: true } });
        return { submitted: true, metaTemplateId: updated?.metaTemplateId ?? undefined };
    }
    async syncStatus(id) {
        const template = await this.getById(id);
        const connection = await database_1.prisma.whatsappConnection.findFirst({
            where: {
                status: 'ACTIVE',
                ...(template.connectionId ? { id: template.connectionId } : {}),
            },
            select: { wabaId: true, accessTokenEnc: true },
        });
        if (!connection)
            throw common_types_1.HttpError.unprocessable('No active connection found to sync template', 'NO_CONNECTION');
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const result = await cloud_api_service_1.cloudApiService.fetchTemplateStatus(connection.wabaId, accessToken, template.name);
        if (!result)
            throw common_types_1.HttpError.notFound('Template not found on Meta');
        const statusMap = {
            APPROVED: 'APPROVED',
            REJECTED: 'REJECTED',
            DISABLED: 'DISABLED',
            PENDING: 'PENDING',
            FLAGGED: 'PENDING',
            REINSTATED: 'APPROVED',
        };
        const newStatus = statusMap[result.status] ?? 'PENDING';
        const updated = newStatus !== template.status;
        if (updated) {
            await database_1.prisma.template.update({
                where: { id },
                data: { status: newStatus, metaTemplateId: result.id },
            });
        }
        logger_1.logger.info({ templateId: id, name: template.name, oldStatus: template.status, newStatus }, 'Template status synced');
        return { status: newStatus, updated };
    }
    async delete(id) {
        await this.getById(id);
        const usedInCampaign = await database_1.prisma.campaign.count({ where: { templateId: id } });
        if (usedInCampaign > 0) {
            throw common_types_1.HttpError.conflict('Cannot delete template used by campaigns', 'TEMPLATE_IN_USE');
        }
        await database_1.prisma.template.delete({ where: { id } });
    }
    /**
     * Validates that all required variables for the template are present in the provided values.
     * Returns the filled-in body as a preview.
     */
    validateVariables(template, values) {
        const vars = template.variables;
        if (!vars || vars.length === 0) {
            return { valid: true, missing: [] };
        }
        const missing = [];
        for (const v of vars) {
            const key = v.name || `{{${v.index}}}`;
            if (!values[v.name] && !values[String(v.index)]) {
                missing.push(key);
            }
        }
        return {
            valid: missing.length === 0,
            missing,
        };
    }
    // ─── Por conexão ────────────────────────────────────────────────────────────
    async listByConnection(connectionId, workspaceId) {
        // Valida que a conexão pertence ao workspace
        const conn = await database_1.prisma.whatsappConnection.findFirst({
            where: { id: connectionId, workspaceId },
            select: { id: true },
        });
        if (!conn)
            throw common_types_1.HttpError.notFound('Conexão não encontrada');
        return database_1.prisma.template.findMany({
            where: { connectionId },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                language: true,
                category: true,
                status: true,
                body: true,
                variablesCount: true,
                connectionId: true,
                metaTemplateId: true,
                createdAt: true,
            },
        });
    }
    async syncFromMeta(connectionId, workspaceId) {
        const conn = await database_1.prisma.whatsappConnection.findFirst({
            where: { id: connectionId, workspaceId },
            select: { id: true, wabaId: true, accessTokenEnc: true },
        });
        if (!conn)
            throw common_types_1.HttpError.notFound('Conexão não encontrada');
        const accessToken = (0, token_encryption_1.decrypt)(conn.accessTokenEnc);
        const metaTemplates = await cloud_api_service_1.cloudApiService.listTemplatesFromMeta(conn.wabaId, accessToken);
        const statusMap = {
            APPROVED: 'APPROVED',
            REJECTED: 'REJECTED',
            DISABLED: 'DISABLED',
            PENDING: 'PENDING',
            FLAGGED: 'PENDING',
            REINSTATED: 'APPROVED',
            PAUSED: 'DISABLED',
        };
        let created = 0;
        let synced = 0;
        for (const mt of metaTemplates) {
            const status = (statusMap[mt.status] ?? 'PENDING');
            // Extrai texto do componente BODY
            const bodyComp = mt.components?.find((c) => c.type === 'BODY');
            const body = bodyComp?.text ?? '';
            const variablesCount = this.countBodyVariables(body);
            const existing = await database_1.prisma.template.findFirst({
                where: {
                    OR: [
                        { metaTemplateId: mt.id },
                        { name: mt.name, connectionId },
                    ],
                },
                select: { id: true, status: true },
            });
            if (existing) {
                // Atualiza status e metaTemplateId se mudou
                await database_1.prisma.template.update({
                    where: { id: existing.id },
                    data: { status, metaTemplateId: mt.id, body: body || undefined },
                });
                synced++;
            }
            else {
                // Cria novo registro a partir do que a Meta devolveu
                await database_1.prisma.template.create({
                    data: {
                        name: mt.name,
                        language: mt.language,
                        category: mt.category,
                        status,
                        body,
                        variablesCount,
                        connectionId,
                        metaTemplateId: mt.id,
                        variables: [],
                    },
                });
                created++;
            }
        }
        logger_1.logger.info({ connectionId, created, synced, total: metaTemplates.length }, 'Templates synced from Meta');
        return { created, synced };
    }
    countBodyVariables(body) {
        // Parâmetros posicionais: {{1}}, {{2}}, etc.
        const positional = body.match(/\{\{\d+\}\}/g);
        if (positional && positional.length > 0) {
            const indices = positional.map((m) => parseInt(m.replace(/[{}]/g, '')));
            return Math.max(...indices);
        }
        // Parâmetros nomeados: {{nome}}, {{var}}, etc.
        const named = body.match(/\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g);
        return named ? named.length : 0;
    }
}
exports.TemplatesService = TemplatesService;
//# sourceMappingURL=templates.service.js.map