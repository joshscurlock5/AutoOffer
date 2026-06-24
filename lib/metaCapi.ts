import "server-only";
import crypto from "crypto";

// ===========================================================================
//  Meta Conversions API (server-side). Sends a "Lead" event straight from our
//  server to Meta so conversions are tracked even when the browser Pixel is
//  blocked (ad-blockers, iOS) — the key to letting Meta optimize Facebook/
//  Instagram ads for people who actually become leads.
//
//  - No-op until BOTH NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_TOKEN are set.
//  - Never throws — leads are already saved by the time this runs.
//  - PII (email/phone/name) is SHA-256 hashed per Meta's requirements; we never
//    send raw contact info. The shared `eventId` dedupes against the browser
//    Pixel "Lead" event so a conversion is counted once.
// ===========================================================================

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.META_PIXEL_ID || "";
const TOKEN = process.env.META_CAPI_TOKEN || "";
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

function hashName(name?: string): string | undefined {
  const n = (name || "").trim().toLowerCase();
  return n ? sha256(n) : undefined;
}

export type CapiUser = {
  email?: string;
  phone?: string;
  firstName?: string;
  clientIp?: string;
  userAgent?: string | null;
  fbp?: string; // _fbp cookie
  fbc?: string; // _fbc cookie
};

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
  if (!PIXEL_ID || !TOKEN) return;
  try {
    const ud: Record<string, unknown> = {};
    const em = hashEmail(opts.user.email);
    if (em) ud.em = [em];
    const ph = hashPhone(opts.user.phone);
    if (ph) ud.ph = [ph];
    const fn = hashName(opts.user.firstName);
    if (fn) ud.fn = [fn];
    if (opts.user.clientIp && opts.user.clientIp !== "unknown") ud.client_ip_address = opts.user.clientIp;
    if (opts.user.userAgent) ud.client_user_agent = opts.user.userAgent;
    if (opts.user.fbp) ud.fbp = opts.user.fbp;
    if (opts.user.fbc) ud.fbc = opts.user.fbc;

    const body = {
      data: [
        {
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000),
          event_id: opts.eventId,
          action_source: "website",
          ...(opts.eventSourceUrl ? { event_source_url: opts.eventSourceUrl } : {}),
          user_data: ud,
          ...(opts.customData ? { custom_data: opts.customData } : {}),
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) {
      console.error("[meta-capi] non-OK response:", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[meta-capi] send failed:", e);
  }
}
