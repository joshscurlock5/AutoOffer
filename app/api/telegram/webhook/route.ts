import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getBudgetStatus } from "@/lib/marketCache";
import { getLeadByShortId, updateLead, claimPendingOffer } from "@/lib/store";
import { sendOfferEmail, sendMoreInfo, sendMessageEmail, cancelScheduledEmails } from "@/lib/email";
import { smsOfferReady, smsMoreInfo } from "@/lib/sms";
import { telegramChatIds, notifyLog, notifyNewLead } from "@/lib/notify";
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

async function reply(chatId: number | string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch {
    /* best-effort */
  }
}

/** Stop a tapped button's loading spinner. */
async function answerCallback(id: string): Promise<void> {
  if (!BOT_TOKEN || !id) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: id }),
    });
  } catch {
    /* best-effort */
  }
}

/** Send a message that pops a reply box (force_reply), threaded under the lead
 * alert. The text carries a ⟨neg|kind|id⟩ or ⟨act|kind|id⟩ marker the reply
 * handler parses back. `placeholder` hints what to type in the reply box. */
async function sendPrompt(chatId: number | string, text: string, replyToMsgId?: number, placeholder = "e.g. 8500"): Promise<void> {
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
    ],
  };
}

/** sendMessage that returns the new message_id (so we can edit it in place later). */
async function sendReturningId(chatId: number | string, text: string, replyMarkup?: unknown): Promise<number | undefined> {
  if (!BOT_TOKEN) return undefined;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    });
    const j = await r.json();
    return typeof j?.result?.message_id === "number" ? j.result.message_id : undefined;
  } catch {
    return undefined;
  }
}

/** Edit a message's text (+ optional buttons) in place. */
async function editMessage(chatId: number | string, messageId: number, text: string, replyMarkup?: unknown): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
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

/** Create or update the single in-place 📊 Negotiation summary for a lead (carries
 * the action buttons). Returns the message id + chat so the caller can persist them. */
