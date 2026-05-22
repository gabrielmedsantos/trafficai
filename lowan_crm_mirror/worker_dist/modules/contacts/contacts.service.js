"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactsService = void 0;
const database_1 = require("../../config/database");
const phone_normalizer_1 = require("../../utils/phone.normalizer");
const common_types_1 = require("../../types/common.types");
const pagination_1 = require("../../utils/pagination");
class ContactsService {
    async list(input) {
        const { page, limit, skip } = (0, pagination_1.getPaginationParams)(input);
        const tags = input.tags ? input.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
        const where = {};
        if (input.search) {
            where.OR = [
                { name: { contains: input.search, mode: 'insensitive' } },
                { phoneNormalized: { contains: input.search.replace(/\D/g, '') } },
                { email: { contains: input.search, mode: 'insensitive' } },
            ];
        }
        if (input.optIn !== undefined)
            where.optIn = input.optIn;
        if (input.blacklisted !== undefined)
            where.isBlacklisted = input.blacklisted;
        if (input.origin)
            where.origin = input.origin;
        if (input.hasMessages === true)
            where.messages = { some: { status: { in: ['SENT', 'DELIVERED', 'READ', 'FAILED'] } } };
        if (input.hasMessages === false)
            where.messages = { none: { status: { in: ['SENT', 'DELIVERED', 'READ', 'FAILED'] } } };
        if (tags && tags.length > 0) {
            where.tags = { some: { tag: { in: tags } } };
        }
        const [data, total] = await Promise.all([
            database_1.prisma.contact.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    tags: { select: { tag: true } },
                    _count: {
                        select: {
                            messages: { where: { status: { in: ['SENT', 'DELIVERED', 'READ', 'FAILED'] } } },
                        },
                    },
                },
            }),
            database_1.prisma.contact.count({ where }),
        ]);
        const mapped = data.map((c) => ({
            ...c,
            tags: c.tags.map((t) => t.tag),
            messageCount: c._count.messages,
        }));
        return (0, pagination_1.paginate)(mapped, total, page, limit);
    }
    async exportAll(tags, search) {
        const tagList = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phoneNormalized: { contains: search.replace(/\D/g, '') } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (tagList && tagList.length > 0) {
            where.tags = { some: { tag: { in: tagList } } };
        }
        const data = await database_1.prisma.contact.findMany({
            where,
            orderBy: { name: 'asc' },
            select: {
                name: true,
                phone: true,
                email: true,
                optIn: true,
                origin: true,
                notes: true,
                tags: { select: { tag: true } },
            },
        });
        return data.map((c) => ({ ...c, tags: c.tags.map((t) => t.tag) }));
    }
    async getById(id) {
        const contact = await database_1.prisma.contact.findUnique({
            where: { id },
            include: { tags: { select: { tag: true } } },
        });
        if (!contact)
            throw common_types_1.HttpError.notFound('Contact not found');
        return { ...contact, tags: contact.tags.map((t) => t.tag) };
    }
    async create(input) {
        const phone = (0, phone_normalizer_1.normalizePhone)(input.phone);
        if (!phone.valid || !phone.normalized || !phone.e164) {
            throw common_types_1.HttpError.unprocessable(`Invalid phone number: ${phone.error}`, 'INVALID_PHONE');
        }
        const phoneNormalized = (0, phone_normalizer_1.canonicalBrazilianPhone)(input.phone);
        const variants = (0, phone_normalizer_1.brazilianPhoneVariants)(phoneNormalized);
        const existing = await database_1.prisma.contact.findFirst({
            where: { phoneNormalized: { in: variants } },
        });
        if (existing) {
            throw common_types_1.HttpError.conflict(`Contact with phone ${phone.e164} already exists`, 'DUPLICATE_CONTACT');
        }
        const contact = await database_1.prisma.contact.create({
            data: {
                name: input.name,
                phone: input.phone,
                phoneNormalized,
                email: input.email,
                origin: input.origin,
                notes: input.notes,
                optIn: input.optIn,
                optInAt: input.optIn ? (input.optInAt ? new Date(input.optInAt) : new Date()) : null,
                optInSource: input.optInSource,
                customVariables: input.customVariables,
                tags: {
                    createMany: {
                        data: input.tags.map((tag) => ({ tag })),
                        skipDuplicates: true,
                    },
                },
            },
            include: { tags: { select: { tag: true } } },
        });
        return { ...contact, tags: contact.tags.map((t) => t.tag) };
    }
    async update(id, input) {
        await this.getById(id);
        const data = {};
        if (input.name)
            data.name = input.name;
        if (input.email !== undefined)
            data.email = input.email;
        if (input.notes !== undefined)
            data.notes = input.notes;
        if (input.origin !== undefined)
            data.origin = input.origin;
        if (input.customVariables !== undefined)
            data.customVariables = input.customVariables;
        if (input.optIn !== undefined) {
            data.optIn = input.optIn;
            if (input.optIn) {
                data.optInAt = input.optInAt ? new Date(input.optInAt) : new Date();
                data.optInSource = input.optInSource;
            }
        }
        const updated = await database_1.prisma.contact.update({
            where: { id },
            data,
        });
        // Update tags if provided
        if (input.tags !== undefined) {
            await database_1.prisma.contactTag.deleteMany({ where: { contactId: id } });
            if (input.tags.length > 0) {
                await database_1.prisma.contactTag.createMany({
                    data: input.tags.map((tag) => ({ contactId: id, tag })),
                    skipDuplicates: true,
                });
            }
        }
        return this.getById(id);
    }
    async delete(id) {
        await this.getById(id);
        const hasMessages = await database_1.prisma.message.count({ where: { contactId: id } });
        if (hasMessages > 0) {
            throw common_types_1.HttpError.conflict('Cannot delete contact with message history. Blacklist it instead.', 'CONTACT_HAS_MESSAGES');
        }
        await database_1.prisma.contact.delete({ where: { id } });
    }
    async blacklist(id, input) {
        await this.getById(id);
        return database_1.prisma.contact.update({
            where: { id },
            data: {
                isBlacklisted: true,
                blacklistedAt: new Date(),
                blacklistReason: input.reason,
            },
            select: { id: true, isBlacklisted: true, blacklistedAt: true, blacklistReason: true },
        });
    }
    async removeFromBlacklist(id) {
        await this.getById(id);
        return database_1.prisma.contact.update({
            where: { id },
            data: {
                isBlacklisted: false,
                blacklistedAt: null,
                blacklistReason: null,
            },
            select: { id: true, isBlacklisted: true },
        });
    }
    async setOptIn(id, input) {
        await this.getById(id);
        return database_1.prisma.contact.update({
            where: { id },
            data: {
                optIn: true,
                optInAt: input.optInAt ? new Date(input.optInAt) : new Date(),
                optInSource: input.source,
            },
            select: { id: true, optIn: true, optInAt: true, optInSource: true },
        });
    }
    async setOptOut(id) {
        await this.getById(id);
        return database_1.prisma.contact.update({
            where: { id },
            data: { optIn: false },
            select: { id: true, optIn: true },
        });
    }
    async bulkOptIn(input) {
        const contactIds = await database_1.prisma.contactTag
            .findMany({ where: { tag: input.tag }, select: { contactId: true } })
            .then((rows) => rows.map((r) => r.contactId));
        if (contactIds.length === 0)
            return { updated: 0 };
        const result = await database_1.prisma.contact.updateMany({
            where: { id: { in: contactIds }, optIn: false },
            data: {
                optIn: true,
                optInAt: new Date(),
                optInSource: input.source ?? 'bulk_update',
            },
        });
        return { updated: result.count };
    }
    async getMessages(id) {
        await this.getById(id);
        const messages = await database_1.prisma.message.findMany({
            where: { contactId: id, status: { in: ['SENT', 'DELIVERED', 'READ', 'FAILED'] } },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
                id: true,
                status: true,
                sentAt: true,
                deliveredAt: true,
                readAt: true,
                failedAt: true,
                errorMessage: true,
                createdAt: true,
                campaign: { select: { id: true, name: true } },
                template: { select: { name: true } },
            },
        });
        return messages;
    }
    async getTags() {
        const tags = await database_1.prisma.contactTag.groupBy({
            by: ['tag'],
            _count: { tag: true },
            orderBy: { _count: { tag: 'desc' } },
        });
        return tags.map((t) => ({ tag: t.tag, count: t._count.tag }));
    }
}
exports.ContactsService = ContactsService;
//# sourceMappingURL=contacts.service.js.map