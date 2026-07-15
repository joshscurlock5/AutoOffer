import "server-only";
import type { Lead, Referral } from "./types";
import { updateLead, claimReplyTopic, releaseReplyTopic } from "./store";

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
  if (lead.contactedAt) lines.push("", "✅ Contacted");
  lines.push("", `🆔 ${sid}`);

  // Fold the negotiation trail right into the lead — no separate scoreboard message.
  const trail = negTrail(lead.negotiation);
  if (trail) lines.push("", `📊 ${trail}`);

  return lines.join("\n");
}

// A basic group becomes a SUPERGROUP (e.g. when Topics is turned on) — which
// PERMANENTLY changes its chat id. Telegram then rejects sends to the old id with
// a 400 carrying `migrate_to_chat_id`. We follow that once and remember it, so a
// stale configured id can never again silently drop alerts (which is exactly how
// new-lead alerts went missing after the Leads group was upgraded). Per-instance
// cache. NOTE: the configured env id should still be corrected so INBOUND button
// taps (allow-listed in the webhook) also target the new id.
const migratedChat = new Map<string, string>();

function postMessage(chatId: string, text: string, replyMarkup?: unknown, messageThreadId?: number) {
  return fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(messageThreadId != null ? { message_thread_id: messageThreadId } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

/** Send a message, transparently following a basic-group→supergroup migration if
 * the id changed. Returns the message id AND the chat id it actually landed in
 * (so callers store the live id for later in-place edits). */
async function sendText(
  text: string,
  chatId: string,
  replyMarkup?: unknown,
  messageThreadId?: number,
): Promise<{ messageId?: number; chatId: string }> {
  let target = migratedChat.get(chatId) || chatId;
  let r = await postMessage(target, text, replyMarkup, messageThreadId);
  let j = await r.json().catch(() => null);
  if (!r.ok && j?.parameters?.migrate_to_chat_id) {
    const newId = String(j.parameters.migrate_to_chat_id);
    migratedChat.set(chatId, newId);
    target = newId;
    r = await postMessage(newId, text, replyMarkup, messageThreadId);
    j = await r.json().catch(() => null);
  }
  if (!r.ok) throw new Error(`sendMessage ${r.status}`);
  return { messageId: j?.result?.message_id, chatId: target };
}

// --- Replies-group Topics inbox: one forum topic per lead's conversation --------
// The Replies group is a forum (Topics enabled) with the bot as an admin holding
// "Manage Topics". Each lead gets one topic; inbound customer texts/emails post
// into it and the owner replies inside the topic. Additive — nothing calls these
// helpers until the inbound routes + webhook are wired.

/** Short vehicle label for a topic name. */
function carLabel(lead: Lead): string {
  const v = lead.vehicle;
  return v ? `${v.year} ${v.make} ${v.model}` : lead.kind === "inquiry" ? "Inquiry" : "Vehicle";
}

/** Topic name: "Name · Year Make Model · <channel icon>", clamped to Telegram's 128 chars. */
function topicNameFor(lead: Lead): string {
  const c = lead.contact;
  const icon = c.phone && c.email ? "📞✉️" : c.email ? "✉️" : c.phone ? "📞" : "";
  const name = (c.name || "").trim() || `#${lead.id.split("-")[0]}`;
  const base = `${name} · ${carLabel(lead)}${icon ? ` · ${icon}` : ""}`;
  return base.length > 128 ? `${base.slice(0, 127)}…` : base;
}

/** Create THIS lead's forum topic in the Replies group. Returns its thread id +
 * the (possibly migrated) chat id it lives in, or undefined on any failure (e.g.
 * the group isn't a forum / the bot lacks Manage Topics — Telegram 400s). Guarded
 * on CHAT_REPLIES being explicitly set so it never targets the fallback main chat. */
async function createReplyTopic(lead: Lead): Promise<{ threadId: number; chatId: string } | undefined> {
  if (!BOT_TOKEN || !CHAT_REPLIES) return undefined;
  const chatId = migratedChat.get(CHAT_REPLIES) || CHAT_REPLIES;
  try {
    const r = await fetch(api("createForumTopic"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, name: topicNameFor(lead) }),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.result?.message_thread_id != null) {
      return { threadId: j.result.message_thread_id, chatId };
    }
    console.error("[notify] createForumTopic failed:", j?.description || r.status);
    return undefined;
  } catch (e) {
    console.error("[notify] createForumTopic error:", e);
    return undefined;
  }
}

/** Get — or create exactly once — THIS lead's Replies-group topic id. Race-safe:
 * a conditional claim guarantees a single creator, and on failure the claim is
 * released so the lead is never permanently locked out of a topic. Returns
 * undefined when topics aren't available (not configured / group not a forum) or
 * on a lost create race — the caller should then fall back to a flat post. */
export async function getOrCreateReplyTopic(lead: Lead): Promise<number | undefined> {
  if (lead.replyTopicId != null) return lead.replyTopicId;
  if (!BOT_TOKEN || !CHAT_REPLIES) return undefined;
  const won = await claimReplyTopic(lead.id);
  if (!won) return undefined; // a concurrent caller is creating it — this message falls back to a flat post
  try {
    const created = await createReplyTopic(lead);
    if (!created) {
      await releaseReplyTopic(lead.id);
      return undefined;
    }
    await updateLead(lead.id, {
      replyTopicId: created.threadId,
      replyTopicChatId: created.chatId,
      replyTopicPending: undefined,
    });
    return created.threadId;
  } catch (e) {
    await releaseReplyTopic(lead.id);
    console.error("[notify] getOrCreateReplyTopic error:", e);
    return undefined;
  }
}

/** Post a message into a lead's Replies-group topic (best-effort). Returns the
 * sent message id, or undefined if the lead has no topic yet / the send failed. */
export async function notifyTopic(lead: Lead, text: string, replyMarkup?: unknown): Promise<number | undefined> {
  if (!BOT_TOKEN || lead.replyTopicId == null) return undefined;
  const chat = String(lead.replyTopicChatId ?? CHAT_REPLIES ?? "");
  if (!chat) return undefined;
  try {
    const sent = await sendText(text, chat, replyMarkup, lead.replyTopicId);
    return sent.messageId;
  } catch (e) {
    console.error("[notify] notifyTopic failed:", e);
    return undefined;
  }
}

/** ROOT action-bar menu for a Replies topic: just pick the channel — 📧 Email or
 * 💬 Text — to keep the bar uncluttered. Email shows only when the lead has an email,
 * Text only when it has a phone. Tapping one swaps the bar to that channel's sub-menu
 * (topicEmailMenu / topicTextMenu). Deliberately has NO negotiation-logging or
 * Contacted buttons — those live only on the Leads-alert keyboard. */
export function topicKeyboard(lead: Lead) {
  const sid = lead.id.split("-")[0];
  const row: { text: string; callback_data: string }[] = [];
  if (lead.contact.email) row.push({ text: "📧 Email", callback_data: `menu|email|${sid}` });
  if (lead.contact.phone) row.push({ text: "💬 Text", callback_data: `menu|text|${sid}` });
  if (!row.length) row.push({ text: "📧 Email", callback_data: `menu|email|${sid}` });
  return { inline_keyboard: [row] };
}

/** Email sub-menu: the three email actions + a Back to the root menu. Reuses the
 * existing act|offer/info/msg callbacks (the topic flow drafts + sends by email). */
export function topicEmailMenu(sid: string) {
  return {
    inline_keyboard: [
      [
        { text: "📧 Email offer", callback_data: `act|offer|${sid}` },
        { text: "❓ Ask for info", callback_data: `act|info|${sid}` },
        { text: "✉️ Message", callback_data: `act|msg|${sid}` },
      ],
      [{ text: "← Back", callback_data: `menu|root|${sid}` }],
    ],
  };
}

/** Text sub-menu: the text equivalents + Back. tact|* callbacks send by SMS — dormant
 * until Twilio is approved, at which point the webhook's tact handler wires the sends. */
export function topicTextMenu(sid: string) {
  return {
    inline_keyboard: [
      [
        { text: "💬 Text offer", callback_data: `tact|offer|${sid}` },
        { text: "❓ Ask for info", callback_data: `tact|info|${sid}` },
        { text: "📱 Message", callback_data: `tact|msg|${sid}` },
      ],
      [{ text: "← Back", callback_data: `menu|root|${sid}` }],
    ],
  };
}

/** Create (once) this lead's Replies-group topic and post the opening card into it
 * — the customer's details, how we can reach them, and the action buttons. Called
 * on every new full lead ("one topic per car submission"). Skips a lead that
 * already has a topic (so re-posting a lead doesn't double-seed). Best-effort:
 * a no-op when the Replies forum isn't configured, and never throws. */
export async function seedReplyTopic(lead: Lead): Promise<void> {
  if (!BOT_TOKEN || !CHAT_REPLIES || lead.replyTopicId != null) return;
  const c = lead.contact;
  const channel = c.email && c.phone ? "Email + Text" : c.email ? "Email" : c.phone ? "Text" : "—";
  const lines = [
    `💬 ${c.name || "New lead"} · ${carLabel(lead)}`,
    ...(c.phone ? [`📞 ${c.phone}`] : []),
    ...(c.email ? [`✉️ ${c.email}`] : []),
    `Channel: ${channel}`,
    "",
    "Type in this topic to message the customer — it goes straight to them (photos not yet supported). Their replies land here.",
    `🆔 ${lead.id.split("-")[0]}`,
  ];
  // postLeadTopic creates the topic, posts the card (no buttons), and drops the
  // action bar beneath it.
  await postLeadTopic(lead, lines.join("\n"));
}

/** Label on the floating action-bar message (the buttons-only message kept at the
 * bottom of every topic). Telegram requires non-empty text alongside a keyboard. */
const ACTION_BAR_LABEL = "⚡ Type to message the customer — or tap a button below.";

/** Delete a single message in a chat (best-effort). The bar is the bot's OWN
 * message, so this needs no special admin rights. */
async function deleteTopicMessage(chatId: string, messageId: number): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(api("deleteMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch {
    /* best-effort */
  }
}

/** Re-anchor the action bar to the BOTTOM of the topic: delete the old buttons-only
 * message, post a fresh one under the latest message, and remember its id. Keeps a
 * single, always-reachable action bar at the bottom so the owner never scrolls up to
 * act. Best-effort; never throws. */
async function bumpActionBar(lead: Lead, threadId: number): Promise<void> {
  const chat = String(lead.replyTopicChatId ?? CHAT_REPLIES ?? "");
  if (!chat) return;
  if (lead.topicActionBarMsgId != null) await deleteTopicMessage(chat, lead.topicActionBarMsgId);
  try {
    const sent = await sendText(ACTION_BAR_LABEL, chat, topicKeyboard(lead), threadId);
    await updateLead(lead.id, { topicActionBarMsgId: sent.messageId });
  } catch (e) {
    console.error("[notify] bumpActionBar failed:", e);
  }
}

/** Post a line into the lead's topic (creating the topic on demand), then re-anchor
 * the action bar beneath it. The content message carries NO buttons — the buttons
 * live only on the always-at-the-bottom bar. Used for BOTH inbound customer replies
 * AND mirroring our own outbound emails/texts, so the topic reads as a clean
 * back-and-forth record — even before the customer replies. Returns true if it
 * landed in a topic; false means the caller should fall back to a flat post.
 * Best-effort; never throws. */
export async function postLeadTopic(lead: Lead, text: string): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_REPLIES) return false;
  try {
    const threadId = await getOrCreateReplyTopic(lead);
    if (threadId == null) return false;
    const withTopic = { ...lead, replyTopicId: threadId };
    const sent = await notifyTopic(withTopic, text); // content only — no buttons
    await bumpActionBar(withTopic, threadId);
    return sent != null;
  } catch (e) {
    console.error("[notify] postLeadTopic failed:", e);
    return false;
  }
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
      [{ text: "✅ Contacted", callback_data: `act|called|${sid}` }],
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
    const sent = await sendText(text, chat, negKeyboard(lead));
    // Second message: the bare short ID only — no emoji, no label, nothing else —
    // so it can be long-pressed to copy on mobile. Sent once, with the lead alert
    // only (the /offer, /confirm, /cancel command replies never send it).
    await sendText(sid, sent.chatId);
    // Remember this alert's message so the negotiation trail can later be edited
    // straight into it (folded in), instead of posting a separate scoreboard.
    if (sent.messageId != null) await updateLead(lead.id, { negMsgId: sent.messageId, negChatId: sent.chatId });
  } catch (e) {
    // Log only — the lead is already saved; alerts must never break it.
    console.error("[notify] lead Telegram alert failed:", e);
  }
  // Open this lead's per-customer topic in the Replies group (best-effort; the
  // Leads alert above is the source of truth, so a topic failure can't break it).
  await seedReplyTopic(lead);
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
    const sent = await sendText(text, chat, negKeyboard(lead));
    await sendText(sid, sent.chatId);
    if (sent.messageId != null) await updateLead(lead.id, { negMsgId: sent.messageId, negChatId: sent.chatId });
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
