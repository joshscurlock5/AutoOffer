import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addLead, markLookupConverted, updateLead } from "@/lib/store";
import { getEstimate } from "@/lib/valuation";
import { notifyNewLead } from "@/lib/notify";
import type { Lead, UploadedPhoto, VehicleInfo, OfferEstimate } from "@/lib/types";
import { clientIpFrom, allowRequest } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendCapiLead, splitName } from "@/lib/metaCapi";
import { sendGa4Lead, clientIdFromGaCookie } from "@/lib/ga4Mp";
import { sendLeadConfirmation } from "@/lib/email";
import { smsLeadConfirmation } from "@/lib/sms";
import { parseAttribution, parseBehavior, parseTouches } from "@/lib/attribution";

export const runtime = "nodejs";

// Server-side valuation is OFF (mirrors SHOW_INSTANT_ESTIMATE in OfferFlow) — the
// MarketCheck prices were inaccurate, so leads are saved WITHOUT an estimate and a
// specialist quotes manually. getEstimate()/parseShownEstimate are kept and gated
// here for a future, more accurate API swap; flip to true to re-enable.
const COMPUTE_ESTIMATE = false;

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Parse the damage/condition the client sent (chips + optional note). Hardened
 * against arbitrary input: tags are string-only, length- and count-capped; the
 * note is trimmed and clamped. Returns undefined when there's nothing to store. */
function parseCondition(raw: string): { tags: string[]; note?: string } | undefined {
  if (!raw) return undefined;
  try {
    const o = JSON.parse(raw);
    const tags: string[] = Array.isArray(o?.tags)
      ? o.tags
          .filter((t: unknown): t is string => typeof t === "string")
          .map((t: string) => t.trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 10)
      : [];
    const note = typeof o?.note === "string" ? o.note.trim().slice(0, 500) : "";
    if (!tags.length && !note) return undefined;
    return note ? { tags, note } : { tags };
  } catch {
    return undefined;
  }
}

