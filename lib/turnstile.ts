import "server-only";

const SECRET = process.env.TURNSTILE_SECRET;
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Cloudflare Turnstile token server-side.
 * - Not configured (no TURNSTILE_SECRET) -> returns true (skip), so the site
 *   keeps working before keys are set in the environment.
 * - Configured but token missing/invalid -> false (the bot/forged path).
 * - Configured but Cloudflare unreachable (network/parse error) -> true, so a
 *   transient Cloudflare blip never blocks real customers; the per-IP rate
 *   limiter is the backstop against abuse.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string,
): Promise<boolean> {
  if (!SECRET) return true; // not configured -> skip
  if (!token) return false; // configured but no token -> reject
  try {
    const body = new URLSearchParams({ secret: SECRET, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    // Couldn't reach Cloudflare — don't block a real customer; rate limit backstops.
    return true;
  }
}
