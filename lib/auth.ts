import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "ao_session";
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days (seconds)

/** Admin password — must be set (NO default). Empty disables login (fail closed). */
export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

/**
 * Key used to SIGN session tokens. Prefer a dedicated SESSION_SECRET (random,
 * independent of the password) so a leaked cookie can't be cracked to recover
 * the password, and rotating it revokes every session. Falls back to a
 * password-derived key so admin keeps working before SESSION_SECRET is set —
 * set SESSION_SECRET in the Amplify console for the full benefit.
 */
function signingKey(): string {
  return process.env.SESSION_SECRET || `ao-fallback-key::${adminPassword()}`;
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", signingKey()).update(data).digest("base64url");
}

/** Constant-time compare that doesn't early-return on a length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab); // burn equivalent time, then fail
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export function checkPassword(pw: unknown): boolean {
  const expected = adminPassword();
  if (!expected) return false; // no password configured -> deny all
  if (typeof pw !== "string" || pw.length === 0) return false;
  return safeEqual(pw, expected);
}

/** Create a signed, expiring session token for the cookie. */
export function createSession(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

/** Verify a token: signature valid AND not expired. */
function verifySession(token: string): boolean {
  if (!token || !adminPassword()) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, hmac(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Whether the current request has a valid, unexpired admin session cookie. */
export function isAuthed(): boolean {
  const value = cookies().get(ADMIN_COOKIE)?.value;
  return !!value && verifySession(value);
}
