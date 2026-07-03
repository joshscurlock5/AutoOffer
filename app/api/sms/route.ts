import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getLeads, updateLead } from "@/lib/store";
import { notifyOwner, leadLine } from "@/lib/notify";
import { toE164 } from "@/lib/sms";
import { site } from "@/lib/site-config";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const WEBHOOK_URL = `${site.url}/api/sms`;

// Keyword sets are matched against the whole (lowercased, trimmed) message body.
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "arret", "arrêt"]);
const START_WORDS = new Set(["start", "unstop"]);
const CONFIRM_WORDS = new Set(["c", "confirm", "confirmed", "yes", "y", "ok", "okay"]);

function carOf(lead: Lead): string {
  const v = lead.vehicle;
  return v ? `${v.year} ${v.make} ${v.model}` : "their car";
}

/** Empty TwiML — Twilio's own opt-out handler sends the STOP/HELP auto-reply. */
function twiml(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/** Verify Twilio's request signature (HMAC-SHA1 of the URL + alpha-sorted params). */
function validSignature(sig: string, params: URLSearchParams): boolean {
  if (!TOKEN || !sig) return false;
  const keys = Array.from(new Set(params.keys())).sort();
  let data = WEBHOOK_URL;
  for (const k of keys) for (const v of params.getAll(k)) data += k + v;
  const expected = crypto.createHmac("sha1", TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function findLeadByPhone(e164: string): Promise<Lead | null> {
  let leads: Lead[];
  try {
    leads = await getLeads();
  } catch {
    return null;
  }
  return (
    leads
      .filter((l) => toE164(l.contact.phone) === e164)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0] || null
  );
}

// ---------------------------------------------------------------------------
//  Inbound SMS webhook. Configure as the number's "A MESSAGE COMES IN" URL in
//  the Twilio Console (HTTP POST to https://www.driveoffer.ca/api/sms):
//  - STOP / UNSUBSCRIBE / etc. -> record the opt-out so we stop texting them
//    (Twilio also auto-blocks the number and sends its own confirmation).
//  - START / UNSTOP -> clear the opt-out.
//  - "C" / "confirm" on an upcoming booking -> mark it confirmed + ping owner.
//  - Anything else -> forward the reply to the Telegram Replies channel, so
//    customer texts land in the same place as email replies.
//  Dormant until TWILIO_AUTH_TOKEN is set (returns empty TwiML, ignores input).
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    if (!TOKEN) return twiml(); // not configured yet — ignore
    if (!validSignature(req.headers.get("x-twilio-signature") || "", params)) {
      console.warn("[sms inbound] bad Twilio signature — ignored");
      return twiml();
    }

    const from = params.get("From") || "";
    const bodyRaw = (params.get("Body") || "").trim();
    const body = bodyRaw.toLowerCase();
    const e164 = toE164(from) || from;
    const lead = await findLeadByPhone(e164);

    if (STOP_WORDS.has(body)) {
      if (lead) await updateLead(lead.id, { smsOptOut: true });
      await notifyOwner(
        `\u{1F6AB} SMS opt-out from ${from}${lead ? ` (${lead.contact.name || carOf(lead)})` : ""} — no further texts will be sent.`,
        "updates",
      );
      return twiml();
    }
    if (START_WORDS.has(body)) {
      if (lead) await updateLead(lead.id, { smsOptOut: false });
      await notifyOwner(`✅ SMS opt-in from ${from} — texts re-enabled.`, "updates");
      return twiml();
    }

    if (lead && lead.status === "scheduled" && lead.appointmentAt && CONFIRM_WORDS.has(body)) {
      await updateLead(lead.id, { appointmentConfirmedAt: new Date().toISOString() });
      await notifyOwner(`✅ Inspection confirmed by text — ${leadLine(lead)}`, "bookings");
      return twiml();
    }

    // A real reply — stamp the person's profile, then forward it (parity with email replies).
    if (lead) {
      await updateLead(lead.id, {
        lastReplyAt: new Date().toISOString(),
        repliesCount: (lead.repliesCount || 0) + 1,
        lastInboundChannel: "sms",
      });
    }
    await notifyOwner(
      [
        "\u{1F4AC} Text reply from a customer",
        lead ? leadLine(lead) : `From: ${from}`,
        "",
        `"${bodyRaw.slice(0, 600)}"`,
        "",
        `Call or text back: ${from}`,
      ].join("\n"),
      "replies",
    );
    return twiml();
  } catch (e) {
    console.error("[sms inbound] error:", e);
    return twiml();
  }
}
