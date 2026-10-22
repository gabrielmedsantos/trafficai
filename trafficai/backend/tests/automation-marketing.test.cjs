const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { fixture } = require("./support/automation-db.cjs");
test("WhatsApp seleciona Evolution/UazAPI da conta, preserva instância e não troca para outra conexão", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q } = f;
  const user = randomUUID(),
    other = randomUUID(),
    ev = randomUUID(),
    ua = randomUUID();
  await q("INSERT INTO users(id,role) VALUES($1,'admin'),($2,'admin')", [
    user,
    other,
  ]);
  const key = randomBytes(18).toString("hex");
  await q(
    "INSERT INTO comm_integrations VALUES($1,$2,$3,$4,$5,$6,$7),($8,$2,$9,$10,$5,$11,$12)",
    [
      ev,
      user,
      "Linha B",
      "whatsapp_evolution",
      "connected",
      JSON.stringify({
        baseUrl: "https://evolution.example.invalid",
        instanceName: "line-b",
      }),
      JSON.stringify({ evolution_api_key: key }),
      ua,
      "Linha C",
      "whatsapp_uazapi",
      JSON.stringify({ baseUrl: "https://uazapi.example.invalid" }),
      JSON.stringify({ instance_token: key }),
    ],
  );
  const { send } = require("../dist/automation/workflows/providers");
  const calls = [];
  const request = async (url, body, headers) => {
    calls.push({ url, body, headers });
    return url.includes("evolution")
      ? { key: { id: "ev-message" } }
      : { messageid: "ua-message" };
  };
  const base = {
    userId: user,
    channel: "whatsapp",
    to: "5511999999999",
    body: "Olá",
    idempotencyKey: "test",
  };
  assert.equal(
    (await send({ ...base, integrationId: ev }, request)).provider,
    "whatsapp_evolution",
  );
  assert.equal(
    calls[0].url,
    "https://evolution.example.invalid/message/sendText/line-b",
  );
  assert.equal(calls[0].headers.apikey, key);
  assert.equal(
    (await send({ ...base, integrationId: ua }, request)).provider,
    "whatsapp_uazapi",
  );
  assert.equal(calls[1].url, "https://uazapi.example.invalid/send/text");
  assert.equal(calls[1].headers.token, key);
  await send({ ...base, integrationId: ua, button: { text: "Continuar pedido", url: "https://example.invalid/checkout" } }, request);
  assert.equal(calls[2].url, "https://uazapi.example.invalid/send/menu");
  assert.equal(calls[2].body.type, "button");
  assert.deepEqual(calls[2].body.choices, ["Continuar pedido|https://example.invalid/checkout"]);
  await assert.rejects(
    () => send({ ...base, userId: other, integrationId: ev }, request),
    /WHATSAPP_NOT_CONNECTED/,
  );
  await q("UPDATE comm_integrations SET status='disconnected' WHERE id=$1", [
    ev,
  ]);
  await assert.rejects(
    () => send({ ...base, integrationId: ev }, request),
    /WHATSAPP_NOT_CONNECTED/,
  );
  assert.equal(calls.length, 3);
});
test("campanha congela audiência/versão/modelo, deduplica contato e respeita pausa/cancelamento", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q, c } = f;
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.AUTOMATION_SENDS_ENABLED = "true";
  t.after(() => delete process.env.AUTOMATION_SENDS_ENABLED);
  const { saveTemplate } = require("../dist/automation/workflows/templates"),
    {
      saveFlow,
      publishFlow,
    } = require("../dist/automation/workflows/repository"),
    { saveSegment } = require("../dist/automation/workflows/audience"),
    {
      createCampaign,
      previewCampaign,
      confirmCampaign,
      campaignTick,
      campaignStatus,
    } = require("../dist/automation/workflows/campaigns"),
    { claimJob, executeJob } = require("../dist/automation/workflows/engine");
  const user = randomUUID(),
    deal = randomUUID(),
    duplicate = randomUUID(),
    suppressed = randomUUID(),
    integration = randomUUID();
  await q("INSERT INTO users(id,name,role) VALUES($1,'Teste','admin')", [user]);
  await q(
    "INSERT INTO comm_deals(id,user_id,contact_name,contact_email,status) VALUES($1,$2,'Ana','ana@example.invalid','open'),($3,$2,'Ana duplicada','ana@example.invalid','open'),($4,$2,'Sem autorização','no@example.invalid','open')",
    [deal, user, duplicate, suppressed],
  );
  for (const id of [deal, duplicate])
    await q(
      "INSERT INTO aw_consents VALUES($1,$2,'email','opted_in','fixture',NOW())",
      [user, id],
    );
  await q(
    "INSERT INTO aw_integrations(id,user_id,name,provider,config,credentials_encrypted) VALUES($1,$2,'Resend','resend','{\"from\":\"test@example.invalid\"}','not-used')",
    [integration, user],
  );
  const template = await saveTemplate(user, {
    name: "E1",
    channel: "email",
    purpose: "transactional",
    body: "Versão original {{name}}",
    subject: "Assunto",
    preheader: "Prévia",
  });
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
        id: "msg",
        type: "message",
        position: { x: 200, y: 0 },
        data: {
          label: "Email",
          config: {
            channel: "email",
            templateId: template.id,
            integrationId: integration,
          },
        },
      },
      {
        id: "end",
        type: "end",
        position: { x: 400, y: 0 },
        data: { label: "Fim", config: {} },
      },
    ],
    edges: [
      { id: "a", source: "start", target: "msg" },
      { id: "b", source: "msg", target: "end" },
    ],
  };
  const flow = await saveFlow(user, {
    name: "Funil",
    graph,
    settings: {
      days: [0, 1, 2, 3, 4, 5, 6],
      allowed_start: 0,
      allowed_end: 24,
    },
  });
  await publishFlow(user, flow.id);
  await saveTemplate(
    user,
    {
      name: "E1 alterado",
      channel: "email",
      purpose: "transactional",
      body: "Texto novo",
      subject: "Novo assunto",
    },
    template.id,
  );
  const segment = await saveSegment(user, {
      name: "Autorizados",
      rules: { channel: "email" },
    }),
    campaign = await createCampaign(user, {
      name: "Campanha",
      flow_id: flow.id,
      segment_id: segment.id,
      max_recipients: 100,
    });
  const preview = await previewCampaign(user, campaign.id);
  assert.equal(preview.count, 2);
  await assert.rejects(() =>
    confirmCampaign(user, user, campaign.id, {
      confirm: true,
      expected_count: 1,
    }),
  );
  await confirmCampaign(user, user, campaign.id, {
    confirm: true,
    expected_count: 2,
  });
  await assert.rejects(() =>
    confirmCampaign(user, user, campaign.id, {
      confirm: true,
      expected_count: 2,
    }),
  );
  await campaignTick();
  assert.equal((await q("SELECT * FROM aw_enrollments")).length, 1);
  const recipients = await q(
    "SELECT state,reason FROM aw_campaign_recipients WHERE campaign_id=$1",
    [campaign.id],
  );
  assert.ok(recipients.some((r) => r.reason === "already_enrolled"));
  await executeJob(await claimJob());
  const pending = await claimJob();
  await campaignStatus(user, campaign.id, "paused");
  let calls = 0;
  await executeJob(pending, async () => {
    calls++;
    return { id: "x", provider: "resend" };
  });
  assert.equal(calls, 0);
  await campaignStatus(user, campaign.id, "sending");
  await q("UPDATE aw_jobs SET due_at=NOW()");
  let content;
  await executeJob(await claimJob(), async (input) => {
    content = input;
    return { id: "resend-1", provider: "resend" };
  });
  assert.ok(content.body.includes("Versão original"));
  assert.equal(content.subject, "Assunto");
  await executeJob(await claimJob());
  await campaignTick();
  assert.equal(
    (await q("SELECT status FROM aw_campaigns WHERE id=$1", [campaign.id]))[0]
      .status,
    "completed",
  );
});
test("recibos antecipados são reconciliados; bounce suprime e recibos repetidos não duplicam", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q } = f;
  const {
    recordReceipt,
    reconcileReceipts,
  } = require("../dist/automation/workflows/receipts");
  const user = randomUUID(),
    integration = randomUUID(),
    deal = randomUUID();
  await q("INSERT INTO users(id) VALUES($1)", [user]);
  await q(
    "INSERT INTO comm_deals(id,user_id,contact_email) VALUES($1,$2,'test@example.invalid')",
    [deal, user],
  );
  await recordReceipt(
    integration,
    user,
    "resend",
    "event-1",
    "provider-1",
    "delivered",
  );
  assert.equal(
    (await q("SELECT processed_at FROM aw_receipts"))[0].processed_at,
    null,
  );
  const message = randomUUID();
  await q(
    "INSERT INTO aw_messages(id,user_id,node_id,deal_id,channel,status,provider,provider_id,integration_id) VALUES($1,$2,'msg',$3,'email','sent','resend','provider-1',$4)",
    [message, user, deal, integration],
  );
  await reconcileReceipts();
  assert.equal(
    (await q("SELECT status FROM aw_messages"))[0].status,
    "delivered",
  );
  await recordReceipt(
    integration,
    user,
    "resend",
    "event-1",
    "provider-1",
    "delivered",
  );
  assert.equal((await q("SELECT * FROM aw_receipts")).length, 1);
  await recordReceipt(
    integration,
    user,
    "resend",
    "event-2",
    "provider-1",
    "bounced",
  );
  assert.equal(
    (await q("SELECT status FROM aw_consents"))[0].status,
    "opted_out",
  );
  assert.equal((await q("SELECT * FROM aw_suppressions")).length, 1);
});
test("conexão WhatsApp padrão é congelada na publicação e modelo alterado não muda a versão", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q } = f;
  const user = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  await q("INSERT INTO users(id,role) VALUES($1,'admin')", [user]);
  for (const [id, name] of [
    [a, "A"],
    [b, "B"],
  ])
    await q(
      "INSERT INTO comm_integrations VALUES($1,$2,$3,'whatsapp_evolution','connected',$4,$5)",
      [
        id,
        user,
        name,
        JSON.stringify({
          baseUrl: "https://ev.example.invalid",
          instanceName: name,
        }),
        JSON.stringify({ evolution_api_key: randomBytes(20).toString("hex") }),
      ],
    );
  const { saveTemplate } = require("../dist/automation/workflows/templates"),
    {
      saveFlow,
      publishFlow,
    } = require("../dist/automation/workflows/repository");
  const model = await saveTemplate(user, {
    name: "WhatsApp",
    channel: "whatsapp",
    purpose: "transactional",
    body: "Olá {{name}}",
  });
  const graph = {
    schemaVersion: 1,
    nodes: [
      {
        id: "s",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { label: "Início", config: { event: "manual" } },
      },
      {
        id: "m",
        type: "message",
        position: { x: 1, y: 0 },
        data: {
          label: "Mensagem",
          config: { channel: "whatsapp", templateId: model.id },
        },
      },
      {
        id: "e",
        type: "end",
        position: { x: 2, y: 0 },
        data: { label: "Fim", config: {} },
      },
    ],
    edges: [
      { id: "a", source: "s", target: "m" },
      { id: "b", source: "m", target: "e" },
    ],
  };
  const flow = await saveFlow(user, {
    name: "Conexão B",
    graph,
    settings: { default_whatsapp_connection_id: b },
  });
  await publishFlow(user, flow.id);
  await saveFlow(
    user,
    {
      name: "Rascunho A",
      graph,
      revision: 1,
      settings: { default_whatsapp_connection_id: a },
    },
    flow.id,
  );
  await saveTemplate(
    user,
    {
      name: "Novo texto",
      channel: "whatsapp",
      purpose: "transactional",
      body: "Alterado",
    },
    model.id,
  );
  const [v] = await q("SELECT graph FROM aw_versions WHERE flow_id=$1", [
    flow.id,
  ]);
  assert.equal(v.graph.nodes[1].data.config.integrationId, b);
  assert.equal(
    v.graph.nodes[1].data.config.templateSnapshot.body,
    "Olá {{name}}",
  );
});
test("funil de e-mail: espera persistida, duas mensagens, reentrada explícita e saída por descadastro", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q } = f;
  process.env.AUTOMATION_SENDS_ENABLED = "true";
  t.after(() => delete process.env.AUTOMATION_SENDS_ENABLED);
  const user = randomUUID(),
    deal = randomUUID(),
    integration = randomUUID();
  await q("INSERT INTO users(id,role) VALUES($1,'admin')", [user]);
  await q(
    "INSERT INTO comm_deals(id,user_id,contact_name,contact_email) VALUES($1,$2,'Ana','ana@example.invalid')",
    [deal, user],
  );
  await q(
    "INSERT INTO aw_consents VALUES($1,$2,'email','opted_in','fixture',NOW())",
    [user, deal],
  );
  await q(
    "INSERT INTO aw_integrations(id,user_id,name,provider,credentials_encrypted) VALUES($1,$2,'Email','resend','unused')",
    [integration, user],
  );
  const { saveTemplate } = require("../dist/automation/workflows/templates"),
    {
      saveFlow,
      publishFlow,
    } = require("../dist/automation/workflows/repository"),
    { enrollManual } = require("../dist/automation/workflows/audience"),
    { claimJob, executeJob } = require("../dist/automation/workflows/engine"),
    { setConsent } = require("../dist/automation/workflows/consent");
  const model = await saveTemplate(user, {
    name: "Email",
    channel: "email",
    purpose: "transactional",
    body: "Olá {{name}}",
  });
  const nodes = [
    ["s", "trigger", { event: "manual" }],
    [
      "m1",
      "message",
      { channel: "email", integrationId: integration, templateId: model.id },
    ],
    ["w", "wait", { seconds: 3600 }],
    [
      "m2",
      "message",
      { channel: "email", integrationId: integration, templateId: model.id },
    ],
    ["e", "end", {}],
  ].map(([id, type, config], i) => ({
    id,
    type,
    position: { x: i * 200, y: 0 },
    data: { label: id, config },
  }));
  const graph = {
    schemaVersion: 1,
    nodes,
    edges: nodes
      .slice(1)
      .map((n, i) => ({ id: "e" + i, source: nodes[i].id, target: n.id })),
  };
  const flow = await saveFlow(user, {
    name: "Sequência",
    graph,
    settings: {
      days: [0, 1, 2, 3, 4, 5, 6],
      allowed_start: 0,
      allowed_end: 24,
    },
  });
  await publishFlow(user, flow.id);
  await assert.rejects(() => enrollManual(user, flow.id, deal, false));
  const entry = await enrollManual(user, flow.id, deal, true);
  let sent = 0;
  const deliver = async () => ({ id: "email-" + ++sent, provider: "resend" });
  for (let i = 0; i < 3; i++) await executeJob(await claimJob(), deliver);
  assert.equal(sent, 1);
  assert.equal(await claimJob(), null);
  const [scheduled] = await q(
    "SELECT due_at FROM aw_jobs WHERE run_id=$1 AND node_id='m2'",
    [entry.run.id],
  );
  assert.ok(new Date(scheduled.due_at).getTime() > Date.now() + 3500000);
  await q("UPDATE aw_jobs SET due_at=NOW() WHERE run_id=$1", [entry.run.id]);
  await q("UPDATE aw_sender_limits SET next_at=NOW()");
  for (let i = 0; i < 2; i++) await executeJob(await claimJob(), deliver);
  assert.equal(sent, 2);
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE id=$1", [entry.run.id]))[0]
      .status,
    "completed",
  );
  assert.equal(
    (await enrollManual(user, flow.id, deal, true)).skipped,
    "already_enrolled",
  );
  const reentry = await enrollManual(user, flow.id, deal, true, true);
  assert.ok(reentry.run.id !== entry.run.id);
  await setConsent(q, {
    userId: user,
    dealId: deal,
    channel: "email",
    status: "opted_out",
    evidence: "Fixture",
  });
  await executeJob(await claimJob(), deliver);
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE id=$1", [reentry.run.id]))[0]
      .status,
    "canceled",
  );
  assert.equal(sent, 2);
});

