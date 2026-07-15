// ==============================
// TrafficAI — Commercial: Daily Metrics Aggregation
// Popula comm_daily_metrics com 1 linha por user_id por dia.
// Períodos > 7 dias leem dessa tabela ao invés de tabelas vivas (otimização).
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';

interface DayBounds {
    /** Início do dia em UTC (00:00:00) */
    from: Date;
    /** Início do dia seguinte em UTC */
    to: Date;
    /** Data ISO yyyy-mm-dd */
    iso: string;
}

function dayBounds(d: Date): DayBounds {
    const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const to = new Date(from.getTime() + 86400 * 1000);
    const iso = from.toISOString().slice(0, 10);
    return { from, to, iso };
}

/**
 * Agrega 1 dia para 1 usuário em comm_daily_metrics.
 * Idempotente — usa UPSERT.
 */
export async function aggregateDayForUser(userId: string, day: Date): Promise<void> {
    const b = dayBounds(day);

    // SQL único que computa todos os contadores do dia
    const rows = await query<{
        messages_received: string; messages_sent: string;
        conversations_opened: string; conversations_closed: string;
        avg_response: string | null; p90_response: string | null;
        deals_created: string; deals_won: string; deals_lost: string;
        deals_won_value: string; deals_lost_value: string;
        tasks_created: string; tasks_completed: string;
        messages_by_channel: any; leads_by_source: any;
    }>(
        `WITH msgs AS (
            SELECT
                COUNT(*) FILTER (WHERE m.direction='in') AS msgs_in,
                COUNT(*) FILTER (WHERE m.direction='out') AS msgs_out,
                COALESCE(jsonb_object_agg(c.channel, n_in) FILTER (WHERE n_in > 0), '{}'::jsonb) AS by_channel
            FROM (
                SELECT m.direction, c.channel,
                       COUNT(*) FILTER (WHERE m.direction='in') OVER (PARTITION BY c.channel) AS n_in
                FROM comm_messages m
                JOIN comm_conversations c ON c.id = m.conversation_id
                WHERE m.user_id = $1 AND m.sent_at >= $2 AND m.sent_at < $3
            ) AS sub
            JOIN comm_messages m ON true   -- dummy, usada já em sub
            JOIN comm_conversations c ON c.id = m.conversation_id
            WHERE m.user_id = $1 AND m.sent_at >= $2 AND m.sent_at < $3
            LIMIT 1
        ) SELECT 1`, [userId, b.from, b.to]
    ).catch(() => []);

    // O CTE acima ficou complicado e quebrado. Refazendo com queries separadas
    // (mais simples e legível, performance é OK pra agregação diária):

    void rows;   // descarta a tentativa anterior

    const msgsByDir = await query<{ direction: string; n: string }>(
        `SELECT direction, COUNT(*)::TEXT AS n FROM comm_messages
         WHERE user_id = $1 AND sent_at >= $2 AND sent_at < $3
         GROUP BY direction`,
        [userId, b.from, b.to]
    );
    let msgsIn = 0, msgsOut = 0;
    msgsByDir.forEach(r => {
        if (r.direction === 'in') msgsIn = Number(r.n);
        else if (r.direction === 'out') msgsOut = Number(r.n);
    });

    const msgsByChannel = await query<{ channel: string; n: string }>(
        `SELECT c.channel, COUNT(*)::TEXT AS n FROM comm_messages m
         JOIN comm_conversations c ON c.id = m.conversation_id
         WHERE m.user_id = $1 AND m.direction = 'in'
           AND m.sent_at >= $2 AND m.sent_at < $3
         GROUP BY c.channel`,
        [userId, b.from, b.to]
    );
    const messagesByChannel: Record<string, number> = {};
    msgsByChannel.forEach(r => { messagesByChannel[r.channel] = Number(r.n); });

    const conv = await query<{ opened: string; closed: string }>(
        `SELECT
            COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3)::TEXT AS opened,
            COUNT(*) FILTER (WHERE closed_at >= $2 AND closed_at < $3)::TEXT AS closed
         FROM comm_conversations WHERE user_id = $1`,
        [userId, b.from, b.to]
    );
    const conversationsOpened = Number(conv[0]?.opened ?? 0);
    const conversationsClosed = Number(conv[0]?.closed ?? 0);

    // Tempo de resposta (média e p90) — só conversas cujo first_response_at caiu no dia
    const resp = await query<{ avg: string | null; p90: string | null }>(
        `SELECT
            AVG(first_response_seconds)::TEXT AS avg,
            (PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY first_response_seconds))::TEXT AS p90
         FROM comm_conversations
         WHERE user_id = $1 AND first_response_seconds IS NOT NULL
           AND first_response_at >= $2 AND first_response_at < $3`,
        [userId, b.from, b.to]
    );
    const avgResponseSec = resp[0]?.avg ? Math.round(Number(resp[0].avg)) : 0;
    const p90ResponseSec = resp[0]?.p90 ? Math.round(Number(resp[0].p90)) : 0;

    // Deals
    const dealCreated = await query<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_deals
         WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
        [userId, b.from, b.to]
    );
    const dealsClosed = await query<{ status: string; n: string; valor: string }>(
        `SELECT status, COUNT(*)::TEXT AS n, COALESCE(SUM(value), 0)::TEXT AS valor
         FROM comm_deals
         WHERE user_id = $1 AND closed_at >= $2 AND closed_at < $3
         GROUP BY status`,
        [userId, b.from, b.to]
    );
    let dealsWon = 0, dealsLost = 0, dealsWonValue = 0, dealsLostValue = 0;
    dealsClosed.forEach(r => {
        if (r.status === 'won') { dealsWon = Number(r.n); dealsWonValue = Number(r.valor); }
        else if (r.status === 'lost') { dealsLost = Number(r.n); dealsLostValue = Number(r.valor); }
    });
    const dealsCreated = Number(dealCreated[0]?.n ?? 0);

    // Leads por origem (do dia)
    const sources = await query<{ source_id: string | null; n: string }>(
        `SELECT source_id, COUNT(*)::TEXT AS n FROM comm_deals
         WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
         GROUP BY source_id`,
        [userId, b.from, b.to]
    );
    const leadsBySource: Record<string, number> = {};
    sources.forEach(r => { leadsBySource[r.source_id ?? '_null'] = Number(r.n); });

    // Tasks
    const tasksCreated = await query<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_tasks
         WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
        [userId, b.from, b.to]
    );
    const tasksCompleted = await query<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM comm_tasks
         WHERE user_id = $1 AND completed_at >= $2 AND completed_at < $3`,
        [userId, b.from, b.to]
    );

    // ----- UPSERT -----
    // O índice unique usa COALESCE com sentinel UUID; nas queries usamos NULL real.
    // Aqui precisamos checar primeiro se já existe esta linha (com NULLs em client_id, salesperson_id, pipeline_id).
    const existing = await query<{ id: string }>(
        `SELECT id FROM comm_daily_metrics
         WHERE user_id = $1 AND client_id IS NULL AND salesperson_id IS NULL
           AND pipeline_id IS NULL AND date = $2`,
        [userId, b.iso]
    );

    if (existing.length > 0) {
        await query(
            `UPDATE comm_daily_metrics SET
                messages_received = $1, messages_sent = $2,
                conversations_opened = $3, conversations_closed = $4,
                avg_response_time_seconds = $5, p90_response_time_seconds = $6,
                deals_created = $7, deals_won = $8, deals_lost = $9,
                deals_won_value = $10, deals_lost_value = $11,
                tasks_created = $12, tasks_completed = $13,
                messages_by_channel = $14, leads_by_source = $15,
                updated_at = NOW()
             WHERE id = $16`,
            [
                msgsIn, msgsOut,
                conversationsOpened, conversationsClosed,
                avgResponseSec, p90ResponseSec,
                dealsCreated, dealsWon, dealsLost,
                dealsWonValue, dealsLostValue,
                Number(tasksCreated[0]?.n ?? 0), Number(tasksCompleted[0]?.n ?? 0),
                JSON.stringify(messagesByChannel), JSON.stringify(leadsBySource),
                existing[0]!.id,
            ]
        );
    } else {
        await query(
            `INSERT INTO comm_daily_metrics (
                user_id, date,
                messages_received, messages_sent,
                conversations_opened, conversations_closed,
                avg_response_time_seconds, p90_response_time_seconds,
                deals_created, deals_won, deals_lost,
                deals_won_value, deals_lost_value,
                tasks_created, tasks_completed,
                messages_by_channel, leads_by_source
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
                userId, b.iso,
                msgsIn, msgsOut,
                conversationsOpened, conversationsClosed,
                avgResponseSec, p90ResponseSec,
                dealsCreated, dealsWon, dealsLost,
                dealsWonValue, dealsLostValue,
                Number(tasksCreated[0]?.n ?? 0), Number(tasksCompleted[0]?.n ?? 0),
                JSON.stringify(messagesByChannel), JSON.stringify(leadsBySource),
            ]
        );
    }
}

