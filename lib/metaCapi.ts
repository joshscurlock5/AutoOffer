import "server-only";
import crypto from "crypto";

// ===========================================================================
//  Meta Conversions API (server-side). Sends conversion events straight from
//  our server to Meta so they're tracked even when the browser Pixel is blocked
//  (ad-blockers, iOS) — the key to letting Meta optimize Facebook/Instagram ads.
//
//  Two events:
//   - "Lead"     — fired on form submit (action_source "website"). Shares its
//                  eventId with the browser Pixel "Lead" so Meta dedupes them.
//   - "Purchase" — fired from the admin/CRM when a deal actually closes
//                  (action_source "system_generated"; no browser). This is the
//                  offline-conversion loop: it tells Meta which leads became real
//                  sales (with the true sale value) so it can optimize for buyers,
//                  not just form-fills. Matched back to the ad click via the
//                  fbc/fbp/hashed-email captured on the lead at creation.
//
//  - No-op until BOTH NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_TOKEN are set.
//  - Never throws — leads/sales are already saved by the time this runs.
//  - PII (email/phone/name/country/external_id) is SHA-256 hashed per Meta's
//    requirements; we never send raw contact info.
// ===========================================================================

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.META_PIXEL_ID || "";
const TOKEN = process.env.META_CAPI_TOKEN || "";
// Set META_TEST_EVENT_CODE (from Events Manager → Test Events) to route server
// events to the Test Events tab for verification, then unset it for production.
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || "";
const API_VERSION = "v21.0";

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function hashEmail(email?: string): string | undefined {
  const e = (email || "").trim().toLowerCase();
  return e ? sha256(e) : undefined;
}

/** Normalize to digits with a country code (Canada = +1 if 10 digits), then hash. */
function hashPhone(phone?: string): string | undefined {
  let d = (phone || "").replace(/\D/g, "");
  if (!d) return undefined;
  if (d.length === 10) d = "1" + d;
  return sha256(d);
}

/** Hash a name / country / id field: trim + lowercase (Meta's normalization), then SHA-256. */
function hashLower(v?: string): string | undefined {
  const n = (v || "").trim().toLowerCase();
  return n ? sha256(n) : undefined;
}

/**
 * Split a full name into first + last for Advanced Matching. Meta hashes `fn`
 * and `ln` separately, so sending the whole name as `fn` (sha256("john smith"))
 * never matches sha256("john") — this keeps the keys usable.
 */
export function splitName(full?: string): { firstName?: string; lastName?: string } {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export type CapiUser = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  /** A stable id for this person (we use the lead id) — links the Lead + Purchase events. */
  externalId?: string;
  /** 2-letter ISO country (e.g. "ca"); hashed. */
  country?: string;
  clientIp?: string;
  userAgent?: string | null;
  fbp?: string; // _fbp cookie
  fbc?: string; // _fbc cookie
};

/** Build Meta's hashed `user_data` object from the (raw) user fields. */
function buildUserData(user: CapiUser): Record<string, unknown> {
  const ud: Record<string, unknown> = {};
  const em = hashEmail(user.email);
  if (em) ud.em = [em];
  const ph = hashPhone(user.phone);
  if (ph) ud.ph = [ph];
  const fn = hashLower(user.firstName);
  if (fn) ud.fn = [fn];
  const ln = hashLower(user.lastName);
  if (ln) ud.ln = [ln];
  const country = hashLower(user.country);
  if (country) ud.country = [country];
  const ext = hashLower(user.externalId);
  if (ext) ud.external_id = [ext];
  if (user.clientIp && user.clientIp !== "unknown") ud.client_ip_address = user.clientIp;
  if (user.userAgent) ud.client_user_agent = user.userAgent;
  if (user.fbp) ud.fbp = user.fbp;
  if (user.fbc) ud.fbc = user.fbc;
  return ud;
}

/** POST one event to the CAPI. Returns true on a successful send. Best-effort; never throws. */
async function postEvent(event: Record<string, unknown>): Promise<boolean> {
  if (!PIXEL_ID || !TOKEN) return false;
  try {
    const body = {
      data: [event],
      // Routes events to Events Manager → Test Events when set (verification
      // only). Top-level field per Meta's CAPI spec; omitted in production.
      ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
    };
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) {
      console.error("[meta-capi] non-OK response:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[meta-capi] send failed:", e);
    return false;
  }
}

/**
 * Send a server-side "Lead" conversion to Meta. Best-effort; safe no-op when
 * unconfigured. `eventId` MUST match the browser Pixel event's eventID to dedupe.
 */
export async function sendCapiLead(opts: {
  eventId: string;
  eventSourceUrl?: string | null;
  user: CapiUser;
  customData?: Record<string, unknown>;
}): Promise<void> {
  await postEvent({
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId,
    action_source: "website",
    ...(opts.eventSourceUrl ? { event_source_url: opts.eventSourceUrl } : {}),
    user_data: buildUserData(opts.user),
    ...(opts.customData ? { custom_data: opts.customData } : {}),
  });
}

/**
 * Send a server-side "Purchase" conversion to Meta when a deal actually closes
 * (offline / CRM event). `value` is the real sale price in CAD. Returns true on
 * a successful send so the caller can mark the lead synced and avoid re-firing
 * (a stable eventId also lets Meta dedupe if it is retried). Best-effort.
 */
export async function sendCapiPurchase(opts: {
  eventId: string;
  value: number;
  user: CapiUser;
  customData?: Record<string, unknown>;
}): Promise<boolean> {
  return postEvent({
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId,
    action_source: "system_generated",
    user_data: buildUserData(opts.user),
    custom_data: { currency: "CAD", value: opts.value, ...(opts.customData ?? {}) },
  });
}
