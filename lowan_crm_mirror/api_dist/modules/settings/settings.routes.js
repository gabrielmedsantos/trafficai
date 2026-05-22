"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = settingsRoutes;
const settings_service_1 = require("./settings.service");
const settings_controller_1 = require("./settings.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
async function settingsRoutes(app) {
    const service = new settings_service_1.SettingsService();
    const controller = new settings_controller_1.SettingsController(service);
    app.addHook('preHandler', auth_middleware_1.authenticate);
    // GET /settings — current settings
    app.get('/', (req, reply) => controller.getSettings(req, reply));
    // PUT /settings — update settings
    app.put('/', (req, reply) => controller.updateSettings(req, reply));
    // POST /settings/proxy/test — test proxy connectivity
    app.post('/proxy/test', (req, reply) => controller.testProxy(req, reply));
}
//# sourceMappingURL=settings.routes.js.map