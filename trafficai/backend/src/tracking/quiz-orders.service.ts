import { query } from '../database/connection';

/** Liga apenas identificadores exatos, da mesma fonte, com uma única sessão candidata.
 * Nunca usa e-mail/nome para adivinhar qual criança pertence a um pedido. */
export async function linkQuizOrders(sourceId: string, orderId: string | null = null): Promise<number> {
    const rows = await query(`WITH candidates AS (
        SELECT o.id AS order_id,o.status,o.created_at,s.id AS session_id,
            COUNT(*) OVER (PARTITION BY o.id) AS matches
        FROM tracking_orders o
        JOIN tracking_quiz_funnels f ON f.source_id=o.source_id
        JOIN tracking_quiz_sessions s ON s.funnel_id=f.id
        CROSS JOIN LATERAL (SELECT COALESCE(
            NULLIF(o.raw->'TrackingParameters'->>'quiz_session_id',''),
            NULLIF(o.raw->'TrackingParameters'->>'s1',''),
            NULLIF(o.raw->'tracking'->>'quiz_session_id',''),
            NULLIF(o.raw->>'quiz_session_id','')) AS explicit_id) ref
        WHERE o.source_id=$1 AND ($2::uuid IS NULL OR o.id=$2::uuid)
          AND o.created_at>=s.created_at-INTERVAL '5 minutes'
          AND (CASE WHEN ref.explicit_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN s.id::text=LOWER(ref.explicit_id)
               ELSE o.sck IS NOT NULL AND (s.tracking_session_id=o.sck OR s.id::text=o.sck) END)
    ), ranked AS (
        SELECT *,ROW_NUMBER() OVER(PARTITION BY session_id ORDER BY
            CASE status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,created_at DESC,order_id) AS priority
        FROM candidates WHERE matches=1
    )
    UPDATE tracking_quiz_sessions s SET order_id=r.order_id
    FROM ranked r WHERE s.id=r.session_id AND r.priority=1
      AND (s.order_id IS NULL OR (r.status='approved' AND EXISTS(
          SELECT 1 FROM tracking_orders previous WHERE previous.id=s.order_id
          AND previous.status IN ('pending','abandoned','refused','canceled'))))
      AND s.order_id IS DISTINCT FROM r.order_id RETURNING s.id`,[sourceId,orderId]);
    return rows.length;
}
