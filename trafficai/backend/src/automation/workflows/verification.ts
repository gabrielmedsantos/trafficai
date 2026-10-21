import { Resend } from "resend";
import { owned } from "./repository";
import { queryOne } from "../../database/connection";
import { decrypt } from "../../shared/encryption";
import { ValidationError } from "../../shared/errors";
export async function verifyEmailIntegration(
  user: string,
  id: string,
  read = async (token: string) => {
    const r = await new Resend(token).domains.list();
    if (r.error) throw Error("PROVIDER_VERIFICATION_FAILED");
    return r.data?.data || [];
  },
) {
  const i = await owned("aw_integrations", id, user);
  if (i.provider !== "resend")
    throw new ValidationError("A verificação é para remetentes Resend");
  const credential = JSON.parse(decrypt(i.credentials_encrypted));
  const address = String(i.config.from || "").match(
    /([^\s<>]+@[^\s<>]+)>?$/,
  )?.[1];
  const domain = address?.split("@")[1]?.toLowerCase();
  if (!domain) throw new ValidationError("Remetente inválido");
  let domains: { name: string; status: string }[];
  try {
    domains = await read(credential.token);
  } catch {
    throw new ValidationError(
      "Não foi possível verificar o domínio com o provedor. Confira a permissão da credencial.",
    );
  }
  const verified = domains.some(
    (d) => d.name.toLowerCase() === domain && d.status === "verified",
  );
  const row = await queryOne(
    "UPDATE aw_integrations SET status=$3,last_activity_at=NOW(),last_error_code=$4 WHERE id=$1 AND user_id=$2 RETURNING id,name,provider,status,last_error_code",
    [
      id,
      user,
      verified ? "verified" : "configured",
      verified ? null : "SENDER_DOMAIN_NOT_VERIFIED",
    ],
  );
  return { integration: row, domain, verified };
}
