import "server-only";
import crypto from "crypto";

// ===========================================================================
//  Signed one-click unsubscribe tokens.
//
//  Same HMAC-SHA256 + SESSION_SECRET scheme as lib/auth.ts session cookies, but
//  scoped to a single lead id so the "Unsubscribe" link in an email can only opt
//  out that recipient — never anyone else, and never guessable. The HMAC input is
//  namespaced ("unsub:") so a token minted here can't be replayed as a session
//  token (or vice-versa). No expiry: an unsubscribe link must keep working no
//  matter how old the email is.
//
//  Opting out sets lead.emailOptOut, which gates ONLY marketing/nurture sends
//  (lib/email.ts nurtureEmail()). Transactional mail the customer is waiting on —
//  their offer, booking confirmations — still goes out (validEmail()), which is
//  the behaviour a recipient actually wants.
// ===========================================================================

function signingKey(): string {
  return process.env.SESSION_SECRET || `ao-fallback-key::${process.env.ADMIN_PASSWORD || ""}`;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(`unsub:${payload}`).digest("base64url");
}

/** Mint an unguessable unsubscribe token for a lead: `<b64url(id)>.<hmac>`. */
export function makeUnsubToken(leadId: string): string {
  const payload = Buffer.from(leadId).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

/** Verify a token and return the lead id it authorises, or null if invalid. */
export function verifyUnsubToken(token: string): string | null {
  const t = (token || "").trim();
  const dot = t.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = t.slice(0, dot);
  const sig = t.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(payload, "base64url").toString() || null;
  } catch {
    return null;
  }
}
