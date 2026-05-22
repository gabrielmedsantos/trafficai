"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignsService = void 0;
const client_1 = require("@prisma/client");
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const common_types_1 = require("../../types/common.types");
const pagination_1 = require("../../utils/pagination");
const logger_1 = require("../../config/logger");
// Lazy import to avoid circular deps — queue not initialized at module level
let campaignQueue = null;
async function getCampaignQueue() {
    if (!campaignQueue) {
        const { getQueue } = await Promise.resolve().then(() => __importStar(require('../../queue/queues')));
        campaignQueue = getQueue('campaign-runner');
    }
    return campaignQueue;
}
class CampaignsService {
    async list(input) {
        const { page, limit, skip } = (0, pagination_1.getPaginationParams)(input);
        const where = {};
        if (input.status)
            where.status = input.status;
        if (input.search) {
            where.OR = [
                { name: { contains: input.search, mode: 'insensitive' } },
                { description: { contains: input.search, mode: 'insensitive' } },
            ];
        }
        const [data, total] = await Promise.all([
            database_1.prisma.campaign.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    template: { select: { id: true, name: true, language: true, status: true } },
                    _count: { select: { campaignContacts: true } },
                },
            }),
            database_1.prisma.campaign.count({ where }),
        ]);
        const campaignIds = data.map((c) => c.id);
        // Compute real counts from CampaignContact statuses
        const contactCounts = await database_1.prisma.campaignContact.groupBy({
            by: ['campaignId', 'status'],
            where: { campaignId: { in: campaignIds } },
            _count: { status: true },
        });
        const countsByCampaign = new Map();
        for (const row of contactCounts) {
            if (!countsByCampaign.has(row.campaignId))
                countsByCampaign.set(row.campaignId, {});
            countsByCampaign.get(row.campaignId)[row.status] = row._count.status;
        }
        // Enrich campaigns with computed counts and pause reason
        const enriched = await Promise.all(data.map(async (c) => {
            const counts = countsByCampaign.get(c.id) ?? {};
            const sentCount = (counts['SENT'] ?? 0) + (counts['DELIVERED'] ?? 0) + (counts['READ'] ?? 0);
            const failedCount = counts['FAILED'] ?? 0;
            const deliveredCount = (counts['DELIVERED'] ?? 0) + (counts['READ'] ?? 0);
            const readCount = counts['READ'] ?? 0;
            const totalContacts = c._count.campaignContacts || c.totalContacts;
            const pauseReason = c.status === 'PAUSED'
                ? (await redis_1.redis.get(redis_1.RedisKeys.campaignPause(c.id))) ?? null
                : null;
            return { ...c, sentCount, failedCount, deliveredCount, readCount, totalContacts, pauseReason };
        }));
        return (0, pagination_1.paginate)(enriched, total, page, limit);
    }
    async getById(id) {
        const campaign = await database_1.prisma.campaign.findUnique({
            where: { id },
            include: {
                template: { select: { id: true, name: true, language: true, status: true, variablesCount: true } },
                runs: { orderBy: { runNumber: 'desc' }, take: 5 },
                _count: { select: { campaignContacts: true, messages: true } },
            },
        });
        if (!campaign)
            throw common_types_1.HttpError.notFound('Campaign not found');
        return campaign;
    }
    async create(input, userId) {
        const template = await database_1.prisma.template.findUnique({ where: { id: input.templateId } });
        if (!template)
            throw common_types_1.HttpError.notFound('Template not found');
        if (template.status !== 'APPROVED') {
            throw common_types_1.HttpError.unprocessable('Template must be APPROVED to create a campaign', 'TEMPLATE_NOT_APPROVED');
        }
        return database_1.prisma.campaign.create({
            data: {
                ...input,
                contactTags: input.contactTags,
                contactFilter: input.contactFilter,
                scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
                status: client_1.CampaignStatus.DRAFT,
                createdById: userId,
            },
        });
    }
    async update(id, input, userId) {
        const campaign = await this.getById(id);
        if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
            throw common_types_1.HttpError.conflict('Only DRAFT, SCHEDULED or PAUSED campaigns can be edited', 'CAMPAIGN_NOT_EDITABLE');
        }
        if (input.templateId && input.templateId !== campaign.templateId) {
            const template = await database_1.prisma.template.findUnique({ where: { id: input.templateId } });
            if (!template)
                throw common_types_1.HttpError.notFound('Template not found');
            if (template.status !== 'APPROVED') {
                throw common_types_1.HttpError.unprocessable('Template must be APPROVED', 'TEMPLATE_NOT_APPROVED');
            }
        }
        const data = {};
        if (input.name !== undefined)
            data.name = input.name;
        if (input.description !== undefined)
            data.description = input.description;
        if (input.templateId !== undefined)
            data.templateId = input.templateId;
        if (input.contactTags !== undefined)
            data.contactTags = input.contactTags;
        if (input.allowedConnectionIds !== undefined)
            data.allowedConnectionIds = input.allowedConnectionIds;
        if (input.contactFilter !== undefined)
            data.contactFilter = input.contactFilter;
        if (input.scheduledAt !== undefined)
            data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
        if (input.sendWindowStart !== undefined)
            data.sendWindowStart = input.sendWindowStart;
        if (input.sendWindowEnd !== undefined)
            data.sendWindowEnd = input.sendWindowEnd;
        if (input.timezone !== undefined)
            data.timezone = input.timezone;
        if (input.maxMessagesPerContact !== undefined)
            data.maxMessagesPerContact = input.maxMessagesPerContact;
        if (input.minIntervalSeconds !== undefined)
            data.minIntervalSeconds = input.minIntervalSeconds;
        if (input.maxIntervalSeconds !== undefined)
            data.maxIntervalSeconds = input.maxIntervalSeconds;
        return database_1.prisma.campaign.update({ where: { id }, data });
    }
    async delete(id) {
        const campaign = await this.getById(id);
        if (campaign.status === client_1.CampaignStatus.RUNNING) {
            throw common_types_1.HttpError.conflict('Cannot delete a running campaign. Pause it first.', 'CAMPAIGN_RUNNING');
        }
        // Remove campaign contacts and messages (cascade on contacts, but not messages)
        await database_1.prisma.campaignContact.deleteMany({ where: { campaignId: id } });
        await database_1.prisma.campaign.delete({ where: { id } });
    }
    async start(id, userId) {
        const campaign = await this.getById(id);
        if (![client_1.CampaignStatus.DRAFT, client_1.CampaignStatus.SCHEDULED, client_1.CampaignStatus.PAUSED].includes(campaign.status)) {
            throw common_types_1.HttpError.conflict(`Campaign cannot be started from status: ${campaign.status}`, 'INVALID_STATUS');
        }
        if (campaign.template.status !== 'APPROVED') {
            throw common_types_1.HttpError.unprocessable('Template must be APPROVED to start a campaign', 'TEMPLATE_NOT_APPROVED');
        }
        // Count eligible contacts
        const eligibleCount = await this.countEligibleContacts(campaign);
        if (eligibleCount === 0) {
            throw common_types_1.HttpError.unprocessable('No eligible contacts (must have opt_in=true, blacklisted=false)', 'NO_ELIGIBLE_CONTACTS');
        }
        // Get or create a campaign run
        const lastRun = await database_1.prisma.campaignRun.findFirst({
            where: { campaignId: id },
            orderBy: { runNumber: 'desc' },
        });
        const runNumber = (lastRun?.runNumber ?? 0) + 1;
        const run = await database_1.prisma.campaignRun.create({
            data: {
                campaignId: id,
                runNumber,
                status: 'RUNNING',
                triggeredById: userId,
                startedAt: new Date(),
            },
        });
        const isResume = campaign.status === client_1.CampaignStatus.PAUSED;
        await database_1.prisma.campaign.update({
            where: { id },
            data: {
                status: client_1.CampaignStatus.RUNNING,
                startedAt: new Date(),
                totalContacts: eligibleCount,
                ...((!isResume) && {
                    sentCount: 0,
                    failedCount: 0,
                    deliveredCount: 0,
                    readCount: 0,
                }),
            },
        });
        // Remove pause flag
        await redis_1.redis.del(redis_1.RedisKeys.campaignPause(id));
        // Enqueue the campaign runner job
        const queue = await getCampaignQueue();
        await queue.add(`campaign-${id}-run-${runNumber}`, { campaignId: id, campaignRunId: run.id, page: 0, pageSize: 100 }, { jobId: `campaign-${id}-run-${runNumber}-page-0` });
        logger_1.logger.info({ campaignId: id, runId: run.id, eligibleCount }, 'Campaign started');
        return { campaignId: id, runId: run.id, eligibleContacts: eligibleCount };
    }
    async pause(id) {
        const campaign = await this.getById(id);
        if (campaign.status !== client_1.CampaignStatus.RUNNING) {
            throw common_types_1.HttpError.conflict('Only RUNNING campaigns can be paused', 'INVALID_STATUS');
        }
        await database_1.prisma.campaign.update({ where: { id }, data: { status: client_1.CampaignStatus.PAUSED } });
        await redis_1.redis.set(redis_1.RedisKeys.campaignPause(id), '1');
        logger_1.logger.info({ campaignId: id }, 'Campaign paused');
        return { campaignId: id, status: client_1.CampaignStatus.PAUSED };
    }
    async resume(id, userId) {
        return this.start(id, userId);
    }
    async getStats(id) {
        await this.getById(id);
        const [campaign, statusBreakdown, topErrors] = await Promise.all([
            database_1.prisma.campaign.findUnique({
                where: { id },
                select: {
                    totalContacts: true,
                    sentCount: true,
                    deliveredCount: true,
                    readCount: true,
                    failedCount: true,
                    startedAt: true,
                    finishedAt: true,
                    status: true,
                },
            }),
            database_1.prisma.campaignContact.groupBy({
                by: ['status'],
                where: { campaignId: id },
                _count: { status: true },
            }),
            database_1.prisma.message.groupBy({
                by: ['errorCode'],
                where: { campaignId: id, errorCode: { not: null } },
                _count: { errorCode: true },
                orderBy: { _count: { errorCode: 'desc' } },
                take: 10,
            }),
        ]);
        return {
            ...campaign,
            statusBreakdown: Object.fromEntries(statusBreakdown.map((s) => [s.status, s._count.status])),
            topErrors: topErrors.map((e) => ({ code: e.errorCode, count: e._count.errorCode })),
        };
    }
    async getContacts(id, page, limit, status) {
        const where = { campaignId: id };
        if (status)
            where.status = status;
        const [data, total] = await Promise.all([
            database_1.prisma.campaignContact.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    status: true,
                    attemptCount: true,
                    lastAttemptAt: true,
                    skipReason: true,
                    contact: { select: { id: true, name: true, phone: true } },
                    message: { select: { status: true, wamid: true, errorMessage: true, errorCode: true, sentAt: true, deliveredAt: true, readAt: true } },
                },
            }),
            database_1.prisma.campaignContact.count({ where }),
        ]);
        return (0, pagination_1.paginate)(data, total, page, limit);
    }
    async countEligibleContacts(campaign) {
        const tags = campaign.contactTags;
        const where = {
            optIn: true,
            isBlacklisted: false,
        };
        if (tags && tags.length > 0) {
            where.tags = { some: { tag: { in: tags } } };
        }
        return database_1.prisma.contact.count({ where });
    }
}
exports.CampaignsService = CampaignsService;
//# sourceMappingURL=campaigns.service.js.map