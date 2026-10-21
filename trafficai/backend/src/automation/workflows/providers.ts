import https from "https";
import http from "http";
import { getEntitlements } from "../../billing/entitlements";
import { whatsappSettings } from "./whatsapp";
import dns from "dns/promises";
import net from "net";
import { queryOne } from "../../database/connection";
import { decrypt, decryptMaybe } from "../../shared/encryption";
import { httpsUrl } from "./validation";
export class ProviderError extends Error {
  constructor(
    public code: string,
    public retryable = false,
    public uncertain = false,
  ) {
    super(code);
  }
}
export function publicAddress(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(
      ip === "168.63.129.16" ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIP(ip) === 6) {
    const s = ip.toLowerCase();
    const parts = s.split(":");
    const second = parseInt(parts[1] || "0", 16);
    return (
      /^[23]/.test(s) &&
      !s.startsWith("2002:") &&
      !s.startsWith("3ffe:") &&
      !s.startsWith("3fff:") &&
      !(s.startsWith("2001:") && (second < 0x200 || second === 0xdb8))
    );
  }
  return false;
}
export async function pinnedRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  trustedBase?: string,
): Promise<any> {
  const u = new URL(url);
  let trusted = false;
  if (trustedBase) {
    const base = new URL(trustedBase);
    trusted =
      u.origin === base.origin &&
      u.pathname.startsWith(base.pathname.replace(/\/$/, "") + "/") &&
      !u.username &&
      !u.password &&
      ["https:", "http:"].includes(u.protocol);
  }
  if (!trusted) {
    httpsUrl(url);
    if (u.port && u.port !== "443") throw new ProviderError("URL_PORT_BLOCKED");
  }
  const addresses = await dns.lookup(u.hostname, { all: true }).catch(() => {
    throw new ProviderError("DNS_FAILED", true);
  });
  if (
    !addresses.length ||
    (!trusted && addresses.some((x) => !publicAddress(x.address)))
  )
    throw new ProviderError("URL_ADDRESS_BLOCKED");
  const target = addresses[0];
  return new Promise((resolve, reject) => {
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    const req = (u.protocol === "http:" ? http : https).request(
      u,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
        lookup: (_host, options: any, cb: any) =>
          options?.all
            ? cb(null, [{ address: target.address, family: target.family }])
            : cb(null, target.address, target.family),
        timeout: 15000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > 200000) res.destroy(new Error("Response too large"));
        });
        res.on("error", () =>
          reject(new ProviderError("PROVIDER_RESPONSE_LOST", false, true)),
        );
        res.on("end", () => {
          const status = res.statusCode || 500;
          if (status === 429)
            return reject(new ProviderError("PROVIDER_RATE_LIMIT", true));
          if (status >= 500)
            return reject(
              new ProviderError("PROVIDER_SERVER_ERROR", false, true),
            );
          if (status < 200 || status >= 300)
            return reject(new ProviderError("PROVIDER_REJECTED_" + status));
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            reject(new ProviderError("PROVIDER_RESPONSE_INVALID", false, true));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () =>
      reject(new ProviderError("PROVIDER_RESULT_UNKNOWN", false, true)),
    );
    req.end(payload);
  });
}
export interface SendInput {
  userId: string;
  integrationId: string;
  channel: string;
  to: string;
  body: string;
  subject?: string;
  html?: string;
  unsubscribeUrl?: string;
  templateName?: string;
  templateParameters?: string[];
  language?: string;
  idempotencyKey: string;
}
export async function send(
  input: SendInput,
  request: typeof pinnedRequest = pinnedRequest,
): Promise<{
  id: string;
  provider: string;
  reference?: { lookup_id: string };
}> {
  if (input.channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to))
    throw new ProviderError("EMAIL_RECIPIENT_INVALID");
  if (
    ["whatsapp", "sms"].includes(input.channel) &&
    !/^\+?[1-9]\d{7,14}$/.test(input.to)
  )
    throw new ProviderError("PHONE_RECIPIENT_INVALID");
  if (input.channel === "whatsapp") {
    const i = await queryOne<any>(
      "SELECT * FROM comm_integrations WHERE id=$1 AND user_id=$2 AND type IN ('whatsapp_cloud','whatsapp_evolution','whatsapp_uazapi') AND status='connected'",
      [input.integrationId, input.userId],
    );
    const connection = whatsappSettings(i);
    if (
      connection.provider === "whatsapp_uazapi" &&
      !(await getEntitlements(input.userId)).whatsapp_uazapi
    )
      throw new ProviderError("UAZAPI_NOT_ENTITLED");
    if (connection.provider !== "whatsapp_cloud") {
      const evolution = connection.provider === "whatsapp_evolution";
      const result = await request(
        connection.base +
          (evolution
            ? "/message/sendText/" + encodeURIComponent(connection.instance)
            : "/send/text"),
        { number: input.to.replace(/\D/g, ""), text: input.body },
        evolution ? { apikey: connection.key } : { token: connection.key },
        connection.trustedBase,
      );
      const id = evolution ? result.key?.id : result.messageid || result.id;
      if (!id)
        throw new ProviderError("WHATSAPP_RESPONSE_UNKNOWN", false, true);
      return {
        id: String(id),
        provider: connection.provider,
        reference: { lookup_id: String(result.id || id) },
      };
    }
    const token = connection.key,
      phoneId = connection.instance;
    // Ações automáticas usam somente templates; não presume janela de 24h nem aprovação.
    if (!input.templateName)
      throw new ProviderError("WHATSAPP_TEMPLATE_REQUIRED");
    const r = await request(
      connection.base + "/" + phoneId + "/messages",
      {
        messaging_product: "whatsapp",
        to: input.to,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.language || "pt_BR" },
          components: input.templateParameters?.length
            ? [
                {
                  type: "body",
                  parameters: input.templateParameters.map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ]
            : undefined,
        },
      },
      { Authorization: "Bearer " + token },
    );
    if (!r.messages?.[0]?.id)
      throw new ProviderError("WHATSAPP_RESPONSE_UNKNOWN", false, true);
    return { id: r.messages[0].id, provider: "whatsapp_cloud" };
  }
  const i = await queryOne<any>(
    "SELECT * FROM aw_integrations WHERE id=$1 AND user_id=$2",
    [input.integrationId, input.userId],
  );
  if (!i) throw new ProviderError("PROVIDER_NOT_CONFIGURED");
  let secret: any;
  try {
    secret = JSON.parse(decrypt(i.credentials_encrypted));
  } catch {
    throw new ProviderError("PROVIDER_CREDENTIALS_UNAVAILABLE");
  }
  if (input.channel === "email" && i.provider === "resend") {
    if (!i.config.from || !secret.token)
      throw new ProviderError("EMAIL_SENDER_MISSING");
    const r = await request(
      "https://api.resend.com/emails",
      {
        from: i.config.from,
        to: [input.to],
        reply_to: i.config.reply_to || undefined,
        subject: input.subject,
        text: input.body,
        html: input.html,
        headers: input.unsubscribeUrl
          ? {
              "List-Unsubscribe": "<" + input.unsubscribeUrl + ">",
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
      },
      {
        Authorization: "Bearer " + secret.token,
        "Idempotency-Key": input.idempotencyKey,
      },
    );
    if (!r.id) throw new ProviderError("EMAIL_RESPONSE_UNKNOWN", false, true);
    return { id: r.id, provider: "resend" };
  }
  if (input.channel === "sms" && i.provider === "twilio") {
    if (
      !/^AC[a-zA-Z0-9]+$/.test(i.config.account_sid || "") ||
      !i.config.from ||
      !secret.token
    )
      throw new ProviderError("SMS_CONFIG_MISSING");
    const body = new URLSearchParams({
      To: input.to,
      From: i.config.from,
      Body: input.body,
    }).toString();
    const r = await request(
      "https://api.twilio.com/2010-04-01/Accounts/" +
        i.config.account_sid +
        "/Messages.json",
      body,
      {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(i.config.account_sid + ":" + secret.token).toString(
            "base64",
          ),
      },
    );
    if (!r.sid) throw new ProviderError("SMS_RESPONSE_UNKNOWN", false, true);
    return { id: r.sid, provider: "twilio" };
  }
  throw new ProviderError("CHANNEL_PROVIDER_UNAVAILABLE");
}
