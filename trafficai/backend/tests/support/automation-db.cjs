let poolClosed = false;
const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs");
exports.fixture = async () => {
  const db = new PGlite();
  await db.exec(`CREATE FUNCTION uuid_generate_v4() RETURNS UUID LANGUAGE SQL AS 'SELECT gen_random_uuid()';
CREATE TABLE users(id UUID PRIMARY KEY,name TEXT,email TEXT,role TEXT,owner_id UUID,suspended_at TIMESTAMPTZ,last_seen_at TIMESTAMPTZ,capabilities JSONB);
CREATE TABLE tracking_sources(id UUID PRIMARY KEY,user_id UUID,name TEXT);
CREATE TABLE tracking_orders(id UUID PRIMARY KEY,source_id UUID,status TEXT,product_id TEXT,customer_email TEXT,customer_phone TEXT,gross_value NUMERIC,currency TEXT,payment_method TEXT,external_order_id TEXT,product_name TEXT,sck TEXT,raw JSONB);
CREATE TABLE comm_deals(id UUID PRIMARY KEY,user_id UUID,contact_email TEXT,contact_phone TEXT,contact_name TEXT,title TEXT,status TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE comm_integrations(id UUID PRIMARY KEY,user_id UUID,name TEXT,type TEXT,status TEXT,config JSONB,credentials JSONB);
CREATE TABLE comm_tasks(id UUID DEFAULT gen_random_uuid(),user_id UUID,deal_id UUID,title TEXT,description TEXT,type TEXT,status TEXT,external_source TEXT,external_id TEXT,due_at TIMESTAMPTZ,UNIQUE(user_id,external_source,external_id));
CREATE TABLE audit_log(user_id UUID,user_name TEXT,action TEXT,entity_type TEXT,entity_id UUID,entity_label TEXT,details JSONB);`);
  for (const name of [
    "083_quiz_sessions.sql",
    "087_automation_workflows.sql",
    "088_automation_audiences.sql",
  ])
    await db.exec(fs.readFileSync("src/database/migrations/" + name, "utf8"));
  const c = require("../../dist/database/connection");
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  c.query = q;
  c.queryOne = async (sql, p) => (await q(sql, p))[0] || null;
  c.transaction = (fn) =>
    db.transaction(async (tx) =>
      fn(async (sql, p) => (await tx.query(sql, p)).rows),
    );
  return {
    db,
    q,
    c,
    close: async () => {
      await db.close();
      if (!poolClosed) {
        poolClosed = true;
        await c.pool.end();
      }
    },
  };
};
