// ==============================
// TrafficAI — Custom Error Classes
// ==============================

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(message: string, statusCode: number = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

export class AuthError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401);
        Object.setPrototypeOf(this, AuthError.prototype);
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') {
        super(message, 403);
        Object.setPrototypeOf(this, ForbiddenError.prototype);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
        super(message, 404);
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }
}

export class ValidationError extends AppError {
    constructor(message: string = 'Validation failed') {
        super(message, 422);
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

export class MetaApiError extends AppError {
    public readonly metaErrorCode?: number;

    constructor(message: string, metaErrorCode?: number) {
        super(`Meta API Error: ${message}`, 502);
        this.metaErrorCode = metaErrorCode;
        Object.setPrototypeOf(this, MetaApiError.prototype);
    }
}

export class RateLimitError extends AppError {
    public readonly retryAfter: number;

    constructor(retryAfter: number = 60) {
        super('Rate limit exceeded', 429);
        this.retryAfter = retryAfter;
        Object.setPrototypeOf(this, RateLimitError.prototype);
    }
}