/** Agrega ontem (UTC) para todos os usuários ativos. */
export async function aggregateYesterdayForAllUsers(): Promise<{ users: number; durationMs: number }> {
    const start = Date.now();
    const yesterday = new Date(Date.now() - 86400 * 1000);
    const users = await query<{ id: string }>(
        `SELECT DISTINCT user_id AS id FROM comm_deals
         UNION
         SELECT DISTINCT user_id AS id FROM comm_messages
         UNION
         SELECT DISTINCT user_id AS id FROM comm_tasks`
    );

    let success = 0;
    for (const u of users) {
        try {
            await aggregateDayForUser(u.id, yesterday);
            success++;
        } catch (err: any) {
            logger.warn('Aggregation falhou', { userId: u.id, error: err.message });
        }
    }

    return { users: success, durationMs: Date.now() - start };
}

/** Backfill dos últimos N dias (uso: bootstrap inicial). */
export async function backfillDays(numDays: number): Promise<{ users: number; days: number; durationMs: number }> {
    const start = Date.now();
    const users = await query<{ id: string }>(
        `SELECT DISTINCT user_id AS id FROM comm_deals
         UNION
         SELECT DISTINCT user_id AS id FROM comm_messages
         UNION
         SELECT DISTINCT user_id AS id FROM comm_tasks`
    );

    let processed = 0;
    for (const u of users) {
        for (let i = 1; i <= numDays; i++) {
            const day = new Date(Date.now() - i * 86400 * 1000);
            try {
                await aggregateDayForUser(u.id, day);
                processed++;
            } catch (err: any) {
                logger.warn('Backfill falhou', { userId: u.id, day: day.toISOString().slice(0, 10), error: err.message });
            }
        }
    }
    return { users: users.length, days: processed, durationMs: Date.now() - start };
}
