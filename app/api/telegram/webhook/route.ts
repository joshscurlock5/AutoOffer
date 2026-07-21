import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getBudgetStatus } from "@/lib/marketCache";
import { getLeadByShortId, updateLead, claimPendingOffer, claimPending, getLeadByReplyThreadId, claimRelayMessage } from "@/lib/store";
import { sendOfferEmail, sendMoreInfo, sendMessageEmail, sendPhotoMessageEmail, cancelScheduledEmails, offerPreview, moreInfoPreview, messagePreview } from "@/lib/email";
import { smsOfferReady, smsMoreInfo, smsSend, smsSendPhoto, smsConfigured, smsTo } from "@/lib/sms";
import { uploadOutboundMedia } from "@/lib/media";
import { telegramChatIds, notifyLog, notifyNewLead, postLeadTopic, topicKeyboard, topicEmailMenu, topicTextMenu, buildText, PARTIAL_LEAD_HEADER } from "@/lib/notify";
import { parseEdmonton } from "@/lib/time";
import { emitLeadContacted, emitOfferSent, emitBookingConfirmed } from "@/lib/leadStages";
import type { Lead, NegotiationEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pull one or two dollar amounts out of "8500-9000" / "8500 to 9000" / "$8,750". */
function parsePrice(s: string): { low: number; high: number } | null {
  const str = s.trim();
  // Only "N", "N-N", or "N to N" (optional $, commas, decimals). Rejects stray
  // numbers in trailing prose (e.g. "8500 (was 12000)") that would widen the range.
  if (!/^\$?\s*[\d,]+(?:\.\d+)?\s*(?:(?:-|to)\s*\$?\s*[\d,]+(?:\.\d+)?)?$/i.test(str)) return null;
  const nums = (str.match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map((x) => Math.round(Number(x.replace(/,/g, ""))))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  const a = nums[0];
  const b = nums[1] ?? nums[0];
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  if (low < 100 || high > 1_000_000) return null; // sanity guard against typos
  return { low, high };
}

/** "$8,500–$9,000" or "$8,750" for the Telegram replies. */
function fmtRange(low: number, high: number): string {
  const m = (n: number) => `$${n.toLocaleString("en-CA")}`;
  return low === high ? m(low) : `${m(low)}–${m(high)}`;
}

function carText(lead: Lead): string {
  const v = lead.vehicle;
  return v ? `${v.year} ${v.make} ${v.model}` : "their vehicle";
}

/** Loose email-shape check for /addemail (something@something.tld, no spaces). */
function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Validate a typed phone for /addphone — keep the owner's formatting, require 10–15 digits. */
function cleanPhone(s: string): string | null {
  const t = s.trim();
  const digits = t.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return t;
}

const SCHED_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Parse a scheduled-recontact date from the START of a string (the remainder is the
 * note). Accepts MM/DD/YY, MM-DD-YY, MM/DD/YYYY, "MM DD YY", MM/DD (year inferred to the
 * next occurrence), and "Oct 3" / "October 3 2026" — US-style, month first. Returns the
 * ISO date (YYYY-MM-DD), a friendly label, and the leftover text. Null if no date found. */
function parseScheduleDate(input: string): { iso: string; friendly: string; rest: string } | null {
  const s = input.trim();
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(new Date());
  let mo: number | undefined, day: number | undefined, yr: number | undefined, matchLen = 0, hadYear = false;
  const num = s.match(/^(\d{1,2})\s*[/\-. ]\s*(\d{1,2})(?:\s*[/\-. ]\s*(\d{2,4}))?/);
  if (num) {
    mo = Number(num[1]); day = Number(num[2]);
    if (num[3]) { yr = Number(num[3]); hadYear = true; }
    matchLen = num[0].length;
  } else {
    const nm = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i);
    if (nm) {
      const mi = SCHED_MONTHS.findIndex((name) => name.startsWith(nm[1].toLowerCase()));
      if (mi >= 0) { mo = mi + 1; day = Number(nm[2]); if (nm[3]) { yr = Number(nm[3]); hadYear = true; } matchLen = nm[0].length; }
    }
  }
  if (mo === undefined || day === undefined || mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const M = mo, D = day;
  const Y = yr === undefined ? Number(todayIso.slice(0, 4)) : yr < 100 ? 2000 + yr : yr;
  const mk = (y: number) => `${y}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
  let iso = mk(Y);
  const dt = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() + 1 !== M || dt.getUTCDate() !== D) return null; // e.g. Feb 30
  if (!hadYear && iso < todayIso) iso = mk(Y + 1); // a bare "10/3" that already passed → next year
  const friendly = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${iso}T12:00:00Z`));
  const rest = s.slice(matchLen).replace(/^[\s,.\-–—]+/, "").trim();
  return { iso, friendly, rest };
}


// ---------------------------------------------------------------------------
//  Inbound Telegram webhook — the ONLY place the bot receives messages.
//  Telegram POSTs every update here once the webhook is registered (run
//  scripts/set-telegram-webhook.mjs). We only act on the `/usage` command,
//  only from the authorized chat, and only when the secret header matches.
//  Everything else returns 200 and is ignored, so Telegram never retries.
// ---------------------------------------------------------------------------

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const EMOJI_USAGE = String.fromCodePoint(0x1f4ca); // 📊 bar chart

// (/moreinfo takes free-text questions, one per line — no preset codes.)

async function reply(chatId: number | string, text: string, threadId?: number): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(threadId != null ? { message_thread_id: threadId } : {}),
      }),
    });
  } catch {
    /* best-effort */
  }
}

/** Stop a tapped button's loading spinner. */
async function answerCallback(id: string, text?: string): Promise<void> {
  if (!BOT_TOKEN || !id) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // A `text` shows as a brief toast at the top of the chat (no message to clean up).
      body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
    });
  } catch {
    /* best-effort */
  }
}

/** Send a message that pops a reply box (force_reply), threaded under the lead
 * alert. The text carries a ⟨neg|kind|id⟩ or ⟨act|kind|id⟩ marker the reply
 * handler parses back. `placeholder` hints what to type in the reply box. */
async function sendPrompt(chatId: number | string, text: string, replyToMsgId?: number, placeholder = "e.g. 8500", threadId?: number): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: { force_reply: true, input_field_placeholder: placeholder },
        ...(replyToMsgId ? { reply_to_message_id: replyToMsgId } : {}),
        ...(threadId != null ? { message_thread_id: threadId } : {}),
      }),
    });
  } catch {
    /* best-effort */
  }
}

const negMoney = (n: number): string => `$${Math.round(n).toLocaleString("en-CA")}`;
const negIcon = (k: NegotiationEntry["kind"]): string =>
  k === "ask" ? "💬 ask" : k === "offer" ? "💵 offer" : "✅ bought";

/** The running negotiation log as a one-line arrow trail. */
function negTrail(entries: NegotiationEntry[] | undefined): string {
  if (!entries || !entries.length) return "(none yet)";
  return entries.map((e) => `${negIcon(e.kind)} ${negMoney(e.amount)}`).join("  →  ");
}

/** ✅ Send / ✋ Cancel bar for a drafted email (offer/info/msg) — same callback_data
 * the send/cancel handler already parses. Module-level so the topic pending-action
 * handler and the Leads-channel reply handler both use one shape. */
function confirmSendKb(kind: string, code: string) {
  return {
    inline_keyboard: [[
      { text: "✅ Send", callback_data: `act|${kind}send|${code}` },
      { text: "✋ Cancel", callback_data: `act|${kind}cancel|${code}` },
    ]],
  };
}

/** A lone ✋ Cancel button for a topic action prompt (clears the pending action). */
function cancelActionKb(code: string) {
  return { inline_keyboard: [[{ text: "✋ Cancel", callback_data: `tcancel|${code}` }]] };
}

/** ✅ Add / ✋ Cancel for a pending /addphone or /addemail contact edit (topic flow). */
function contactConfirmKb(code: string) {
  return {
    inline_keyboard: [[
      { text: "✅ Add", callback_data: `contact|save|${code}` },
      { text: "✋ Cancel", callback_data: `contact|cancel|${code}` },
    ]],
  };
}

/** In-topic /addphone or /addemail: the ID is implied by the customer's thread, so we
 * run the same guided flow as the offer/info/message buttons — prompt for the value,
 * take the owner's next message, then a ✅ Add confirm — instead of the Leads-channel
 * "<id> <value>" inline form. A value typed inline (/addphone 780-555-1234) skips the
 * prompt and jumps straight to the confirm. The /addphone command line is scrubbed so
 * only the final "📞 Phone added" confirmation is left. Best-effort; never throws. */
async function startTopicContactEdit(
  field: "phone" | "email",
  lead: Lead,
  inlineVal: string,
  chat: number | string,
  thread: number,
  ownerMsgId: number | undefined,
): Promise<void> {
  const sid = lead.id.split("-")[0];
  const icon = field === "phone" ? "📞" : "✉️";
  const noun = field === "phone" ? "phone number" : "email";
  const name = lead.contact.name || "this customer";
  // Keep the topic clean — drop the "/addphone" command message itself.
  if (typeof ownerMsgId === "number") await deleteMessage(chat, ownerMsgId);

  if (inlineVal) {
    // Value supplied on the command line — validate and go straight to the confirm.
    const value = field === "phone" ? cleanPhone(inlineVal) : looksLikeEmail(inlineVal) ? inlineVal.toLowerCase() : "";
    if (!value) {
      await reply(chat, `That doesn't look like a ${noun}. Type /add${field} on its own and I'll prompt you.`, thread);
      return;
    }
    await updateLead(lead.id, { pendingContactEdit: { field, value, at: new Date().toISOString() } });
    const exists = field === "phone" ? lead.contact.phone : lead.contact.email;
    await sendReturningId(chat, `${exists ? "Update" : "Add"} ${field} for ${name}?\n${icon} ${value}`, contactConfirmKb(sid), thread);
    return;
  }

  // No value yet — stash the pending action and prompt (mirrors the act|* buttons).
  const kind = field === "phone" ? "addphone" : "addemail";
  const at = new Date().toISOString();
  await updateLead(lead.id, { pendingTopicAction: { kind, at } });
  const pmid = await sendReturningId(
    chat,
    `${icon} Type the ${noun} to add to ${name}'s profile — your next message here fills it in.`,
    cancelActionKb(sid),
    thread,
  );
  if (typeof pmid === "number") await updateLead(lead.id, { pendingTopicAction: { kind, at, promptMsgId: pmid } });
}

