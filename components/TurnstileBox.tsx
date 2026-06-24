"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { Check } from "./icons";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Cloudflare Turnstile verification. The real widget runs in `interaction-only`
 * mode — invisible for normal visitors, appearing only if Cloudflare actually
 * needs to challenge someone — while the small custom badge below is the visible
 * trust signal (the locked Cloudflare iframe can't be restyled into a bare
 * icon, so we hide it and render our own). Calls `onToken` with the token once
 * solved (and "" on expiry/error). Renders nothing if the site key isn't set.
 */
export default function TurnstileBox({ onToken }: { onToken: (token: string) => void }) {
  if (!SITE_KEY) return null;
  return (
    <div className="mt-1">
      <Turnstile
        siteKey={SITE_KEY}
        options={{ theme: "light", appearance: "interaction-only" }}
        onSuccess={(token) => onToken(token)}
        onExpire={() => onToken("")}
        onError={() => onToken("")}
      />
      <div className="inline-flex items-center gap-2 text-xs font-medium text-muted">
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand text-white">
          <Check className="h-2.5 w-2.5" />
        </span>
        Protected by Cloudflare
      </div>
    </div>
  );
}

/** True when Turnstile is configured for the client (so forms can require a token). */
export const turnstileEnabled = Boolean(SITE_KEY);
