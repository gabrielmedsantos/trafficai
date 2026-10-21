import { Router, raw } from "express";
import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "crypto";
import { queryOne, transaction } from "../../database/connection";
import { decrypt } from "../../shared/encryption";
import { UUID } from "./validation";
import { setConsent } from "./consent";
export async function recordReceipt(
  integrationId: string,
  owner: string,
  provider: string,
  externalId: string,
  providerId: string,
  kind: string,
) {
  return transaction(async (tx) => {
    await tx(
      "INSERT INTO aw_receipts(integration_id,external_id,provider,kind,user_id,provider_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [
        integrationId,
        externalId.slice(0, 240),
        provider,
        kind,
        owner,
        providerId,
      ],
    );
    const [receipt] = await tx(
      "SELECT * FROM aw_receipts WHERE integration_id=$1 AND external_id=$2 AND provider=$3 FOR UPDATE",
      [integrationId, externalId.slice(0, 240), provider],
    );
    if (receipt.processed_at) return true;
    const [m] = await tx(
      "SELECT * FROM aw_messages WHERE integration_id=$1 AND user_id=$2 AND provider_id=$3 AND provider=$4 FOR UPDATE",
      [integrationId, owner, providerId, provider],
    );
    if (!m) return true;
    await tx(
      "UPDATE aw_receipts SET message_id=$4,processed_at=NOW() WHERE integration_id=$1 AND external_id=$2 AND provider=$3",
      [integrationId, externalId.slice(0, 240), provider, m.id],
    );
    if (kind === "sent")
      await tx(
        "UPDATE aw_messages SET status='sent',sent_at=COALESCE(sent_at,NOW()) WHERE id=$1 AND status IN ('unknown','dispatching')",
        [m.id],
      );
    const delivered = ["delivered", "read"].includes(kind),
      read = kind === "read";
    if (delivered)
      await tx(
        "UPDATE aw_messages SET status=CASE WHEN status='read' OR $2 THEN 'read' ELSE 'delivered' END,delivered_at=COALESCE(delivered_at,NOW()),read_at=CASE WHEN $2 THEN COALESCE(read_at,NOW()) ELSE read_at END WHERE id=$1",
        [m.id, read],
      );
    if (kind === "opened" || kind === "clicked") {
      const col = kind === "opened" ? "opened_at" : "clicked_at";
      await tx(
        `UPDATE aw_messages SET ${col}=COALESCE(${col},NOW()) WHERE id=$1`,
        [m.id],
      );
    }
    if (["failed", "bounced", "complained"].includes(kind)) {
      await tx(
        "UPDATE aw_messages SET status=CASE WHEN status IN ('delivered','read') AND $2='failed' THEN status ELSE 'failed' END,error_code=$3 WHERE id=$1",
        [m.id, kind, "PROVIDER_" + kind.toUpperCase()],
      );
      if (["bounced", "complained"].includes(kind) && m.deal_id)
        await setConsent(tx, {
          userId: owner,
          dealId: m.deal_id,
          channel: m.channel,
          status: "opted_out",
          evidence: "Supressão automática: " + kind,
        });
    }
    return true;
  });
}
const safeEqual = (a: string, b: string) => {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
};
const router = Router();
router.post(
  "/resend/:id",
  raw({ type: "application/json", limit: "256kb" }),
  async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!UUID.test(id) || !Buffer.isBuffer(req.body)) {
        res.sendStatus(400);
        return;
      }
      const i = await queryOne<any>(
        "SELECT * FROM aw_integrations WHERE id=$1 AND provider='resend'",
        [id],
      );
      if (!i) {
        res.sendStatus(404);
        return;
      }
      const secret = JSON.parse(decrypt(i.credentials_encrypted));
      if (!secret.webhook_secret) {
        res.sendStatus(503);
        return;
      }
      let event: any;
      try {
        event = new Resend(secret.token).webhooks.verify({
          payload: req.body.toString("utf8"),
          headers: {
            id: String(req.headers["svix-id"] || ""),
            timestamp: String(req.headers["svix-timestamp"] || ""),
            signature: String(req.headers["svix-signature"] || ""),
          },
          webhookSecret: secret.webhook_secret,
        });
      } catch {
        res.sendStatus(401);
        return;
      }
      const kind = String(event.type || "").replace(/^email\./, "");
      await recordReceipt(
        id,
        i.user_id,
        "resend",
        String(req.headers["svix-id"]),
        String(event.data?.email_id || ""),
        kind,
      );
      res.json({ success: true });
    } catch {
      res.sendStatus(500);
    }
  },
);
router.post(
  "/twilio/:id",
  raw({ type: "application/x-www-form-urlencoded", limit: "128kb" }),
  async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!UUID.test(id) || !Buffer.isBuffer(req.body)) {
        res.sendStatus(400);
        return;
      }
      const i = await queryOne<any>(
        "SELECT * FROM aw_integrations WHERE id=$1 AND provider='twilio'",
        [id],
      );
      if (!i || !process.env.AUTOMATION_PUBLIC_BASE_URL) {
        res.sendStatus(503);
        return;
      }
      const s = JSON.parse(decrypt(i.credentials_encrypted)),
        params = new URLSearchParams(req.body.toString("utf8"));
      const base =
        process.env.AUTOMATION_PUBLIC_BASE_URL.replace(/\/$/, "") +
        "/automation-public/receipts/twilio/" +
        id;
      let signed = base;
      for (const key of [...new Set(params.keys())].sort())
        signed += key + params.get(key);
      const expected = createHmac("sha1", s.token)
        .update(signed)
        .digest("base64");
      if (
        !safeEqual(expected, String(req.headers["x-twilio-signature"] || ""))
      ) {
        res.sendStatus(401);
        return;
      }
      const sid = params.get("MessageSid") || "",
        status = params.get("MessageStatus") || "";
      await recordReceipt(
        id,
        i.user_id,
        "twilio",
        sid + ":" + status,
        sid,
        status === "undelivered" ? "failed" : status,
      );
      res.json({ success: true });
    } catch {
      res.sendStatus(500);
    }
  },
);
export const receiptController = router;

export async function reconcileReceipts() {
  const rows = await import("../../database/connection").then((c) =>
    c.query(
      "SELECT * FROM aw_receipts WHERE processed_at IS NULL AND created_at>NOW()-INTERVAL '7 days' ORDER BY created_at LIMIT 100",
    ),
  );
  for (const r of rows)
    await recordReceipt(
      r.integration_id,
      r.user_id,
      r.provider,
      r.external_id,
      r.provider_id,
      r.kind,
    );
}
