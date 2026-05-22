"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = contactsRoutes;
const contacts_service_1 = require("./contacts.service");
const contacts_controller_1 = require("./contacts.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const client_1 = require("@prisma/client");
async function contactsRoutes(app) {
    const service = new contacts_service_1.ContactsService();
    const controller = new contacts_controller_1.ContactsController(service);
    app.addHook('preHandler', auth_middleware_1.authenticate);
    app.get('/', (req, reply) => controller.list(req, reply));
    app.get('/tags', (req, reply) => controller.getTags(req, reply));
    app.get('/export', (req, reply) => controller.exportAll(req, reply));
    app.get('/:id', (req, reply) => controller.getById(req, reply));
    app.get('/:id/messages', (req, reply) => controller.getMessages(req, reply));
    app.register(async (restricted) => {
        restricted.addHook('preHandler', (0, auth_middleware_1.requireRole)(client_1.UserRole.ADMIN, client_1.UserRole.OPERATOR));
        restricted.post('/', (req, reply) => controller.create(req, reply));
        restricted.put('/:id', (req, reply) => controller.update(req, reply));
        restricted.delete('/:id', (req, reply) => controller.delete(req, reply));
        restricted.post('/:id/blacklist', (req, reply) => controller.blacklist(req, reply));
        restricted.delete('/:id/blacklist', (req, reply) => controller.removeFromBlacklist(req, reply));
        restricted.post('/:id/opt-in', (req, reply) => controller.optIn(req, reply));
        restricted.post('/:id/opt-out', (req, reply) => controller.optOut(req, reply));
        // POST /contacts/import (multipart CSV)
        restricted.post('/import', (req, reply) => controller.importCsv(req, reply));
        // POST /contacts/bulk-opt-in
        restricted.post('/bulk-opt-in', (req, reply) => controller.bulkOptIn(req, reply));
    });
}
//# sourceMappingURL=contacts.routes.js.map