export interface CsvRow {
    name: string;
    phone: string;
    email?: string;
    tags?: string;
    origin?: string;
    notes?: string;
    opt_in?: string;
    opt_in_at?: string;
    [key: string]: string | undefined;
}
export interface ImportResult {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{
        row: number;
        phone: string;
        reason: string;
    }>;
}
export declare function importContactsFromCsv(buffer: Buffer, options: {
    optIn?: boolean;
    optInSource?: string;
    tags?: string[];
    origin?: string;
}): Promise<ImportResult>;
//# sourceMappingURL=contacts.import.d.ts.map