const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const express = require("express");
test("opt-out requires confirmation; attribution requires exact clicked session, ownership and real sent message", async (t) => {
  const db = new PGlite();
  await db.exec(
    `CREATE FUNCTION uuid_generate_v4() RETURNS UUID LANGUAGE SQL AS 'SELECT gen_random_uuid()';CREATE TABLE users(id UUID PRIMARY KEY);CREATE TABLE tracking_sources(id UUID PRIMARY KEY,user_id UUID);CREATE TABLE tracking_orders(id UUID PRIMARY KEY,source_id UUID,status TEXT,product_id TEXT,customer_email TEXT,customer_phone TEXT,gross_value NUMERIC,currency TEXT,payment_method TEXT,external_order_id TEXT,product_name TEXT,sck TEXT);CREATE TABLE comm_deals(id UUID PRIMARY KEY,user_id UUID,contact_email TEXT,contact_phone TEXT);`,
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
  const c = require("../dist/database/connection"),
    q = async (sql, p) => (await db.query(sql, p)).rows;
  c.query = q;
  c.queryOne = async (sql, p) => (await q(sql, p))[0] || null;
  c.transaction = (fn) =>
    db.transaction(async (tx) =>
      fn(async (sql, p) => (await tx.query(sql, p)).rows),
    );
  const {
    createLink,
    attributeApproved,
    workflowPublicController,
  } = require("../dist/automation/workflows/links");
  const user = randomUUID(),
    other = randomUUID(),
    source = randomUUID(),
    flow = randomUUID(),
    run = randomUUID(),
    deal = randomUUID(),
    message = randomUUID(),
    order = randomUUID();
  await q("INSERT INTO users VALUES($1),($2)", [user, other]);
  await q("INSERT INTO tracking_sources VALUES($1,$2)", [source, user]);
  await q("INSERT INTO comm_deals VALUES($1,$2,$3,$4)", [
    deal,
    user,
    "test@example.invalid",
    "",
  ]);
  await q(
    "INSERT INTO aw_flows(id,user_id,name,graph) VALUES($1,$2,'Links','{}')",
    [flow, user],
  );
  await q(
    "INSERT INTO aw_versions(flow_id,version,user_id,graph,source_id) VALUES($1,1,$2,'{}',$3)",
    [flow, user, source],
  );
  await q(
    "INSERT INTO aw_runs(id,user_id,flow_id,version,deal_id,recovery) VALUES($1,$2,$3,1,$4,TRUE)",
    [run, user, flow, deal],
  );
  await q(
    "INSERT INTO aw_messages(id,user_id,run_id,node_id,deal_id,channel,status) VALUES($1,$2,$3,'message',$4,'email','sent')",
    [message, user, run, deal],
  );
  process.env.AUTOMATION_PUBLIC_BASE_URL =
    "https://automation.example.invalid/api/v1";
  t.after(() => delete process.env.AUTOMATION_PUBLIC_BASE_URL);
  const input = {
    userId: user,
    runId: run,
    messageId: message,
    dealId: deal,
    channel: "email",
  };
  const click = await createLink(q, {
      ...input,
      kind: "click",
      url: "https://checkout.example.invalid/pay",
    }),
    optout = await createLink(q, { ...input, kind: "unsubscribe" });
  const app = express();
  app.use("/api/v1/automation-public", workflowPublicController);
  app.use((err, req, res, next) => res.status(500).end());
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await db.close();
    await c.pool.end();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const local = (url) => base + new URL(url).pathname;
  assert.equal((await fetch(local(optout))).status, 200);
  assert.equal((await q("SELECT * FROM aw_consents")).length, 0);
  assert.equal((await fetch(local(optout), { method: "POST" })).status, 200);
  assert.equal(
    (await q("SELECT status FROM aw_consents"))[0].status,
    "opted_out",
  );
  assert.equal((await fetch(local(optout), { method: "POST" })).status, 200);
  const [link] = await q("SELECT tracking_id FROM aw_links WHERE kind='click'");
  await q(
    "INSERT INTO tracking_orders(id,source_id,status,sck) VALUES($1,$2,'approved',$3)",
    [order, source, link.tracking_id],
  );
  const e = { order_id: order, user_id: user, product_id: null };
  await attributeApproved(q, e);
  assert.equal((await q("SELECT * FROM aw_attributions")).length, 0);
  const redirect = await fetch(local(click), { redirect: "manual" });
  assert.equal(redirect.status, 302);
  assert.equal(
    new URL(redirect.headers.get("location")).searchParams.get("sck"),
    link.tracking_id,
  );
  await attributeApproved(q, { ...e, user_id: other });
  assert.equal((await q("SELECT * FROM aw_attributions")).length, 0);
  await attributeApproved(q, e);
  await attributeApproved(q, e);
  assert.equal((await q("SELECT * FROM aw_attributions")).length, 1);
  assert.equal(
    (await q("SELECT recovered FROM aw_attributions"))[0].recovered,
    true,
  );
  const otherOrder = randomUUID();
  await q(
    "INSERT INTO tracking_orders(id,source_id,status,sck) VALUES($1,$2,'approved','unrelated-session')",
    [otherOrder, source],
  );
  await attributeApproved(q, { ...e, order_id: otherOrder });
  assert.equal((await q("SELECT * FROM aw_attributions")).length, 1);
});
