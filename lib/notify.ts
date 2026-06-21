import type { Lead } from "./types";

/**
 * Owner alert on every new lead, via a Telegram bot.
 *
 * Gated like GA / MarketCheck: a silent no-op until BOTH env vars are set, so
 * it's safe to ship before the bot exists (and stays quiet during local dev /
 * the smoke test, where they're blank). `notifyNewLead` never throws — the lead
 * is already saved by the time it runs, and an alert failure must never break it.
 *
 * Telegram's Bot API is a plain HTTPS POST, so there's no SDK / dependency.
 *
 * IMPORTANT: the caller must `await` this. Amplify runs the route as a Lambda
 * that freezes the instant the HTTP response returns, so a fire-and-forget send
 * can be frozen mid-flight and never deliver.
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

/** Human-friendly message body. Telegram auto-links phone numbers + emails. */
function buildText(lead: Lead): string {
  const c = lead.contact;
  const reach = c.contactMethod ?? "call";
  const lines: string[] = ["🚗 New DriveOffer lead", "", c.name];

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

  lines.push("", `Prefers: ${reach}`);
  if (c.phone) lines.push(`📞 ${c.phone}`);
  if (c.email) lines.push(`✉️ ${c.email}`);
  if (c.bestTime) lines.push(`🕒 Best time: ${c.bestTime}`);
  if (lead.message) lines.push("", `"${lead.message.slice(0, 200)}"`);

  return lines.join("\n");
}

/** Send the owner a Telegram alert about a new lead. No-op if unconfigured; never throws. */
export async function notifyNewLead(lead: Lead): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: buildText(lead),
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    // Log only — the lead is already saved; alerts must never break it.
    console.error("[notify] lead Telegram alert failed:", e);
  }
}