/** Defensively parse the estimate the client was shown (used only as a fallback). */
function parseShownEstimate(raw: string): OfferEstimate | undefined {
  if (!raw) return undefined;
  try {
    const o = JSON.parse(raw);
    if (!o || o.unique) return undefined;
    const low = Number(o.low);
    const high = Number(o.high);
    const mid = Number(o.mid);
    if (![low, high, mid].every((n) => Number.isFinite(n) && n >= 0)) return undefined;
    if (high < low) return undefined;
    return {
      low,
      high,
      mid,
      currency: "CAD",
      source: o.source === "market" ? "market" : "estimate",
      ...(Number.isFinite(Number(o.comps)) ? { comps: Number(o.comps) } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP BEFORE parsing the (potentially large) multipart body.
    const ip = clientIpFrom(req);
    if (!(await allowRequest(ip, "leads", 6, 3600))) {
      return NextResponse.json({ error: "Too many submissions. Please try again in a bit." }, { status: 429 });
    }
    const form = await req.formData();

    // Bot check (Cloudflare Turnstile). No-op until keys are configured; once set,
    // it rejects missing/forged tokens BEFORE any S3 write or Telegram alert.
    if (!(await verifyTurnstile(str(form.get("turnstileToken")), ip))) {
      return NextResponse.json(
        { error: "Verification failed. Please refresh the page and try again." },
        { status: 403 },
      );
    }

    const kind = str(form.get("kind")) === "inquiry" ? "inquiry" : "vehicle";
    const name = str(form.get("name"));
    const email = str(form.get("email"));
    const phone = str(form.get("phone"));
    const cmRaw = str(form.get("contactMethod"));
    const contactMethod = (["call", "text", "email"].includes(cmRaw) ? cmRaw : "call") as
      | "call"
      | "text"
      | "email";
    const bestTime = str(form.get("bestTime")) || undefined;

    // Require the contact channel that matches the chosen method. (First name was
    // removed from the form, so it's no longer required.)
    const missingChannel = contactMethod === "email" ? !email : !phone;
    if (missingChannel) {
      return NextResponse.json(
        { error: contactMethod === "email" ? "An email is required." : "A phone number is required." },
        { status: 400 },
      );
    }
    if (contactMethod === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    let vehicle: VehicleInfo | undefined;
    let estimate: OfferEstimate | undefined;
    // Photos are no longer collected; kept as an empty array for back-compat with
    // existing leads (admin still displays historical photos from S3).
    const photos: UploadedPhoto[] = [];

    if (kind === "vehicle") {
      const year = str(form.get("year"));
      const make = str(form.get("make"));
      const model = str(form.get("model"));
      const trim = str(form.get("trim"));
      const mileageKm = Number(str(form.get("mileageKm"))) || 0;
      const condition = parseCondition(str(form.get("condition")));

      vehicle = { year, make, model, trim: trim || undefined, mileageKm, ...(condition ? { condition } : {}) };
      if (COMPUTE_ESTIMATE) {
        // Re-derive the estimate server-side. Normally a warm-cache hit (the user
        // just viewed it), so usually no extra MarketCheck call; on a cold/expired
        // cache it may spend one budget-gated call (and fails closed to "unique").
        estimate = await getEstimate({ year, make, model, mileageKm, trim: trim || undefined });
        // If we couldn't re-price it but the customer was already shown a concrete
        // range, store what they actually saw so the lead matches the screen.
        if (estimate.unique) {
          const shown = parseShownEstimate(str(form.get("estimateJson")));
          if (shown) estimate = shown;
        }
      }
    }

    // Meta ad-match keys. metaEventId is shared with the browser Pixel "Lead" so
    // Meta dedupes; fbc/fbp/ip/ua are persisted on the lead so a later offline
    // "Purchase" conversion can be attributed back to the originating ad click.
    const rawMetaEventId = str(form.get("metaEventId"));
    if (!rawMetaEventId) {
      console.warn("[leads] metaEventId missing — browser/server dedup will not match for this lead");
    }
    const metaEventId = rawMetaEventId || crypto.randomUUID();
    const fbp = req.cookies.get("_fbp")?.value;
    const fbc = req.cookies.get("_fbc")?.value;
    const userAgent = req.headers.get("user-agent") || undefined;

    // Per-person profile enrichment: first-touch attribution + on-site behavior
    // (sent by the client) + the GA4 client_id (for GA session stitching).
    const attribution = parseAttribution(str(form.get("attribution")));
    const touchHistory = parseTouches(str(form.get("touches")));
    const behavior = parseBehavior(str(form.get("behavior")));
    const gaClientId = clientIdFromGaCookie(req.cookies.get("_ga")?.value);

    const lead: Lead = {
      id,
      kind,
      createdAt: new Date().toISOString(),
      status: "new",
      contact: { name, email, phone, contactMethod, bestTime },
      vehicle,
      estimate,
      photos,
      message: str(form.get("message")) || undefined,
      referralCode: str(form.get("referralCode")) || undefined,
      meta: { fbc, fbp, eventId: metaEventId, clientIp: ip, userAgent },
      ...(attribution
        ? { attribution, landingPath: attribution.landingPath, referrerUrl: attribution.referrer }
        : {}),
      ...(touchHistory ? { touchHistory } : {}),
      ...(behavior ? { behavior } : {}),
      ...(gaClientId ? { gaClientId } : {}),
      source: "web",
    };

    await addLead(lead);
    // Best-effort owner alert (Telegram). Awaited so Amplify's Lambda doesn't
    // freeze the send; never throws, so the lead is safe.
    await notifyNewLead(lead);
    // Instant confirmation email to the customer (best-effort; only fires when
    // they gave an email — phone-only call/text leads have none). Never blocks
    // or fails the lead.
    await sendLeadConfirmation(lead);
    // Instant confirmation TEXT too (best-effort; no-op without a phone / Twilio config).
    await smsLeadConfirmation(lead);
    // NOTE: no automatic "still want an offer?" drip on submit. The flow now
    // assumes we have enough to quote — the owner drives follow-up from Telegram
    // (/offer sends the offer, /moreinfo requests detail), and the scheduled cron
    // sends the matching customer reminders based on nurtureStage.
    // Link this lead back to the price-lookup it came from (admin "API Calls"
    // conversion tracking). Strictly after the lead is saved + alerted, and
    // best-effort (markLookupConverted swallows its own errors), so it can never
    // block or fail a lead.
    const lookupId = str(form.get("lookupId"));
    if (lookupId) await markLookupConverted(lookupId, id);
    // Meta Conversions API "Lead" event (server-side; best-effort, after the lead
    // is saved — can never affect it). Shares metaEventId with the browser Pixel
    // event so Meta dedupes; PII is hashed inside sendCapiLead.
    const { firstName, lastName } = splitName(name);
    await sendCapiLead({
      eventId: metaEventId,
      eventName: kind === "inquiry" ? "Contact" : "Lead",
      eventSourceUrl: req.headers.get("referer"),
      user: {
        email,
        phone,
        firstName,
        lastName,
        externalId: id,
        country: "ca",
        clientIp: ip,
        userAgent,
        fbp,
        fbc,
      },
      customData: {
        currency: "CAD",
        value: estimate && !estimate.unique ? estimate.mid : 0,
        ...(vehicle ? { content_name: `${vehicle.year} ${vehicle.make} ${vehicle.model}` } : {}),
      },
    });
    // GA4 Measurement Protocol "generate_lead" (server-side; best-effort). Mirrors
    // the browser generate_lead for vehicle leads so the conversion still counts
    // when gtag is blocked. Reads _ga to stitch to the user's GA session. Tagged
    // transport:"server" — choose one of browser/server as the canonical
    // conversion in GA4 since they aren't auto-deduped.
    if (kind === "vehicle") {
      await sendGa4Lead({
        gaCookie: req.cookies.get("_ga")?.value,
        params: {
          currency: "CAD",
          value: estimate && !estimate.unique ? estimate.mid : 0,
          ...(vehicle ? { make: vehicle.make, model: vehicle.model, year: Number(vehicle.year) || 0 } : {}),
          contact_method: contactMethod,
        },
      });
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("POST /api/leads failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
