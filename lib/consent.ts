// ===========================================================================
//  Analytics consent (opt-out model) — the one place the banner choice lives.
//
//  Canadian privacy law (PIPEDA / Alberta PIPA) permits implied, opt-out
//  consent for non-sensitive analytics with prominent notice, so the default
//  (no stored choice) keeps analytics on and shows the banner. "Turn off
//  analytics" stores a denial that: disables GA (inline layout guard), skips
//  the Meta Pixel loader, blocks Microsoft Clarity, and no-ops the first-party
//  event beacon. SSR-safe like lib/attribution.ts — server calls return null.
// ===========================================================================

export const CONSENT_KEY = "ao_consent";

export type ConsentChoice = "granted" | "denied";

/** The stored banner choice, or null if the visitor hasn't chosen (or SSR).
 * FAIL CLOSED: when storage is blocked entirely (e.g. "block all cookies"),
 * report "denied" — a prior opt-out would be unreadable, and a banner choice
 * couldn't persist anyway, so the safe posture is no analytics + no banner. */
export function consentChoice(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
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
}
