import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getLeads, updateLead } from "@/lib/store";
import { toE164 } from "@/lib/sms";
import { site } from "@/lib/site-config";
import type { CommsEvent, Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  Twilio delivery-status callback — the receipts side of lib/sms.ts.
//
//  Every outbound text carries StatusCallback=<this URL>, so Twilio POSTs the
//  message's lifecycle here (queued → sent → delivered / undelivered / failed).
//  We record only the terminal states onto the lead: delivered/failed counters,
//  the last status + error code, and a commsEvents entry for the timeline.
//
//  Signature-validated exactly like the inbound webhook (app/api/sms/route.ts);
//  dormant until TWILIO_AUTH_TOKEN is set — it ships with the rest of the SMS
//  layer and wakes automatically once A2P clears. Always 200s (Twilio retries
//  non-2xx, and a stamping failure must never re-queue forever).
// ---------------------------------------------------------------------------

const TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const WEBHOOK_URL = `${site.url}/api/sms/status`;
const MAX_COMMS_EVENTS = 100;

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

/** Most recent lead on this phone number (same matching as the inbound webhook). */
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

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    if (!TOKEN) return new NextResponse(null, { status: 200 }); // not configured yet
    if (!validSignature(req.headers.get("x-twilio-signature") || "", params)) {
      console.warn("[sms status] bad Twilio signature — ignored");
      return new NextResponse(null, { status: 200 });
    }

    // Terminal states only — queued/sent are noise.
    const status = (params.get("MessageStatus") || "").toLowerCase();
    if (status !== "delivered" && status !== "undelivered" && status !== "failed") {
      return new NextResponse(null, { status: 200 });
    }

    const to = toE164(params.get("To") || "");
    const lead = to ? await findLeadByPhone(to) : null;
    if (!lead) return new NextResponse(null, { status: 200 });

    const at = new Date().toISOString();
    const errorCode = params.get("ErrorCode") || undefined;
    const entry: CommsEvent = { at, channel: "sms", type: status };
    const commsEvents = [...(lead.commsEvents || []), entry].slice(-MAX_COMMS_EVENTS);

    const eng = { ...(lead.smsEngagement || {}), lastStatus: status };
    if (status === "delivered") {
      eng.deliveredCount = (eng.deliveredCount || 0) + 1;
      eng.lastDeliveredAt = at;
    } else {
      eng.failedCount = (eng.failedCount || 0) + 1;
      if (errorCode) eng.lastErrorCode = errorCode;
    }

    await updateLead(lead.id, { smsEngagement: eng, commsEvents });
    return new NextResponse(null, { status: 200 });
  } catch (e) {
    console.error("[sms status] error:", e);
    return new NextResponse(null, { status: 200 });
  }
}
