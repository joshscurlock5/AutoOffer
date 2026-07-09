import "server-only";
import type { Lead, Referral } from "./types";
import { updateLead } from "./store";

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
// Dedicated append-only audit-log channel. Unlike the others it has NO fallback —
// if it's unset, logging is simply off (so it can never spam the leads group).
const CHAT_LOGS = process.env.TELEGRAM_CHAT_LOGS;
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

/** One-line negotiation trail (💬 ask $X → 💵 offer $Y → ✅ bought $Z), or "" if none.
 * Folded into the lead alert itself so there's no separate scoreboard message. */
function negTrail(entries: Lead["negotiation"]): string {
  if (!entries || !entries.length) return "";
  const icon = (k: string) => (k === "ask" ? "💬 ask" : k === "offer" ? "💵 offer" : "✅ bought");
  return entries.map((e) => `${icon(e.kind)} ${money(e.amount)}`).join("  →  ");
}

// Shopping-cart emoji via codepoint (abandoned-cart partial alert), matching the
// EMOJI_CHAT/EMOJI_REFERRAL pattern so it survives build + Telegram transport.
const EMOJI_CART = String.fromCodePoint(0x1f6d2);
/** Header for an abandoned-form (partial) lead alert — exported so the webhook's
 * in-place refresh reuses the exact same string and never relabels it as a new lead. */
export const PARTIAL_LEAD_HEADER = `${EMOJI_CART} Abandoned form — reachable (they left contact info)`;

/** Human-friendly message body. Telegram auto-links phone numbers + emails. */
export function buildText(lead: Lead, header = "🚗 New DriveOffer lead"): string {
  const c = lead.contact;
  const reach = c.contactMethod ?? "call";
  const lines: string[] = [header, "", c.name];

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

  // Short ID for reference. The tap-to-act buttons under the alert (📧 Email offer /
  // ❓ Ask for info / ✉️ Message) replace the old typed command hints.
  const sid = lead.id.split("-")[0];
  lines.push("", `🆔 ${sid}`);

  // Fold the negotiation trail right into the lead — no separate scoreboard message.
  const trail = negTrail(lead.negotiation);
  if (trail) lines.push("", `📊 ${trail}`);

  return lines.join("\n");
}

async function sendText(text: string, chatId: string, replyMarkup?: unknown): Promise<number | undefined> {
  const r = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  if (!r.ok) throw new Error(`sendMessage ${r.status}`);
  const j = await r.json().catch(() => null);
  return j?.result?.message_id;
}

/** Inline buttons on a lead alert. Top rows LOG the negotiation (their ask / our
 * offer / bought); the bottom row ACTS — email an offer, ask for info, or message
 * the customer — each opening a reply box. callback_data is `neg|…` / `act|…`. */
function negKeyboard(lead: Lead) {
  const sid = lead.id.split("-")[0];
  return {
    inline_keyboard: [
      [
        { text: "💬 Their ask", callback_data: `neg|ask|${sid}` },
        { text: "💵 Our offer", callback_data: `neg|offer|${sid}` },
      ],
      [{ text: "✅ Bought (final price)", callback_data: `neg|bought|${sid}` }],
      [
        { text: "📧 Email offer", callback_data: `act|offer|${sid}` },
        { text: "❓ Ask for info", callback_data: `act|info|${sid}` },
        { text: "✉️ Message", callback_data: `act|msg|${sid}` },
      ],
    ],
  };
}

/** Alert the owner about a new lead. No-op if unconfigured; never throws. */
export async function notifyNewLead(lead: Lead): Promise<void> {
  const chat = chatFor("leads");
  if (!BOT_TOKEN || !chat) return;
  const text = buildText(lead);
  const sid = lead.id.split("-")[0];
  try {
    const mid = await sendText(text, chat, negKeyboard(lead));
    // Second message: the bare short ID only — no emoji, no label, nothing else —
    // so it can be long-pressed to copy on mobile. Sent once, with the lead alert
    // only (the /offer, /confirm, /cancel command replies never send it).
    await sendText(sid, chat);
    // Remember this alert's message so the negotiation trail can later be edited
    // straight into it (folded in), instead of posting a separate scoreboard.
    if (mid != null) await updateLead(lead.id, { negMsgId: mid, negChatId: chat });
  } catch (e) {
    // Log only — the lead is already saved; alerts must never break it.
    console.error("[notify] lead Telegram alert failed:", e);
  }
}

/** Alert the owner about an ABANDONED (partial) form that still left a phone or
 * email — a high-intent seller worth chasing. Mirrors the full-lead alert (same
 * short ID + /offer /moreinfo /message commands) so the owner can reach out
 * straight from Telegram. Sent once per partial (the caller guards on
 * partialNotifiedAt). No-op if unconfigured; never throws. Await it. */
export async function notifyPartialLead(lead: Lead): Promise<void> {
  const chat = chatFor("leads");
  if (!BOT_TOKEN || !chat) return;
  const sid = lead.id.split("-")[0];
  const text = buildText(lead, PARTIAL_LEAD_HEADER);
  try {
    const mid = await sendText(text, chat, negKeyboard(lead));
    await sendText(sid, chat);
    if (mid != null) await updateLead(lead.id, { negMsgId: mid, negChatId: chat });
  } catch (e) {
    console.error("[notify] partial Telegram alert failed:", e);
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

/** Append a line to the dedicated audit-log channel (TELEGRAM_CHAT_LOGS) — a pure
 * history feed of every command / action. No-op until that channel is configured,
 * and it never falls back to another chat, so it can't clutter the leads group. */
export async function notifyLog(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_LOGS) return;
  try {
    await sendText(text, CHAT_LOGS);
  } catch (e) {
    console.error("[notify] audit-log failed:", e);
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
