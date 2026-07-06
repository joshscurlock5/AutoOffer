// ===========================================================================
//  Analytics consent (opt-out model) — the one place the banner choice lives.
//
//  Canadian privacy law (PIPEDA / Alberta PIPA) permits implied, opt-out
//  consent for non-sensitive analytics with prominent notice, so the default
//  (no stored choice) keeps analytics on and shows the banner. "Turn off
//  analytics" stores a denial that: disables GA (inline layout guard), skips
//  the Meta Pixel loader, blocks Microsoft Clarity, and no-ops the first-party
//  event beacon. SSR-safe like lib/attribution.ts — server calls return null.
//
//  The choice is ALSO mirrored into an "ao_consent" cookie so the server can
//  see it (localStorage is invisible server-side) — a denial now also skips
//  the server-side Meta CAPI / GA4 MP sends on lead submit (see app/api/leads).
// ===========================================================================

export const CONSENT_KEY = "ao_consent";

export type ConsentChoice = "granted" | "denied";

/** Mirror the choice into a cookie the server can read. Best-effort. */
function setConsentCookie(v: ConsentChoice): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${CONSENT_KEY}=${v}; max-age=15552000; path=/; SameSite=Lax`;
  } catch {
    /* cookies disabled — server falls back to no stored choice (tracking on) */
  }
}

/** The stored banner choice, or null if the visitor hasn't chosen (or SSR).
 * FAIL CLOSED: when storage is blocked entirely (e.g. "block all cookies"),
 * report "denied" — a prior opt-out would be unreadable, and a banner choice
 * couldn't persist anyway, so the safe posture is no analytics + no banner. */
export function consentChoice(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    const choice = v === "granted" || v === "denied" ? v : null;
    // Self-heal: a choice was made before the cookie mirror existed (or the
    // cookie expired/was cleared) — rewrite it so the server stays in sync.
    if (choice && typeof document !== "undefined" && !document.cookie.includes(`${CONSENT_KEY}=`)) {
      setConsentCookie(choice);
    }
    return choice;
  } catch {
    return "denied";
  }
}

/** True only when the visitor explicitly turned analytics off. */
export function consentDenied(): boolean {
  return consentChoice() === "denied";
}

/** Store the banner choice (best-effort; storage failures never disrupt the page). */
export function setConsent(v: ConsentChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* storage disabled — consentChoice() fails closed to "denied" anyway */
  }
  setConsentCookie(v);
}
