import {hasJourneyPurchase} from '../../tracking/journey-purchases';
import { executeExternal } from "./external";
import { query } from "../../database/connection";
import { destinationHash } from "./consent";
import { createLink } from "./links";
import { randomUUID } from "crypto";
import { purchaseTag, salesTag, promotionProduct } from "./purchase-target";
import { transaction } from "../../database/connection";
import { Job, Graph, Query } from "./types";
import { renderVariables, emailHtml, escapeHtml } from "./validation";
import { send, ProviderError, SendInput } from "./providers";

export function conditionMatches(config: any, context: any): boolean {
  switch (config.kind) {
    case "order_status":
      return context.order?.status === config.value;
    case "has_tag":
      return context.tags.includes(salesTag(String(config.value || ""), context.product, context.promotion));
    case "field_equals":
      return (
        ["contact_name", "title", "status"].includes(config.field) &&
        context.deal?.[config.field] === config.value
      );
    case "channel_available":
      return !!(config.value === "email"
        ? context.deal?.contact_email
        : context.deal?.contact_phone);
    case "message_clicked":
      return context.clicked;
    case "message_delivered":
      return context.delivered;
    case "message_sent":
      return context.sent > 0;
    default:
      throw new ProviderError("CONDITION_INVALID");
  }
}
export function isSendWindow(settings: any, date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.time_zone || "America/Fortaleza",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.find((p) => p.type === "weekday")!.value,
  );
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return (
    (settings.days || [1, 2, 3, 4, 5, 6]).includes(day) &&
    hour >= (settings.allowed_start ?? 8) &&
    hour < (settings.allowed_end ?? 20)
  );
}
export async function claimJob(): Promise<Job | null> {
  return transaction(async (tx) => {
    // A leased external action can have succeeded before a crash. Never blindly resend it.
    await tx(
      `UPDATE aw_messages m SET status='unknown',error_code='WORKER_INTERRUPTED' FROM aw_jobs j WHERE m.run_id=j.run_id AND m.node_id=j.node_id AND m.status='dispatching' AND j.status='running' AND j.locked_until<NOW()`,
    );
    await tx(
      `UPDATE aw_jobs j SET status='intervention',locked_until=NULL WHERE j.status='running' AND j.locked_until<NOW() AND (EXISTS(SELECT 1 FROM aw_messages m WHERE m.run_id=j.run_id AND m.node_id=j.node_id AND m.status='unknown') OR EXISTS(SELECT 1 FROM aw_runs r JOIN aw_versions v ON v.flow_id=r.flow_id AND v.version=r.version CROSS JOIN LATERAL jsonb_array_elements(v.graph->'nodes') n WHERE r.id=j.run_id AND r.test_mode=FALSE AND n->>'id'=j.node_id AND n->>'type' IN ('message','agent','webhook')))`,
    );
    await tx(
      `UPDATE aw_runs r SET status='intervention',updated_at=NOW() WHERE EXISTS(SELECT 1 FROM aw_jobs j WHERE j.run_id=r.id AND j.status='intervention') AND r.status NOT IN ('canceled','completed')`,
    );
    await tx(
      "UPDATE aw_steps s SET status='intervention',error_code='WORKER_INTERRUPTED',finished_at=NOW() FROM aw_jobs j WHERE s.run_id=j.run_id AND s.node_id=j.node_id AND s.attempt=j.attempts AND s.status='running' AND j.status='intervention'",
    );
    await tx(
      "UPDATE aw_steps s SET status='interrupted',error_code='LEASE_EXPIRED',finished_at=NOW() FROM aw_jobs j WHERE s.run_id=j.run_id AND s.node_id=j.node_id AND s.attempt=j.attempts AND s.status='running' AND j.status='running' AND j.locked_until<NOW()",
    );
    await tx(
      "UPDATE aw_jobs SET status='failed',locked_until=NULL WHERE status='running' AND locked_until<NOW() AND attempts>=max_attempts",
    );
    await tx(
      "UPDATE aw_runs r SET status='failed',finished_at=NOW() WHERE status NOT IN ('canceled','completed','intervention') AND EXISTS(SELECT 1 FROM aw_jobs j WHERE j.run_id=r.id AND j.status='failed')",
    );
    const rows = await tx(
      `SELECT j.* FROM aw_jobs j JOIN aw_runs r ON r.id=j.run_id JOIN aw_flows f ON f.id=r.flow_id WHERE (j.status IN ('queued','waiting') OR (j.status='running' AND j.locked_until<NOW())) AND j.due_at<=NOW() AND r.status IN ('queued','running','waiting') AND (f.status='active' OR r.test_mode=TRUE) ORDER BY j.due_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
    );
    if (!rows.length) return null;
    const j = rows[0],
      lease = randomUUID();
    await tx(
      `INSERT INTO aw_steps(run_id,node_id,status,attempt) VALUES($1,$2,'running',$3) ON CONFLICT DO NOTHING`,
      [j.run_id, j.node_id, j.attempts + 1],
    );
    return (
      await tx(
        `UPDATE aw_jobs SET status='running',lease_token=$2,locked_until=NOW()+INTERVAL '2 minutes',attempts=attempts+1,updated_at=NOW() WHERE id=$1 RETURNING *`,
        [j.id, lease],
      )
    )[0];
  });
}
async function context(tx: Query, r: any) {
  const order = r.order_id
    ? (
        await tx(
          `SELECT o.* FROM tracking_orders o JOIN tracking_sources s ON s.id=o.source_id WHERE o.id=$1 AND s.user_id=$2`,
          [r.order_id, r.user_id],
        )
      )[0]
    : null;
  const deal = r.deal_id
    ? (
        await tx("SELECT * FROM comm_deals WHERE id=$1 AND user_id=$2", [
          r.deal_id,
          r.user_id,
        ])
      )[0]
    : null;
  let product = r.product_id
    ? (
        await tx("SELECT * FROM aw_products WHERE id=$1 AND user_id=$2", [
          r.product_id,
          r.user_id,
        ])
      )[0]
    : null;
  if (product && order?.product_id) {
    const matches = (product.offers || []).filter(
      (o: any) => o.external_product_id === order.product_id,
    );
    if (matches.length === 1)
      product = { ...product, ...matches[0], id: product.id };
  }
  const tags = deal
    ? (
        await tx("SELECT tag FROM aw_tags WHERE user_id=$1 AND deal_id=$2", [
          r.user_id,
          deal.id,
        ])
      ).map((x) => x.tag)
    : [];
  const events = await tx(
    "SELECT BOOL_OR(clicked_at IS NOT NULL) AS clicked,BOOL_OR(status IN ('delivered','read')) AS delivered FROM aw_messages WHERE run_id=$1",
    [r.id],
  );
  const [counts] = await tx(
    `SELECT COUNT(*)::int AS sent FROM aw_messages WHERE run_id=$1 AND status IN ('sent','delivered','read')`,
    [r.id],
  );
  return {
    promotion: null as any,
    order,
    deal,
    product,
    tags,
    clicked: events[0]?.clicked || false,
    delivered: events[0]?.delivered || false,
    sent: counts.sent,
  };
}
async function cancel(tx: Query, id: string) {
  await tx(
    "UPDATE aw_runs SET status='canceled',finished_at=NOW(),updated_at=NOW() WHERE id=$1",
    [id],
  );
  await tx(
    "UPDATE aw_jobs SET status='canceled',locked_until=NULL WHERE run_id=$1 AND status IN ('running','waiting','queued')",
    [id],
  );
}
export async function executeJob(
  job: Job,
  deliver: (
    input: SendInput,
  ) => Promise<{
    id: string;
    provider: string;
    reference?: { lookup_id: string };
  }> = send,
) {
  let externalAttempted = false;
  const intent = await query(
    `SELECT r.id AS run_id,n->>'type' AS kind FROM aw_jobs j JOIN aw_runs r ON r.id=j.run_id JOIN aw_versions v ON v.flow_id=r.flow_id AND v.version=r.version CROSS JOIN LATERAL jsonb_array_elements(v.graph->'nodes') n WHERE j.id=$1 AND j.lease_token=$2 AND j.status='running' AND r.test_mode=FALSE AND n->>'id'=j.node_id AND n->>'type' IN ('agent','webhook')`,
    [job.id, job.lease_token],
  );
  if (intent.length)
    await query(
      "INSERT INTO aw_external_intents(run_id,node_id,kind,status) VALUES($1,$2,$3,'prepared') ON CONFLICT DO NOTHING",
      [intent[0].run_id, job.node_id, intent[0].kind],
    );
  try {
    await transaction(async (tx) => {
      const [j] = await tx(
        `SELECT * FROM aw_jobs WHERE id=$1 AND lease_token=$2 AND status='running' FOR UPDATE`,
        [job.id, job.lease_token],
      );
      if (!j) return;
      const [r] = await tx(
        `SELECT r.*,v.graph,v.settings FROM aw_runs r JOIN aw_versions v ON v.flow_id=r.flow_id AND v.version=r.version WHERE r.id=$1 FOR UPDATE OF r`,
        [j.run_id],
      );
      if (!r || !["queued", "running", "waiting"].includes(r.status)) {
        await tx("UPDATE aw_jobs SET status='canceled' WHERE id=$1", [j.id]);
        return;
      }
      const [flowState] = await tx(
        "SELECT status FROM aw_flows WHERE id=$1 FOR SHARE",
        [r.flow_id],
      );
      if (!r.test_mode && flowState?.status !== "active") {
        await tx(
          "UPDATE aw_jobs SET status='waiting',locked_until=NULL,due_at=NOW()+INTERVAL '15 seconds' WHERE id=$1",
          [j.id],
        );
        await tx(
          "UPDATE aw_runs SET status='waiting',updated_at=NOW() WHERE id=$1",
          [r.id],
        );
        return;
      }
      const campaigns = await tx(
        "SELECT c.status FROM aw_campaign_recipients cr JOIN aw_campaigns c ON c.id=cr.campaign_id WHERE cr.run_id=$1",
        [r.id],
      );
      if (campaigns.some((c) => c.status === "canceled")) {
        await cancel(tx, r.id);
        return;
      }
      if (campaigns.some((c) => c.status === "paused")) {
        await tx(
          "UPDATE aw_jobs SET status='waiting',locked_until=NULL,due_at=NOW()+INTERVAL '30 seconds' WHERE id=$1",
          [j.id],
        );
        await tx("UPDATE aw_runs SET status='waiting' WHERE id=$1", [r.id]);
        return;
      }
      const graph = r.graph as Graph,
        n = graph.nodes.find((x) => x.id === j.node_id);
      if (!n) throw new ProviderError("NODE_MISSING");
      const c = n.data.config || {};
      // Lock payment state while checking and dispatching, preventing approval from committing between them.
      if (r.order_id)
        await tx("SELECT id FROM tracking_orders WHERE id=$1 FOR SHARE", [
          r.order_id,
        ]);
      const ctx = await context(tx, r);
      if(r.settings.sales_mode==='upsell' && (!ctx.order || ctx.order.status!=='approved')) {
        await cancel(tx,r.id);return;
      }
      const quizSessionId=r.context?.quiz_session_id;
      let quizRecovery=false;
      if(r.recovery&&!ctx.order&&typeof quizSessionId==='string'){
        const sessions=await tx(`SELECT q.id,q.answers_encrypted FROM tracking_quiz_sessions q
          JOIN tracking_quiz_funnels f ON f.id=q.funnel_id JOIN tracking_sources owner ON owner.id=f.source_id
          WHERE q.id=$1 AND owner.user_id=$2 AND f.source_id=$3 AND q.order_id IS NULL
          AND q.updated_at<NOW()-INTERVAL '30 minutes' AND EXISTS(SELECT 1 FROM comm_deals d WHERE d.id=$4 AND d.user_id=$2
            AND d.external_source='trafficai_lifecycle' AND d.external_id='quiz:'||q.id::text)`,[quizSessionId,r.user_id,ctx.product?.source_id,r.deal_id]);
        if(sessions.length){
          try{const {decrypt}=await import('../../shared/encryption');quizRecovery=JSON.parse(decrypt(sessions[0].answers_encrypted)).recoveryConsent===true;}catch{}
        }
      }
      if (
        r.recovery &&
        ((!ctx.order&&!quizRecovery) ||
          ctx.order?.status === "approved" ||
          ["refunded", "chargeback"].includes(ctx.order?.status))
      ) {
        await cancel(tx, r.id);
        return;
      }
      if (r.recovery && !purchaseTag(ctx.product)) throw new ProviderError("RECOVERY_PRODUCT_MAPPING_REQUIRED");
      const promotion = r.settings.promotion_product_id
        ? promotionProduct((await tx("SELECT * FROM aw_products WHERE id=$1 AND user_id=$2", [r.settings.promotion_product_id, r.user_id]))[0], r.settings.promotion_offer_id)
        : null;
      if (r.settings.sales_mode === "upsell" && !promotion) throw new ProviderError("PROMOTION_PRODUCT_REQUIRED");
      ctx.promotion = promotion;
      if (promotion && (!ctx.deal || (!ctx.deal.contact_email && !ctx.deal.contact_phone))) {
        await cancel(tx, r.id);
        return;
      }
      const purchaseProduct = promotion || ctx.product;
      if (
        (r.recovery || r.settings.stop_on_purchase || promotion) &&
        purchaseProduct?.source_id &&
        (purchaseProduct?.external_product_id ||
          (!r.recovery &&
            purchaseProduct?.offers?.some((o: any) => o.external_product_id))) &&
        ctx.deal
      ) {
        const paid = await hasJourneyPurchase(r.user_id,purchaseProduct,{email:ctx.deal.contact_email,phone:ctx.deal.contact_phone},tx,!(r.recovery||promotion));
        if (paid) {
          await cancel(tx, r.id);
          return;
        }
      }
      if (!r.test_mode && r.context?.enrollment_id) {
        const firstMessage = graph.nodes.find((n) => n.type === "message");
        if (firstMessage) {
          const [consent] = await tx(
            "SELECT status FROM aw_consents WHERE user_id=$1 AND deal_id=$2 AND channel=$3",
            [r.user_id, r.deal_id, firstMessage.data.config.channel],
          );
          if (consent?.status !== "opted_in") {
            await cancel(tx, r.id);
            return;
          }
        }
      }
      if (ctx.product?.active === false) {
        await cancel(tx, r.id);
        return;
      }
      let branch: string | undefined;
      let delay = 0;
      let output: any = {};
      if (n.type === "condition")
        branch = conditionMatches(c, ctx) ? "yes" : "no";
      if (n.type === "wait") delay = Number(c.seconds);
      if (n.type === "message") {
        if (!r.test_mode && !isSendWindow(r.settings)) {
          await tx(
            "UPDATE aw_jobs SET status='waiting',due_at=NOW()+INTERVAL '15 minutes',locked_until=NULL WHERE id=$1",
            [j.id],
          );
          await tx(
            "UPDATE aw_runs SET status='waiting',updated_at=NOW() WHERE id=$1",
            [r.id],
          );
          return;
        }
        const [currentTemplate] = await tx(
          "SELECT * FROM aw_templates WHERE id=$1 AND user_id=$2",
          [c.templateId, r.user_id],
        );
        const template = c.templateSnapshot || currentTemplate;
        if (!template) throw new ProviderError("TEMPLATE_MISSING");
        if(!r.test_mode && ctx.deal?.external_source==='trafficai_lifecycle' && String(ctx.deal.external_id||'').startsWith('quiz:')) {
          const sessions=await tx(`SELECT q.answers_encrypted FROM tracking_quiz_sessions q JOIN tracking_quiz_funnels f ON f.id=q.funnel_id
            JOIN tracking_sources source ON source.id=f.source_id WHERE q.id=$1 AND source.user_id=$2`,[ctx.deal.external_id.slice(5),r.user_id]);
          let optedIn=false;try{const {decrypt}=await import('../../shared/encryption');optedIn=JSON.parse(decrypt(sessions[0]?.answers_encrypted)).recoveryConsent===true;}catch{}
          if(!optedIn){await cancel(tx,r.id);return;}
        }
        const [prior] = await tx(
          "SELECT * FROM aw_messages WHERE run_id=$1 AND node_id=$2",
          [r.id, n.id],
        );
        if (prior && ["unknown", "dispatching"].includes(prior.status))
          throw new ProviderError("PREVIOUS_SEND_UNCERTAIN", false, true);
        if (
          !prior ||
          !["sent", "delivered", "read", "simulated"].includes(prior.status)
        ) {
          const [consent] = await tx(
            "SELECT status FROM aw_consents WHERE user_id=$1 AND deal_id=$2 AND channel=$3 FOR SHARE",
            [r.user_id, r.deal_id, c.channel],
          );
          if (
            !r.test_mode &&
            c.channel === "whatsapp" &&
            template.purpose === "marketing"
          ) {
            const [i] = await tx(
              "SELECT type FROM comm_integrations WHERE id=$1 AND user_id=$2",
              [c.integrationId, r.user_id],
            );
            if (
              i?.type === "whatsapp_cloud" &&
              !template.parameters?.includes("unsubscribe_url")
            )
              throw new ProviderError(
                "WHATSAPP_MARKETING_TEMPLATE_OPTOUT_REQUIRED",
              );
          }
          const rawTo =
            c.channel === "email"
              ? ctx.deal?.contact_email
              : ctx.deal?.contact_phone;
          const to =
            typeof rawTo === "string"
              ? c.channel === "email"
                ? rawTo.trim()
                : rawTo.replace(/[^0-9+]/g, "")
              : rawTo;
          if (!r.test_mode && to) {
            const blocked = await tx(
              "SELECT 1 FROM aw_suppressions WHERE user_id=$1 AND channel=$2 AND destination_hash=$3",
              [r.user_id, c.channel, destinationHash(c.channel, to)],
            );
            if (blocked.length) throw new ProviderError("RECIPIENT_SUPPRESSED");
          }
          if (
            !r.test_mode &&
            (!to ||
              consent?.status !== "opted_in" ||
              ctx.sent >= Number(r.settings.max_messages || 5))
          )
            throw new ProviderError("RECIPIENT_SUPPRESSED");
          if (!r.test_mode && process.env.AUTOMATION_SENDS_ENABLED !== "true")
            throw new ProviderError("LIVE_SENDS_DISABLED");
          await tx(
            "INSERT INTO aw_sender_limits(user_id,integration_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [r.user_id, "00000000-0000-0000-0000-000000000000"],
          );
          await tx(
            "SELECT user_id FROM aw_sender_limits WHERE user_id=$1 AND integration_id=$2 FOR UPDATE",
            [r.user_id, "00000000-0000-0000-0000-000000000000"],
          );
          const [accountCount] = await tx(
            "SELECT COUNT(*)::int AS count FROM aw_messages WHERE user_id=$1 AND status IN ('sent','delivered','read') AND sent_at>NOW()-INTERVAL '1 minute'",
            [r.user_id],
          );
          if (!r.test_mode && accountCount.count >= 60) {
            await tx(
              "UPDATE aw_jobs SET status='waiting',locked_until=NULL,due_at=NOW()+INTERVAL '1 minute' WHERE id=$1",
              [j.id],
            );
            await tx("UPDATE aw_runs SET status='waiting' WHERE id=$1", [r.id]);
            return;
          }
          await tx(
            "INSERT INTO aw_sender_limits(user_id,integration_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [r.user_id, c.integrationId],
          );
          const [budget] = await tx(
            "SELECT next_at FROM aw_sender_limits WHERE user_id=$1 AND integration_id=$2 FOR UPDATE",
            [r.user_id, c.integrationId],
          );
          if (!r.test_mode && new Date(budget.next_at).getTime() > Date.now()) {
            await tx(
              "UPDATE aw_jobs SET status='waiting',locked_until=NULL,due_at=$2 WHERE id=$1",
              [j.id, budget.next_at],
            );
            await tx("UPDATE aw_runs SET status='waiting' WHERE id=$1", [r.id]);
            return;
          }
          if (!r.test_mode)
            await tx(
              "UPDATE aw_sender_limits SET next_at=NOW()+INTERVAL '10 seconds' WHERE user_id=$1 AND integration_id=$2",
              [r.user_id, c.integrationId],
            );
          const [message] = await tx(
            `INSERT INTO aw_messages(user_id,run_id,node_id,deal_id,order_id,channel,status,integration_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(run_id,node_id) DO UPDATE SET status=EXCLUDED.status,error_code=NULL RETURNING id`,
            [
              r.user_id,
              r.id,
              n.id,
              r.deal_id,
              r.order_id,
              c.channel,
              r.test_mode ? "simulated" : "dispatching",
              c.integrationId,
            ],
          );
          const linkInput = {
            userId: r.user_id,
            runId: r.id,
            messageId: message.id,
            dealId: r.deal_id,
            channel: c.channel,
          };
          const unsubscribe =
            !r.test_mode && template.purpose === "marketing"
              ? await createLink(tx, { ...linkInput, kind: "unsubscribe" })
              : "";
          const messageProduct = promotion || ctx.product;
          let checkout = quizRecovery ? ctx.product?.sales_url || "" : messageProduct?.checkout_url || "";
          const quizRefs = typeof quizSessionId==='string' ? await tx(`SELECT q.id FROM tracking_quiz_sessions q JOIN tracking_quiz_funnels f ON f.id=q.funnel_id JOIN tracking_sources source ON source.id=f.source_id WHERE q.id=$1 AND source.user_id=$2`,[quizSessionId,r.user_id])
            : ctx.order ? await tx(`SELECT q.id FROM tracking_quiz_sessions q JOIN tracking_quiz_funnels f ON f.id=q.funnel_id JOIN tracking_sources source ON source.id=f.source_id WHERE q.order_id=$1 AND source.user_id=$2 ORDER BY q.updated_at DESC LIMIT 2`,[ctx.order.id,r.user_id]):[];
          if(checkout&&quizRefs.length===1){const url=new URL(checkout);url.searchParams.set('quiz_session_id',quizRefs[0].id);url.searchParams.set('s1',quizRefs[0].id);checkout=url.href;}
          const trackedCheckout =
            !r.test_mode &&
            checkout &&
            template.body.includes("{{checkout_url}}")
              ? await createLink(tx, {
                  ...linkInput,
                  kind: "click",
                  url: checkout,
                })
              : checkout;
          const vars = {
            name:
              ctx.deal?.contact_name || (r.test_mode ? "Nome de teste" : ""),
            product:
              messageProduct?.name ||
              ctx.order?.product_name ||
              (r.test_mode ? "Produto de teste" : ""),
            value: String(promotion?.price ?? ctx.order?.gross_value ?? ctx.product?.price ?? ""),
            checkout_url:
              trackedCheckout ||
              (r.test_mode ? "https://example.com/checkout" : ""),
            delivery_url: ctx.product?.delivery_url || "",
            order_id: ctx.order?.external_order_id || "",
            email: ctx.deal?.contact_email || "",
            phone: ctx.deal?.contact_phone || "",
            unsubscribe_url:
              unsubscribe ||
              (r.test_mode ? "https://example.com/descadastro" : ""),
            agent_result: r.context?.agent_result || "",
          };
          let body = renderVariables(template.body, vars);
          if (unsubscribe && !template.body.includes("{{unsubscribe_url}}"))
            body += "\n\nPara não receber mais: " + unsubscribe;
          if (!r.test_mode) {
            externalAttempted = true;
            const result = await deliver({
              userId: r.user_id,
              integrationId: c.integrationId,
              channel: c.channel,
              to,
              body,
              unsubscribeUrl: unsubscribe || undefined,
              subject: renderVariables(template.subject, vars),
              html: emailHtml(
                (template.blocks || []).map((b: any) => ({
                  ...b,
                  text: renderVariables(String(b.text || ""), vars),
                  url: b.url ? renderVariables(String(b.url), vars) : undefined,
                })),
                body,
                renderVariables(template.preheader || "", vars),
              ).replace(
                "</body>",
                (unsubscribe
                  ? '<p><a href="' +
                    escapeHtml(unsubscribe) +
                    '">Não receber mais mensagens</a></p>'
                  : "") + "</body>",
              ),
              templateName: template.provider_template,
              templateParameters: (template.parameters || []).map(
                (key: string) => renderVariables("{{" + key + "}}", vars),
              ),
              language: template.language,
              idempotencyKey: `aw-${r.id}-${n.id}`,
            });
            await tx(
              "UPDATE aw_messages SET status='sent',provider=$3,provider_id=$4,sent_at=NOW(),provider_reference=$5 WHERE run_id=$1 AND node_id=$2",
              [
                r.id,
                n.id,
                result.provider,
                result.id,
                JSON.stringify(result.reference || {}),
              ],
            );
          }
        }
        output = { status: r.test_mode ? "simulated" : "sent" };
      }
      if (!r.test_mode && n.type === "tag") {
        const tag = salesTag(String(c.tag || ""), ctx.product, promotion);
        if (!tag) throw new ProviderError("PURCHASE_TAG_MAPPING_REQUIRED");
        if (!ctx.deal) throw new ProviderError("CONTACT_MISSING");
        if (c.operation === "remove")
          await tx(
            "DELETE FROM aw_tags WHERE user_id=$1 AND deal_id=$2 AND tag=$3",
            [r.user_id, r.deal_id, tag],
          );
        else
          await tx(
            "INSERT INTO aw_tags(user_id,deal_id,tag) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [r.user_id, r.deal_id, tag],
          );
      }
      if (!r.test_mode && n.type === "update_contact") {
        if (!ctx.deal) throw new ProviderError("CONTACT_MISSING");
        const field = c.field;
        if (!["title", "contact_name"].includes(field))
          throw new ProviderError("CONTACT_FIELD_INVALID");
        await tx(
          `UPDATE comm_deals SET ${field}=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2`,
          [r.deal_id, r.user_id, String(c.value || "").slice(0, 500)],
        );
      }
      if (!r.test_mode && n.type === "crm_task") {
        if (!ctx.deal) throw new ProviderError("CONTACT_MISSING");
        await tx(
          `INSERT INTO comm_tasks(user_id,deal_id,title,description,type,status,external_source,external_id,due_at) VALUES($1,$2,$3,$4,'follow_up','pending','trafficai_automation',$5,NOW()) ON CONFLICT(user_id,external_source,external_id) WHERE external_source IS NOT NULL AND external_id IS NOT NULL DO NOTHING`,
          [
            r.user_id,
            r.deal_id,
            String(c.title).slice(0, 500),
            "Criada pelo fluxo " + r.flow_id,
            r.id + ":" + n.id,
          ],
        );
      }
      if (!r.test_mode && ["webhook", "agent"].includes(n.type)) {
        const [priorIntent] = await tx(
          "SELECT * FROM aw_external_intents WHERE run_id=$1 AND node_id=$2 FOR UPDATE",
          [r.id, n.id],
        );
        if (priorIntent?.status === "unknown")
          throw new ProviderError(
            "PREVIOUS_EXTERNAL_RESULT_UNKNOWN",
            false,
            true,
          );
        if (priorIntent?.status === "completed") output = priorIntent.output;
        else {
          externalAttempted = true;
          output = await executeExternal({
            userId: r.user_id,
            runId: r.id,
            nodeId: n.id,
            kind: n.type,
            integrationId: c.integrationId,
            config: c,
            context: ctx,
          });
          await tx(
            "UPDATE aw_external_intents SET status='completed',output=$3,updated_at=NOW() WHERE run_id=$1 AND node_id=$2",
            [r.id, n.id, JSON.stringify(output)],
          );
          await tx(
            "UPDATE aw_runs SET context=jsonb_set(context,'{agent_result}',to_jsonb($2::text)) WHERE id=$1",
            [r.id, output.result],
          );
        }
      }
      const edge = graph.edges.find(
        (e) => e.source === n.id && (!branch || e.sourceHandle === branch),
      );
      await tx(
        `INSERT INTO aw_steps(run_id,node_id,status,attempt,output,finished_at) VALUES($1,$2,'completed',$3,$4,NOW()) ON CONFLICT(run_id,node_id,attempt) DO UPDATE SET status=EXCLUDED.status,output=EXCLUDED.output,finished_at=NOW()`,
        [r.id, n.id, j.attempts, JSON.stringify({ ...output, branch })],
      );
      await tx(
        "UPDATE aw_jobs SET status='completed',locked_until=NULL,updated_at=NOW() WHERE id=$1",
        [j.id],
      );
      if (edge && n.type !== "end") {
        await tx(
          `INSERT INTO aw_jobs(run_id,node_id,due_at) VALUES($1,$2,NOW()+$3*INTERVAL '1 second') ON CONFLICT DO NOTHING`,
          [r.id, edge.target, r.test_mode ? 0 : delay],
        );
        await tx("UPDATE aw_runs SET status=$2,updated_at=NOW() WHERE id=$1", [
          r.id,
          delay && !r.test_mode ? "waiting" : "running",
        ]);
      } else
        await tx(
          "UPDATE aw_runs SET status='completed',finished_at=NOW(),updated_at=NOW() WHERE id=$1",
          [r.id],
        );
    });
  } catch (err) {
    const e =
      err instanceof ProviderError
        ? err
        : !externalAttempted && ["40P01", "40001"].includes((err as any)?.code)
          ? new ProviderError("DATABASE_CONCURRENCY_RETRY", true)
          : new ProviderError(
              externalAttempted ? "SEND_RESULT_UNKNOWN" : "EXECUTION_ERROR",
              false,
              externalAttempted,
            );
    await transaction(async (tx) => {
      const [j] = await tx(
        "SELECT * FROM aw_jobs WHERE id=$1 AND lease_token=$2 FOR UPDATE",
        [job.id, job.lease_token],
      );
      if (!j || j.status !== "running") return;
      const retry = e.retryable && (j.failure_count || 0) + 1 < j.max_attempts;
      const state = e.uncertain ? "intervention" : retry ? "waiting" : "failed";
      await tx(
        "UPDATE aw_external_intents SET status=$3,error_code=$4,updated_at=NOW() WHERE run_id=$1 AND node_id=$2",
        [
          j.run_id,
          j.node_id,
          e.uncertain ? "unknown" : retry ? "prepared" : "failed",
          e.code,
        ],
      );
      await tx(
        `UPDATE aw_jobs SET status=$2,locked_until=NULL,failure_count=failure_count+1,due_at=NOW()+$3*INTERVAL '1 second',updated_at=NOW() WHERE id=$1`,
        [j.id, state, Math.min(3600, 30 * 2 ** (j.failure_count || 0))],
      );
      await tx(
        `UPDATE aw_runs SET status=$2,updated_at=NOW(),finished_at=CASE WHEN $2='failed' THEN NOW() ELSE NULL END WHERE id=$1 AND status<>'canceled'`,
        [j.run_id, state],
      );
      await tx(
        `INSERT INTO aw_steps(run_id,node_id,status,attempt,error_code,finished_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(run_id,node_id,attempt) DO UPDATE SET status=EXCLUDED.status,error_code=EXCLUDED.error_code,finished_at=NOW()`,
        [j.run_id, j.node_id, state, j.attempts, e.code],
      );
      await tx(
        `INSERT INTO aw_messages(user_id,run_id,node_id,deal_id,order_id,channel,status,error_code) SELECT r.user_id,r.id,$2,r.deal_id,r.order_id,n->'data'->'config'->>'channel',$3,$4 FROM aw_runs r JOIN aw_versions v ON v.flow_id=r.flow_id AND v.version=r.version CROSS JOIN LATERAL jsonb_array_elements(v.graph->'nodes') n WHERE r.id=$1 AND n->>'id'=$2 AND n->>'type'='message' ON CONFLICT(run_id,node_id) DO UPDATE SET status=EXCLUDED.status,error_code=EXCLUDED.error_code`,
        [
          j.run_id,
          j.node_id,
          e.uncertain
            ? "unknown"
            : e.code === "RECIPIENT_SUPPRESSED"
              ? "suppressed"
              : "failed",
          e.code,
        ],
      );
    });
  }
}
