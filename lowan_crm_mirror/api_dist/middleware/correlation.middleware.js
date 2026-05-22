"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
async function correlationPlugin(fastify) {
    fastify.decorateRequest('correlationId', '');
    fastify.addHook('onRequest', async (request, _reply) => {
        request.correlationId =
            request.headers['x-correlation-id'] || (0, crypto_1.randomUUID)();
    });
    fastify.addHook('onSend', async (request, reply) => {
        reply.header('x-correlation-id', request.correlationId);
    });
}
exports.default = (0, fastify_plugin_1.default)(correlationPlugin);
//# sourceMappingURL=correlation.middleware.js.map