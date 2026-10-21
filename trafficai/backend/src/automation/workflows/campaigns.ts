import { query, transaction } from "../../database/connection";
import { owned } from "./repository";
import { audience, enroll } from "./audience";
import { text } from "./validation";
import { ValidationError } from "../../shared/errors";
export async function createCampaign(user: string, b: any) {
  const f = await owned("aw_flows", b.flow_id, user),
    segment = await owned("aw_segments", b.segment_id, user);
  if (!f.published_version)
    throw new ValidationError("Publique o fluxo antes de criar a campanha");
  const [v] = await query(
    "SELECT graph,recovery FROM aw_versions WHERE flow_id=$1 AND version=$2",
    [f.id, f.published_version],
  );
  const nodes = v.graph.nodes.filter((n: any) => n.type === "message");
  const channel = nodes[0]?.data.config.channel;
  if (
    !channel ||
    nodes.some((n: any) => n.data.config.channel !== channel) ||
    v.recovery ||
    v.graph.nodes.find((n: any) => n.type === "trigger")?.data.config.event !==
      "manual"
  )
    throw new ValidationError(
      "Use fluxo manual de relacionamento com um único canal",
    );
  const limit = Number(b.max_recipients || 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
    throw new ValidationError("Limite deve ser entre 1 e 10000");
  return (
    await query(
      `INSERT INTO aw_campaigns(user_id,name,flow_id,segment_id,channel,max_recipients,version) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        user,
        text(b.name, 160),
        f.id,
        segment.id,
        channel,
        limit,
        f.published_version,
      ],
    )
  )[0];
}
export async function previewCampaign(user: string, id: string) {
  const c = await owned("aw_campaigns", id, user),
    s = await owned("aw_segments", c.segment_id, user);
  const rows = await audience(
    query,
    user,
    { ...s.rules, channel: c.channel },
    10001,
  );
  const [version] = await query(
    "SELECT graph FROM aw_versions WHERE flow_id=$1 AND version=$2 AND user_id=$3",
    [c.flow_id, c.version, user],
  );
  const ids = [
    ...new Set<string>(
      (version?.graph.nodes || [])
        .filter((n: any) => n.type === "message")
        .map((n: any) => String(n.data.config.integrationId)),
    ),
  ];
  const senders = ids.length
    ? await query(
        "SELECT id,name,provider,config->>'from' AS sender FROM aw_integrations WHERE user_id=$1 AND id=ANY($2::uuid[]) UNION ALL SELECT id,name,type AS provider,NULL AS sender FROM comm_integrations WHERE user_id=$1 AND id=ANY($2::uuid[])",
        [user, ids],
      )
    : [];
  return {
    senders,
    count: Math.min(rows.length, c.max_recipients),
    capped: rows.length > c.max_recipients,
    sample: rows.slice(0, 10),
    channel: c.channel,
    flow_id: c.flow_id,
  };
}
export async function confirmCampaign(
  user: string,
  actor: string,
  id: string,
  b: any,
) {
  if (b.confirm !== true || !Number.isInteger(b.expected_count))
    throw new ValidationError("Confirme a audiência antes de agendar");
  const when = b.scheduled_at ? new Date(b.scheduled_at) : new Date();
  if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() - 60000)
    throw new ValidationError("Agendamento inválido");
  return transaction(async (tx) => {
    const [c] = await tx(
      "SELECT * FROM aw_campaigns WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, user],
    );
    if (!c || c.status !== "draft")
      throw new ValidationError("A campanha já foi confirmada");
    const [s] = await tx(
      "SELECT * FROM aw_segments WHERE id=$1 AND user_id=$2 FOR SHARE",
      [c.segment_id, user],
    );
    const [f] = await tx(
      "SELECT * FROM aw_flows WHERE id=$1 AND user_id=$2 FOR SHARE",
      [c.flow_id, user],
    );
    if (!c.version)
      throw new ValidationError("Recrie a campanha sem versão congelada");
    if (!s || f?.status !== "active" || !f.published_version)
      throw new ValidationError("Segmento ou fluxo indisponível");
    const rules = { ...s.rules, channel: c.channel };
    const rows = await audience(tx, user, rules, c.max_recipients);
    if (rows.length !== b.expected_count)
      throw new ValidationError(
        "A audiência mudou. Atualize a prévia antes de confirmar",
      );
    for (const d of rows)
      await tx(
        "INSERT INTO aw_campaign_recipients(campaign_id,deal_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [c.id, d.id],
      );
    return (
      await tx(
        "UPDATE aw_campaigns SET status='scheduled',version=$3,rules_snapshot=$4,confirmed_at=NOW(),confirmed_by=$5,scheduled_at=$6 WHERE id=$1 AND user_id=$2 RETURNING *",
        [
          c.id,
          user,
          c.version,
          JSON.stringify(rules),
          actor,
          when.toISOString(),
        ],
      )
    )[0];
  });
}
export async function campaignTick() {
  await transaction(async (tx) => {
    const campaigns = await tx(
      "SELECT * FROM aw_campaigns WHERE status IN ('scheduled','sending') AND confirmed_at IS NOT NULL AND scheduled_at<=NOW() ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 5",
    );
    for (const c of campaigns) {
      const [f] = await tx(
        "SELECT * FROM aw_flows WHERE id=$1 AND user_id=$2",
        [c.flow_id, c.user_id],
      );
      if (f?.status !== "active") continue;
      await tx(
        "UPDATE aw_campaigns SET status='sending',started_at=COALESCE(started_at,NOW()) WHERE id=$1",
        [c.id],
      );
      const rows = await tx(
        "SELECT * FROM aw_campaign_recipients WHERE campaign_id=$1 AND state='pending' ORDER BY deal_id FOR UPDATE SKIP LOCKED LIMIT 25",
        [c.id],
      );
      for (const d of rows) {
        const result = await enroll(
          tx,
          c.user_id,
          { ...f, version: c.version },
          d.deal_id,
        );
        await tx(
          "UPDATE aw_campaign_recipients SET state=$3,reason=$4,run_id=$5 WHERE campaign_id=$1 AND deal_id=$2",
          [
            c.id,
            d.deal_id,
            result.run ? "enrolled" : "skipped",
            result.skipped || null,
            result.run?.id || null,
          ],
        );
      }
      const pending = await tx(
        "SELECT 1 FROM aw_campaign_recipients cr LEFT JOIN aw_runs r ON r.id=cr.run_id WHERE cr.campaign_id=$1 AND (cr.state='pending' OR r.status IN ('queued','running','waiting','blocked','intervention')) LIMIT 1",
        [c.id],
      );
      if (!pending.length)
        await tx(
          "UPDATE aw_campaigns SET status='completed',finished_at=NOW() WHERE id=$1",
          [c.id],
        );
    }
  });
}
export async function campaignStatus(user: string, id: string, status: string) {
  await owned("aw_campaigns", id, user);
  if (!["paused", "sending", "canceled"].includes(status))
    throw new ValidationError("Estado inválido");
  return transaction(async (tx) => {
    const [c] = await tx(
      "SELECT * FROM aw_campaigns WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, user],
    );
    if (!c.confirmed_at || ["canceled", "completed"].includes(c.status))
      throw new ValidationError("Campanha não pode mudar de estado");
    await tx("UPDATE aw_campaigns SET status=$3 WHERE id=$1 AND user_id=$2", [
      id,
      user,
      status,
    ]);
    if (status === "canceled") {
      await tx(
        "UPDATE aw_runs SET status='canceled',finished_at=NOW() WHERE id IN (SELECT run_id FROM aw_campaign_recipients WHERE campaign_id=$1) AND status IN ('queued','waiting','running')",
        [id],
      );
      await tx(
        "UPDATE aw_campaign_recipients SET state='skipped',reason='campaign_canceled' WHERE campaign_id=$1 AND state='pending'",
        [id],
      );
    }
    return { ...c, status };
  });
}
