import "server-only";
import type { Lead, Referral } from "./types";

/**
 * Owner alert on every new lead, via a Telegram bot.
 *
 * Gated like GA / MarketCheck: a silent no-op until BOTH env vars are set, so
 * it's safe to ship before the bot exists (and stays quiet during local dev /
 * the smoke test, where they're blank). `notifyNewLead` never throws — the lead
 * is already saved by the time it runs, and an alert failure must never break it.
 *
 * IMPORTANT: the caller must `await` this. Amplify runs the route as a Lambda
 * that freezes the instant the HTTP response returns, so a fire-and-forget send
 * can be frozen mid-flight and never deliver.
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Split notification channels — each optional. Anything unset falls back to the
// original single chat (TELEGRAM_CHAT_ID), so the split rolls out safely: until a
// group's id is configured, its messages keep going to the current chat.
const CHAT_MAIN = process.env.TELEGRAM_CHAT_ID;
const CHAT_LEADS = process.env.TELEGRAM_CHAT_LEADS;
const CHAT_REPLIES = process.env.TELEGRAM_CHAT_REPLIES;
const CHAT_BOOKINGS = process.env.TELEGRAM_CHAT_BOOKINGS;
const CHAT_UPDATES = process.env.TELEGRAM_CHAT_UPDATES;
const api = (method: string) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

export type NotifyChannel = "leads" | "replies" | "bookings" | "updates";

/** Resolve a channel to its chat id; falls back to the main chat when unset. */
function chatFor(channel: NotifyChannel): string | undefined {
  const map: Record<NotifyChannel, string | undefined> = {
    leads: CHAT_LEADS,
    replies: CHAT_REPLIES,
    bookings: CHAT_BOOKINGS,
    updates: CHAT_UPDATES,
  };
  return map[channel] || CHAT_MAIN;
}

/** Every configured chat id — the webhook uses this to accept commands from any
 * of the owner's groups (Leads / Bookings / Updates / Replies / the original). */
export function telegramChatIds(): string[] {
  return [CHAT_MAIN, CHAT_LEADS, CHAT_REPLIES, CHAT_BOOKINGS, CHAT_UPDATES].filter(
    (x): x is string => Boolean(x),
  );
}

// Category emojis built from codepoints so they always survive the build + JSON
// transport intact (a literal emoji added here once arrived as escaped text).
const EMOJI_CHAT = String.fromCodePoint(0x1f4ac); // 💬 speech balloon
const EMOJI_REFERRAL = String.fromCodePoint(0x1f91d); // 🤝 handshake

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
    const cond = v.condition;
    if (cond && (cond.tags?.length || cond.note)) {
      const tagStr = (cond.tags || []).join(", ");
      const noteStr = cond.note ? `${tagStr ? " — " : ""}${cond.note}` : "";
      lines.push(`🔧 ${tagStr}${noteStr}`);
    }
  }

  if (lead.estimate && !lead.estimate.unique) {
    lines.push(`Est. ${money(lead.estimate.low)}–${money(lead.estimate.high)}`);
  } else if (lead.kind === "vehicle") {
    lines.push("Needs quote");
  }

  lines.push("", `Prefers: ${reach}`);
  if (c.phone) lines.push(`📞 ${c.phone}`);
  if (c.email) lines.push(`✉️ ${c.email}`);
  if (c.bestTime) lines.push(`🕒 Best time: ${c.bestTime}`);
  if (lead.message) lines.push("", `"${lead.message.slice(0, 200)}"`);

  // Short ID + ready-to-copy commands for emailing a custom offer or requesting info.
  const sid = lead.id.split("-")[0];
  lines.push("", `🆔 ${sid}`);
  if (c.email) {
    lines.push(`Send offer → /offer ${sid} 8500-9000`);
    lines.push(`Need info first → /moreinfo ${sid} then your questions, one per line`);
    lines.push(`Send a message → /message ${sid} then your message`);
  }

  return lines.join("\n");
}

async function sendText(text: string, chatId: string): Promise<void> {
  const r = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`sendMessage ${r.status}`);
}

