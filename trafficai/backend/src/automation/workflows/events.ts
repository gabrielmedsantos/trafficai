import { attributeApproved } from "./links";
import { query, transaction } from "../../database/connection";
import { EVENTS, EventInput } from "./types";
import { UUID } from "./validation";
import { ValidationError } from "../../shared/errors";
import { reference } from "./repository";
export async function emitEvent(e: EventInput) {
  if (
    !EVENTS.includes(e.type as any) ||
    !e.externalId ||
    e.externalId.length > 200
  )
    throw new ValidationError("Evento inválido");
  await reference("tracking_sources", e.sourceId, e.userId);
  await reference("comm_deals", e.dealId, e.userId);
  await reference("aw_products", e.productId, e.userId);
  if (e.orderId) {
    if (!UUID.test(e.orderId)) throw new ValidationError("Pedido inválido");
    const rows = await query(
      "SELECT o.id FROM tracking_orders o JOIN tracking_sources s ON s.id=o.source_id WHERE o.id=$1 AND s.user_id=$2",
      [e.orderId, e.userId],
    );
    if (!rows.length) throw new ValidationError("Pedido não pertence à conta");
  }
  return (
    await query(
      "INSERT INTO aw_events(user_id,source_id,external_id,event_type,order_id,deal_id,product_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,external_id,event_type) DO UPDATE SET external_id=EXCLUDED.external_id RETURNING id",
      [
        e.userId,
        e.sourceId || null,
        e.externalId,
        e.type,
        e.orderId || null,
        e.dealId || null,
        e.productId || null,
        JSON.stringify(e.type==='quiz.abandoned'&&typeof e.payload?.quiz_session_id==='string'&&UUID.test(e.payload.quiz_session_id)
          ? {quiz_session_id:e.payload.quiz_session_id}:{}),
      ],
    )
  )[0];
}
export async function dispatchEvents(limit = 50) {
  return transaction(async (tx) => {
    const events = await tx(
      "SELECT * FROM aw_events WHERE dispatched_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1",
      [limit],
    );
    let count = 0;
    for (const e of events) {
      if (e.event_type === "payment.approved" && e.order_id) {
        await attributeApproved(tx, e);
        await tx(
          "UPDATE aw_runs SET status='canceled',finished_at=NOW(),updated_at=NOW() WHERE user_id=$1 AND (order_id=$2 OR (deal_id=$3 AND product_id=$4 AND $4::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM tracking_orders original JOIN tracking_orders paid ON paid.id=$2 WHERE original.id=aw_runs.order_id AND original.source_id=paid.source_id AND original.product_id IS NOT NULL AND original.product_id=paid.product_id))) AND recovery=TRUE AND status IN ('queued','running','waiting','blocked')",
          [e.user_id, e.order_id, e.deal_id, e.product_id],
        );
        await tx(
          "UPDATE aw_jobs SET status='canceled' WHERE run_id IN (SELECT id FROM aw_runs WHERE user_id=$1 AND (order_id=$2 OR (deal_id=$3 AND product_id=$4 AND $4::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM tracking_orders original JOIN tracking_orders paid ON paid.id=$2 WHERE original.id=aw_runs.order_id AND original.source_id=paid.source_id AND original.product_id IS NOT NULL AND original.product_id=paid.product_id))) AND recovery=TRUE AND status='canceled') AND status IN ('queued','waiting')",
          [e.user_id, e.order_id, e.deal_id, e.product_id],
        );
      }
      const flows = await tx(
        `SELECT f.*,v.graph AS version_graph,v.recovery AS version_recovery,v.product_id AS version_product FROM aw_flows f JOIN aw_versions v ON v.flow_id=f.id AND v.version=f.published_version WHERE f.user_id=$1 AND f.status='active' AND (v.source_id IS NULL OR v.source_id=$2) AND (v.product_id IS NULL OR v.product_id=$3)`,
        [e.user_id, e.source_id, e.product_id],
      );
      for (const f of flows) {
        const trigger = f.version_graph.nodes.find(
          (n: any) => n.type === "trigger",
        );
        if (trigger?.data.config.event !== e.event_type) continue;
        const runs = await tx(
          `INSERT INTO aw_runs(user_id,flow_id,version,event_id,order_id,deal_id,product_id,recovery,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(flow_id,version,event_id) DO NOTHING RETURNING id`,
          [
            e.user_id,
            f.id,
            f.published_version,
            e.id,
            e.order_id,
            e.deal_id,
            f.version_product || e.product_id,
            f.version_recovery,
            JSON.stringify(e.event_type==='quiz.abandoned'?e.payload||{}:{}),
          ],
        );
        if (runs.length) {
          await tx(
            "INSERT INTO aw_jobs(run_id,node_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [runs[0].id, trigger.id],
          );
          count++;
        }
      }
      await tx("UPDATE aw_events SET dispatched_at=NOW() WHERE id=$1", [e.id]);
    }
    return count;
  });
}
