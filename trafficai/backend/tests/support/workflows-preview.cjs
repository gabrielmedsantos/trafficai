// Local-only integration preview. No production database, credentials or outbound sends.
process.env.NODE_ENV = "test";
process.env.AUTOMATION_SENDS_ENABLED = "false";
process.env.AUTOMATION_WORKFLOWS_ENABLED = "true";
process.env.AUTOMATION_EXTERNAL_ACTIONS_ENABLED = "false";
process.env.AUTOMATION_PAID_AGENTS_ENABLED = "false";
const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs");
const express = require("express");
const { randomUUID } = require("node:crypto");
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE FUNCTION uuid_generate_v4() RETURNS UUID LANGUAGE SQL AS 'SELECT gen_random_uuid()';
CREATE TABLE users(id UUID PRIMARY KEY,role TEXT,name TEXT,email TEXT,capabilities JSONB);
CREATE TABLE tracking_sources(id UUID PRIMARY KEY,user_id UUID,name TEXT);
CREATE TABLE tracking_orders(id UUID PRIMARY KEY,source_id UUID,status TEXT,product_id TEXT,customer_email TEXT,customer_phone TEXT,gross_value NUMERIC,currency TEXT,payment_method TEXT,external_order_id TEXT,product_name TEXT,sck TEXT);
CREATE TABLE comm_deals(id UUID PRIMARY KEY,user_id UUID,contact_email TEXT,contact_phone TEXT,contact_name TEXT,title TEXT,status TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE comm_integrations(id UUID PRIMARY KEY,user_id UUID,type TEXT,status TEXT,name TEXT,config JSONB,credentials JSONB);
CREATE TABLE audit_log(id UUID DEFAULT gen_random_uuid(),user_id UUID,user_name TEXT,action TEXT,entity_type TEXT,entity_id UUID,entity_label TEXT,details JSONB);
CREATE TABLE comm_tasks(id UUID DEFAULT gen_random_uuid(),user_id UUID,deal_id UUID,title TEXT,description TEXT,type TEXT,status TEXT,external_source TEXT,external_id TEXT,due_at TIMESTAMPTZ,UNIQUE(user_id,external_source,external_id));`);
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
  const connection = require("../../dist/database/connection");
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  connection.query = q;
  connection.queryOne = async (sql, params) =>
    (await q(sql, params))[0] || null;
  connection.transaction = async (fn) =>
    db.transaction(async (tx) =>
      fn(async (sql, params) => (await tx.query(sql, params)).rows),
    );
  const owner = randomUUID();
  await q(
    "INSERT INTO users VALUES($1,'admin','Ambiente local','preview@example.invalid',NULL)",
    [owner],
  );
  const { encrypt } = require("../../dist/shared/encryption");
  process.env.ENCRYPTION_KEY = require("node:crypto")
    .randomBytes(32)
    .toString("hex");
  const contact = randomUUID(),
    emailConnection = randomUUID(),
    whatsapp = randomUUID();
  await q(
    "INSERT INTO comm_deals(id,user_id,contact_name,contact_email,contact_phone,status) VALUES($1,$2,'Contato de teste local','preview@example.invalid','5511999999999','open')",
    [contact, owner],
  );
  for (const channel of ["email", "whatsapp"])
    await q(
      "INSERT INTO aw_consents(user_id,deal_id,channel,status,evidence) VALUES($1,$2,$3,'opted_in','Somente fixture local')",
      [owner, contact, channel],
    );
  await q(
    "INSERT INTO aw_integrations(id,user_id,name,provider,config,credentials_encrypted) VALUES($1,$2,'Resend — TESTE LOCAL','resend',$3,$4)",
    [
      emailConnection,
      owner,
      JSON.stringify({ from: "preview@example.invalid" }),
      encrypt(JSON.stringify({ token: "not-a-real-credential" })),
    ],
  );
  await q(
    "INSERT INTO comm_integrations(id,user_id,name,type,status,config,credentials) VALUES($1,$2,'Linha B — TESTE LOCAL','whatsapp_evolution','connected',$3,$4)",
    [
      whatsapp,
      owner,
      JSON.stringify({
        baseUrl: "https://evolution.example.invalid",
        instanceName: "preview-b",
      }),
      JSON.stringify({ evolution_api_key: "not-a-real-credential" }),
    ],
  );
  for (const [name, body, channel] of [
    [
      "Boas-vindas — TESTE LOCAL",
      "Olá {{name}}, bem-vinda à sequência!",
      "email",
    ],
    [
      "Próximo passo — TESTE LOCAL",
      "Veja as próximas dicas, {{name}}.",
      "email",
    ],
    [
      "WhatsApp — TESTE LOCAL",
      "Olá {{name}}, sua mensagem de exemplo.",
      "whatsapp",
    ],
  ])
    await q(
      "INSERT INTO aw_templates(user_id,name,channel,subject,body,purpose) VALUES($1,$2,$3,'Mensagem de exemplo',$4,'transactional')",
      [owner, name, channel, body],
    );
  require("../../dist/auth/auth.middleware").authMiddleware = (
    req,
    res,
    next,
  ) => {
    req.user = { userId: owner, actorId: owner };
    next();
  };
  const {
    workflowController,
  } = require("../../dist/automation/workflows/controller");
  const {
    workflowPublicController,
  } = require("../../dist/automation/workflows/links");
  const { workflowTick } = require("../../dist/automation/workflows/worker");
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3400");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json());
  app.use("/api/v1/automation/workflows", workflowController);
  app.use("/api/v1/automation-public", workflowPublicController);
  app.use((err, req, res, next) =>
    res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: err.statusCode
          ? err.message
          : "Erro interno no ambiente local",
      },
    }),
  );
  app.listen(3001, "127.0.0.1", () =>
    console.log("Local isolated preview API on 3001. No outbound sends."),
  );
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await workflowTick();
    } catch {
      console.error("Preview cycle failed");
    } finally {
      running = false;
    }
  }, 1000);
})();
