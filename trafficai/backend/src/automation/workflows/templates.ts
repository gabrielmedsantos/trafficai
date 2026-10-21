import { queryOne } from "../../database/connection";
import { owned } from "./repository";
import { object, text, emailHtml, httpsUrl } from "./validation";
import { ValidationError } from "../../shared/errors";
export async function saveTemplate(user: string, input: any, id?: string) {
  const b = object(input);
  if (
    !["whatsapp", "email", "sms"].includes(b.channel) ||
    !["marketing", "transactional"].includes(b.purpose)
  )
    throw new ValidationError("Canal ou finalidade inválidos");
  const blocks = Array.isArray(b.blocks) ? b.blocks : [];
  if (blocks.length > 40) throw new ValidationError("Máximo de 40 blocos");
  const parameters = Array.isArray(b.parameters) ? b.parameters : [];
  if (
    parameters.length > 20 ||
    parameters.some(
      (p: any) =>
        ![
          "name",
          "product",
          "value",
          "checkout_url",
          "delivery_url",
          "order_id",
          "unsubscribe_url",
          "agent_result",
        ].includes(p),
    )
  )
    throw new ValidationError("Parâmetros de template inválidos");
  for (const block of blocks) {
    if (
      !["heading", "text", "button", "image"].includes(block.type) ||
      typeof block.text !== "string"
    )
      throw new ValidationError("Bloco de e-mail inválido");
    if (
      ["button", "image"].includes(block.type) &&
      !["{{checkout_url}}", "{{delivery_url}}"].includes(block.url)
    )
      httpsUrl(block.url);
  }
  const values = [
    text(b.name, 160),
    b.channel,
    String(b.subject || "").slice(0, 200),
    text(b.body, 10000),
    JSON.stringify(blocks),
    b.purpose,
    b.provider_template ? text(b.provider_template, 160) : null,
    b.language || "pt_BR",
    String(b.preheader || "").slice(0, 200),
    JSON.stringify(parameters),
  ];
  if (id) {
    await owned("aw_templates", id, user);
    return queryOne(
      "UPDATE aw_templates SET name=$3,channel=$4,subject=$5,body=$6,blocks=$7,purpose=$8,provider_template=$9,language=$10,preheader=$11,parameters=$12,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",
      [id, user, ...values],
    );
  }
  return queryOne(
    "INSERT INTO aw_templates(user_id,name,channel,subject,body,blocks,purpose,provider_template,language,preheader,parameters) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
    [user, ...values],
  );
}
