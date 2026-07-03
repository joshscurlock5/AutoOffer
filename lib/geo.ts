import "server-only";
import type { Geo } from "./types";

// ===========================================================================
//  Best-effort IP → coarse geolocation (country / province / city).
//
//  Called from the cron for any lead that has a stored client IP but no geo yet
//  (so it never adds latency to the lead-submit path, and existing leads get
//  backfilled automatically). Uses a free, keyless HTTPS lookup (ipwho.is).
//  Never throws — geo is a nice-to-have; a failed lookup just leaves it unset.
//  Resolved ONCE and stored on the lead; the dashboard only reads stored geo.
// ===========================================================================

/** Skip obviously non-geolocatable IPs (localhost / private ranges). */
function isPublicIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false;
  if (ip === "127.0.0.1" || ip === "::1") return false;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  return true;
}

export async function resolveGeo(ip?: string): Promise<Geo | undefined> {
  const clean = (ip || "").trim();
  if (!isPublicIp(clean)) return undefined;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(clean)}?fields=success,country,country_code,region,city`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return undefined;
    const d = (await r.json()) as {
      success?: boolean;
      country?: string;
      country_code?: string;
      region?: string;
      city?: string;
    };
    if (!d || d.success === false) return undefined;
    const geo: Geo = {
      country: d.country || undefined,
      countryCode: d.country_code || undefined,
      region: d.region || undefined,
      city: d.city || undefined,
      resolvedAt: new Date().toISOString(),
    };
    // Only return if we got at least a country — else leave unset so it retries later.
    return geo.country ? geo : undefined;
  } catch {
    return undefined;
  }
}
