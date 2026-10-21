import { decryptMaybe } from "../../shared/encryption";
import { ProviderError } from "./providers";
export const WHATSAPP_TYPES = [
  "whatsapp_cloud",
  "whatsapp_evolution",
  "whatsapp_uazapi",
];
export function whatsappSettings(i: any) {
  if (!i || !WHATSAPP_TYPES.includes(i.type) || i.status !== "connected")
    throw new ProviderError("WHATSAPP_NOT_CONNECTED");
  const c = i.config || {},
    s = i.credentials || {};
  if (i.type === "whatsapp_cloud") {
    const key = decryptMaybe(s.access_token);
    if (!key || !/^\d+$/.test(String(c.phone_number_id || "")))
      throw new ProviderError("WHATSAPP_CONFIG_MISSING");
    return {
      provider: i.type,
      base:
        "https://graph.facebook.com/" +
        (process.env.META_API_VERSION || "v23.0"),
      key,
      instance: String(c.phone_number_id),
      trustedBase: undefined,
    };
  }
  if (i.type === "whatsapp_evolution") {
    const custom = s.evolution_base_url || c.baseUrl;
    const base = custom || process.env.EVOLUTION_API_BASE_URL;
    const key =
      decryptMaybe(s.evolution_api_key || s.apiKey) ||
      (base === process.env.EVOLUTION_API_BASE_URL
        ? process.env.EVOLUTION_API_KEY
        : undefined);
    const instance = c.instanceName || c.instance;
    if (!base || !key || !instance)
      throw new ProviderError("EVOLUTION_CONFIG_MISSING");
    return {
      provider: i.type,
      base: String(base).replace(/\/$/, ""),
      key,
      instance: String(instance),
      trustedBase:
        base === process.env.EVOLUTION_API_BASE_URL
          ? process.env.EVOLUTION_API_BASE_URL
          : undefined,
    };
  }
  const base = c.baseUrl || process.env.UAZAPI_BASE_URL,
    key = decryptMaybe(s.instance_token);
  if (!base || !key) throw new ProviderError("UAZAPI_CONFIG_MISSING");
  return {
    provider: i.type,
    base: String(base).replace(/\/$/, ""),
    key,
    instance: "",
    trustedBase:
      base === process.env.UAZAPI_BASE_URL
        ? process.env.UAZAPI_BASE_URL
        : undefined,
  };
}