async function upsertNegSummary(lead: Lead, chatId: number): Promise<{ negMsgId?: number; negChatId?: number }> {
  const code = lead.id.split("-")[0];
  const closed = (lead.negotiation || []).some((e) => e.kind === "bought");
  const text = `📊 Negotiation — ${carText(lead)}\n${negTrail(lead.negotiation)}` + (closed ? "\n(deal closed)" : "");
  const kb = negKeyboardFor(code);
  if (lead.negMsgId != null && lead.negChatId != null) {
    await editMessage(lead.negChatId, lead.negMsgId, text, kb);
    return { negMsgId: lead.negMsgId, negChatId: lead.negChatId };
  }
  const negMsgId = await sendReturningId(chatId, text, kb);
  return negMsgId != null ? { negMsgId, negChatId: chatId } : {};
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
      await answerCallback(cb.id);
      const cbChat = cb.message?.chat?.id;
      const allowed = telegramChatIds();
      if (allowed.length && !allowed.includes(String(cbChat))) return NextResponse.json({ ok: true });
      const who = cb.from?.first_name || cb.from?.username || "owner";
      const data = String(cb.data || "");

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
        await sendPrompt(
          cbChat,
          `${label} · ${carText(lead)}\nReply to this message with just the number (e.g. 8500).\n⟨neg|${kind}|${code}⟩`,
          cb.message?.message_id,
        );
        return NextResponse.json({ ok: true });
      }

      // Action buttons (email offer / ask for info / message) → open a reply box.
      const actM = data.match(/^act\|(offer|info|msg)\|(\S+)$/);
      if (actM) {
        const kind = actM[1];
        const code = actM[2];
        const { lead } = await getLeadByShortId(code);
        if (!lead) {
          await reply(cbChat, `No lead found for "${code}".`);
          return NextResponse.json({ ok: true });
        }
        const spec =
          kind === "offer"
            ? { title: "📧 EMAIL OFFER", hint: "Reply with the price (e.g. 8500 or 8500-9000).", ph: "e.g. 8500" }
            : kind === "info"
              ? { title: "❓ ASK FOR INFO", hint: "Reply with your questions — one per line.", ph: "one question per line" }
              : { title: "✉️ MESSAGE", hint: "Reply with your message to the customer.", ph: "type your message" };
        await sendPrompt(cbChat, `${spec.title} · ${carText(lead)}\n${spec.hint}\n⟨act|${kind}|${code}⟩`, cb.message?.message_id, spec.ph);
        return NextResponse.json({ ok: true });
      }

      // Offer preview → send or cancel the drafted email.
      const sendM = data.match(/^act\|(offersend|offercancel)\|(\S+)$/);
      if (sendM) {
        const action = sendM[1];
        const code = sendM[2];
        const { lead, multiple } = await getLeadByShortId(code);
        const previewMsgId = cb.message?.message_id;
        const clearPreview = async () => {
          if (typeof previewMsgId === "number") await deleteMessage(cbChat, previewMsgId);
        };
        // Ambiguous short id — never mutate/email a guessed lead (matches every other path).
        if (multiple) {
          await reply(cbChat, `More than one lead matches "${code}". Use the full ID with /confirm or /cancel.`);
          return NextResponse.json({ ok: true });
        }
        if (!lead) {
          await clearPreview();
          await reply(cbChat, `No lead found for "${code}".`);
          return NextResponse.json({ ok: true });
        }
        if (action === "offercancel") {
          if (lead.pendingOffer) await updateLead(lead.id, { pendingOffer: undefined });
          await clearPreview();
          await notifyLog(`🚫 ${who} cancelled a draft offer — ${carText(lead)} (${code})`);
          return NextResponse.json({ ok: true });
        }
        // offersend
        if (!lead.pendingOffer) {
          await clearPreview();
          await reply(cbChat, `That draft was already sent or cancelled (${code}).`);
          return NextResponse.json({ ok: true });
        }
        if (!lead.contact.email) {
          await reply(cbChat, `${lead.contact.name || "That lead"} is phone-only. Reach them at ${lead.contact.phone || "their number"}.`);
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
        // Refresh the in-place 📊 summary so the emailed offer shows on the lead.
        const summary = await upsertNegSummary({ ...lead, negotiation }, cbChat);
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
          ...(summary.negMsgId != null ? { negMsgId: summary.negMsgId, negChatId: summary.negChatId } : {}),
        });
        await smsOfferReady(lead, low, high);
        await emitOfferSent(updatedLead || lead);
        if (wasNewlyContacted) await emitLeadContacted(updatedLead || lead);
        await notifyLog(`📧 ${who} emailed offer ${fmtRange(low, high)} — ${carText(lead)} (${code})`);
        await clearPreview();
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
      // ONE tidy in-place summary per lead, then delete the prompt + typed number.
      const summary = await upsertNegSummary({ ...lead, ...patch }, fromChat);
      await updateLead(lead.id, {
        ...patch,
        ...(summary.negMsgId != null ? { negMsgId: summary.negMsgId, negChatId: summary.negChatId } : {}),
      });
      await notifyLog(`📝 ${who} logged ${kind} ${negMoney(amount)} — ${carText(lead)} (${code})\n${negTrail(negotiation)}`);
      await clearPromptAndInput();
      return NextResponse.json({ ok: true });
    }

    // Action replies — email offer (Send/Cancel check), ask for info, or message.
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

      if (kind === "offer") {
        const price = parsePrice(text);
        if (!price) {
          await reply(fromChat, "Please reply with just a number, e.g. 8500 or 8500-9000.");
          return NextResponse.json({ ok: true });
        }
        if (!lead.contact.email) {
          await reply(fromChat, `${lead.contact.name || "That lead"} is phone-only (no email). Reach them at ${lead.contact.phone || "their number"}.`);
          return NextResponse.json({ ok: true });
        }
        await updateLead(lead.id, { pendingOffer: { low: price.low, high: price.high, at: new Date().toISOString() } });
        await clearPromptAndInput();
        // Quick Send/Cancel check before the offer email actually goes out.
        const previewText = `📧 Email offer — ${carText(lead)} → ${fmtRange(price.low, price.high)} to ${lead.contact.name || lead.contact.email}. Send?`;
        const kb = {
          inline_keyboard: [[
            { text: "✅ Send", callback_data: `act|offersend|${code}` },
            { text: "✋ Cancel", callback_data: `act|offercancel|${code}` },
          ]],
        };
        await sendReturningId(fromChat, previewText, kb);
        return NextResponse.json({ ok: true });
      }

      if (kind === "info") {
        const questions = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!questions.length) {
          await reply(fromChat, "Type at least one question, one per line.");
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
        await smsMoreInfo(lead);
        if (wasNewlyContacted) await emitLeadContacted(updatedLead || lead);
        await notifyLog(`❓ ${who} asked ${questions.length} question${questions.length > 1 ? "s" : ""} — ${carText(lead)} (${code}):\n• ${questions.join("\n• ")}`);
        await clearPromptAndInput();
        return NextResponse.json({ ok: true });
      }

      // kind === "msg"
      const message = text.trim();
      if (!message) {
        await reply(fromChat, "Type your message to the customer.");
        return NextResponse.json({ ok: true });
      }
      if (!lead.contact.email) {
        await reply(fromChat, `${lead.contact.name || "That lead"} is phone-only (no email). Reach them at ${lead.contact.phone || "their number"}.`);
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
      await notifyLog(`✉️ ${who} messaged — ${carText(lead)} (${code}): "${message.slice(0, 200)}"`);
      await clearPromptAndInput();
      return NextResponse.json({ ok: true });
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
      const code = (addEmailCmd[2] || "").trim();
      const email = (addEmailCmd[3] || "").trim();
      if (!code || !email) {
        await reply(fromChat, "Usage: /addemail <id> <email>\nExample: /addemail a1b2c3d4 jordan@email.com");
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
      const code = (addPhoneCmd[2] || "").trim();
      const phoneRaw = (addPhoneCmd[3] || "").trim();
      if (!code || !phoneRaw) {
        await reply(fromChat, "Usage: /addphone <id> <phone>\nExample: /addphone a1b2c3d4 (403) 555-0182");
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telegram webhook] error:", e);
    // Always 200 so Telegram doesn't back off / retry storm.
    return NextResponse.json({ ok: true });
  }
}
