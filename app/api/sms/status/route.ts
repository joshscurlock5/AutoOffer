import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getLeads, atomicLeadEngagement } from "@/lib/store";
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
//  We atomically record only the terminal states onto the lead (lib/store.ts
//  atomicLeadEngagement): delivered/failed counters, the last status + error
//  code, and a commsEvents entry for the timeline.
//
//  Signature-validated exactly like the inbound webhook (app/api/sms/route.ts);
//  dormant until TWILIO_AUTH_TOKEN is set — it ships with the rest of the SMS
//  layer and wakes automatically once A2P clears. Always 200s (Twilio retries
//  non-2xx, and a stamping failure must never re-queue forever).
// ---------------------------------------------------------------------------

const TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const WEBHOOK_URL = `${site.url}/api/sms/status`;
// commsEvents is no longer capped here — see the note in the Resend webhook
// (app/api/webhooks/resend/route.ts) on atomicLeadEngagement's uncapped append.

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
    // Dormant until a REAL Twilio auth token is set (always 32 chars) — a
    // truncated/placeholder value must never become a weak HMAC key.
    if (!TOKEN || TOKEN.length < 32) return new NextResponse(null, { status: 200 });
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

    // Atomic write — see lib/store.ts atomicLeadEngagement (same race as the
    // Resend webhook: concurrent status callbacks for the same lead).
    const set: Record<string, string | number | boolean> = { "smsEngagement.lastStatus": status };
    const increment: Record<string, number> = {};
    if (status === "delivered") {
      increment["smsEngagement.deliveredCount"] = 1;
      set["smsEngagement.lastDeliveredAt"] = at;
    } else {
      increment["smsEngagement.failedCount"] = 1;
      if (errorCode) set["smsEngagement.lastErrorCode"] = errorCode;
    }
    await atomicLeadEngagement(lead.id, { set, increment, appendCommsEvent: entry });
    return new NextResponse(null, { status: 200 });
  } catch (e) {
    console.error("[sms status] error:", e);
    return new NextResponse(null, { status: 200 });
  }
}
