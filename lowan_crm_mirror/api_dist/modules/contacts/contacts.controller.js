"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactsController = void 0;
const contacts_import_1 = require("./contacts.import");
const contacts_schema_1 = require("./contacts.schema");
const common_types_1 = require("../../types/common.types");
class ContactsController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(request, reply) {
        const query = contacts_schema_1.listContactsSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        return reply.send(await this.service.list(query.data));
    }
    async exportAll(request, reply) {
        const { tags, search } = request.query;
        const data = await this.service.exportAll(tags, search);
        const header = 'nome,telefone,email,grupos,opt_in,origem,observacoes';
        const escape = (v) => `"${(v ?? '').replace(/"/g, '""')}"`;
        const lines = data.map((c) => [
            escape(c.name),
            c.phone,
            c.email ?? '',
            escape(c.tags.join('|')),
            c.optIn ? 'true' : 'false',
            c.origin ?? '',
            escape(c.notes),
        ].join(','));
        const csv = '\uFEFF' + [header, ...lines].join('\n');
        return reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="contatos.csv"`)
            .send(csv);
    }
    async getById(request, reply) {
        return reply.send(await this.service.getById(request.params.id));
    }
    async create(request, reply) {
        const body = contacts_schema_1.createContactSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.status(201).send(await this.service.create(body.data));
    }
    async update(request, reply) {
        const body = contacts_schema_1.updateContactSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.update(request.params.id, body.data));
    }
    async delete(request, reply) {
        await this.service.delete(request.params.id);
        return reply.status(204).send();
    }
    async blacklist(request, reply) {
        const body = contacts_schema_1.blacklistContactSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.blacklist(request.params.id, body.data));
    }
    async removeFromBlacklist(request, reply) {
        return reply.send(await this.service.removeFromBlacklist(request.params.id));
    }
    async optIn(request, reply) {
        const body = contacts_schema_1.optInContactSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.setOptIn(request.params.id, body.data));
    }
    async optOut(request, reply) {
        return reply.send(await this.service.setOptOut(request.params.id));
    }
    async bulkOptIn(request, reply) {
        const body = contacts_schema_1.bulkOptInSchema.safeParse(request.body);
        if (!body.success)
            throw common_types_1.HttpError.badRequest(body.error.message);
        return reply.send(await this.service.bulkOptIn(body.data));
    }
    async getMessages(request, reply) {
        return reply.send(await this.service.getMessages(request.params.id));
    }
    async getTags(_request, reply) {
        return reply.send(await this.service.getTags());
    }
    async importCsv(request, reply) {
        const data = await request.file();
        if (!data)
            throw common_types_1.HttpError.badRequest('No file provided');
        const query = contacts_schema_1.importCsvSchema.safeParse(request.query);
        if (!query.success)
            throw common_types_1.HttpError.badRequest(query.error.message);
        const buffer = await data.toBuffer();
        const tags = query.data.tags ? query.data.tags.split(',').map((t) => t.trim()) : [];
        const result = await (0, contacts_import_1.importContactsFromCsv)(buffer, {
            optIn: query.data.optIn,
            optInSource: query.data.optInSource,
            tags,
            origin: query.data.origin,
        });
        return reply.status(200).send(result);
    }
}
exports.ContactsController = ContactsController;
//# sourceMappingURL=contacts.controller.js.map