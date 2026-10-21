const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { randomUUID, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const express = require("express");
const jwt = require("jsonwebtoken");
test("workflow HTTP API: authentication, capabilities, tenant boundaries, publication and safe errors", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = randomBytes(32).toString("hex");
  const db = new PGlite();
  await db.exec(
    `CREATE FUNCTION uuid_generate_v4() RETURNS UUID LANGUAGE SQL AS 'SELECT gen_random_uuid()';CREATE TABLE users(id UUID PRIMARY KEY,name TEXT,email TEXT,role TEXT,owner_id UUID,suspended_at TIMESTAMPTZ,last_seen_at TIMESTAMPTZ,capabilities JSONB);CREATE TABLE tracking_sources(id UUID PRIMARY KEY,user_id UUID,name TEXT);CREATE TABLE tracking_orders(id UUID PRIMARY KEY,source_id UUID,status TEXT,product_id TEXT,customer_email TEXT,customer_phone TEXT,gross_value NUMERIC,currency TEXT,payment_method TEXT,external_order_id TEXT,product_name TEXT,sck TEXT);CREATE TABLE comm_deals(id UUID PRIMARY KEY,user_id UUID,contact_email TEXT,contact_phone TEXT,contact_name TEXT,title TEXT,status TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());CREATE TABLE comm_integrations(id UUID PRIMARY KEY,user_id UUID,name TEXT,type TEXT,status TEXT);CREATE TABLE audit_log(user_id UUID,user_name TEXT,action TEXT,entity_type TEXT,entity_id UUID,entity_label TEXT,details JSONB);`,
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
  const owner = randomUUID(),
    other = randomUUID(),
    member = randomUUID(),
    source = randomUUID();
  await q(
    "INSERT INTO users(id,name,email,role,owner_id,capabilities) VALUES($1,'Owner','owner@example.invalid','admin',NULL,NULL),($2,'Other','other@example.invalid','admin',NULL,NULL),($3,'Member','member@example.invalid','member',$1,'[]')",
    [owner, other, member],
  );
  await q("INSERT INTO tracking_sources VALUES($1,$2,'Teste')", [
    source,
    owner,
  ]);
  const app = express();
  app.use(express.json());
  app.use(
    "/wf",
    require("../dist/automation/workflows/controller").workflowController,
  );
  app.use((err, req, res, next) =>
    res.status(err.statusCode || 500).json({
      success: false,
      error: { message: err.statusCode ? err.message : "Erro interno" },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await db.close();
    await connection.pool.end();
  });
  const base = "http://127.0.0.1:" + server.address().port + "/wf";
  const tokens = new Map(
    [owner, other, member].map((id) => [
      id,
      jwt.sign(
        { userId: id, email: "test@example.invalid" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" },
      ),
    ]),
  );
  async function call(method, path, body, id = owner) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(id ? { Authorization: "Bearer " + tokens.get(id) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await call("GET", "/flows", null, null)).status, 401);
  assert.equal((await call("GET", "/flows", null, member)).status, 403);
  assert.equal(
    (
      await call(
        "POST",
        "/products",
        { name: "Produto de outra conta", source_id: source },
        other,
      )
    ).status,
    404,
  );
  const graph = {
    schemaVersion: 1,
    nodes: [
      {
        id: "start",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { label: "Início", config: { event: "manual" } },
      },
      {
        id: "end",
        type: "end",
        position: { x: 300, y: 0 },
        data: { label: "Fim", config: {} },
      },
    ],
    edges: [{ id: "e", source: "start", target: "end" }],
  };
  const created = await call("POST", "/flows", {
    name: "Fluxo via API",
    graph,
    source_id: source,
  });
  assert.equal(created.status, 200);
  const id = created.data.data.id;
  assert.equal((await call("GET", "/flows/" + id, null, other)).status, 404);
  assert.equal(
    (
      await call("PUT", "/flows/" + id, {
        name: "Revisão inválida",
        revision: 99,
        graph,
      })
    ).status,
    422,
  );
  assert.equal(
    (await call("POST", "/flows/" + id + "/publish", {})).status,
    200,
  );
  assert.equal(
    (await call("POST", "/flows/" + id + "/test", {})).data.data.test_mode,
    true,
  );
  await assert.rejects(() =>
    q("UPDATE aw_versions SET graph='{}' WHERE flow_id=$1", [id]),
  );
  assert.equal((await call("GET", "/overview?since=invalid")).status, 422);
  assert.equal((await call("GET", "/overview")).status, 200);
  const bad = {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: "loose",
        type: "end",
        position: { x: 10, y: 10 },
        data: { label: "Solto", config: {} },
      },
    ],
  };
  await call("PUT", "/flows/" + id, { name: "Solto", revision: 1, graph: bad });
  const invalid = await call("POST", "/flows/" + id + "/publish", {});
  assert.equal(invalid.status, 422);
  assert.ok(invalid.data.error.issues.length);
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const temporaryCredential = randomBytes(24).toString("hex");
  const configured = await call("POST", "/integrations", {
    name: "Email teste",
    provider: "resend",
    config: { from: "teste@example.invalid" },
    token: temporaryCredential,
  });
  assert.equal(configured.status, 200);
  assert.equal(
    JSON.stringify(configured.data).includes(temporaryCredential),
    false,
  );
  const listed = await call("GET", "/integrations");
  assert.equal(listed.status, 200);
  assert.equal(
    JSON.stringify(listed.data).includes(temporaryCredential),
    false,
  );
  const [encrypted] = await q(
    "SELECT credentials_encrypted FROM aw_integrations WHERE id=$1",
    [configured.data.data.id],
  );
  assert.ok(encrypted.credentials_encrypted);
  assert.equal(
    encrypted.credentials_encrypted.includes(temporaryCredential),
    false,
  );
  assert.equal(
    (await call("GET", "/integrations", null, other)).data.data.length,
    0,
  );
});
