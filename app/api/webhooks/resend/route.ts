import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getLeads, atomicLeadEngagement } from "@/lib/store";
import { notifyOwner, leadLine } from "@/lib/notify";
import type { CommsEvent, Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  Resend email-event webhook — the receipts side of lib/email.ts.
//
//  Resend POSTs an event here for every email we send (delivered / bounced /
//  complained / clicked / opened / failed, per the events ticked in the Resend
//  dashboard). We verify the Svix signature, match the recipient to their most
//  recent lead, and atomically stamp engagement onto it (lib/store.ts
//  atomicLeadEngagement): summary counters + the commsEvents log the profile
//  timeline renders.
//
//  CASL/deliverability hooks: a complaint (marked-as-spam) sets emailOptOut so
//  nurture emails stop; a bounce sets emailBounced so ALL sends skip the dead
//  address (lib/email.ts consults both).
//
//  Fail-closed: 401 on any missing/invalid signature, and a hard no-op until
//  RESEND_WEBHOOK_SECRET is set — same dormant-until-configured pattern as
//  lib/sms.ts. Never throws past the handler; Resend retries on non-2xx.
// ---------------------------------------------------------------------------

const SECRET = process.env.RESEND_WEBHOOK_SECRET || "";
const TOLERANCE_MS = 5 * 60 * 1000; // reject signatures older/newer than 5 min (replay guard)
// commsEvents is no longer capped here — atomicLeadEngagement's atomic path
// appends uncapped (DynamoDB list_append has no trim primitive); the 100-cap
// is enforced on read, or by atomicLeadEngagement's legacy fallback path.

/** Verify the Svix signature Resend signs webhooks with.
 * signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 keyed
 * with the base64-decoded secret (after the `whsec_` prefix); the header holds
 * one or more space-separated `v1,<base64>` candidates. */
function validSignature(req: NextRequest, rawBody: string): boolean {
  if (!SECRET) return false;
  const id = req.headers.get("svix-id") || "";
  const timestamp = req.headers.get("svix-timestamp") || "";
  const sigHeader = req.headers.get("svix-signature") || "";
  if (!id || !timestamp || !sigHeader) return false;

  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) return false;

  let key: Buffer;
  try {
    key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  const a = Buffer.from(expected);
  for (const candidate of sigHeader.split(" ")) {
    const [version, sig] = candidate.split(",");
    if (version !== "v1" || !sig) continue;
    const b = Buffer.from(sig);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    to?: string[] | string;
    subject?: string;
    click?: { link?: string };
    bounce?: { type?: string; subType?: string; message?: string };
  };
}

/** The lead this receipt belongs to: most recent non-spam lead on the address. */
async function findLeadByEmail(email: string): Promise<Lead | null> {
  const norm = email.trim().toLowerCase();
  if (!norm) return null;
  let leads: Lead[];
  try {
    leads = await getLeads();
  } catch {
    return null;
  }
  return (
    leads
      .filter((l) => (l.contact.email || "").trim().toLowerCase() === norm && l.status !== "spam")
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0] || null
  );
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (!validSignature(req, raw)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let event: ResendEvent;
    try {
      event = JSON.parse(raw) as ResendEvent;
    } catch {
      return NextResponse.json({ ok: true }); // malformed body — ack so Resend stops retrying
    }

    // email.delivered / email.opened / email.clicked / email.bounced / …
    const type = (event.type || "").replace(/^email\./, "");
    const handled = new Set(["delivered", "opened", "clicked", "bounced", "complained", "failed", "delivery_delayed"]);
    if (!handled.has(type)) return NextResponse.json({ ok: true });

    const toRaw = event.data?.to;
    const to = Array.isArray(toRaw) ? toRaw[0] : toRaw;
    const lead = to ? await findLeadByEmail(to) : null;
    if (!lead) return NextResponse.json({ ok: true }); // e.g. owner-notification emails

    const at = new Date().toISOString();
    const url = type === "clicked" ? (event.data?.click?.link || "").slice(0, 500) || undefined : undefined;
    const entry: CommsEvent = { at, channel: "email", type, ...(url ? { url } : {}) };

    // Atomic write — concurrent webhook deliveries for the same lead (e.g. a
    // near-simultaneous open + click) must not clobber each other's counters.
    const set: Record<string, string | number | boolean> = {};
    const increment: Record<string, number> = {};
    if (type === "delivered") increment["emailEngagement.deliveredCount"] = 1;
    if (type === "opened") {
      increment["emailEngagement.opensCount"] = 1;
      set["emailEngagement.lastOpenedAt"] = at;
    }
    if (type === "clicked") {
      increment["emailEngagement.clicksCount"] = 1;
      set["emailEngagement.lastClickedAt"] = at;
      if (url) set["emailEngagement.lastClickedUrl"] = url;
    }
    if (type === "delivery_delayed") set["emailEngagement.lastDelayedAt"] = at;
    if (type === "bounced" || type === "failed") {
      set.emailBounced = true;
      const b = event.data?.bounce;
      const reason = [b?.type, b?.subType, b?.message].filter(Boolean).join(" — ").slice(0, 200);
      if (reason) set["emailEngagement.lastBounceReason"] = reason;
    }
    if (type === "complained") set.emailOptOut = true;
    await atomicLeadEngagement(lead.id, { set, increment, appendCommsEvent: entry });

    // The two events the owner should actually hear about (rare + actionable).
    if (type === "bounced" || type === "complained") {
      const bounceReason = type === "bounced" ? set["emailEngagement.lastBounceReason"] : undefined;
      await notifyOwner(
        `⚠️ Email ${type === "bounced" ? "bounced" : "marked as spam"} — ${leadLine(lead)}\n` +
          (type === "bounced"
            ? `The address looks dead${bounceReason ? ` (${bounceReason})` : ""}; emails to this lead are now paused. Call or text instead.`
            : "Nurture emails to this lead are now stopped (CASL)."),
        "updates",
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[resend webhook] error:", e);
    return NextResponse.json({ ok: true }); // ack — a stamping failure shouldn't queue retries forever
  }
}