/** The lead-action buttons for a short id (put on the alert + the in-place summary):
 * negotiation logging (ask/offer/bought) + the tap-to-act row (email/info/message). */
function negKeyboardFor(sid: string) {
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

/** sendMessage that returns the new message_id (so we can edit it in place later). */
async function sendReturningId(chatId: number | string, text: string, replyMarkup?: unknown, threadId?: number): Promise<number | undefined> {
  if (!BOT_TOKEN) return undefined;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}), ...(threadId != null ? { message_thread_id: threadId } : {}) }),
    });
    const j = await r.json();
    return typeof j?.result?.message_id === "number" ? j.result.message_id : undefined;
  } catch {
    return undefined;
  }
}

/** Swap only a message's inline keyboard in place (leaves the text). Used to switch
 * a topic action bar between its root menu and the Email/Text sub-menus. */
async function editMessageReplyMarkup(chatId: number | string, messageId: number, replyMarkup: unknown): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: replyMarkup }),
    });
  } catch {
    /* best-effort */
  }
}

/** Edit a message's text (+ optional buttons) in place. */
async function editMessage(chatId: number | string, messageId: number, text: string, replyMarkup?: unknown, parseMode?: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true, ...(parseMode ? { parse_mode: parseMode } : {}), ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    });
  } catch {
    /* best-effort */
  }
}

/** Delete a message. The bot can always delete its OWN messages; deleting the
 * owner's typed number needs the bot to be a group admin with delete rights. */
async function deleteMessage(chatId: number | string, messageId: number): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch {
    /* best-effort */
  }
}

/** Re-render a lead's alert message in place so the negotiation trail (folded into
 * buildText) shows right on the lead — no separate scoreboard message. Best-effort:
 * only works for leads whose alert message we tracked (negMsgId/negChatId, set by
 * notifyNewLead); older leads simply skip the visible edit (data's still saved + logged). */
async function refreshLeadAlert(lead: Lead): Promise<void> {
  if (lead.negMsgId == null || lead.negChatId == null) return;
  const code = lead.id.split("-")[0];
  // Keep the original header (an abandoned-form lead must not get relabeled "new").
  const header = lead.status === "partial" || lead.partialNotifiedAt ? PARTIAL_LEAD_HEADER : undefined;
  await editMessage(lead.negChatId, lead.negMsgId, buildText(lead, header, { html: true }), negKeyboardFor(code), "HTML");
}

/** Download a Telegram photo/file by file_id → bytes + a filename + content-type.
 * Two hops: getFile (id → file_path) then the file CDN. Best-effort; null on failure. */
async function downloadTelegramFile(
  fileId: string,
): Promise<{ bytes: Uint8Array; filename: string; contentType: string; ext: string } | null> {
  if (!BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const j = await r.json().catch(() => null);
    const filePath: string | undefined = j?.result?.file_path;
    if (!filePath) return null;
    const dl = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
    if (!dl.ok) return null;
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
    const contentType =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    return { bytes, filename: `photo.${ext}`, contentType, ext };
  } catch (e) {
    console.error("[telegram] file download failed:", e);
    return null;
  }
}

/** Forward a downloaded image to the customer, mirroring the text relay's channel
 * fallback: email attachment when they have a WORKING email, MMS when they're textable
 * and Twilio is live — so a bounced-email lead with a good number still gets it. Prefers
 * the channel they last used. Posts a clean "📤 Sent a photo …" line, or an actionable
 * note if nothing could carry it. dedupeKey (the Telegram message id) keys the email's
 * idempotency so a re-send delivers but a redelivery doesn't. Best-effort; never throws. */
