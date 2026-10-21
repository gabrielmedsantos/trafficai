import { analytics } from "./analytics";
import { verifyEmailIntegration } from "./verification";
import { resolvedGraph } from "./repository";
import { saveTemplate } from "./templates";
import { audience, saveSegment, enrollManual } from "./audience";
import {
  createCampaign,
  previewCampaign,
  confirmCampaign,
  campaignStatus,
} from "./campaigns";
import { setConsent } from "./consent";
import { listIntegrations, saveIntegration } from "./integrations";
import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../../auth/auth.middleware";
import { requireCapability } from "../../team/capabilities";
import { query, queryOne, transaction } from "../../database/connection";
import { recordAudit } from "../../audit/audit.service";
import { ValidationError } from "../../shared/errors";
import {
  owned,
  saveFlow,
  duplicateFlow,
  listFlows,
  publishFlow,
  saveProduct,
  reference,
  overview,
} from "./repository";
import {
  graphIssues,
  parseGraph,
  text,
  object,
  emailHtml,
  renderVariables,
  UUID,
} from "./validation";
import { EVENTS, NODE_TYPES } from "./types";
const router = Router();
router.use(authMiddleware, requireCapability("automations"));
router.use(async (_req, res, next) => {
  try {
    const [r] = await query(
      "SELECT CASE WHEN to_regclass('public.aw_external_intents') IS NOT NULL THEN to_regclass('public.aw_enrollments') END AS installed",
    );
    if (!r.installed) {
      res.status(503).json({
        success: false,
        error: { message: "Módulo aguardando migração aprovada do banco" },
      });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
});
function route(fn: (req: Request) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fn(req);
      if (req.method !== "GET")
        await recordAudit({
          userId: req.user!.actorId || req.user!.userId,
          action: "automation." + req.method.toLowerCase(),
          entityType: "automation",
          entityLabel: req.route.path,
          details: { owner: req.user!.userId },
        });
      res.json({ success: true, data });
    } catch (e: any) {
      if (e.issues) {
        res.status(422).json({
          success: false,
          error: { message: e.message, issues: e.issues },
        });
        return;
      }
      next(e);
    }
  };
}
const user = (r: Request) => r.user!.userId;
router.get(
  "/integrations",
  route((req) => listIntegrations(user(req))),
);
router.post(
  "/integrations",
  route((req) => saveIntegration(user(req), req.body)),
);
router.put(
  "/integrations/:id",
  route((req) => saveIntegration(user(req), req.body, String(req.params.id))),
);
router.post(
  "/integrations/:id/verify",
  route((req) => verifyEmailIntegration(user(req), String(req.params.id))),
);
router.get(
  "/analytics",
  route((req) => analytics(user(req), req.query)),
);
router.get(
  "/segments",
  route((req) =>
    query(
      "SELECT * FROM aw_segments WHERE user_id=$1 ORDER BY created_at DESC",
      [user(req)],
    ),
  ),
);
router.post(
  "/segments",
  route((req) => saveSegment(user(req), req.body)),
);
router.put(
  "/segments/:id",
  route((req) => saveSegment(user(req), req.body, String(req.params.id))),
);
router.post(
  "/segments/preview",
  route(async (req) => {
    await reference("aw_products", req.body.rules?.product_id, user(req));
    const rows = await audience(query, user(req), req.body.rules, 10001);
    return {
      count: Math.min(rows.length, 10000),
      capped: rows.length > 10000,
      sample: rows.slice(0, 20),
    };
  }),
);
router.post(
  "/flows/:id/enroll",
  route((req) =>
    enrollManual(
      user(req),
      String(req.params.id),
      req.body.deal_id,
      req.body.confirm,
      req.body.allow_reentry === true,
    ),
  ),
);
router.get(
  "/campaigns",
  route((req) =>
    query(
      `SELECT c.*,f.name AS flow_name,(SELECT COUNT(*)::int FROM aw_campaign_recipients cr WHERE cr.campaign_id=c.id) AS recipients,(SELECT COUNT(*)::int FROM aw_campaign_recipients cr WHERE cr.campaign_id=c.id AND cr.state='skipped') AS skipped,(SELECT COUNT(*)::int FROM aw_campaign_recipients cr JOIN aw_runs r ON r.id=cr.run_id WHERE cr.campaign_id=c.id AND r.status IN ('failed','intervention')) AS failed_runs FROM aw_campaigns c JOIN aw_flows f ON f.id=c.flow_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 200`,
      [user(req)],
    ),
  ),
);
router.post(
  "/campaigns",
  route((req) => createCampaign(user(req), req.body)),
);
router.get(
  "/campaigns/:id/preview",
  route((req) => previewCampaign(user(req), String(req.params.id))),
);
router.post(
  "/campaigns/:id/confirm",
  route((req) =>
    confirmCampaign(
      user(req),
      req.user!.actorId || user(req),
      String(req.params.id),
      req.body,
    ),
  ),
);
router.post(
  "/campaigns/:id/status",
  route((req) =>
    campaignStatus(user(req), String(req.params.id), req.body.status),
  ),
);
router.get(
  "/catalog",
  route(async (req) => ({
    events: EVENTS.filter(
      (e) => !["order.created", "contact.updated", "custom"].includes(e),
    ),
    nodeTypes: NODE_TYPES,
    sendEnabled: process.env.AUTOMATION_SENDS_ENABLED === "true",
    workerEnabled: process.env.AUTOMATION_WORKFLOWS_ENABLED === "true",
    channels: ["email", "whatsapp", "sms"],
    limitations: ["Provedores dependem de configuração e homologação"],
    sources: await query(
      "SELECT id,name FROM tracking_sources WHERE user_id=$1 ORDER BY name",
      [user(req)],
    ),
    integrations: await query(
      "SELECT id,name,type AS provider,'{}'::jsonb AS config FROM comm_integrations WHERE user_id=$1 AND type IN ('whatsapp_cloud','whatsapp_evolution','whatsapp_uazapi') AND status='connected' UNION ALL SELECT id,name,provider,config FROM aw_integrations WHERE user_id=$1",
      [user(req)],
    ),
  })),
);
router.get(
  "/flows",
  route((req) => listFlows(user(req), typeof req.query.folder === "string" ? req.query.folder : undefined)),
);
router.post(
  "/flows",
  route((req) => saveFlow(user(req), req.body)),
);
router.post(
  "/flows/import",
  route((req) => saveFlow(user(req), req.body)),
);
router.post(
  "/flows/:id/duplicate",
  route((req) => duplicateFlow(user(req), String(req.params.id))),
);
router.get(
  "/flows/:id/export",
  route(async (req) => {
    const f = await owned("aw_flows", String(req.params.id), user(req));
    return {
      name: f.name,
      graph: f.graph,
      source_id: f.source_id,
      product_id: f.product_id,
      recovery: f.recovery,
      settings: f.settings,
    };
  }),
);
router.get(
  "/flows/:id",
  route((req) => owned("aw_flows", String(req.params.id), user(req))),
);
router.put(
  "/flows/:id",
  route((req) => saveFlow(user(req), req.body, String(req.params.id))),
);
router.post(
  "/flows/:id/validate",
  route(async (req) => {
    const f = await owned("aw_flows", String(req.params.id), user(req));
    return { issues: graphIssues(resolvedGraph(f), true) };
  }),
);
router.post(
  "/flows/:id/publish",
  route((req) => publishFlow(user(req), String(req.params.id))),
);
router.post(
  "/flows/:id/status",
  route(async (req) => {
    const f = await owned("aw_flows", String(req.params.id), user(req));
    if (
      !["active", "paused", "archived"].includes(req.body.status) ||
      (req.body.status === "active" && !f.published_version)
    )
      throw new ValidationError(
        "Status inválido; publique uma versão antes de ativar",
      );
    return transaction(async (tx) => {
      const [flow] = await tx(
        "UPDATE aw_flows SET status=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",
        [f.id, user(req), req.body.status],
      );
      if (req.body.status === "archived") {
        await tx(
          "UPDATE aw_runs SET status='canceled',finished_at=NOW(),updated_at=NOW() WHERE flow_id=$1 AND status IN ('queued','running','waiting','blocked','intervention')",
          [f.id],
        );
        await tx(
          "UPDATE aw_jobs SET status='canceled',locked_until=NULL WHERE run_id IN (SELECT id FROM aw_runs WHERE flow_id=$1 AND status='canceled') AND status IN ('queued','running','waiting','intervention')",
          [f.id],
        );
      }
      return flow;
    });
  }),
);
router.post(
  "/flows/:id/test",
  route(async (req) => {
    const f = await owned("aw_flows", String(req.params.id), user(req));
    if (!f.published_version)
      throw new ValidationError("Publique uma versão antes do teste");
    await reference("comm_deals", req.body.deal_id, user(req));
    return transaction(async (tx) => {
      const [v] = await tx(
        "SELECT * FROM aw_versions WHERE flow_id=$1 AND version=$2",
        [f.id, f.published_version],
      );
      const trigger = v.graph.nodes.find((n: any) => n.type === "trigger");
      const [r] = await tx(
        `INSERT INTO aw_runs(user_id,flow_id,version,deal_id,product_id,test_mode,recovery) VALUES($1,$2,$3,$4,$5,TRUE,FALSE) RETURNING *`,
        [
          user(req),
          f.id,
          f.published_version,
          req.body.deal_id || null,
          f.product_id,
        ],
      );
      await tx("INSERT INTO aw_jobs(run_id,node_id) VALUES($1,$2)", [
        r.id,
        trigger.id,
      ]);
      return r;
    });
  }),
);
router.get(
  "/products",
  route((req) =>
    query(
      "SELECT * FROM aw_products WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",
      [user(req)],
    ),
  ),
);
router.post(
  "/products",
  route((req) => saveProduct(user(req), req.body)),
);
router.put(
  "/products/:id",
  route((req) => saveProduct(user(req), req.body, String(req.params.id))),
);
router.get(
  "/templates",
  route((req) =>
    query(
      "SELECT * FROM aw_templates WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 200",
      [user(req)],
    ),
  ),
);
router.post(
  "/templates",
  route((req) => saveTemplate(user(req), req.body)),
);
router.put(
  "/templates/:id",
  route((req) => saveTemplate(user(req), req.body, String(req.params.id))),
);
router.post(
  "/templates/preview",
  route(async (req) => {
    const b = object(req.body),
      vars = {
        name: "Nome de exemplo",
        product: "Produto de exemplo",
        value: "27,00",
        checkout_url: "https://example.com/checkout",
        delivery_url: "https://example.com/entrega",
        order_id: "PEDIDO-EXEMPLO",
        email: "exemplo@example.com",
        phone: "5511999999999",
        unsubscribe_url: "https://example.com/descadastro",
        agent_result: "Resultado de exemplo",
      };
    return {
      html: emailHtml(
        (Array.isArray(b.blocks) ? b.blocks : []).map((block: any) => ({
          ...block,
          text: renderVariables(String(block.text || ""), vars),
          url: block.url ? renderVariables(String(block.url), vars) : undefined,
        })),
        renderVariables(String(b.body || ""), vars),
        renderVariables(String(b.preheader || ""), vars),
      ),
    };
  }),
);
router.get(
  "/contacts",
  route((req) =>
    query(
      `SELECT d.id,d.contact_name,d.contact_email,d.contact_phone,d.title,d.status,COALESCE((SELECT jsonb_object_agg(channel,status) FROM aw_consents c WHERE c.user_id=d.user_id AND c.deal_id=d.id),'{}') AS consent FROM comm_deals d WHERE d.user_id=$1 AND ($2='' OR d.contact_name ILIKE '%'||$2||'%' OR d.contact_email ILIKE '%'||$2||'%') ORDER BY d.updated_at DESC LIMIT 100`,
      [user(req), String(req.query.search || "").slice(0, 100)],
    ),
  ),
);
router.post(
  "/contacts/:id/consent",
  route(async (req) => {
    const d = await owned("comm_deals", String(req.params.id), user(req)),
      b = req.body;
    if (
      !["email", "sms", "whatsapp"].includes(b.channel) ||
      !["opted_in", "opted_out"].includes(b.status)
    )
      throw new ValidationError("Consentimento inválido");
    return transaction((tx) =>
      setConsent(tx, {
        userId: user(req),
        dealId: d.id,
        channel: b.channel,
        status: b.status,
        evidence: text(b.evidence, 1000),
      }),
    );
  }),
);
router.get(
  "/runs",
  route((req) =>
    query(
      `SELECT r.*,f.name AS flow_name FROM aw_runs r JOIN aw_flows f ON f.id=r.flow_id WHERE r.user_id=$1 AND ($2::uuid IS NULL OR r.flow_id=$2) ORDER BY r.created_at DESC LIMIT 100`,
      [
        user(req),
        UUID.test(String(req.query.flow_id)) ? req.query.flow_id : null,
      ],
    ),
  ),
);
router.get(
  "/runs/:id",
  route(async (req) => {
    const r = await owned("aw_runs", String(req.params.id), user(req));
    return {
      ...r,
      steps: await query(
        "SELECT * FROM aw_steps WHERE run_id=$1 ORDER BY started_at",
        [r.id],
      ),
      jobs: await query(
        "SELECT node_id,status,due_at,attempts FROM aw_jobs WHERE run_id=$1 ORDER BY created_at",
        [r.id],
      ),
      messages: await query(
        "SELECT id,node_id,channel,status,provider,error_code,created_at,sent_at FROM aw_messages WHERE run_id=$1",
        [r.id],
      ),
    };
  }),
);
router.post(
  "/runs/:id/resume",
  route(async (req) => {
    const r = await owned("aw_runs", String(req.params.id), user(req));
    if (req.body.confirm !== true || r.status !== "intervention")
      throw new ValidationError(
        "Confirme a retomada de uma execução em intervenção",
      );
    return transaction(async (tx) => {
      const jobs = await tx(
        "SELECT * FROM aw_jobs WHERE run_id=$1 AND status='intervention' FOR UPDATE",
        [r.id],
      );
      if (!jobs.length)
        throw new ValidationError("Sem ações pendentes de reconciliação");
      for (const job of jobs) {
        const [m] = await tx(
          "SELECT status FROM aw_messages WHERE run_id=$1 AND node_id=$2",
          [r.id, job.node_id],
        );
        if (!m || !["sent", "delivered", "read"].includes(m.status))
          throw new ValidationError(
            "O provedor ainda não confirmou o envio. Não é seguro repetir.",
          );
      }
      await tx(
        "UPDATE aw_jobs SET status='queued',due_at=NOW(),locked_until=NULL WHERE run_id=$1 AND status='intervention'",
        [r.id],
      );
      return (
        await tx(
          "UPDATE aw_runs SET status='queued',updated_at=NOW() WHERE id=$1 RETURNING *",
          [r.id],
        )
      )[0];
    });
  }),
);
router.post(
  "/runs/:id/cancel",
  route(async (req) => {
    const r = await owned("aw_runs", String(req.params.id), user(req));
    return transaction(async (tx) => {
      await tx(
        "UPDATE aw_jobs SET status='canceled' WHERE run_id=$1 AND status IN ('queued','waiting','running')",
        [r.id],
      );
      return (
        (
          await tx(
            "UPDATE aw_runs SET status='canceled',finished_at=NOW() WHERE id=$1 AND status NOT IN ('completed','failed') RETURNING *",
            [r.id],
          )
        )[0] || r
      );
    });
  }),
);
router.get(
  "/overview",
  route(async (req) => {
    const since = String(
        req.query.since ||
          new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10),
      ),
      until = String(req.query.until || new Date().toISOString().slice(0, 10));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(since) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
      !Number.isFinite(Date.parse(since)) ||
      !Number.isFinite(Date.parse(until)) ||
      since > until
    )
      throw new ValidationError("Período inválido");
    const product = UUID.test(String(req.query.product_id))
      ? String(req.query.product_id)
      : null;
    return {
      summary: await overview(user(req), since, until, product),
      daily: await query(
        `SELECT created_at::date AS day,COUNT(*)::int AS executions,COUNT(*) FILTER(WHERE status='completed')::int AS completed FROM aw_runs WHERE user_id=$1 AND test_mode=FALSE AND created_at>=$2::date AND created_at<$3::date+INTERVAL '1 day' AND ($4::uuid IS NULL OR product_id=$4) GROUP BY 1 ORDER BY 1`,
        [user(req), since, until, product],
      ),
    };
  }),
);
export const workflowController = router;