/** Alert the owner about a new lead. No-op if unconfigured; never throws. */
export async function notifyNewLead(lead: Lead): Promise<void> {
  const chat = chatFor("leads");
  if (!BOT_TOKEN || !chat) return;
  const text = buildText(lead);
  const sid = lead.id.split("-")[0];
  try {
    await sendText(text, chat);
    // Second message: the bare short ID only — no emoji, no label, nothing else —
    // so it can be long-pressed to copy on mobile. Sent once, with the lead alert
    // only (the /offer, /confirm, /cancel command replies never send it).
    await sendText(sid, chat);
  } catch (e) {
    // Log only — the lead is already saved; alerts must never break it.
    console.error("[notify] lead Telegram alert failed:", e);
  }
}

/** Generic owner Telegram message (gated, best-effort, never throws). Routes to
 * `channel` (defaults to the muted Updates channel); booking/appointment events
 * pass "bookings". Used by the scheduled cron and the booking routes. Await it. */
export async function notifyOwner(text: string, channel: NotifyChannel = "updates"): Promise<void> {
  const chat = chatFor(channel);
  if (!BOT_TOKEN || !chat) return;
  try {
    await sendText(text, chat);
  } catch (e) {
    console.error("[notify] owner message failed:", e);
  }
}

/** Compact one-line lead summary for digests/alerts (name · vehicle · contact · short id). */
export function leadLine(lead: Lead): string {
  const c = lead.contact;
  const v = lead.vehicle;
  const car = v ? `${v.year} ${v.make} ${v.model}` : lead.kind === "inquiry" ? "Inquiry" : "Vehicle";
  const reach = c.contactMethod ?? "call";
  const contact = c.phone || c.email || "(no contact info)";
  const sid = lead.id.split("-")[0];
  return `${c.name || "(no name)"} · ${car} · ${reach} ${contact} · 🆔 ${sid}`;
}

/**
 * Alert the owner about a new visitor chat message. Fires on every visitor
 * message. No-op if the bot isn't configured; never throws (the message is
 * already saved by the time this runs). Caller must `await` it (Lambda freezes
 * on response — see the note at the top of this file).
 */
export async function notifyNewChatMessage(opts: {
  text: string;
  name?: string;
  contact?: string;
  conversationId: string;
}): Promise<void> {
  const chat = chatFor("leads");
  if (!BOT_TOKEN || !chat) return;
  const who = opts.name?.trim() ? opts.name.trim() : "Visitor";
  const lines: string[] = [`${EMOJI_CHAT} New chat message`, "", `From: ${who}`];
  if (opts.contact?.trim()) lines.push(`Contact: ${opts.contact.trim()}`);
  lines.push("", `"${opts.text.slice(0, 500)}"`, "", "Reply in Messages: https://www.driveoffer.ca/admin");
  const text = lines.join("\n");
  try {
    await sendText(text, chat);
  } catch (e) {
    console.error("[notify] chat Telegram alert failed:", e);
  }
}

/**
 * Alert the owner about a new referral — shows the referrer's details and the
 * friend they referred. No-op if unconfigured; never throws. Caller must await.
 */
export async function notifyNewReferral(ref: Referral): Promise<void> {
  const chat = chatFor("updates");
  if (!BOT_TOKEN || !chat) return;
  const r = ref.referrer;
  const fr = ref.friend;
  const lines: string[] = [`${EMOJI_REFERRAL} New DriveOffer referral`, "", `Referred by: ${r.name}`];
  if (r.phone) lines.push(`Phone: ${r.phone}`);
  if (r.email) lines.push(`Email: ${r.email}`);
  lines.push("", "Their friend:");
  lines.push(`Name: ${fr.name || "(not given)"}`);
  if (fr.phone) lines.push(`Phone: ${fr.phone}`);
  if (fr.email) lines.push(`Email: ${fr.email}`);
  if (ref.message) lines.push("", `"${ref.message.slice(0, 300)}"`);
  try {
    await sendText(lines.join("\n"), chat);
  } catch (e) {
    console.error("[notify] referral Telegram alert failed:", e);
  }
}
