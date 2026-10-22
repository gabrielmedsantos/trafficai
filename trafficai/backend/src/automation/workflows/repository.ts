import { promotionProduct } from "./purchase-target";
import { getEntitlements } from "../../billing/entitlements";
import { whatsappSettings } from "./whatsapp";
import { query, queryOne, transaction } from "../../database/connection";
import { Graph } from "./types";
import { parseGraph, object, text, UUID, httpsUrl } from "./validation";
import { NotFoundError, ValidationError } from "../../shared/errors";
export async function owned(table: string, id: string, user: string) {
  if (!UUID.test(id)) throw new ValidationError("Identificador inválido");
  const row = await queryOne<any>(
    `SELECT * FROM ${table} WHERE id=$1 AND user_id=$2`,
    [id, user],
  );
  if (!row) throw new NotFoundError("Recurso não encontrado");
  return row;
}
export async function reference(table: string, id: any, user: string) {
  if (id != null && id !== "") await owned(table, id, user);
}
export async function validateReferences(graph: Graph, user: string) {
  for (const n of graph.nodes) {
    const c = object(n.data.config);
    if (n.type === "condition" && c.kind === "product_purchased") await owned("aw_products",c.productId,user);
    if (n.type === "message") {
      for(const id of c.excludePurchasedProductIds || []) await owned("aw_products",id,user);
      if(c.promotionProductId) promotionProduct(await owned("aw_products",c.promotionProductId,user));
      const t = await owned("aw_templates", c.templateId, user);
      if (t.channel !== c.channel)
        throw new ValidationError("Canal do modelo não corresponde à ação");
      const table =
        c.channel === "whatsapp" ? "comm_integrations" : "aw_integrations";
      const i = await owned(table, c.integrationId, user);
      if (c.channel === "whatsapp") {
        if (
          i.type === "whatsapp_uazapi" &&
          !(await getEntitlements(user)).whatsapp_uazapi
        )
          throw new ValidationError(
            "UazAPI não está habilitada no plano desta conta",
          );
        try {
          whatsappSettings(i);
        } catch {
          throw new ValidationError(
            "Conexão WhatsApp desconectada ou incompleta",
          );
        }
        if (
          i.type === "whatsapp_cloud" &&
          t.purpose === "marketing" &&
          !t.parameters?.includes("unsubscribe_url")
        )
          throw new ValidationError(
            "Template de marketing Cloud precisa de parâmetro unsubscribe_url",
          );
        if (i.type === "whatsapp_cloud" && !t.provider_template)
          throw new ValidationError(
            "Selecione um template aprovado para WhatsApp Cloud",
          );
      }
      if (
        (c.channel === "email" && i.provider !== "resend") ||
        (c.channel === "sms" && i.provider !== "twilio")
      )
        throw new ValidationError("Provedor incompatível");
    }
    if (["agent", "webhook"].includes(n.type)) {
      const i = await owned("aw_integrations", c.integrationId, user);
      if (i.provider !== (n.type === "agent" ? "agent_webhook" : "webhook"))
        throw new ValidationError("Integração de agente inválida");
    }
  }
}
export async function saveFlow(user: string, input: any, id?: string) {
  const name = text(input.name, 160),
    graph = parseGraph(input.graph);
  await reference("aw_products", input.product_id, user);
  await reference("tracking_sources", input.source_id, user);
  const settings = object(input.settings);
  const safeSettings = {
    default_whatsapp_connection_id:
      settings.default_whatsapp_connection_id || null,
    post_purchase: settings.post_purchase === true,
    stop_on_purchase: settings.stop_on_purchase === true,
    folder: settings.folder === "templates" ? "templates" : null,
    promotion_product_id: settings.promotion_product_id || null,
    promotion_offer_id: settings.promotion_offer_id || null,
    sales_mode: ["recovery", "upsell", "purchase_tags"].includes(settings.sales_mode) ? settings.sales_mode : null,
    time_zone: settings.time_zone || "America/Fortaleza",
    allowed_start: Number.isInteger(settings.allowed_start)
      ? settings.allowed_start
      : 8,
    allowed_end: Number.isInteger(settings.allowed_end)
      ? settings.allowed_end
      : 20,
    days: Array.isArray(settings.days) ? settings.days : [1, 2, 3, 4, 5, 6],
    max_messages: Number.isInteger(settings.max_messages)
      ? settings.max_messages
      : 5,
    attribution_hours: Math.min(
      720,
      Math.max(1, Number(settings.attribution_hours) || 72),
    ),
  };
  await reference("aw_products", safeSettings.promotion_product_id, user);
  if (input.recovery && safeSettings.promotion_product_id) throw new ValidationError("Recuperação usa o produto original; configure upsell em outro fluxo");
  if (safeSettings.promotion_offer_id && !safeSettings.promotion_product_id) throw new ValidationError("Selecione o produto da oferta");
  await reference(
    "comm_integrations",
    safeSettings.default_whatsapp_connection_id,
    user,
  );
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: safeSettings.time_zone });
  } catch {
    throw new ValidationError("Fuso horário inválido");
  }
  if (
    safeSettings.allowed_start < 0 ||
    safeSettings.allowed_end > 24 ||
    safeSettings.allowed_start >= safeSettings.allowed_end ||
    safeSettings.max_messages < 1 ||
    safeSettings.max_messages > 20 ||
    safeSettings.days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new ValidationError("Janela ou limites inválidos");
  if (safeSettings.stop_on_purchase && !input.product_id)
    throw new ValidationError(
      "Selecione um produto para interromper após a compra",
    );
  if (id) {
    await owned("aw_flows", id, user);
    if (!Number.isInteger(input.revision))
      throw new ValidationError("Informe a revisão atual");
    const row = await queryOne(
      `UPDATE aw_flows SET name=$3,graph=$4,source_id=$5,product_id=$6,recovery=$7,settings=$8,revision=revision+1,updated_at=NOW() WHERE id=$1 AND user_id=$2 AND revision=$9 RETURNING *`,
      [
        id,
        user,
        name,
        JSON.stringify(graph),
        input.source_id || null,
        input.product_id || null,
        !!input.recovery,
        JSON.stringify(safeSettings),
        input.revision,
      ],
    );
    if (!row)
      throw new ValidationError(
        "O fluxo foi alterado. Recarregue antes de salvar",
      );
    return row;
  }
  return queryOne(
    `INSERT INTO aw_flows(user_id,name,graph,source_id,product_id,recovery,settings) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      user,
      name,
      JSON.stringify(graph),
      input.source_id || null,
      input.product_id || null,
      !!input.recovery,
      JSON.stringify(safeSettings),
    ],
  );
}
// Copy message models too: adapting a duplicated flow must not edit the standard library.
export async function listFlows(user: string, folder?: string) {
  if (folder && !["templates", "mine", "all"].includes(folder)) throw new ValidationError("Pasta inválida");
  return query(`SELECT id,name,status,revision,published_version,recovery,product_id,updated_at,settings->>'folder' AS folder
    FROM aw_flows WHERE user_id=$1 AND ($2::text IS NULL OR $2='all' OR ($2='templates' AND settings->>'folder'='templates') OR ($2='mine' AND (settings->>'folder') IS DISTINCT FROM 'templates')) ORDER BY updated_at DESC LIMIT 200`, [user, folder || null]);
}
export async function duplicateFlow(user: string, id: string) {
  await owned("aw_flows", id, user);
  return transaction(async (tx) => {
    const [original] = await tx("SELECT * FROM aw_flows WHERE id=$1 AND user_id=$2 FOR SHARE", [id, user]);
    if (!original) throw new NotFoundError("Fluxo não encontrado");
    const graph = JSON.parse(JSON.stringify(original.graph)) as Graph;
    const models = new Map<string, string>();
    for (const node of graph.nodes) {
      if (node.type !== "message" || !node.data.config.templateId) continue;
      const oldId = node.data.config.templateId;
      if (!models.has(oldId)) {
        const [model] = await tx(
          `INSERT INTO aw_templates(user_id,name,channel,subject,body,blocks,purpose,provider_template,language,preheader,parameters)
           SELECT user_id,LEFT(name || ' (cópia)',160),channel,subject,body,blocks,purpose,provider_template,language,preheader,parameters
           FROM aw_templates WHERE id=$1 AND user_id=$2 RETURNING id`, [oldId, user]);
        if (!model) throw new ValidationError("Modelo de mensagem indisponível para duplicar");
        models.set(oldId, model.id);
      }
      node.data.config.templateId = models.get(oldId);
      delete node.data.config.templateSnapshot;
    }
    const [copy] = await tx(
      `INSERT INTO aw_flows(user_id,name,graph,source_id,product_id,recovery,settings) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user, (original.name + " (cópia)").slice(0,160), JSON.stringify(graph), original.source_id, original.product_id, original.recovery, JSON.stringify({ ...original.settings, folder: null })]);
    return copy;
  });
}
export function resolvedGraph(flow: any): Graph {
  const graph = JSON.parse(JSON.stringify(flow.graph)) as Graph;
  for (const n of graph.nodes) {
    if (
      n.type === "message" &&
      n.data.config.channel === "whatsapp" &&
      !n.data.config.integrationId
    )
      n.data.config.integrationId =
        flow.settings.default_whatsapp_connection_id || null;
  }
  return graph;
}
export async function publishFlow(user: string, id: string) {
  const f = await owned("aw_flows", id, user);
  if (f.settings.folder === "templates") throw new ValidationError("Duplique o template em Meus fluxos antes de publicar");
  if (f.product_id) {
    const p = await owned("aw_products", f.product_id, user);
    if (!p.active)
      throw new ValidationError("Produto arquivado; ative antes de publicar");
  }
  if (f.recovery || f.settings.sales_mode) {
    if (!f.product_id) throw new ValidationError("Selecione o produto de entrada antes de publicar este modelo");
    const product = await owned("aw_products", f.product_id, user);
    if (!product.source_id || (!product.external_product_id && !(product.offers || []).some((offer: any) => offer.external_product_id))) throw new ValidationError("Configure a fonte e o ID externo do produto para identificar compras");
    if (f.source_id && f.source_id !== product.source_id) throw new ValidationError("A fonte do fluxo deve corresponder ao produto de entrada");
  }
  if (f.settings.sales_mode === "recovery" && !f.recovery) throw new ValidationError("Marque o fluxo como recuperação antes de publicar");
  if (f.settings.sales_mode === "upsell" && f.recovery) throw new ValidationError("Upsell não pode ser marcado como recuperação");
  if (f.settings.sales_mode === "upsell" && !f.graph.nodes.some((node: any) => node.type === "trigger" && node.data.config.event === "payment.approved")) throw new ValidationError("Upsell precisa iniciar com pagamento aprovado");
  if (f.settings.sales_mode === "upsell" && !f.settings.promotion_product_id) throw new ValidationError("Selecione o produto oferecido no upsell");
  if (f.settings.promotion_product_id) {
    promotionProduct(await owned("aw_products", f.settings.promotion_product_id, user), f.settings.promotion_offer_id);
  }
  const graph = resolvedGraph(f);
  parseGraph(graph, true);
  await validateReferences(graph, user);
  return transaction(async (tx) => {
    const [locked] = await tx(
      "SELECT * FROM aw_flows WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, user],
    );
    if (locked.revision !== f.revision)
      throw new ValidationError("Fluxo alterado durante a validação");
    const publishedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
    for (const node of publishedGraph.nodes) {
      if (["agent", "webhook"].includes(node.type)) {
        const i = await owned(
          "aw_integrations",
          node.data.config.integrationId,
          user,
        );
        node.data.config.externalSnapshot = i.config;
        if (i.config.paid && !node.data.config.costApproved)
          throw new ValidationError("Confirme o custo máximo do agente");
      }
      if (node.type !== "message") continue;
      const c = node.data.config;
      const [template] = await tx(
        "SELECT id,name,channel,subject,body,blocks,purpose,provider_template,language,preheader,parameters FROM aw_templates WHERE id=$1 AND user_id=$2 FOR SHARE",
        [c.templateId, user],
      );
      if (!template || template.channel !== c.channel)
        throw new ValidationError("Modelo indisponível durante publicação");
      c.templateSnapshot = template;
    }
    const version = (locked.published_version || 0) + 1;
    await tx(
      "INSERT INTO aw_versions(flow_id,version,user_id,graph,recovery,settings,source_id,product_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        version,
        user,
        JSON.stringify(publishedGraph),
        locked.recovery,
        JSON.stringify(locked.settings),
        locked.source_id,
        locked.product_id,
      ],
    );
    return (
      await tx(
        "UPDATE aw_flows SET published_version=$3,status='active',updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",
        [id, user, version],
      )
    )[0];
  });
}
export async function saveProduct(user: string, b: any, id?: string) {
  await reference("tracking_sources", b.source_id, user);
  const offerIds = new Set<string>();
  const offers = (Array.isArray(b.offers) ? b.offers : []).map((o: any) => {
    const id = text(o.id, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || offerIds.has(id))
      throw new ValidationError("Identificador de oferta inválido ou repetido");
    offerIds.add(id);
    const price = Number(o.price);
    if (!Number.isFinite(price) || price < 0)
      throw new ValidationError("Preço da oferta inválido");
    const currency = String(o.currency || b.currency || "BRL").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new ValidationError("Moeda da oferta inválida");
    return {
      id,
      name: text(o.name, 160),
      price,
      currency,
      checkout_url: httpsUrl(o.checkout_url),
      external_product_id: o.external_product_id
        ? text(o.external_product_id, 160)
        : null,
    };
  });
  if (offers.length > 30) throw new ValidationError("Máximo de 30 ofertas");
  const vals = [
    text(b.name, 160),
    typeof b.description === "string" ? b.description.slice(0, 4000) : "",
    b.source_id || null,
    b.price == null ? null : Number(b.price),
    String(b.currency || "BRL").toUpperCase(),
    b.sales_url ? httpsUrl(b.sales_url) : null,
    b.checkout_url ? httpsUrl(b.checkout_url) : null,
    b.delivery_url ? httpsUrl(b.delivery_url) : null,
    b.platform ? text(b.platform, 40) : null,
    b.external_product_id ? text(b.external_product_id, 160) : null,
    b.active !== false,
    JSON.stringify(Array.isArray(b.tags) ? b.tags.slice(0, 30) : []),
    JSON.stringify(offers),
  ];
  if (vals[3] != null && (!Number.isFinite(vals[3]) || Number(vals[3]) < 0))
    throw new ValidationError("Preço inválido");
  if (!/^[A-Z]{3}$/.test(String(vals[4])))
    throw new ValidationError("Moeda inválida");
  if (id) {
    await owned("aw_products", id, user);
    return queryOne(
      `UPDATE aw_products SET name=$3,description=$4,source_id=$5,price=$6,currency=$7,sales_url=$8,checkout_url=$9,delivery_url=$10,platform=$11,external_product_id=$12,active=$13,tags=$14,offers=$15,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,
      [id, user, ...vals],
    );
  }
  return queryOne(
    `INSERT INTO aw_products(user_id,name,description,source_id,price,currency,sales_url,checkout_url,delivery_url,platform,external_product_id,active,tags,offers) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [user, ...vals],
  );
}
export async function overview(
  user: string,
  since: string,
  until: string,
  productId: string | null = null,
) {
  return queryOne(
    `SELECT
 (SELECT COUNT(*)::int FROM aw_flows WHERE user_id=$1 AND status='active' AND ($4::uuid IS NULL OR product_id=$4)) active_flows,
 (SELECT COUNT(*)::int FROM aw_flows WHERE user_id=$1 AND status='paused' AND ($4::uuid IS NULL OR product_id=$4)) paused_flows,
 COUNT(*)::int executions,COUNT(*) FILTER(WHERE status='completed')::int completed,COUNT(*) FILTER(WHERE status='failed')::int failed,
 (SELECT COUNT(DISTINCT m.deal_id)::int FROM aw_messages m JOIN aw_runs r ON r.id=m.run_id WHERE m.user_id=$1 AND r.test_mode=FALSE AND m.status IN ('sent','delivered','read') AND m.created_at>=$2::timestamptz AND m.created_at<$3::timestamptz+INTERVAL '1 day' AND ($4::uuid IS NULL OR r.product_id=$4)) contacts,
 (SELECT COUNT(*)::int FROM aw_messages m JOIN aw_runs r ON r.id=m.run_id WHERE m.user_id=$1 AND r.test_mode=FALSE AND m.status IN ('sent','delivered','read') AND m.created_at>=$2::timestamptz AND m.created_at<$3::timestamptz+INTERVAL '1 day' AND ($4::uuid IS NULL OR r.product_id=$4)) messages_sent,
 (SELECT COUNT(*)::int FROM aw_messages m JOIN aw_runs r ON r.id=m.run_id WHERE m.user_id=$1 AND r.test_mode=FALSE AND m.status IN ('delivered','read') AND m.created_at>=$2::timestamptz AND m.created_at<$3::timestamptz+INTERVAL '1 day' AND ($4::uuid IS NULL OR r.product_id=$4)) messages_delivered,
 (SELECT COUNT(*)::int FROM aw_attributions a JOIN aw_runs r ON r.id=a.run_id JOIN tracking_orders o ON o.id=a.order_id WHERE a.user_id=$1 AND o.status='approved' AND a.created_at>=$2::timestamptz AND a.created_at<$3::timestamptz+INTERVAL '1 day' AND ($4::uuid IS NULL OR r.product_id=$4)) attributed_purchases
 FROM aw_runs WHERE user_id=$1 AND test_mode=FALSE AND created_at>=$2::timestamptz AND created_at<$3::timestamptz+INTERVAL '1 day' AND ($4::uuid IS NULL OR product_id=$4)`,
    [user, since, until, productId],
  );
}
