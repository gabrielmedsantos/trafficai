import { MessageErrorType } from '@prisma/client';
interface MetaErrorData {
    code?: number;
    message?: string;
    type?: string;
    error_data?: {
        details?: string;
    };
}
export interface ClassifiedError {
    type: MessageErrorType;
    code: string;
    message: string;
    retryable: boolean;
    blacklistContact: boolean;
    pauseConnection: boolean;
    pauseDurationSeconds?: number;
}
/**
 * Classifica erros da Meta Cloud API.
 * Referência: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export declare function classifyMetaError(error: MetaErrorData): ClassifiedError;
export declare function isRetryableHttpStatus(status: number): boolean;
export {};
//# sourceMappingURL=error.classifier.d.ts.map