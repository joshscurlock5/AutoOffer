import { consentDenied } from "./consent";
import { getBehavior, getAttribution } from "./attribution";

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
//  Also carries behavior.visitorId (durable across sessions, unlike sessionId
//  which rotates after 30 min idle) so a return visit still stitches to the
//  same person's on-site history. Consent-gated (no-op after the banner's
//  "Turn off analytics") and never throws — analytics must never break the page.
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
let sending = false; // in-flight guard — prevents overlapping flushes double-sending a batch

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length || sending) return;
  const behavior = getBehavior();
  const sessionId = behavior.sessionId;
  if (!sessionId) return; // sessionId may appear after captureFirstTouch runs — leave events queued
  const visitorId = behavior.visitorId;
  // Peek (don't remove) so a failed send can be retried by the next flush.
  const batch = queue.slice(0, MAX_BATCH);
  // Remove by identity, not position — an overflow trim during an in-flight
  // fetch can shift the queue front, and a positional slice would then discard
  // events that were never sent.
  const dequeueBatch = () => {
    const sentSet = new Set(batch);
    queue = queue.filter((e) => !sentSet.has(e));
  };
  sending = true;
  try {
    // Attach the already-captured first-touch attribution (ad set = utm_content)
    // once per batch, top-level — lets the server tag each event row so the
    // anonymous on-site funnel can be split by ad set. No new capture; reads the
    // same localStorage value that rides along with lead submissions.
    const a = getAttribution();
    const attr: Record<string, string> = {};
    if (a.utmContent) attr.utmContent = a.utmContent;
    if (a.utmCampaign) attr.utmCampaign = a.utmCampaign;
    if (a.utmSource) attr.utmSource = a.utmSource;
    const blob = new Blob(
      [JSON.stringify({ sessionId, ...(visitorId ? { visitorId } : {}), ...(Object.keys(attr).length ? { attr } : {}), events: batch })],
      { type: "application/json" },
    );
    const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/events", blob);
    if (sent) {
      // sendBeacon acceptance is a queue-handoff guarantee — safe to drop the batch now.
      dequeueBatch();
      sending = false;
      if (queue.length) schedule(400); // drain oversized queues quickly
      return;
    }
    fetch("/api/events", { method: "POST", body: blob, keepalive: true })
      .then((res) => {
        if (res.ok) dequeueBatch();
      })
      .catch(() => {
        /* leave the queue untouched — the next 5s flush retries */
      })
      .finally(() => {
        sending = false;
        if (queue.length) schedule(400);
      });
  } catch {
    /* analytics must never disrupt the page */
    sending = false;
  }
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
  if (typeof navigator !== "undefined" && (navigator as any).webdriver) return;
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
