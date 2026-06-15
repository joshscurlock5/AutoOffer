// ===========================================================================
//  Lightweight GA4 helper.
//  - The GA script (in app/layout.tsx) only loads when NEXT_PUBLIC_GA_ID is set,
//    so this is a safe no-op until you paste your Measurement ID into Amplify.
//  - Call track("event_name", { ... }) anywhere on the client to fire an event.
// ===========================================================================

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
