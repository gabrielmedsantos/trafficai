"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importContactsFromCsv = importContactsFromCsv;
const csv_parse_1 = require("csv-parse");
const stream_1 = require("stream");
const phone_normalizer_1 = require("../../utils/phone.normalizer");
const database_1 = require("../../config/database");
async function importContactsFromCsv(buffer, options) {
    const result = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };
    const rows = await parseCsv(buffer);
    result.total = rows.length;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 = header + 1-indexed
        if (!row.phone) {
            result.errors.push({ row: rowNum, phone: '', reason: 'Missing phone' });
            result.skipped++;
            continue;
        }
        const phone = (0, phone_normalizer_1.normalizePhone)(row.phone);
        if (!phone.valid || !phone.normalized || !phone.e164) {
            result.errors.push({ row: rowNum, phone: row.phone, reason: phone.error ?? 'Invalid phone' });
            result.skipped++;
            continue;
        }
        const phoneNormalized = (0, phone_normalizer_1.canonicalBrazilianPhone)(row.phone);
        const phoneVariants = (0, phone_normalizer_1.brazilianPhoneVariants)(phoneNormalized);
        const rowTags = [
            ...(options.tags ?? []),
            ...(row.tags ? row.tags.split('|').map((t) => t.trim()).filter(Boolean) : []),
        ];
        // Aceita: true, TRUE, 1, yes, sim, s (case-insensitive)
        const optInRaw = row.opt_in ?? row['opt-in'] ?? row['optin'] ?? row['opt_in'];
        const csvOptIn = ['true', '1', 'yes', 'sim', 's'].includes(optInRaw?.toLowerCase().trim() ?? '');
        const finalOptIn = options.optIn ?? csvOptIn;
        // Extract custom variables (any column not in standard list)
        const standardCols = new Set(['name', 'phone', 'email', 'tags', 'origin', 'notes', 'opt_in', 'opt_in_at']);
        const customVariables = {};
        for (const [key, val] of Object.entries(row)) {
            if (!standardCols.has(key) && val) {
                customVariables[key] = val;
            }
        }
        try {
            const existing = await database_1.prisma.contact.findFirst({
                where: { phoneNormalized: { in: phoneVariants } },
            });
            if (existing) {
                // Update opt-in and tags if not already set
                const updateData = {};
                if (!existing.optIn && finalOptIn) {
                    updateData.optIn = true;
                    updateData.optInAt = row.opt_in_at ? new Date(row.opt_in_at) : new Date();
                    updateData.optInSource = options.optInSource ?? 'csv_import';
                }
                if (Object.keys(updateData).length > 0) {
                    await database_1.prisma.contact.update({ where: { id: existing.id }, data: updateData });
                }
                // Add new tags
                if (rowTags.length > 0) {
                    await database_1.prisma.contactTag.createMany({
                        data: rowTags.map((tag) => ({ contactId: existing.id, tag })),
                        skipDuplicates: true,
                    });
                }
                result.updated++;
                continue;
            }
            const contact = await database_1.prisma.contact.create({
                data: {
                    name: row.name || phone.e164,
                    phone: row.phone,
                    phoneNormalized,
                    email: row.email || null,
                    origin: row.origin || options.origin || 'csv_import',
                    notes: row.notes || null,
                    optIn: finalOptIn,
                    optInAt: finalOptIn ? (row.opt_in_at ? new Date(row.opt_in_at) : new Date()) : null,
                    optInSource: finalOptIn ? (options.optInSource ?? 'csv_import') : null,
                    customVariables,
                },
            });
            if (rowTags.length > 0) {
                await database_1.prisma.contactTag.createMany({
                    data: rowTags.map((tag) => ({ contactId: contact.id, tag })),
                    skipDuplicates: true,
                });
            }
            result.created++;
        }
        catch (err) {
            result.errors.push({
                row: rowNum,
                phone: row.phone,
                reason: err instanceof Error ? err.message : 'Unknown error',
            });
            result.skipped++;
        }
    }
    return result;
}
async function parseCsv(buffer) {
    return new Promise((resolve, reject) => {
        const rows = [];
        const stream = stream_1.Readable.from(buffer);
        stream
            .pipe((0, csv_parse_1.parse)({
            columns: true,
            skip_empty_lines: true,
            trim: true,
            bom: true,
        }))
            .on('data', (row) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}
//# sourceMappingURL=contacts.import.js.map