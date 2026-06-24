"use client";

import { Turnstile } from "@marsidev/react-turnstile";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Cloudflare Turnstile widget. Calls `onToken` with the verification token once
 * solved (and "" on expiry/error). Renders nothing if the site key isn't set,
 * so the forms keep working before Turnstile is configured.
 */
export default function TurnstileBox({ onToken }: { onToken: (token: string) => void }) {
  if (!SITE_KEY) return null;
  return (
    <Turnstile
      siteKey={SITE_KEY}
      options={{ theme: "light", size: "flexible" }}
      onSuccess={(token) => onToken(token)}
      onExpire={() => onToken("")}
      onError={() => onToken("")}
      className="mt-1"
    />
  );
}

/** True when Turnstile is configured for the client (so forms can require a token). */
export const turnstileEnabled = Boolean(SITE_KEY);
