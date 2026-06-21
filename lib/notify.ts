import twilio from "twilio";
import type { Lead } from "./types";

/**
 * Owner SMS alert on every new lead, via Twilio.
 *
 * Gated like GA / MarketCheck: a silent no-op until all four env vars are set,
 * so it's safe to ship before the Twilio account exists (and stays quiet during
 * local dev / the smoke test, where they're blank). `notifyNewLead` never
 * throws — the lead is already saved by the time it runs, and an SMS failure
 * must never break that.
 *
 * IMPORTANT: the caller must `await` this. Amplify runs the route as a Lambda
 * that freezes the instant the HTTP response returns, so a fire-and-forget send
 * can be frozen mid-flight and never deliver.
 */
const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM_NUMBER;
const TO = process.env.OWNER_PHONE;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

/** Concise, scannable SMS body (aim for one ~160-char segment). */
function buildBody(lead: Lead): string {
  const c = lead.contact;
  const reach = c.contactMethod ?? "call";
  const channel = reach === "email" ? c.email : c.phone || c.email;
  const lines: string[] = [`New DriveOffer lead: ${c.name}`];

  if (lead.vehicle) {
    const v = lead.vehicle;
    const km = v.mileageKm ? ` · ${Number(v.mileageKm).toLocaleString("en-CA")} km` : "";
    lines.push(`${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}${km}`);
  }

  if (lead.estimate && !lead.estimate.unique) {
    lines.push(`Est. ${money(lead.estimate.low)}–${money(lead.estimate.high)}`);
  } else if (lead.kind === "vehicle") {
    lines.push("Custom offer (no instant price)");
  }

  if (lead.message) lines.push(lead.message.slice(0, 120));

  lines.push(`${reach}: ${channel}`);
  return lines.join("\n");
}

/** Send the owner an SMS about a new lead. No-op if unconfigured; never throws. */
export async function notifyNewLead(lead: Lead): Promise<void> {
  if (!SID || !TOKEN || !FROM || !TO) return;
  try {
    const client = twilio(SID, TOKEN);
    await client.messages.create({ from: FROM, to: TO, body: buildBody(lead) });
  } catch (e) {
    console.error("[notify] lead SMS failed:", e);
  }
}