test("ofertas: compra básica cancela recuperação básica sem cancelar a oferta completa", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { q } = f;
  const {
    saveFlow,
    publishFlow,
    saveProduct,
  } = require("../dist/automation/workflows/repository");
  const { dispatchEvents } = require("../dist/automation/workflows/events");
  const user = randomUUID(),
    source = randomUUID(),
    deal = randomUUID();
  await q("INSERT INTO users(id) VALUES($1)", [user]);
  await q("INSERT INTO tracking_sources VALUES($1,$2,'Fonte')", [source, user]);
  await q(
    "INSERT INTO comm_deals(id,user_id,contact_email) VALUES($1,$2,'buyer@example.invalid')",
    [deal, user],
  );
  const p = await saveProduct(user, {
    name: "Produto",
    source_id: source,
    offers: [
      {
        id: "basic",
        name: "Básico",
        price: 9.9,
        external_product_id: "basic",
        checkout_url: "https://example.invalid/basic",
      },
      {
        id: "full",
        name: "Completo",
        price: 27,
        external_product_id: "full",
        checkout_url: "https://example.invalid/full",
      },
    ],
  });
  const graph = {
    schemaVersion: 1,
    nodes: [
      {
        id: "s",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { label: "Pedido", config: { event: "checkout.started" } },
      },
      {
        id: "e",
        type: "end",
        position: { x: 200, y: 0 },
        data: { label: "Fim", config: {} },
      },
    ],
    edges: [{ id: "a", source: "s", target: "e" }],
  };
  const flow = await saveFlow(user, {
    name: "Recuperação",
    source_id: source,
    product_id: p.id,
    recovery: true,
    graph,
  });
  await publishFlow(user, flow.id);
  const basic = randomUUID(),
    full = randomUUID(),
    paid = randomUUID();
  for (const [id, offer] of [
    [basic, "basic"],
    [full, "full"],
  ])
    await q(
      "INSERT INTO tracking_orders(id,source_id,status,product_id,customer_email) VALUES($1,$2,'pending',$3,'buyer@example.invalid')",
      [id, source, offer],
    );
  await dispatchEvents();
  assert.equal((await q("SELECT * FROM aw_runs")).length, 2);
  await q(
    "INSERT INTO tracking_orders(id,source_id,status,product_id,customer_email) VALUES($1,$2,'approved','basic','buyer@example.invalid')",
    [paid, source],
  );
  await dispatchEvents();
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE order_id=$1", [basic]))[0]
      .status,
    "canceled",
  );
  assert.equal(
    (await q("SELECT status FROM aw_runs WHERE order_id=$1", [full]))[0].status,
    "queued",
  );
});