async function forwardImageToCustomer(
  lead: Lead,
  file: { bytes: Uint8Array; filename: string; contentType: string; ext: string },
  caption: string,
  dedupeKey: string,
): Promise<void> {
  const canText = Boolean(smsTo(lead)) && smsConfigured();
  const tryEmail = async (): Promise<boolean> => {
    if (!lead.contact.email) return false;
    const res = await sendPhotoMessageEmail(lead, {
      base64: Buffer.from(file.bytes).toString("base64"),
      filename: file.filename,
      caption,
      dedupeKey,
    });
    return res.ok;
  };
  const tryMms = async (): Promise<boolean> => {
    if (!canText) return false;
    const mediaUrl = await uploadOutboundMedia(file.bytes, file.contentType, file.ext);
    return mediaUrl ? smsSendPhoto(lead, mediaUrl, caption || "A photo from DriveOffer.") : false;
  };

  const preferSms = lead.lastInboundChannel === "sms" && canText;
  let ok = false;
  let via = "";
  if (preferSms) {
    ok = await tryMms();
    via = "texted";
    if (!ok) { ok = await tryEmail(); if (ok) via = "emailed"; }
  } else {
    ok = await tryEmail();
    via = "emailed";
    if (!ok) { ok = await tryMms(); if (ok) via = "texted"; }
  }

  if (ok) {
    await postLeadTopic(lead, `📤 Sent a photo (${via})${caption ? `: ${caption}` : ""}`);
  } else if (!lead.contact.email && !canText) {
    await postLeadTopic(
      lead,
      "📷 Photos to a text-only customer need Twilio (not live yet). Add an email with /addemail and I'll send it right away.",
    );
  } else {
    await postLeadTopic(lead, "⚠️ Couldn't send the photo. Try again, or add a good email/number with /addemail or /addphone.");
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Telegram's secret header (set during setWebhook). If we have a
    //    secret configured and it doesn't match, silently ignore.
    if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
      return NextResponse.json({ ok: true });
    }

    const update = await req.json().catch(() => ({}));

    // --- Inline-button taps. Handled first: a callback carries no message.text,
    //     so it must not fall through to the msg branch. ---
    const cb = update?.callback_query;
    if (cb) {
      const cbChat = cb.message?.chat?.id;
      // If the tap came from inside a forum topic (a customer's Replies-group topic),
      // keep every prompt/preview we send in reply INSIDE that same topic.
      const cbThread: number | undefined = cb.message?.message_thread_id;
      const allowed = telegramChatIds();
      if (allowed.length && !allowed.includes(String(cbChat))) {
        await answerCallback(cb.id);
        return NextResponse.json({ ok: true });
      }
      const who = cb.from?.first_name || cb.from?.username || "owner";
      const data = String(cb.data || "");
      // Stop the button spinner now for every tap EXCEPT the "Called" toggle, which
      // answers with a confirmation toast instead (a callback can be answered once).
      const isCalledToggle = /^act\|called\|/.test(data);
      if (!isCalledToggle) await answerCallback(cb.id);

      // Topic action-bar menu navigation — swap the bar between its root (📧 Email /
      // 💬 Text) and the Email/Text sub-menus, in place. Replies topics only.
      const menuM = data.match(/^menu\|(email|text|root)\|(\S+)$/);
      if (menuM) {
        const which = menuM[1];
        const code = menuM[2];
        const { lead } = await getLeadByShortId(code);
        if (!lead) {
          await reply(cbChat, `No lead found for "${code}".`);
          return NextResponse.json({ ok: true });
        }
        const kb = which === "email" ? topicEmailMenu(code) : which === "text" ? topicTextMenu(code) : topicKeyboard(lead);
        if (typeof cb.message?.message_id === "number") await editMessageReplyMarkup(cbChat, cb.message.message_id, kb);
        return NextResponse.json({ ok: true });
      }

      // Text sub-menu actions (tact|offer/info/msg) — send by SMS. DORMANT until the
      // Twilio number is approved; for now, tell the owner clearly and do nothing.
      const tactM = data.match(/^tact\|(offer|info|msg)\|(\S+)$/);
      if (tactM) {
        await reply(
          cbChat,
          "📱 Texting isn't live yet — it turns on once your Twilio number is approved. Use 📧 Email for now.",
          cbThread,
        );
        return NextResponse.json({ ok: true });
      }

      // Negotiation logging buttons → open a number reply box under the alert.
      const negM = data.match(/^neg\|(ask|offer|bought)\|(\S+)$/);
      if (negM) {
        const kind = negM[1] as NegotiationEntry["kind"];
        const code = negM[2];
        const { lead } = await getLeadByShortId(code);
        if (!lead) {
          await reply(cbChat, `No lead found for "${code}".`);
          return NextResponse.json({ ok: true });
        }
        const label =
          kind === "ask" ? "💬 THEIR ASK" : kind === "offer" ? "💵 OUR OFFER" : "✅ BOUGHT — final price paid";
        // Topic: stash the action; the owner's NEXT message here is the amount (no
        // fragile "reply to this"). Leads channel: the reliable force-reply prompt.
        if (cbThread != null) {
          const at = new Date().toISOString();
          await updateLead(lead.id, { pendingTopicAction: { kind, at } });
          const pmid = await sendReturningId(
            cbChat,
            `${label} · ${carText(lead)}\nType the amount (e.g. 8500) — your next message here logs it.`,
            cancelActionKb(code),
            cbThread,
          );
          if (typeof pmid === "number") await updateLead(lead.id, { pendingTopicAction: { kind, at, promptMsgId: pmid } });
          return NextResponse.json({ ok: true });
        }
        await sendPrompt(
          cbChat,
          `${label} · ${carText(lead)}\nReply to this message with just the number (e.g. 8500).\n⟨neg|${kind}|${code}⟩`,
          cb.message?.message_id,
          "e.g. 8500",
          cbThread,
        );
        return NextResponse.json({ ok: true });
      }

      // Action buttons (email offer / ask for info / message) → show a BLANK email
      // preview (a mock of the email with a ______ where his input goes) with the
      // reply box open, so the owner sees exactly what he's filling in.
      const actM = data.match(/^act\|(offer|info|msg)\|(\S+)$/);
      if (actM) {
        const kind = actM[1];
        const code = actM[2];
        const { lead, multiple } = await getLeadByShortId(code);
        if (multiple) {
          await reply(cbChat, `More than one lead matches "${code}". Tap the button on the right lead.`);
          return NextResponse.json({ ok: true });
        }
        if (!lead) {
          await reply(cbChat, `No lead found for "${code}".`);
          return NextResponse.json({ ok: true });
        }
        if (!lead.contact.email) {
          await reply(cbChat, `${lead.contact.name || "That lead"} is phone-only (no email). Reach them at ${lead.contact.phone || "their number"}.`);
          return NextResponse.json({ ok: true });
        }
        const ph = kind === "offer" ? "e.g. 8500" : kind === "info" ? "one question per line" : "type your message";
        // In a topic: stash the action and take the owner's NEXT message as the input
        // (no email mockup, no fragile "reply to this"). Leads channel: the full
        // blank-email preview + force-reply the owner already knows.
        if (cbThread != null) {
          const pk = kind === "offer" ? "eoffer" : kind === "info" ? "einfo" : "emsg";
          const at = new Date().toISOString();
          await updateLead(lead.id, { pendingTopicAction: { kind: pk, at } });
          const prompt =
            kind === "offer"
              ? `💵 Type your offer for the ${carText(lead)} — e.g. 8500 or 8500-9000.`
              : kind === "info"
                ? `❓ Type your questions for the ${carText(lead)}, one per line.`
                : `✉️ Type your message to ${lead.contact.name || "the customer"}.`;
          // Remember the prompt id so it's auto-removed once the owner's input arrives.
          const pmid = await sendReturningId(cbChat, `${prompt}\nYour next message here fills it in.`, cancelActionKb(code), cbThread);
          if (typeof pmid === "number") await updateLead(lead.id, { pendingTopicAction: { kind: pk, at, promptMsgId: pmid } });
          return NextResponse.json({ ok: true });
        }
        const preview =
          kind === "offer" ? offerPreview(lead) : kind === "info" ? moreInfoPreview(lead) : messagePreview(lead);
        const hint =
          kind === "offer"
            ? "↳ Reply with the price (e.g. 8500 or 8500-9000) to fill it in."
            : kind === "info"
              ? "↳ Reply with your questions — one per line — to fill them in."
              : "↳ Reply with your message to fill it in.";
        await sendPrompt(cbChat, `${preview}\n\n${hint}\n⟨act|${kind}|${code}⟩`, cb.message?.message_id, ph, cbThread);
        return NextResponse.json({ ok: true });
      }

      // 🔄 Re-contact → schedule a one-off manual re-contact (ask the date, then the note).
      // Topic: pending-action stash (survives topics); Leads: force-reply markers.
      const rcM = data.match(/^rc\|start\|(\S+)$/);
      if (rcM) {
        const code = rcM[1];
        const { lead, multiple } = await getLeadByShortId(code);
        if (multiple) {
          await reply(cbChat, `More than one lead matches "${code}". Tap the button on the right lead.`);
          return NextResponse.json({ ok: true });
        }
        if (!lead) {
          await reply(cbChat, `No lead found for "${code}".`);
          return NextResponse.json({ ok: true });
        }
        const ask = `🔄 When should we re-contact ${lead.contact.name || "this customer"}? Type a date — e.g. 10/3/26 or October 3.`;
        if (cbThread != null) {
          const at = new Date().toISOString();
          await updateLead(lead.id, { pendingTopicAction: { kind: "rcdate", at } });
          const pmid = await sendReturningId(cbChat, `${ask}\nYour next message here sets it.`, cancelActionKb(code), cbThread);
          if (typeof pmid === "number") await updateLead(lead.id, { pendingTopicAction: { kind: "rcdate", at, promptMsgId: pmid } });
          return NextResponse.json({ ok: true });
        }
        await sendPrompt(cbChat, `${ask}\n⟨rc|date|${code}⟩`, cb.message?.message_id, "e.g. 10/3/26", cbThread);
        return NextResponse.json({ ok: true });
      }

      // Filled preview → ✅ Send or ✋ Cancel the drafted email (offer / info / message).
      const sendM = data.match(/^act\|(offer|info|msg)(send|cancel)\|(\S+)$/);
      if (sendM) {
        const kind = sendM[1];
        const action = sendM[2];
        const code = sendM[3];
        const { lead, multiple } = await getLeadByShortId(code);
        const previewMsgId = cb.message?.message_id;
        const clearPreview = async () => {
          if (typeof previewMsgId === "number") await deleteMessage(cbChat, previewMsgId);
        };
        const kindLabel = kind === "offer" ? "offer" : kind === "info" ? "info request" : "message";
        // Ambiguous short id — never mutate/email a guessed lead (matches every other path).
        if (multiple) {
          await reply(cbChat, `More than one lead matches "${code}". Tap the button on the right lead.`);
          return NextResponse.json({ ok: true });
        }
        if (!lead) {
          await clearPreview();
          await reply(cbChat, `No lead found for "${code}".`);
          return NextResponse.json({ ok: true });
        }

        // ✋ Cancel — discard the matching draft and remove the preview.
        if (action === "cancel") {
          const patch: Partial<Lead> =
            kind === "offer"
              ? { pendingOffer: undefined }
              : kind === "info"
                ? { pendingInfo: undefined }
                : { pendingMessage: undefined };
          await updateLead(lead.id, patch);
          await clearPreview();
          await notifyLog(`🚫 ${who} cancelled a draft ${kindLabel} — ${carText(lead)} (${code})`);
          return NextResponse.json({ ok: true });
        }

        // ✅ Send — previews are only ever shown for a lead with an email, but re-check.
        if (!lead.contact.email) {
          await reply(cbChat, `${lead.contact.name || "That lead"} is phone-only. Reach them at ${lead.contact.phone || "their number"}.`);
          return NextResponse.json({ ok: true });
        }

        if (kind === "offer") {
          if (!lead.pendingOffer) {
            await clearPreview();
            await reply(cbChat, `That draft was already sent or cancelled (${code}).`);
            return NextResponse.json({ ok: true });
          }
          const { low, high } = lead.pendingOffer;
          // Atomically claim the send so a double-tap / Telegram redelivery can't email
          // the offer twice — only the winner proceeds (mirrors claimPurchaseSync).
          const claimed = await claimPendingOffer(lead.id);
          if (!claimed) {
            await clearPreview();
            await reply(cbChat, `That draft was already sent or cancelled (${code}).`);
            return NextResponse.json({ ok: true });
          }
          const bookingToken = lead.bookingToken || crypto.randomUUID().replace(/-/g, "");
          lead.bookingToken = bookingToken;
          const res = await sendOfferEmail(lead, low, high);
          if (!res.ok) {
            // Send failed after we claimed — restore the draft so it can be retried.
            await updateLead(lead.id, { pendingOffer: { low, high, at: new Date().toISOString() } });
            await reply(cbChat, `Couldn't send — ${res.reason}. The draft is saved; tap 📧 Email offer to try again.`);
            return NextResponse.json({ ok: true });
          }
          if (lead.dripEmailIds?.length) await cancelScheduledEmails(lead.dripEmailIds);
          const nowISO = new Date().toISOString();
          const wasNewlyContacted = !lead.contactedAt;
          const negotiation = [
            ...(lead.negotiation || []),
            { at: nowISO, kind: "offer" as const, amount: Math.round((low + high) / 2) },
          ].slice(-100);
          const updatedLead = await updateLead(lead.id, {
            offer: { low, high, sentAt: nowISO },
            negotiation,
            bookingToken,
            nurtureStage: "offer_sent",
            offerSentAt: nowISO,
            moreInfoSentAt: undefined,
            lastNurtureAt: undefined,
            firstTouchAt: lead.firstTouchAt || nowISO,
            contactedAt: lead.contactedAt || nowISO,
            pendingOffer: undefined,
            dripEmailIds: [],
            status: lead.status === "new" ? "contacted" : lead.status,
          });
          // Fold the emailed offer into the lead's own alert message (no scoreboard).
          await refreshLeadAlert(updatedLead || { ...lead, negotiation });
          await smsOfferReady(lead, low, high);
          await emitOfferSent(updatedLead || lead);
          if (wasNewlyContacted) await emitLeadContacted(updatedLead || lead);
          await notifyLog(`📧 ${who} emailed offer ${fmtRange(low, high)} — ${carText(lead)} (${code})`);
          await postLeadTopic(updatedLead || lead, `📧 Email offer sent — ${fmtRange(low, high)} (emailed)`);
          await clearPreview();
          return NextResponse.json({ ok: true });
        }

        if (kind === "info") {
          const questions = lead.pendingInfo;
          if (!questions || !questions.length) {
            await clearPreview();
            await reply(cbChat, `That draft was already sent or cancelled (${code}).`);
            return NextResponse.json({ ok: true });
          }
          const claimed = await claimPending(lead.id, "pendingInfo");
          if (!claimed) {
            await clearPreview();
            await reply(cbChat, `That draft was already sent or cancelled (${code}).`);
            return NextResponse.json({ ok: true });
          }
          const res = await sendMoreInfo(lead, questions);
          if (!res.ok) {
            await updateLead(lead.id, { pendingInfo: questions });
            await reply(cbChat, `Couldn't send — ${res.reason}. The draft is saved; tap ❓ Ask for info to try again.`);
            return NextResponse.json({ ok: true });
          }
          const nowISO = new Date().toISOString();
          const wasNewlyContacted = !lead.contactedAt;
          const updatedLead = await updateLead(lead.id, {
            nurtureStage: "awaiting_info",
            moreInfoSentAt: nowISO,
            infoQuestions: questions,
            lastNurtureAt: undefined,
            firstTouchAt: lead.firstTouchAt || nowISO,
            contactedAt: lead.contactedAt || nowISO,
            pendingInfo: undefined,
            status: lead.status === "new" ? "contacted" : lead.status,
          });
          await refreshLeadAlert(updatedLead || lead);
          await smsMoreInfo(lead);
          if (wasNewlyContacted) await emitLeadContacted(updatedLead || lead);
          await notifyLog(`❓ ${who} asked ${questions.length} question${questions.length > 1 ? "s" : ""} — ${carText(lead)} (${code}):\n• ${questions.join("\n• ")}`);
          await postLeadTopic(updatedLead || lead, `❓ Asked for info (emailed):\n• ${questions.join("\n• ")}`);
          await clearPreview();
          return NextResponse.json({ ok: true });
        }

        // kind === "msg"
        const message = lead.pendingMessage;
        if (!message) {
          await clearPreview();
          await reply(cbChat, `That draft was already sent or cancelled (${code}).`);
          return NextResponse.json({ ok: true });
        }
        const claimedMsg = await claimPending(lead.id, "pendingMessage");
        if (!claimedMsg) {
          await clearPreview();
          await reply(cbChat, `That draft was already sent or cancelled (${code}).`);
          return NextResponse.json({ ok: true });
        }
        const resMsg = await sendMessageEmail(lead, message);
        if (!resMsg.ok) {
          await updateLead(lead.id, { pendingMessage: message });
          await reply(cbChat, `Couldn't send — ${resMsg.reason}. The draft is saved; tap ✉️ Message to try again.`);
          return NextResponse.json({ ok: true });
        }
        const nowISOMsg = new Date().toISOString();
        const wasNewlyContactedMsg = !lead.contactedAt;
        const updatedLeadMsg = await updateLead(lead.id, {
          firstTouchAt: lead.firstTouchAt || nowISOMsg,
          contactedAt: lead.contactedAt || nowISOMsg,
          pendingMessage: undefined,
          status: lead.status === "new" ? "contacted" : lead.status,
        });
        await refreshLeadAlert(updatedLeadMsg || lead);
        if (wasNewlyContactedMsg) await emitLeadContacted(updatedLeadMsg || lead);
        await notifyLog(`✉️ ${who} messaged — ${carText(lead)} (${code}): "${message.slice(0, 200)}"`);
        await postLeadTopic(updatedLeadMsg || lead, `📤 Messaged (emailed): ${message}`);
        await clearPreview();
        return NextResponse.json({ ok: true });
      }

      // "📞 Called" toggle — mark/unmark the lead contacted-by-phone (misclick-safe:
      // tap again to undo, which reverts the status). Confirms with a brief toast and
      // folds a 📞 Called marker into the alert. No email or Meta/GA4 event fires — a
      // phone call isn't a digital conversion, and this keeps a misclick harmless.
      const calledM = data.match(/^act\|called\|(\S+)$/);
      if (calledM) {
        const code = calledM[1];
        const { lead, multiple } = await getLeadByShortId(code);
        if (multiple) {
          await answerCallback(cb.id, `More than one lead matches "${code}".`);
          return NextResponse.json({ ok: true });
        }
        if (!lead) {
          await answerCallback(cb.id, `No lead found for "${code}".`);
          return NextResponse.json({ ok: true });
        }
        // A toggle on the CONTACTED state (not on the button's own history): if the
        // lead is contacted by ANY means — including an auto email-contact — pressing
        // it moves them back to "new". Leads already past contacted (scheduled/closed/
        // …) are left untouched so a misclick can't undo a booking.
        const nowISO = new Date().toISOString();
        let patch: Partial<Lead> | null = null;
        let toast: string;
        if (lead.status === "new") {
          patch = { status: "contacted", contactedAt: nowISO, calledAt: nowISO };
          toast = "✅ Marked contacted";
        } else if (lead.status === "contacted") {
          patch = { status: "new", contactedAt: undefined, calledAt: undefined };
          toast = "↩️ Marked NOT contacted";
        } else {
          toast = `Already ${lead.status} — left unchanged.`;
        }
        if (patch) {
          const updated = await updateLead(lead.id, patch);
          await refreshLeadAlert(updated || { ...lead, ...patch });
          await notifyLog(`📞 ${who} marked ${patch.status === "contacted" ? "CONTACTED" : "NOT contacted"} — ${carText(lead)} (${code})`);
          // Tapped inside a topic → leave a clean log line there too (and re-anchor the bar).
          if (cbThread != null) {
            await postLeadTopic(updated || { ...lead, ...patch }, patch.status === "contacted" ? "✅ Marked contacted" : "↩️ Marked not contacted");
          }
        }
        await answerCallback(cb.id, toast);
        return NextResponse.json({ ok: true });
      }

      // ✋ Cancel on a topic action prompt — clear the pending action and remove the prompt.
      const tcancelM = data.match(/^tcancel\|(\S+)$/);
      if (tcancelM) {
        const code = tcancelM[1];
        const { lead } = await getLeadByShortId(code);
        if (lead) await updateLead(lead.id, { pendingTopicAction: undefined });
        if (typeof cb.message?.message_id === "number") await deleteMessage(cbChat, cb.message.message_id);
        return NextResponse.json({ ok: true });
      }

      // ✅ Add / ✋ Cancel a pending /addphone or /addemail contact edit (topic flow).
      // Scrubs the confirm preview either way; on Add, saves the field and posts a clean
      // confirmation via postLeadTopic — which re-anchors the action bar, so the newly
      // enabled channel's button (💬 Text after a phone, 📧 Email after an email) appears.
      const contactM = data.match(/^contact\|(save|cancel)\|(\S+)$/);
      if (contactM) {
        const action = contactM[1];
        const code = contactM[2];
        const { lead } = await getLeadByShortId(code);
        if (typeof cb.message?.message_id === "number") await deleteMessage(cbChat, cb.message.message_id);
        if (!lead) return NextResponse.json({ ok: true });
        const edit = lead.pendingContactEdit;
        if (action === "cancel" || !edit) {
          await updateLead(lead.id, { pendingContactEdit: undefined });
          return NextResponse.json({ ok: true });
        }
        const contact = { ...lead.contact };
        if (edit.field === "phone") contact.phone = edit.value;
        else contact.email = edit.value;
        const updated = await updateLead(lead.id, { contact, pendingContactEdit: undefined });
        const line = edit.field === "phone" ? `📞 Phone added: ${edit.value}` : `✉️ Email added: ${edit.value}`;
        await postLeadTopic(updated || { ...lead, contact }, line);
        await notifyLog(`📇 ${who} added ${edit.field} (${edit.value}) — ${carText(lead)} (${code})`);
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: true });
    }

    const msg = update?.message ?? update?.channel_post;
    const text: string = String(msg?.text || "").trim();
    const fromChat = msg?.chat?.id;

    // /id — reply with this chat's own id. Placed BEFORE the allowlist so a brand-
    // new notification group (not yet in the env vars) can still discover its id.
    if (msg && /^\/id(@\w+)?\b/i.test(text)) {
      await reply(fromChat, `This chat's ID: ${fromChat}`);
      return NextResponse.json({ ok: true });
    }

    // 2) Only respond to one of the owner's authorized chats — any configured
    //    channel group (Leads / Bookings / Updates / Replies / the original chat).
    const allowedChats = telegramChatIds();
    if (!msg || (allowedChats.length && !allowedChats.includes(String(fromChat)))) {
      return NextResponse.json({ ok: true });
    }

    // Audit trail: mirror every command to the logs channel for a permanent history.
    // Who = the sender. Skip replies to a bot prompt (⟨neg|…⟩/⟨act|…⟩) — those get
    // their own precise log line in the handlers below, so we don't double-log a
    // typed message/questions that happen to start with "/".
    const who = msg?.from?.first_name || msg?.from?.username || "owner";
    const replyToText = String(msg?.reply_to_message?.text || "");
    // Which forum topic (if any) this message is in — so previews we send stay in it,
    // and so a plain message typed in a customer's topic can be relayed to them.
    const msgThread: number | undefined = msg?.message_thread_id;
    const inTopic = Boolean(msg?.is_topic_message) && typeof msgThread === "number";
    if (text.startsWith("/") && !/⟨(?:neg|act)\|/.test(replyToText)) await notifyLog(`📝 ${who}: ${text.slice(0, 300)}`);

    // 2b) A reply to a tapped button. The prompt carries a marker off which we route:
    //     ⟨neg|kind|id⟩ → log a negotiation number · ⟨act|kind|id⟩ → email/info/message.
    const promptId = msg?.reply_to_message?.message_id;
    // Success path clears the noise: our prompt + whatever the owner typed. The
    // permanent record lives in the 📒 Logs channel / the 📊 summary instead.
    const clearPromptAndInput = async () => {
      if (typeof promptId === "number") await deleteMessage(fromChat, promptId);
      if (typeof msg?.message_id === "number") await deleteMessage(fromChat, msg.message_id);
    };

    const negRef = replyToText.match(/⟨neg\|(ask|offer|bought)\|(\S+?)⟩/);
    if (negRef) {
      const kind = negRef[1] as NegotiationEntry["kind"];
      const code = negRef[2];
      const price = parsePrice(text);
      if (!price) {
        await reply(fromChat, "Please reply with just a number, e.g. 8500.");
        return NextResponse.json({ ok: true });
      }
      const amount = price.low === price.high ? price.low : Math.round((price.low + price.high) / 2);
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}".`);
        return NextResponse.json({ ok: true });
      }
      if (!lead) {
        await reply(fromChat, `No lead found for "${code}".`);
        return NextResponse.json({ ok: true });
      }
      const entry: NegotiationEntry = { at: new Date().toISOString(), kind, amount };
      const negotiation = [...(lead.negotiation || []), entry].slice(-100);
      const patch: Partial<Lead> = { negotiation };
      if (kind === "bought") {
        patch.purchasePrice = amount;
        patch.status = "closed";
        patch.closedAt = lead.closedAt || entry.at;
      }
      // Save it, then fold the trail into the lead's OWN alert message (no separate
      // scoreboard).
      const updated = await updateLead(lead.id, patch);
      await refreshLeadAlert(updated || { ...lead, ...patch });
      await notifyLog(`📝 ${who} logged ${kind} ${negMoney(amount)} — ${carText(lead)} (${code})\n${negTrail(negotiation)}`);
      // Topic: keep the typed number, drop only our prompt, and leave a clean log line
      // (bumping the action bar). Leads channel: clear both — the trail lives on the alert.
      if (msgThread != null) {
        if (typeof promptId === "number") await deleteMessage(fromChat, promptId);
        const label = kind === "ask" ? "💬 Their ask" : kind === "offer" ? "💵 Our offer" : "✅ Bought";
        await postLeadTopic(updated || { ...lead, ...patch }, `${label}: ${negMoney(amount)}`);
      } else {
        await clearPromptAndInput();
      }
      return NextResponse.json({ ok: true });
    }

    // Action replies — the owner typed his input; save it as a draft and show a
    // FILLED email preview with ✅ Send / ✋ Cancel. Nothing is emailed until Send.
    const actRef = replyToText.match(/⟨act\|(offer|info|msg)\|(\S+?)⟩/);
    if (actRef) {
      const kind = actRef[1];
      const code = actRef[2];
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Tap the button on the right lead.`);
        return NextResponse.json({ ok: true });
      }
      if (!lead) {
        await reply(fromChat, `No lead found for "${code}".`);
        return NextResponse.json({ ok: true });
      }
      if (!lead.contact.email) {
        await reply(fromChat, `${lead.contact.name || "That lead"} is phone-only (no email). Reach them at ${lead.contact.phone || "their number"}.`);
        return NextResponse.json({ ok: true });
      }
      // Send/Cancel buttons for a drafted email of the given kind.
      const confirmKb = (k: string) => ({
        inline_keyboard: [[
          { text: "✅ Send", callback_data: `act|${k}send|${code}` },
          { text: "✋ Cancel", callback_data: `act|${k}cancel|${code}` },
        ]],
      });
      // In a topic, keep what the owner typed (their words are the record) and drop
      // only our prompt; in the Leads channel, clear both for a tidy alert.
      const clearAfterInput = async () => {
        if (msgThread != null) {
          if (typeof promptId === "number") await deleteMessage(fromChat, promptId);
        } else {
          await clearPromptAndInput();
        }
      };
      if (kind === "offer") {
        const price = parsePrice(text);
        if (!price) {
          await reply(fromChat, "Please reply with just a number, e.g. 8500 or 8500-9000.", msgThread);
          return NextResponse.json({ ok: true });
        }
        await updateLead(lead.id, { pendingOffer: { low: price.low, high: price.high, at: new Date().toISOString() } });
        await clearAfterInput();
        await sendReturningId(fromChat, offerPreview(lead, price.low, price.high), confirmKb("offer"), msgThread);
        return NextResponse.json({ ok: true });
      }

      if (kind === "info") {
        const questions = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!questions.length) {
          await reply(fromChat, "Type at least one question, one per line.", msgThread);
          return NextResponse.json({ ok: true });
        }
        await updateLead(lead.id, { pendingInfo: questions });
        await clearAfterInput();
        await sendReturningId(fromChat, moreInfoPreview(lead, questions), confirmKb("info"), msgThread);
        return NextResponse.json({ ok: true });
      }

      // kind === "msg"
      const message = text.trim();
      if (!message) {
        await reply(fromChat, "Type your message to the customer.", msgThread);
        return NextResponse.json({ ok: true });
      }
      await updateLead(lead.id, { pendingMessage: message });
      await clearAfterInput();
      await sendReturningId(fromChat, messagePreview(lead, message), confirmKb("msg"), msgThread);
      return NextResponse.json({ ok: true });
    }

    // Re-contact scheduling (Leads channel, two-step force-reply). Step 1: the date.
    const rcDateRef = replyToText.match(/⟨rc\|date\|(\S+?)⟩/);
    if (rcDateRef) {
      const code = rcDateRef[1];
      const parsed = parseScheduleDate(text);
      if (!parsed) {
        await sendPrompt(fromChat, `Couldn't read that date. Try again — e.g. 10/3/26 or October 3.\n⟨rc|date|${code}⟩`, promptId, "e.g. 10/3/26");
        return NextResponse.json({ ok: true });
      }
      await clearPromptAndInput();
      await sendPrompt(fromChat, `📅 ${parsed.friendly}. Any notes? e.g. wants to wait until October — reply here, or send "skip" for none.\n⟨rc|note|${code}|${parsed.iso}⟩`, undefined, "e.g. wants to wait til October");
      return NextResponse.json({ ok: true });
    }
    // Step 2: the note → save the scheduled re-contact.
    const rcNoteRef = replyToText.match(/⟨rc\|note\|(\S+?)\|(\d{4}-\d{2}-\d{2})⟩/);
    if (rcNoteRef) {
      const code = rcNoteRef[1];
      const iso = rcNoteRef[2];
      const note = /^(skip|none|-)?$/i.test(text.trim()) ? "" : text.trim();
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}".`);
        return NextResponse.json({ ok: true });
      }
      if (!lead) {
        await reply(fromChat, `No lead found for "${code}".`);
        return NextResponse.json({ ok: true });
      }
      await updateLead(lead.id, { scheduledRecontactAt: iso, scheduledRecontactNote: note || undefined });
      await clearPromptAndInput();
      const friendly = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${iso}T12:00:00Z`));
      await reply(fromChat, `✅ ${lead.contact.name || carText(lead)} is set to re-contact on 📅 ${friendly}${note ? `\nNote: ${note}` : ""}. They'll appear on that day's re-contact list.`);
      await notifyLog(`📝 ${who} scheduled re-contact — ${carText(lead)} (${code}) for ${iso}${note ? ` — ${note}` : ""}`);
      return NextResponse.json({ ok: true });
    }

    // 2b-photo) An IMAGE the owner sent in a customer's topic → forward it to the
    //     customer: email attachment today (works now), MMS once Twilio is live.
    //     Covers BOTH a compressed photo (msg.photo, largest rendition) AND an image
    //     sent "as a file"/uncompressed (msg.document with an image/* mime). Images
    //     carry no msg.text, so this sits ahead of the plain-text relay below.
    const photoSizes = Array.isArray(msg?.photo) ? msg.photo : null;
    const docImage =
      msg?.document && typeof msg.document?.mime_type === "string" && msg.document.mime_type.startsWith("image/")
        ? msg.document
        : null;
    if (inTopic && (photoSizes?.length || docImage)) {
      const relayLead = await getLeadByReplyThreadId(msgThread as number);
      if (relayLead && String(fromChat) === String(relayLead.replyTopicChatId)) {
        // Membership dedup (claimRelayMessage) is order-independent, so every photo in a
        // multi-photo album is claimed once even when the burst arrives out of order.
        const fresh = typeof msg?.message_id === "number" ? await claimRelayMessage(relayLead.id, msg.message_id) : true;
        if (!fresh) return NextResponse.json({ ok: true });
        const caption = String(msg?.caption || "").trim();
        const fileId = docImage ? docImage.file_id : photoSizes[photoSizes.length - 1]?.file_id;
        const file = fileId ? await downloadTelegramFile(fileId) : null;
        if (!file) {
          await postLeadTopic(relayLead, "⚠️ Couldn't fetch that image from Telegram — try sending it again.");
          return NextResponse.json({ ok: true });
        }
        await forwardImageToCustomer(relayLead, file, caption, String(msg?.message_id ?? ""));
        return NextResponse.json({ ok: true });
      }
    }

    // 2c) In-topic reply relay — the owner typed a PLAIN message inside a customer's
    //     Replies-group topic. Send it straight to that customer (SMS if they last
    //     texted us and we can text; otherwise email). Tightly gated: only a real
    //     forum-topic message that resolves to a lead whose topic lives in THIS chat,
    //     never a slash command or a reply to a bot prompt (handled + returned above).
    if (inTopic && text && !text.startsWith("/") && !/⟨(?:neg|act)\|/.test(replyToText)) {
      const relayLead = await getLeadByReplyThreadId(msgThread as number);
      if (relayLead && String(fromChat) === String(relayLead.replyTopicChatId)) {
        // Dedupe a Telegram redelivery so the customer is never messaged twice.
        const fresh =
          typeof msg?.message_id === "number" ? await claimRelayMessage(relayLead.id, msg.message_id) : true;
        if (!fresh) return NextResponse.json({ ok: true });

        // If the owner just tapped a topic action button, THIS message is that action's
        // input (log a number / draft an email) — not a message to the customer.
        const pend = relayLead.pendingTopicAction;
        if (pend && Date.now() - new Date(pend.at).getTime() < 15 * 60 * 1000) {
          await updateLead(relayLead.id, { pendingTopicAction: undefined }); // consume it
          // Auto-remove the "type your …" prompt now that the input has arrived.
          if (typeof pend.promptMsgId === "number") await deleteMessage(fromChat, pend.promptMsgId);
          const psid = relayLead.id.split("-")[0];
          // ask / our offer / bought → log a negotiation number.
          if (pend.kind === "ask" || pend.kind === "offer" || pend.kind === "bought") {
            const price = parsePrice(text);
            if (!price) {
              await postLeadTopic(relayLead, "⚠️ That wasn't a number. Tap the button again and type just the amount (e.g. 8500).");
              return NextResponse.json({ ok: true });
            }
            const amount = price.low === price.high ? price.low : Math.round((price.low + price.high) / 2);
            const entry: NegotiationEntry = { at: new Date().toISOString(), kind: pend.kind as NegotiationEntry["kind"], amount };
            const negotiation = [...(relayLead.negotiation || []), entry].slice(-100);
            const patch: Partial<Lead> = { negotiation };
            if (pend.kind === "bought") {
              patch.purchasePrice = amount;
              patch.status = "closed";
              patch.closedAt = relayLead.closedAt || entry.at;
            }
            const updated = await updateLead(relayLead.id, patch);
            await refreshLeadAlert(updated || { ...relayLead, ...patch });
            await notifyLog(`📝 ${who} logged ${pend.kind} ${negMoney(amount)} — ${carText(relayLead)} (${psid})`);
            const label = pend.kind === "ask" ? "💬 Their ask" : pend.kind === "offer" ? "💵 Our offer" : "✅ Bought";
            await postLeadTopic(updated || { ...relayLead, ...patch }, `${label}: ${negMoney(amount)}`);
            return NextResponse.json({ ok: true });
          }
          // rcdate / rcnote → schedule a manual re-contact (date, then note) in-topic.
          if (pend.kind === "rcdate") {
            const parsed = parseScheduleDate(text);
            if (!parsed) {
              await postLeadTopic(relayLead, "⚠️ Couldn't read that date. Tap 🔄 Re-contact again and type a date like 10/3/26 or October 3.");
              return NextResponse.json({ ok: true });
            }
            const at = new Date().toISOString();
            await updateLead(relayLead.id, { pendingTopicAction: { kind: "rcnote", date: parsed.iso, at } });
            const pmid = await sendReturningId(fromChat, `📅 ${parsed.friendly}. Any notes? Type them (or "skip") — your next message sets it.`, cancelActionKb(psid), msgThread);
            if (typeof pmid === "number") await updateLead(relayLead.id, { pendingTopicAction: { kind: "rcnote", date: parsed.iso, at, promptMsgId: pmid } });
            return NextResponse.json({ ok: true });
          }
          if (pend.kind === "rcnote") {
            const iso = pend.date || "";
            const note = /^(skip|none|-)?$/i.test(text.trim()) ? "" : text.trim();
            await updateLead(relayLead.id, { scheduledRecontactAt: iso || undefined, scheduledRecontactNote: note || undefined });
            const friendly = iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${iso}T12:00:00Z`)) : iso;
            await postLeadTopic(relayLead, `📅 Scheduled to re-contact on ${friendly}${note ? ` — ${note}` : ""}.`);
            await notifyLog(`📝 ${who} scheduled re-contact — ${carText(relayLead)} (${psid}) for ${iso}${note ? ` — ${note}` : ""}`);
            return NextResponse.json({ ok: true });
          }
          // eoffer / einfo / emsg → stash the draft and show a compact Send / Cancel confirm.
          if (pend.kind === "eoffer") {
            const price = parsePrice(text);
            if (!price) {
              await postLeadTopic(relayLead, "⚠️ That wasn't a number. Tap 📧 Email offer again and type the price (e.g. 8500 or 8500-9000).");
              return NextResponse.json({ ok: true });
            }
            await updateLead(relayLead.id, { pendingOffer: { low: price.low, high: price.high, at: new Date().toISOString() } });
            // Show the FULL email preview (offer filled in) so the owner sees the exact
            // formatting before it goes out — then ✅ Send / ✋ Cancel.
            await sendReturningId(fromChat, offerPreview(relayLead, price.low, price.high), confirmSendKb("offer", psid), msgThread);
            return NextResponse.json({ ok: true });
          }
          if (pend.kind === "einfo") {
            const questions = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (!questions.length) {
              await postLeadTopic(relayLead, "⚠️ Type at least one question, one per line.");
              return NextResponse.json({ ok: true });
            }
            await updateLead(relayLead.id, { pendingInfo: questions });
            await sendReturningId(fromChat, moreInfoPreview(relayLead, questions), confirmSendKb("info", psid), msgThread);
            return NextResponse.json({ ok: true });
          }
          // addphone / addemail → validate the typed value, then a ✅ Add / ✋ Cancel confirm.
          if (pend.kind === "addphone" || pend.kind === "addemail") {
            const field: "phone" | "email" = pend.kind === "addphone" ? "phone" : "email";
            const value = field === "phone" ? cleanPhone(text) : looksLikeEmail(text.trim()) ? text.trim().toLowerCase() : "";
            if (!value) {
              await postLeadTopic(
                relayLead,
                field === "phone"
                  ? "⚠️ That doesn't look like a phone number. Type /addphone again, then just the number."
                  : "⚠️ That doesn't look like an email. Type /addemail again, then just the address.",
              );
              return NextResponse.json({ ok: true });
            }
            // Scrub the owner's typed value so only the final confirmation is left.
            if (typeof msg?.message_id === "number") await deleteMessage(fromChat, msg.message_id);
            await updateLead(relayLead.id, { pendingContactEdit: { field, value, at: new Date().toISOString() } });
            const exists = field === "phone" ? relayLead.contact.phone : relayLead.contact.email;
            const icon = field === "phone" ? "📞" : "✉️";
            await sendReturningId(
              fromChat,
              `${exists ? "Update" : "Add"} ${field} for ${relayLead.contact.name || "this customer"}?\n${icon} ${value}`,
              contactConfirmKb(psid),
              msgThread,
            );
            return NextResponse.json({ ok: true });
          }
          // pend.kind === "emsg"
          await updateLead(relayLead.id, { pendingMessage: text });
          await sendReturningId(fromChat, messagePreview(relayLead, text), confirmSendKb("msg", psid), msgThread);
          return NextResponse.json({ ok: true });
        }
        if (pend) await updateLead(relayLead.id, { pendingTopicAction: undefined }); // stale → drop, relay normally

        const sid = relayLead.id.split("-")[0];
        const canText = Boolean(smsTo(relayLead));
        const preferSms = relayLead.lastInboundChannel === "sms" && canText;
        let ok = false;
        let via = "";
        if (preferSms) {
          ok = await smsSend(relayLead, text);
          via = "text";
        } else if (relayLead.contact.email) {
          const res = await sendMessageEmail(relayLead, text);
          ok = res.ok;
          via = "email";
          // Email failed but we can text — fall through to SMS so the reply still lands.
          if (!ok && canText) {
            ok = await smsSend(relayLead, text);
            if (ok) via = "text";
          }
        } else if (canText) {
          ok = await smsSend(relayLead, text);
          via = "text";
        }

        if (ok) {
          const nowISO = new Date().toISOString();
          const wasNewlyContacted = !relayLead.contactedAt;
          const updated = await updateLead(relayLead.id, {
            firstTouchAt: relayLead.firstTouchAt || nowISO,
            contactedAt: relayLead.contactedAt || nowISO,
            status: relayLead.status === "new" ? "contacted" : relayLead.status,
          });
          if (wasNewlyContacted) await emitLeadContacted(updated || relayLead);
          await notifyLog(`↪️ ${who} replied by ${via} — ${carText(relayLead)} (${sid}): "${text.slice(0, 200)}"`);
          // Confirm + re-anchor the action bar beneath the owner's message.
          await postLeadTopic(updated || relayLead, `✓ Sent by ${via}`);
        } else {
          const reason = via === "" ? "no email or textable phone on file" : "the send failed — try again";
          await postLeadTopic(
            relayLead,
            `⚠️ Not delivered — ${reason}. Reach them at ${relayLead.contact.phone || relayLead.contact.email || "their contact info"}.`,
          );
        }
        return NextResponse.json({ ok: true });
      }
    }

    // 3) /usage (also matches "/usage@YourBot")
    if (/^\/usage(@\w+)?\b/i.test(text)) {
      const s = await getBudgetStatus();
      const body = s.ok
        ? [
            `${EMOJI_USAGE} MarketCheck API usage`,
            "",
            `Used: ${s.used} / ${s.cap}`,
            `Left: ${s.remaining}`,
            `Resets: ${s.resetLabel} (UTC)`,
          ].join("\n")
        : "Couldn't read the usage counter right now - try again shortly.";
      await reply(fromChat, body);
      return NextResponse.json({ ok: true });
    }

    // 4) /offer <id> <price> — draft a custom offer for a lead and preview it.
    const offerCmd = text.match(/^\/offer(@\w+)?\b\s*([\s\S]*)/i);
    if (offerCmd) {
      const rest = offerCmd[2].trim();
      const sp = rest.indexOf(" ");
      const code = sp === -1 ? rest : rest.slice(0, sp);
      const priceRaw = sp === -1 ? "" : rest.slice(sp + 1).trim();
      const price = priceRaw ? parsePrice(priceRaw) : null;
      if (!code || !price) {
        await reply(fromChat, "Usage: /offer <id> <price>\nExamples:\n/offer a1b2c3d4 8500-9000\n/offer a1b2c3d4 8750");
        return NextResponse.json({ ok: true });
      }
      const { lead, multiple } = await getLeadByShortId(code);
      if (!lead) {
        await reply(fromChat, `No lead found with ID "${code}". Copy the ID from the lead alert.`);
        return NextResponse.json({ ok: true });
      }
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
        return NextResponse.json({ ok: true });
      }
      if (!lead.contact.email) {
        await reply(fromChat, `${lead.contact.name || "That lead"} has no email on file (they chose phone). Reach them at ${lead.contact.phone || "their number"}.`);
        return NextResponse.json({ ok: true });
      }
      await updateLead(lead.id, { pendingOffer: { low: price.low, high: price.high, at: new Date().toISOString() } });
      const sid = lead.id.split("-")[0];
      await reply(
        fromChat,
        [
          "📝 Offer draft — review before sending",
          "",
          `To: ${lead.contact.name || "(no name)"} <${lead.contact.email}>`,
          `Vehicle: ${carText(lead)}`,
          `Offer: ${fmtRange(price.low, price.high)}`,
          "",
          `✅ Send it → /confirm ${sid}`,
          `✋ Cancel → /cancel ${sid}`,
        ].join("\n"),
      );
      return NextResponse.json({ ok: true });
    }

    // 5) /confirm <id> — send the drafted offer email to the customer.
    const confirmCmd = text.match(/^\/confirm(@\w+)?\b\s*(\S+)?/i);
    if (confirmCmd) {
      const code = (confirmCmd[2] || "").trim();
      if (!code) {
        await reply(fromChat, "Usage: /confirm <id>  — the ID from the offer draft.");
        return NextResponse.json({ ok: true });
      }
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
        return NextResponse.json({ ok: true });
      }
      if (!lead || !lead.pendingOffer) {
        await reply(fromChat, `No draft offer for "${code}". Start with /offer ${code} 8500-9000.`);
        return NextResponse.json({ ok: true });
      }
      const { low, high } = lead.pendingOffer;
      // Mint the self-booking token BEFORE sending so the offer email's Book button works.
      const bookingToken = lead.bookingToken || crypto.randomUUID().replace(/-/g, "");
      lead.bookingToken = bookingToken;
      const res = await sendOfferEmail(lead, low, high);
      if (!res.ok) {
        await reply(fromChat, `Couldn't send — ${res.reason}. The draft is still saved; fix it and try /confirm ${code} again.`);
        return NextResponse.json({ ok: true });
      }
      if (lead.dripEmailIds?.length) await cancelScheduledEmails(lead.dripEmailIds);
      const nowISO = new Date().toISOString();
      const wasNewlyContacted = !lead.contactedAt;
      const updatedLead = await updateLead(lead.id, {
        offer: { low, high, sentAt: nowISO },
        // Auto-log the emailed offer into the negotiation trail (mid of the range).
        negotiation: [
          ...(lead.negotiation || []),
          { at: nowISO, kind: "offer" as const, amount: Math.round((low + high) / 2) },
        ].slice(-100),
        bookingToken,
        // Enroll in the cron-driven offer-reminder track (+2/+5/+10 days).
        nurtureStage: "offer_sent",
        offerSentAt: nowISO,
        moreInfoSentAt: undefined, // leave any awaiting-info track
        lastNurtureAt: undefined, // restart the reminder sequence cleanly
        firstTouchAt: lead.firstTouchAt || nowISO,
        contactedAt: lead.contactedAt || nowISO,
        pendingOffer: undefined,
        dripEmailIds: [],
        status: lead.status === "new" ? "contacted" : lead.status,
      });
      // Text the customer too (best-effort; no-op without a phone / Twilio config).
      await smsOfferReady(lead, low, high);
      await emitOfferSent(updatedLead || lead);
      if (wasNewlyContacted) await emitLeadContacted(updatedLead || lead);
      await postLeadTopic(updatedLead || lead, `📧 Email offer sent — ${fmtRange(low, high)} (emailed)`);
      await reply(fromChat, `✅ Offer sent — ${fmtRange(low, high)} to ${lead.contact.name || lead.contact.email} for their ${carText(lead)}.`);
      return NextResponse.json({ ok: true });
    }

    // 6) /cancel <id> — discard a drafted offer.
    const cancelCmd = text.match(/^\/cancel(@\w+)?\b\s*(\S+)?/i);
    if (cancelCmd) {
      const code = (cancelCmd[2] || "").trim();
      if (!code) {
        await reply(fromChat, "Usage: /cancel <id>  — the ID from the offer draft.");
        return NextResponse.json({ ok: true });
      }
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
        return NextResponse.json({ ok: true });
      }
      if (lead?.pendingOffer) {
        await updateLead(lead.id, { pendingOffer: undefined });
        await reply(fromChat, `Draft offer for "${code}" cancelled.`);
      } else {
        await reply(fromChat, `No draft offer to cancel for "${code}".`);
      }
      return NextResponse.json({ ok: true });
    }

    // 6b) /moreinfo <id> [questions, one per line] — ONE email with the questions we
    // need before quoting. Everything after the id is split into bullets by line;
    // leave it blank to send the email with an empty "What we still need" section.
    const moreInfoCmd = text.match(/^\/moreinfo(@\w+)?\b\s*(\S+)?\s*([\s\S]*)$/i);
    if (moreInfoCmd) {
      const code = (moreInfoCmd[2] || "").trim();
      const questions = (moreInfoCmd[3] || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!code || !questions.length) {
        await reply(
          fromChat,
          `/moreinfo needs at least one question. Type the ID, then your questions, one per line.\nNothing to ask? Send the offer instead: /offer ${code || "<id>"} <price>\nExample:\n/moreinfo ${code || "a1b2c3d4"} Is it automatic or manual?\nHow many keys does it have?`,
        );
        return NextResponse.json({ ok: true });
      }
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
        return NextResponse.json({ ok: true });
      }
      if (!lead) {
        await reply(fromChat, `No lead found with ID "${code}".`);
        return NextResponse.json({ ok: true });
      }
      const res = await sendMoreInfo(lead, questions);
      if (!res.ok) {
        await reply(fromChat, `Couldn't send — ${res.reason}. If they're phone-only, reach them at ${lead.contact.phone || "their number"}.`);
        return NextResponse.json({ ok: true });
      }
      const nowISO = new Date().toISOString();
      const wasNewlyContacted = !lead.contactedAt;
      const updatedLead = await updateLead(lead.id, {
        nurtureStage: "awaiting_info",
        moreInfoSentAt: nowISO,
        infoQuestions: questions,
        lastNurtureAt: undefined,
        firstTouchAt: lead.firstTouchAt || nowISO,
        contactedAt: lead.contactedAt || nowISO,
        status: lead.status === "new" ? "contacted" : lead.status,
      });
      // Text the customer the "we need a detail" nudge too (best-effort).
      await smsMoreInfo(lead);
      if (wasNewlyContacted) await emitLeadContacted(updatedLead || lead);
      await postLeadTopic(updatedLead || lead, `❓ Asked for info (emailed):\n• ${questions.join("\n• ")}`);
      const who = lead.contact.name || lead.contact.email;
      await reply(
        fromChat,
        `📩 Sent ${questions.length} question${questions.length > 1 ? "s" : ""} to ${who} about their ${carText(lead)}. If they go quiet, we'll re-send the same questions in 2 and 5 days.`,
      );
      return NextResponse.json({ ok: true });
    }

    // 6c) /message <id> <text> — send a free-text message email to the customer
    // (day-to-day conversation, not a quote). Sends immediately; the customer can
    // reply straight to the email.
    const messageCmd = text.match(/^\/message(@\w+)?\b\s*(\S+)?\s*([\s\S]*)$/i);
    if (messageCmd) {
      const code = (messageCmd[2] || "").trim();
      const message = (messageCmd[3] || "").trim();
      if (!code || !message) {
        await reply(
          fromChat,
          `Usage: /message <id> <your message>\nType the ID, then whatever you want to say.\nExample:\n/message ${code || "a1b2c3d4"} Hi! Could I grab your phone number for a quick call about your car?`,
        );
        return NextResponse.json({ ok: true });
      }
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
        return NextResponse.json({ ok: true });
      }
      if (!lead) {
        await reply(fromChat, `No lead found with ID "${code}".`);
        return NextResponse.json({ ok: true });
      }
      if (!lead.contact.email) {
        await reply(fromChat, `${lead.contact.name || "That lead"} has no email on file (they chose phone). Reach them at ${lead.contact.phone || "their number"}.`);
        return NextResponse.json({ ok: true });
      }
      const res = await sendMessageEmail(lead, message);
      if (!res.ok) {
        await reply(fromChat, `Couldn't send — ${res.reason}. If they're phone-only, reach them at ${lead.contact.phone || "their number"}.`);
        return NextResponse.json({ ok: true });
      }
      const nowISO = new Date().toISOString();
      const wasNewlyContacted = !lead.contactedAt;
      const updatedLead = await updateLead(lead.id, {
        firstTouchAt: lead.firstTouchAt || nowISO,
        contactedAt: lead.contactedAt || nowISO,
        status: lead.status === "new" ? "contacted" : lead.status,
      });
      if (wasNewlyContacted) await emitLeadContacted(updatedLead || lead);
      await postLeadTopic(updatedLead || lead, `📤 Messaged (emailed): ${message}`);
      await reply(fromChat, `📨 Message sent to ${lead.contact.name || lead.contact.email}.`);
      return NextResponse.json({ ok: true });
    }

    // 7) /schedule <id> <YYYY-MM-DD HH:MM> — book the inspection (Mountain Time).
    const schedCmd = text.match(/^\/schedule(@\w+)?\b\s*(\S+)?\s*([\s\S]*)$/i);
    if (schedCmd) {
      const code = (schedCmd[2] || "").trim();
      const whenRaw = (schedCmd[3] || "").trim();
      if (!code || !whenRaw) {
        await reply(fromChat, "Usage: /schedule <id> <YYYY-MM-DD HH:MM>\nExample: /schedule a1b2c3d4 2026-07-05 14:30  (24h, Mountain Time)");
        return NextResponse.json({ ok: true });
      }
      const appt = parseEdmonton(whenRaw);
      if (!appt) {
        await reply(fromChat, "Couldn't read that date. Use 24h Mountain Time, e.g. /schedule " + code + " 2026-07-05 14:30");
        return NextResponse.json({ ok: true });
      }
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
        return NextResponse.json({ ok: true });
      }
      if (!lead) {
        await reply(fromChat, `No lead found with ID "${code}".`);
        return NextResponse.json({ ok: true });
      }
      const nowISO = new Date().toISOString();
      const wasNewlyScheduled = !lead.scheduledAt;
      const updatedLead = await updateLead(lead.id, {
        appointmentAt: appt.toISOString(),
        apptRemindedAt: undefined, // reset so the T-2h reminder fires for this booking
        status: "scheduled",
        scheduledAt: lead.scheduledAt || nowISO,
        firstTouchAt: lead.firstTouchAt || nowISO,
      });
      if (wasNewlyScheduled) await emitBookingConfirmed(updatedLead || lead, "system_generated");
      const whenLabel = appt.toLocaleString("en-CA", {
        timeZone: "America/Edmonton",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      await reply(fromChat, `📅 Booked — ${carText(lead)} inspection ${whenLabel} (MT). I'll remind you ~2h before.`);
      return NextResponse.json({ ok: true });
    }

    // 8) /addemail <id> <email> — attach or replace the email on a lead (e.g. a
    //    phone-only lead sent us their email later), then re-post the lead so the
    //    email-based buttons work. The updated contact flows into their profile.
    const addEmailCmd = text.match(/^\/addemail(@\w+)?\b\s*(\S+)?\s*([\s\S]*)$/i);
    if (addEmailCmd) {
      const arg1 = (addEmailCmd[2] || "").trim();
      const arg2 = (addEmailCmd[3] || "").trim();
      // In a customer's topic the lead is implied by the thread — run the guided
      // prompt→confirm flow (no ID needed); anything typed inline jumps to the confirm.
      if (inTopic) {
        const relayLead = await getLeadByReplyThreadId(msgThread as number);
        if (!relayLead) {
          await reply(fromChat, "Couldn't tell which customer this topic is for.", msgThread);
          return NextResponse.json({ ok: true });
        }
        await startTopicContactEdit("email", relayLead, `${arg1} ${arg2}`.trim(), fromChat, msgThread as number, msg?.message_id);
        return NextResponse.json({ ok: true });
      }
      const code = arg1;
      const email = arg2;
      if (!code || !email) {
        await reply(fromChat, "Usage: /addemail <id> <email>\nExample: /addemail a1b2c3d4 jordan@email.com\n(Or just type /addemail inside a customer's topic.)");
        return NextResponse.json({ ok: true });
      }
      if (!looksLikeEmail(email)) {
        await reply(fromChat, `"${email}" doesn't look like an email. Try again, e.g. /addemail ${code} jordan@email.com`);
        return NextResponse.json({ ok: true });
      }
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
        return NextResponse.json({ ok: true });
      }
      if (!lead) {
        await reply(fromChat, `No lead found with ID "${code}".`);
        return NextResponse.json({ ok: true });
      }
      const prev = lead.contact.email;
      const updated = await updateLead(lead.id, { contact: { ...lead.contact, email } });
      await reply(
        fromChat,
        `✅ Email ${prev ? "updated" : "added"} for ${lead.contact.name || "that lead"}: ${email}${prev ? ` (was ${prev})` : ""}. Re-posting the lead below.`,
      );
      if (updated) await notifyNewLead(updated);
      return NextResponse.json({ ok: true });
    }

    // 8b) /addphone <id> <phone> — attach or replace the phone on a lead (stored for
    //     the profile now + future SMS button actions once Twilio is on).
    const addPhoneCmd = text.match(/^\/addphone(@\w+)?\b\s*(\S+)?\s*([\s\S]*)$/i);
    if (addPhoneCmd) {
      const arg1 = (addPhoneCmd[2] || "").trim();
      const arg2 = (addPhoneCmd[3] || "").trim();
      // In a customer's topic the lead is implied by the thread — run the guided
      // prompt→confirm flow (no ID needed); anything typed inline jumps to the confirm.
      if (inTopic) {
        const relayLead = await getLeadByReplyThreadId(msgThread as number);
        if (!relayLead) {
          await reply(fromChat, "Couldn't tell which customer this topic is for.", msgThread);
          return NextResponse.json({ ok: true });
        }
        await startTopicContactEdit("phone", relayLead, `${arg1} ${arg2}`.trim(), fromChat, msgThread as number, msg?.message_id);
        return NextResponse.json({ ok: true });
      }
      const code = arg1;
      const phoneRaw = arg2;
      if (!code || !phoneRaw) {
        await reply(fromChat, "Usage: /addphone <id> <phone>\nExample: /addphone a1b2c3d4 (403) 555-0182\n(Or just type /addphone inside a customer's topic.)");
        return NextResponse.json({ ok: true });
      }
      const phone = cleanPhone(phoneRaw);
      if (!phone) {
        await reply(fromChat, `"${phoneRaw}" doesn't look like a phone number. Try again, e.g. /addphone ${code} 403-555-0182`);
        return NextResponse.json({ ok: true });
      }
      const { lead, multiple } = await getLeadByShortId(code);
      if (multiple) {
        await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
        return NextResponse.json({ ok: true });
      }
      if (!lead) {
        await reply(fromChat, `No lead found with ID "${code}".`);
        return NextResponse.json({ ok: true });
      }
      const prev = lead.contact.phone;
      const updated = await updateLead(lead.id, { contact: { ...lead.contact, phone } });
      await reply(
        fromChat,
        `✅ Phone ${prev ? "updated" : "added"} for ${lead.contact.name || "that lead"}: ${phone}${prev ? ` (was ${prev})` : ""}. Re-posting the lead below.`,
      );
      if (updated) await notifyNewLead(updated);
      return NextResponse.json({ ok: true });
    }

    // 8c) /recontact <id> <date> <note> — schedule a one-off manual re-contact for a
    //     specific day (appears in the 📅 Scheduled section of that day's list). In a
    //     customer's topic the id is implied, so it's just /recontact <date> <note>.
    const recontactCmd = text.match(/^\/recontact(@\w+)?\b\s*([\s\S]*)$/i);
    if (recontactCmd) {
      const rest0 = (recontactCmd[2] || "").trim();
      let targetLead: Lead | null = null;
      let dateStr = rest0;
      if (inTopic) {
        targetLead = await getLeadByReplyThreadId(msgThread as number);
        if (!targetLead) {
          await reply(fromChat, "Couldn't tell which customer this topic is for.", msgThread);
          return NextResponse.json({ ok: true });
        }
      } else {
        const sp = rest0.match(/^(\S+)\s*([\s\S]*)$/);
        const code = (sp?.[1] || "").trim();
        dateStr = (sp?.[2] || "").trim();
        if (!code || !dateStr) {
          await reply(fromChat, "Usage: /recontact <id> <date> <note>\nExample: /recontact a1b2c3d4 10/3/26 wants to wait til October\n(Or just /recontact <date> <note> inside a customer's topic.)");
          return NextResponse.json({ ok: true });
        }
        const { lead, multiple } = await getLeadByShortId(code);
        if (multiple) {
          await reply(fromChat, `More than one lead matches "${code}". Reply with the full ID from the alert.`);
          return NextResponse.json({ ok: true });
        }
        if (!lead) {
          await reply(fromChat, `No lead found with ID "${code}".`);
          return NextResponse.json({ ok: true });
        }
        targetLead = lead;
      }
      if (!targetLead) return NextResponse.json({ ok: true });
      const parsed = parseScheduleDate(dateStr);
      if (!parsed) {
        await reply(fromChat, `Couldn't read a date in "${dateStr}". Try e.g. ${inTopic ? "/recontact 10/3/26 wants to wait til October" : "/recontact <id> 10/3/26 wants to wait til October"}`, inTopic ? msgThread : undefined);
        return NextResponse.json({ ok: true });
      }
      const note = parsed.rest;
      const code = targetLead.id.split("-")[0];
      await updateLead(targetLead.id, { scheduledRecontactAt: parsed.iso, scheduledRecontactNote: note || undefined });
      await reply(fromChat, `✅ ${targetLead.contact.name || carText(targetLead)} is set to re-contact on 📅 ${parsed.friendly}${note ? `\nNote: ${note}` : ""}. They'll appear on that day's re-contact list.`, inTopic ? msgThread : undefined);
      await notifyLog(`📝 ${who} scheduled re-contact — ${carText(targetLead)} (${code}) for ${parsed.iso}${note ? ` — ${note}` : ""}`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telegram webhook] error:", e);
    // Always 200 so Telegram doesn't back off / retry storm.
    return NextResponse.json({ ok: true });
  }
}
