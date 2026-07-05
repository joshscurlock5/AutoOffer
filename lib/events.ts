import { consentDenied } from "./consent";
import { getBehavior } from "./attribution";

// ===========================================================================
//  First-party event stream — client half.
//
//  logEvent(name, params) queues an event; the queue flushes to /api/events via
//  navigator.sendBeacon every ~5s and on pagehide/tab-hide (the same beacon
//  pattern OfferFlow's partial capture uses). lib/analytics.ts track() tees
//  every GA4 event through here, so the whole site's instrumentation lands in
//  our own DynamoDB events table with zero re-instrumentation — including for
//  the ~30% of visitors whose ad-blockers eat GA.
//
//  Keyed by the same behavior.sessionId that's stored on leads, which is how
//  lib/profiles.ts stitches anonymous browsing onto a person once they submit.
//  Consent-gated (no-op after the banner's "Turn off analytics") and never
//  throws — analytics must never break the page.
// ===========================================================================

type Params = Record<string, string | number | boolean | undefined>;

interface QueuedEvent {
  n: string;
  p?: Params;
  path?: string;
  at: string;
}

const FLUSH_MS = 5000;
const MAX_BATCH = 25; // matches the API's per-request cap (DynamoDB BatchWrite limit)
const MAX_QUEUE = 200;

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const sessionId = getBehavior().sessionId;
  if (!sessionId) {
    queue = [];
    return;
  }
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  try {
    const blob = new Blob([JSON.stringify({ sessionId, events: batch })], { type: "application/json" });
    const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/events", blob);
    if (!sent) {
      void fetch("/api/events", { method: "POST", body: blob, keepalive: true }).catch(() => {});
    }
  } catch {
    /* analytics must never disrupt the page */
  }
  if (queue.length) schedule(400); // drain oversized queues quickly
}

function schedule(ms = FLUSH_MS): void {
  if (timer) return;
  timer = setTimeout(flush, ms);
}

function bindLifecycleFlush(): void {
  if (listenersBound) return;
  listenersBound = true;
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Queue a first-party event. Safe anywhere on the client; no-op on the server
 * or after the consent banner's opt-out. */
export function logEvent(name: string, params?: Params): void {
  if (typeof window === "undefined") return;
  if (!name || typeof name !== "string") return;
  if (consentDenied()) return;
  queue.push({
    n: name.slice(0, 60),
    ...(params && Object.keys(params).length ? { p: params } : {}),
    path: window.location.pathname.slice(0, 200),
    at: new Date().toISOString(),
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  bindLifecycleFlush();
  schedule();
}
