import { setConsent } from "./consent";
import { randomBytes, randomUUID, createHash } from "crypto";
import { Router } from "express";
import { query, transaction } from "../../database/connection";
import { Query } from "./types";
import { httpsUrl, escapeHtml } from "./validation";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function createLink(
  tx: Query,
  input: {
    userId: string;
    runId: string;
    messageId: string;
    dealId: string;
    channel: string;
    kind: "click" | "unsubscribe";
    url?: string;
  },
) {
  const base = process.env.AUTOMATION_PUBLIC_BASE_URL;
  if (!base) throw Error("PUBLIC_LINK_BASE_MISSING");
  const root = new URL(httpsUrl(base));
  const token = randomBytes(32).toString("hex"),
    tracking = randomUUID();
  let destination: string | null = null;
  if (input.url) {
    const u = new URL(httpsUrl(input.url));
    u.searchParams.set("sck", tracking);
    destination = u.href;
  }
  await tx(
    `INSERT INTO aw_links(token_hash,user_id,run_id,message_id,deal_id,channel,kind,url,tracking_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()+CASE WHEN $7='unsubscribe' THEN INTERVAL '10 years' ELSE INTERVAL '30 days' END)`,
    [
      hash(token),
      input.userId,
      input.runId,
      input.messageId,
      input.dealId,
      input.channel,
      input.kind,
      destination,
      tracking,
    ],
  );
  return (
    root.origin +
    root.pathname.replace(/\/$/, "") +
    "/automation-public/" +
    (input.kind === "click" ? "c/" : "u/") +
    token
  );
}
const router = Router();
const valid = (s: string) => /^[a-f0-9]{64}$/.test(s);
const page = (text: string, form = "") =>
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Preferências de mensagens</title><body style="font:16px system-ui;background:#101216;color:#f1f3f5;padding:10vh 24px"><main style="max-width:500px;margin:auto"><h1>Preferências de mensagens</h1><p>' +
  escapeHtml(text) +
  "</p>" +
  form +
  "</main></body></html>";
router.get("/c/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token);
    if (!valid(token)) {
      res.sendStatus(404);
      return;
    }
    const [link] = await query(
      `UPDATE aw_links SET clicked_at=COALESCE(clicked_at,NOW()) WHERE token_hash=$1 AND kind='click' AND expires_at>NOW() RETURNING url`,
      [hash(token)],
    );
    if (!link) {
      res.sendStatus(404);
      return;
    }
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, httpsUrl(link.url));
  } catch (e) {
    next(e);
  }
});
router.get("/u/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token);
    const rows = valid(token)
      ? await query(
          "SELECT channel FROM aw_links WHERE token_hash=$1 AND kind='unsubscribe' AND expires_at>NOW()",
          [hash(token)],
        )
      : [];
    if (!rows.length) {
      res.status(404).send(page("Link inválido ou expirado."));
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    res.send(
      page(
        "Deseja parar de receber mensagens deste remetente neste canal?",
        '<form method="post"><button style="padding:14px 20px">Confirmar descadastro</button></form>',
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.post("/u/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token);
    if (!valid(token)) {
      res.sendStatus(404);
      return;
    }
    const ok = await transaction(async (tx) => {
      const [l] = await tx(
        "SELECT * FROM aw_links WHERE token_hash=$1 AND kind='unsubscribe' AND expires_at>NOW() FOR UPDATE",
        [hash(token)],
      );
      if (!l?.deal_id) return false;
      await setConsent(tx, {
        userId: l.user_id,
        dealId: l.deal_id,
        channel: l.channel,
        status: "opted_out",
        evidence: "Descadastro pelo destinatário",
      });
      return true;
    });
    res
      .status(ok ? 200 : 404)
      .send(
        page(
          ok
            ? "Descadastro confirmado. Você não receberá novas mensagens neste canal."
            : "Link inválido ou expirado.",
        ),
      );
  } catch (e) {
    next(e);
  }
});
export const workflowPublicController = router;
export async function attributeApproved(tx: Query, event: any) {
  if (!event.order_id) return;
  const [o] = await tx("SELECT * FROM tracking_orders WHERE id=$1", [
    event.order_id,
  ]);
  if (!o || o.status !== "approved" || !o.sck) return;
  await tx(
    `INSERT INTO aw_attributions(order_id,user_id,run_id,message_id,model,window_hours,recovered)
 SELECT $1,l.user_id,l.run_id,l.message_id,'last_verified_click',LEAST(720,GREATEST(1,COALESCE((v.settings->>'attribution_hours')::int,72))),r.recovery
 FROM aw_links l JOIN aw_runs r ON r.id=l.run_id JOIN aw_versions v ON v.flow_id=r.flow_id AND v.version=r.version JOIN aw_messages m ON m.id=l.message_id
 WHERE l.user_id=$2 AND l.tracking_id::text=$3 AND l.kind='click' AND l.clicked_at IS NOT NULL AND r.test_mode=FALSE AND m.status IN ('sent','delivered','read')
 AND l.clicked_at>=NOW()-LEAST(720,GREATEST(1,COALESCE((v.settings->>'attribution_hours')::int,72)))*INTERVAL '1 hour'
 AND (v.source_id IS NULL OR v.source_id=$4) AND (v.product_id IS NULL OR v.product_id=$5) AND l.expires_at>NOW()
 ORDER BY l.clicked_at DESC LIMIT 1 ON CONFLICT(order_id) DO NOTHING`,
    [o.id, event.user_id, o.sck, o.source_id, event.product_id],
  );
}
