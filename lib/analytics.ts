// ===========================================================================
//  Lightweight GA4 helper.
//  - The GA script (in app/layout.tsx) only loads when NEXT_PUBLIC_GA_ID is set,
//    so this is a safe no-op until you paste your Measurement ID into Amplify.
//  - Call track("event_name", { ... }) anywhere on the client to fire an event.
// ===========================================================================

import { trackMeta } from "./metaPixel";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

type Params = Record<string, string | number | boolean | undefined>;

export function track(event: string, params: Params = {}): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", event, params);
}

/**
 * Click-to-call tracking. Fires the existing GA4 `phone_click` event AND a Meta
 * Pixel `Contact` event so phone calls are measured independently from website
 * Lead submissions. Single helper so no tel: link can be missed.
 */
export function trackPhoneClick(location: string): void {
  track("phone_click", { location });
  trackMeta("Contact");
}

/**
 * Entry-CTA click. Fires the GA4 `cta_click` event so the click→page-load
 * drop-off is measurable (subtract `offer_flow_start` from `cta_click` for a
 * given `location`). High-volume event — keep the params minimal. Used by
 * <OfferCtaLink/>; the destination URL also carries `?source=<location>`.
 */
export function trackCtaClick(location: string): void {
  track("cta_click", { location });
}

// A GA4 funnel event -> the Meta Pixel standard event mirrored for remarketing
// audiences. Centralized here (mirroring trackPhoneClick) so the GA4 step and
// its Meta counterpart can never drift apart. `generate_lead`/`Lead` is NOT in
// this table — it stays paired inline in OfferFlow because it also carries a
// CAPI dedup eventId. These mid-funnel Meta events are browser-only (audience
// membership, not conversion optimization), so no Conversions API.
const META_FUNNEL_MIRROR: Record<string, string> = {
  widget_submit: "Search",
  estimate_viewed: "ViewContent",
  contact_engaged: "InitiateCheckout",
};

/**
 * Fire a GA4 funnel event AND its mirrored Meta Pixel standard event together,
 * keeping drop-off analysis (GA4) and remarketing audiences (Meta) in lock-step.
 * GA4 keeps its existing snake_case event name. Pass `metaParams` to send a
 * Meta-shaped payload (e.g. value/currency/content_name) instead of the GA4
 * params; defaults to `gaParams` when omitted.
 */
export function trackFunnel(event: string, gaParams: Params = {}, metaParams?: Params): void {
  track(event, gaParams);
  const metaEvent = META_FUNNEL_MIRROR[event];
  if (metaEvent) trackMeta(metaEvent, metaParams ?? gaParams);
}
