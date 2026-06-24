// ===========================================================================
//  Client-side Meta (Facebook/Instagram) Pixel helper. Mirrors lib/analytics.ts:
//  a safe no-op until NEXT_PUBLIC_META_PIXEL_ID is set, so it ships before the
//  Pixel exists. The base loader lives in app/layout.tsx (gated). PageView is
//  fired by components/Analytics.tsx on every route change (incl. first render).
// ===========================================================================

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

type Params = Record<string, string | number | boolean | undefined>;

/**
 * Fire a Pixel event. Pass an `eventId` to dedupe with the matching server-side
 * Conversions API event (Meta counts the browser + server event once).
 */
export function trackMeta(event: string, params: Params = {}, eventId?: string): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (eventId) window.fbq("track", event, params, { eventID: eventId });
  else window.fbq("track", event, params);
}

/** A dedup id shared by the browser Pixel event and its server CAPI counterpart. */
export function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
