import { query } from "../../database/connection";
import { UUID } from "./validation";
import { ValidationError } from "../../shared/errors";
export async function analytics(user: string, b: any) {
  const since = String(
      b.since || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10),
    ),
    until = String(b.until || new Date().toISOString().slice(0, 10));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(since) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
    !Number.isFinite(Date.parse(since)) ||
    !Number.isFinite(Date.parse(until)) ||
    since > until
  )
    throw new ValidationError("Período inválido");
  const product = UUID.test(String(b.product_id)) ? b.product_id : null,
    p = [user, since, until, product];
  const channels = await query(
    `SELECT m.channel,m.provider,COUNT(*)::int AS attempts,COUNT(*) FILTER(WHERE m.status IN ('sent','delivered','read'))::int AS sent,COUNT(*) FILTER(WHERE m.status IN ('delivered','read'))::int AS delivered,COUNT(*) FILTER(WHERE m.status='failed')::int AS failed,COUNT(*) FILTER(WHERE m.status='unknown')::int AS uncertain,COUNT(*) FILTER(WHERE m.opened_at IS NOT NULL)::int AS opened_signal,COUNT(*) FILTER(WHERE m.clicked_at IS NOT NULL OR EXISTS(SELECT 1 FROM aw_links l WHERE l.message_id=m.id AND l.kind='click' AND l.clicked_at IS NOT NULL))::int AS clicked,COUNT(*) FILTER(WHERE m.cost IS NULL AND m.status IN ('sent','delivered','read'))::int AS unknown_cost FROM aw_messages m JOIN aw_runs r ON r.id=m.run_id WHERE m.user_id=$1 AND r.test_mode=FALSE AND m.created_at>=$2::date AND m.created_at<$3::date+INTERVAL '1 day' AND ($4::uuid IS NULL OR r.product_id=$4) GROUP BY m.channel,m.provider ORDER BY m.channel,m.provider`,
    p,
  );
  const costs = await query(
    `SELECT m.currency,SUM(m.cost) AS amount,COUNT(*)::int AS priced_messages FROM aw_messages m JOIN aw_runs r ON r.id=m.run_id WHERE m.user_id=$1 AND r.test_mode=FALSE AND m.cost IS NOT NULL AND m.currency IS NOT NULL AND m.created_at>=$2::date AND m.created_at<$3::date+INTERVAL '1 day' AND ($4::uuid IS NULL OR r.product_id=$4) GROUP BY m.currency`,
    p,
  );
  const revenue = await query(
    `SELECT o.currency,COUNT(*)::int AS purchases,SUM(o.gross_value) AS attributed_revenue,SUM(o.gross_value) FILTER(WHERE a.recovered=TRUE) AS recovered_revenue FROM aw_attributions a JOIN aw_runs r ON r.id=a.run_id JOIN tracking_orders o ON o.id=a.order_id WHERE a.user_id=$1 AND r.test_mode=FALSE AND o.status='approved' AND a.created_at>=$2::date AND a.created_at<$3::date+INTERVAL '1 day' AND ($4::uuid IS NULL OR r.product_id=$4) GROUP BY o.currency`,
    p,
  );
  const flows = await query(
    `SELECT f.id,f.name,COUNT(*)::int AS executions,COUNT(*) FILTER(WHERE r.status='completed')::int AS completed,COUNT(*) FILTER(WHERE r.status IN ('failed','intervention'))::int AS needs_attention FROM aw_runs r JOIN aw_flows f ON f.id=r.flow_id WHERE r.user_id=$1 AND r.test_mode=FALSE AND r.created_at>=$2::date AND r.created_at<$3::date+INTERVAL '1 day' AND ($4::uuid IS NULL OR r.product_id=$4) GROUP BY f.id,f.name ORDER BY executions DESC LIMIT 100`,
    p,
  );
  return {
    since,
    until,
    channels,
    costs,
    revenue,
    flows,
    attribution_model:
      "Último clique rastreado com sessão exata devolvida no pedido",
    cost_note:
      "Somente custos confirmados. Ausência de custo não significa custo zero.",
  };
}
