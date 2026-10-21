import { createHash } from "crypto";
import { Query } from "./types";
export function destinationHash(channel: string, destination: string) {
  const normalized =
    channel === "email"
      ? destination.trim().toLowerCase()
      : destination.replace(/[^0-9]/g, "");
  return createHash("sha256")
    .update(channel + ":" + normalized)
    .digest("hex");
}
export async function setConsent(
  tx: Query,
  input: {
    userId: string;
    dealId: string;
    channel: string;
    status: string;
    evidence: string;
  },
) {
  const [deal] = await tx(
    "SELECT contact_email,contact_phone FROM comm_deals WHERE id=$1 AND user_id=$2",
    [input.dealId, input.userId],
  );
  if (!deal) throw Error("CONTACT_MISSING");
  const dest =
    input.channel === "email" ? deal.contact_email : deal.contact_phone;
  const rows = await tx(
    `INSERT INTO aw_consents(user_id,deal_id,channel,status,evidence) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,deal_id,channel) DO UPDATE SET status=EXCLUDED.status,evidence=EXCLUDED.evidence,updated_at=NOW() RETURNING channel,status,updated_at`,
    [input.userId, input.dealId, input.channel, input.status, input.evidence],
  );
  if (dest) {
    const hash = destinationHash(input.channel, dest);
    if (input.status === "opted_out")
      await tx(
        "INSERT INTO aw_suppressions(user_id,channel,destination_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [input.userId, input.channel, hash],
      );
    else
      await tx(
        "DELETE FROM aw_suppressions WHERE user_id=$1 AND channel=$2 AND destination_hash=$3",
        [input.userId, input.channel, hash],
      );
  }
  return rows[0];
}
