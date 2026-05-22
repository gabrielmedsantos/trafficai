"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
class HttpError extends Error {
    statusCode;
    code;
    constructor(statusCode, message, code = 'UNKNOWN_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'HttpError';
    }
    static badRequest(message, code = 'BAD_REQUEST') {
        return new HttpError(400, message, code);
    }
    static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
        return new HttpError(401, message, code);
    }
    static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
        return new HttpError(403, message, code);
    }
    static notFound(message, code = 'NOT_FOUND') {
        return new HttpError(404, message, code);
    }
    static conflict(message, code = 'CONFLICT') {
        return new HttpError(409, message, code);
    }
    static unprocessable(message, code = 'UNPROCESSABLE') {
        return new HttpError(422, message, code);
    }
    static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
        return new HttpError(500, message, code);
    }
}
exports.HttpError = HttpError;
//# sourceMappingURL=common.types.js.map