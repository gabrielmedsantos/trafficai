"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
class DashboardService {
    async getOverview(filter = {}) {
        const dateWhere = buildDateWhere(filter);
        const [totalConnections, activeConnections, totalContacts, optInContacts, blacklistedContacts, totalCampaigns, campaignsByStatus, messageStats, topErrors,] = await Promise.all([
            database_1.prisma.whatsappConnection.count(),
            database_1.prisma.whatsappConnection.count({ where: { status: 'ACTIVE' } }),
            database_1.prisma.contact.count(),
            database_1.prisma.contact.count({ where: { optIn: true } }),
            database_1.prisma.contact.count({ where: { isBlacklisted: true } }),
            database_1.prisma.campaign.count(),
            database_1.prisma.campaign.groupBy({
                by: ['status'],
                _count: { status: true },
            }),
            database_1.prisma.message.groupBy({
                by: ['status'],
                where: { direction: 'OUTBOUND', ...dateWhere },
                _count: { status: true },
            }),
            database_1.prisma.message.groupBy({
                by: ['errorCode'],
                where: { status: 'FAILED', errorCode: { not: null }, ...dateWhere },
                _count: { errorCode: true },
                orderBy: { _count: { errorCode: 'desc' } },
                take: 10,
            }),
        ]);
        const msgMap = Object.fromEntries(messageStats.map((s) => [s.status, s._count.status]));
        const campMap = Object.fromEntries(campaignsByStatus.map((s) => [s.status, s._count.status]));
        const totalMessages = Object.values(msgMap).reduce((a, b) => a + b, 0);
        const delivered = msgMap['DELIVERED'] ?? 0;
        const read = msgMap['READ'] ?? 0;
        const failed = msgMap['FAILED'] ?? 0;
        const sent = msgMap['SENT'] ?? 0;
        return {
            connections: {
                total: totalConnections,
                active: activeConnections,
                inactive: totalConnections - activeConnections,
            },
            contacts: {
                total: totalContacts,
                optIn: optInContacts,
                blacklisted: blacklistedContacts,
            },
            campaigns: {
                total: totalCampaigns,
                byStatus: campMap,
            },
            messages: {
                total: totalMessages,
                sent,
                delivered,
                read,
                failed,
                deliveryRate: totalMessages > 0 ? ((delivered + read) / totalMessages * 100).toFixed(1) : '0',
                readRate: delivered + read > 0 ? (read / (delivered + read) * 100).toFixed(1) : '0',
            },
            topErrors: topErrors.map((e) => ({ code: e.errorCode, count: e._count.errorCode })),
        };
    }
    async getConnectionsStats(filter = {}) {
        const dateWhere = buildDateWhere(filter);
        const connections = await database_1.prisma.whatsappConnection.findMany({
            select: {
                id: true,
                name: true,
                phoneNumberId: true,
                status: true,
                healthScore: true,
                priority: true,
                rateLimitPerMinute: true,
                rateLimitPerDay: true,
                messagesSentToday: true,
                metaQualityRating: true,
            },
            orderBy: { priority: 'desc' },
        });
        const stats = await Promise.all(connections.map(async (conn) => {
            const [msgStats, sentMin, sentDay, queuePending] = await Promise.all([
                database_1.prisma.message.groupBy({
                    by: ['status'],
                    where: { connectionId: conn.id, direction: 'OUTBOUND', ...dateWhere },
                    _count: { status: true },
                }),
                redis_1.redis.get(redis_1.RedisKeys.rateConnMin(conn.id)),
                redis_1.redis.get(redis_1.RedisKeys.rateConnDay(conn.id)),
                redis_1.redis.get(redis_1.RedisKeys.queuePending(conn.id)),
            ]);
            const msgMap = Object.fromEntries(msgStats.map((s) => [s.status, s._count.status]));
            const total = Object.values(msgMap).reduce((a, b) => a + b, 0);
            const delivered = (msgMap['DELIVERED'] ?? 0) + (msgMap['READ'] ?? 0);
            return {
                ...conn,
                stats: {
                    totalMessages: total,
                    sent: msgMap['SENT'] ?? 0,
                    delivered: msgMap['DELIVERED'] ?? 0,
                    read: msgMap['READ'] ?? 0,
                    failed: msgMap['FAILED'] ?? 0,
                    deliveryRate: total > 0 ? (delivered / total * 100).toFixed(1) : '0',
                },
                realtime: {
                    sentThisMinute: parseInt(sentMin ?? '0'),
                    sentToday: parseInt(sentDay ?? '0'),
                    queuePending: parseInt(queuePending ?? '0'),
                },
            };
        }));
        return stats;
    }
    async getCampaignStats(campaignId, filter = {}) {
        const dateWhere = buildDateWhere(filter);
        const [campaign, statusBreakdown, timelineRaw, topErrors] = await Promise.all([
            database_1.prisma.campaign.findUnique({
                where: { id: campaignId },
                select: {
                    id: true, name: true, status: true,
                    totalContacts: true, sentCount: true,
                    deliveredCount: true, readCount: true, failedCount: true,
                    startedAt: true, finishedAt: true,
                },
            }),
            database_1.prisma.campaignContact.groupBy({
                by: ['status'],
                where: { campaignId },
                _count: { status: true },
            }),
            // Mensagens por hora para gráfico de throughput
            database_1.prisma.$queryRaw `
        SELECT date_trunc('hour', sent_at) as hour, COUNT(*) as count
        FROM messages
        WHERE campaign_id = ${campaignId}
          AND sent_at IS NOT NULL
        GROUP BY 1
        ORDER BY 1
      `,
            database_1.prisma.message.groupBy({
                by: ['errorCode'],
                where: { campaignId, errorCode: { not: null } },
                _count: { errorCode: true },
                orderBy: { _count: { errorCode: 'desc' } },
                take: 10,
            }),
        ]);
        if (!campaign)
            return null;
        return {
            ...campaign,
            statusBreakdown: Object.fromEntries(statusBreakdown.map((s) => [s.status, s._count.status])),
            throughputTimeline: timelineRaw.map((r) => ({
                hour: r.hour,
                count: Number(r.count),
            })),
            topErrors: topErrors.map((e) => ({ code: e.errorCode, count: e._count.errorCode })),
        };
    }
    async getThroughput(filter = {}) {
        const dateWhere = buildDateWhere(filter);
        const byConnection = await database_1.prisma.message.groupBy({
            by: ['connectionId'],
            where: { direction: 'OUTBOUND', ...dateWhere },
            _count: { connectionId: true },
            orderBy: { _count: { connectionId: 'desc' } },
        });
        const enriched = await Promise.all(byConnection.map(async (item) => {
            const conn = await database_1.prisma.whatsappConnection.findUnique({
                where: { id: item.connectionId },
                select: { name: true, phoneNumberId: true },
            });
            return {
                connectionId: item.connectionId,
                name: conn?.name ?? 'Unknown',
                phoneNumberId: conn?.phoneNumberId ?? '',
                messageCount: item._count.connectionId,
            };
        }));
        return enriched;
    }
}
exports.DashboardService = DashboardService;
function buildDateWhere(filter) {
    if (!filter.from && !filter.to)
        return {};
    const createdAt = {};
    if (filter.from)
        createdAt.gte = new Date(filter.from);
    if (filter.to)
        createdAt.lte = new Date(filter.to);
    return { createdAt };
}
//# sourceMappingURL=dashboard.service.js.map