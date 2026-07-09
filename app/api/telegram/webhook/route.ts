import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getBudgetStatus } from "@/lib/marketCache";
import { getLeadByShortId, updateLead } from "@/lib/store";
import { sendOfferEmail, sendMoreInfo, sendMessageEmail, cancelScheduledEmails } from "@/lib/email";
import { smsOfferReady, smsMoreInfo } from "@/lib/sms";
import { telegramChatIds } from "@/lib/notify";
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
 * alert. The text carries a ⟨neg|kind|id⟩ marker the reply handler parses back. */
async function sendPrompt(chatId: number | string, text: string, replyToMsgId?: number): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: { force_reply: true, input_field_placeholder: "e.g. 8500" },
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

/** The negotiation buttons for a lead's short id (put on the in-place summary). */
function negKeyboardFor(sid: string) {
  return {
    inline_keyboard: [
      [
        { text: "💬 Their ask", callback_data: `neg|ask|${sid}` },
        { text: "💵 Our offer", callback_data: `neg|offer|${sid}` },
      ],
      [{ text: "✅ Bought (final price)", callback_data: `neg|bought|${sid}` }],
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

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Telegram's secret header (set during setWebhook). If we have a
    //    secret configured and it doesn't match, silently ignore.
    if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
      return NextResponse.json({ ok: true });
    }

    const update = await req.json().catch(() => ({}));

    // --- Inline-button taps (negotiation logging). Handled first: a callback
    //     carries no message.text, so it must not fall through to the msg branch. ---
    const cb = update?.callback_query;
    if (cb) {
      await answerCallback(cb.id);
      const cbChat = cb.message?.chat?.id;
      const allowed = telegramChatIds();
      if (allowed.length && !allowed.includes(String(cbChat))) return NextResponse.json({ ok: true });
      const m = String(cb.data || "").match(/^neg\|(ask|offer|bought)\|(\S+)$/);
      if (m) {
        const kind = m[1] as NegotiationEntry["kind"];
        const code = m[2];
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

    // 2b) A reply to a negotiation prompt (from tapping a lead's button). Parse the
    //     ⟨neg|kind|id⟩ marker off the prompt being replied to and log the number.
    const replyToText = String(msg?.reply_to_message?.text || "");
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
      // Keep ONE tidy in-place summary per lead (edited, not re-sent), carrying the
      // buttons — then delete the prompt + the typed number so nothing piles up.
      const summaryText = `📊 Negotiation — ${carText(lead)}\n${negTrail(negotiation)}` + (kind === "bought" ? "\n(deal closed)" : "");
      const kb = negKeyboardFor(code);
      let negMsgId = lead.negMsgId;
      if (lead.negMsgId != null && lead.negChatId != null) {
        await editMessage(lead.negChatId, lead.negMsgId, summaryText, kb);
      } else {
        negMsgId = await sendReturningId(fromChat, summaryText, kb);
      }
      await updateLead(lead.id, {
        ...patch,
        ...(negMsgId != null ? { negMsgId, negChatId: fromChat } : {}),
      });
      // Clean up the noise: our prompt, and the bare number the owner typed.
      const promptId = msg?.reply_to_message?.message_id;
      if (typeof promptId === "number") await deleteMessage(fromChat, promptId);
      if (typeof msg?.message_id === "number") await deleteMessage(fromChat, msg.message_id);
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telegram webhook] error:", e);
    // Always 200 so Telegram doesn't back off / retry storm.
    return NextResponse.json({ ok: true });
  }
}
