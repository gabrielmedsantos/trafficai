const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const {
  graphIssues,
  renderVariables,
  emailHtml,
} = require("../dist/automation/workflows/validation");
const { publicAddress } = require("../dist/automation/workflows/providers");
const graph = () => ({
  schemaVersion: 1,
  nodes: [
    {
      id: "start",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: { label: "Início", config: { event: "manual" } },
    },
    {
      id: "wait",
      type: "wait",
      position: { x: 200, y: 0 },
      data: { label: "Esperar", config: { seconds: 60 } },
    },
    {
      id: "end",
      type: "end",
      position: { x: 400, y: 0 },
      data: { label: "Fim", config: {} },
    },
  ],
  edges: [
    { id: "a", source: "start", target: "wait" },
    { id: "b", source: "wait", target: "end" },
  ],
});
test("graph rejects cycles, missing branches and malformed nodes; content is escaped", () => {
  assert.deepEqual(graphIssues(graph(), true), []);
  let g = graph();
  g.edges.push({ id: "cycle", source: "end", target: "wait" });
  assert.ok(graphIssues(g, true).length);
  g = graph();
  g.nodes[1].type = "condition";
  g.nodes[1].data.config = { kind: "order_status", value: "approved" };
  assert.ok(graphIssues(g, true).some((x) => x.message.includes("Sim")));
  assert.ok(
    graphIssues({ schemaVersion: 1, nodes: [null], edges: [] }, true).length,
  );
  assert.throws(() => renderVariables("{{unknown}}", {}));
  assert.equal(renderVariables("Olá {{name}}", { name: "Ana" }), "Olá Ana");
  assert.ok(
    emailHtml(
      [{ type: "text", text: "<script>alert(1)</script>" }],
      "",
    ).includes("&lt;script&gt;"),
  );
  assert.throws(() =>
    emailHtml([{ type: "button", text: "x", url: "javascript:alert(1)" }], ""),
  );
  for (const ip of [
    "127.0.0.1",
    "169.254.169.254",
    "10.0.0.5",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
});
test("migration, owner isolation, immutable version, persisted waits, dry-run, cancellation, outbox dedupe", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE FUNCTION uuid_generate_v4() RETURNS UUID LANGUAGE SQL AS 'SELECT gen_random_uuid()';
 CREATE TABLE users(id UUID PRIMARY KEY);
 CREATE TABLE tracking_sources(id UUID PRIMARY KEY,user_id UUID,name TEXT);
 CREATE TABLE tracking_orders(id UUID PRIMARY KEY,source_id UUID,status TEXT,product_id TEXT,customer_email TEXT,customer_phone TEXT,gross_value NUMERIC,currency TEXT,payment_method TEXT,external_order_id TEXT,product_name TEXT,sck TEXT);
 CREATE TABLE comm_deals(id UUID PRIMARY KEY,user_id UUID,contact_email TEXT,contact_phone TEXT,contact_name TEXT,title TEXT,status TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());`);
  await db.exec(
    fs.readFileSync(
      "src/database/migrations/087_automation_workflows.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "src/database/migrations/088_automation_audiences.sql",
      "utf8",
    ),
  );
  const connection = require("../dist/database/connection");
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  connection.query = q;
  connection.queryOne = async (sql, params) =>
    (await q(sql, params))[0] || null;
  connection.transaction = async (fn) =>
    db.transaction(async (tx) =>
      fn(async (sql, params) => (await tx.query(sql, params)).rows),
    );
  const {
    saveFlow,
    publishFlow,
    owned,
  } = require("../dist/automation/workflows/repository");
  const { dispatchEvents } = require("../dist/automation/workflows/events");
  const {
    claimJob,
    executeJob,
    isSendWindow,
  } = require("../dist/automation/workflows/engine");
  const owner = randomUUID(),
    other = randomUUID(),
    source = randomUUID(),
    order = randomUUID();
  await q("INSERT INTO users VALUES($1),($2)", [owner, other]);
  await q("INSERT INTO tracking_sources VALUES($1,$2,$3)", [
    source,
    owner,
    "Teste",
  ]);
  const f = await saveFlow(owner, {
    name: "Fluxo real",
    graph: graph(),
    source_id: source,
  });
  await assert.rejects(() => owned("aw_flows", f.id, other));
  await publishFlow(owner, f.id);
  await saveFlow(
    owner,
    {
      name: "Novo rascunho",
      graph: graph(),
      revision: 1,
      recovery: true,
      source_id: source,
    },
    f.id,
  );
  assert.equal(
    (await q("SELECT recovery FROM aw_versions WHERE flow_id=$1", [f.id]))[0]
      .recovery,
    false,
  );
  await assert.rejects(() =>
    saveFlow(owner, { name: "Conflito", graph: graph(), revision: 1 }, f.id),
  );
  const [r] = await q(
    "INSERT INTO aw_runs(user_id,flow_id,version,test_mode) VALUES($1,$2,1,TRUE) RETURNING *",
    [owner, f.id],
  );
  await q("INSERT INTO aw_jobs(run_id,node_id) VALUES($1,$2)", [r.id, "start"]);
  for (let i = 0; i < 3; i++) {
    const j = await claimJob();
    assert.ok(j);
    await executeJob(j, () => {
      throw Error("Provider called by dry run");
    });
  }
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE id=$1", [r.id]))[0].status,
    "completed",
  );
  assert.equal(
    (await q("SELECT * FROM aw_steps WHERE run_id=$1", [r.id])).length,
    3,
  );
  const [waiting] = await q(
    "INSERT INTO aw_runs(user_id,flow_id,version) VALUES($1,$2,1) RETURNING *",
    [owner, f.id],
  );
  await q("INSERT INTO aw_jobs(run_id,node_id) VALUES($1,$2)", [
    waiting.id,
    "wait",
  ]);
  await executeJob(await claimJob());
  assert.equal(await claimJob(), null);
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE id=$1", [waiting.id]))[0].status,
    "waiting",
  );
  await q("INSERT INTO tracking_orders(id,source_id,status) VALUES($1,$2,$3)", [
    order,
    source,
    "pending",
  ]);
  await q("UPDATE tracking_orders SET status='approved' WHERE id=$1", [order]);
  await q("UPDATE tracking_orders SET status='approved' WHERE id=$1", [order]);
  assert.equal(
    (await q("SELECT * FROM aw_events WHERE order_id=$1", [order])).length,
    2,
  );
  const [recovery] = await q(
    "INSERT INTO aw_runs(user_id,flow_id,version,order_id,recovery) VALUES($1,$2,1,$3,TRUE) RETURNING *",
    [owner, f.id, order],
  );
  await q("INSERT INTO aw_jobs(run_id,node_id) VALUES($1,'wait')", [
    recovery.id,
  ]);
  await dispatchEvents();
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE id=$1", [recovery.id]))[0]
      .status,
    "canceled",
  );
  assert.equal(
    isSendWindow(
      {
        time_zone: "America/Fortaleza",
        days: [1],
        allowed_start: 8,
        allowed_end: 20,
      },
      new Date("2026-10-19T15:00:00Z"),
    ),
    true,
  );
  assert.equal(isSendWindow({ days: [] }, new Date()), false);
  await connection.pool.end();
});
test("message engine: consent, provider id, uncertain result, rate limits and interrupted leases", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    `CREATE FUNCTION uuid_generate_v4() RETURNS UUID LANGUAGE SQL AS 'SELECT gen_random_uuid()';CREATE TABLE users(id UUID PRIMARY KEY);CREATE TABLE tracking_sources(id UUID PRIMARY KEY,user_id UUID);CREATE TABLE tracking_orders(id UUID PRIMARY KEY,source_id UUID,status TEXT,product_id TEXT,customer_email TEXT,customer_phone TEXT,gross_value NUMERIC,currency TEXT,payment_method TEXT,external_order_id TEXT,product_name TEXT,sck TEXT);CREATE TABLE comm_deals(id UUID PRIMARY KEY,user_id UUID,contact_email TEXT,contact_phone TEXT,contact_name TEXT,title TEXT,status TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());`,
  );
  await db.exec(
    fs.readFileSync(
      "src/database/migrations/087_automation_workflows.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "src/database/migrations/088_automation_audiences.sql",
      "utf8",
    ),
  );
  const connection = require("../dist/database/connection");
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  connection.query = q;
  connection.queryOne = async (sql, params) =>
    (await q(sql, params))[0] || null;
  connection.transaction = async (fn) =>
    db.transaction(async (tx) =>
      fn(async (sql, params) => (await tx.query(sql, params)).rows),
    );
  const {
    claimJob,
    executeJob,
  } = require("../dist/automation/workflows/engine");
  const { ProviderError } = require("../dist/automation/workflows/providers");
  const user = randomUUID(),
    flow = randomUUID(),
    deal = randomUUID(),
    template = randomUUID(),
    integration = randomUUID();
  await q("INSERT INTO users VALUES($1)", [user]);
  await q(
    "INSERT INTO comm_deals(id,user_id,contact_name,contact_email) VALUES($1,$2,'Ana','test@example.invalid')",
    [deal, user],
  );
  await q(
    "INSERT INTO aw_templates(id,user_id,name,channel,body,purpose) VALUES($1,$2,'Teste','email','Olá {{name}}','transactional')",
    [template, user],
  );
  const g = graph();
  g.nodes[1] = {
    id: "wait",
    type: "message",
    position: { x: 200, y: 0 },
    data: {
      label: "Email",
      config: {
        channel: "email",
        templateId: template,
        integrationId: integration,
      },
    },
  };
  await q(
    "INSERT INTO aw_flows(id,user_id,name,status,graph,published_version) VALUES($1,$2,'Mensagens','active',$3,1)",
    [flow, user, JSON.stringify(g)],
  );
  await q(
    "INSERT INTO aw_versions(flow_id,version,user_id,graph,settings) VALUES($1,1,$2,$3,$4)",
    [
      flow,
      user,
      JSON.stringify(g),
      JSON.stringify({
        days: [0, 1, 2, 3, 4, 5, 6],
        allowed_start: 0,
        allowed_end: 24,
      }),
    ],
  );
  async function run() {
    await q("UPDATE aw_sender_limits SET next_at=NOW()");
    const [r] = await q(
      "INSERT INTO aw_runs(user_id,flow_id,version,deal_id) VALUES($1,$2,1,$3) RETURNING *",
      [user, flow, deal],
    );
    await q("INSERT INTO aw_jobs(run_id,node_id) VALUES($1,'wait')", [r.id]);
    return r;
  }
  process.env.AUTOMATION_SENDS_ENABLED = "true";
  t.after(() => delete process.env.AUTOMATION_SENDS_ENABLED);
  let calls = 0;
  let r = await run();
  await executeJob(await claimJob(), async () => {
    calls++;
    return { id: "x", provider: "fake" };
  });
  assert.equal(calls, 0);
  assert.equal(
    (await q("SELECT status FROM aw_messages WHERE run_id=$1", [r.id]))[0]
      .status,
    "suppressed",
  );
  await q(
    "INSERT INTO aw_consents(user_id,deal_id,channel,status,evidence) VALUES($1,$2,'email','opted_in','Test fixture')",
    [user, deal],
  );
  r = await run();
  const j = await claimJob();
  await executeJob(j, async () => {
    calls++;
    return { id: "provider-one", provider: "fake" };
  });
  await executeJob(j, async () => {
    throw Error("Duplicated");
  });
  assert.equal(calls, 1);
  assert.equal(
    (await q("SELECT provider_id FROM aw_messages WHERE run_id=$1", [r.id]))[0]
      .provider_id,
    "provider-one",
  );
  await executeJob(await claimJob());
  r = await run();
  await executeJob(await claimJob(), async () => {
    throw new ProviderError("TIMEOUT", false, true);
  });
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE id=$1", [r.id]))[0].status,
    "intervention",
  );
  assert.equal(
    (await q("SELECT status FROM aw_messages WHERE run_id=$1", [r.id]))[0]
      .status,
    "unknown",
  );
  assert.equal(await claimJob(), null);
  r = await run();
  await executeJob(await claimJob(), async () => {
    throw new ProviderError("RATE_LIMIT", true);
  });
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE id=$1", [r.id]))[0].status,
    "waiting",
  );
  assert.equal(await claimJob(), null);
  await q("UPDATE aw_runs SET status='canceled' WHERE id=$1", [r.id]);
  r = await run();
  await claimJob();
  await q(
    "UPDATE aw_jobs SET locked_until=NOW()-INTERVAL '1 minute' WHERE run_id=$1",
    [r.id],
  );
  assert.equal(await claimJob(), null);
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE id=$1", [r.id]))[0].status,
    "intervention",
  );
  r = await run();
  const pausedJob = await claimJob();
  await q("UPDATE aw_flows SET status='paused' WHERE id=$1", [flow]);
  await executeJob(pausedJob, async () => {
    throw Error("A paused flow must not send");
  });
  assert.equal(
    (await q("SELECT status FROM aw_jobs WHERE id=$1", [pausedJob.id]))[0]
      .status,
    "waiting",
  );
  assert.equal(await claimJob(), null);
  await q("UPDATE aw_flows SET status='active' WHERE id=$1", [flow]);
  await q("UPDATE aw_jobs SET due_at=NOW() WHERE id=$1", [pausedJob.id]);
  await executeJob(await claimJob(), async () => ({
    id: "resumed",
    provider: "fake",
  }));
  await executeJob(await claimJob());
  const { destinationHash } = require("../dist/automation/workflows/consent");
  await q(
    "INSERT INTO aw_suppressions(user_id,channel,destination_hash) VALUES($1,'email',$2)",
    [user, destinationHash("email", "test@example.invalid")],
  );
  r = await run();
  await executeJob(await claimJob(), async () => {
    throw Error("Suppression must override deal consent");
  });
  assert.equal(
    (await q("SELECT status FROM aw_messages WHERE run_id=$1", [r.id]))[0]
      .status,
    "suppressed",
  );
});
