import "server-only";
import crypto from "crypto";

// ===========================================================================
//  GA4 Measurement Protocol (server-side). Mirrors lib/metaCapi.ts: sends a
//  `generate_lead` event straight from our server to GA4 so the lead conversion
//  is still counted when the browser gtag is blocked (ad-blockers, privacy
//  extensions, iOS). The server-side counterpart to the browser generate_lead.
//
//  - No-op until BOTH NEXT_PUBLIC_GA_ID and GA4_MP_API_SECRET are set.
//  - Never throws — the lead is already saved by the time this runs.
//  - Carries `transport: "server"` so it can be told apart from the browser
//    `generate_lead`. GA4 has NO built-in browser<->MP dedup, so pick ONE as the
//    canonical conversion in GA4 (see docs/analytics-funnel.md).
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
 * Send a server-side `generate_lead` to GA4. Best-effort; safe no-op when
 * unconfigured. Pass the raw `_ga` cookie so the event stitches to the user's
 * existing GA session; when it's missing (the very case this recovers) a fresh
 * client_id is used — the conversion is still counted, as a new user.
 */
export async function sendGa4Lead(opts: {
  gaCookie?: string;
  params?: Record<string, unknown>;
}): Promise<void> {
  if (!MEASUREMENT_ID || !API_SECRET) return;
  try {
    const clientId = clientIdFromGaCookie(opts.gaCookie) || crypto.randomUUID();
    const body = {
      client_id: clientId,
      events: [
        {
          name: "generate_lead",
          params: {
            engagement_time_msec: 1,
            transport: "server",
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
