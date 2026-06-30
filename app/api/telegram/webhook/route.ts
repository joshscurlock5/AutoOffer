import { NextRequest, NextResponse } from "next/server";
import { getBudgetStatus } from "@/lib/marketCache";
import { getLeadByShortId, updateLead } from "@/lib/store";
import { sendOfferEmail, cancelScheduledEmails } from "@/lib/email";
import type { Lead } from "@/lib/types";

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
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const EMOJI_USAGE = String.fromCodePoint(0x1f4ca); // 📊 bar chart

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

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Telegram's secret header (set during setWebhook). If we have a
    //    secret configured and it doesn't match, silently ignore.
    if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
      return NextResponse.json({ ok: true });
    }

    const update = await req.json().catch(() => ({}));
    const msg = update?.message ?? update?.channel_post;
    const text: string = String(msg?.text || "").trim();
    const fromChat = msg?.chat?.id;

    // 2) Only respond to the authorized chat.
    if (!msg || (CHAT_ID && String(fromChat) !== String(CHAT_ID))) {
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
      const res = await sendOfferEmail(lead, low, high);
      if (!res.ok) {
        await reply(fromChat, `Couldn't send — ${res.reason}. The draft is still saved; fix it and try /confirm ${code} again.`);
        return NextResponse.json({ ok: true });
      }
      if (lead.dripEmailIds?.length) await cancelScheduledEmails(lead.dripEmailIds);
      await updateLead(lead.id, {
        offer: { low, high, sentAt: new Date().toISOString() },
        pendingOffer: undefined,
        dripEmailIds: [],
        status: lead.status === "new" ? "contacted" : lead.status,
      });
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telegram webhook] error:", e);
    // Always 200 so Telegram doesn't back off / retry storm.
    return NextResponse.json({ ok: true });
  }
}
