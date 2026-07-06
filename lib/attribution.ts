import type { Attribution, Behavior, Touch } from "./types";

// ===========================================================================
//  Client-side first-touch attribution + lightweight behavior tracking.
//
//  Persists to localStorage so the data survives across pages and rides along
//  with the lead + partial-beacon submissions. FIRST-TOUCH WINS — we keep the
//  campaign/referrer that originally brought the person in, not the last click.
//
//  The capture functions (captureFirstTouch / markFunnelStep / getAttribution /
//  getBehavior) touch window/localStorage and are safe no-ops on the server.
//  The parse functions (parseAttribution / parseBehavior) are pure + defensive,
//  so the API routes can import this module server-side and only call those.
// ===========================================================================

const ATTR_KEY = "ao_attribution";
const BEHAVIOR_KEY = "ao_behavior";
const TOUCHES_KEY = "ao_touches";
const MAX_TOUCHES = 20;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function read<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function write(key: string, val: unknown): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* storage full / disabled — never disrupt the page */
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Record first-touch attribution and start/refresh the behavior session. Call
 * on every page load / route change (from <Analytics/>). Attribution is written
 * once and never overwritten; the behavior counters bump on each call.
 */
export function captureFirstTouch(): void {
  if (!canUseStorage()) return;
  const url = new URL(window.location.href);
  const p = url.searchParams;

  // First-touch attribution — only set if we've never captured it before.
  if (!read<Attribution>(ATTR_KEY)) {
    let referrer = document.referrer || "";
    try {
      // Drop same-origin referrers (internal nav) — we want the EXTERNAL source.
      if (referrer && new URL(referrer).host === window.location.host) referrer = "";
    } catch {
      /* keep referrer as-is */
    }
    const attr: Attribution = {
      utmSource: p.get("utm_source") || undefined,
      utmMedium: p.get("utm_medium") || undefined,
      utmCampaign: p.get("utm_campaign") || undefined,
      utmContent: p.get("utm_content") || undefined,
      utmTerm: p.get("utm_term") || undefined,
      gclid: p.get("gclid") || undefined,
      fbclid: p.get("fbclid") || undefined,
      referrer: referrer || undefined,
      landingPath: url.pathname + (url.search || ""),
      landingAt: new Date().toISOString(),
    };
    write(ATTR_KEY, attr);
  }

  // Multi-touch history — unlike the first-touch block above, this appends a
  // NEW entry every time a visit arrives with a fresh source signal.
  recordTouch(url, p);

  // Behavior session — create once, then bump pageviews + lastSeenAt each call.
  const now = new Date().toISOString();
  const existing = read<Behavior>(BEHAVIOR_KEY);
  const b: Behavior = existing || {
    visitorId: randomId(),
    sessionId: randomId(),
    firstSeenAt: now,
    pageviews: 0,
    maxFunnelStep: 0,
  };
  if (existing) {
    // Backfill continuity: old records only ever stored sessionId, so make
    // visitorId equal to it — keeps historical stitching intact.
    if (!b.visitorId) b.visitorId = b.sessionId || randomId();
    // Sessions rotate after 30 min of inactivity; the durable visitorId does not.
    const lastSeen = b.lastSeenAt ? Date.parse(b.lastSeenAt) : NaN;
    if (Number.isFinite(lastSeen) && Date.now() - lastSeen > 30 * 60 * 1000) {
      b.sessionId = randomId();
    }
  }
  b.lastSeenAt = now;
  b.pageviews = (b.pageviews || 0) + 1;
  write(BEHAVIOR_KEY, b);
}

/** Same source signals? Used to dedupe consecutive touches (internal SPA
 * navigations keep the same document.referrer, so without this every route
 * change would re-append the entry). */
function sameTouchSource(a: Touch, b: Touch): boolean {
  return (
    (a.utmSource || "") === (b.utmSource || "") &&
    (a.utmMedium || "") === (b.utmMedium || "") &&
    (a.utmCampaign || "") === (b.utmCampaign || "") &&
    (a.utmContent || "") === (b.utmContent || "") &&
    (a.utmTerm || "") === (b.utmTerm || "") &&
    (a.gclid || "") === (b.gclid || "") &&
    (a.fbclid || "") === (b.fbclid || "") &&
    (a.referrer || "") === (b.referrer || "")
  );
}

/** Append a touch when this navigation carries a NEW source signal (any utm /
 * click id / external referrer). The very first visit records even when direct
 * (so the journey has a start); plain direct RETURN visits don't append — a
 * revisit with no signal isn't a new marketing source. Capped + deduped. */
