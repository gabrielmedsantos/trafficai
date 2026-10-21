import { query, queryOne } from "../../database/connection";
import { whatsappSettings } from "./whatsapp";
import { pinnedRequest } from "./providers";
import { recordReceipt } from "./receipts";
export function extractWhatsAppStatus(
  provider: string,
  result: any,
  id: string,
  lookupId: string,
): string | null {
  const rows =
    provider === "whatsapp_uazapi"
      ? result?.messages
      : Array.isArray(result)
        ? result
        : result?.messages?.records || result?.records || [];
  if (!Array.isArray(rows)) return null;
  const item = rows.find((m: any) =>
    provider === "whatsapp_uazapi"
      ? m.id === lookupId &&
        (id === lookupId || !m.messageid || m.messageid === id)
      : m.key?.id === id,
  );
  if (!item) return null;
  const statuses =
    provider === "whatsapp_uazapi"
      ? [item.status]
      : [item.status, ...(item.MessageUpdate || []).map((s: any) => s.status)];
  const values = statuses.map((v: any) => String(v || "").toUpperCase());
  if (values.some((v) => ["READ", "PLAYED"].includes(v))) return "read";
  if (values.some((v) => ["DELIVERED", "DELIVERY_ACK"].includes(v)))
    return "delivered";
  if (values.some((v) => ["FAILED", "ERROR", "CANCELED"].includes(v)))
    return "failed";
  if (values.some((v) => ["SENT", "SERVER_ACK"].includes(v))) return "sent";
  return null;
}
export async function pollWhatsAppStatuses(request = pinnedRequest) {
  const messages = await query(
    `UPDATE aw_messages SET receipt_checked_at=NOW() WHERE id IN (SELECT m.id FROM aw_messages m JOIN aw_runs r ON r.id=m.run_id WHERE r.test_mode=FALSE AND m.provider IN ('whatsapp_evolution','whatsapp_uazapi') AND m.provider_id IS NOT NULL AND m.status IN ('sent','delivered','unknown') AND m.created_at>NOW()-INTERVAL '7 days' AND (m.receipt_checked_at IS NULL OR m.receipt_checked_at<NOW()-INTERVAL '5 minutes') ORDER BY m.receipt_checked_at NULLS FIRST LIMIT 5 FOR UPDATE OF m SKIP LOCKED) RETURNING *`,
  );
  await Promise.allSettled(
    messages.map(async (m) => {
      try {
        const i = await queryOne<any>(
          "SELECT * FROM comm_integrations WHERE id=$1 AND user_id=$2",
          [m.integration_id, m.user_id],
        );
        const c = whatsappSettings(i),
          evolution = c.provider === "whatsapp_evolution",
          lookup = m.provider_reference?.lookup_id || m.provider_id;
        if (c.provider !== m.provider) throw Error("PROVIDER_CHANGED");
        const result = await request(
          c.base +
            (evolution
              ? "/chat/findMessages/" + encodeURIComponent(c.instance)
              : "/message/find"),
          evolution
            ? { where: { key: { id: m.provider_id } }, limit: 1 }
            : { id: lookup, limit: 1 },
          evolution ? { apikey: c.key } : { token: c.key },
          c.trustedBase,
        );
        const status = extractWhatsAppStatus(
          m.provider,
          result,
          m.provider_id,
          lookup,
        );
        if (status)
          await recordReceipt(
            m.integration_id,
            m.user_id,
            m.provider,
            "poll:" + m.provider_id + ":" + status,
            m.provider_id,
            status,
          );
        await query("UPDATE aw_messages SET receipt_error=NULL WHERE id=$1", [
          m.id,
        ]);
      } catch {
        await query(
          "UPDATE aw_messages SET receipt_error='STATUS_LOOKUP_UNAVAILABLE' WHERE id=$1",
          [m.id],
        );
      }
    }),
  );
}
