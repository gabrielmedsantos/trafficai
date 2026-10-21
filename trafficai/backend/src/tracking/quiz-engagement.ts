// Interesse observado na jornada; não é uma previsão de compra.
export function quizEngagementCte(scope: string): string {
    return `WITH progress AS (
        SELECT s.id,s.current_step,s.created_at,s.updated_at,s.completed_at,s.checkout_at,s.attribution,
            s.order_id,s.answers_encrypted,o.status AS payment_status,f.name,o.customer_name,o.customer_email,o.customer_phone,
            LEAST(100,CASE WHEN s.completed_at IS NOT NULL OR s.checkout_at IS NOT NULL THEN 100
                ELSE ROUND(100.0 * COALESCE(journey.done,0) / GREATEST(COALESCE(journey.finish,journey.total)-1,1)) END)::int AS progress_percent
        FROM tracking_quiz_sessions s JOIN tracking_quiz_funnels f ON f.id=s.funnel_id
        LEFT JOIN tracking_orders o ON o.id=s.order_id
        LEFT JOIN LATERAL (
            SELECT MAX(st.position) FILTER(WHERE st.step->>'id'=COALESCE(f.completed_step,f.checkout_step)) AS finish,
                COUNT(*) AS total,
                MAX(st.position) FILTER(WHERE EXISTS (
                    SELECT 1 FROM tracking_quiz_events e WHERE e.session_id=s.id AND e.step=st.step->>'id' AND e.kind='complete'
                )) AS done
            FROM jsonb_array_elements(f.steps) WITH ORDINALITY AS st(step,position)
            WHERE NOT(f.slug='mamae-quero-historinha' AND st.step->>'id'='redirect')
        ) journey ON TRUE WHERE ${scope}
    ), leads AS (
        SELECT progress.*, CASE
            WHEN payment_status='approved' THEN 'paid'
            WHEN payment_status IN ('refunded','chargeback','canceled') THEN 'closed'
            WHEN checkout_at IS NOT NULL OR completed_at IS NOT NULL OR progress_percent>=70 THEN 'hot'
            WHEN progress_percent>=30 THEN 'warm'
            ELSE 'cold' END AS interest
        FROM progress
    )`;
}
