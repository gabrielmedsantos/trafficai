import { queryOne } from "../../database/connection";
import { decrypt } from "../../shared/encryption";
import { ProviderError, pinnedRequest } from "./providers";
export async function executeExternal(
  input: {
    userId: string;
    runId: string;
    nodeId: string;
    kind: string;
    integrationId: string;
    config: any;
    context: any;
  },
  request = pinnedRequest,
) {
  if (process.env.AUTOMATION_EXTERNAL_ACTIONS_ENABLED !== "true")
    throw new ProviderError("EXTERNAL_ACTIONS_DISABLED");
  const i = await queryOne<any>(
    "SELECT * FROM aw_integrations WHERE id=$1 AND user_id=$2",
    [input.integrationId, input.userId],
  );
  const expected = input.kind === "agent" ? "agent_webhook" : "webhook";
  if (i?.provider !== expected)
    throw new ProviderError("EXTERNAL_PROVIDER_MISSING");
  const config = input.config.externalSnapshot || i.config;
  if (
    config.paid &&
    (process.env.AUTOMATION_PAID_AGENTS_ENABLED !== "true" ||
      input.config.costApproved !== true)
  )
    throw new ProviderError("PAID_AGENT_NOT_AUTHORIZED");
  const key = JSON.parse(decrypt(i.credentials_encrypted)).token;
  if (!key) throw new ProviderError("EXTERNAL_CREDENTIALS_MISSING");
  const result = await request(
    config.url,
    {
      execution_id: input.runId,
      node_id: input.nodeId,
      prompt: input.config.prompt || "",
      input: {
        product: input.context.product?.name || null,
        order_status: input.context.order?.status || null,
      },
      max_cost: config.paid ? Number(config.cost_per_call) : 0,
      currency: config.currency || "USD",
    },
    {
      Authorization: "Bearer " + key,
      "Idempotency-Key": "aw-" + input.runId + "-" + input.nodeId,
    },
  );
  if (result.execution_id !== input.runId || result.status !== "completed")
    throw new ProviderError("EXTERNAL_RESULT_UNKNOWN", false, true);
  let cost = null;
  if (config.paid) {
    const amount = Number(result.cost?.amount);
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > Number(config.cost_per_call) ||
      result.cost?.currency !== config.currency
    )
      throw new ProviderError("AGENT_COST_UNVERIFIED", false, true);
    cost = { amount, currency: config.currency };
  }
  return {
    result:
      typeof result.output?.result === "string"
        ? result.output.result.slice(0, 4000)
        : "",
    cost,
  };
}
