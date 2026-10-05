// ==============================
// TrafficAI — Behavior Insights Service
// Agrega dados de cliques e scroll para heatmaps e análise de engajamento
// ==============================

import { query, queryOne } from '../database/connection';
import { logger } from '../shared/logger';

export interface ClickPoint {
    x: number; // Percentual 0-100 da largura
    y: number; // Percentual 0-100 da altura
    selector?: string; // Seletor CSS simplificado do elemento
    text?: string; // Texto do elemento (limitado)
    timestamp: number;
}

export interface ScrollDepth {
    max_depth: number; // 0-100%
    time_on_page: number; // segundos
    timestamp: number;
}

/**
 * Salva um clique capturado pelo pixel
 */
export async function saveClick(
    sourceId: string,
    sessionId: string,
    url: string,
    point: ClickPoint
): Promise<void> {
    try {
        await query(
            `INSERT INTO tracking_behavior_clicks (source_id, session_id, url, x_pct, y_pct, selector, element_text, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [sourceId, sessionId, url, point.x, point.y, point.selector || null, point.text?.slice(0, 100) || null]
        );
    } catch (err: any) {
        // Tabela pode não existir ainda — log warning mas não quebra o tracking
        logger.warn('behavior: falha ao salvar clique', { error: err.message });
    }
}

/**
 * Salva/atualiza profundidade de scroll da sessão
 */
export async function saveScrollDepth(
    sourceId: string,
    sessionId: string,
    url: string,
    depth: number,
    timeOnPage: number
): Promise<void> {
    try {
        // Upsert: atualiza se já existe registro pra essa sessão+url, senão insere
        await query(
            `INSERT INTO tracking_behavior_scroll (source_id, session_id, url, max_depth, time_on_page, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (source_id, session_id, url)
             DO UPDATE SET
                max_depth = GREATEST(tracking_behavior_scroll.max_depth, EXCLUDED.max_depth),
                time_on_page = GREATEST(tracking_behavior_scroll.time_on_page, EXCLUDED.time_on_page),
                updated_at = NOW()`,
            [sourceId, sessionId, url, depth, timeOnPage]
        );
    } catch (err: any) {
        logger.warn('behavior: falha ao salvar scroll', { error: err.message });
    }
}

/**
 * Retorna heatmap data agregado por URL
 */
export async function getHeatmapData(
    sourceId: string,
    url: string,
    since?: string
): Promise<{ clicks: Array<{ x: number; y: number; count: number }>; total_sessions: number }> {
    const sinceClause = since ? `AND created_at >= $3` : '';
    const params: any[] = [sourceId, url];
    if (since) params.push(since);

    // Agrega cliques em grid de 20x20 (5% de resolução) para reduzir payload
    const clicks = await query<{ x_bin: number; y_bin: number; count: string }>(
        `SELECT
            FLOOR(x_pct / 5) * 5 AS x_bin,
            FLOOR(y_pct / 5) * 5 AS y_bin,
            COUNT(*)::text AS count
         FROM tracking_behavior_clicks
         WHERE source_id = $1 AND url = $2 ${sinceClause}
         GROUP BY x_bin, y_bin
         ORDER BY count DESC
         LIMIT 500`,
        params
    );

    const sessions = await queryOne<{ count: string }>(
        `SELECT COUNT(DISTINCT session_id)::text AS count
         FROM tracking_behavior_clicks
         WHERE source_id = $1 AND url = $2 ${sinceClause}`,
        params
    );

    return {
        clicks: clicks.map(c => ({ x: c.x_bin, y: c.y_bin, count: Number(c.count) })),
        total_sessions: Number(sessions?.count || 0),
    };
}

/**
 * Retorna análise de scroll depth por URL
 */
export async function getScrollAnalysis(
    sourceId: string,
    url: string,
    since?: string
): Promise<{ avg_depth: number; median_depth: number; drop_off_points: number[]; total_sessions: number }> {
    const sinceClause = since ? `AND updated_at >= $3` : '';
    const params: any[] = [sourceId, url];
    if (since) params.push(since);

    const stats = await queryOne<{ avg_depth: string; total: string }>(
        `SELECT
            AVG(max_depth)::text AS avg_depth,
            COUNT(*)::text AS total
         FROM tracking_behavior_scroll
         WHERE source_id = $1 AND url = $2 ${sinceClause}`,
        params
    );

    // Calcula percentis para encontrar drop-off points
    const depths = await query<{ depth: number }>(
        `SELECT max_depth AS depth
         FROM tracking_behavior_scroll
         WHERE source_id = $1 AND url = $2 ${sinceClause}
         ORDER BY max_depth ASC`,
        params
    );

    const depthValues = depths.map(d => d.depth);
    const median = depthValues.length > 0 ? depthValues[Math.floor(depthValues.length / 2)] : 0;

    // Identifica onde 25%, 50%, 75% dos usuários abandonam
    const drop_off_points = [
        depthValues[Math.floor(depthValues.length * 0.25)] || 0,
        depthValues[Math.floor(depthValues.length * 0.5)] || 0,
        depthValues[Math.floor(depthValues.length * 0.75)] || 0,
    ];

    return {
        avg_depth: Number(stats?.avg_depth || 0),
        median_depth: median,
        drop_off_points,
        total_sessions: Number(stats?.total || 0),
    };
}

/**
 * Lista URLs mais visitadas para seleção no dashboard
 */
export async function getTopUrls(
    sourceId: string,
    limit: number = 10,
    since?: string
): Promise<Array<{ url: string; sessions: number; avg_depth: number }>> {
    const sinceClause = since ? `AND s.updated_at >= $3` : '';
    const params: any[] = [sourceId, limit];
    if (since) params.push(since);

    const urls = await query<{ url: string; sessions: string; avg_depth: string }>(
        `SELECT
            s.url,
            COUNT(DISTINCT s.session_id)::text AS sessions,
            AVG(s.max_depth)::text AS avg_depth
         FROM tracking_behavior_scroll s
         WHERE s.source_id = $1 ${sinceClause}
         GROUP BY s.url
         ORDER BY sessions DESC
         LIMIT $2`,
        params
    );

    return urls.map(u => ({
        url: u.url,
        sessions: Number(u.sessions),
        avg_depth: Number(u.avg_depth) || 0,
    }));
}