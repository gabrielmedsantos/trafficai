const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { randomUUID, randomBytes, createHmac } = require("node:crypto"),
  { fixture } = require("./support/automation-db.cjs");
test("assinaturas Resend/Twilio: rejeita evento forjado e aceita corpo original assinado", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q } = f;
  const express = require("express"),
    { Webhook } = require("svix"),
    { encrypt } = require("../dist/shared/encryption");
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.AUTOMATION_PUBLIC_BASE_URL = "https://api.example.invalid/api/v1";
  const user = randomUUID(),
    resend = randomUUID(),
    twilio = randomUUID(),
    secret = "whsec_" + randomBytes(32).toString("base64"),
    token = randomBytes(32).toString("hex");
  await q("INSERT INTO users(id) VALUES($1)", [user]);
  for (const [id, provider, credential] of [
    [resend, "resend", { token, webhook_secret: secret }],
    [twilio, "twilio", { token }],
  ]) {
    await q(
      "INSERT INTO aw_integrations(id,user_id,name,provider,credentials_encrypted) VALUES($1,$2,$3,$3,$4)",
      [id, user, provider, encrypt(JSON.stringify(credential))],
    );
    await q(
      "INSERT INTO aw_messages(user_id,node_id,channel,status,provider,provider_id,integration_id) VALUES($1,'msg','email','sent',$2,$3,$4)",
      [user, provider, provider + "-message", id],
    );
  }
  const app = express();
  app.use(
    "/receipts",
    require("../dist/automation/workflows/receipts").receiptController,
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = "http://127.0.0.1:" + server.address().port + "/receipts";
  const payload = JSON.stringify({
    type: "email.delivered",
    data: { email_id: "resend-message" },
  });
  assert.equal(
    (
      await fetch(base + "/resend/" + resend, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
    ).status,
    401,
  );
  const id = "evt_" + randomUUID(),
    time = new Date(),
    signature = new Webhook(secret).sign(id, time, payload);
  assert.equal(
    (
      await fetch(base + "/resend/" + resend, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "svix-id": id,
          "svix-timestamp": String(Math.floor(time.getTime() / 1000)),
          "svix-signature": signature,
        },
        body: payload,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await q("SELECT status FROM aw_messages WHERE integration_id=$1", [
        resend,
      ])
    )[0].status,
    "delivered",
  );
  const params = { MessageSid: "twilio-message", MessageStatus: "delivered" },
    url =
      process.env.AUTOMATION_PUBLIC_BASE_URL +
      "/automation-public/receipts/twilio/" +
      twilio,
    signed =
      url +
      Object.keys(params)
        .sort()
        .map((k) => k + params[k])
        .join(""),
    sig = createHmac("sha1", token).update(signed).digest("base64");
  for (const [s, status] of [
    ["invalid", 401],
    [sig, 200],
  ])
    assert.equal(
      (
        await fetch(base + "/twilio/" + twilio, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-twilio-signature": s,
          },
          body: new URLSearchParams(params),
        })
      ).status,
      status,
    );
  assert.equal(
    (
      await q("SELECT status FROM aw_messages WHERE integration_id=$1", [
        twilio,
      ])
    )[0].status,
    "delivered",
  );
});
test("agente externo respeita custo autorizado e contrato de retorno usando transporte simulado", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q } = f;
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { encrypt } = require("../dist/shared/encryption"),
    { executeExternal } = require("../dist/automation/workflows/external");
  const user = randomUUID(),
    id = randomUUID(),
    run = randomUUID();
  await q("INSERT INTO users(id) VALUES($1)", [user]);
  await q(
    "INSERT INTO aw_integrations(id,user_id,name,provider,config,credentials_encrypted) VALUES($1,$2,'Agent','agent_webhook',$3,$4)",
    [
      id,
      user,
      JSON.stringify({
        url: "https://agent.example.invalid/run",
        paid: true,
        cost_per_call: 0.02,
        currency: "USD",
      }),
      encrypt(JSON.stringify({ token: randomBytes(20).toString("hex") })),
    ],
  );
  const input = {
    userId: user,
    runId: run,
    nodeId: "agent",
    kind: "agent",
    integrationId: id,
    config: { costApproved: true },
    context: { product: { name: "Produto" } },
  };
  let calls = 0;
  const request = async (url, body) => {
    calls++;
    assert.equal(body.input.contact_email, undefined);
    return {
      execution_id: run,
      status: "completed",
      output: { result: "Sugestão" },
      cost: { amount: 0.01, currency: "USD" },
    };
  };
  delete process.env.AUTOMATION_EXTERNAL_ACTIONS_ENABLED;
  await assert.rejects(
    () => executeExternal(input, request),
    /EXTERNAL_ACTIONS_DISABLED/,
  );
  process.env.AUTOMATION_EXTERNAL_ACTIONS_ENABLED = "true";
  delete process.env.AUTOMATION_PAID_AGENTS_ENABLED;
  await assert.rejects(
    () => executeExternal(input, request),
    /PAID_AGENT_NOT_AUTHORIZED/,
  );
  assert.equal(calls, 0);
  process.env.AUTOMATION_PAID_AGENTS_ENABLED = "true";
  assert.equal((await executeExternal(input, request)).result, "Sugestão");
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      executeExternal(input, async () => ({
        execution_id: run,
        status: "completed",
        cost: { amount: 5, currency: "USD" },
      })),
    /AGENT_COST_UNVERIFIED/,
  );
  delete process.env.AUTOMATION_EXTERNAL_ACTIONS_ENABLED;
  delete process.env.AUTOMATION_PAID_AGENTS_ENABLED;
});
test("transporte fixa DNS, respeita lookup all do Node e bloqueia endereços especiais", async (t) => {
  const dns = require("node:dns/promises"),
    https = require("node:https"),
    { EventEmitter } = require("node:events"),
    {
      pinnedRequest,
      publicAddress,
    } = require("../dist/automation/workflows/providers");
  const lookup = dns.lookup,
    request = https.request;
  t.after(() => {
    dns.lookup = lookup;
    https.request = request;
  });
  dns.lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  let calls = 0;
  https.request = (url, options, handle) => {
    calls++;
    options.lookup("api.example.invalid", { all: true }, (err, addresses) => {
      assert.equal(err, null);
      assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
    });
    const req = new EventEmitter();
    req.end = () =>
      queueMicrotask(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        handle(res);
        res.emit("data", Buffer.from('{"ok":true}'));
        res.emit("end");
      });
    return req;
  };
  assert.deepEqual(
    await pinnedRequest("https://api.example.invalid/test", {}),
    { ok: true },
  );
  dns.lookup = async () => [{ address: "127.0.0.1", family: 4 }];
  await assert.rejects(
    () => pinnedRequest("https://api.example.invalid/test", {}),
    /URL_ADDRESS_BLOCKED/,
  );
  assert.equal(calls, 1);
  for (const ip of [
    "64:ff9b::7f00:1",
    "2002:7f00::1",
    "2001:db8::1",
    "192.0.2.1",
    "168.63.129.16",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});

test("consulta WhatsApp só confirma o ID exato e diferencia aceite, entrega e leitura", () => {
  const {
    extractWhatsAppStatus: status,
  } = require("../dist/automation/workflows/status-poll");
  assert.equal(
    status(
      "whatsapp_evolution",
      { messages: { records: [{ key: { id: "a" }, status: "SERVER_ACK" }] } },
      "a",
      "a",
    ),
    "sent",
  );
  assert.equal(
    status(
      "whatsapp_evolution",
      [{ key: { id: "b" }, status: "READ" }],
      "a",
      "a",
    ),
    null,
  );
  assert.equal(
    status(
      "whatsapp_evolution",
      [{ key: { id: "a" }, MessageUpdate: [{ status: "DELIVERY_ACK" }] }],
      "a",
      "a",
    ),
    "delivered",
  );
  assert.equal(
    status(
      "whatsapp_uazapi",
      { messages: [{ id: "lookup", messageid: "remote", status: "READ" }] },
      "remote",
      "lookup",
    ),
    "read",
  );
  assert.equal(
    status(
      "whatsapp_uazapi",
      { messages: [{ id: "lookup", messageid: "different", status: "READ" }] },
      "remote",
      "lookup",
    ),
    null,
  );
  assert.equal(
    status(
      "whatsapp_uazapi",
      { messages: [{ id: "lookup", status: "PENDING" }] },
      "remote",
      "lookup",
    ),
    null,
  );
});
test("verificação do remetente confirma somente o domínio exato da conta", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q } = f;
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const user = randomUUID(),
    other = randomUUID(),
    integration = randomUUID();
  await q("INSERT INTO users(id) VALUES($1),($2)", [user, other]);
  const {
    saveIntegration,
  } = require("../dist/automation/workflows/integrations");
  const i = await saveIntegration(user, {
    name: "Email",
    provider: "resend",
    config: { from: "Teste <hello@example.invalid>" },
    token: randomBytes(18).toString("hex"),
  });
  const {
    verifyEmailIntegration: verify,
  } = require("../dist/automation/workflows/verification");
  assert.equal(
    (
      await verify(user, i.id, async () => [
        { name: "other.invalid", status: "verified" },
      ])
    ).verified,
    false,
  );
  assert.equal(
    (
      await verify(user, i.id, async () => [
        { name: "example.invalid", status: "verified" },
      ])
    ).verified,
    true,
  );
  await assert.rejects(() => verify(other, i.id, async () => []));
});
