import { Graph, Issue, NODE_TYPES, EVENTS } from "./types";
import { ValidationError } from "../../shared/errors";
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const object = (v: any): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? v : {};
export function httpsUrl(value: any): string {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hostname === "localhost"
    )
      throw Error();
    return u.href;
  } catch {
    throw new ValidationError("Informe uma URL HTTPS sem credenciais");
  }
}
export function text(v: any, max = 500): string {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new ValidationError("Texto ausente ou muito longo");
  return v.trim();
}
export function graphIssues(g: any, publish = false): Issue[] {
  const issues: Issue[] = [];
  if (
    !g ||
    g.schemaVersion !== 1 ||
    !Array.isArray(g.nodes) ||
    !Array.isArray(g.edges) ||
    g.nodes.length > 100 ||
    g.edges.length > 200
  )
    return [{ message: "Grafo inválido; limite de 100 blocos e 200 conexões" }];
  const ids = new Set<string>(),
    out = new Map<string, any[]>(),
    incoming = new Map<string, number>();
  for (const n of g.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(n.id) ||
      ids.has(n.id) ||
      !NODE_TYPES.includes(n.type) ||
      !Number.isFinite(n.position?.x) ||
      !Number.isFinite(n.position?.y) ||
      typeof n.data?.label !== "string" ||
      n.data.label.length > 160 ||
      !n.data.config ||
      typeof n.data.config !== "object" ||
      Array.isArray(n.data.config)
    ) {
      issues.push({ message: "Bloco inválido ou identificador repetido" });
      continue;
    }
    ids.add(n.id);
    out.set(n.id, []);
    incoming.set(n.id, 0);
  }
  const edgeIds = new Set<string>();
  for (const e of g.edges) {
    if (
      !e ||
      typeof e.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(e.id) ||
      edgeIds.has(e.id) ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      e.source === e.target
    ) {
      issues.push({ message: "Conexão inválida" });
      continue;
    }
    edgeIds.add(e.id);
    out.get(e.source)!.push(e);
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
  }
  const nodes = new Map<string, any>(
    g.nodes.filter(Boolean).map((n: any) => [n.id, n]),
  );
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function walk(id: string) {
    if (visiting.has(id)) {
      issues.push({
        nodeId: id,
        message: "Ciclos não são permitidos; use esperas com término explícito",
      });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const e of out.get(id) || []) walk(e.target);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) walk(id);
  if (!publish || issues.length) return issues;
  const triggers = g.nodes.filter((n: any) => n.type === "trigger");
  if (triggers.length !== 1)
    issues.push({ message: "Use exatamente um gatilho" });
  const reached = new Set<string>();
  function reachable(id: string) {
    if (reached.has(id)) return;
    reached.add(id);
    for (const e of out.get(id) || []) reachable(e.target);
  }
  if (triggers.length === 1) reachable(triggers[0].id);
  for (const n of g.nodes) {
    const c = object(n.data?.config),
      edges = out.get(n.id) || [];
    if (n.type === "note") continue;
    if (!reached.has(n.id))
      issues.push({ nodeId: n.id, message: "Bloco não conectado ao gatilho" });
    if (n.type === "trigger" && !EVENTS.includes(c.event))
      issues.push({ nodeId: n.id, message: "Escolha um evento suportado" });
    if (n.type === "condition") {
      if (
        ![
          "order_status",
          "has_tag",
          "field_equals",
          "channel_available",
          "message_sent",
          "message_clicked",
          "message_delivered",
        ].includes(c.kind)
      )
        issues.push({ nodeId: n.id, message: "Escolha uma condição válida" });
      for (const handle of ["yes", "no"])
        if (edges.filter((e) => e.sourceHandle === handle).length !== 1)
          issues.push({
            nodeId: n.id,
            message: "Conecte uma saída Sim e uma saída Não",
          });
      if (edges.length !== 2)
        issues.push({
          nodeId: n.id,
          message: "Condição deve ter exatamente duas saídas",
        });
    } else if (n.type === "end") {
      if (edges.length)
        issues.push({
          nodeId: n.id,
          message: "Encerramento não pode ter saída",
        });
    } else if (edges.length !== 1)
      issues.push({
        nodeId: n.id,
        message: "Conecte exatamente um próximo bloco",
      });
    if (n.type === "trigger" && (incoming.get(n.id) || 0) > 0)
      issues.push({
        nodeId: n.id,
        message: "Gatilho não pode receber conexões",
      });
    if ((incoming.get(n.id) || 0) > 1)
      issues.push({
        nodeId: n.id,
        message:
          "Convergência de ramos não é suportada nesta versão; use encerramentos separados",
      });
    if (
      n.type === "wait" &&
      (!Number.isInteger(c.seconds) || c.seconds < 1 || c.seconds > 2592000)
    )
      issues.push({
        nodeId: n.id,
        message: "Espera deve ser de 1 segundo a 30 dias",
      });
    if (
      n.type === "message" &&
      (!["email", "whatsapp", "sms"].includes(c.channel) ||
        !UUID.test(c.templateId || "") ||
        !UUID.test(c.integrationId || ""))
    )
      issues.push({
        nodeId: n.id,
        message: "Escolha canal, modelo e integração",
      });
    if (
      n.type === "tag" &&
      (!["add", "remove"].includes(c.operation) ||
        typeof c.tag !== "string" ||
        !c.tag.trim() ||
        c.tag.length > 80)
    )
      issues.push({ nodeId: n.id, message: "Informe tag e operação" });
    if (
      n.type === "update_contact" &&
      (!["title", "contact_name"].includes(c.field) ||
        typeof c.value !== "string" ||
        c.value.length > 500)
    )
      issues.push({
        nodeId: n.id,
        message: "Escolha um campo de contato permitido e seu valor",
      });
    if (
      n.type === "crm_task" &&
      (typeof c.title !== "string" || !c.title.trim() || c.title.length > 500)
    )
      issues.push({ nodeId: n.id, message: "Informe o título da tarefa" });
    if (n.type === "webhook" && !UUID.test(c.integrationId || ""))
      issues.push({
        nodeId: n.id,
        message: "Selecione uma integração de webhook",
      });
    if (n.type === "agent" && !UUID.test(c.integrationId || ""))
      issues.push({
        nodeId: n.id,
        message: "Selecione uma integração de agente real",
      });
  }
  return issues;
}
export function parseGraph(g: any, publish = false): Graph {
  const issues = graphIssues(g, publish);
  if (issues.length)
    throw Object.assign(new ValidationError(issues[0].message), { issues });
  return g as Graph;
}
export function renderVariables(
  body: string,
  data: Record<string, any>,
): string {
  const allowed = [
    "name",
    "product",
    "value",
    "checkout_url",
    "delivery_url",
    "order_id",
    "email",
    "phone",
    "unsubscribe_url",
    "agent_result",
  ];
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key) => {
    if (!allowed.includes(key) || data[key] == null || data[key] === "")
      throw new ValidationError("Variável sem valor: " + key);
    return String(data[key]);
  });
}
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function emailHtml(
  blocks: any[],
  textBody: string,
  preheader = "",
): string {
  if (!Array.isArray(blocks) || blocks.length > 40)
    throw new ValidationError("Blocos de e-mail inválidos");
  let content = "";
  for (const b of blocks) {
    const v = escapeHtml(String(b.text || ""));
    if (b.type === "heading") content += "<h2>" + v + "</h2>";
    else if (b.type === "button")
      content +=
        '<p><a href="' +
        escapeHtml(httpsUrl(b.url)) +
        '" style="background:#0ea5e9;color:white;padding:12px 20px;border-radius:8px;display:inline-block">' +
        v +
        "</a></p>";
    else if (b.type === "image")
      content +=
        '<img src="' +
        escapeHtml(httpsUrl(b.url)) +
        '" alt="' +
        v +
        '" style="max-width:100%;height:auto">';
    else if (b.type === "text")
      content += "<p>" + v.replace(/\n/g, "<br>") + "</p>";
    else throw new ValidationError("Tipo de bloco não suportado");
  }
  return (
    '<!doctype html><html><body style="font-family:Arial;max-width:620px;margin:auto;padding:24px;line-height:1.6">' +
    (preheader
      ? '<span style="display:none;max-height:0;overflow:hidden">' +
        escapeHtml(preheader) +
        "</span>"
      : "") +
    (content || "<p>" + escapeHtml(textBody).replace(/\n/g, "<br>") + "</p>") +
    "</body></html>"
  );
}
