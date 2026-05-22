export interface PaginationQuery {
    page?: number;
    limit?: number;
}
export interface PaginatedResult<T> {
    data: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}
export interface AppError {
    statusCode: number;
    message: string;
    code?: string;
    details?: unknown;
}
export declare class HttpError extends Error {
    readonly statusCode: number;
    readonly code: string;
    constructor(statusCode: number, message: string, code?: string);
    static badRequest(message: string, code?: string): HttpError;
    static unauthorized(message?: string, code?: string): HttpError;
    static forbidden(message?: string, code?: string): HttpError;
    static notFound(message: string, code?: string): HttpError;
    static conflict(message: string, code?: string): HttpError;
    static unprocessable(message: string, code?: string): HttpError;
    static internal(message?: string, code?: string): HttpError;
}
//# sourceMappingURL=common.types.d.ts.map