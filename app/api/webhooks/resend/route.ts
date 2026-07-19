import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getLeads, atomicLeadEngagement, getLeadByShortId } from "@/lib/store";
import { notifyOwner, leadLine, postLeadTopic } from "@/lib/notify";
import type { CommsEvent, Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

/** Pull the bare email out of a "Name <email@x>" (or plain) address, lowercased. */
function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  const raw = (m ? m[1] : from).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : "";
}

/** Rough HTML→text for when a reply has no plain-text part. */
function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

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
    /** The tags we attach at send time (lib/email.ts emailTags): kind + lead id.
     * Resend has shipped these both as an array of {name, value} pairs and as a
     * plain {kind: "..."} object depending on payload vintage — handle both. */
    tags?: { name?: string; value?: string }[] | Record<string, string>;
    // email.received (inbound) — metadata only; the body is fetched separately.
    email_id?: string;
    from?: string | string[];
  };
}

/** Handle an inbound customer reply (Resend Inbound `email.received`). The webhook
 * carries metadata only, so we fetch the body from Resend, then route it to the
 * customer's Replies-group topic by the SENDER's email (same as the Gmail path).
 * This replaces the fragile Gmail-inbox + polling chain: replies hit us instantly,
 * never depend on Gmail delivery, and never get lost to spam filtering. */
async function handleInbound(event: ResendEvent): Promise<void> {
  const emailId = event.data?.email_id;
  const fromRaw = Array.isArray(event.data?.from) ? event.data?.from[0] : event.data?.from;
  const from = extractEmail(fromRaw || "");
  const subject = (event.data?.subject || "").trim();
  if (!from) return;

  // Fetch the full body (webhooks are metadata-only). Best-effort — if it fails we
  // still post a heads-up so a reply is never silently dropped.
  let text = "";
  if (emailId && RESEND_API_KEY) {
    try {
      const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      });
      if (r.ok) {
        const body = await r.json().catch(() => ({}));
        text = (typeof body?.text === "string" && body.text.trim()) || stripHtml(body?.html) || "";
      } else {
        console.error(`[resend inbound] body fetch ${r.status}`);
      }
    } catch (e) {
      console.error("[resend inbound] body fetch error:", e);
    }
  }

  // Resolve the customer: the sender's email routes ALL their mail to one thread;
  // fall back to the "Ref: <short-id>" tag our emails carry (lib/email.ts refRow) for
  // replies that come from a different/secondary address than the one on file.
  let lead = await findLeadByEmail(from);
  if (!lead) {
    const ref = (text.match(/Ref:\s*([a-z0-9]{4,20})/i) || subject.match(/Ref:\s*([a-z0-9]{4,20})/i))?.[1];
    if (ref) lead = (await getLeadByShortId(ref)).lead;
  }

  // Never silently drop a reply. If we can't match it to a lead, alert the owner with
  // the sender + snippet so it always surfaces somewhere — the Reply-To now routes
  // only to us, so there is no Gmail-inbox fallback catching these.
  if (!lead) {
    await notifyOwner(
      `📩 Customer reply — couldn't match it to a lead\nFrom: ${from}` +
        `${subject ? `\nSubject: ${subject}` : ""}\n\n"${(text || "(no body)").slice(0, 700)}"`,
      "replies",
    );
    return;
  }

  const inbound = [
    `📩 ${lead.contact.name || "Customer"} (email)`,
    ...(subject ? [`Subject: ${subject}`] : []),
    "",
    `"${(text || "(couldn't load the message text — open it in Resend)").slice(0, 900)}"`,
  ].join("\n");

  // Stamp engagement — best-effort; a transient DynamoDB fault must NOT stop us from
  // surfacing the reply, so isolate it from the owner-facing post below.
  try {
    await atomicLeadEngagement(lead.id, {
      set: {
        lastReplyAt: new Date().toISOString(),
        lastInboundChannel: "email",
        nurturePausedUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      },
      increment: { repliesCount: 1 },
    });
  } catch (e) {
    console.error("[resend inbound] engagement stamp failed:", e);
  }

  // Post into the customer's topic; if that fails (topic create/send hiccup, stale
  // supergroup chat id, bot rate-limit, …) fall back to a flat Replies alert so the
  // reply is never invisible — and Resend needn't retry (we always ack 200).
  const posted = await postLeadTopic(lead, inbound);
  if (!posted) {
    await notifyOwner(`📩 New customer reply — ${leadLine(lead)}\n\n${inbound}`, "replies");
  }
}

/** Canonicalize an address for matching: lowercase/trim, and for Gmail/Googlemail
 * fold the well-known aliases (dots are ignored, +tag is a suffix) so a reply from
 * johnsmith@gmail.com still matches a lead captured as john.smith+car@gmail.com. */
function canonicalEmail(email: string): string {
  const raw = (email || "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at < 1) return raw;
  const domain = raw.slice(at + 1);
  const local = raw.slice(0, at);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return raw;
}

/** The lead this receipt belongs to: most recent non-spam lead on the address
 * (Gmail-alias-aware, so a dotted/+tagged reply address still matches). */
async function findLeadByEmail(email: string): Promise<Lead | null> {
  const norm = canonicalEmail(email);
  if (!norm) return null;
  let leads: Lead[];
  try {
    leads = await getLeads();
  } catch {
    return null;
  }
  return (
    leads
      .filter((l) => canonicalEmail(l.contact.email || "") === norm && l.status !== "spam")
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

    // Inbound customer reply (Resend Inbound) → route straight to their topic.
    if (event.type === "email.received") {
      await handleInbound(event);
      return NextResponse.json({ ok: true });
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
    // Which template this receipt is about — from the `kind` tag every send
    // carries (lib/email.ts emailTags). Defensive on shape (array vs object)
    // and clamped; only stamped when actually present so old payloads/owner
    // mail without tags keep writing the exact same entry as before.
    const tags = event.data?.tags;
    const kindRaw = Array.isArray(tags)
      ? tags.find((t) => t?.name === "kind")?.value
      : tags && typeof tags === "object"
        ? (tags as Record<string, string>).kind
        : undefined;
    const kind = typeof kindRaw === "string" && kindRaw ? kindRaw.slice(0, 60) : undefined;
    const entry: CommsEvent = { at, channel: "email", type, ...(url ? { url } : {}), ...(kind ? { kind } : {}) };

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
