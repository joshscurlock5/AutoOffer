import "server-only";

// ===========================================================================
//  GA4 Measurement Protocol (server-side). Mirrors lib/metaCapi.ts: sends
//  events straight from our server to GA4 so conversions are still counted
//  when the browser gtag is blocked (ad-blockers, privacy extensions, iOS).
//  `generate_lead_server` is ad-blocker-recovery telemetry under its own event
//  name — GA4 has NO built-in browser<->MP dedup, so only the browser
//  `generate_lead` should be marked as the GA4 key event. The rest
//  (working_lead, appointment_booked, close_convert_lead, close_unconvert_lead)
//  are server-only lifecycle events with no browser equivalent.
//
//  - No-op until BOTH NEXT_PUBLIC_GA_ID and GA4_MP_API_SECRET are set.
//  - Never throws — the caller's write is already saved by the time this runs.
//  - Carries `transport: "server"` so it can be told apart from any browser
//    equivalent (see docs/analytics-funnel.md).
// ===========================================================================

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "";
const API_SECRET = process.env.GA4_MP_API_SECRET || "";
// Set GA4_MP_DEBUG=1 to POST to GA4's validation endpoint (which echoes any
// problems) instead of the live one. Verification only — unset in production.
const DEBUG = process.env.GA4_MP_DEBUG === "1";

/**
 * Recover the GA4 client_id from the first-party `_ga` cookie
 * (`GA1.1.<part1>.<part2>` → `<part1>.<part2>`). Returns undefined if absent or
 * malformed, so the caller can fall back to a fresh id.
 */
export function clientIdFromGaCookie(ga?: string): string | undefined {
  if (!ga) return undefined;
  const parts = ga.split(".");
  if (parts.length < 4) return undefined;
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

/**
 * Recover the GA4 session id from the `_ga_<container>` cookie (distinct from
 * the plain `_ga` client-id cookie). Value looks like
 * `GS1.1.1712345678.5.1.1712345999.0.0.0` — the session id is the third
 * dot-segment (index 2). Defensive: never throws, returns undefined for
 * anything that doesn't look like a plausible number.
 */
export function parseGa4SessionCookie(cookies: Array<{ name: string; value: string }>): string | undefined {
  try {
    const cookie = cookies.find((c) => c.name.startsWith("_ga_"));
    if (!cookie) return undefined;
    const parts = cookie.value.split(".");
    const sessionId = parts[2];
    if (sessionId && /^\d+$/.test(sessionId)) return sessionId;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Send one server-side event to GA4 via the Measurement Protocol. Best-effort;
 * safe no-op when unconfigured. Skips (with a warning) when there's no real
 * client_id — sending under a random UUID would just create phantom GA4 users
 * that never resolve to a real session, so we no longer fall back to one.
 */
export async function sendGa4Event(opts: {
  name: string;
  clientId?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
}): Promise<void> {
  if (!MEASUREMENT_ID || !API_SECRET) return;
  if (!opts.clientId) {
    console.warn("[ga4] no client id — skipping " + opts.name);
    return;
  }
  try {
    const body = {
      client_id: opts.clientId,
      events: [
        {
          name: opts.name,
          params: {
            engagement_time_msec: 1,
            transport: "server",
            ...(opts.sessionId ? { ga_session_id: opts.sessionId } : {}),
            ...(opts.params || {}),
          },
        },
      ],
    };
    const base = DEBUG
      ? "https://www.google-analytics.com/debug/mp/collect"
      : "https://www.google-analytics.com/mp/collect";
    const res = await fetch(
      `${base}?measurement_id=${encodeURIComponent(MEASUREMENT_ID)}&api_secret=${encodeURIComponent(API_SECRET)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (DEBUG) {
      console.log("[ga4-mp] debug response:", res.status, await res.text().catch(() => ""));
    } else if (!res.ok) {
      console.error("[ga4-mp] non-OK response:", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[ga4-mp] send failed:", e);
  }
}

/**
 * Send a server-side `generate_lead_server` to GA4. Best-effort; safe no-op
 * when unconfigured. Pass the raw `_ga` cookie so the event stitches to the
 * user's existing GA session; when it's missing, the send is skipped entirely
 * (no more phantom random-UUID users).
 */
export async function sendGa4Lead(opts: {
  gaCookie?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
}): Promise<void> {
  await sendGa4Event({
    name: "generate_lead_server",
    clientId: clientIdFromGaCookie(opts.gaCookie),
    sessionId: opts.sessionId,
    params: opts.params,
  });
}