function recordTouch(url: URL, p: URLSearchParams): void {
  let referrer = document.referrer || "";
  try {
    if (referrer && new URL(referrer).host === window.location.host) referrer = "";
  } catch {
    /* keep referrer as-is */
  }
  const touch: Touch = {
    utmSource: p.get("utm_source") || undefined,
    utmMedium: p.get("utm_medium") || undefined,
    utmCampaign: p.get("utm_campaign") || undefined,
    utmContent: p.get("utm_content") || undefined,
    utmTerm: p.get("utm_term") || undefined,
    gclid: p.get("gclid") || undefined,
    fbclid: p.get("fbclid") || undefined,
    referrer: referrer || undefined,
    landingPath: url.pathname + (url.search || ""),
    at: new Date().toISOString(),
  };
  const hasSignal = Boolean(
    touch.utmSource || touch.utmMedium || touch.utmCampaign || touch.utmContent ||
    touch.utmTerm || touch.gclid || touch.fbclid || touch.referrer,
  );
  const touches = read<Touch[]>(TOUCHES_KEY) || [];
  if (touches.length && !hasSignal) return;
  const last = touches[touches.length - 1];
  if (last && sameTouchSource(last, touch)) return;
  touches.push(touch);
  write(TOUCHES_KEY, touches.slice(-MAX_TOUCHES));
}

/** The stored multi-touch journey (oldest first; [] if none). */
export function getTouches(): Touch[] {
  return read<Touch[]>(TOUCHES_KEY) || [];
}

/** Record the furthest offer-flow step the visitor reached (monotonic). */
export function markFunnelStep(step: number): void {
  if (!canUseStorage()) return;
  const b: Behavior = read<Behavior>(BEHAVIOR_KEY) || {
    sessionId: randomId(),
    firstSeenAt: new Date().toISOString(),
    pageviews: 0,
    maxFunnelStep: 0,
  };
  if ((b.maxFunnelStep || 0) < step) {
    b.maxFunnelStep = step;
    b.lastSeenAt = new Date().toISOString();
    write(BEHAVIOR_KEY, b);
  }
}

/** The stored first-touch attribution (empty object if none). */
export function getAttribution(): Attribution {
  return read<Attribution>(ATTR_KEY) || {};
}

/** The behavior summary, with timeOnSiteMs computed (lastSeen − firstSeen). */
export function getBehavior(): Behavior {
  const b = read<Behavior>(BEHAVIOR_KEY) || {};
  const first = b.firstSeenAt ? Date.parse(b.firstSeenAt) : NaN;
  const last = b.lastSeenAt ? Date.parse(b.lastSeenAt) : NaN;
  const timeOnSiteMs =
    Number.isFinite(first) && Number.isFinite(last) && last >= first ? last - first : undefined;
  return { ...b, ...(timeOnSiteMs != null ? { timeOnSiteMs } : {}) };
}

// ---- Server-safe defensive parsers (used by the API routes) ----------------

function S(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

function N(v: unknown, max: number): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : undefined;
}

/** Parse + clamp the attribution JSON the client sent. undefined when empty. */
export function parseAttribution(raw: unknown): Attribution | undefined {
  if (!raw) return undefined;
  try {
    const o = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return undefined;
    const a: Attribution = {
      utmSource: S(o.utmSource, 120),
      utmMedium: S(o.utmMedium, 120),
      utmCampaign: S(o.utmCampaign, 200),
      utmContent: S(o.utmContent, 200),
      utmTerm: S(o.utmTerm, 200),
      gclid: S(o.gclid, 400),
      fbclid: S(o.fbclid, 400),
      referrer: S(o.referrer, 400),
      landingPath: S(o.landingPath, 400),
      landingAt: S(o.landingAt, 40),
    };
    return Object.values(a).some(Boolean) ? a : undefined;
  } catch {
    return undefined;
  }
}

/** Parse + clamp the touch-history JSON the client sent. undefined when empty. */
export function parseTouches(raw: unknown): Touch[] | undefined {
  if (!raw) return undefined;
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return undefined;
    const out: Touch[] = [];
    for (const item of arr.slice(0, 20)) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const t: Touch = {
        utmSource: S(o.utmSource, 120),
        utmMedium: S(o.utmMedium, 120),
        utmCampaign: S(o.utmCampaign, 200),
        utmContent: S(o.utmContent, 200),
        utmTerm: S(o.utmTerm, 200),
        gclid: S(o.gclid, 400),
        fbclid: S(o.fbclid, 400),
        referrer: S(o.referrer, 400),
        landingPath: S(o.landingPath, 400),
        at: S(o.at, 40),
      };
      if (Object.values(t).some(Boolean)) out.push(t);
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Parse + clamp the behavior JSON the client sent. undefined when empty. */
export function parseBehavior(raw: unknown): Behavior | undefined {
  if (!raw) return undefined;
  try {
    const o = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return undefined;
    const b: Behavior = {
      visitorId: S(o.visitorId, 60),
      sessionId: S(o.sessionId, 60),
      firstSeenAt: S(o.firstSeenAt, 40),
      lastSeenAt: S(o.lastSeenAt, 40),
      pageviews: N(o.pageviews, 100000),
      maxFunnelStep: N(o.maxFunnelStep, 100),
      timeOnSiteMs: N(o.timeOnSiteMs, 1000 * 60 * 60 * 24 * 30), // cap 30 days
    };
    return Object.values(b).some((v) => v !== undefined) ? b : undefined;
  } catch {
    return undefined;
  }
}
