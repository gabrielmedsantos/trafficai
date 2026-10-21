import { query, queryOne } from "../../database/connection";
import { encrypt, decrypt } from "../../shared/encryption";
import { object, text, httpsUrl } from "./validation";
import { owned } from "./repository";
import { ValidationError } from "../../shared/errors";
export async function listIntegrations(user: string) {
  const configured = await query(
    "SELECT id,name,provider,config,status,last_activity_at,last_error_code,created_at FROM aw_integrations WHERE user_id=$1 ORDER BY created_at DESC",
    [user],
  );
  const cloud = await query(
    "SELECT id,name,type AS provider,status FROM comm_integrations WHERE user_id=$1 AND type IN ('whatsapp_cloud','whatsapp_evolution','whatsapp_uazapi') ORDER BY name",
    [user],
  );
  return [...cloud, ...configured];
}
export async function saveIntegration(user: string, input: any, id?: string) {
  const b = object(input),
    config = object(b.config);
  if (!["resend", "twilio", "agent_webhook", "webhook"].includes(b.provider))
    throw new ValidationError("Provedor inválido");
  let safe: any = {};
  if (b.provider === "resend") {
    if (
      typeof config.from !== "string" ||
      !/^.{1,150}@[^\s<>]+\.[^\s<>]+>?$/.test(config.from)
    )
      throw new ValidationError("Remetente de e-mail inválido");
    safe = {
      from: config.from,
      reply_to: config.reply_to ? text(config.reply_to, 200) : undefined,
    };
  }
  if (b.provider === "twilio") {
    if (
      !/^AC[a-f0-9]{32}$/i.test(config.account_sid || "") ||
      !/^\+[1-9]\d{7,14}$/.test(config.from || "")
    )
      throw new ValidationError("Account SID ou remetente inválidos");
    safe = { account_sid: config.account_sid, from: config.from };
  }
  if (["agent_webhook", "webhook"].includes(b.provider)) {
    const endpoint = httpsUrl(config.url);
    if (new URL(endpoint).search)
      throw new ValidationError(
        "Endpoint sem parâmetros na URL; use a credencial protegida para autenticação",
      );
    safe = {
      url: endpoint,
      paid: config.paid === true,
      budget: Number(config.budget) || 0,
      cost_per_call: Number(config.cost_per_call) || 0,
      currency: String(config.currency || "USD").toUpperCase(),
    };
    if (
      safe.paid &&
      (!Number.isFinite(safe.cost_per_call) ||
        safe.cost_per_call <= 0 ||
        !/^USD$|^BRL$|^EUR$/.test(safe.currency))
    )
      throw new ValidationError("Informe custo máximo por chamada e moeda");
    if (!Number.isFinite(safe.budget) || safe.budget < 0)
      throw new ValidationError("Orçamento inválido");
  }
  const existing = id ? await owned("aw_integrations", id, user) : null;
  if (existing && existing.provider !== b.provider)
    throw new ValidationError("Crie outra conexão para mudar o provedor");
  const previous = existing
    ? JSON.parse(decrypt(existing.credentials_encrypted))
    : {};
  const token = b.token ? text(b.token, 5000) : previous.token;
  if (!token) throw new ValidationError("Credencial obrigatória");
  const ciphertext = encrypt(
    JSON.stringify({
      token,
      webhook_secret: b.webhook_secret
        ? text(b.webhook_secret, 500)
        : previous.webhook_secret,
    }),
  );
  if (id) {
    await owned("aw_integrations", id, user);
    return queryOne(
      `UPDATE aw_integrations SET name=$3,provider=$4,config=$5,credentials_encrypted=$6,status='configured' WHERE id=$1 AND user_id=$2 RETURNING id,name,provider,config,status`,
      [
        id,
        user,
        text(b.name, 160),
        b.provider,
        JSON.stringify(safe),
        ciphertext,
      ],
    );
  }
  return queryOne(
    `INSERT INTO aw_integrations(user_id,name,provider,config,credentials_encrypted) VALUES($1,$2,$3,$4,$5) RETURNING id,name,provider,config,status`,
    [user, text(b.name, 160), b.provider, JSON.stringify(safe), ciphertext],
  );
}
