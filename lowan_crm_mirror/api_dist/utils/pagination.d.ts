import { PaginatedResult } from '../types/common.types';
export declare function paginate<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T>;
export declare function getPaginationParams(query: {
    page?: number;
    limit?: number;
}): {
    page: number;
    limit: number;
    skip: number;
};
//# sourceMappingURL=pagination.d.ts.map