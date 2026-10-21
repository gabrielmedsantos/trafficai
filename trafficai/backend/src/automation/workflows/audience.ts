import { randomUUID } from "crypto";
import { query, transaction } from "../../database/connection";
import { Query } from "./types";
import { owned, reference } from "./repository";
import { object, text, UUID } from "./validation";
import { ValidationError } from "../../shared/errors";
import { destinationHash } from "./consent";
export function segmentRules(input: any) {
  const b = object(input);
  if (b.channel && !["email", "whatsapp", "sms"].includes(b.channel))
    throw new ValidationError("Canal inválido");
  if (b.product_id && !UUID.test(b.product_id))
    throw new ValidationError("Produto inválido");
  if (b.purchase && !["approved", "not_approved"].includes(b.purchase))
    throw new ValidationError("Filtro de compra inválido");
  return {
    channel: b.channel || null,
    tag: b.tag ? text(b.tag, 80) : null,
    status: b.status ? text(b.status, 40) : null,
    product_id: b.product_id || null,
    purchase: b.purchase || null,
    search: typeof b.search === "string" ? b.search.slice(0, 100) : "",
  };
}
export async function audience(
  tx: Query,
  user: string,
  input: any,
  limit = 10000,
) {
  const r = segmentRules(input);
  return tx(
    `SELECT d.id,d.contact_name,d.contact_email,d.contact_phone,d.status FROM comm_deals d WHERE d.user_id=$1
 AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM aw_consents c WHERE c.user_id=d.user_id AND c.deal_id=d.id AND c.channel=$2 AND c.status='opted_in'))
 AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM aw_tags t WHERE t.user_id=d.user_id AND t.deal_id=d.id AND t.tag=$3))
 AND ($4::text IS NULL OR d.status=$4) AND ($5='' OR d.contact_name ILIKE '%'||$5||'%' OR d.contact_email ILIKE '%'||$5||'%')
 AND ($6::text IS NULL OR ($6='approved')=EXISTS(SELECT 1 FROM tracking_orders o JOIN tracking_sources s ON s.id=o.source_id LEFT JOIN aw_products p ON p.id=$7 AND p.user_id=d.user_id WHERE s.user_id=d.user_id AND o.status='approved'
 AND ($7::uuid IS NULL OR (o.source_id=p.source_id AND o.product_id=p.external_product_id))
 AND ((NULLIF(d.contact_email,'') IS NOT NULL AND LOWER(o.customer_email)=LOWER(d.contact_email)) OR (NULLIF(regexp_replace(d.contact_phone,'[^0-9]','','g'),'') IS NOT NULL AND regexp_replace(o.customer_phone,'[^0-9]','','g')=regexp_replace(d.contact_phone,'[^0-9]','','g')))))
 ORDER BY d.id LIMIT $8`,
    [
      user,
      r.channel,
      r.tag,
      r.status,
      r.search,
      r.purchase,
      r.product_id,
      limit,
    ],
  );
}
export async function saveSegment(user: string, b: any, id?: string) {
  const rules = segmentRules(b.rules);
  await reference("aw_products", rules.product_id, user);
  if (id) {
    await owned("aw_segments", id, user);
    return (
      await query(
        "UPDATE aw_segments SET name=$3,rules=$4 WHERE id=$1 AND user_id=$2 RETURNING *",
        [id, user, text(b.name, 160), JSON.stringify(rules)],
      )
    )[0];
  }
  return (
    await query(
      "INSERT INTO aw_segments(user_id,name,rules) VALUES($1,$2,$3) RETURNING *",
      [user, text(b.name, 160), JSON.stringify(rules)],
    )
  )[0];
}
export async function enroll(
  tx: Query,
  user: string,
  flow: any,
  dealId: string,
  test = false,
  allowReentry = false,
) {
  const [d] = await tx("SELECT * FROM comm_deals WHERE id=$1 AND user_id=$2", [
    dealId,
    user,
  ]);
  if (!d) throw new ValidationError("Contato não encontrado");
  const [v] = await tx(
    "SELECT * FROM aw_versions WHERE flow_id=$1 AND user_id=$2 AND version=$3",
    [flow.id, user, flow.version || flow.published_version],
  );
  if (!v)
    throw new ValidationError("Publique o fluxo antes de inscrever contatos");
  const trigger = v.graph.nodes.find((n: any) => n.type === "trigger");
  if (trigger?.data.config.event !== "manual")
    throw new ValidationError("Inscrições exigem gatilho manual");
  if (v.recovery)
    throw new ValidationError(
      "Recuperação exige evento de pedido; use fluxo de relacionamento para inscrições",
    );
  const channel = v.graph.nodes.find((n: any) => n.type === "message")?.data
    .config.channel;
  if (!channel) throw new ValidationError("O funil precisa de uma mensagem");
  const to = channel === "email" ? d.contact_email : d.contact_phone;
  if (!to) return { skipped: "destination_missing" };
  const key = destinationHash(channel, to);
  if (!test) {
    const [consent] = await tx(
      "SELECT status FROM aw_consents WHERE user_id=$1 AND deal_id=$2 AND channel=$3 FOR SHARE",
      [user, d.id, channel],
    );
    const blocked = await tx(
      "SELECT 1 FROM aw_suppressions WHERE user_id=$1 AND channel=$2 AND destination_hash=$3",
      [user, channel, key],
    );
    if (consent?.status !== "opted_in" || blocked.length)
      return { skipped: "suppressed" };
  }
  const enrolled = await tx(
    `INSERT INTO aw_enrollments(user_id,flow_id,version,deal_id,recipient_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(flow_id,recipient_key) DO UPDATE SET version=EXCLUDED.version,deal_id=EXCLUDED.deal_id WHERE $6=TRUE AND aw_enrollments.run_id IN (SELECT id FROM aw_runs WHERE status IN ('completed','failed','canceled')) RETURNING id`,
    [
      user,
      flow.id,
      v.version,
      d.id,
      test ? key + ":test:" + randomUUID() : key,
      allowReentry,
    ],
  );
  if (!enrolled.length) return { skipped: "already_enrolled" };
  const [run] = await tx(
    `INSERT INTO aw_runs(user_id,flow_id,version,deal_id,product_id,test_mode,context) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      user,
      flow.id,
      v.version,
      d.id,
      v.product_id,
      test,
      JSON.stringify({ enrollment_id: enrolled[0].id }),
    ],
  );
  await tx("INSERT INTO aw_jobs(run_id,node_id) VALUES($1,$2)", [
    run.id,
    trigger.id,
  ]);
  await tx("UPDATE aw_enrollments SET run_id=$2 WHERE id=$1", [
    enrolled[0].id,
    run.id,
  ]);
  return { run };
}
export async function enrollManual(
  user: string,
  flowId: string,
  dealId: string,
  confirmed: boolean,
  allowReentry = false,
) {
  if (confirmed !== true)
    throw new ValidationError(
      "Confirme a inscrição e seus efeitos antes de iniciar",
    );
  const f = await owned("aw_flows", flowId, user);
  if (f.status !== "active")
    throw new ValidationError("Ative o fluxo publicado antes de inscrever");
  return transaction((tx) => enroll(tx, user, f, dealId, false, allowReentry));
}
